"""
app/routers/events.py
──────────────────────
Events CRUD router — /api/events

Endpoints
  GET    /              list with filters (supports user_id in query or X-User-Id header)
  GET    /calendar      events grouped by date
  GET    /calendar/month events grouped by date (alias)
  GET    /{event_id}    get single event
  PUT    /{event_id}    update event
  PATCH  /{event_id}    partial update event (alias)
  DELETE /{event_id}    hard delete
  PATCH  /{event_id}/hide toggle is_hidden
  POST   /{event_id}/hide toggle is_hidden (alias)
"""

from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import and_, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Event
from app.schemas.schemas import EventListResponse, EventResponse, EventUpdate

router = APIRouter(prefix="/api/events", tags=["Events"])

DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"


# ── GET / — list events ───────────────────────────────────────────────────────


@router.get("", response_model=EventListResponse, summary="List events")
@router.get("/", response_model=EventListResponse, include_in_schema=False)
async def list_events(
    user_id: Optional[str] = Query(None, description="Owner user UUID"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    category: Optional[str] = Query(None, description="Filter by category"),
    start_date: Optional[date] = Query(None, description="Filter events on or after this date"),
    end_date: Optional[date] = Query(None, description="Filter events on or before this date"),
    include_hidden: bool = Query(False, description="Include hidden events"),
    search: Optional[str] = Query(None, description="Substring search on title/organizer"),
    limit: Optional[int] = Query(None, description="Alias for page_size"),
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> EventListResponse:
    """
    Return a paginated list of events for a user, with optional filters.
    """
    actual_size = limit or page_size
    target_user_id = user_id or x_user_id or DEFAULT_USER_ID

    stmt = select(Event).where(Event.user_id == target_user_id)

    if not include_hidden:
        stmt = stmt.where(Event.is_hidden.is_(False))

    if category:
        stmt = stmt.where(Event.category == category.lower())

    if start_date:
        dt_start = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
        stmt = stmt.where(Event.start_time >= dt_start)

    if end_date:
        dt_end = datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)
        stmt = stmt.where(Event.start_time <= dt_end)

    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            (Event.title.ilike(pattern)) | (Event.organizer.ilike(pattern))
        )

    # Count total matching rows
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    # Paginate and order by start_time ascending
    offset = (page - 1) * actual_size
    stmt = (
        stmt.order_by(Event.start_time.asc().nulls_last())
        .offset(offset)
        .limit(actual_size)
    )

    result = await db.execute(stmt)
    events = result.scalars().all()

    return EventListResponse(
        items=[EventResponse.model_validate(e) for e in events],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


# ── GET /calendar — must be defined BEFORE /{event_id} ────────────────────────


@router.get(
    "/calendar",
    response_model=Dict[str, List[EventResponse]],
    summary="Events grouped by date for a calendar month view",
)
@router.get(
    "/calendar/month",
    response_model=Dict[str, List[EventResponse]],
    include_in_schema=False,
)
async def calendar_month(
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    include_hidden: bool = Query(False),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, List[EventResponse]]:
    """
    Return all events for a given year/month grouped by calendar date.
    Defaults to current year/month if not provided.
    """
    target_user_id = user_id or x_user_id or DEFAULT_USER_ID
    now = datetime.now(timezone.utc)
    target_year = year or now.year
    target_month = month or now.month

    # First and last moment of the requested month
    first_day = datetime(target_year, target_month, 1, tzinfo=timezone.utc)
    last_day_num = calendar.monthrange(target_year, target_month)[1]
    last_day = datetime(target_year, target_month, last_day_num, 23, 59, 59, tzinfo=timezone.utc)

    stmt = (
        select(Event)
        .where(Event.user_id == target_user_id)
        .where(Event.start_time >= first_day)
        .where(Event.start_time <= last_day)
        .order_by(Event.start_time.asc())
    )
    if not include_hidden:
        stmt = stmt.where(Event.is_hidden.is_(False))

    result = await db.execute(stmt)
    events = result.scalars().all()

    grouped: Dict[str, List[EventResponse]] = defaultdict(list)
    for ev in events:
        if ev.start_time:
            key = ev.start_time.date().isoformat()
        else:
            key = "unknown"
        grouped[key].append(EventResponse.model_validate(ev))

    return dict(grouped)


# ── GET /{event_id} ───────────────────────────────────────────────────────────


@router.get("/{event_id}", response_model=EventResponse, summary="Get a single event")
async def get_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    """Return a single event by its UUID."""
    event = await _get_or_404(db, event_id)
    return EventResponse.model_validate(event)


# ── PUT & PATCH /{event_id} ───────────────────────────────────────────────────


@router.put("/{event_id}", response_model=EventResponse, summary="Update an event")
@router.patch("/{event_id}", response_model=EventResponse, summary="Partial update an event")
async def update_event(
    event_id: str,
    payload: EventUpdate,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    """
    Partial update of an event.
    Only fields included in the request body are updated; omitted fields
    retain their current database values.
    """
    event = await _get_or_404(db, event_id)

    update_data = payload.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(event, field, value)

    db.add(event)
    await db.commit()
    await db.refresh(event)
    return EventResponse.model_validate(event)


# ── DELETE /{event_id} ────────────────────────────────────────────────────────


@router.delete(
    "/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an event",
)
async def delete_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Hard-delete an event by its UUID."""
    event = await _get_or_404(db, event_id)
    await db.delete(event)
    await db.commit()


# ── PATCH & POST /{event_id}/hide ─────────────────────────────────────────────


@router.patch(
    "/{event_id}/hide",
    response_model=EventResponse,
    summary="Toggle the hidden flag on an event",
)
@router.post(
    "/{event_id}/hide",
    response_model=EventResponse,
    include_in_schema=False,
)
async def toggle_hidden(
    event_id: str,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    """
    Flip the `is_hidden` boolean on an event.
    """
    event = await _get_or_404(db, event_id)
    event.is_hidden = not event.is_hidden
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return EventResponse.model_validate(event)


# ── Shared helper ─────────────────────────────────────────────────────────────


async def _get_or_404(db: AsyncSession, event_id: str) -> Event:
    """Fetch an event by PK or raise HTTP 404."""
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {event_id!r} not found.",
        )
    return event


# ── POST /{event_id}/export-calendar ──────────────────────────────────────────


@router.post(
    "/{event_id}/export-calendar",
    summary="Export event to user's Google Calendar",
)
@router.post(
    "/{event_id}/sync-google-calendar",
    summary="Export event to user's Google Calendar (alias)",
    include_in_schema=False,
)
async def export_to_google_calendar(
    event_id: str,
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Push an event into the authenticated user's primary Google Calendar.
    Requires Google Calendar API enabled and Google account linked via OAuth.
    """
    target_user_id = user_id or x_user_id or DEFAULT_USER_ID
    event = await _get_or_404(db, event_id)

    from app.routers.ingest import get_user_google_token
    from app.services.gmail_oauth import create_google_calendar_event

    access_token = token or get_user_google_token(target_user_id)
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account is not connected yet. Please go to Ingestion and connect your Google account first.",
        )

    try:
        created = create_google_calendar_event(
            access_token=access_token,
            title=event.title,
            start_time=event.start_time,
            end_time=event.end_time,
            venue=event.venue,
            summary=event.summary,
        )
        return {
            "status": "success",
            "message": "Event successfully added to your Google Calendar!",
            "calendar_event_id": created.get("id"),
            "html_link": created.get("htmlLink"),
        }
    except Exception as exc:
        err_msg = str(exc)
        if "403" in err_msg or "insufficientPermissions" in err_msg or "ACCESS_TOKEN_SCOPE_INSUFFICIENT" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Google Calendar permission was not granted. Please enable 'Google Calendar API' in Google Cloud Console, add the calendar scope, and reconnect your Google account in EventHub.",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export to Google Calendar: {err_msg}",
        )


# ── POST /{event_id}/detailed-summary ─────────────────────────────────────────


@router.post(
    "/{event_id}/detailed-summary",
    summary="Generate an in-depth, long-form executive summary of this event using local SLM",
)
@router.get(
    "/{event_id}/detailed-summary",
    summary="Generate an in-depth, long-form executive summary of this event using local SLM (alias)",
    include_in_schema=False,
)
async def get_detailed_summary(
    event_id: str,
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Generate an in-depth, rich structured briefing and detailed summary for an event.
    Extracts complete details from the underlying source email when available,
    and runs on-device local SLM (< 5GB) with zero privacy leaks.
    """
    target_user_id = user_id or x_user_id or DEFAULT_USER_ID
    event = await _get_or_404(db, event_id)

    # 1. Try to fetch source email body if this was ingested via Gmail
    source_email_text = None
    if event.source_type == "gmail" and event.source_ref:
        try:
            from app.routers.ingest import get_user_google_token
            from app.services.gmail_oauth import fetch_single_email

            access_token = token or get_user_google_token(target_user_id)
            if access_token:
                email_data = fetch_single_email(access_token, event.source_ref)
                if email_data and email_data.get("body_text"):
                    source_email_text = (
                        f"Subject: {email_data.get('subject')}\n"
                        f"From: {email_data.get('sender')}\n"
                        f"Date: {email_data.get('date_header')}\n\n"
                        f"{email_data.get('body_text')}"
                    )
        except Exception as exc:
            logger.warning("Could not fetch source email for detailed summary: %s", exc)

    # 2. Generate detailed summary via ExtractionLLM
    from app.services.extraction_llm import ExtractionLLM

    extractor = ExtractionLLM()
    event_data = {
        "title": event.title,
        "organizer": event.organizer,
        "category": event.category,
        "start_time": event.start_time.isoformat() if event.start_time else None,
        "end_time": event.end_time.isoformat() if event.end_time else None,
        "venue": event.venue,
        "summary": event.summary,
    }

    detailed_text = extractor.generate_detailed_summary(
        event_dict=event_data,
        source_text=source_email_text,
    )

    return {
        "event_id": event.id,
        "title": event.title,
        "category": event.category,
        "organizer": event.organizer,
        "venue": event.venue,
        "start_time": event.start_time.isoformat() if event.start_time else None,
        "end_time": event.end_time.isoformat() if event.end_time else None,
        "detailed_summary": detailed_text,
        "has_source_email": bool(source_email_text),
    }

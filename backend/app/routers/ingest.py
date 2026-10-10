"""
app/routers/ingest.py
──────────────────────
Ingestion router — /api/ingest

Endpoints
  GET    /gmail/auth       → return OAuth URL (alias)
  POST   /gmail/connect    → return OAuth URL
  GET    /gmail/callback   → handle OAuth callback, start Celery task
  POST   /gmail/sync       → re-sync Gmail
  GET    /gmail/status     → get Gmail connection status
  POST   /upload           → multipart file upload → Celery task
  POST   /text             → raw text paste → Celery task
  POST   /manual           → create event directly (no LLM)
  GET    /jobs             → list recent ingestion jobs
  GET    /job/{job_id}     → Celery task status + Redis progress
"""

from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import redis
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, SyncSessionLocal
from app.models.models import Event
from app.schemas.schemas import (
    IngestManualRequest,
    IngestResponse,
    JobStatusResponse,
)
from app.services.gmail_oauth import exchange_code, get_auth_url
from app.utils.recurrence import expand_recurring_instances
from app.workers.celery_app import celery_app
from app.workers.tasks import process_email_batch, process_media_file

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ingest", tags=["Ingestion"])

DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"

# ── In-memory fallback stores for local runs without Redis ───────────────────
_in_memory_auth: Dict[str, Dict[str, Any]] = {}
_in_memory_jobs: List[Dict[str, Any]] = []

# ── Redis client for job-status reads (Optional / gracefully disabled if not running) ──
_redis_client = None
try:
    _r = redis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1)
    _r.ping()
    _redis_client = _r
except Exception:
    _redis_client = None

# ── Temp upload directory ─────────────────────────────────────────────────────
_UPLOAD_DIR = getattr(settings, "UPLOAD_DIR", "/tmp/eventhub_uploads")
os.makedirs(_UPLOAD_DIR, exist_ok=True)


class FlexibleTextRequest(BaseModel):
    content: Optional[str] = None
    text: Optional[str] = None
    user_id: Optional[str] = None
    reference_timestamp: Optional[str] = None


class FlexibleManualRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    organizer: Optional[str] = None
    category: Optional[str] = "other"
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    venue: Optional[str] = None
    summary: Optional[str] = None
    user_id: Optional[str] = None
    # Recurrence & timetable options
    is_recurring: Optional[bool] = False
    repeat_days: Optional[List[str]] = None
    slot_name: Optional[str] = None
    start_time_of_day: Optional[str] = None
    end_time_of_day: Optional[str] = None
    repeat_weeks: Optional[int] = 14


# ── GET /gmail/auth & POST /gmail/connect ─────────────────────────────────────


@router.get(
    "/gmail/auth",
    summary="Get Gmail OAuth2 authorization URL",
    response_model=Dict[str, str],
)
@router.post(
    "/gmail/connect",
    summary="Get Gmail OAuth2 authorization URL",
    response_model=Dict[str, str],
)
async def gmail_connect() -> Dict[str, str]:
    """Return the Google OAuth2 authorization URL."""
    url = get_auth_url()
    return {"auth_url": url}


def _dispatch_email_sync(job_id: str, user_id: str, access_token: str, max_results: int = 10, force: bool = False):
    """Dispatch Celery task if running, or launch background daemon thread."""
    # Register job in memory
    _in_memory_jobs.insert(0, {
        "job_id": job_id,
        "filename": f"Sync Last {max_results} Emails" if force else "Gmail Inbox Sync",
        "source_type": "email",
        "status": "PROCESSING",
        "progress": 10,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    if len(_in_memory_jobs) > 50:
        _in_memory_jobs.pop()

    if _redis_client:
        try:
            process_email_batch.apply_async(
                kwargs={
                    "email_ids": [],
                    "user_id": user_id,
                    "access_token": access_token,
                    "reference_time": datetime.now(timezone.utc).isoformat(),
                },
                queue="email_processing",
            )
            return
        except Exception:
            pass

    thread = threading.Thread(
        target=_run_email_ingestion_thread,
        args=(job_id, user_id, access_token, max_results, force),
        daemon=True,
    )
    thread.start()


def _run_email_ingestion_thread(job_id: str, user_id: str, access_token: str, max_results: int = 10, force: bool = False):
    try:
        from app.services.gmail_oauth import fetch_emails
        from app.utils.regex_filter import RegexEmailFilter
        from app.services.privacy_filter import PrivacySLMFilter
        from app.services.extraction_llm import ExtractionLLM

        regex_filter = RegexEmailFilter()
        privacy_filter = PrivacySLMFilter()
        extraction_llm = ExtractionLLM()

        for j in _in_memory_jobs:
            if j.get("job_id") == job_id:
                j["progress"] = 25
                j["message"] = f"Fetching last {max_results} emails from Gmail..."
                break

        emails = fetch_emails(access_token, max_results=max_results)
        logger.info("Fetched %d emails from Gmail for user %s (force=%s)", len(emails), user_id, force)

        surviving = []
        for em in emails:
            subj = em.get("subject", "")
            body = em.get("body_text", "")
            sender = em.get("sender", "")

            if not force:
                drop, _ = regex_filter.should_drop(subj, body, sender)
                if drop:
                    continue

                try:
                    label = privacy_filter.classify_email(subj, body, sender)
                    if label != "EVENT_OR_ANNOUNCEMENT":
                        continue
                except Exception as e:
                    logger.warning("Privacy filter skipped email: %s", e)
                    continue
            else:
                # If force mode: only drop pure security OTP codes
                if regex_filter.is_otp_email(subj, body):
                    continue

            surviving.append(em)

        for j in _in_memory_jobs:
            if j.get("job_id") == job_id:
                j["progress"] = 55
                j["message"] = f"Extracting events from {len(surviving)} relevant emails..."
                break

        total_created = 0
        ref_time = datetime.now(timezone.utc).isoformat()
        with SyncSessionLocal() as session:
            for em in surviving:
                content = (em.get("subject", "") + "\n\n" + em.get("body_text", "")).strip()
                extracted = extraction_llm.extract_events_from_text(
                    content=content,
                    source_type="email",
                    reference_timestamp=ref_time,
                )
                if not extracted and force:
                    # When forced, guarantee that the announcement appears as an event card
                    lines = [l.strip() for l in (em.get("body_text") or "").splitlines() if l.strip()]
                    summary_text = " ".join(lines[:3]) if lines else em.get("subject", "")
                    extracted = [{
                        "title": em.get("subject", "Email Announcement"),
                        "organizer": em.get("sender", "Campus Mail"),
                        "category": "other",
                        "start_time": ref_time,
                        "end_time": None,
                        "venue": None,
                        "summary": summary_text[:300],
                    }]
                for item in extracted:
                    is_rec = item.get("is_recurring") or bool(item.get("days_of_week")) or bool(item.get("slot_name"))
                    if is_rec:
                        rec_events = expand_recurring_instances(
                            title=item.get("title", "Class Session"),
                            organizer=item.get("organizer") or em.get("sender", "Academic Dept"),
                            category=item.get("category", "class"),
                            venue=item.get("venue"),
                            summary=item.get("summary", ""),
                            user_id=user_id,
                            source_type="email",
                            source_ref=em.get("id"),
                            days_of_week=item.get("days_of_week"),
                            slot_name=item.get("slot_name"),
                            start_time_of_day=item.get("start_time_of_day") or "09:00",
                            end_time_of_day=item.get("end_time_of_day") or "10:00",
                            start_date=datetime.now(timezone.utc),
                            repeat_weeks=14,
                        )
                        for rev in rec_events:
                            session.add(rev)
                            total_created += 1
                    else:
                        start_val = item.get("start_time")
                        end_val = item.get("end_time")
                        start_dt = None
                        end_dt = None
                        try:
                            if start_val:
                                start_dt = datetime.fromisoformat(str(start_val).replace("Z", "+00:00"))
                        except Exception:
                            start_dt = datetime.now(timezone.utc)
                        try:
                            if end_val:
                                end_dt = datetime.fromisoformat(str(end_val).replace("Z", "+00:00"))
                        except Exception:
                            end_dt = None

                        ev = Event(
                            id=str(uuid.uuid4()),
                            user_id=user_id,
                            source_type="email",
                            source_ref=em.get("id"),
                            title=item.get("title", "Untitled Event"),
                            organizer=item.get("organizer"),
                            category=item.get("category", "other"),
                            start_time=start_dt,
                            end_time=end_dt,
                            venue=item.get("venue"),
                            summary=item.get("summary", ""),
                            is_hidden=False,
                        )
                        session.add(ev)
                        total_created += 1
            session.commit()

        for j in _in_memory_jobs:
            if j.get("job_id") == job_id:
                j["status"] = "SUCCESS"
                j["progress"] = 100
                j["message"] = f"Extracted {total_created} events from inbox."
                break

        logger.info("Gmail sync finished. Created %d events.", total_created)
    except Exception as exc:
        logger.error("Gmail background thread failed: %s", exc)
        for j in _in_memory_jobs:
            if j.get("job_id") == job_id:
                j["status"] = "FAILURE"
                j["progress"] = 100
                j["message"] = str(exc)
                break


# ── GET /gmail/status ─────────────────────────────────────────────────────────


@router.get(
    "/gmail/status",
    summary="Check Gmail connection status",
    response_model=Dict[str, Any],
)
async def gmail_status(
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
) -> Dict[str, Any]:
    """Return whether the current user has linked Gmail account."""
    target_user_id = user_id or x_user_id or DEFAULT_USER_ID

    # 1. Check in-memory store
    if target_user_id in _in_memory_auth:
        info = _in_memory_auth[target_user_id]
        return {
            "connected": True,
            "email": info.get("email", "connected.user@gmail.com"),
            "last_synced": info.get("last_synced"),
        }

    # 2. Check Redis for persisted token safely
    if _redis_client:
        try:
            token = _redis_client.get(f"gmail_token:{target_user_id}")
            last_synced = _redis_client.get(f"gmail_last_synced:{target_user_id}")
            email = _redis_client.get(f"gmail_email:{target_user_id}") or "connected.user@gmail.com"
            if token:
                return {
                    "connected": True,
                    "email": email,
                    "last_synced": last_synced or datetime.now(timezone.utc).isoformat(),
                }
        except Exception:
            pass

    return {
        "connected": False,
        "email": None,
        "last_synced": None,
    }


# ── GET /gmail/callback ───────────────────────────────────────────────────────


@router.get(
    "/gmail/callback",
    summary="Handle Gmail OAuth2 callback",
)
async def gmail_callback(
    code: str = Query(..., description="Authorization code from Google"),
    state: Optional[str] = Query(None, description="OAuth state parameter"),
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    max_results: int = Query(50, ge=1, le=500),
):
    """Exchange OAuth code for tokens, save auth info, kick off ingestion and close popup."""
    target_user_id = user_id or x_user_id or DEFAULT_USER_ID

    try:
        tokens = exchange_code(code, state=state)
    except Exception as exc:
        logger.error("gmail_callback: token exchange failed — %s", exc)
        return HTMLResponse(
            f"""<!DOCTYPE html><html><body style="background:#09090b;color:#f87171;font-family:sans-serif;padding:40px;text-align:center;">
            <h2>Authentication Failed</h2><p>{exc}</p><p><a href="javascript:window.close()" style="color:#a1a1aa;">Close this window</a></p></body></html>""",
            status_code=400,
        )

    access_token = tokens.get("access_token", "")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No access token in OAuth response.",
        )

    # Fetch user's real email address
    user_email = "connected.user@gmail.com"
    try:
        from googleapiclient.discovery import build
        from google.oauth2.credentials import Credentials
        creds = Credentials(token=access_token)
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        profile = service.users().getProfile(userId="me").execute()
        user_email = profile.get("emailAddress", user_email)
    except Exception as err:
        logger.warning("Could not fetch user profile email: %s", err)

    now_iso = datetime.now(timezone.utc).isoformat()
    refresh_token = tokens.get("refresh_token") or ""
    _in_memory_auth[target_user_id] = {
        "token": access_token,
        "refresh_token": refresh_token,
        "email": user_email,
        "last_synced": now_iso,
    }

    if _redis_client:
        try:
            _redis_client.set(f"gmail_token:{target_user_id}", access_token, ex=86400 * 30)
            if refresh_token:
                _redis_client.set(f"gmail_refresh_token:{target_user_id}", refresh_token, ex=86400 * 30)
            _redis_client.set(f"gmail_email:{target_user_id}", user_email, ex=86400 * 30)
            _redis_client.set(f"gmail_last_synced:{target_user_id}", now_iso)
        except Exception:
            pass

    job_id = str(uuid.uuid4())
    _dispatch_email_sync(job_id, target_user_id, access_token, max_results)

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Connected - Smart Event Hub</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #09090b;
      color: #f4f4f5;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }}
    .card {{
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      padding: 32px 24px;
      text-align: center;
      max-width: 360px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }}
    .badge {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      font-size: 26px;
      margin-bottom: 16px;
    }}
    h2 {{ margin: 0 0 8px 0; font-size: 19px; font-weight: 600; color: #ffffff; }}
    p {{ margin: 0 0 12px 0; color: #a1a1aa; font-size: 13px; line-height: 1.5; }}
    .email {{ font-weight: 600; color: #e4e4e7; background: #27272a; padding: 4px 10px; border-radius: 8px; font-size: 12px; display: inline-block; }}
    .close-hint {{ font-size: 12px; color: #71717a; margin-top: 18px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✓</div>
    <h2>Gmail Connected!</h2>
    <p>Connected as <span class="email">{user_email}</span></p>
    <p>Extracting events from your inbox now.</p>
    <div class="close-hint">This popup will close automatically...</div>
  </div>
  <script>
    if (window.opener) {{
      try {{
        window.opener.postMessage({{
          type: 'GMAIL_AUTH_SUCCESS',
          email: '{user_email}',
          user_id: '{target_user_id}',
          role: 'student'
        }}, '*');
      }} catch (e) {{}}
    }}
    setTimeout(function() {{
      window.close();
    }}, 2000);
  </script>
</body>
</html>"""
    return HTMLResponse(content=html_content)


def get_user_google_token(user_id: str) -> Optional[str]:
    """Retrieve stored Google OAuth access token for user."""
    if user_id in _in_memory_auth:
        return _in_memory_auth[user_id].get("token")
    if _redis_client:
        try:
            return _redis_client.get(f"gmail_token:{user_id}")
        except Exception:
            pass
    return None


# ── POST /gmail/sync ──────────────────────────────────────────────────────────


@router.post(
    "/gmail/sync",
    summary="Re-trigger Gmail sync",
    response_model=IngestResponse,
)
async def gmail_sync(
    user_id: Optional[str] = Form(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    access_token: Optional[str] = Form(None),
    max_results: int = Form(10),
    force: bool = Form(False),
) -> IngestResponse:
    target_user_id = user_id or x_user_id or DEFAULT_USER_ID
    clamped_results = max(1, min(50, max_results))

    token = access_token
    if not token:
        if target_user_id in _in_memory_auth:
            token = _in_memory_auth[target_user_id].get("token")
        elif _redis_client:
            token = _redis_client.get(f"gmail_token:{target_user_id}")

    job_id = str(uuid.uuid4())
    _dispatch_email_sync(job_id, target_user_id, token or "demo_token", max_results=clamped_results, force=force)

    return IngestResponse(
        job_id=job_id,
        message=f"Syncing last {clamped_results} emails{' (force mode)' if force else ''}...",
    )

def _dispatch_media_processing(
    job_id: str,
    file_path: str,
    source_type: str,
    user_id: str,
    filename: str,
    ref_time: str,
):
    """Dispatch Celery task if running, or launch background daemon thread."""
    _in_memory_jobs.insert(0, {
        "job_id": job_id,
        "filename": filename,
        "source_type": source_type,
        "status": "PROCESSING",
        "progress": 20,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    if len(_in_memory_jobs) > 50:
        _in_memory_jobs.pop()

    if _redis_client:
        try:
            process_media_file.apply_async(
                kwargs={
                    "file_path": file_path,
                    "source_type": source_type if source_type != "auto" else "upload",
                    "user_id": user_id,
                    "filename": filename,
                    "reference_time": ref_time,
                },
                queue="media_processing",
            )
            return
        except Exception:
            pass

    t = threading.Thread(
        target=_run_media_ingestion_thread,
        args=(job_id, file_path, source_type, user_id, filename, ref_time),
        daemon=True,
    )
    t.start()


def _run_media_ingestion_thread(
    job_id: str,
    file_path: str,
    source_type: str,
    user_id: str,
    filename: str,
    ref_time: str,
):
    try:
        from app.services.extraction_llm import ExtractionLLM
        from app.database import SyncSessionLocal
        from app.models.models import Event

        extraction_llm = ExtractionLLM()

        events_data = []
        lower = filename.lower()
        if any(lower.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]):
            with open(file_path, "rb") as fh:
                img_bytes = fh.read()
            events_data = extraction_llm.extract_from_image(img_bytes, filename)
        elif lower.endswith(".pdf"):
            import pypdf
            reader = pypdf.PdfReader(file_path)
            extracted_text = "\n".join([page.extract_text() or "" for page in reader.pages])
            events_data = extraction_llm.extract_events_from_text(extracted_text, "pdf", ref_time)
        else:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as fh:
                text_content = fh.read()
            events_data = extraction_llm.extract_events_from_text(text_content, source_type or "text", ref_time)

        total_created = 0
        with SyncSessionLocal() as session:
            for item in events_data:
                is_rec = item.get("is_recurring") or bool(item.get("days_of_week")) or bool(item.get("slot_name"))
                if is_rec:
                    rec_events = expand_recurring_instances(
                        title=item.get("title", "Class Session"),
                        organizer=item.get("organizer") or "Academic Timetable",
                        category=item.get("category", "class"),
                        venue=item.get("venue"),
                        summary=item.get("summary", ""),
                        user_id=user_id,
                        source_type=source_type if source_type != "auto" else "upload",
                        source_ref=filename,
                        days_of_week=item.get("days_of_week"),
                        slot_name=item.get("slot_name"),
                        start_time_of_day=item.get("start_time_of_day") or "09:00",
                        end_time_of_day=item.get("end_time_of_day") or "10:00",
                        start_date=datetime.now(timezone.utc),
                        repeat_weeks=14,
                    )
                    for rev in rec_events:
                        session.add(rev)
                        total_created += 1
                else:
                    start_val = item.get("start_time")
                    end_val = item.get("end_time")
                    start_dt = None
                    end_dt = None
                    try:
                        if start_val:
                            start_dt = datetime.fromisoformat(str(start_val).replace("Z", "+00:00"))
                    except Exception:
                        start_dt = datetime.now(timezone.utc)
                    try:
                        if end_val:
                            end_dt = datetime.fromisoformat(str(end_val).replace("Z", "+00:00"))
                    except Exception:
                        end_dt = None

                    ev = Event(
                        id=str(uuid.uuid4()),
                        user_id=user_id,
                        source_type=source_type if source_type != "auto" else "upload",
                        source_ref=filename,
                        title=item.get("title", "Untitled Event"),
                        organizer=item.get("organizer"),
                        category=item.get("category", "other"),
                        start_time=start_dt,
                        end_time=end_dt,
                        venue=item.get("venue"),
                        summary=item.get("summary", ""),
                        is_hidden=False,
                    )
                    session.add(ev)
                    total_created += 1
            session.commit()

        for j in _in_memory_jobs:
            if j.get("job_id") == job_id:
                j["status"] = "SUCCESS"
                j["progress"] = 100
                j["message"] = f"Created {total_created} event(s)."
                break
        logger.info("Media ingestion finished for %s. Created %d events.", filename, total_created)

    except Exception as exc:
        logger.error("Media processing background thread error: %s", exc)
        for j in _in_memory_jobs:
            if j.get("job_id") == job_id:
                j["status"] = "FAILURE"
                j["progress"] = 100
                j["message"] = str(exc)
                break


# ── POST /upload ──────────────────────────────────────────────────────────────


@router.post(
    "/upload",
    summary="Upload a file (image, PDF, audio, text) for event extraction",
    response_model=IngestResponse,
)
async def upload_file(
    file: UploadFile = File(..., description="File to process"),
    user_id: Optional[str] = Form(None),
    source_type: Optional[str] = Form("auto"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    reference_time: Optional[str] = Form(None),
) -> IngestResponse:
    """Accept a multipart file upload, save it to temp directory, and process it."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided.",
        )

    target_user_id = user_id or x_user_id or DEFAULT_USER_ID
    safe_name = f"{uuid.uuid4()}_{file.filename}"
    file_path = os.path.join(_UPLOAD_DIR, safe_name)

    try:
        contents = await file.read()
        with open(file_path, "wb") as fh:
            fh.write(contents)
    except OSError as exc:
        logger.error("upload_file: cannot write temp file — %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save uploaded file.",
        )

    ref_time = reference_time or datetime.now(timezone.utc).isoformat()
    job_id = str(uuid.uuid4())
    _dispatch_media_processing(
        job_id,
        file_path,
        source_type if source_type != "auto" else "upload",
        target_user_id,
        file.filename,
        ref_time,
    )

    return IngestResponse(
        job_id=job_id,
        message=f"File '{file.filename}' uploaded. Processing in background.",
    )


# ── POST /text ────────────────────────────────────────────────────────────────


@router.post(
    "/text",
    summary="Ingest raw pasted text for event extraction",
    response_model=IngestResponse,
)
async def ingest_text(
    payload: FlexibleTextRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
) -> IngestResponse:
    """Accept raw text and dispatch event extraction."""
    target_user_id = payload.user_id or x_user_id or DEFAULT_USER_ID
    raw_content = payload.content or payload.text
    if not raw_content or not raw_content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text content is required.",
        )

    ref_time = payload.reference_timestamp or datetime.now(timezone.utc).isoformat()
    temp_path = os.path.join(_UPLOAD_DIR, f"{uuid.uuid4()}_pasted.txt")
    try:
        with open(temp_path, "w", encoding="utf-8") as fh:
            fh.write(raw_content)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save text content: {exc}",
        )

    job_id = str(uuid.uuid4())
    _dispatch_media_processing(
        job_id,
        temp_path,
        "text",
        target_user_id,
        "Pasted text / announcement",
        ref_time,
    )

    return IngestResponse(
        job_id=job_id,
        message="Text submitted. Extracting events in background.",
    )


# ── POST /manual ──────────────────────────────────────────────────────────────


@router.post(
    "/manual",
    summary="Create an event manually (no LLM extraction)",
    response_model=IngestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def ingest_manual(
    payload: FlexibleManualRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db),
) -> IngestResponse:
    """Directly insert an event into the database without LLM extraction."""
    target_user_id = payload.user_id or x_user_id or DEFAULT_USER_ID

    # Handle recurring / timetable events
    if payload.is_recurring or payload.repeat_days or payload.slot_name:
        start_time_str = payload.start_time_of_day
        if not start_time_str and payload.start_time:
            start_time_str = payload.start_time.strftime("%H:%M")
        end_time_str = payload.end_time_of_day
        if not end_time_str and payload.end_time:
            end_time_str = payload.end_time.strftime("%H:%M")

        generated_events = expand_recurring_instances(
            title=payload.title,
            organizer=payload.organizer or "Academic Timetable",
            category=payload.category or "class",
            venue=payload.venue,
            summary=payload.summary,
            user_id=target_user_id,
            source_type="manual",
            days_of_week=payload.repeat_days,
            slot_name=payload.slot_name,
            start_time_of_day=start_time_str or "09:00",
            end_time_of_day=end_time_str or "10:00",
            start_date=payload.start_time or datetime.now(timezone.utc),
            repeat_weeks=payload.repeat_weeks or 14,
        )
        for ev in generated_events:
            db.add(ev)
        await db.commit()

        return IngestResponse(
            job_id=None,
            message=f"Created {len(generated_events)} recurring sessions across {payload.repeat_weeks or 14} weeks.",
            events_created=len(generated_events),
        )

    # Standard single event
    start_dt = payload.start_time or datetime.now(timezone.utc)
    event = Event(
        id=str(uuid.uuid4()),
        user_id=target_user_id,
        source_type="manual",
        title=payload.title,
        organizer=payload.organizer,
        category=payload.category or "other",
        start_time=start_dt,
        end_time=payload.end_time,
        venue=payload.venue,
        summary=payload.summary,
        is_hidden=False,
    )
    db.add(event)
    await db.commit()

    return IngestResponse(
        job_id=None,
        message="Event created successfully.",
        events_created=1,
    )


# ── GET /jobs ─────────────────────────────────────────────────────────────────


@router.get(
    "/jobs",
    summary="List recent background ingestion jobs",
    response_model=List[Dict[str, Any]],
)
async def list_jobs(
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
) -> List[Dict[str, Any]]:
    """Return recent background jobs for the user."""
    target_user_id = user_id or x_user_id or DEFAULT_USER_ID

    if _in_memory_jobs:
        return _in_memory_jobs

    if _redis_client:
        try:
            items = _redis_client.lrange(f"user_jobs:{target_user_id}", 0, 20)
            parsed = []
            for it in items:
                try:
                    parsed.append(json.loads(it))
                except Exception:
                    pass
            if parsed:
                return parsed
        except Exception:
            pass

    return [
        {
            "job_id": "demo-job-1",
            "filename": "Campus_Orientation_Poster.png",
            "source_type": "image",
            "status": "SUCCESS",
            "progress": 100,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    ]


# ── GET /job/{job_id} ─────────────────────────────────────────────────────────


@router.get(
    "/job/{job_id}",
    summary="Get background task status",
    response_model=JobStatusResponse,
)
async def job_status(job_id: str) -> JobStatusResponse:
    """Return the current status and progress of a background task."""
    for j in _in_memory_jobs:
        if j.get("job_id") == job_id:
            return JobStatusResponse(
                job_id=job_id,
                status=j.get("status", "PROGRESS"),
                progress=j.get("progress"),
                message=j.get("message"),
            )

    if _redis_client:
        try:
            redis_key = f"job:{job_id}"
            raw = _redis_client.get(redis_key)
            if raw:
                data = json.loads(raw)
                return JobStatusResponse(
                    job_id=job_id,
                    status=data.get("status", "PROGRESS"),
                    progress=data.get("progress"),
                    message=data.get("message"),
                )
        except Exception:
            pass

    try:
        task_result = celery_app.AsyncResult(job_id)
        celery_status = task_result.status
        return JobStatusResponse(
            job_id=job_id,
            status=celery_status,
            progress=100 if celery_status == "SUCCESS" else None,
            result=task_result.result if celery_status == "SUCCESS" else None,
            error=str(task_result.result) if celery_status == "FAILURE" else None,
        )
    except Exception:
        return JobStatusResponse(
            job_id=job_id,
            status="SUCCESS",
            progress=100,
            message="Completed",
        )

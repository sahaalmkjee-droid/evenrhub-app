"""
app/workers/tasks.py
─────────────────────
Celery background tasks for Smart Event Hub.

Tasks
  • process_email_batch    — full Gmail ingestion pipeline for a batch of emails
  • process_media_file     — extract events from uploaded image/pdf/audio/text
  • apply_filter_rules     — re-evaluate is_hidden for all user events

All tasks use tenacity for external API retries and report progress to Redis
so the frontend can poll /api/ingest/job/{job_id}.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import redis
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import settings
from app.database import get_sync_db
from app.models.models import Event, UserFilterRule
from app.services.extraction_llm import ExtractionLLM
from app.services.gmail_oauth import fetch_emails
from app.services.privacy_filter import PrivacySLMFilter
from app.utils.regex_filter import RegexEmailFilter
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# ── Redis client (for progress updates) ──────────────────────────────────────

_redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

# ── Shared service instances (created once per worker process) ────────────────

_regex_filter = RegexEmailFilter()
_privacy_filter = PrivacySLMFilter()
_extraction_llm = ExtractionLLM()

# ── Progress helper ───────────────────────────────────────────────────────────


def _update_progress(job_id: str, progress: int, message: str, status: str = "PROGRESS") -> None:
    """Write task progress to Redis with 24-hour TTL."""
    key = f"job:{job_id}"
    payload = {
        "job_id": job_id,
        "status": status,
        "progress": progress,
        "message": message,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        _redis_client.setex(key, 86400, json.dumps(payload))
    except Exception as exc:
        logger.warning("_update_progress: Redis write failed — %s", exc)


# ── Retry decorator for external API calls ────────────────────────────────────

_API_RETRY = retry(
    retry=retry_if_exception_type(Exception),
    wait=wait_exponential(multiplier=1, min=2, max=60),
    stop=stop_after_attempt(3),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)


# ─────────────────────────────────────────────────────────────────────────────
# Task 1: process_email_batch
# ─────────────────────────────────────────────────────────────────────────────


@celery_app.task(bind=True, name="app.workers.tasks.process_email_batch")
def process_email_batch(
    self,
    email_ids: List[str],
    user_id: str,
    access_token: str,
    reference_time: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Full Gmail ingestion pipeline.

    Steps
    -----
    1. Fetch email bodies from Gmail API.
    2. Regex pre-filter → drop OTP / security emails immediately.
    3. Privacy SLM  → drop PRIVATE_SENSITIVE emails.
    4. Extract events in chunks of 5 using ExtractionLLM.
    5. Persist extracted events to the database.
    6. Update job progress in Redis at each stage.

    Parameters
    ----------
    email_ids : list[str]
        Gmail message IDs to process.
    user_id : str
        Owner UUID for the extracted events.
    access_token : str
        Valid Gmail OAuth2 access token.
    reference_time : str, optional
        ISO8601 reference timestamp for temporal grounding.
    """
    job_id = self.request.id
    total = len(email_ids)
    logger.info("process_email_batch: job=%s user=%s emails=%d", job_id, user_id, total)

    _update_progress(job_id, 0, f"Fetching {total} emails from Gmail…")

    # ── Step 1: Fetch emails ──────────────────────────────────────────────────
    try:
        all_emails = fetch_emails(access_token, max_results=total or 50)
    except Exception as exc:
        logger.error("process_email_batch: fetch error — %s", exc)
        _update_progress(job_id, 0, f"Failed to fetch emails: {exc}", status="FAILURE")
        raise

    _update_progress(job_id, 10, f"Fetched {len(all_emails)} emails. Running filters…")

    # ── Step 2 & 3: Filter ────────────────────────────────────────────────────
    surviving: List[Dict[str, Any]] = []
    for i, email in enumerate(all_emails):
        subj = email.get("subject", "")
        body = email.get("body_text", "")
        sender = email.get("sender", "")

        # Regex gate
        drop, reason = _regex_filter.should_drop(subj, body, sender)
        if drop:
            logger.debug("Regex dropped msg %s: %s", email.get("id"), reason)
            continue

        # Privacy SLM gate
        try:
            label = _privacy_filter.classify_email(subj, body, sender)
        except Exception as exc:
            logger.warning("Privacy filter error for msg %s: %s — skipping", email.get("id"), exc)
            continue

        if label != "EVENT_OR_ANNOUNCEMENT":
            logger.debug("SLM dropped msg %s as %s", email.get("id"), label)
            continue

        surviving.append(email)
        progress = 10 + int((i + 1) / len(all_emails) * 30)
        _update_progress(job_id, progress, f"Filtering… ({i + 1}/{len(all_emails)})")

    _update_progress(
        job_id, 40,
        f"{len(surviving)}/{len(all_emails)} emails passed filters. Extracting events…",
    )

    # ── Step 4: Extract events in chunks of 5 ────────────────────────────────
    CHUNK_SIZE = 5
    all_extracted: List[Dict[str, Any]] = []

    for chunk_idx in range(0, len(surviving), CHUNK_SIZE):
        chunk = surviving[chunk_idx: chunk_idx + CHUNK_SIZE]
        # Concatenate chunk into a single text block for efficiency
        combined_text = "\n\n---\n\n".join(
            f"Email from: {e['sender']}\nSubject: {e['subject']}\n\n{e['body_text']}"
            for e in chunk
        )
        try:
            events = _extraction_llm.extract_events_from_text(
                combined_text, "gmail", reference_time
            )
            all_extracted.extend(events)
        except Exception as exc:
            logger.error("Extraction error for chunk %d: %s", chunk_idx, exc)
            continue

        progress = 40 + int((chunk_idx + CHUNK_SIZE) / max(len(surviving), 1) * 40)
        _update_progress(
            job_id,
            min(progress, 80),
            f"Extracted events from chunk {chunk_idx // CHUNK_SIZE + 1}…",
        )

    _update_progress(job_id, 80, f"Saving {len(all_extracted)} events to database…")

    # ── Step 5: Persist to DB ─────────────────────────────────────────────────
    saved_count = _save_events(all_extracted, user_id, source_type="gmail")

    result = {
        "emails_fetched": len(all_emails),
        "emails_survived_filter": len(surviving),
        "events_extracted": len(all_extracted),
        "events_saved": saved_count,
    }

    _update_progress(
        job_id, 100,
        f"Done! Saved {saved_count} events from {len(all_emails)} emails.",
        status="SUCCESS",
    )
    logger.info("process_email_batch complete: %s", result)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Task 2: process_media_file
# ─────────────────────────────────────────────────────────────────────────────


@celery_app.task(bind=True, name="app.workers.tasks.process_media_file")
def process_media_file(
    self,
    file_path: str,
    source_type: str,
    user_id: str,
    filename: str,
    reference_time: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Extract events from an uploaded file (image / PDF / audio / text).

    Parameters
    ----------
    file_path : str
        Absolute path to the temporarily saved file.
    source_type : str
        Always 'upload' for file uploads.
    user_id : str
        Owner UUID.
    filename : str
        Original filename including extension.
    reference_time : str, optional
        ISO8601 reference timestamp for temporal grounding.
    """
    job_id = self.request.id
    logger.info("process_media_file: job=%s file=%s", job_id, filename)
    _update_progress(job_id, 0, f"Reading file: {filename}…")

    # ── Read file ─────────────────────────────────────────────────────────────
    try:
        with open(file_path, "rb") as fh:
            file_bytes = fh.read()
    except OSError as exc:
        logger.error("process_media_file: cannot read %s — %s", file_path, exc)
        _update_progress(job_id, 0, f"File read error: {exc}", status="FAILURE")
        raise

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    _update_progress(job_id, 20, "Extracting events with LLM…")

    # ── Route to appropriate extraction method ────────────────────────────────
    try:
        if ext in ("jpg", "jpeg", "png", "gif", "webp", "bmp"):
            events = _extraction_llm.extract_from_image(file_bytes, filename)

        elif ext == "pdf":
            events = _extraction_llm.extract_from_pdf(file_bytes, filename, reference_time)

        else:
            # Treat as plain text
            text_content = file_bytes.decode("utf-8", errors="replace")
            events = _extraction_llm.extract_events_from_text(
                text_content, source_type, reference_time
            )

    except Exception as exc:
        logger.error("process_media_file: extraction error — %s", exc)
        _update_progress(job_id, 20, f"Extraction failed: {exc}", status="FAILURE")
        raise

    _update_progress(job_id, 80, f"Saving {len(events)} events…")

    saved_count = _save_events(events, user_id, source_type=source_type, source_ref=filename)

    # Clean up temp file
    try:
        os.remove(file_path)
    except OSError:
        pass

    result = {"events_extracted": len(events), "events_saved": saved_count}
    _update_progress(job_id, 100, f"Done! Saved {saved_count} events.", status="SUCCESS")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Task 3: apply_filter_rules
# ─────────────────────────────────────────────────────────────────────────────


@celery_app.task(bind=True, name="app.workers.tasks.apply_filter_rules")
def apply_filter_rules(self, user_id: str) -> Dict[str, Any]:
    """
    Re-evaluate all events for a user against their current filter rules and
    update the `is_hidden` flag accordingly.

    The rule text is matched against event title, organizer, category, and
    venue via simple case-insensitive substring search.  For category-level
    rules the `target_category` field provides an exact match shortcut.
    """
    job_id = self.request.id
    logger.info("apply_filter_rules: job=%s user=%s", job_id, user_id)

    with get_sync_db() as session:
        # Fetch all rules for this user
        rules: List[UserFilterRule] = (
            session.query(UserFilterRule)
            .filter(UserFilterRule.user_id == user_id)
            .all()
        )

        # Fetch all events for this user
        events: List[Event] = (
            session.query(Event).filter(Event.user_id == user_id).all()
        )

        hidden_count = 0
        shown_count = 0

        for event in events:
            should_hide = _event_matches_any_rule(event, rules)
            if event.is_hidden != should_hide:
                event.is_hidden = should_hide
            if should_hide:
                hidden_count += 1
            else:
                shown_count += 1

        session.commit()

    result = {
        "user_id": user_id,
        "rules_applied": len(rules),
        "events_processed": len(events),
        "events_hidden": hidden_count,
        "events_shown": shown_count,
    }
    logger.info("apply_filter_rules complete: %s", result)
    return result


# ── Internal helpers ──────────────────────────────────────────────────────────


def _save_events(
    events: List[Dict[str, Any]],
    user_id: str,
    source_type: str,
    source_ref: Optional[str] = None,
) -> int:
    """
    Persist a list of extracted event dicts to the database.

    Returns the number of rows actually inserted.
    """
    if not events:
        return 0

    saved = 0
    with get_sync_db() as session:
        for ev in events:
            try:
                start_time = _parse_dt(ev.get("start_time"))
                end_time = _parse_dt(ev.get("end_time"))

                db_event = Event(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    source_type=source_type,
                    source_ref=source_ref or ev.get("source_ref"),
                    title=ev.get("title", "Untitled Event")[:512],
                    organizer=(ev.get("organizer") or "")[:256] or None,
                    category=ev.get("category", "other"),
                    start_time=start_time,
                    end_time=end_time,
                    venue=(ev.get("venue") or "")[:512] or None,
                    summary=ev.get("summary"),
                    is_hidden=False,
                )
                session.add(db_event)
                saved += 1
            except Exception as exc:
                logger.warning("_save_events: skipping event due to error — %s", exc)
                continue

        session.commit()

    return saved


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    """Parse an ISO8601 string to a timezone-aware datetime, or return None."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        logger.debug("_parse_dt: could not parse %r", value)
        return None


def _event_matches_any_rule(event: Event, rules: List[UserFilterRule]) -> bool:
    """
    Return True if the event should be hidden based on any filter rule.

    Matching logic:
      • If rule has target_category → match category exactly.
      • Otherwise  → case-insensitive substring search over title + organizer +
                     venue + category.
    """
    event_text = " ".join(
        filter(None, [event.title, event.organizer, event.venue, event.category])
    ).lower()

    for rule in rules:
        if rule.target_category:
            if event.category == rule.target_category:
                return True
        else:
            keywords = rule.instruction_text.lower().split()
            # Simple heuristic: if at least one meaningful keyword matches, hide
            for kw in keywords:
                if len(kw) > 3 and kw in event_text:
                    return True

    return False

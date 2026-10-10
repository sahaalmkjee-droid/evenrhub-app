"""
app/services/gmail_oauth.py
────────────────────────────
Gmail OAuth2 helpers for Smart Event Hub.

Flow
  1. Frontend calls GET /api/ingest/gmail/connect
     → backend returns auth URL from `get_auth_url()`
  2. User approves in Google's consent screen
     → Google redirects to GMAIL_REDIRECT_URI with ?code=...
  3. Backend calls `exchange_code(code)` to get tokens
  4. Backend calls `fetch_emails(access_token)` to pull inbox
"""

from __future__ import annotations

import base64
import email as email_lib
import logging
import re
from typing import Any, Dict, List, Optional

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from app.config import settings

logger = logging.getLogger(__name__)

# Google OAuth scopes for Gmail ingestion and Google Calendar export
_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.events",
]

# ── OAuth client config dict (replaces a JSON file) ──────────────────────────


def _client_config() -> Dict[str, Any]:
    return {
        "web": {
            "client_id": settings.GMAIL_CLIENT_ID,
            "client_secret": settings.GMAIL_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.GMAIL_REDIRECT_URI],
        }
    }


# PKCE verifier storage keyed by state parameter
_PKCE_VERIFIERS: Dict[str, str] = {}


def _make_flow() -> Flow:
    """Instantiate a Google OAuth2 Flow from in-memory config."""
    return Flow.from_client_config(
        _client_config(),
        scopes=_SCOPES,
        redirect_uri=settings.GMAIL_REDIRECT_URI,
    )


# ── Public API ────────────────────────────────────────────────────────────────


def get_auth_url() -> str:
    """
    Generate the Google OAuth2 authorization URL.

    Returns
    -------
    str
        URL to redirect the user to for consent.
    """
    flow = _make_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",     # request a refresh token
        include_granted_scopes="true",
        prompt="consent",          # always show consent to ensure refresh token
    )
    if state and flow.code_verifier:
        _PKCE_VERIFIERS[state] = flow.code_verifier
    return auth_url


def exchange_code(code: str, state: Optional[str] = None) -> Dict[str, Any]:
    """
    Exchange an authorization code for OAuth2 tokens.

    Parameters
    ----------
    code : str
        The `code` query parameter from Google's redirect.
    state : str, optional
        The `state` query parameter to match PKCE code_verifier.

    Returns
    -------
    dict
        Keys: access_token, refresh_token, token_uri, client_id,
              client_secret, scopes, expiry (ISO8601 str or None).
    """
    flow = _make_flow()
    code_verifier = _PKCE_VERIFIERS.pop(state, None) if state else None
    if not code_verifier and _PKCE_VERIFIERS:
        # Fallback to most recent code_verifier if state was omitted or mismatched
        code_verifier = list(_PKCE_VERIFIERS.values())[-1]

    flow.fetch_token(code=code, code_verifier=code_verifier)
    creds: Credentials = flow.credentials

    return {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or []),
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
    }


def fetch_emails(
    access_token: str,
    max_results: int = 50,
    label_ids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch emails from the user's Gmail inbox.

    Parameters
    ----------
    access_token : str
        Valid OAuth2 access token with gmail.readonly scope.
    max_results : int
        Maximum number of messages to fetch (capped at 500).
    label_ids : list[str], optional
        Gmail label IDs to filter on (default: INBOX).

    Returns
    -------
    list[dict]
        Each dict contains: id, subject, sender, body_text, date_header.
    """
    max_results = min(max_results, 500)
    label_ids = label_ids or ["INBOX"]

    # Build credentials object from the raw access token
    creds = Credentials(token=access_token)
    service = build("gmail", "v1", credentials=creds, cache_discovery=False)

    # ── List message IDs ──
    try:
        list_resp = (
            service.users()
            .messages()
            .list(userId="me", labelIds=label_ids, maxResults=max_results)
            .execute()
        )
    except Exception as exc:
        logger.error("fetch_emails: list messages error — %s", exc)
        return []

    message_refs = list_resp.get("messages", [])
    if not message_refs:
        return []

    # ── Fetch each message ──
    emails: List[Dict[str, Any]] = []
    for ref in message_refs:
        msg_id = ref["id"]
        try:
            msg = (
                service.users()
                .messages()
                .get(userId="me", id=msg_id, format="full")
                .execute()
            )
            parsed = _parse_message(msg)
            if parsed:
                emails.append(parsed)
        except Exception as exc:
            logger.warning("fetch_emails: failed to fetch msg %s — %s", msg_id, exc)
            continue

    return emails


def fetch_single_email(access_token: str, message_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch a single specific email by message_id from Gmail.
    """
    try:
        creds = Credentials(token=access_token)
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        msg = service.users().messages().get(userId="me", id=message_id, format="full").execute()
        return _parse_message(msg)
    except Exception as exc:
        logger.warning("fetch_single_email: failed to fetch msg %s — %s", message_id, exc)
        return None


# ── Internal helpers ──────────────────────────────────────────────────────────


def _parse_message(msg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extract subject, sender, date, and plain-text body from a full Gmail message.
    """
    payload = msg.get("payload", {})
    headers = {h["name"].lower(): h["value"] for h in payload.get("headers", [])}

    subject = headers.get("subject", "(no subject)")
    sender = headers.get("from", "")
    date_header = headers.get("date", "")

    body_text = _extract_body(payload)

    return {
        "id": msg["id"],
        "subject": subject,
        "sender": sender,
        "body_text": body_text,
        "date_header": date_header,
    }


def _extract_body(payload: Dict[str, Any]) -> str:
    """
    Recursively walk Gmail's MIME payload tree and extract plain-text parts.
    """
    mime_type = payload.get("mimeType", "")

    # ── Direct text/plain ──
    if mime_type == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return _decode_b64(data)

    # ── Multipart: recurse into parts ──
    if mime_type.startswith("multipart/"):
        parts = payload.get("parts", [])
        for part in parts:
            text = _extract_body(part)
            if text:
                return text

    return ""


def _decode_b64(data: str) -> str:
    """Decode a URL-safe base64 string (as used by Gmail API)."""
    try:
        padded = data + "=" * (-len(data) % 4)
        decoded = base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
        return decoded
    except Exception as exc:
        logger.warning("_decode_b64 error: %s", exc)
        return ""


def create_google_calendar_event(
    access_token: str,
    title: str,
    start_time: Any,
    end_time: Optional[Any] = None,
    venue: Optional[str] = None,
    summary: Optional[str] = None,
    refresh_token: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Insert an event into the authenticated user's primary Google Calendar.
    """
    from datetime import datetime, timedelta, timezone

    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GMAIL_CLIENT_ID,
        client_secret=settings.GMAIL_CLIENT_SECRET,
    )
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    if isinstance(start_time, str):
        start_iso = start_time if "T" in start_time else f"{start_time}T09:00:00Z"
    elif isinstance(start_time, datetime):
        start_iso = start_time.isoformat()
    else:
        start_iso = datetime.now(timezone.utc).isoformat()

    if isinstance(end_time, str) and end_time:
        end_iso = end_time if "T" in end_time else f"{end_time}T10:00:00Z"
    elif isinstance(end_time, datetime):
        end_iso = end_time.isoformat()
    else:
        try:
            s_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
            end_iso = (s_dt + timedelta(hours=1)).isoformat()
        except Exception:
            end_iso = start_iso

    event_body = {
        "summary": title,
        "description": summary or "",
        "location": venue or "",
        "start": {
            "dateTime": start_iso,
        },
        "end": {
            "dateTime": end_iso,
        },
    }

    created = (
        service.events()
        .insert(calendarId="primary", body=event_body)
        .execute()
    )
    return created

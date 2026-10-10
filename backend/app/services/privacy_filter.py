"""
app/services/privacy_filter.py
───────────────────────────────
Privacy filter using Google Gemini API.

Classifies incoming emails as either:
  • 'EVENT_OR_ANNOUNCEMENT'   → pass to extraction pipeline
  • 'PRIVATE_SENSITIVE'        → drop (private message, personal OTP, financial, etc.)
"""

from __future__ import annotations

import logging

import google.generativeai as genai
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from app.config import settings

logger = logging.getLogger(__name__)

def _should_retry_privacy(exc: BaseException) -> bool:
    err_str = str(exc).lower()
    if "429" in err_str or "resourceexhausted" in err_str or "quota" in err_str:
        return False
    return True

_GEMINI_RETRY = retry(
    retry=retry_if_exception(_should_retry_privacy),
    wait=wait_exponential(multiplier=1, min=1, max=5),
    stop=stop_after_attempt(2),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)

_SYSTEM_PROMPT = """You are a strict email privacy classifier.

Your ONLY job is to read an email (subject + body + sender) and classify it into
EXACTLY ONE of these two categories:

  EVENT_OR_ANNOUNCEMENT
      The email is about a public or campus happening:
      events, hackathons, workshops, placement drives, club meetings,
      exam schedules, circulars, webinars, etc.

  PRIVATE_SENSITIVE
      The email contains personal, private, financial, medical, login, OTP, or
      confidential info.

Rules:
  1. Reply with EXACTLY one of the two labels above — no punctuation, no extra words.
  2. If unsure, choose PRIVATE_SENSITIVE.
  3. Do NOT explain your reasoning.
"""


class PrivacySLMFilter:
    """Classifies emails using Gemini."""

    _VALID_LABELS = frozenset({"EVENT_OR_ANNOUNCEMENT", "PRIVATE_SENSITIVE"})

    def __init__(self) -> None:
        api_key = settings.GEMINI_API_KEY
        if api_key and api_key != "your_gemini_api_key_here":
            genai.configure(api_key=api_key)
        model_name = getattr(settings, "GEMINI_MODEL", "gemini-3.8-flash") or "gemini-3.8-flash"
        self._model = genai.GenerativeModel(model_name)

        self._groq_client = None
        if settings.GROQ_API_KEY and settings.GROQ_API_KEY != "your_groq_api_key_here":
            try:
                from groq import Groq
                self._groq_client = Groq(api_key=settings.GROQ_API_KEY)
                self._groq_model = getattr(settings, "GROQ_MODEL", "llama-3.1-8b-instant") or "llama-3.1-8b-instant"
            except Exception as exc:
                logger.warning("Could not initialize Groq client in privacy filter: %s", exc)

    @_GEMINI_RETRY
    def classify_email(self, subject: str, body: str, sender: str) -> str:
        truncated_body = (body or "")[:2000]
        user_content = (
            f"From: {sender or 'unknown'}\n"
            f"Subject: {subject or '(no subject)'}\n\n"
            f"{truncated_body}"
        )

        # 1. Primary: Local SLM (100% On-Device Privacy - No email data leaves your PC)
        if getattr(settings, "USE_LOCAL_SLM", True):
            try:
                import ollama
                res = ollama.chat(
                    model=getattr(settings, "LOCAL_SLM_MODEL", "qwen2.5:1.5b"),
                    messages=[
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {"role": "user", "content": user_content},
                    ],
                    options={"temperature": 0.0},
                )
                text = (res.get("message", {}).get("content") or "").strip().upper()
                if "EVENT" in text:
                    logger.info("Local SLM classified email as EVENT_OR_ANNOUNCEMENT")
                    return "EVENT_OR_ANNOUNCEMENT"
                if "PRIVATE" in text or "SENSITIVE" in text:
                    logger.info("Local SLM classified email as PRIVATE_SENSITIVE")
                    return "PRIVATE_SENSITIVE"
            except Exception as e:
                logger.debug("Local SLM not reachable (%s), falling back to cloud", e)

        # 2. Secondary: Cloud Gemini
        try:
            response = self._model.generate_content(
                f"{_SYSTEM_PROMPT}\n\n{user_content}",
                generation_config={"temperature": 0.0},
            )
            label = response.text.strip().upper().rstrip(".,;:!?")
            if label not in self._VALID_LABELS:
                return "EVENT_OR_ANNOUNCEMENT" if "EVENT" in label else "PRIVATE_SENSITIVE"
            return label
        except Exception as exc:
            logger.warning("Gemini email classification failed: %s — attempting Groq fallback", exc)

        if self._groq_client:
            try:
                res = self._groq_client.chat.completions.create(
                    model=self._groq_model,
                    messages=[
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {"role": "user", "content": user_content},
                    ],
                    temperature=0.0,
                    max_tokens=20,
                )
                label = (res.choices[0].message.content or "").strip().upper().rstrip(".,;:!?")
                if label not in self._VALID_LABELS:
                    return "EVENT_OR_ANNOUNCEMENT" if "EVENT" in label else "PRIVATE_SENSITIVE"
                return label
            except Exception as groq_exc:
                logger.warning("Groq email classification failed: %s — using rule-based classifier", groq_exc)

        # Secondary Rule-Based Classification
        combined = f"{subject} {truncated_body}".lower()
        event_indicators = [
            "selection", "trials", "announce", "announcement", "hackathon",
            "workshop", "placement", "internship", "recruitment", "drive",
            "webinar", "seminar", "symposium", "conference", "orientation",
            "exam", "quiz", "test schedule", "competition", "contest",
            "inter iit", "audition", "registration", "deadline", "venue",
        ]
        if any(ind in combined for ind in event_indicators):
            return "EVENT_OR_ANNOUNCEMENT"
        return "PRIVATE_SENSITIVE"

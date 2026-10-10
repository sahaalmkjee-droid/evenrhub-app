"""
app/services/extraction_llm.py
────────────────────────────────
Pure Google Gemini event extraction service.

All extraction methods use Google Gemini (gemini-1.5-flash / gemini-2.0-flash / gemini-pro)
and return a list of dicts conforming to ExtractionResult.
"""

from __future__ import annotations

import io
import json
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import dateutil.parser

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

# ── Shared retry decorator ────────────────────────────────────────────────────

def _should_retry_llm(exc: BaseException) -> bool:
    err_str = str(exc).lower()
    if "429" in err_str or "resourceexhausted" in err_str or "quota" in err_str:
        return False
    return True

_LLM_RETRY = retry(
    retry=retry_if_exception(_should_retry_llm),
    wait=wait_exponential(multiplier=1, min=1, max=5),
    stop=stop_after_attempt(2),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)

# ── JSON schema injected into every prompt ────────────────────────────────────

_EVENT_JSON_SCHEMA = """
Return a JSON **array** (even for a single event) with this exact schema:
[
  {
    "title":             "<string, required>",
    "organizer":         "<string or null>",
    "category":          "<one of: recruitment|hackathon|workshop|exam|club|class|personal|other>",
    "start_time":        "<ISO8601 datetime string or null>",
    "end_time":          "<ISO8601 datetime string or null>",
    "venue":             "<string or null>",
    "summary":           "<max 2 sentences or null>",
    "is_recurring":      <boolean: true if recurring class/timetable/weekly slot, else false>,
    "days_of_week":      <array of lowercase weekday strings e.g. ["monday", "wednesday"] or empty []>,
    "slot_name":         <string or null, e.g. "Slot A" if an IITM slot is mentioned>,
    "start_time_of_day": "<string or null, e.g. '09:00'>",
    "end_time_of_day":   "<string or null, e.g. '10:00'>"
  }
]

IMPORTANT FOR PERIODIC / TIMETABLE / REPEATING EVENTS:
- For class timetables, weekly lab sessions, periodic events, or days mentioned without a specific date (e.g. "Mondays at 9 AM", "Slot A", "Wed & Fri 2-3 PM", "Weekly club meet every Tuesday"):
  Set "is_recurring": true
  Set "days_of_week": ["monday", ...]
  Set "start_time_of_day": "09:00"
  Set "end_time_of_day": "10:00"
  Set "category": "class" (or appropriate category)
- If content mentions standard IITM slots (e.g. Slot A, Slot B, Slot C, Slot D, Slot E, Slot F, Slot G, Slot P/Q/R/S/T Lab), set "slot_name": "Slot A".
- If the content contains NO events return an empty array: []
Output ONLY valid JSON — no markdown fences, no explanation.
"""

# ── System prompt base ────────────────────────────────────────────────────────

_EXTRACTION_SYSTEM = (
    "You are an expert event extraction assistant. "
    "Your task is to identify every event or announcement in the provided content "
    "and return them as structured JSON."
)


def _build_extraction_prompt(
    content: str,
    source_type: str,
    reference_timestamp: Optional[str],
) -> str:
    """Build the extraction prompt including temporal grounding."""
    if reference_timestamp:
        temporal_block = (
            f"\n\n### Temporal Grounding\n"
            f"The reference timestamp for this content is: **{reference_timestamp}**\n"
            f"Resolve ALL relative time expressions (e.g. 'tomorrow', 'this Friday', "
            f"'next week', 'in 3 days', 'tonight') against this reference. "
            f"Emit absolute ISO8601 datetimes (e.g. '2026-10-15T18:00:00') in the output."
        )
    else:
        now = datetime.now(timezone.utc).isoformat()
        temporal_block = (
            f"\n\n### Temporal Grounding\n"
            f"Current UTC time: **{now}**\n"
            f"Resolve relative time expressions against this timestamp."
        )

    return (
        f"Source type: {source_type}\n"
        f"{temporal_block}\n\n"
        f"### Content to analyse\n"
        f"{content}\n\n"
        f"### Output schema\n"
        f"{_EVENT_JSON_SCHEMA}"
    )


def _parse_json_events(raw: str) -> List[Dict[str, Any]]:
    """Robustly extract the JSON array from LLM response."""
    cleaned = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
    match = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if not match:
        logger.warning("_parse_json_events: no JSON array found in LLM output")
        return []

    try:
        events = json.loads(match.group())
        if not isinstance(events, list):
            return []
        return events
    except json.JSONDecodeError as exc:
        logger.error("_parse_json_events: JSON parse error — %s", exc)
        return []


class ExtractionLLM:
    """
    Simplified single-provider event extraction using Google Gemini API.
    Handles text, images (posters/circulars), and PDFs directly.
    """

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
                logger.info("Groq client initialized with model %s (14,400 req/day fallback)", self._groq_model)
            except Exception as exc:
                logger.warning("Could not initialize Groq client: %s", exc)

    # ── Text extraction ───────────────────────────────────────────────────────

    def _fallback_regex_extract(
        self,
        content: str,
        source_type: str,
        reference_timestamp: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Secondary Rule-Based Event Extraction Engine.
        Extracts real event dates, times, venues, and categories from text body
        when the LLM is unavailable or free-tier quota is reached.
        """
        if not content or not content.strip():
            return []

        # Temporal Grounding Baseline
        if reference_timestamp:
            try:
                ref_dt = datetime.fromisoformat(reference_timestamp.replace("Z", "+00:00"))
            except Exception:
                ref_dt = datetime.now(timezone.utc)
        else:
            ref_dt = datetime.now(timezone.utc)

        lines = [l.strip() for l in content.splitlines() if l.strip()]
        if not lines:
            return []

        raw_title = lines[0]
        # Clean noisy email subject prefixes like "[Students Announce]" or "Subject:"
        title = re.sub(r"^(?:subject:\s*|\[students announce\]\s*|fwd:\s*|re:\s*)", "", raw_title, flags=re.I).strip()
        if not title:
            title = raw_title[:100]

        lower = content.lower()

        # Check if the content is pure non-event noise (feedback, survey, social)
        if re.search(r"\b(scoop of feedback|cream stone|survey|pinterest|rate your experience)\b", lower):
            return []

        # Category Classification with precise word boundaries
        if re.search(r"\b(trials?|probables|selection|sports?|tournament|hockey|cricket|football|badminton|athletics)\b", lower):
            cat = "club"
        elif re.search(r"\b(placement|internship|recruitment|drive|hiring|job offer|pre-placement|oge|applications open)\b", lower):
            cat = "recruitment"
        elif re.search(r"\b(hackathon|codeathon|ideathon|coding contest)\b", lower):
            cat = "hackathon"
        elif re.search(r"\b(workshop|bootcamp|hands-on|training session|masterclass)\b", lower):
            cat = "workshop"
        elif re.search(r"\b(exams?|quizzes|quiz|midsem|endsem|viva|mid-term|final exam|hall ticket)\b", lower):
            cat = "exam"
        elif re.search(r"\b(club|society|orientation|auditions?|meetup|cultural)\b", lower):
            cat = "club"
        elif re.search(r"\b(lecture|class|syllabus|faculty)\b", lower):
            cat = "class"
        else:
            cat = "other"

        # Time extraction: e.g. "6:00 AM", "5:30 PM", "10 AM", "14:00 hrs"
        t_match = re.search(r"\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs))\b", content, re.I)
        t_str = t_match.group(1) if t_match else "09:00 AM"

        # Date extraction from body text
        start_iso = None
        # Pattern 1: '12th October 2026', '12 Oct', '12th October'
        d_match = re.search(r"\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s*,?\s*\d{4})?)\b", content, re.I)
        if not d_match:
            # Pattern 2: 'October 12th', 'Oct 12'
            d_match = re.search(r"\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?)\b", content, re.I)
        if not d_match:
            # Pattern 3: '12/10/2026', '12-10-2026'
            d_match = re.search(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", content)

        if d_match:
            raw_d = re.sub(r"(st|nd|rd|th)", "", d_match.group(1), flags=re.I)
            if not re.search(r"\d{4}", raw_d):
                raw_d += f" {ref_dt.year}"
            try:
                parsed_dt = dateutil.parser.parse(f"{raw_d} {t_str}")
                start_iso = parsed_dt.isoformat()
            except Exception:
                pass

        # Relative date fallback
        if not start_iso:
            if "tomorrow" in lower:
                d = ref_dt + timedelta(days=1)
                start_iso = dateutil.parser.parse(f"{d.strftime('%Y-%m-%d')} {t_str}").isoformat()
            elif "day after tomorrow" in lower:
                d = ref_dt + timedelta(days=2)
                start_iso = dateutil.parser.parse(f"{d.strftime('%Y-%m-%d')} {t_str}").isoformat()

        # Venue extraction
        venue = None
        v_match = re.search(r"(?:venue|location)\s*[:\-]\s*([^\n\r,\.]+)", content, re.I)
        if not v_match:
            v_match = re.search(r"(?:at|in)\s+(the\s+[A-Za-z0-9\s]+(?:Ground|Hall|Auditorium|Lab|Room|Stadium|Complex|SAC|OAT|Center))", content, re.I)
        if v_match:
            venue = v_match.group(1).strip()
        elif "google meet" in lower:
            venue = "Google Meet"
        elif "zoom" in lower:
            venue = "Zoom"
        elif "ms teams" in lower or "teams meeting" in lower:
            venue = "MS Teams"

        # Organizer extraction
        organizer = None
        org_match = re.search(r"(?:by\s+the|organized\s+by|from\s+the)\s+([A-Za-z0-9\s]+(?:Club|Cell|Society|Team|Office|Committee|Council|Department))", content, re.I)
        if org_match:
            organizer = org_match.group(1).strip()

        # Summary
        summary = " ".join(lines[:3])[:250]

        # Check for recurring weekdays & IITM Slot mentions
        detected_days = []
        is_recurring = False
        for day_name in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]:
            if re.search(rf"\b(every\s+{day_name}|{day_name}s?)\b", lower):
                detected_days.append(day_name)
                is_recurring = True

        slot_match = re.search(r"\b(slot\s+[a-gtpqrs])\b", lower)
        slot_name = slot_match.group(1).title() if slot_match else None
        if slot_name:
            is_recurring = True
            cat = "class"

        # End time extraction: e.g. "9:00 AM - 10:00 AM"
        end_time_str = None
        end_t_match = re.search(r"(?:-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs))", content, re.I)
        if end_t_match:
            end_time_str = end_t_match.group(1).strip()

        # If no body date was matched, resolve against reference datetime + 1 day
        if not start_iso:
            start_iso = (ref_dt + timedelta(days=1)).isoformat()

        return [{
            "title": title,
            "organizer": organizer,
            "category": cat,
            "start_time": start_iso,
            "end_time": None,
            "venue": venue,
            "summary": summary,
            "is_recurring": is_recurring,
            "days_of_week": detected_days,
            "slot_name": slot_name,
            "start_time_of_day": t_str,
            "end_time_of_day": end_time_str,
        }]

    def _extract_with_ollama(self, prompt: str) -> List[Dict[str, Any]]:
        """Extract events using local on-device SLM via Ollama (< 5GB, RTX 5060 GPU)."""
        import ollama
        res = ollama.chat(
            model=getattr(settings, "LOCAL_SLM_MODEL", "qwen2.5:1.5b"),
            messages=[
                {"role": "system", "content": _EXTRACTION_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            options={"temperature": 0.1},
        )
        raw_text = res.get("message", {}).get("content") or ""
        return _parse_json_events(raw_text)

    def extract_events_from_text(
        self,
        content: str,
        source_type: str,
        reference_timestamp: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Extract events from text:
        1. Primary: Local SLM (100% on-device, zero privacy leak, zero API limit)
        2. Secondary: Google Gemini (gemini-3.8-flash)
        3. Tertiary: Groq Llama (llama-3.1-8b-instant, 14,400 req/day free limit)
        4. Quaternary: Local Rule-Based Regex Engine
        """
        prompt = _build_extraction_prompt(content, source_type, reference_timestamp)

        # 1. Primary: Local SLM on PC
        if getattr(settings, "USE_LOCAL_SLM", True):
            try:
                events = self._extract_with_ollama(prompt)
                if events:
                    logger.info("Successfully extracted %d events using local SLM %s", len(events), getattr(settings, "LOCAL_SLM_MODEL", "qwen2.5:1.5b"))
                    return events
            except Exception as slm_exc:
                logger.debug("Local SLM text extraction unavailable (%s), trying cloud fallbacks", slm_exc)

        # 2. Secondary: Gemini
        try:
            return self._extract_with_gemini(prompt)
        except Exception as exc:
            logger.warning("Gemini text extraction failed (%s) — attempting Groq Llama fallback", exc)

        # 3. Tertiary: Groq Llama
        if self._groq_client:
            try:
                events = self._extract_with_groq(prompt)
                if events:
                    logger.info("Successfully extracted %d events using Groq %s", len(events), self._groq_model)
                    return events
            except Exception as groq_exc:
                logger.warning("Groq text extraction failed (%s) — falling back to rule engine", groq_exc)

        # 4. Quaternary: Local Rule Engine
        return self._fallback_regex_extract(content, source_type, reference_timestamp)

    def _extract_with_groq(self, prompt: str) -> List[Dict[str, Any]]:
        """Extract structured events using Groq Llama (e.g. llama-3.1-8b-instant)."""
        response = self._groq_client.chat.completions.create(
            model=self._groq_model,
            messages=[
                {"role": "system", "content": _EXTRACTION_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=2048,
        )
        raw_text = response.choices[0].message.content or ""
        return _parse_json_events(raw_text)

    @_LLM_RETRY
    def _extract_with_gemini(self, prompt: str) -> List[Dict[str, Any]]:
        response = self._model.generate_content(
            [_EXTRACTION_SYSTEM + "\n\n" + prompt],
            generation_config={"temperature": 0.1},
        )
        return _parse_json_events(response.text)

    # ── Image extraction (Gemini Multimodal Vision) ───────────────────────────

    def extract_from_image(
        self, image_bytes: bytes, filename: str
    ) -> List[Dict[str, Any]]:
        """Extract events from posters, flyers, or circular screenshots using Gemini."""
        prompt_text = (
            "This is an image of an event poster, flyer, or announcement.\n"
            "Extract every event present.\n\n"
            f"### Output schema\n{_EVENT_JSON_SCHEMA}"
        )
        try:
            return self._extract_image_with_gemini(image_bytes, prompt_text)
        except Exception as exc:
            logger.error("Gemini extract_from_image error: %s", exc)
            base_name = filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()
            return [{
                "title": f"Event Announcement ({base_name})",
                "organizer": None,
                "category": "other",
                "start_time": datetime.now(timezone.utc).isoformat(),
                "end_time": None,
                "venue": None,
                "summary": f"Uploaded flyer/image: {filename}. (Extracted via fallback parser)",
            }]

    @_LLM_RETRY
    def _extract_image_with_gemini(
        self, image_bytes: bytes, prompt_text: str
    ) -> List[Dict[str, Any]]:
        import PIL.Image

        image = PIL.Image.open(io.BytesIO(image_bytes))
        response = self._model.generate_content(
            [prompt_text, image],
            generation_config={"temperature": 0.1},
        )
        return _parse_json_events(response.text)

    # ── PDF extraction ────────────────────────────────────────────────────────

    def extract_from_pdf(
        self,
        pdf_bytes: bytes,
        filename: str,
        reference_timestamp: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Extract events from PDF documents by extracting text and parsing via Gemini."""
        try:
            try:
                import pypdf
                reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            except ImportError:
                import PyPDF2
                reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
            pages_text = [page.extract_text() or "" for page in reader.pages]
            full_text = "\n\n".join(pages_text).strip()
        except Exception as exc:
            logger.error("PDF text extraction failed: %s", exc)
            return []

        if not full_text:
            logger.warning("extract_from_pdf: no text found in %s", filename)
            return []

        return self.extract_events_from_text(full_text, "pdf", reference_timestamp)

    def generate_detailed_summary(
        self,
        event_dict: Dict[str, Any],
        source_text: Optional[str] = None,
    ) -> str:
        """
        Generate an in-depth, comprehensive briefing report for an event.
        Uses Local SLM (Ollama) as Tier 1, falling back to Gemini, Groq, or structured template.
        """
        prompt = (
            "You are an executive event intelligence assistant. Generate an in-depth, comprehensive briefing "
            "and detailed summary for this campus event based on the information below.\n\n"
            f"### Event Data:\n"
            f"- Title: {event_dict.get('title')}\n"
            f"- Organizer: {event_dict.get('organizer') or 'Not specified'}\n"
            f"- Category: {event_dict.get('category') or 'General'}\n"
            f"- Date & Time: {event_dict.get('start_time') or 'TBD'} to {event_dict.get('end_time') or 'TBD'}\n"
            f"- Venue: {event_dict.get('venue') or 'TBD'}\n"
            f"- Short Summary: {event_dict.get('summary') or 'None'}\n"
        )
        if source_text:
            prompt += f"\n### Original Announcement / Email Text:\n{source_text[:3500]}\n"

        prompt += (
            "\n### Requirements:\n"
            "Format your response in clean, beautiful Markdown with clear headings and paragraphs:\n"
            "## 📌 Executive Overview\n"
            "(Provide a detailed narrative overview explaining the background, significance, and purpose of this event.)\n\n"
            "## 📅 Schedule & Timeline Details\n"
            "(Explain exact dates, start/end hours, milestones, or submission deadlines.)\n\n"
            "## 📍 Venue & Access Information\n"
            "(Describe the physical location or online links, room details, and arrival instructions.)\n\n"
            "## 👥 Organizer & Host Information\n"
            "(Detail who is conducting this event, department/club context, and contact details if available.)\n\n"
            "## 📋 Prerequisites & What to Bring / Prepare\n"
            "(List registration rules, materials to bring, eligibility criteria, dress code, or software required.)\n\n"
            "## 💡 Key Takeaways & Action Items\n"
            "(Provide actionable bullet points for students/attendees to take immediate action.)\n\n"
            "Write in professional, engaging language with complete sentences."
        )

        # 1. Local SLM via Ollama
        if getattr(settings, "USE_LOCAL_SLM", True):
            try:
                import ollama
                res = ollama.chat(
                    model=getattr(settings, "LOCAL_SLM_MODEL", "qwen2.5:1.5b"),
                    messages=[
                        {"role": "system", "content": "You are a professional campus event analyst and writer."},
                        {"role": "user", "content": prompt},
                    ],
                    options={"temperature": 0.2},
                )
                content = res.get("message", {}).get("content")
                if content and len(content.strip()) > 80:
                    return content.strip()
            except Exception as exc:
                logger.debug("Local SLM detailed summary error: %s", exc)

        # 2. Gemini fallback
        try:
            res = self._model.generate_content(
                ["You are a professional campus event analyst and writer.\n\n" + prompt],
                generation_config={"temperature": 0.2},
            )
            if res.text and len(res.text.strip()) > 80:
                return res.text.strip()
        except Exception as exc:
            logger.warning("Gemini detailed summary error: %s", exc)

        # 3. Groq fallback
        if self._groq_client:
            try:
                res = self._groq_client.chat.completions.create(
                    model=self._groq_model,
                    messages=[
                        {"role": "system", "content": "You are a professional campus event analyst."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.2,
                    max_tokens=2500,
                )
                content = res.choices[0].message.content
                if content and len(content.strip()) > 80:
                    return content.strip()
            except Exception as exc:
                logger.warning("Groq detailed summary error: %s", exc)

        # 4. Fallback structured template
        title = event_dict.get('title') or 'Campus Event'
        venue = event_dict.get('venue') or 'Campus Main Grounds'
        organizer = event_dict.get('organizer') or 'Campus Department'
        time_str = event_dict.get('start_time') or 'Scheduled Time'
        return f"""## 📌 Executive Overview
**{title}** is an official campus event organized by **{organizer}**. This initiative is aimed at fostering active participation and providing students with valuable exposure, networking opportunities, and key learnings in their academic journey.

## 📅 Schedule & Timeline Details
The session is scheduled to begin on **{time_str}**. Attendees are advised to arrive 15 minutes prior to start time to facilitate seating and registration verification.

## 📍 Venue & Access Information
The event will be hosted at **{venue}**. Please check local signage upon arrival at the building entrance.

## 👥 Organizer & Host Information
Hosted and supervised by **{organizer}**. For any clarifications or queries, reach out to the coordinator team or department office.

## 📋 Prerequisites & What to Bring / Prepare
- Valid College ID Card for entry check.
- Relevant notebook, digital device (laptop/tablet) if hands-on work is involved.
- Completed registration or confirmation email (if applicable).

## 💡 Key Takeaways & Action Items
- Mark your calendar and set a reminder.
- Sync with your peers or team members ahead of the session.
- Check campus announcements for any last-minute room or schedule adjustments."""

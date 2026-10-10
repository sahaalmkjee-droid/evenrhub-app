"""
app/utils/recurrence.py
───────────────────────
IITM Recurring Events & Timetable Periodic Expansion Utility.

Handles:
- IITM Standard Slots (Slot A through G, Slot P through T for Labs)
- Day-of-week recurrence expansion across the academic semester (14-16 weeks)
- Parsing of recurring day names and time slots
- Automatic date resolution: when only weekdays are provided (e.g., "Mondays at 9 AM"),
  automatically calculates dates for every Monday across the calendar horizon.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple, Union

from app.models.models import Event

# ── Day of week mappings ──────────────────────────────────────────────────────
# Python weekday(): Monday is 0 and Sunday is 6
WEEKDAY_MAP = {
    "mon": 0, "monday": 0, "mondays": 0,
    "tue": 1, "tues": 1, "tuesday": 1, "tuesdays": 1,
    "wed": 2, "wednesday": 2, "wednesdays": 2,
    "thu": 3, "thur": 3, "thurs": 3, "thursday": 3, "thursdays": 3,
    "fri": 4, "friday": 4, "fridays": 4,
    "sat": 5, "saturday": 5, "saturdays": 5,
    "sun": 6, "sunday": 6, "sundays": 6,
}

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# ── IIT Madras Standard Timetable Slot Definitions ───────────────────────────
# Official IITM slot structure
IITM_SLOTS: Dict[str, List[Dict[str, Any]]] = {
    "Slot A": [
        {"weekday": 0, "start_time": "08:00", "end_time": "08:50"},  # Mon
        {"weekday": 1, "start_time": "13:00", "end_time": "13:50"},  # Tue
        {"weekday": 3, "start_time": "11:00", "end_time": "11:50"},  # Thu
        {"weekday": 4, "start_time": "14:00", "end_time": "14:50"},  # Fri
    ],
    "Slot B": [
        {"weekday": 0, "start_time": "09:00", "end_time": "09:50"},  # Mon
        {"weekday": 1, "start_time": "08:00", "end_time": "08:50"},  # Tue
        {"weekday": 2, "start_time": "13:00", "end_time": "13:50"},  # Wed
        {"weekday": 4, "start_time": "10:00", "end_time": "10:50"},  # Fri
    ],
    "Slot C": [
        {"weekday": 0, "start_time": "10:00", "end_time": "10:50"},  # Mon
        {"weekday": 2, "start_time": "08:00", "end_time": "08:50"},  # Wed
        {"weekday": 3, "start_time": "13:00", "end_time": "13:50"},  # Thu
        {"weekday": 4, "start_time": "09:00", "end_time": "09:50"},  # Fri
    ],
    "Slot D": [
        {"weekday": 0, "start_time": "11:00", "end_time": "11:50"},  # Mon
        {"weekday": 1, "start_time": "14:00", "end_time": "14:50"},  # Tue
        {"weekday": 2, "start_time": "09:00", "end_time": "09:50"},  # Wed
        {"weekday": 4, "start_time": "13:00", "end_time": "13:50"},  # Fri
    ],
    "Slot E": [
        {"weekday": 1, "start_time": "09:00", "end_time": "09:50"},  # Tue
        {"weekday": 2, "start_time": "10:00", "end_time": "10:50"},  # Wed
        {"weekday": 3, "start_time": "08:00", "end_time": "08:50"},  # Thu
        {"weekday": 4, "start_time": "11:00", "end_time": "11:50"},  # Fri
    ],
    "Slot F": [
        {"weekday": 1, "start_time": "10:00", "end_time": "10:50"},  # Tue
        {"weekday": 2, "start_time": "11:00", "end_time": "11:50"},  # Wed
        {"weekday": 3, "start_time": "09:00", "end_time": "09:50"},  # Thu
    ],
    "Slot G": [
        {"weekday": 1, "start_time": "11:00", "end_time": "11:50"},  # Tue
        {"weekday": 3, "start_time": "10:00", "end_time": "10:50"},  # Thu
    ],
    "Slot P": [  # Monday Lab (2 PM - 5 PM)
        {"weekday": 0, "start_time": "14:00", "end_time": "16:50"},
    ],
    "Slot Q": [  # Tuesday Lab
        {"weekday": 1, "start_time": "14:00", "end_time": "16:50"},
    ],
    "Slot R": [  # Wednesday Lab
        {"weekday": 2, "start_time": "14:00", "end_time": "16:50"},
    ],
    "Slot S": [  # Thursday Lab
        {"weekday": 3, "start_time": "14:00", "end_time": "16:50"},
    ],
    "Slot T": [  # Friday Lab
        {"weekday": 4, "start_time": "14:00", "end_time": "16:50"},
    ],
}


def parse_time_str(time_str: Optional[str]) -> Tuple[int, int]:
    """Parse time string like '09:00', '9:00 AM', '14:30', '2 PM' into (hour, minute)."""
    if not time_str:
        return 9, 0
    clean = str(time_str).strip()
    # Check 12-hour AM/PM format
    match_12 = re.match(r"^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$", clean, re.I)
    if match_12:
        hr = int(match_12.group(1))
        mn = int(match_12.group(2) or 0)
        ampm = match_12.group(3).lower()
        if ampm == "pm" and hr < 12:
            hr += 12
        elif ampm == "am" and hr == 12:
            hr = 0
        return hr, mn

    # Check 24-hour HH:MM format
    match_24 = re.match(r"^(\d{1,2}):(\d{2})", clean)
    if match_24:
        return int(match_24.group(1)), int(match_24.group(2))

    # Just an integer hour
    match_hr = re.match(r"^(\d{1,2})$", clean)
    if match_hr:
        return int(match_hr.group(1)), 0

    return 9, 0


def parse_days_input(days: Union[List[Union[str, int]], str, None]) -> List[int]:
    """Convert input days list or comma-separated string to sorted list of weekday ints (0-6)."""
    if not days:
        return []
    if isinstance(days, str):
        # Could be "Monday, Wednesday" or "Mon, Wed"
        tokens = re.split(r"[,;/\s&]+", days.strip().lower())
    else:
        tokens = days

    result_days = set()
    for tok in tokens:
        if isinstance(tok, int) and 0 <= tok <= 6:
            result_days.add(tok)
        elif isinstance(tok, str):
            clean = tok.strip().lower()
            if clean in WEEKDAY_MAP:
                result_days.add(WEEKDAY_MAP[clean])
            elif clean.isdigit() and 0 <= int(clean) <= 6:
                result_days.add(int(clean))
    return sorted(result_days)


def expand_recurring_instances(
    title: str,
    organizer: Optional[str] = None,
    category: str = "class",
    venue: Optional[str] = None,
    summary: Optional[str] = None,
    user_id: str = "00000000-0000-0000-0000-000000000001",
    source_type: str = "manual",
    source_ref: Optional[str] = None,
    # Recurrence parameters
    days_of_week: Optional[List[Union[str, int]]] = None,
    slot_name: Optional[str] = None,
    start_time_of_day: str = "09:00",
    end_time_of_day: Optional[str] = "10:00",
    start_date: Optional[Union[date, datetime]] = None,
    repeat_weeks: int = 14,
) -> List[Event]:
    """
    Generate concrete Event database model instances for every repeating occurrence
    over the academic semester (default 14 weeks).
    """
    series_id = str(uuid.uuid4())[:8]
    ref_ref = source_ref or f"recurrence:{series_id}"

    # Determine reference start date
    now_utc = datetime.now(timezone.utc)
    base_date = start_date.date() if isinstance(start_date, (datetime, date)) else now_utc.date()

    # Case 1: Predefined IITM Slot (e.g., Slot A, Slot B, etc.)
    slot_entries: List[Dict[str, Any]] = []
    normalized_slot = None
    if slot_name:
        for s_key in IITM_SLOTS:
            if s_key.lower() == slot_name.strip().lower() or s_key.split()[-1].lower() == slot_name.strip().lower():
                slot_entries = IITM_SLOTS[s_key]
                normalized_slot = s_key
                break

    if slot_entries:
        generated_events: List[Event] = []
        for entry in slot_entries:
            target_weekday = entry["weekday"]
            s_hr, s_mn = parse_time_str(entry["start_time"])
            e_hr, e_mn = parse_time_str(entry["end_time"])

            # Find the first upcoming occurrence of this weekday on or after base_date
            days_ahead = (target_weekday - base_date.weekday()) % 7
            first_date = base_date + timedelta(days=days_ahead)

            for week_idx in range(max(1, min(24, repeat_weeks))):
                event_date = first_date + timedelta(weeks=week_idx)
                start_dt = datetime.combine(event_date, time(s_hr, s_mn), tzinfo=timezone.utc)
                end_dt = datetime.combine(event_date, time(e_hr, e_mn), tzinfo=timezone.utc)

                item_summary = summary or f"Recurring {normalized_slot} academic session ({WEEKDAY_NAMES[target_weekday]})."
                ev = Event(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    source_type=source_type,
                    source_ref=ref_ref,
                    title=f"{title} ({normalized_slot})",
                    organizer=organizer or "IIT Madras Academic Slot",
                    category=category or "class",
                    start_time=start_dt,
                    end_time=end_dt,
                    venue=venue or "Department Classroom",
                    summary=item_summary,
                    is_hidden=False,
                )
                generated_events.append(ev)

        generated_events.sort(key=lambda e: e.start_time or now_utc)
        return generated_events

    # Case 2: Custom repeating weekdays (e.g. ["monday", "wednesday"])
    target_days = parse_days_input(days_of_week)
    if not target_days:
        # Default to today's weekday if none provided
        target_days = [base_date.weekday()]

    s_hr, s_mn = parse_time_str(start_time_of_day)
    e_hr, e_mn = parse_time_str(end_time_of_day) if end_time_of_day else (s_hr + 1, s_mn)

    generated_events: List[Event] = []
    repeat_weeks = max(1, min(26, repeat_weeks or 14))

    for target_weekday in target_days:
        days_ahead = (target_weekday - base_date.weekday()) % 7
        first_date = base_date + timedelta(days=days_ahead)

        for week_idx in range(repeat_weeks):
            event_date = first_date + timedelta(weeks=week_idx)
            start_dt = datetime.combine(event_date, time(s_hr, s_mn), tzinfo=timezone.utc)
            end_dt = datetime.combine(event_date, time(e_hr, e_mn), tzinfo=timezone.utc)

            item_summary = summary or f"Weekly {WEEKDAY_NAMES[target_weekday]} class session (Week {week_idx + 1} of {repeat_weeks})."
            ev = Event(
                id=str(uuid.uuid4()),
                user_id=user_id,
                source_type=source_type,
                source_ref=ref_ref,
                title=title,
                organizer=organizer,
                category=category or "class",
                start_time=start_dt,
                end_time=end_dt,
                venue=venue,
                summary=item_summary,
                is_hidden=False,
            )
            generated_events.append(ev)

    generated_events.sort(key=lambda e: e.start_time or now_utc)
    return generated_events

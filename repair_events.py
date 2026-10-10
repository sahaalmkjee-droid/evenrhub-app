"""
repair_events.py
Cleans up duplicate events in eventhub.db, removes non-event spam (Pinterest, surveys),
and applies the secondary rule-based extractor to properly set dates, categories, and venues.
"""
import sqlite3
import re
from datetime import datetime, timezone, timedelta
import dateutil.parser

def clean_database():
    con = sqlite3.connect("backend/eventhub.db")
    cur = con.cursor()

    cur.execute("SELECT id, title, summary, source_ref, user_id FROM events")
    rows = cur.fetchall()

    seen_titles = set()
    kept_count = 0
    deleted_count = 0

    ref_dt = datetime(2026, 10, 9, 12, 0, 0, tzinfo=timezone.utc)

    for rid, title, summary, sref, uid in rows:
        title = title or ""
        summary = summary or ""
        full_text = f"{title}\n{summary}"
        lower = full_text.lower()

        # 1. Drop noise/spam
        if any(noise in lower for noise in ["pinterest", "scoop of feedback", "cream stone", "survey", "rate your", "so on point"]):
            cur.execute("DELETE FROM events WHERE id = ?", (rid,))
            deleted_count += 1
            continue

        # 2. Deduplicate by normalized title
        norm_title = re.sub(r"[^\w\s]", "", title.lower()).strip()[:40]
        if norm_title in seen_titles:
            cur.execute("DELETE FROM events WHERE id = ?", (rid,))
            deleted_count += 1
            continue
        seen_titles.add(norm_title)

        # 3. Clean Title
        clean_title = re.sub(r"^(?:\[students announce\]\s*|subject:\s*|fwd:\s*|re:\s*)", "", title, flags=re.I).strip()
        if not clean_title:
            clean_title = title[:100]

        # 4. Extract Category
        if re.search(r"\b(trials?|probables|selection|sports?|tournament|hockey|cricket|football|badminton|athletics|edm|artist reveal|meditation)\b", lower):
            cat = "club"
        elif re.search(r"\b(placement|internship|recruitment|drive|hiring|job offer|pre-placement|oge|applications open|opportunity)\b", lower):
            cat = "recruitment"
        elif re.search(r"\b(hackathon|codeathon|ideathon|coding contest)\b", lower):
            cat = "hackathon"
        elif re.search(r"\b(workshop|bootcamp|hands-on|training session|masterclass|case club)\b", lower):
            cat = "workshop"
        elif re.search(r"\b(exams?|quizzes|quiz|midsem|endsem|viva|mid-term|final exam|hall ticket|mock test series)\b", lower):
            cat = "exam"
        elif re.search(r"\b(club|society|orientation|auditions?|meetup|cultural)\b", lower):
            cat = "club"
        elif re.search(r"\b(chemical engineering|thermodynamics|lecture|class|syllabus|moodle)\b", lower):
            cat = "class"
        else:
            cat = "other"

        # 5. Extract Time
        t_match = re.search(r"\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs|p\.m\.|a\.m\.))\b", full_text, re.I)
        t_str = "09:00 AM"
        if t_match:
            t_raw = t_match.group(1).replace("p.m.", "PM").replace("a.m.", "AM").replace("hrs", "")
            t_str = t_raw.strip()

        # 6. Extract Date from Body/Title
        start_iso = None
        d_match = re.search(r"\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s*,?\s*\d{4})?)\b", full_text, re.I)
        if not d_match:
            d_match = re.search(r"\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?)\b", full_text, re.I)
        if not d_match:
            d_match = re.search(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", full_text)

        if d_match:
            raw_d = re.sub(r"(st|nd|rd|th)", "", d_match.group(1), flags=re.I)
            if not re.search(r"\d{4}", raw_d):
                raw_d += f" {ref_dt.year}"
            try:
                parsed_dt = dateutil.parser.parse(f"{raw_d} {t_str}")
                start_iso = parsed_dt.strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                pass

        if not start_iso:
            if "sunday" in lower:
                # Coming Sunday relative to Oct 9 (Friday) is Oct 11
                start_iso = f"2026-10-11 10:00:00"
            elif "saturday" in lower or "tomorrow" in lower:
                start_iso = f"2026-10-10 10:00:00"
            elif "monday" in lower:
                start_iso = f"2026-10-12 10:00:00"

        # 7. Extract Venue
        venue = None
        v_match = re.search(r"(?:venue|location)\s*[:\-]\s*([^\n\r,\.]+)", full_text, re.I)
        if not v_match:
            v_match = re.search(r"(?:at|in)\s+(the\s+[A-Za-z0-9\s]+(?:Ground|Hall|Auditorium|Lab|Room|Stadium|Complex|Lawns|SAC|OAT))", full_text, re.I)
        if v_match:
            venue = v_match.group(1).strip()
        elif "himalaya lawns" in lower:
            venue = "Himalaya Lawns"
        elif "chemplast" in lower:
            venue = "Chemplast Ground"

        # Update record
        updates = ["title = ?", "category = ?"]
        params = [clean_title, cat]

        if start_iso:
            updates.append("start_time = ?")
            params.append(start_iso)
        if venue:
            updates.append("venue = ?")
            params.append(venue)

        params.append(rid)
        cur.execute(f"UPDATE events SET {', '.join(updates)} WHERE id = ?", params)
        kept_count += 1

    con.commit()
    con.close()
    print(f"Cleanup finished: Deleted {deleted_count} duplicates/spam. Updated {kept_count} valid events.")

if __name__ == "__main__":
    clean_database()

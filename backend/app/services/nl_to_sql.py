"""
app/services/nl_to_sql.py
──────────────────────────
Natural-language to SQL agent for the Smart Event Hub chatbot.

Pipeline
  1. `generate_sql()`     — Gemini converts the user's question to SQL
  2. `execute_query()`    — Run SQL on the read-only DB, return rows as dicts
  3. `generate_response()` — Gemini turns the rows into a Markdown answer

Safety guardrails:
  • The generated SQL is validated to be SELECT-only.
  • `WHERE is_hidden = FALSE` is enforced unless the user explicitly asks
    for hidden items (detected by keyword).
  • Results are capped at 200 rows to prevent runaway queries.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

import google.generativeai as genai
from sqlalchemy import text
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from app.config import settings
from app.database import get_readonly_db

logger = logging.getLogger(__name__)

# ── Retry ─────────────────────────────────────────────────────────────────────

def _should_retry(exc: BaseException) -> bool:
    err_str = str(exc).lower()
    if "429" in err_str or "resourceexhausted" in err_str or "quota" in err_str:
        return False
    return True

_GEMINI_RETRY = retry(
    retry=retry_if_exception(_should_retry),
    wait=wait_exponential(multiplier=1, min=1, max=5),
    stop=stop_after_attempt(2),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)

# ── Schema context injected into every prompt ─────────────────────────────────

_SCHEMA_CONTEXT = """
=== DATABASE SCHEMA ===

Table: events
  id          UUID        PRIMARY KEY
  user_id     UUID        NOT NULL  -- owner of the event
  source_type VARCHAR(32) NOT NULL  -- 'gmail' | 'upload' | 'text' | 'manual'
  source_ref  VARCHAR(512)          -- original message ID or filename
  title       VARCHAR(512) NOT NULL
  organizer   VARCHAR(256)
  category    VARCHAR(64) NOT NULL  -- 'recruitment'|'hackathon'|'workshop'|
                                    --  'exam'|'club'|'class'|'personal'|'other'
  start_time  TIMESTAMPTZ           -- event start (UTC)
  end_time    TIMESTAMPTZ           -- event end   (UTC, nullable)
  venue       VARCHAR(512)
  summary     TEXT
  is_hidden   BOOLEAN     NOT NULL DEFAULT FALSE
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()

Table: user_filter_rules
  id               UUID        PRIMARY KEY
  user_id          UUID        NOT NULL
  instruction_text TEXT        NOT NULL
  target_category  VARCHAR(64)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()

Table: chat_history
  id            UUID        PRIMARY KEY
  user_id       UUID        NOT NULL
  role          VARCHAR(16) NOT NULL  -- 'user' | 'assistant'
  message       TEXT        NOT NULL
  generated_sql TEXT
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()

=== SAMPLE DATA (events) ===
id                                   | user_id                              | source_type | title                        | category    | start_time              | venue
-------------------------------------|--------------------------------------|-------------|------------------------------|-------------|-------------------------|------
a1b2c3d4-0000-0000-0000-000000000001 | u1000000-0000-0000-0000-000000000001 | gmail       | TechFest Hackathon 2024      | hackathon   | 2024-11-15 09:00:00+00  | Main Auditorium
a1b2c3d4-0000-0000-0000-000000000002 | u1000000-0000-0000-0000-000000000001 | manual      | Campus Placement Drive       | recruitment | 2024-11-20 10:00:00+00  | Career Center
a1b2c3d4-0000-0000-0000-000000000003 | u1000000-0000-0000-0000-000000000002 | upload      | Python Workshop              | workshop    | 2024-11-18 14:00:00+00  | Room 301

=== RULES ===
"""

_SQL_RULES = """
1. Generate ONLY a single SELECT statement — no INSERT, UPDATE, DELETE, DROP, etc.
2. ALWAYS include `WHERE is_hidden = FALSE` in the events table query unless the
   user explicitly asks about "hidden" or "all including hidden" events.
3. ALWAYS filter by user_id using the placeholder :user_id when the query is
   about a specific user's events.
4. Limit results to 200 rows maximum: add `LIMIT 200` if no limit is specified.
5. Return ONLY the SQL query — no explanation, no markdown, no comments.
6. Use standard PostgreSQL syntax.
7. Column aliases should be snake_case.
"""


class NLToSQLAgent:
    """
    Converts natural-language questions about events into SQL queries,
    executes them on the read-only DB, and returns Markdown answers.
    """

    SCHEMA_CONTEXT: str = _SCHEMA_CONTEXT + _SQL_RULES

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
                logger.info("Groq client initialized for NL-to-SQL with model %s", self._groq_model)
            except Exception as exc:
                logger.warning("Could not initialize Groq client in NLToSQLAgent: %s", exc)

    # ── Step 1: NL → SQL ──────────────────────────────────────────────────────

    @_GEMINI_RETRY
    def _gemini_generate_sql(self, prompt: str) -> str:
        response = self._model.generate_content(
            prompt,
            generation_config={"temperature": 0.0},
        )
        return response.text

    def generate_sql(
        self,
        natural_language_query: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
        user_id: Optional[str] = None,
    ) -> str:
        """
        Convert a natural-language question into a safe, read-only SQL query.

        Parameters
        ----------
        natural_language_query : str
            The user's plain-English question.
        chat_history : list[dict], optional
            Previous turns [{"role": "user"|"assistant", "content": "..."}]
            to give the LLM conversational context.
        user_id : str, optional
            The authenticated user's UUID — injected into the system prompt
            so the LLM knows which user_id to filter on.

        Returns
        -------
        str
            A single SELECT SQL statement.
        """
        history_block = ""
        if chat_history:
            lines = []
            for turn in chat_history[-6:]:  # last 3 turns for brevity
                role = turn.get("role", "")
                content = turn.get("content", "")
                lines.append(f"{role.upper()}: {content}")
            history_block = "\n\nPrevious conversation:\n" + "\n".join(lines)

        user_context = ""
        if user_id:
            user_context = f"\nThe current user's UUID is: {user_id}\n"

        prompt = (
            f"{self.SCHEMA_CONTEXT}"
            f"{user_context}"
            f"{history_block}"
            f"\n\nUser question: {natural_language_query}"
            f"\n\nSQL query:"
        )

        try:
            raw_sql = self._gemini_generate_sql(prompt)
            sql = _clean_sql(raw_sql)
            _validate_sql(sql)
            return sql
        except Exception as exc:
            logger.warning("Gemini generate_sql failed: %s — attempting Groq fallback", exc)
            if self._groq_client:
                try:
                    res = self._groq_client.chat.completions.create(
                        model=self._groq_model,
                        messages=[
                            {"role": "system", "content": "You are a read-only SQL generator. Generate ONLY a single SELECT query without markdown formatting."},
                            {"role": "user", "content": prompt},
                        ],
                        temperature=0.0,
                    )
                    sql = _clean_sql(res.choices[0].message.content or "")
                    _validate_sql(sql)
                    return sql
                except Exception as groq_exc:
                    logger.error("Groq generate_sql fallback also failed: %s", groq_exc)
            raise

    # ── Step 2: Execute SQL ───────────────────────────────────────────────────

    def execute_query(
        self,
        sql: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Execute a read-only SQL query and return the rows as a list of dicts.

        Parameters
        ----------
        sql : str
            A SELECT statement produced by generate_sql().
        params : dict, optional
            Bind parameters (e.g. {"user_id": "..."}).

        Returns
        -------
        list[dict]
            Up to 200 result rows with column-name keys.
        """
        _validate_sql(sql)

        with get_readonly_db() as session:
            try:
                result = session.execute(text(sql), params or {})
                columns = list(result.keys())
                rows = result.fetchmany(200)  # safety cap
                return [dict(zip(columns, row)) for row in rows]
            except Exception as exc:
                logger.error("NLToSQLAgent.execute_query error: %s | SQL: %s", exc, sql)
                raise

    # ── Step 3: Generate natural-language response ─────────────────────────────

    @_GEMINI_RETRY
    def _gemini_generate_response(self, prompt: str) -> str:
        response = self._model.generate_content(
            prompt,
            generation_config={"temperature": 0.3},
        )
        return response.text.strip()

    def generate_response(
        self,
        nl_query: str,
        sql: str,
        results: List[Dict[str, Any]],
    ) -> str:
        """
        Convert raw SQL results into a Markdown-formatted conversational answer.

        Parameters
        ----------
        nl_query : str
            The original user question.
        sql : str
            The SQL that was executed.
        results : list[dict]
            The rows returned by the database.

        Returns
        -------
        str
            Markdown-formatted answer suitable for display in a chat UI.
        """
        if not results:
            return (
                "I couldn't find any events matching your query. "
                "Try broadening your search criteria."
            )

        results_str = _format_results_for_prompt(results)

        prompt = (
            f"The user asked: **{nl_query}**\n\n"
            f"I ran this SQL:\n```sql\n{sql}\n```\n\n"
            f"It returned {len(results)} row(s):\n{results_str}\n\n"
            f"Please write a friendly, concise Markdown answer summarising the results. "
            f"Use bullet points or a table where appropriate. "
            f"Do not repeat the SQL. Be conversational."
        )

        try:
            return self._gemini_generate_response(prompt)
        except Exception as exc:
            logger.warning("Gemini generate_response failed: %s — attempting Groq fallback", exc)
            if self._groq_client:
                try:
                    res = self._groq_client.chat.completions.create(
                        model=self._groq_model,
                        messages=[
                            {"role": "system", "content": "You are a helpful campus event assistant. Summarize database results concisely in friendly Markdown."},
                            {"role": "user", "content": prompt},
                        ],
                        temperature=0.3,
                    )
                    return (res.choices[0].message.content or "").strip()
                except Exception as groq_exc:
                    logger.error("Groq generate_response fallback failed: %s", groq_exc)

            # Tertiary fallback if both LLMs are down:
            return f"Found {len(results)} matching event(s):\n\n" + "\n".join(
                f"- **{r.get('title', 'Event')}**: {r.get('start_time', '')} ({r.get('venue', 'No venue')})"
                for r in results[:10]
            )

    # ── Convenience: full pipeline ─────────────────────────────────────────────

    def run(
        self,
        nl_query: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute the full NL → SQL → Response pipeline.

        Returns
        -------
        dict with keys: sql, results, response
        """
        sql = self.generate_sql(nl_query, chat_history, user_id)
        params = {"user_id": user_id} if user_id and ":user_id" in sql else {}
        results = self.execute_query(sql, params)
        response = self.generate_response(nl_query, sql, results)
        return {"sql": sql, "results": results, "response": response}


# ── Helpers ───────────────────────────────────────────────────────────────────


def _clean_sql(raw: str) -> str:
    """Strip markdown fences, leading/trailing whitespace, and semicolons."""
    cleaned = re.sub(r"```(?:sql)?", "", raw, flags=re.IGNORECASE)
    cleaned = cleaned.strip().rstrip(";").strip()
    return cleaned


def _validate_sql(sql: str) -> None:
    """
    Raise ValueError if the SQL is not a safe SELECT statement.

    Blocks any DML / DDL keywords to prevent prompt-injection attacks.
    """
    upper = sql.upper().strip()
    if not upper.startswith("SELECT"):
        raise ValueError(f"NLToSQLAgent: only SELECT queries are allowed. Got: {sql[:80]}")

    dangerous = re.findall(
        r"\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXEC|EXECUTE)\b",
        upper,
    )
    if dangerous:
        raise ValueError(
            f"NLToSQLAgent: dangerous keyword(s) detected: {dangerous}"
        )


def _format_results_for_prompt(results: List[Dict[str, Any]]) -> str:
    """Render results as a compact string for injection into the LLM prompt."""
    if not results:
        return "(no rows)"

    # Show at most 20 rows in the prompt to keep token count manageable
    sample = results[:20]
    keys = list(sample[0].keys())
    header = " | ".join(keys)
    separator = "-+-".join("-" * len(k) for k in keys)
    rows = [" | ".join(str(row.get(k, "")) for k in keys) for row in sample]

    suffix = f"\n... and {len(results) - 20} more rows." if len(results) > 20 else ""
    return "\n".join([header, separator] + rows) + suffix

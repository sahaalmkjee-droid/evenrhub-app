"""
app/models/models.py
────────────────────
SQLAlchemy 2.0-style ORM models for Smart Event Hub.

Tables
  • events            — parsed/extracted events
  • user_filter_rules — user-defined NL filter instructions
  • chat_history       — NL-to-SQL conversation log
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    """Generate a new UUID4 string (used as default for PK columns)."""
    return str(uuid.uuid4())


# ──────────────────────────────────────────────────────────────────────────────
# Event
# ──────────────────────────────────────────────────────────────────────────────


class Event(Base):
    """
    Represents a single extracted or manually entered event.

    source_type  — where the event came from: 'gmail' | 'upload' | 'text' | 'manual'
    source_ref   — unique reference in the source system (e.g. Gmail message ID)
    category     — one of: recruitment | hackathon | workshop | exam | club |
                           class | personal | other
    is_hidden    — soft-delete / filter flag; hidden events are excluded from
                   default list views
    """

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=_uuid,
        comment="Primary key (UUID v4)",
    )
    user_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
        comment="Owner user identifier",
    )
    source_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        comment="Ingestion source: gmail | upload | text | manual",
    )
    source_ref: Mapped[Optional[str]] = mapped_column(
        String(512),
        nullable=True,
        comment="External reference (e.g. Gmail message ID, filename)",
    )
    title: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
        comment="Event title extracted by LLM",
    )
    organizer: Mapped[Optional[str]] = mapped_column(
        String(256),
        nullable=True,
        comment="Organizer name / club / department",
    )
    category: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="other",
        index=True,
        comment="Event category",
    )
    start_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
        comment="Event start date/time (timezone-aware)",
    )
    end_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Event end date/time (nullable)",
    )
    venue: Mapped[Optional[str]] = mapped_column(
        String(512),
        nullable=True,
        comment="Location / venue string",
    )
    summary: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="2-sentence LLM-generated summary",
    )
    is_hidden: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        index=True,
        comment="True → excluded from default views (soft-delete / filtered)",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        comment="Row creation timestamp",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Event id={self.id!r} title={self.title!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# UserFilterRule
# ──────────────────────────────────────────────────────────────────────────────


class UserFilterRule(Base):
    """
    A user-defined NL filter rule.

    When a new rule is saved the background task `apply_filter_rules` re-evaluates
    all events for that user and updates `is_hidden` accordingly.

    instruction_text  — plain-English rule, e.g. "hide all recruitment emails"
    target_category   — optional shortcut to target a specific category directly
    """

    __tablename__ = "user_filter_rules"

    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=_uuid,
    )
    user_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )
    instruction_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Natural-language filter instruction from the user",
    )
    target_category: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        comment="Optional explicit category to target (overrides LLM interpretation)",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<UserFilterRule id={self.id!r} user={self.user_id!r}>"


# ──────────────────────────────────────────────────────────────────────────────
# ChatHistory
# ──────────────────────────────────────────────────────────────────────────────


class ChatHistory(Base):
    """
    Stores the NL-to-SQL conversation turns for each user.

    role           — 'user' or 'assistant'
    message        — the natural-language message or response
    generated_sql  — the SQL generated by the NLToSQLAgent (assistant turns only)
    """

    __tablename__ = "chat_history"

    id: Mapped[str] = mapped_column(
        String(64),
        primary_key=True,
        default=_uuid,
    )
    user_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        comment="'user' or 'assistant'",
    )
    message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    generated_sql: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="SQL produced by the NL-to-SQL agent (only present on assistant turns)",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ChatHistory id={self.id!r} role={self.role!r}>"

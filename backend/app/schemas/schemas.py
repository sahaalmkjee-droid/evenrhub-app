"""
app/schemas/schemas.py
──────────────────────
Pydantic v2 request / response schemas for Smart Event Hub.

Organized into sections:
  • Event schemas
  • Filter rule schemas
  • Chat schemas
  • Ingestion schemas
  • Job / status schemas
  • LLM extraction schemas
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ──────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ──────────────────────────────────────────────────────────────────────────────

VALID_CATEGORIES = frozenset(
    {"recruitment", "hackathon", "workshop", "exam", "club", "class", "personal", "other"}
)
VALID_SOURCE_TYPES = frozenset({"gmail", "upload", "text", "manual"})


class _OrmBase(BaseModel):
    """All response models inherit from this to enable ORM mode."""
    model_config = ConfigDict(from_attributes=True)


# ──────────────────────────────────────────────────────────────────────────────
# Event schemas
# ──────────────────────────────────────────────────────────────────────────────


class EventCreate(BaseModel):
    """Payload for manually creating an event."""

    user_id: str = Field(..., description="Owner user UUID")
    source_type: str = Field("manual", description="Ingestion source")
    source_ref: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=512)
    organizer: Optional[str] = Field(None, max_length=256)
    category: str = Field("other", description="Must be one of the valid categories")
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    venue: Optional[str] = Field(None, max_length=512)
    summary: Optional[str] = None
    is_hidden: bool = False

    @field_validator("category")
    @classmethod
    def _validate_category(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError(f"category must be one of {sorted(VALID_CATEGORIES)}")
        return v

    @field_validator("source_type")
    @classmethod
    def _validate_source_type(cls, v: str) -> str:
        if v not in VALID_SOURCE_TYPES:
            raise ValueError(f"source_type must be one of {sorted(VALID_SOURCE_TYPES)}")
        return v


class EventUpdate(BaseModel):
    """Partial update payload — all fields optional."""

    title: Optional[str] = Field(None, min_length=1, max_length=512)
    organizer: Optional[str] = Field(None, max_length=256)
    category: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    venue: Optional[str] = Field(None, max_length=512)
    summary: Optional[str] = None
    is_hidden: Optional[bool] = None

    @field_validator("category")
    @classmethod
    def _validate_category(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_CATEGORIES:
            raise ValueError(f"category must be one of {sorted(VALID_CATEGORIES)}")
        return v


class EventResponse(_OrmBase):
    """Full event representation returned by the API."""

    id: str
    user_id: str
    source_type: str
    source_ref: Optional[str] = None
    title: str
    organizer: Optional[str] = None
    category: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    venue: Optional[str] = None
    summary: Optional[str] = None
    is_hidden: bool
    created_at: datetime


class EventListResponse(BaseModel):
    """Paginated list of events."""

    items: List[EventResponse]
    total: int
    page: int = 1
    page_size: int = 50
    has_more: bool = False


# ──────────────────────────────────────────────────────────────────────────────
# User filter rule schemas
# ──────────────────────────────────────────────────────────────────────────────


class UserFilterRuleCreate(BaseModel):
    """Payload to create a new filter rule."""

    user_id: str = Field(..., description="Owner user UUID")
    instruction_text: str = Field(
        ..., min_length=5, description="NL filter instruction"
    )
    target_category: Optional[str] = Field(
        None, description="Optional explicit category override"
    )

    @field_validator("target_category")
    @classmethod
    def _validate_category(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_CATEGORIES:
            raise ValueError(f"target_category must be one of {sorted(VALID_CATEGORIES)}")
        return v


class UserFilterRuleResponse(_OrmBase):
    """Filter rule representation returned by the API."""

    id: str
    user_id: str
    instruction_text: str
    target_category: Optional[str] = None
    created_at: datetime


# ──────────────────────────────────────────────────────────────────────────────
# Chat schemas
# ──────────────────────────────────────────────────────────────────────────────


class ChatMessageRequest(BaseModel):
    """Request to send a message to the NL-to-SQL chatbot."""

    user_id: str = Field(..., description="User UUID")
    message: str = Field(..., min_length=1, description="Natural-language query")


class ChatMessageResponse(BaseModel):
    """Response from the NL-to-SQL chatbot."""

    response: str = Field(..., description="Markdown-formatted assistant answer")
    sql: Optional[str] = Field(None, description="Generated SQL query")
    results: Optional[List[Dict[str, Any]]] = Field(
        None, description="Raw query results"
    )


class ChatHistoryItem(_OrmBase):
    """Single turn in the chat history."""

    id: str
    user_id: str
    role: str
    message: str
    generated_sql: Optional[str] = None
    created_at: datetime


# ──────────────────────────────────────────────────────────────────────────────
# Ingestion schemas
# ──────────────────────────────────────────────────────────────────────────────


class IngestEmailRequest(BaseModel):
    """Trigger Gmail sync for a user."""

    user_id: str
    access_token: str = Field(..., description="Gmail OAuth2 access token")
    max_results: int = Field(50, ge=1, le=500)


class IngestTextRequest(BaseModel):
    """Paste / raw-text ingestion."""

    user_id: str
    content: str = Field(..., min_length=10, description="Raw text to extract events from")
    reference_timestamp: Optional[str] = Field(
        None, description="ISO8601 timestamp used for temporal grounding"
    )


class IngestManualRequest(BaseModel):
    """Direct manual event creation — identical to EventCreate."""

    user_id: str
    title: str = Field(..., min_length=1, max_length=512)
    organizer: Optional[str] = None
    category: str = "other"
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    venue: Optional[str] = None
    summary: Optional[str] = None

    @field_validator("category")
    @classmethod
    def _validate_category(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError(f"category must be one of {sorted(VALID_CATEGORIES)}")
        return v


class IngestResponse(BaseModel):
    """Generic ingestion acknowledgement."""

    job_id: Optional[str] = Field(None, description="Celery task ID for status polling")
    message: str = Field(..., description="Human-readable status message")
    events_created: Optional[int] = Field(
        None, description="Number of events created (synchronous ingestion only)"
    )


# ──────────────────────────────────────────────────────────────────────────────
# Job / status schemas
# ──────────────────────────────────────────────────────────────────────────────


class JobStatusResponse(BaseModel):
    """Celery task status envelope."""

    job_id: str
    status: str = Field(
        ...,
        description="PENDING | STARTED | PROGRESS | SUCCESS | FAILURE | REVOKED",
    )
    progress: Optional[int] = Field(None, ge=0, le=100, description="Completion %")
    message: Optional[str] = None
    result: Optional[Any] = None
    error: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# LLM Extraction schemas
# ──────────────────────────────────────────────────────────────────────────────


class ExtractionResult(BaseModel):
    """
    Single event extracted by the LLM.
    Matches the JSON schema injected into every extraction prompt.
    """

    title: str
    organizer: Optional[str] = None
    category: str = "other"
    start_time: Optional[str] = Field(
        None, description="ISO8601 datetime string or null"
    )
    end_time: Optional[str] = Field(
        None, description="ISO8601 datetime string or null"
    )
    venue: Optional[str] = None
    summary: Optional[str] = Field(None, description="Max 2-sentence summary")

    @field_validator("category")
    @classmethod
    def _validate_category(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            return "other"
        return v


class ExtractionResponse(BaseModel):
    """Wrapper returned by extraction endpoints."""

    events: List[ExtractionResult]
    source_type: str
    total_extracted: int

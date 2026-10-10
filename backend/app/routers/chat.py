"""
app/routers/chat.py
───────────────────
Chatbot router — /api/chat

Endpoints
  POST   /              Send a message to the NL-to-SQL chatbot
  GET    /history       Get paginated chat history for the user
  DELETE /history       Clear chat history for the user
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import ChatHistory
from app.schemas.schemas import ChatMessageResponse
from app.services.nl_to_sql import NLToSQLAgent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["Chat"])

DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"


class ChatInputPayload(BaseModel):
    message: str = Field(..., min_length=1, description="Natural-language query")
    user_id: Optional[str] = Field(None, description="Optional user UUID")


class ChatHistoryOutput(BaseModel):
    id: str
    user_id: str
    role: str
    message: str
    generated_sql: Optional[str] = None
    created_at: Any

    class Config:
        from_attributes = True


# Lazy-initialised agent singleton
_agent_instance: Optional[NLToSQLAgent] = None


def get_agent() -> NLToSQLAgent:
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = NLToSQLAgent()
    return _agent_instance


@router.post("", response_model=ChatMessageResponse, summary="Send message to chatbot")
@router.post("/", response_model=ChatMessageResponse, include_in_schema=False)
async def send_chat_message(
    payload: ChatInputPayload,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db),
) -> ChatMessageResponse:
    """
    Accept user query, convert NL to SQL via Gemini, execute query against
    the read-only database, synthesize conversational response, and persist history.
    """
    user_id = payload.user_id or x_user_id or DEFAULT_USER_ID

    # 1. Fetch recent conversation turns for context
    stmt = (
        select(ChatHistory)
        .where(ChatHistory.user_id == user_id)
        .order_by(ChatHistory.created_at.desc())
        .limit(6)
    )
    result = await db.execute(stmt)
    recent_records = result.scalars().all()
    recent_records.reverse()

    history_context = [
        {"role": r.role, "content": r.message} for r in recent_records
    ]

    # Save user message to database
    user_chat_entry = ChatHistory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        role="user",
        message=payload.message,
        generated_sql=None,
    )
    db.add(user_chat_entry)
    await db.flush()

    # 2. NL-to-SQL processing
    generated_sql: Optional[str] = None
    query_results: List[Dict[str, Any]] = []
    assistant_reply: str = ""

    try:
        agent = get_agent()
        generated_sql = agent.generate_sql(
            natural_language_query=payload.message,
            chat_history=history_context,
            user_id=user_id,
        )
        query_results = agent.execute_query(generated_sql, params={"user_id": user_id})
        assistant_reply = agent.generate_response(
            nl_query=payload.message,
            sql=generated_sql,
            results=query_results,
        )
    except Exception as exc:
        logger.warning("NLToSQL agent generation failed (%s), using intelligent fallback", exc)
        # Fallback query matching keywords safely
        clean_msg = payload.message.replace("'", "''").strip()
        generated_sql = (
            f"SELECT id, title, organizer, category, start_time, end_time, venue, summary "
            f"FROM events WHERE user_id = '{user_id}' AND is_hidden = FALSE "
            f"AND (title ILIKE '%{clean_msg}%' OR summary ILIKE '%{clean_msg}%' OR category ILIKE '%{clean_msg}%') "
            f"ORDER BY start_time ASC LIMIT 20;"
        )
        try:
            agent = get_agent()
            query_results = agent.execute_query(generated_sql)
        except Exception:
            query_results = []

        if query_results:
            event_items = "\n".join(
                [f"- **{r.get('title')}** ({r.get('category')}): {r.get('summary', 'No summary')} at {r.get('venue', 'TBD')}" for r in query_results]
            )
            assistant_reply = f"Here are the matching events found:\n\n{event_items}"
        else:
            assistant_reply = (
                f"I checked the database for '{payload.message}', but found no matching visible events. "
                f"You can try checking the Timeline or Calendar view to browse all scheduled entries."
            )

    # Save assistant turn to database
    assistant_chat_entry = ChatHistory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        role="assistant",
        message=assistant_reply,
        generated_sql=generated_sql,
    )
    db.add(assistant_chat_entry)
    await db.commit()

    return ChatMessageResponse(
        response=assistant_reply,
        sql=generated_sql,
        results=query_results,
    )


@router.get("/history", response_model=List[ChatHistoryOutput], summary="Get chat history")
async def get_chat_history(
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> List[ChatHistoryOutput]:
    """Retrieve chat history for the user ordered chronologically."""
    target_user_id = user_id or x_user_id or DEFAULT_USER_ID

    stmt = (
        select(ChatHistory)
        .where(ChatHistory.user_id == target_user_id)
        .order_by(ChatHistory.created_at.asc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    records = result.scalars().all()

    return [ChatHistoryOutput.model_validate(r) for r in records]


@router.delete("/history", summary="Clear chat history")
async def clear_chat_history(
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, str]:
    """Delete all chat history records for the user."""
    target_user_id = user_id or x_user_id or DEFAULT_USER_ID

    stmt = delete(ChatHistory).where(ChatHistory.user_id == target_user_id)
    await db.execute(stmt)
    await db.commit()

    return {"message": "Chat history cleared successfully."}

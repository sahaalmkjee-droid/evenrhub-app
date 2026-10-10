"""
app/routers/filters.py
──────────────────────
Filter rules router — /api/filters

Endpoints
  GET    /              List all filter rules for the user
  POST   /              Create a new natural language filter rule
  DELETE /{rule_id}     Delete a filter rule by ID
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import UserFilterRule
from app.workers.tasks import apply_filter_rules

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/filters", tags=["Filter Rules"])

DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"


class FilterRuleCreatePayload(BaseModel):
    instruction: Optional[str] = Field(None, description="Natural language filter instruction")
    instruction_text: Optional[str] = Field(None, description="Alternative field for instruction")
    category: Optional[str] = Field(None, description="Category filter override")
    target_category: Optional[str] = Field(None, description="Alternative field for category")
    user_id: Optional[str] = Field(None, description="User UUID")


class FilterRuleOutput(BaseModel):
    id: str
    user_id: str
    instruction: str
    instruction_text: str
    category: Optional[str] = None
    target_category: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=List[FilterRuleOutput], summary="List filter rules")
@router.get("/", response_model=List[FilterRuleOutput], include_in_schema=False)
async def list_rules(
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db),
) -> List[FilterRuleOutput]:
    """Retrieve all active filter rules for the user."""
    target_user_id = user_id or x_user_id or DEFAULT_USER_ID

    stmt = (
        select(UserFilterRule)
        .where(UserFilterRule.user_id == target_user_id)
        .order_by(UserFilterRule.created_at.desc())
    )
    result = await db.execute(stmt)
    records = result.scalars().all()

    return [
        FilterRuleOutput(
            id=r.id,
            user_id=r.user_id,
            instruction=r.instruction_text,
            instruction_text=r.instruction_text,
            category=r.target_category,
            target_category=r.target_category,
            created_at=r.created_at,
        )
        for r in records
    ]


@router.post("", response_model=FilterRuleOutput, status_code=status.HTTP_201_CREATED, summary="Create filter rule")
@router.post("/", response_model=FilterRuleOutput, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_rule(
    payload: FilterRuleCreatePayload,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db),
) -> FilterRuleOutput:
    """
    Create a new negative/positive filtering rule and asynchronously trigger
    re-evaluation of events for this user.
    """
    target_user_id = payload.user_id or x_user_id or DEFAULT_USER_ID
    instruction = payload.instruction or payload.instruction_text
    category = payload.category or payload.target_category

    if not instruction or not instruction.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="instruction is required",
        )

    rule = UserFilterRule(
        id=str(uuid.uuid4()),
        user_id=target_user_id,
        instruction_text=instruction.strip(),
        target_category=category.strip() if category else None,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)

    # Trigger Celery task to re-evaluate events against new filter rule
    try:
        apply_filter_rules.delay(target_user_id)
    except Exception as exc:
        logger.warning("Could not dispatch apply_filter_rules task: %s", exc)

    return FilterRuleOutput(
        id=rule.id,
        user_id=rule.user_id,
        instruction=rule.instruction_text,
        instruction_text=rule.instruction_text,
        category=rule.target_category,
        target_category=rule.target_category,
        created_at=rule.created_at,
    )


@router.delete("/{rule_id}", summary="Delete filter rule")
async def delete_rule(
    rule_id: str,
    user_id: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, str]:
    """Delete a filter rule and re-evaluate events."""
    target_user_id = user_id or x_user_id or DEFAULT_USER_ID

    stmt = select(UserFilterRule).where(UserFilterRule.id == rule_id)
    result = await db.execute(stmt)
    rule = result.scalar_one_or_none()

    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Filter rule {rule_id!r} not found",
        )

    await db.delete(rule)
    await db.commit()

    # Re-evaluate remaining rules on events
    try:
        apply_filter_rules.delay(target_user_id)
    except Exception as exc:
        logger.warning("Could not dispatch apply_filter_rules task: %s", exc)

    return {"message": "Filter rule removed successfully"}

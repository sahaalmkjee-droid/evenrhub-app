"""
app/main.py
───────────
FastAPI application entry point for Distributed Smart Event Hub.

Configures:
  • CORS middleware
  • Lifespan startup/shutdown routines
  • Routers: events, ingest, chat, filters
  • Healthcheck and system status endpoints
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, Optional

from fastapi import Depends, FastAPI, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import Base, async_engine, get_db
from app.models.models import Event, UserFilterRule
from app.routers import chat, events, filters, ingest

logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("smart-event-hub")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle manager."""
    logger.info("Starting up Smart Event Hub backend...")
    # Attempt to auto-create schema tables if not initialized
    try:
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables initialized successfully.")
    except Exception as exc:
        logger.warning("Could not auto-create database tables on startup: %s", exc)

    yield

    logger.info("Shutting down Smart Event Hub backend...")
    await async_engine.dispose()


app = FastAPI(
    title="Smart Event Hub API",
    description=(
        "Distributed, privacy-first event aggregator prototype backend with "
        "hybrid filtering pipeline (Regex + Privacy SLM + Multimodal LLM Extraction) "
        "and read-only NL-to-SQL Assistant."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS Middleware ───────────────────────────────────────────────────────────
origins = getattr(settings, "CORS_ORIGINS", [])
if not origins or "*" in origins:
    allow_origins = ["*"]
else:
    allow_origins = list(origins) + [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Include Routers ───────────────────────────────────────────────────────────
app.include_router(events.router)
app.include_router(ingest.router)
app.include_router(chat.router)
app.include_router(filters.router)


@app.get("/auth/gmail/callback", include_in_schema=False)
async def auth_gmail_callback_alias(request: Request):
    """Fallback alias for backwards compatibility if user configured /auth/gmail/callback."""
    query_str = str(request.url.query)
    target_url = f"/api/ingest/gmail/callback?{query_str}" if query_str else "/api/ingest/gmail/callback"
    return RedirectResponse(url=target_url, status_code=307)


# ── Auth Endpoints ────────────────────────────────────────────────────────────


@app.get("/api/auth/me", summary="Get active user session")
async def get_current_user(x_user_id: Optional[str] = Header(None, alias="X-User-Id")) -> Dict[str, Any]:
    """Return user profile for student or developer."""
    uid = x_user_id or "00000000-0000-0000-0000-000000000001"
    from app.routers.ingest import _in_memory_auth

    email = "developer@eventhub.local"
    role = "developer"
    name = "Demo Developer"

    if uid in _in_memory_auth:
        email = _in_memory_auth[uid].get("email", email)
        role = "student"
        name = "Student User"

    return {
        "id": uid,
        "email": email,
        "name": name,
        "role": role,
    }


@app.post("/api/auth/demo-login", summary="Developer demo 1-click login")
async def demo_login() -> Dict[str, Any]:
    """Instant login endpoint for developer and sandbox testing."""
    return {
        "id": "00000000-0000-0000-0000-000000000001",
        "email": "developer@eventhub.local",
        "name": "Demo Developer",
        "role": "developer",
    }


# ── Root & Health Endpoints ───────────────────────────────────────────────────


@app.get("/", summary="Root endpoint")
async def root() -> Dict[str, Any]:
    """Root info endpoint."""
    return {
        "service": "Smart Event Hub API",
        "status": "online",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health", summary="Health check")
@app.get("/api/health", summary="Health check alias")
async def health_check() -> Dict[str, Any]:
    """System health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "smart-event-hub-api",
    }


@app.get("/api/stats", summary="Get system and event statistics")
async def get_stats(
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Return overview statistics:
      • Total events count
      • Breakdown of events by category
      • Count of upcoming events in the next 7 days
    """
    now = datetime.now(timezone.utc)

    # Total events
    total_res = await db.execute(
        select(func.count(Event.id)).where(Event.is_hidden.is_(False))
    )
    total_events = total_res.scalar_one() or 0

    # Category counts
    cat_stmt = (
        select(Event.category, func.count(Event.id))
        .where(Event.is_hidden.is_(False))
        .group_by(Event.category)
    )
    cat_res = await db.execute(cat_stmt)
    categories = {cat: count for cat, count in cat_res.all()}

    # Upcoming count
    upcoming_stmt = select(func.count(Event.id)).where(
        Event.is_hidden.is_(False),
        Event.start_time >= now,
    )
    upcoming_res = await db.execute(upcoming_stmt)
    upcoming_events = upcoming_res.scalar_one() or 0

    return {
        "total_events": total_events,
        "upcoming_events": upcoming_events,
        "categories": categories,
    }

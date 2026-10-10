"""
app/database.py
───────────────
Database engine and session factories for Smart Event Hub.

Engines
  • async_engine          — async read/write (asyncpg or aiosqlite fallback) used by FastAPI routes
  • sync_engine           — sync read/write (psycopg2 or sqlite fallback) used by Celery tasks
  • readonly_sync_engine  — sync read-only (psycopg2 or sqlite fallback) used by NL-to-SQL agent

Session factories
  • AsyncSessionLocal     — yields an AsyncSession
  • get_db()             — FastAPI dependency (async)
  • get_readonly_db()    — plain function returning a sync Session (for chatbot)
"""

from __future__ import annotations

import logging
import os
import socket
from contextlib import contextmanager
from typing import AsyncGenerator, Generator
from urllib.parse import urlparse

from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)


# ── Declarative Base ──────────────────────────────────────────────────────────


class Base(DeclarativeBase):
    """Shared declarative base for all SQLAlchemy ORM models."""
    pass


# ── Detect if Postgres host is resolvable / reachable ─────────────────────────


def _can_resolve_postgres(url: str) -> bool:
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname
        if not hostname:
            return False
        # Try DNS resolution
        socket.gethostbyname(hostname)
        return True
    except Exception:
        return False


_use_postgres = _can_resolve_postgres(settings.DATABASE_URL)

if _use_postgres:
    logger.info("Using PostgreSQL configuration: %s", settings.DATABASE_URL)
    _async_url = settings.DATABASE_URL
    _sync_url = settings.DATABASE_URL_SYNC
    _readonly_url = settings.READONLY_DATABASE_URL
    _async_kwargs = {
        "echo": False,
        "pool_size": 10,
        "max_overflow": 20,
        "pool_pre_ping": True,
        "pool_recycle": 3600,
    }
    _sync_kwargs = {
        "echo": False,
        "pool_size": 10,
        "max_overflow": 5,
        "pool_pre_ping": True,
        "pool_recycle": 1800,
    }
    _ro_kwargs = {
        "echo": False,
        "pool_size": 5,
        "max_overflow": 2,
        "pool_pre_ping": True,
        "pool_recycle": 1800,
        "connect_args": {"options": "-c default_transaction_read_only=on"},
    }
else:
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "eventhub.db"))
    logger.info("PostgreSQL host not resolvable on host system; falling back to SQLite: %s", db_path)
    _async_url = f"sqlite+aiosqlite:///{db_path}"
    _sync_url = f"sqlite:///{db_path}"
    _readonly_url = f"sqlite:///{db_path}"
    _async_kwargs = {"echo": False}
    _sync_kwargs = {"echo": False, "connect_args": {"check_same_thread": False}}
    _ro_kwargs = {"echo": False, "connect_args": {"check_same_thread": False}}

# ── Engines ───────────────────────────────────────────────────────────────────

async_engine = create_async_engine(_async_url, **_async_kwargs)

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

sync_engine = create_engine(_sync_url, **_sync_kwargs)

SyncSessionLocal: sessionmaker[Session] = sessionmaker(
    bind=sync_engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

readonly_sync_engine = create_engine(_readonly_url, **_ro_kwargs)

ReadonlySessionLocal: sessionmaker[Session] = sessionmaker(
    bind=readonly_sync_engine,
    autocommit=False,
    autoflush=False,
)


# ── FastAPI Dependency — async session ────────────────────────────────────────


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── NL-to-SQL helper — sync readonly session ──────────────────────────────────


@contextmanager
def get_readonly_db() -> Generator[Session, None, None]:
    """Context manager yielding a sync Session against the read-only engine."""
    session = ReadonlySessionLocal()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def get_sync_db() -> Generator[Session, None, None]:
    """Context manager yielding a sync Session against the primary sync engine."""
    session = SyncSessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


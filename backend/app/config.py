"""
app/config.py
─────────────
Clean, central settings management for Smart Event Hub.
Loads configuration from root .env or environment variables.
"""

from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application-wide settings."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database (Auto-falls back to SQLite locally if PostgreSQL is absent) ───
    DATABASE_URL: str = Field(
        default="sqlite+aiosqlite:///eventhub.db",
        description="Async database connection string",
    )
    DATABASE_URL_SYNC: str = Field(
        default="sqlite:///eventhub.db",
        description="Sync database connection string",
    )
    READONLY_DATABASE_URL: str = Field(
        default="sqlite:///eventhub.db",
        description="Read-only database URL for assistant",
    )

    # ── Redis / Celery (Optional, graceful fallback available) ────────────────
    REDIS_URL: str = Field(default="redis://localhost:6379/0")
    CELERY_BROKER_URL: str = Field(default="redis://localhost:6379/0")
    CELERY_RESULT_BACKEND: str = Field(default="redis://localhost:6379/1")

    # ── Google Gemini AI API (Primary Engine) ─────────────────────────────────
    GEMINI_API_KEY: str = Field(
        default="",
        description="Google Gemini API key for extraction & NL-to-SQL assistant",
    )
    GEMINI_MODEL: str = Field(
        default="gemini-3.8-flash",
        description="Google Gemini model name (e.g. gemini-3.8-flash)",
    )

    # ── Groq API (High-throughput Llama fallback — 14,400 req/day free) ───────
    GROQ_API_KEY: str = Field(
        default="",
        description="Groq API key for Llama fallback inference",
    )
    GROQ_MODEL: str = Field(
        default="llama-3.1-8b-instant",
        description="Groq model (e.g. llama-3.1-8b-instant, 14,400 req/day)",
    )

    # ── Local SLM (Ollama - On-Device Privacy Engine < 5GB) ────────────────────
    OLLAMA_HOST: str = Field(
        default="http://127.0.0.1:11434",
        description="Local Ollama server URL",
    )
    LOCAL_SLM_MODEL: str = Field(
        default="qwen2.5:1.5b",
        description="Local Small Language Model for on-device email parsing",
    )
    USE_LOCAL_SLM: bool = Field(
        default=True,
        description="Prioritize local SLM for email parsing and summarization",
    )

    # ── Gmail OAuth2 ──────────────────────────────────────────────────────────
    GMAIL_CLIENT_ID: str = Field(default="", description="Google OAuth2 client ID")
    GMAIL_CLIENT_SECRET: str = Field(default="", description="Google OAuth2 client secret")
    GMAIL_REDIRECT_URI: str = Field(
        default="http://localhost:8000/api/ingest/gmail/callback",
        description="Registered OAuth2 redirect URI",
    )

    # ── Security & Network ────────────────────────────────────────────────────
    SECRET_KEY: str = Field(
        default="eventhub-prototype-secret-key-2026",
        description="Secret key for JWT signing / security",
    )
    DEBUG: bool = Field(default=True, description="Enable debug mode")
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173"],
        description="Allowed CORS origins",
    )
    UPLOAD_DIR: str = Field(default="./uploads", description="Uploads directory")

    APP_VERSION: str = "1.0.0"
    APP_TITLE: str = "Smart Event Hub API"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors(cls, v):
        if isinstance(v, str):
            import json
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings: Settings = get_settings()

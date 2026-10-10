"""
app/workers/celery_app.py
──────────────────────────
Celery application factory for Smart Event Hub.

Configuration
  • Broker:  Redis (CELERY_BROKER_URL)
  • Backend: Redis (CELERY_RESULT_BACKEND)
  • Serializer: JSON for both tasks and results
  • Late acknowledgement + low prefetch for at-least-once processing
  • Three named queues: default, email_processing, media_processing
"""

from __future__ import annotations

from celery import Celery

from app.config import settings

# ── Create the Celery application ─────────────────────────────────────────────

celery_app = Celery(
    "smart_event_hub",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.workers.tasks",   # auto-discover tasks on worker startup
    ],
)

# ── Serialization ─────────────────────────────────────────────────────────────
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]

# ── Reliability ───────────────────────────────────────────────────────────────
celery_app.conf.task_acks_late = True            # ack only after task completes
celery_app.conf.worker_prefetch_multiplier = 1   # one task at a time per worker

# ── Result expiry ─────────────────────────────────────────────────────────────
celery_app.conf.result_expires = 60 * 60 * 24   # 24 hours

# ── Timezone ─────────────────────────────────────────────────────────────────
celery_app.conf.timezone = "UTC"
celery_app.conf.enable_utc = True

# ── Task routing → named queues ───────────────────────────────────────────────
celery_app.conf.task_routes = {
    # Email ingestion pipeline (potentially long-running)
    "app.workers.tasks.process_email_batch": {
        "queue": "email_processing"
    },
    # Media file processing (image/pdf/audio)
    "app.workers.tasks.process_media_file": {
        "queue": "media_processing"
    },
    # Filter rule re-evaluation
    "app.workers.tasks.apply_filter_rules": {
        "queue": "default"
    },
}

# ── Default queue ─────────────────────────────────────────────────────────────
celery_app.conf.task_default_queue = "default"

# ── Worker concurrency hint (overridden by --concurrency flag) ────────────────
celery_app.conf.worker_max_tasks_per_child = 50   # restart worker after 50 tasks

if __name__ == "__main__":
    celery_app.start()

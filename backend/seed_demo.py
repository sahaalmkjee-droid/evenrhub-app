import asyncio
from datetime import datetime, timedelta, timezone
from app.database import AsyncSessionLocal, Base, async_engine
from app.models.models import Event

async def seed():
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as session:
        now = datetime.now(timezone.utc)
        demo_events = [
            Event(
                user_id="00000000-0000-0000-0000-000000000001",
                source_type="manual",
                title="Google Hackathon 2026",
                organizer="Google Dev Club",
                category="hackathon",
                start_time=now + timedelta(days=3),
                end_time=now + timedelta(days=5),
                venue="Main Auditorium",
                summary="Annual hackathon hosted by Google Dev Club. Open to all CS and IT students with exciting prizes.",
                is_hidden=False
            ),
            Event(
                user_id="00000000-0000-0000-0000-000000000001",
                source_type="email",
                title="Campus Placement Drive - TCS",
                organizer="Placement Cell",
                category="recruitment",
                start_time=now + timedelta(days=1),
                end_time=now + timedelta(days=1, hours=4),
                venue="Seminar Hall B",
                summary="TCS is conducting on-campus placements for B.Tech 2026 batch. Bring updated resume and credentials.",
                is_hidden=False
            ),
            Event(
                user_id="00000000-0000-0000-0000-000000000001",
                source_type="manual",
                title="Advanced ML & Transformers Workshop",
                organizer="AI Society",
                category="workshop",
                start_time=now + timedelta(days=7),
                end_time=now + timedelta(days=7, hours=3),
                venue="Lab 302",
                summary="Hands-on workshop on transformer architectures and fine-tuning. Prerequisites: Python and basic ML knowledge.",
                is_hidden=False
            ),
            Event(
                user_id="00000000-0000-0000-0000-000000000001",
                source_type="voice",
                title="End Semester Mathematics Exam",
                organizer="Examination Cell",
                category="exam",
                start_time=now + timedelta(days=12),
                end_time=now + timedelta(days=12, hours=3),
                venue="Examination Hall 1",
                summary="Semester end examination for Discrete Mathematics and Linear Algebra. Carry student ID card.",
                is_hidden=False
            ),
            Event(
                user_id="00000000-0000-0000-0000-000000000001",
                source_type="image",
                title="Robotics Club Orientation",
                organizer="Robotics Club",
                category="club",
                start_time=now + timedelta(days=2),
                end_time=now + timedelta(days=2, hours=2),
                venue="Student Activity Center",
                summary="Meet the club leads, view drone and bot demos, and join upcoming competitive teams.",
                is_hidden=False
            )
        ]
        session.add_all(demo_events)
        await session.commit()
        print("Seeded successfully!")

if __name__ == "__main__":
    asyncio.run(seed())

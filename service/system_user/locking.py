from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_async_session


_SYSTEM_USER_LIFECYCLE_LOCK_NAMESPACE = 1_513_312_816


async def lock_system_user_lifecycle(session: AsyncSession, user_id: int) -> None:
    """Serialize user deletion with operations that persist user attribution."""
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:namespace, :user_id)"),
        {
            "namespace": _SYSTEM_USER_LIFECYCLE_LOCK_NAMESPACE,
            "user_id": user_id,
        },
    )


@asynccontextmanager
async def system_user_lifecycle_lock(user_id: int) -> AsyncIterator[None]:
    async with get_async_session() as session, session.begin():
        await lock_system_user_lifecycle(session, user_id)
        yield

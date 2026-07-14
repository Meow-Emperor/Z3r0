from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text

from database import get_async_session


_EGRESS_PROXY_MUTATION_LOCK_NAMESPACE = 1_511_830_769


@asynccontextmanager
async def egress_proxy_mutation_lock(proxy_id: int) -> AsyncIterator[None]:
    async with get_async_session() as session, session.begin():
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:namespace, :proxy_id)"),
            {
                "namespace": _EGRESS_PROXY_MUTATION_LOCK_NAMESPACE,
                "proxy_id": proxy_id,
            },
        )
        yield

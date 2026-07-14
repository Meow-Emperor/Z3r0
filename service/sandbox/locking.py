"""Cross-worker serialization for sandbox container mutations."""

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from functools import wraps
from typing import Concatenate, ParamSpec, TypeVar

from sqlalchemy import text

from database import get_async_session


_LOCK_NAMESPACE = 87431623
P = ParamSpec("P")
R = TypeVar("R")


@asynccontextmanager
async def sandbox_container_mutation_lock(container_id: int) -> AsyncIterator[None]:
    async with get_async_session() as session, session.begin():
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:namespace, :container_id)"),
            {"namespace": _LOCK_NAMESPACE, "container_id": container_id},
        )
        yield


@asynccontextmanager
async def try_sandbox_container_mutation_lock(container_id: int) -> AsyncIterator[bool]:
    async with get_async_session() as session, session.begin():
        acquired = bool((await session.execute(
            text("SELECT pg_try_advisory_xact_lock(:namespace, :container_id)"),
            {"namespace": _LOCK_NAMESPACE, "container_id": container_id},
        )).scalar_one())
        yield acquired


def serialized_sandbox_container_mutation(
    operation: Callable[Concatenate[int, P], Awaitable[R]],
) -> Callable[Concatenate[int, P], Awaitable[R]]:
    @wraps(operation)
    async def wrapped(container_id: int, *args: P.args, **kwargs: P.kwargs) -> R:
        async with sandbox_container_mutation_lock(container_id):
            return await operation(container_id, *args, **kwargs)

    return wrapped

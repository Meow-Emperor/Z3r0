from datetime import datetime

from sqlmodel import select

from database import get_async_session
from model.agent.sessions import AgentSessionMeta
from model.system_user.users import SystemUser
from service.agent import notifications as agent_notifications
from service.system_user.locking import lock_system_user_lifecycle


async def list_running_sessions() -> list[AgentSessionMeta]:
    async with get_async_session() as session:
        return list((await session.exec(
            select(AgentSessionMeta).where(AgentSessionMeta.is_running.is_(True))
        )).all())


async def mark_session_running(
    session_id: str,
    *,
    agent_code: str,
    user_id: int,
    sandbox_container_id: int | None,
    sandbox_container_generation: int,
) -> None:
    async with get_async_session() as session:
        await lock_system_user_lifecycle(session, user_id)
        if await session.get(SystemUser, user_id) is None:
            raise PermissionError("system user no longer exists")
        meta = await session.get(AgentSessionMeta, session_id)
        if meta is None:
            return
        if meta.project_id is not None:
            meta.owner_id = user_id
        meta.is_running = True
        meta.runtime_agent_code = agent_code
        meta.runtime_sandbox_container_id = sandbox_container_id
        meta.runtime_sandbox_container_generation = sandbox_container_generation
        meta.run_started_at = datetime.now()
        meta.run_finished_at = None
        meta.run_error = ""
        session.add(meta)
        await session.commit()


async def mark_session_stopped(session_id: str, *, error: str = "") -> None:
    if await has_outstanding_session_work(session_id):
        return
    await finish_session_run(session_id, error=error)


async def finish_session_run(session_id: str, *, error: str = "") -> None:
    async with get_async_session() as session:
        meta = await session.get(AgentSessionMeta, session_id)
        if meta is None:
            return
        meta.is_running = False
        meta.run_finished_at = datetime.now()
        meta.run_error = _truncate_error(error)
        session.add(meta)
        await session.commit()


async def mark_sessions_stopped(session_ids: list[str], *, error: str = "") -> None:
    if not session_ids:
        return
    active_session_ids = {
        session_id for session_id in session_ids
        if await has_outstanding_session_work(session_id)
    }
    async with get_async_session() as session:
        metas = (await session.exec(
            select(AgentSessionMeta).where(AgentSessionMeta.session_id.in_(session_ids))
        )).all()
        for meta in metas:
            if meta.session_id in active_session_ids:
                continue
            meta.is_running = False
            meta.run_finished_at = datetime.now()
            meta.run_error = _truncate_error(error)
            session.add(meta)
        await session.commit()


async def force_mark_session_stopped(session_id: str, *, error: str = "") -> None:
    async with get_async_session() as session:
        meta = await session.get(AgentSessionMeta, session_id)
        if meta is None:
            return
        meta.is_running = False
        meta.run_finished_at = datetime.now()
        meta.run_error = _truncate_error(error)
        session.add(meta)
        await session.commit()


async def has_outstanding_session_work(session_id: str) -> bool:
    return await agent_notifications.has_active_session_notifications(session_id=session_id)


async def get_session_meta(session_id: str) -> AgentSessionMeta | None:
    async with get_async_session() as session:
        return await session.get(AgentSessionMeta, session_id)


def _truncate_error(value: str) -> str:
    value = value.strip().replace("\n", " ")
    return value if len(value) <= 500 else value[:499] + "..."

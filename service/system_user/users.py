import asyncio
import hmac
import secrets
from dataclasses import dataclass
from hashlib import pbkdf2_hmac
from datetime import datetime, timedelta

import jwt
from sqlalchemy import func, or_, text, update
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from config import get_config
from database import get_async_session
from logger import get_logger
from model.agent.sessions import AgentSessionMeta
from model.agent.subordinates import AgentSubordinateTask
from model.sandbox.containers import SandboxContainer
from model.system_user.users import SystemUser
from model.work_project.projects import WorkProjectOwner
from schema.system_user.users import SystemUserRole
from service.agent.sessions import cancel_sessions, delete_private_sessions_for_owner
from service.common.pagination import Page, RESOURCE_PAGE_SIZE, paginate_statement
from service.system_user.locking import lock_system_user_lifecycle


logger = get_logger(__name__)

_PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
_PASSWORD_HASH_ITERATIONS = 390_000
_PASSWORD_SALT_BYTES = 16


@dataclass(frozen=True)
class DeleteSystemUserResult:
    deleted: bool
    not_found: bool = False
    message: str = ""


@dataclass(frozen=True)
class UpdateSystemUserResult:
    user: SystemUser | None
    not_found: bool = False
    message: str = ""


class SystemUserConflictError(ValueError):
    pass


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(_PASSWORD_SALT_BYTES)
    digest = pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("ascii"),
        _PASSWORD_HASH_ITERATIONS,
    ).hex()
    return f"{_PASSWORD_HASH_ALGORITHM}${_PASSWORD_HASH_ITERATIONS}${salt}${digest}"


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt, expected_digest = password_hash.split("$", 3)
        iterations = int(iterations_text)
    except (ValueError, TypeError):
        return False

    if algorithm != _PASSWORD_HASH_ALGORITHM or iterations <= 0 or not salt or not expected_digest:
        return False

    actual_digest = pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("ascii"),
        iterations,
    ).hex()
    return hmac.compare_digest(actual_digest, expected_digest)


async def create_system_user(
    username: str,
    password: str,
    email: str = "",
    role: SystemUserRole = SystemUserRole.USER,
) -> SystemUser:
    now = datetime.now()
    password_hash = await asyncio.to_thread(_hash_password, password)
    system_user = SystemUser(
        role=role,
        email=email.strip().casefold(),
        username=username.strip(),
        password=password_hash,
        created_at=now,
        updated_at=now,
    )

    async with get_async_session() as session:
        session.add(system_user)
        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            raise SystemUserConflictError("username or email already exists") from exc
        await session.refresh(system_user)

    logger.info("system user created: %s", system_user.id)
    return system_user


async def delete_system_user(id: int) -> DeleteSystemUserResult:
    while True:
        async with get_async_session() as session:
            await _lock_admin_membership(session)
            await lock_system_user_lifecycle(session, id)
            system_user = (await session.exec(
                select(SystemUser).where(SystemUser.id == id).with_for_update()
            )).first()
            if system_user is None:
                return DeleteSystemUserResult(deleted=False, not_found=True, message="system user not found")
            message = await _user_deletion_blocker(session, system_user)
            if message:
                return DeleteSystemUserResult(deleted=False, message=message)
            reassignment = await _project_session_reassignment(session, id)
            if reassignment is None:
                return DeleteSystemUserResult(
                    deleted=False,
                    message="shared agent sessions require another project owner or administrator",
                )

        await cancel_sessions(
            list(reassignment),
            "Agent session operator was removed.",
        )
        await delete_private_sessions_for_owner(id)

        async with get_async_session() as session:
            await _lock_admin_membership(session)
            await lock_system_user_lifecycle(session, id)
            system_user = (await session.exec(
                select(SystemUser).where(SystemUser.id == id).with_for_update()
            )).first()
            if system_user is None:
                return DeleteSystemUserResult(deleted=False, not_found=True, message="system user not found")
            message = await _user_deletion_blocker(session, system_user)
            if message:
                return DeleteSystemUserResult(deleted=False, message=message)

            private_session_exists = (await session.exec(
                select(AgentSessionMeta.session_id).where(
                    AgentSessionMeta.owner_id == id,
                    AgentSessionMeta.project_id.is_(None),
                ).limit(1)
            )).first() is not None
            running_project_session_exists = (await session.exec(
                select(AgentSessionMeta.session_id).where(
                    AgentSessionMeta.owner_id == id,
                    AgentSessionMeta.project_id.is_not(None),
                    AgentSessionMeta.is_running.is_(True),
                ).limit(1)
            )).first() is not None
            if private_session_exists or running_project_session_exists:
                continue

            reassignment = await _project_session_reassignment(session, id)
            if reassignment is None:
                return DeleteSystemUserResult(
                    deleted=False,
                    message="shared agent sessions require another project owner or administrator",
                )
            await _apply_project_session_reassignment(session, reassignment)
            await session.delete(system_user)
            await session.commit()
            break

    logger.info("system user deleted: %s", id)
    return DeleteSystemUserResult(deleted=True)


async def update_system_user(
    id: int,
    username: str | None = None,
    password: str | None = None,
    email: str | None = None,
    role: SystemUserRole | None = None,
) -> UpdateSystemUserResult:
    password_hash = await asyncio.to_thread(_hash_password, password) if password is not None else None
    async with get_async_session() as session:
        await _lock_admin_membership(session)
        system_user = (await session.exec(
            select(SystemUser).where(SystemUser.id == id).with_for_update()
        )).first()
        if system_user is None:
            return UpdateSystemUserResult(user=None, not_found=True)

        if (
            role == SystemUserRole.USER
            and system_user.role == SystemUserRole.ADMIN
            and await _admin_count(session) <= 1
        ):
            return UpdateSystemUserResult(
                user=system_user,
                message="the last administrator cannot be demoted",
            )

        if role is not None:
            system_user.role = role
        if email is not None:
            system_user.email = email.strip().casefold()
        if username is not None:
            system_user.username = username.strip()
        if password_hash is not None:
            system_user.password = password_hash

        system_user.updated_at = datetime.now()
        session.add(system_user)
        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            raise SystemUserConflictError("username or email already exists") from exc
        await session.refresh(system_user)

    logger.info("system user updated: %s", system_user.id)
    return UpdateSystemUserResult(user=system_user)


async def query_system_user_by_username(username: str) -> SystemUser | None:
    async with get_async_session() as session:
        result = await session.exec(select(SystemUser).where(SystemUser.username == username.strip()))
        return result.first()


async def query_system_user_by_id(user_id: int) -> SystemUser | None:
    async with get_async_session() as session:
        return await session.get(SystemUser, user_id)


async def query_system_users(
    page: int = 1,
    size: int = RESOURCE_PAGE_SIZE,
    keyword: str = "",
) -> Page[SystemUser]:
    statement = select(SystemUser).order_by(SystemUser.id)

    keyword = keyword.strip()
    if keyword:
        pattern = f"%{keyword}%"
        statement = statement.where(
            or_(
                SystemUser.email.ilike(pattern),
                SystemUser.username.ilike(pattern),
            )
        )

    return await paginate_statement(statement, page=page, size=size)


async def system_user_login(email: str, password: str) -> str | None:
    cfg = get_config()

    async with get_async_session() as session:
        result = await session.exec(select(SystemUser).where(SystemUser.email == email.strip().casefold()))
        system_user = result.first()
    if system_user is None:
        return None

    if not await asyncio.to_thread(_verify_password, password, system_user.password):
        return None

    return jwt.encode(
        payload={
            "id": system_user.id,
            "role": system_user.role,
            "email": system_user.email,
            "username": system_user.username,
            "sub": "z3r0",
            "exp": datetime.now() + timedelta(days=30),
        },
        key=cfg.system.encrypt_key,
        algorithm="HS256",
    )


async def _user_deletion_blocker(session, user: SystemUser) -> str:
    if user.role == SystemUserRole.ADMIN and await _admin_count(session) <= 1:
        return "the last administrator cannot be deleted"

    owned_container = await session.exec(
        select(SandboxContainer.id)
        .where(SandboxContainer.owner_id == user.id)
        .limit(1)
    )
    if owned_container.first() is not None:
        return "system user owns sandbox containers"

    owned_projects = select(WorkProjectOwner.project_id).where(WorkProjectOwner.user_id == user.id)
    sole_owner_project = await session.exec(
        select(WorkProjectOwner.project_id)
        .where(WorkProjectOwner.project_id.in_(owned_projects))
        .group_by(WorkProjectOwner.project_id)
        .having(func.count(WorkProjectOwner.user_id) == 1)
        .limit(1)
    )
    if sole_owner_project.first() is not None:
        return "system user is the sole owner of a work project"
    return ""


async def _project_session_reassignment(
    session,
    deleted_user_id: int,
) -> dict[str, int] | None:
    project_sessions = list((await session.exec(
        select(AgentSessionMeta).where(
            AgentSessionMeta.owner_id == deleted_user_id,
            AgentSessionMeta.project_id.is_not(None),
        )
    )).all())
    if not project_sessions:
        return {}

    project_ids = {
        meta.project_id
        for meta in project_sessions
        if meta.project_id is not None
    }
    owner_rows = (await session.exec(
        select(WorkProjectOwner.project_id, WorkProjectOwner.user_id)
        .where(
            WorkProjectOwner.project_id.in_(project_ids),
            WorkProjectOwner.user_id != deleted_user_id,
        )
        .order_by(
            WorkProjectOwner.project_id,
            WorkProjectOwner.position,
            WorkProjectOwner.user_id,
        )
    )).all()
    owner_by_project: dict[int, int] = {}
    for project_id, owner_id in owner_rows:
        owner_by_project.setdefault(project_id, owner_id)

    fallback_admin_id = (await session.exec(
        select(SystemUser.id)
        .where(
            SystemUser.role == SystemUserRole.ADMIN,
            SystemUser.id != deleted_user_id,
        )
        .order_by(SystemUser.id)
        .limit(1)
    )).first()

    reassignment: dict[str, int] = {}
    for meta in project_sessions:
        replacement_id = owner_by_project.get(meta.project_id or 0) or fallback_admin_id
        if replacement_id is None:
            return None
        reassignment[meta.session_id] = replacement_id
    return reassignment


async def _apply_project_session_reassignment(
    session,
    reassignment: dict[str, int],
) -> None:
    for session_id, owner_id in reassignment.items():
        meta = await session.get(AgentSessionMeta, session_id)
        if meta is None:
            continue
        meta.owner_id = owner_id
        session.add(meta)
        await session.execute(
            update(AgentSubordinateTask)
            .where(AgentSubordinateTask.session_id == session_id)
            .values(owner_id=owner_id)
        )


async def _admin_count(session) -> int:
    result = await session.exec(
        select(func.count()).select_from(SystemUser).where(SystemUser.role == SystemUserRole.ADMIN)
    )
    return int(result.one())


async def _lock_admin_membership(session) -> None:
    # Serializes administrator deletion/demotion decisions across backend workers.
    await session.execute(text("SELECT pg_advisory_xact_lock(8743162201)"))

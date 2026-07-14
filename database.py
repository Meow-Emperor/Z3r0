from agents.extensions.memory import SQLAlchemySession
from sqlalchemy import URL, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from config import get_config
from logger import get_logger
from model.egress_proxy.proxies import EgressProxy
from model.host.hosts import ManagedHost
from model.sandbox.async_jobs import SandboxAsyncJob
from model.agent.notifications import AgentNotification
from model.agent.subordinates import AgentSubordinateTask
from model.agent.message_meta import AgentMessageMeta
from model.agent.event_log import AgentEventLog
from model.agent.context_compactions import AgentContextCompaction
from model.agent.sessions import AgentSessionMeta
from model.sandbox.containers import SandboxContainer
from model.sandbox.images import SandboxImage
from model.system_user.users import SystemUser
from model.work_project.assets import WorkProjectAsset
from model.work_project.findings import WorkProjectFinding
from model.work_project.graph import (
    WorkProjectAttackPath,
    WorkProjectAttackPathStep,
    WorkProjectGraphEdge,
)
from model.work_project.projects import WorkProject, WorkProjectOwner, WorkProjectSandboxContainer


logger = get_logger(__name__)

# registered so SQLModel.metadata picks every table up at create_all time
_registered_models = [
    SystemUser, ManagedHost, EgressProxy, SandboxImage, SandboxContainer, WorkProject, WorkProjectOwner, WorkProjectSandboxContainer,
    WorkProjectAsset, WorkProjectFinding,
    WorkProjectGraphEdge, WorkProjectAttackPath, WorkProjectAttackPathStep,
    AgentSessionMeta, AgentMessageMeta, AgentContextCompaction,
    AgentSubordinateTask, AgentNotification, SandboxAsyncJob, AgentEventLog,
]

_engine: AsyncEngine | None = None


async def create_all_tables() -> None:
    global _engine
    if _engine is None:
        raise RuntimeError("database engine is not initialized")

    # The SDK owns its session schema. Initialize it through the public session API
    # before creating app tables whose foreign keys reference that schema.
    sdk_session = SQLAlchemySession(
        session_id="__schema_initialization__",
        engine=_engine,
        create_tables=True,
    )
    await sdk_session.get_items(limit=0)

    async with _engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
        await _upgrade_application_schema(conn)

    logger.info("all tables created")


async def _upgrade_application_schema(conn: AsyncConnection) -> None:
    """Apply small idempotent upgrades that metadata.create_all cannot express."""
    await conn.execute(text("SELECT pg_advisory_xact_lock(8743162202)"))
    await _normalize_system_user_identities(conn)
    for column in ("email", "username"):
        index_name = f"ix_system_users_{column}"
        existing = (await conn.execute(text("""
            SELECT indexdef
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND tablename = 'system_users'
              AND indexname = :index_name
        """), {"index_name": index_name})).scalar_one_or_none()
        if existing and "CREATE UNIQUE INDEX" not in existing.upper():
            await conn.execute(text(f'DROP INDEX "{index_name}"'))
            existing = None
        if not existing:
            await conn.execute(text(
                f'CREATE UNIQUE INDEX "{index_name}" ON system_users ("{column}")'
            ))


async def _normalize_system_user_identities(conn: AsyncConnection) -> None:
    duplicate_email = (await conn.execute(text("""
        SELECT lower(btrim(email))
        FROM system_users
        GROUP BY lower(btrim(email))
        HAVING count(*) > 1
        LIMIT 1
    """))).scalar_one_or_none()
    duplicate_username = (await conn.execute(text("""
        SELECT btrim(username)
        FROM system_users
        GROUP BY btrim(username)
        HAVING count(*) > 1
        LIMIT 1
    """))).scalar_one_or_none()
    if duplicate_email is not None or duplicate_username is not None:
        raise RuntimeError(
            "system user identities contain duplicates after normalization; "
            "resolve duplicate email addresses or usernames before startup"
        )
    await conn.execute(text("""
        UPDATE system_users
        SET email = lower(btrim(email)), username = btrim(username)
        WHERE email <> lower(btrim(email)) OR username <> btrim(username)
    """))


async def close_engine() -> None:
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None


def init_engine() -> None:
    global _engine
    if _engine is not None:
        return

    cfg = get_config()
    db = cfg.database
    dsn = URL.create(
        "postgresql+asyncpg",
        username=db.username,
        password=db.password,
        host=db.host,
        port=db.port,
        database=db.database,
    )

    _engine = create_async_engine(
        url=dsn,
        pool_size=db.pool_size,
        max_overflow=db.max_overflow,
        pool_timeout=db.pool_timeout_seconds,
        pool_recycle=db.pool_recycle_seconds,
        pool_pre_ping=db.pool_pre_ping,
    )
    logger.info(
        "async postgres engine initialized (pool_size=%d max_overflow=%d timeout=%ds)",
        db.pool_size, db.max_overflow, db.pool_timeout_seconds,
    )


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        raise RuntimeError("database engine is not initialized")
    return _engine


def get_async_session() -> AsyncSession:
    return AsyncSession(get_engine())

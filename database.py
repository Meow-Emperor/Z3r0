from agents.extensions.memory import SQLAlchemySession
from sqlalchemy import URL
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
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
from model.work_project.evidence import (
    WorkProjectAttackPathStepEvidence,
    WorkProjectEvidence,
    WorkProjectFindingEvidence,
    WorkProjectRelationEvidence,
)
from model.work_project.findings import WorkProjectFinding, WorkProjectFindingAsset
from model.work_project.graph import (
    WorkProjectAttackPath,
    WorkProjectAttackPathStep,
    WorkProjectRelation,
)
from model.work_project.projects import WorkProject, WorkProjectOwner
from model.work_project.workflow import (
    WorkProjectWorkItem,
    WorkProjectWorkItemDependency,
    WorkProjectWorkItemTarget,
    WorkProjectWorkLog,
)
from utils.sdk_tables import agent_messages, agent_sessions


logger = get_logger(__name__)

# registered so SQLModel.metadata picks every table up at create_all time
_registered_models = [
    SystemUser, ManagedHost, EgressProxy, SandboxImage, SandboxContainer, WorkProject, WorkProjectOwner,
    WorkProjectAsset, WorkProjectRelation, WorkProjectFinding, WorkProjectFindingAsset,
    WorkProjectAttackPath, WorkProjectAttackPathStep,
    WorkProjectWorkItem, WorkProjectWorkItemTarget, WorkProjectWorkItemDependency, WorkProjectWorkLog,
    WorkProjectEvidence, WorkProjectRelationEvidence, WorkProjectFindingEvidence, WorkProjectAttackPathStepEvidence,
    AgentSessionMeta, AgentMessageMeta, AgentContextCompaction,
    AgentSubordinateTask, AgentNotification, SandboxAsyncJob, AgentEventLog,
]
_registered_sdk_tables = [agent_sessions, agent_messages]

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

    logger.info("all tables created")


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

from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager

from agents import set_tracing_disabled
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from config import ROOT_PATH, get_config

from core.delegation.subagents import start_subagent_runtime, stop_subagent_runtime
from core.lightrag.runtime import start_lightrag, stop_lightrag
from core.runtime.session import get_agent_pool
from core.sandbox.command_jobs import start_async_sandbox_runtime, stop_async_sandbox_commands
from database import close_engine, create_all_tables, init_engine
from logger import get_logger
from middleware.common import (
    http_exception_handler,
    request_validation_exception_handler,
    unhandled_exception_handler,
)
from middleware.system_user import JwtAuthMiddleware
from router.agent.agents import router as agent_router
from router.agent.sessions import router as agent_session_router
from router.common.fallback import api_not_found_router
from router.egress_proxy.proxies import router as egress_proxy_router
from router.host.hosts import router as host_router
from router.knowledge.resources import router as knowledge_router
from router.sandbox.containers import router as sandbox_container_router
from router.sandbox.images import router as sandbox_image_router
from router.system_config.config import router as system_config_router
from router.system_user.users import router as system_user_router
from router.work_project.projects import router as work_project_router
from router.work_project.records import router as work_project_records_router
from schema.system_user.users import SystemUserRole
from service.agent.recovery import recover_pending_sessions
from service.agent.reports import start_report_cleanup_runtime, stop_report_cleanup_runtime
from service.host.hosts import ensure_local_managed_host
from service.knowledge.runtime import (
    start_knowledge_document_runtime,
    stop_knowledge_document_runtime,
)
from service.sandbox.control_proxy import close_control_proxy_http_client
from service.sandbox.files import close_file_http_client
from service.sandbox.novnc import close_novnc_http_client
from service.sandbox.status import (
    invalidate_all_agent_tool_bindings,
    set_agent_tool_binding_invalidator,
    start_sandbox_container_status_monitor,
    stop_sandbox_container_status_monitor,
)
from service.system_user.users import create_system_user, query_system_user_by_username


logger = get_logger(__name__)

WEB_DIST_PATH = ROOT_PATH / "web" / "dist-app"
API_PREFIX = "/api"


async def _bootstrap_admin_user() -> None:
    bootstrap = get_config().system.bootstrap_admin
    if not bootstrap.enabled:
        logger.debug("bootstrap admin user skipped")
        return

    if await query_system_user_by_username(bootstrap.username) is not None:
        logger.debug("bootstrap admin user already exists: %s", bootstrap.username)
        return

    await create_system_user(
        username=bootstrap.username,
        password=bootstrap.password,
        email=bootstrap.email,
        role=SystemUserRole.ADMIN,
    )
    logger.info("bootstrap admin user created: %s", bootstrap.username)


async def _bootstrap_local_host() -> None:
    host = await ensure_local_managed_host()
    logger.debug("default local host ensured: %s", host.id)


async def _shutdown_step(name: str, operation: Callable[[], Awaitable[None]]) -> None:
    try:
        await operation()
    except Exception:
        logger.exception("%s shutdown failed", name)


async def _reset_agent_tool_bindings() -> None:
    try:
        await invalidate_all_agent_tool_bindings()
    finally:
        set_agent_tool_binding_invalidator(None)


async def _invalidate_current_agent_tool_bindings(container_id: int | None) -> None:
    await get_agent_pool().invalidate_tool_bindings(container_id)


async def _stop_current_agent_pool() -> None:
    await get_agent_pool().stop()


async def _shutdown_runtime(
    steps: list[tuple[str, Callable[[], Awaitable[None]]]],
) -> None:
    for name, operation in reversed(steps):
        await _shutdown_step(name, operation)


def _mount_frontend(app: FastAPI) -> None:
    """serve built frontend assets when web/dist-app exists"""
    index_path = WEB_DIST_PATH / "index.html"
    if not index_path.is_file():
        logger.debug("frontend static route skipped: %s not found", index_path)
        return

    assets_path = WEB_DIST_PATH / "assets"
    if assets_path.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_path), name="web-assets")

    async def serve_frontend(path: str = "") -> FileResponse:
        return FileResponse(index_path)

    app.add_api_route("/", serve_frontend, methods=["GET"], include_in_schema=False)
    app.add_api_route("/{path:path}", serve_frontend, methods=["GET"], include_in_schema=False)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    shutdown_steps: list[tuple[str, Callable[[], Awaitable[None]]]] = []
    try:
        try:
            init_engine()
            shutdown_steps.append(("database engine", close_engine))
            shutdown_steps.extend((
                ("control proxy HTTP client", close_control_proxy_http_client),
                ("file HTTP client", close_file_http_client),
                ("noVNC HTTP client", close_novnc_http_client),
            ))
            await create_all_tables()
            await _bootstrap_admin_user()
            await _bootstrap_local_host()

            await start_lightrag()
            shutdown_steps.append(("LightRAG", stop_lightrag))
            await start_knowledge_document_runtime()
            shutdown_steps.append(("knowledge document runtime", stop_knowledge_document_runtime))

            set_tracing_disabled(True)
            await start_async_sandbox_runtime()
            shutdown_steps.append(("sandbox command runtime", stop_async_sandbox_commands))
            await start_subagent_runtime()
            shutdown_steps.append(("subagent runtime", stop_subagent_runtime))
            await start_report_cleanup_runtime()
            shutdown_steps.append(("report cleanup runtime", stop_report_cleanup_runtime))

            await get_agent_pool().start()
            shutdown_steps.append(("agent pool", _stop_current_agent_pool))
            set_agent_tool_binding_invalidator(_invalidate_current_agent_tool_bindings)
            shutdown_steps.append(("agent tool bindings", _reset_agent_tool_bindings))

            await recover_pending_sessions()
            await start_sandbox_container_status_monitor()
            shutdown_steps.append(("sandbox status monitor", stop_sandbox_container_status_monitor))
        except Exception:
            logger.exception("lifespan startup failed")
            raise

        yield
    finally:
        await _shutdown_runtime(shutdown_steps)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Z3r0 - A controlled multi-agent workbench for authorized security assessment, code auditing, internal review, and controlled research.",
        version="0.2.1",
        lifespan=lifespan,
    )

    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, request_validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    logger.debug("exception handlers added")

    app.add_middleware(JwtAuthMiddleware)
    logger.debug("middleware added")

    app.include_router(system_user_router, prefix=API_PREFIX)
    app.include_router(host_router, prefix=API_PREFIX)
    app.include_router(egress_proxy_router, prefix=API_PREFIX)
    app.include_router(sandbox_image_router, prefix=API_PREFIX)
    app.include_router(sandbox_container_router, prefix=API_PREFIX)
    app.include_router(work_project_router, prefix=API_PREFIX)
    app.include_router(work_project_records_router, prefix=API_PREFIX)
    app.include_router(knowledge_router, prefix=API_PREFIX)
    app.include_router(agent_router, prefix=API_PREFIX)
    app.include_router(agent_session_router, prefix=API_PREFIX)
    app.include_router(system_config_router, prefix=API_PREFIX)
    app.include_router(api_not_found_router, prefix=API_PREFIX)
    logger.debug("api router added")

    _mount_frontend(app)
    return app

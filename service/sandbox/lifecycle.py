import asyncio
import re
import secrets
import socket
from datetime import datetime

import docker
from sqlalchemy import or_, update
from sqlmodel import select

from database import get_async_session
from logger import get_logger
from model.agent.sessions import AgentSessionMeta
from model.egress_proxy.proxies import EgressProxy
from model.host.hosts import ManagedHost
from model.sandbox.containers import SandboxContainer
from model.sandbox.images import SandboxImage
from model.system_user.users import SystemUser
from model.work_project.projects import WorkProject
from schema.sandbox.containers import (
    SandboxContainerEgressMode,
    SandboxContainerPortMapping,
    SandboxContainerStatus,
)
from service.host.docker import inspect_image_on_host_sync
from core.sandbox.command_jobs import cancel_sandbox_async_commands
from service.sandbox.control_proxy import apply_container_egress
from service.sandbox.docker_ops import (
    create_container_sync,
    pause_container_sync,
    remove_container_sync,
    resume_container_sync,
    start_container_sync,
    stop_container_sync,
)
from service.sandbox.egress import SandboxEgressSelection, sandbox_egress_container_environment
from service.sandbox.locking import serialized_sandbox_container_mutation
from service.sandbox.records import load_sandbox_container_record
from service.sandbox.status import (
    ContainerStatusSnapshot,
    invalidate_agent_tool_bindings,
    save_sandbox_container_status,
    sync_container_status_unlocked,
)
from service.sandbox.types import SandboxContainerMutationResult
from service.system_user.locking import system_user_lifecycle_lock


logger = get_logger(__name__)
_CONTROL_PROXY_HOST_PORT_MIN = 30000
_CONTROL_PROXY_HOST_PORT_MAX = 60999
_CONTROL_PROXY_HOST_PORT_RETRIES = 32


def _container_name_prefix(image_name: str) -> str:
    short_name = image_name.rsplit("/", 1)[-1].split("@", 1)[0].split(":", 1)[0]
    normalized = re.sub(r"[^a-zA-Z0-9_.-]+", "-", short_name).strip("-.")
    return normalized or "sandbox"


def _serialize_port_mappings(port_mappings: list[SandboxContainerPortMapping]) -> list[dict]:
    return [mapping.model_dump() for mapping in port_mappings]


async def create_sandbox_container(
    host_id: int,
    image_id: int,
    egress_mode: SandboxContainerEgressMode,
    egress_proxy_id: int | None,
    owner_id: int,
    port_mappings: list[SandboxContainerPortMapping],
) -> SandboxContainerMutationResult:
    async with system_user_lifecycle_lock(owner_id):
        return await _create_sandbox_container(
            host_id=host_id,
            image_id=image_id,
            egress_mode=egress_mode,
            egress_proxy_id=egress_proxy_id,
            owner_id=owner_id,
            port_mappings=port_mappings,
        )


async def _create_sandbox_container(
    host_id: int,
    image_id: int,
    egress_mode: SandboxContainerEgressMode,
    egress_proxy_id: int | None,
    owner_id: int,
    port_mappings: list[SandboxContainerPortMapping],
) -> SandboxContainerMutationResult:
    docker_host: ManagedHost | None = None
    container_hash = ""
    container_id: int | None = None
    try:
        async with get_async_session() as session, session.begin():
            host = (await session.exec(
                select(ManagedHost).where(ManagedHost.id == host_id).with_for_update()
            )).one_or_none()
            if host is None:
                return SandboxContainerMutationResult(
                    record=None,
                    succeeded=False,
                    message="managed host not found",
                    not_found=True,
                )
            docker_host = host.model_copy(deep=True)
            sandbox_image = (await session.exec(
                select(SandboxImage).where(SandboxImage.id == image_id).with_for_update()
            )).one_or_none()
            if sandbox_image is None:
                return SandboxContainerMutationResult(
                    record=None,
                    succeeded=False,
                    message="sandbox image not found",
                    not_found=True,
                )
            owner = await session.get(SystemUser, owner_id)
            if owner is None:
                return SandboxContainerMutationResult(
                    record=None,
                    succeeded=False,
                    message="system user not found",
                    not_found=True,
                )
            egress_proxy, message = await _resolve_egress_selection(
                session,
                sandbox_image,
                egress_mode,
                egress_proxy_id,
                lock=True,
            )
            if message:
                return SandboxContainerMutationResult(record=None, succeeded=False, message=message)

            for mapping in port_mappings:
                if mapping.container_port == sandbox_image.control_proxy_port and mapping.protocol == "tcp":
                    return SandboxContainerMutationResult(
                        record=None,
                        succeeded=False,
                        message="control proxy port is reserved for the sandbox control proxy",
                    )

            await asyncio.to_thread(_assert_host_image_exists, docker_host, sandbox_image.image_name)
            reserved_tcp_host_ports = {mapping.host_port for mapping in port_mappings if mapping.protocol == "tcp"}
            control_proxy_host_port = await asyncio.to_thread(
                _allocate_control_proxy_host_port,
                docker_host.ip_address,
                reserved_tcp_host_ports,
            )
            control_proxy_token = secrets.token_urlsafe(32)
            user_port_mappings = _serialize_port_mappings(port_mappings)
            docker_port_mappings = [*user_port_mappings, {
                "container_port": sandbox_image.control_proxy_port,
                "host_port": control_proxy_host_port,
                "protocol": "tcp",
            }]
            docker_port_mappings = [
                SandboxContainerPortMapping.model_validate(mapping)
                for mapping in docker_port_mappings
            ]
            container_hash, container_name = await asyncio.to_thread(
                create_container_sync,
                docker_host,
                sandbox_image.image_name,
                _container_name_prefix(sandbox_image.image_name),
                docker_port_mappings,
                {
                    "SANDBOX_CONTROL_PROXY_TOKEN": control_proxy_token,
                    **sandbox_egress_container_environment(SandboxEgressSelection(egress_mode, egress_proxy)),
                },
            )

            now = datetime.now()
            sandbox_container = SandboxContainer(
                host_id=host_id,
                container_name=container_name,
                container_hash=container_hash,
                owner_id=owner_id,
                image_id=image_id,
                egress_mode=egress_mode,
                egress_proxy_id=egress_proxy.id if egress_proxy is not None else None,
                control_proxy_host_port=control_proxy_host_port,
                control_proxy_token=control_proxy_token,
                port_mappings=user_port_mappings,
                status=SandboxContainerStatus.CREATED,
                created_at=now,
                updated_at=now,
            )
            session.add(sandbox_container)
            await session.flush()
            container_id = sandbox_container.id
            if container_id is None:
                raise RuntimeError("sandbox container id was not generated")
    except docker.errors.ImageNotFound:
        return SandboxContainerMutationResult(
            record=None,
            succeeded=False,
            message="image does not exist on selected host",
        )
    except BaseException as exc:
        if docker_host is not None and container_hash:
            await _rollback_created_container(docker_host, container_hash, exc)
        if isinstance(exc, asyncio.CancelledError):
            raise
        logger.exception("sandbox container create failed for host=%s image=%s", host_id, image_id)
        return SandboxContainerMutationResult(
            record=None,
            succeeded=False,
            message="failed to create sandbox container",
        )

    if container_id is None:
        raise RuntimeError("sandbox container transaction completed without an id")

    logger.info("sandbox container created: %s", container_id)
    return SandboxContainerMutationResult(
        record=await load_sandbox_container_record(container_id),
        succeeded=True,
        message="sandbox container created",
    )


@serialized_sandbox_container_mutation
async def start_sandbox_container(id: int) -> SandboxContainerMutationResult:
    record = await load_sandbox_container_record(id)
    if record is None:
        return SandboxContainerMutationResult(
            record=None,
            succeeded=False,
            message="sandbox container not found",
            not_found=True,
        )
    if record.container.status not in {SandboxContainerStatus.CREATED, SandboxContainerStatus.STOPPED}:
        return SandboxContainerMutationResult(
            record=record,
            succeeded=False,
            message="only created or stopped sandbox containers can be started",
        )

    try:
        host = await _load_container_host(record.container.host_id)
        if host is None:
            return SandboxContainerMutationResult(record=record, succeeded=False, message="managed host not found")
        await asyncio.to_thread(start_container_sync, host, record.container.container_hash)
        await asyncio.sleep(1)
        await sync_container_status_unlocked(ContainerStatusSnapshot(
            id=record.container.id or id,
            host_id=record.container.host_id,
            container_hash=record.container.container_hash,
            status=record.container.status,
        ))
        next_record = await load_sandbox_container_record(id)
        if (
            next_record is not None
            and next_record.container.status == SandboxContainerStatus.RUNNING
            and next_record.container.control_proxy_host_port > 0
        ):
            try:
                await apply_container_egress(id)
            except Exception:
                logger.warning("sandbox container started, but egress refresh failed: %s", id, exc_info=True)
    except docker.errors.NotFound:
        logger.debug("sandbox container instance not found while starting: %s", id)
        return SandboxContainerMutationResult(
            record=await save_sandbox_container_status(id, SandboxContainerStatus.ERROR),
            succeeded=False,
            message="sandbox container instance not found",
        )
    except Exception:
        logger.exception("sandbox container start failed: %s", id)
        return SandboxContainerMutationResult(
            record=await save_sandbox_container_status(id, SandboxContainerStatus.ERROR),
            succeeded=False,
            message="failed to start sandbox container",
        )

    next_record = await load_sandbox_container_record(id)
    if next_record is not None and next_record.container.status == SandboxContainerStatus.RUNNING:
        logger.info("sandbox container started: %s", id)
        return SandboxContainerMutationResult(
            record=next_record,
            succeeded=True,
            message="sandbox container started",
        )

    logger.info("sandbox container exited after start: %s", id)
    return SandboxContainerMutationResult(
        record=next_record,
        succeeded=False,
        message="sandbox container is not running after start",
    )


@serialized_sandbox_container_mutation
async def update_sandbox_container_egress(
    id: int,
    egress_mode: SandboxContainerEgressMode,
    egress_proxy_id: int | None,
) -> SandboxContainerMutationResult:
    record = await load_sandbox_container_record(id)
    if record is None:
        return SandboxContainerMutationResult(
            record=None,
            succeeded=False,
            message="sandbox container not found",
            not_found=True,
        )

    async with get_async_session() as session:
        container = (await session.exec(
            select(SandboxContainer).where(SandboxContainer.id == id).with_for_update()
        )).one_or_none()
        if container is None:
            return SandboxContainerMutationResult(
                record=None,
                succeeded=False,
                message="sandbox container not found",
                not_found=True,
            )
        sandbox_image = await session.get(SandboxImage, container.image_id)
        if sandbox_image is None:
            return SandboxContainerMutationResult(record=record, succeeded=False, message="sandbox image not found")
        egress_proxy, message = await _resolve_egress_selection(
            session,
            sandbox_image,
            egress_mode,
            egress_proxy_id,
            lock=True,
        )
        if message:
            return SandboxContainerMutationResult(record=record, succeeded=False, message=message)
        resolved_egress_proxy_id = egress_proxy.id if egress_proxy is not None else None
        if container.control_proxy_host_port <= 0:
            return SandboxContainerMutationResult(
                record=record,
                succeeded=False,
                message="sandbox container has no control proxy port for egress updates",
            )
        if container.egress_mode == egress_mode and container.egress_proxy_id == resolved_egress_proxy_id:
            return SandboxContainerMutationResult(
                record=record,
                succeeded=True,
                message="sandbox container egress unchanged",
            )
        previous_egress_mode = container.egress_mode
        previous_egress_proxy_id = container.egress_proxy_id
        container.egress_mode = egress_mode
        container.egress_proxy_id = resolved_egress_proxy_id
        container.updated_at = datetime.now()
        session.add(container)
        await session.commit()

    if record.container.status == SandboxContainerStatus.RUNNING:
        try:
            await apply_container_egress(id)
        except Exception:
            await _save_container_egress(id, previous_egress_mode, previous_egress_proxy_id)
            logger.exception("sandbox container egress apply failed: %s", id)
            return SandboxContainerMutationResult(
                record=record,
                succeeded=False,
                message="failed to apply egress to running sandbox container",
            )

    return SandboxContainerMutationResult(
        record=await load_sandbox_container_record(id),
        succeeded=True,
        message="sandbox container egress updated",
    )


@serialized_sandbox_container_mutation
async def stop_sandbox_container(id: int) -> SandboxContainerMutationResult:
    record = await load_sandbox_container_record(id)
    if record is None:
        return SandboxContainerMutationResult(
            record=None,
            succeeded=False,
            message="sandbox container not found",
            not_found=True,
        )
    if record.container.status != SandboxContainerStatus.RUNNING:
        return SandboxContainerMutationResult(
            record=record,
            succeeded=False,
            message="only running sandbox containers can be stopped",
        )

    try:
        host = await _load_container_host(record.container.host_id)
        if host is None:
            return SandboxContainerMutationResult(record=record, succeeded=False, message="managed host not found")
        await asyncio.to_thread(stop_container_sync, host, record.container.container_hash)
    except docker.errors.NotFound:
        logger.debug("sandbox container instance not found while stopping: %s", id)
        return SandboxContainerMutationResult(
            record=await save_sandbox_container_status(id, SandboxContainerStatus.ERROR),
            succeeded=False,
            message="sandbox container instance not found",
        )
    except Exception:
        logger.exception("sandbox container stop failed: %s", id)
        return SandboxContainerMutationResult(
            record=await save_sandbox_container_status(id, SandboxContainerStatus.ERROR),
            succeeded=False,
            message="failed to stop sandbox container",
        )

    logger.info("sandbox container stopped: %s", id)
    return SandboxContainerMutationResult(
        record=await save_sandbox_container_status(id, SandboxContainerStatus.STOPPED),
        succeeded=True,
        message="sandbox container stopped",
    )


@serialized_sandbox_container_mutation
async def pause_sandbox_container(id: int) -> SandboxContainerMutationResult:
    record = await load_sandbox_container_record(id)
    if record is None:
        return SandboxContainerMutationResult(
            record=None,
            succeeded=False,
            message="sandbox container not found",
            not_found=True,
        )
    if record.container.status != SandboxContainerStatus.RUNNING:
        return SandboxContainerMutationResult(
            record=record,
            succeeded=False,
            message="only running sandbox containers can be paused",
        )

    try:
        host = await _load_container_host(record.container.host_id)
        if host is None:
            return SandboxContainerMutationResult(record=record, succeeded=False, message="managed host not found")
        await asyncio.to_thread(pause_container_sync, host, record.container.container_hash)
    except docker.errors.NotFound:
        logger.debug("sandbox container instance not found while pausing: %s", id)
        return SandboxContainerMutationResult(
            record=await save_sandbox_container_status(id, SandboxContainerStatus.ERROR),
            succeeded=False,
            message="sandbox container instance not found",
        )
    except Exception:
        logger.exception("sandbox container pause failed: %s", id)
        return SandboxContainerMutationResult(
            record=await save_sandbox_container_status(id, SandboxContainerStatus.ERROR),
            succeeded=False,
            message="failed to pause sandbox container",
        )

    logger.info("sandbox container paused: %s", id)
    return SandboxContainerMutationResult(
        record=await save_sandbox_container_status(id, SandboxContainerStatus.PAUSED),
        succeeded=True,
        message="sandbox container paused",
    )


@serialized_sandbox_container_mutation
async def resume_sandbox_container(id: int) -> SandboxContainerMutationResult:
    record = await load_sandbox_container_record(id)
    if record is None:
        return SandboxContainerMutationResult(
            record=None,
            succeeded=False,
            message="sandbox container not found",
            not_found=True,
        )
    if record.container.status != SandboxContainerStatus.PAUSED:
        return SandboxContainerMutationResult(
            record=record,
            succeeded=False,
            message="only paused sandbox containers can be resumed",
        )

    try:
        host = await _load_container_host(record.container.host_id)
        if host is None:
            return SandboxContainerMutationResult(record=record, succeeded=False, message="managed host not found")
        await asyncio.to_thread(resume_container_sync, host, record.container.container_hash)
        await sync_container_status_unlocked(ContainerStatusSnapshot(
            id=record.container.id or id,
            host_id=record.container.host_id,
            container_hash=record.container.container_hash,
            status=record.container.status,
        ))
        next_record = await load_sandbox_container_record(id)
        if (
            next_record is not None
            and next_record.container.status == SandboxContainerStatus.RUNNING
            and next_record.container.control_proxy_host_port > 0
        ):
            try:
                await apply_container_egress(id)
            except Exception:
                logger.warning("sandbox container resumed, but egress refresh failed: %s", id, exc_info=True)
    except docker.errors.NotFound:
        logger.debug("sandbox container instance not found while resuming: %s", id)
        return SandboxContainerMutationResult(
            record=await save_sandbox_container_status(id, SandboxContainerStatus.ERROR),
            succeeded=False,
            message="sandbox container instance not found",
        )
    except Exception:
        logger.exception("sandbox container resume failed: %s", id)
        return SandboxContainerMutationResult(
            record=await save_sandbox_container_status(id, SandboxContainerStatus.ERROR),
            succeeded=False,
            message="failed to resume sandbox container",
        )

    next_record = await load_sandbox_container_record(id)
    if next_record is not None and next_record.container.status == SandboxContainerStatus.RUNNING:
        logger.info("sandbox container resumed: %s", id)
        return SandboxContainerMutationResult(
            record=next_record,
            succeeded=True,
            message="sandbox container resumed",
        )
    return SandboxContainerMutationResult(
        record=next_record,
        succeeded=False,
        message="sandbox container is not running after resume",
    )


@serialized_sandbox_container_mutation
async def delete_sandbox_container(id: int) -> bool:
    async with get_async_session() as session:
        sandbox_container = await session.get(SandboxContainer, id)
        if sandbox_container is None:
            return False
        host = await session.get(ManagedHost, sandbox_container.host_id)
        container_hash = sandbox_container.container_hash

    await cancel_sandbox_async_commands(id)
    await invalidate_agent_tool_bindings(id)
    if host is not None:
        await asyncio.to_thread(remove_container_sync, host, container_hash)

    async with get_async_session() as session:
        sandbox_container = await session.get(SandboxContainer, id)
        if sandbox_container is None:
            return True
        await _clear_sandbox_container_references(session, id)
        await session.delete(sandbox_container)
        await session.commit()

    logger.info("sandbox container deleted: %s", id)
    return True


async def _rollback_created_container(
    host: ManagedHost,
    container_hash: str,
    original_error: BaseException,
) -> None:
    try:
        await asyncio.shield(asyncio.to_thread(remove_container_sync, host, container_hash))
    except Exception as cleanup_error:
        logger.exception("failed to remove Docker container after database create failure: %s", container_hash)
        original_error.add_note(f"Docker container cleanup also failed: {cleanup_error}")


async def _clear_sandbox_container_references(session, id: int) -> None:
    await session.execute(
        update(WorkProject)
        .where(WorkProject.sandbox_container_id == id)
        .values(sandbox_container_id=None)
    )

    await session.execute(
        update(AgentSessionMeta)
        .where(
            or_(
                AgentSessionMeta.selected_sandbox_container_id == id,
                AgentSessionMeta.runtime_sandbox_container_id == id,
            )
        )
        .values(
            selected_sandbox_container_id=None,
            selected_sandbox_container_generation=0,
            runtime_sandbox_container_id=None,
            runtime_sandbox_container_generation=0,
        )
    )


def _assert_host_image_exists(host: ManagedHost, image_name: str) -> None:
    inspect_image_on_host_sync(host, image_name)


def _allocate_control_proxy_host_port(host_ip: str, reserved_tcp_ports: set[int]) -> int:
    for _ in range(_CONTROL_PROXY_HOST_PORT_RETRIES):
        port = secrets.randbelow(
            _CONTROL_PROXY_HOST_PORT_MAX - _CONTROL_PROXY_HOST_PORT_MIN + 1
        ) + _CONTROL_PROXY_HOST_PORT_MIN
        if port in reserved_tcp_ports:
            continue
        try:
            with socket.create_connection((host_ip, port), timeout=0.5):
                continue
        except OSError:
            return port
    raise RuntimeError("failed to allocate control proxy host port")


async def _load_container_host(host_id: int) -> ManagedHost | None:
    async with get_async_session() as session:
        return await session.get(ManagedHost, host_id)


async def _resolve_egress_selection(
    session,
    sandbox_image: SandboxImage,
    egress_mode: SandboxContainerEgressMode,
    egress_proxy_id: int | None,
    *,
    lock: bool = False,
) -> tuple[EgressProxy | None, str]:
    if egress_mode == SandboxContainerEgressMode.DIRECT:
        if egress_proxy_id is not None:
            return None, "egress proxy is only valid for proxy egress mode"
        return None, ""
    if egress_mode == SandboxContainerEgressMode.TOR:
        if egress_proxy_id is not None:
            return None, "egress proxy is only valid for proxy egress mode"
        if not sandbox_image.supports_tor:
            return None, "sandbox image does not support tor egress"
        return None, ""
    if egress_proxy_id is None:
        return None, "egress proxy is required for proxy egress mode"
    statement = select(EgressProxy).where(EgressProxy.id == egress_proxy_id)
    if lock:
        statement = statement.with_for_update()
    egress_proxy = (await session.exec(statement)).one_or_none()
    if egress_proxy is None:
        return None, "egress proxy not found"
    return egress_proxy, ""


async def _save_container_egress(
    id: int,
    egress_mode: SandboxContainerEgressMode,
    egress_proxy_id: int | None,
) -> None:
    async with get_async_session() as session:
        container = await session.get(SandboxContainer, id)
        if container is None:
            return
        container.egress_mode = egress_mode
        container.egress_proxy_id = egress_proxy_id
        container.updated_at = datetime.now()
        session.add(container)
        await session.commit()

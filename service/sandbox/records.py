from sqlalchemy import String, cast, exists, or_
from sqlmodel import select

from database import get_async_session
from model.egress_proxy.proxies import EgressProxy
from model.host.hosts import ManagedHost
from model.sandbox.containers import SandboxContainer
from model.sandbox.images import SandboxImage
from model.system_user.users import SystemUser
from model.work_project.projects import WorkProject, WorkProjectOwner
from schema.sandbox.containers import (
    SandboxContainerHostOptionSchema,
    SandboxContainerSchema,
    SandboxContainerStatus,
)
from schema.system_user.users import SystemUserRole
from service.common.pagination import Page, RESOURCE_PAGE_SIZE, paginate_statement
from service.sandbox.egress import sandbox_egress_label
from service.sandbox.types import SandboxContainerRecord


def _base_container_record_statement():
    return (
        select(
            SandboxContainer,
            SandboxImage.image_name,
            SandboxImage.supports_tor,
            SandboxImage.control_proxy_port,
            SystemUser.username,
            ManagedHost.ip_address,
            EgressProxy,
        )
        .join(SandboxImage, SandboxContainer.image_id == SandboxImage.id)
        .join(SystemUser, SandboxContainer.owner_id == SystemUser.id)
        .join(ManagedHost, SandboxContainer.host_id == ManagedHost.id)
        .outerjoin(EgressProxy, SandboxContainer.egress_proxy_id == EgressProxy.id)
    )


def _apply_keyword_filter(statement, keyword: str):
    keyword = keyword.strip()
    if not keyword:
        return statement
    pattern = f"%{keyword}%"
    return statement.where(
        or_(
            SandboxContainer.container_name.ilike(pattern),
            SandboxContainer.container_hash.ilike(pattern),
            SandboxImage.image_name.ilike(pattern),
            ManagedHost.ip_address.ilike(pattern),
            SystemUser.username.ilike(pattern),
            EgressProxy.proxy_host.ilike(pattern),
            EgressProxy.proxy_account.ilike(pattern),
            cast(SandboxContainer.status, String).ilike(pattern),
            cast(SandboxContainer.port_mappings, String).ilike(pattern),
            cast(SandboxContainer.control_proxy_host_port, String).ilike(pattern),
            cast(SandboxImage.control_proxy_port, String).ilike(pattern),
        )
    )


def _to_record(row) -> SandboxContainerRecord:
    return SandboxContainerRecord(
        container=row[0],
        image_name=row[1],
        supports_tor=row[2],
        control_proxy_port=row[3],
        owner_username=row[4],
        host_ip_address=row[5],
        egress_label=sandbox_egress_label(row[0], row[6]),
    )


async def _paginate_container_records(statement, page: int, size: int) -> Page[SandboxContainerRecord]:
    page_result = await paginate_statement(statement, page=page, size=size)
    return Page(
        page=page_result.page,
        size=page_result.size,
        total=page_result.total,
        items=[_to_record(row) for row in page_result.items],
    )


async def load_sandbox_container_record(id: int) -> SandboxContainerRecord | None:
    statement = _base_container_record_statement().where(SandboxContainer.id == id)
    async with get_async_session() as session:
        result = await session.exec(statement)
        row = result.first()
        return _to_record(row) if row is not None else None


def sandbox_container_can_manage(
    container: SandboxContainer,
    user_id: int | None,
    user_role: SystemUserRole | None,
) -> bool:
    return user_role == SystemUserRole.ADMIN or (user_id is not None and container.owner_id == user_id)


def sandbox_container_schema(
    record: SandboxContainerRecord,
    *,
    user_id: int | None = None,
    user_role: SystemUserRole | None = None,
) -> SandboxContainerSchema:
    container = record.container
    return SandboxContainerSchema(
        id=container.id or 0,
        host_id=container.host_id,
        host_ip_address=record.host_ip_address,
        container_name=container.container_name,
        container_hash=container.container_hash,
        image_id=container.image_id,
        image_name=record.image_name,
        supports_tor=record.supports_tor,
        control_proxy_port=record.control_proxy_port,
        egress_mode=container.egress_mode,
        egress_proxy_id=container.egress_proxy_id,
        egress_label=record.egress_label,
        control_proxy_host_port=container.control_proxy_host_port,
        port_mappings=container.port_mappings,
        status=container.status,
        owner_id=container.owner_id,
        owner_username=record.owner_username,
        can_manage=sandbox_container_can_manage(container, user_id, user_role),
        created_at=container.created_at,
        updated_at=container.updated_at,
    )


async def query_sandbox_containers(
    user_id: int,
    user_role: SystemUserRole,
    page: int = 1,
    size: int = RESOURCE_PAGE_SIZE,
    keyword: str = "",
) -> Page[SandboxContainerRecord]:
    statement = _base_container_record_statement().order_by(SandboxContainer.id)
    if user_role != SystemUserRole.ADMIN:
        statement = statement.where(SandboxContainer.owner_id == user_id)
    statement = _apply_keyword_filter(statement, keyword)
    return await _paginate_container_records(statement, page, size)


async def query_available_sandbox_containers(
    user_id: int,
    user_role: SystemUserRole,
    work_project_id: int | None = None,
    include_non_running: bool = False,
    page: int = 1,
    size: int = RESOURCE_PAGE_SIZE,
    keyword: str = "",
) -> Page[SandboxContainerRecord]:
    accessible_work_project_id = await _accessible_work_project_id(
        user_id=user_id,
        user_role=user_role,
        work_project_id=work_project_id,
    )
    statement = _base_container_record_statement().order_by(SandboxContainer.id)
    if user_role != SystemUserRole.ADMIN:
        statement = _apply_user_available_scope(statement, user_id, accessible_work_project_id)
    statement = _apply_available_filter(statement, accessible_work_project_id, include_non_running)
    statement = _apply_keyword_filter(statement, keyword)
    return await _paginate_container_records(statement, page, size)


async def query_sandbox_container_host_options(
    *,
    page: int,
    size: int,
    keyword: str,
) -> Page[SandboxContainerHostOptionSchema]:
    statement = select(ManagedHost).order_by(ManagedHost.id)
    keyword = keyword.strip()
    if keyword:
        pattern = f"%{keyword}%"
        statement = statement.where(or_(
            ManagedHost.ip_address.ilike(pattern),
            cast(ManagedHost.docker_management_port, String).ilike(pattern),
        ))
    page_result = await paginate_statement(statement, page=page, size=size)
    return Page(
        page=page_result.page,
        size=page_result.size,
        total=page_result.total,
        items=[
            SandboxContainerHostOptionSchema(
                id=host.id or 0,
                ip_address=host.ip_address,
                docker_management_port=host.docker_management_port,
            )
            for host in page_result.items
        ],
    )


async def query_sandbox_container_image_options(
    *,
    page: int,
    size: int,
    keyword: str,
) -> Page[SandboxImage]:
    statement = select(SandboxImage).order_by(SandboxImage.id)
    keyword = keyword.strip()
    if keyword:
        pattern = f"%{keyword}%"
        statement = statement.where(or_(
            SandboxImage.image_name.ilike(pattern),
            cast(SandboxImage.control_proxy_port, String).ilike(pattern),
        ))
    return await paginate_statement(statement, page=page, size=size)


async def sandbox_container_is_manageable_by_user(
    id: int,
    user_id: int,
    user_role: SystemUserRole,
) -> bool | None:
    async with get_async_session() as session:
        container = await session.get(SandboxContainer, id)
        if container is None:
            return None
        return sandbox_container_can_manage(container, user_id, user_role)


async def _accessible_work_project_id(
    *,
    user_id: int,
    user_role: SystemUserRole,
    work_project_id: int | None,
) -> int | None:
    if work_project_id is None:
        return None
    async with get_async_session() as session:
        if await session.get(WorkProject, work_project_id) is None:
            return None
        if user_role == SystemUserRole.ADMIN:
            return work_project_id
        if await session.get(WorkProjectOwner, (work_project_id, user_id)) is None:
            return None
        return work_project_id


def _apply_user_available_scope(statement, user_id: int, work_project_id: int | None):
    if work_project_id is None:
        return statement.where(SandboxContainer.owner_id == user_id)
    bound_to_accessible_project = exists().where(
        WorkProject.id == work_project_id,
        WorkProject.sandbox_container_id == SandboxContainer.id,
    )
    return statement.where(or_(SandboxContainer.owner_id == user_id, bound_to_accessible_project))


def _apply_available_filter(
    statement,
    work_project_id: int | None,
    include_non_running: bool,
):
    bound_elsewhere = exists().where(WorkProject.sandbox_container_id == SandboxContainer.id)
    if work_project_id is not None:
        bound_elsewhere = bound_elsewhere.where(WorkProject.id != work_project_id)
        bound_to_project = exists().where(
            WorkProject.sandbox_container_id == SandboxContainer.id,
            WorkProject.id == work_project_id,
        )
        if include_non_running:
            return statement.where(~bound_elsewhere)
        return statement.where(
            or_(SandboxContainer.status == SandboxContainerStatus.RUNNING, bound_to_project)
        ).where(~bound_elsewhere)
    if include_non_running:
        return statement.where(~bound_elsewhere)
    return statement.where(SandboxContainer.status == SandboxContainerStatus.RUNNING).where(~bound_elsewhere)

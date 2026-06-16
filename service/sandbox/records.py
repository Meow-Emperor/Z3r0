from sqlalchemy import String, cast, or_
from sqlmodel import select

from database import get_async_session
from model.egress_proxy.proxies import EgressProxy
from model.sandbox.containers import SandboxContainer
from model.sandbox.images import SandboxImage
from model.host.hosts import ManagedHost
from model.system_user.users import SystemUser
from schema.sandbox.containers import SandboxContainerStatus
from schema.system_user.users import SystemUserRole
from service.common.pagination import Page, paginate_statement
from service.egress_proxy.proxies import egress_proxy_label
from service.sandbox.types import SandboxContainerRecord


def _base_container_record_statement():
    return (
        select(SandboxContainer, SandboxImage.image_name, SystemUser.username, ManagedHost.ip_address, EgressProxy)
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
        )
    )


def _to_record(row) -> SandboxContainerRecord:
    return SandboxContainerRecord(
        container=row[0],
        image_name=row[1],
        owner_username=row[2],
        host_ip_address=row[3],
        egress_proxy_label=egress_proxy_label(row[4]),
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


async def query_sandbox_containers(
    page: int = 1,
    size: int = 100,
    keyword: str = "",
) -> Page[SandboxContainerRecord]:
    statement = _base_container_record_statement().order_by(SandboxContainer.id)
    statement = _apply_keyword_filter(statement, keyword)
    return await _paginate_container_records(statement, page, size)


async def query_available_sandbox_containers(
    user_id: int,
    user_role: SystemUserRole,
    page: int = 1,
    size: int = 100,
    keyword: str = "",
) -> Page[SandboxContainerRecord]:
    statement = _base_container_record_statement().order_by(SandboxContainer.id)
    if user_role != SystemUserRole.ADMIN:
        statement = statement.where(SandboxContainer.owner_id == user_id)
    statement = statement.where(SandboxContainer.status == SandboxContainerStatus.RUNNING)
    statement = _apply_keyword_filter(statement, keyword)
    return await _paginate_container_records(statement, page, size)

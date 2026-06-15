from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import String, cast, or_
from sqlmodel import select

from database import get_async_session
from model.host.hosts import ManagedHost
from service.common.pagination import Page, paginate_statement


@dataclass(frozen=True)
class DeleteManagedHostResult:
    deleted: bool
    not_found: bool = False
    message: str = ""


async def create_managed_host(
    ip_address: str,
    ssh_port: int,
    host_account: str,
    host_password: str,
    docker_management_port: int,
) -> ManagedHost:
    now = datetime.now()
    host = ManagedHost(
        ip_address=ip_address,
        ssh_port=ssh_port,
        host_account=host_account,
        host_password=host_password,
        docker_management_port=docker_management_port,
        created_at=now,
        updated_at=now,
    )

    async with get_async_session() as session:
        session.add(host)
        await session.commit()
        await session.refresh(host)

    return host


async def update_managed_host(
    id: int,
    ip_address: str | None = None,
    ssh_port: int | None = None,
    host_account: str | None = None,
    host_password: str | None = None,
    docker_management_port: int | None = None,
) -> ManagedHost | None:
    async with get_async_session() as session:
        host = await session.get(ManagedHost, id)
        if host is None:
            return None

        if ip_address is not None:
            host.ip_address = ip_address
        if ssh_port is not None:
            host.ssh_port = ssh_port
        if host_account is not None:
            host.host_account = host_account
        if host_password is not None:
            host.host_password = host_password
        if docker_management_port is not None:
            host.docker_management_port = docker_management_port

        host.updated_at = datetime.now()
        session.add(host)
        await session.commit()
        await session.refresh(host)

    return host


async def delete_managed_host(id: int) -> DeleteManagedHostResult:
    async with get_async_session() as session:
        host = await session.get(ManagedHost, id)
        if host is None:
            return DeleteManagedHostResult(deleted=False, not_found=True, message="managed host not found")

        await session.delete(host)
        await session.commit()

    return DeleteManagedHostResult(deleted=True)


async def query_managed_hosts(page: int = 1, size: int = 100, keyword: str = "") -> Page[ManagedHost]:
    statement = select(ManagedHost).order_by(ManagedHost.id)

    keyword = keyword.strip()
    if keyword:
        pattern = f"%{keyword}%"
        statement = statement.where(
            or_(
                ManagedHost.ip_address.ilike(pattern),
                ManagedHost.host_account.ilike(pattern),
                cast(ManagedHost.ssh_port, String).ilike(pattern),
                cast(ManagedHost.docker_management_port, String).ilike(pattern),
            )
        )

    return await paginate_statement(statement, page=page, size=size)


async def query_managed_host_by_id(id: int) -> ManagedHost | None:
    async with get_async_session() as session:
        return await session.get(ManagedHost, id)

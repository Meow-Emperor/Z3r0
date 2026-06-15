from dataclasses import dataclass

from sqlmodel import select

from database import get_async_session
from model.host.hosts import ManagedHost
from model.sandbox.containers import SandboxContainer
from schema.sandbox.containers import SandboxContainerStatus


@dataclass(frozen=True)
class SandboxProxyTarget:
    container_id: int
    base_url: str
    ws_base_url: str
    token: str
    status: SandboxContainerStatus
    novnc_support: bool


async def resolve_sandbox_proxy_target(
    container_id: int,
    *,
    require_running: bool = False,
    require_novnc: bool = False,
) -> SandboxProxyTarget | None:
    async with get_async_session() as session:
        row = (await session.exec(
            select(SandboxContainer, ManagedHost)
            .join(ManagedHost, SandboxContainer.host_id == ManagedHost.id)
            .where(SandboxContainer.id == container_id)
        )).first()
        if row is None:
            return None
        container, host = row

    if container.proxy_host_port <= 0 or not container.proxy_token:
        return None
    if require_running and container.status != SandboxContainerStatus.RUNNING:
        return None
    if require_novnc and not container.novnc_support:
        return None

    base = f"http://{host.ip_address}:{container.proxy_host_port}"
    return SandboxProxyTarget(
        container_id=container.id or container_id,
        base_url=base,
        ws_base_url=f"ws://{host.ip_address}:{container.proxy_host_port}",
        token=container.proxy_token,
        status=container.status,
        novnc_support=container.novnc_support,
    )


def sandbox_proxy_token_headers(target: SandboxProxyTarget) -> dict[str, str]:
    return {"X-Sandbox-Token": target.token}

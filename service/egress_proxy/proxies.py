from dataclasses import dataclass
from datetime import datetime
from time import perf_counter

import httpx
from sqlalchemy import String, cast, or_
from sqlmodel import select

from database import get_async_session
from model.egress_proxy.proxies import EgressProxy
from model.sandbox.containers import SandboxContainer
from schema.egress_proxy.proxies import EgressProxyType
from service.common.pagination import Page, paginate_statement


NO_PROXY_VALUE = "localhost,127.0.0.1,::1"
LOCAL_EGRESS_PROXY_URL = "http://127.0.0.1:8118"
EGRESS_PROXY_UPSTREAM_TYPE_ENV = "Z3R0_EGRESS_PROXY_UPSTREAM_TYPE"
EGRESS_PROXY_UPSTREAM_ADDR_ENV = "Z3R0_EGRESS_PROXY_UPSTREAM_ADDR"
EGRESS_PROXY_TEST_URL = "https://www.gstatic.com/generate_204"
EGRESS_PROXY_TEST_TIMEOUT_SECONDS = 8.0


@dataclass(frozen=True)
class DeleteEgressProxyResult:
    deleted: bool
    not_found: bool = False
    message: str = ""


@dataclass(frozen=True)
class UpdateEgressProxyResult:
    proxy: EgressProxy | None
    not_found: bool = False
    message: str = ""


@dataclass(frozen=True)
class TestEgressProxyResult:
    id: int
    success: bool
    status_code: int | None
    elapsed_ms: int
    message: str
    not_found: bool = False


async def create_egress_proxy(
    proxy_type: EgressProxyType,
    proxy_host: str,
    proxy_port: int,
    proxy_account: str = "",
    proxy_password: str = "",
) -> EgressProxy:
    now = datetime.now()
    proxy = EgressProxy(
        proxy_type=proxy_type,
        proxy_host=proxy_host,
        proxy_port=proxy_port,
        proxy_account=proxy_account,
        proxy_password=proxy_password,
        created_at=now,
        updated_at=now,
    )

    async with get_async_session() as session:
        session.add(proxy)
        await session.commit()
        await session.refresh(proxy)
    return proxy


async def update_egress_proxy(
    id: int,
    proxy_type: EgressProxyType | None = None,
    proxy_host: str | None = None,
    proxy_port: int | None = None,
    proxy_account: str | None = None,
    proxy_password: str | None = None,
) -> UpdateEgressProxyResult:
    async with get_async_session() as session:
        proxy = await session.get(EgressProxy, id)
        if proxy is None:
            return UpdateEgressProxyResult(proxy=None, not_found=True, message="egress proxy not found")

        if proxy_type is not None:
            proxy.proxy_type = proxy_type
        if proxy_host is not None:
            proxy.proxy_host = proxy_host
        if proxy_port is not None:
            proxy.proxy_port = proxy_port
        if proxy_account is not None:
            proxy.proxy_account = proxy_account
        if proxy_password is not None:
            proxy.proxy_password = proxy_password

        proxy.updated_at = datetime.now()
        session.add(proxy)
        await session.commit()
        await session.refresh(proxy)
        return UpdateEgressProxyResult(proxy=proxy)


async def delete_egress_proxy(id: int) -> DeleteEgressProxyResult:
    async with get_async_session() as session:
        proxy = await session.get(EgressProxy, id)
        if proxy is None:
            return DeleteEgressProxyResult(deleted=False, not_found=True, message="egress proxy not found")
        if await _egress_proxy_has_sandbox_containers(session, id):
            return DeleteEgressProxyResult(
                deleted=False,
                message="egress proxy is used by sandbox containers",
            )

        await session.delete(proxy)
        await session.commit()
        return DeleteEgressProxyResult(deleted=True)


async def query_egress_proxies(page: int = 1, size: int = 100, keyword: str = "") -> Page[EgressProxy]:
    statement = select(EgressProxy).order_by(EgressProxy.id)

    keyword = keyword.strip()
    if keyword:
        pattern = f"%{keyword}%"
        statement = statement.where(
            or_(
                EgressProxy.proxy_host.ilike(pattern),
                EgressProxy.proxy_account.ilike(pattern),
                cast(EgressProxy.proxy_type, String).ilike(pattern),
                cast(EgressProxy.proxy_port, String).ilike(pattern),
            )
        )

    return await paginate_statement(statement, page=page, size=size)


async def query_egress_proxy_by_id(id: int) -> EgressProxy | None:
    async with get_async_session() as session:
        return await session.get(EgressProxy, id)


async def test_egress_proxy(id: int) -> TestEgressProxyResult:
    proxy = await query_egress_proxy_by_id(id)
    if proxy is None:
        return TestEgressProxyResult(
            id=id,
            success=False,
            status_code=None,
            elapsed_ms=0,
            message="egress proxy not found",
            not_found=True,
        )

    started = perf_counter()
    try:
        async with httpx.AsyncClient(
            proxy=_egress_proxy_url(proxy),
            timeout=httpx.Timeout(EGRESS_PROXY_TEST_TIMEOUT_SECONDS),
            follow_redirects=False,
            trust_env=False,
        ) as client:
            response = await client.get(EGRESS_PROXY_TEST_URL)
    except (httpx.HTTPError, OSError) as exc:
        return TestEgressProxyResult(
            id=id,
            success=False,
            status_code=None,
            elapsed_ms=int((perf_counter() - started) * 1000),
            message=f"proxy test failed: {exc}",
        )

    elapsed_ms = int((perf_counter() - started) * 1000)
    success = 200 <= response.status_code < 400
    return TestEgressProxyResult(
        id=id,
        success=success,
        status_code=response.status_code,
        elapsed_ms=elapsed_ms,
        message="proxy test succeeded" if success else f"proxy test returned HTTP {response.status_code}",
    )


def egress_proxy_label(proxy: EgressProxy | None) -> str:
    if proxy is None:
        return ""
    return f"{proxy.proxy_type.value}://{proxy.proxy_host}:{proxy.proxy_port}"


def egress_proxy_runtime_environment() -> dict[str, str]:
    return {
        "HTTP_PROXY": LOCAL_EGRESS_PROXY_URL,
        "http_proxy": LOCAL_EGRESS_PROXY_URL,
        "HTTPS_PROXY": LOCAL_EGRESS_PROXY_URL,
        "https_proxy": LOCAL_EGRESS_PROXY_URL,
        "ALL_PROXY": LOCAL_EGRESS_PROXY_URL,
        "all_proxy": LOCAL_EGRESS_PROXY_URL,
        "NO_PROXY": NO_PROXY_VALUE,
        "no_proxy": NO_PROXY_VALUE,
    }


def egress_proxy_upstream_environment(proxy: EgressProxy | None) -> dict[str, str]:
    environment: dict[str, str] = {}
    if proxy is not None:
        environment[EGRESS_PROXY_UPSTREAM_TYPE_ENV] = proxy.proxy_type.value
        environment[EGRESS_PROXY_UPSTREAM_ADDR_ENV] = _egress_proxy_upstream(proxy)
    return environment


def egress_proxy_container_environment(proxy: EgressProxy | None) -> dict[str, str]:
    return {
        **egress_proxy_runtime_environment(),
        **egress_proxy_upstream_environment(proxy),
    }


def _egress_proxy_upstream(proxy: EgressProxy) -> str:
    auth = ""
    if proxy.proxy_account:
        auth = f"{proxy.proxy_account}:{proxy.proxy_password}@"
    return f"{auth}{proxy.proxy_host}:{proxy.proxy_port}"


def _egress_proxy_url(proxy: EgressProxy) -> str:
    scheme = proxy.proxy_type.value
    return f"{scheme}://{_egress_proxy_upstream(proxy)}"


async def _egress_proxy_has_sandbox_containers(session, proxy_id: int) -> bool:
    result = await session.exec(
        select(SandboxContainer.id).where(SandboxContainer.egress_proxy_id == proxy_id).limit(1)
    )
    return result.first() is not None

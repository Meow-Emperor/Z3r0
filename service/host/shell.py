from __future__ import annotations

import asyncio
import inspect
from dataclasses import dataclass
from typing import Any

from model.host.hosts import ManagedHost
from service.host.hosts import query_managed_host_by_id


_DEFAULT_SHELL_ROWS = 24
_DEFAULT_SHELL_COLS = 80
_SSH_CONNECT_TIMEOUT_SECONDS = 10


@dataclass
class HostShellSession:
    connection: Any
    process: Any
    closed: bool = False

    def shutdown(self) -> None:
        if self.closed:
            return
        self.process.close()

    async def close(self) -> None:
        if self.closed:
            return
        self.closed = True

        try:
            self.process.close()
            await self.process.wait_closed()
        finally:
            self.connection.close()
            await self.connection.wait_closed()


async def resolve_shell_host(id: int) -> ManagedHost | None:
    return await query_managed_host_by_id(id)


async def open_host_shell(
    host: ManagedHost,
    rows: int = _DEFAULT_SHELL_ROWS,
    cols: int = _DEFAULT_SHELL_COLS,
) -> HostShellSession:
    try:
        import asyncssh
    except ImportError as exc:
        raise RuntimeError("asyncssh is required for host shell access") from exc

    connection = await asyncssh.connect(
        host.ip_address,
        port=host.ssh_port,
        username=host.host_account,
        password=host.host_password,
        known_hosts=None,
        connect_timeout=_SSH_CONNECT_TIMEOUT_SECONDS,
    )
    try:
        process = await connection.create_process(
            request_pty=True,
            term_type="xterm-256color",
            term_size=(cols, rows),
            encoding=None,
        )
    except Exception:
        connection.close()
        await connection.wait_closed()
        raise
    return HostShellSession(connection=connection, process=process)


async def resize_host_shell(session: HostShellSession, rows: int, cols: int) -> None:
    rows = max(1, min(rows, 300))
    cols = max(1, min(cols, 500))
    session.process.change_terminal_size(cols, rows)


async def read_host_shell(session: HostShellSession) -> bytes:
    try:
        data = await session.process.stdout.read(4096)
    except (OSError, ValueError, asyncio.CancelledError):
        return b""
    if isinstance(data, str):
        return data.encode()
    return data or b""


async def write_host_shell(session: HostShellSession, data: str) -> None:
    if not data:
        return
    payload = data.encode()
    session.process.stdin.write(payload)
    drain = getattr(session.process.stdin, "drain", None)
    if callable(drain):
        result = drain()
        if inspect.isawaitable(result):
            await result

import asyncio
import re
import tempfile
from pathlib import Path
from time import time
from uuid import uuid4

from config import get_config
from logger import get_logger
from schema.common.tool_results import ReportToolResultOutputSchema


logger = get_logger(__name__)

REPORT_ROOT = Path("/tmp/reports")
REPORT_EXTENSION = ".md"
_REPORT_SESSION_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
_REPORT_FILE_ID_PATTERN = re.compile(r"^[0-9a-z]{1,16}-[a-f0-9]{4}$")
_REPORT_ID_SEPARATOR = ":"
_REPORT_CLEANUP_INTERVAL_SECONDS = 60 * 60

_report_export_lock = asyncio.Lock()
_report_cleanup_task: asyncio.Task[None] | None = None


async def export_session_report(session_id: str, content: str) -> ReportToolResultOutputSchema:
    report_content = _valid_report_content(content)
    session_dir = _safe_session_report_dir(session_id)

    async with _report_export_lock:
        session_dir.mkdir(parents=True, exist_ok=True)
        report_path = _new_report_path(session_dir)

        _write_text_atomic(report_path, report_content)
        stat = report_path.stat()

    return ReportToolResultOutputSchema(
        report_id=report_id_for_path(report_path),
        filename=report_download_filename(report_path),
        size=stat.st_size,
        chars=len(report_content),
    )


def resolve_report_download_path(report_id: str) -> Path:
    session_id, file_id = _parse_report_id(report_id)
    resolved_path = (_safe_session_report_dir(session_id) / f"{file_id}{REPORT_EXTENSION}").resolve()
    if not _is_report_file_path(resolved_path):
        raise FileNotFoundError("report file not found")
    return resolved_path


def report_id_for_path(report_path: Path) -> str:
    session_id = report_session_id(report_path)
    file_id = report_path.stem
    if (
        not session_id
        or report_path.suffix.lower() != REPORT_EXTENSION
        or not _REPORT_FILE_ID_PATTERN.fullmatch(file_id)
    ):
        raise ValueError("invalid report file")
    return f"{session_id}{_REPORT_ID_SEPARATOR}{file_id}"


def _parse_report_id(report_id: str) -> tuple[str, str]:
    raw_report_id = report_id.strip()
    if not raw_report_id:
        raise ValueError("report id is required")
    parts = raw_report_id.split(_REPORT_ID_SEPARATOR, 1)
    if len(parts) != 2:
        raise ValueError("report id is invalid")
    session_id, file_id = parts[0].strip(), parts[1].strip()
    if not _REPORT_SESSION_PATTERN.fullmatch(session_id) or not _REPORT_FILE_ID_PATTERN.fullmatch(file_id):
        raise ValueError("report id is invalid")
    return session_id, file_id


def report_session_id(report_path: Path) -> str:
    try:
        relative = report_path.resolve().relative_to(REPORT_ROOT.resolve())
    except ValueError:
        return ""
    return relative.parts[0] if len(relative.parts) == 2 else ""


def report_download_filename(report_path: Path) -> str:
    session_id = report_session_id(report_path)
    if not session_id:
        return report_path.name
    return f"{session_id}-{report_path.name}"


async def cleanup_expired_reports() -> int:
    retention_seconds = get_config().agent_runtime.report_retention_seconds
    threshold = time() - retention_seconds
    deleted = _cleanup_expired_reports_sync(threshold)
    if deleted:
        logger.info("expired report files cleaned: %s", deleted)
    return deleted


async def start_report_cleanup_runtime() -> None:
    global _report_cleanup_task
    if _report_cleanup_task is not None and not _report_cleanup_task.done():
        return
    await cleanup_expired_reports()
    _report_cleanup_task = asyncio.create_task(
        _report_cleanup_loop(),
        name="report-cleanup",
    )
    logger.info("report cleanup runtime started")


async def stop_report_cleanup_runtime() -> None:
    global _report_cleanup_task
    task, _report_cleanup_task = _report_cleanup_task, None
    if task is None or task.done():
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    logger.info("report cleanup runtime stopped")


async def _report_cleanup_loop() -> None:
    while True:
        try:
            await asyncio.sleep(_REPORT_CLEANUP_INTERVAL_SECONDS)
            await cleanup_expired_reports()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("report cleanup iteration failed")


def _valid_report_content(content: str) -> str:
    if not isinstance(content, str) or not content.strip():
        raise ValueError("report content is required")
    return content


def _safe_session_report_dir(session_id: str) -> Path:
    normalized = session_id.strip()
    if not _REPORT_SESSION_PATTERN.fullmatch(normalized):
        raise ValueError("invalid session id for report export")
    session_dir = (REPORT_ROOT / normalized).resolve()
    if not _is_relative_to(session_dir, REPORT_ROOT.resolve()):
        raise ValueError("invalid session id for report export")
    return session_dir


def _new_report_path(session_dir: Path) -> Path:
    while True:
        report_path = session_dir / f"{_new_report_file_id()}{REPORT_EXTENSION}"
        if not report_path.exists():
            return report_path


def _new_report_file_id() -> str:
    return f"{_base36(int(time() * 1000))}-{uuid4().hex[:4]}"


def _base36(value: int) -> str:
    if value <= 0:
        return "0"
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    result = ""
    current = value
    while current:
        current, remainder = divmod(current, 36)
        result = digits[remainder] + result
    return result


def _write_text_atomic(path: Path, content: str) -> None:
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temp_file:
            temp_path = Path(temp_file.name)
            temp_file.write(content)
        temp_path.replace(path)
    except Exception:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
        raise


def _cleanup_expired_reports_sync(threshold: float) -> int:
    if not REPORT_ROOT.exists():
        return 0

    deleted = 0
    for entry in REPORT_ROOT.iterdir():
        if entry.is_symlink() or not entry.is_dir():
            continue
        for report_path in entry.iterdir():
            if _is_report_file_path(report_path):
                deleted += _delete_expired_file(report_path, threshold)
        _remove_empty_dir(entry)
    _remove_empty_dir(REPORT_ROOT)
    return deleted


def _is_report_file_path(path: Path) -> bool:
    try:
        relative_path = path.resolve().relative_to(REPORT_ROOT.resolve())
    except ValueError:
        return False
    return (
        len(relative_path.parts) == 2
        and path.is_file()
        and path.suffix.lower() == REPORT_EXTENSION
        and _REPORT_FILE_ID_PATTERN.fullmatch(path.stem) is not None
    )


def _delete_expired_file(path: Path, threshold: float) -> int:
    try:
        if path.stat(follow_symlinks=False).st_mtime >= threshold:
            return 0
        path.unlink()
        return 1
    except FileNotFoundError:
        return 0
    except Exception:
        logger.debug("failed to delete expired report file: %s", path, exc_info=True)
        return 0


def _remove_empty_dir(path: Path) -> None:
    try:
        path.rmdir()
    except OSError:
        pass


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True

from fastapi import APIRouter

from handler.common.http import raise_api_error


# 404 fallback for unmatched /api/* paths; declared after the real api routers
# so the SPA fallback (/{path:path}) does not swallow stray api requests
api_not_found_router = APIRouter(include_in_schema=False)

_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


async def _api_not_found(path: str = "") -> None:
    raise_api_error(404, "not found")


api_not_found_router.add_api_route("", _api_not_found, methods=_METHODS)
api_not_found_router.add_api_route("/{path:path}", _api_not_found, methods=_METHODS)

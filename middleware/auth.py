from dataclasses import dataclass
from http import HTTPStatus
from typing import Any

import jwt
from fastapi import Depends, HTTPException
from starlette.datastructures import Headers
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from config import get_config
from database import get_async_session
from model.system_user.users import SystemUser
from schema.common.responses import CommonResponse
from schema.system_user.users import SystemUserRole


ACCESS_TOKEN_HEADER = "X-Z3r0-Access-Token"
_API_PATH_PREFIX = "/api"


@dataclass(frozen=True)
class AuthUser:
    id: int
    role: SystemUserRole
    email: str
    username: str

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "AuthUser":
        return cls(
            id=payload["id"],
            role=SystemUserRole(payload["role"]),
            email=payload["email"],
            username=payload["username"],
        )


class JwtAuthMiddleware:
    """Decode the application JWT on /api/* requests if present.

    A missing token passes through because public endpoints rely on this. A
    malformed/expired token is rejected up front so dependencies see a clean
    state.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope.get("method") == "OPTIONS"
            or not _is_api_scope(scope)
        ):
            await self.app(scope, receive, send)
            return

        token = Headers(scope=scope).get(ACCESS_TOKEN_HEADER, "").strip()
        if not token:
            await self.app(scope, receive, send)
            return

        try:
            token_user = decode_access_token(token)
        except jwt.ExpiredSignatureError:
            await _error_response(HTTPStatus.UNAUTHORIZED, "token expired")(scope, receive, send)
            return
        except jwt.InvalidTokenError:
            await _error_response(HTTPStatus.UNAUTHORIZED, "invalid token")(scope, receive, send)
            return
        if token_user is None:
            await _error_response(HTTPStatus.UNAUTHORIZED, "invalid token payload")(scope, receive, send)
            return

        user = await resolve_current_user(token_user)
        if user is None:
            await _error_response(HTTPStatus.UNAUTHORIZED, "access token user no longer exists")(scope, receive, send)
            return

        scope.setdefault("state", {})["system_user"] = user
        await self.app(scope, receive, send)


def decode_access_token(token: str) -> AuthUser | None:
    if not token:
        return None

    cfg = get_config()
    payload = jwt.decode(
        token,
        key=cfg.system.encrypt_key,
        algorithms=["HS256"],
        options={"require": ["exp", "id", "role", "email", "username", "sub"]},
    )
    if not _is_valid_payload(payload):
        return None
    try:
        return AuthUser.from_payload(payload)
    except (KeyError, TypeError, ValueError):
        return None


async def authenticate_access_token(token: str) -> AuthUser | None:
    """Validate a token and resolve the user's current identity and role."""
    try:
        token_user = decode_access_token(token)
    except jwt.InvalidTokenError:
        return None
    if token_user is None:
        return None
    return await resolve_current_user(token_user)


async def resolve_current_user(token_user: AuthUser) -> AuthUser | None:
    async with get_async_session() as session:
        user = await session.get(SystemUser, token_user.id)
    if user is None or user.id is None:
        return None
    return AuthUser(
        id=user.id,
        role=user.role,
        email=user.email,
        username=user.username,
    )


async def require_user(request: Request) -> AuthUser:
    user = getattr(request.state, "system_user", None)
    if not isinstance(user, AuthUser):
        raise HTTPException(status_code=HTTPStatus.UNAUTHORIZED.value, detail="missing access token")
    return user


async def require_admin(user: AuthUser = Depends(require_user)) -> AuthUser:
    if user.role != SystemUserRole.ADMIN:
        raise HTTPException(status_code=HTTPStatus.FORBIDDEN.value, detail="admin role required")
    return user


def _error_response(status_code: HTTPStatus, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code.value,
        content=CommonResponse(code=status_code.value, message=message).model_dump(),
    )


def _is_api_scope(scope: Scope) -> bool:
    path = str(scope.get("path") or "")
    return path == _API_PATH_PREFIX or path.startswith(f"{_API_PATH_PREFIX}/")


def _is_valid_payload(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    return (
        isinstance(payload.get("id"), int)
        and payload.get("role") in {SystemUserRole.ADMIN.value, SystemUserRole.USER.value}
        and isinstance(payload.get("email"), str)
        and isinstance(payload.get("username"), str)
        and payload.get("sub") == "z3r0"
    )

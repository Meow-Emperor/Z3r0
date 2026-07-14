from http import HTTPStatus
from typing import Never

from fastapi import HTTPException


def raise_api_error(status_code: int | HTTPStatus, message: str) -> Never:
    """Raise an error rendered by the application's common HTTP handler."""
    code = status_code.value if isinstance(status_code, HTTPStatus) else status_code
    raise HTTPException(status_code=code, detail=message)

"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query

from app.security.auth import CurrentUser, get_current_user
from app.security.ratelimit import rate_limit

CurrentUserDep = Annotated[CurrentUser, Depends(rate_limit("api"))]
SensitiveUserDep = Annotated[CurrentUser, Depends(rate_limit("sensitive", sensitive=True))]
AuthOnlyDep = Annotated[CurrentUser, Depends(get_current_user)]
Limit = Annotated[int, Query(ge=1, le=200)]
Offset = Annotated[int, Query(ge=0)]

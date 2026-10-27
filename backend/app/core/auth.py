"""Verifies the Clerk session token the app sends as `Authorization: Bearer <token>`."""

from dataclasses import dataclass
from typing import Annotated

from clerk_backend_api.security import authenticate_request_async
from clerk_backend_api.security.types import AuthenticateRequestOptions
from fastapi import Depends, HTTPException, Request

from app.core.config import get_settings


@dataclass(frozen=True)
class VerifiedIdentity:
    clerk_user_id: str  # the token's `sub`, e.g. "user_2abc..."
    # Present only when added as custom session claims in the Clerk Dashboard.
    email: str | None
    name: str | None


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(401, detail, headers={"WWW-Authenticate": "Bearer"})


async def verify_session(request: Request) -> VerifiedIdentity:
    settings = get_settings()
    if not settings.clerk_issuer or not (settings.clerk_jwt_key or settings.clerk_secret_key):
        raise RuntimeError("Set CLERK_ISSUER and CLERK_JWT_KEY (or CLERK_SECRET_KEY) in backend/.env.")

    if not request.headers.get("Authorization", "").startswith("Bearer "):
        raise _unauthorized("Sign in required")

    # Checks the signature, expiry, and (for web) the allowed origins.
    state = await authenticate_request_async(
        request,
        AuthenticateRequestOptions(
            jwt_key=settings.clerk_jwt_key,
            secret_key=settings.clerk_secret_key,
            authorized_parties=settings.clerk_authorized_parties or None,
            accepts_token=["session_token"],
        ),
    )
    if not state.is_signed_in or state.payload is None:
        raise _unauthorized("Your session is invalid or has expired")

    claims = state.payload
    # Reject tokens minted by a different Clerk instance.
    if claims.get("iss", "").rstrip("/") != settings.clerk_issuer.rstrip("/"):
        raise _unauthorized("Your session is invalid or has expired")

    return VerifiedIdentity(clerk_user_id=claims["sub"], email=claims.get("email"), name=claims.get("name"))


VerifiedIdentityDep = Annotated[VerifiedIdentity, Depends(verify_session)]

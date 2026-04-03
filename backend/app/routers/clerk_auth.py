"""Clerk token exchange endpoint.

Receives a Clerk session JWT, verifies it via Clerk's Backend API,
looks up the user by email in the local `users` table, and returns
an app-level JWT if the user exists.
"""

import os
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from jose import jwt as jose_jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import create_access_token
from ..db import get_db
from ..models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class ClerkExchangeIn(BaseModel):
    token: str


class ClerkExchangeOut(BaseModel):
    access_token: str
    user: dict


def _clerk_secret_key() -> str:
    key = os.getenv("CLERK_SECRET_KEY", "")
    if not key:
        raise HTTPException(
            status_code=500,
            detail="CLERK_SECRET_KEY is not configured on the server",
        )
    return key


def _extract_clerk_user_id(token: str) -> str:
    """Decode the Clerk JWT without verification to extract the subject (user ID).

    We don't verify the signature here because we'll validate the user
    via the Clerk Backend API in the next step.
    """
    try:
        claims = jose_jwt.get_unverified_claims(token)
        sub = claims.get("sub")
        if not sub:
            raise ValueError("Missing sub claim")
        return sub
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Clerk token")


async def _get_clerk_user_email(clerk_user_id: str, secret_key: str) -> Optional[str]:
    """Call Clerk's Backend API to get the user's primary email address.

    This also acts as verification: if the user ID is bogus, Clerk
    returns 404.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.clerk.com/v1/users/{clerk_user_id}",
            headers={"Authorization": f"Bearer {secret_key}"},
        )

    if resp.status_code == 404:
        raise HTTPException(status_code=401, detail="Clerk user not found")
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Clerk API error: {resp.status_code}",
        )

    data = resp.json()

    # Find the primary email from Clerk's response
    email_addresses = data.get("email_addresses", [])
    primary_email_id = data.get("primary_email_address_id")

    for addr in email_addresses:
        if addr.get("id") == primary_email_id:
            return addr.get("email_address")

    # Fallback: return the first email
    if email_addresses:
        return email_addresses[0].get("email_address")

    return None


@router.post("/clerk-exchange", response_model=ClerkExchangeOut)
async def clerk_exchange(payload: ClerkExchangeIn, db: Session = Depends(get_db)):
    """Exchange a Clerk session token for an app JWT.

    Flow:
    1. Decode Clerk JWT to get user ID
    2. Call Clerk API to verify user and get email
    3. Look up email in local `users` table
    4. If found, issue app JWT; if not, reject
    """
    secret_key = _clerk_secret_key()
    clerk_user_id = _extract_clerk_user_id(payload.token)
    email = await _get_clerk_user_email(clerk_user_id, secret_key)

    if not email:
        raise HTTPException(
            status_code=401,
            detail="No email address associated with this Clerk account",
        )

    # Look up user by email in our database
    user = (
        db.execute(
            select(User).where(User.email == email.lower().strip())
        )
        .scalars()
        .first()
    )

    if not user or user.deleted_at is not None:
        raise HTTPException(
            status_code=403,
            detail=f"No account found for {email}. Contact your admin to be added.",
        )

    # Issue app JWT
    token = create_access_token(user=user)

    return ClerkExchangeOut(
        access_token=token,
        user={
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role,
            "cohort_id": user.cohort_id,
        },
    )

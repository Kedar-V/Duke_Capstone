"""Magic link authentication.

Flow:
1. POST /api/auth/magic-link        — send a magic link email
2. POST /api/auth/magic-link/verify — verify token and issue app JWT
"""

import os
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import create_access_token
from ..db import get_db
from ..models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

_MAGIC_LINK_EXPIRY_MINUTES = 15
_TOKEN_TYPE = "magic_link"


def _jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "dev-insecure-secret")


def _resend_api_key() -> str:
    return os.getenv("RESEND_API_KEY", "")


def _magic_link_base_url() -> str:
    return os.getenv("MAGIC_LINK_BASE_URL", "http://localhost:5173")


def _sender_email() -> str:
    return os.getenv("MAGIC_LINK_FROM_EMAIL", "onboarding@resend.dev")


def _create_magic_token(email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email.lower().strip(),
        "type": _TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=_MAGIC_LINK_EXPIRY_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm="HS256")


def _verify_magic_token(token: str) -> str:
    """Verify and return the email from a magic link token."""
    try:
        data = jwt.decode(token, _jwt_secret(), algorithms=["HS256"])
        if data.get("type") != _TOKEN_TYPE:
            raise ValueError("Wrong token type")
        email = data.get("sub")
        if not email:
            raise ValueError("Missing email")
        return email.lower().strip()
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired magic link")


async def _send_magic_email(to_email: str, magic_url: str, display_name: str | None):
    """Send magic link via Resend API."""
    api_key = _resend_api_key()

    if not api_key:
        # Dev fallback: print to console
        print(f"\n{'='*60}")
        print(f"MAGIC LINK (no RESEND_API_KEY configured)")
        print(f"  To: {to_email}")
        print(f"  URL: {magic_url}")
        print(f"{'='*60}\n")
        return

    name = display_name or to_email.split("@")[0].replace(".", " ").title()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": _sender_email(),
                "to": [to_email],
                "subject": "Sign in to Duke Capstone Platform",
                "html": f"""
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                    <h2 style="color: #00539B; margin-bottom: 8px;">Duke Capstone Platform</h2>
                    <p style="color: #374151; font-size: 16px;">Hi {name},</p>
                    <p style="color: #374151; font-size: 16px;">Click the button below to sign in. This link expires in {_MAGIC_LINK_EXPIRY_MINUTES} minutes.</p>
                    <div style="margin: 32px 0;">
                        <a href="{magic_url}"
                           style="background-color: #00539B; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: 600; display: inline-block;">
                            Sign in to Platform
                        </a>
                    </div>
                    <p style="color: #6B7280; font-size: 13px;">Or copy and paste this URL into your browser:</p>
                    <p style="color: #6B7280; font-size: 13px; word-break: break-all;">{magic_url}</p>
                    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 32px 0;" />
                    <p style="color: #9CA3AF; font-size: 12px;">If you didn't request this link, you can safely ignore this email.</p>
                </div>
                """,
            },
        )

    if resp.status_code not in (200, 201):
        print(f"Resend API error: {resp.status_code} {resp.text}")
        raise HTTPException(
            status_code=502,
            detail="Failed to send magic link email. Please try again.",
        )


class MagicLinkRequestIn(BaseModel):
    email: str


class MagicLinkVerifyIn(BaseModel):
    token: str


class MagicLinkRequestOut(BaseModel):
    message: str
    # Only included in dev mode (no Resend key)
    dev_url: str | None = None


class MagicLinkVerifyOut(BaseModel):
    access_token: str
    user: dict


@router.post("/magic-link", response_model=MagicLinkRequestOut)
async def request_magic_link(
    payload: MagicLinkRequestIn, db: Session = Depends(get_db)
):
    email = (payload.email or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    # Check if user exists in our database
    user = (
        db.execute(select(User).where(User.email == email))
        .scalars()
        .first()
    )

    if not user or user.deleted_at is not None:
        # Don't reveal whether the email exists — always say "check your inbox"
        return MagicLinkRequestOut(
            message="If that email is registered, a sign-in link has been sent."
        )

    # Generate token and magic link URL
    token = _create_magic_token(email)
    base_url = _magic_link_base_url().rstrip("/")
    magic_url = f"{base_url}/auth/verify?token={token}"

    # Send email
    await _send_magic_email(email, magic_url, user.display_name)

    # In dev mode (no Resend key), return the URL directly
    dev_url = magic_url if not _resend_api_key() else None

    return MagicLinkRequestOut(
        message="If that email is registered, a sign-in link has been sent.",
        dev_url=dev_url,
    )


@router.post("/magic-link/verify", response_model=MagicLinkVerifyOut)
async def verify_magic_link(
    payload: MagicLinkVerifyIn, db: Session = Depends(get_db)
):
    email = _verify_magic_token(payload.token)

    user = (
        db.execute(select(User).where(User.email == email))
        .scalars()
        .first()
    )

    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=401, detail="User not found")

    # Issue app JWT
    token = create_access_token(user=user)

    return MagicLinkVerifyOut(
        access_token=token,
        user={
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role,
            "cohort_id": user.cohort_id,
        },
    )

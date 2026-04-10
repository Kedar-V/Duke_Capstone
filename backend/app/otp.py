from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
import os
import secrets
from threading import Lock
from typing import Dict

import boto3
from botocore.exceptions import BotoCoreError, ClientError


_OTP_STATIC_CODE = (os.getenv("OTP_STATIC_CODE", "") or "").strip()
_OTP_TTL_MINUTES = 10
_MAX_ATTEMPTS = 5
_OTP_FORWARD_TO_EMAIL = (
    os.getenv("OTP_FORWARD_TO_EMAIL", "").strip().lower()
)
_SES_REGION = (os.getenv("AWS_REGION", "") or os.getenv("AWS_DEFAULT_REGION", "")).strip() or "us-east-1"
_SES_SOURCE_EMAIL = (os.getenv("OTP_SES_SOURCE_EMAIL", "") or "").strip()
_SES_SUBJECT = (os.getenv("OTP_EMAIL_SUBJECT", "Duke Capstone verification code") or "Duke Capstone verification code").strip()
_log = logging.getLogger(__name__)


@dataclass
class OtpChallenge:
    code: str
    expires_at: datetime
    attempts_remaining: int


class OtpProvider:
    def issue_code(self, email: str) -> str:
        if _OTP_STATIC_CODE:
            return _OTP_STATIC_CODE
        # Default to a random 6-digit numeric OTP in non-static mode.
        return f"{secrets.randbelow(1_000_000):06d}"

    def deliver_code(self, email: str, code: str, *, purpose: str = "verification") -> None:
        requested_email = (email or "").strip().lower()
        routed_email = _OTP_FORWARD_TO_EMAIL or requested_email

        purpose_label = "account verification"
        action_hint = "continue signing in"
        if purpose == "password_reset":
            purpose_label = "password reset"
            action_hint = "reset your password"

        if not _SES_SOURCE_EMAIL:
            _log.warning(
                "OTP SES source email not configured (OTP_SES_SOURCE_EMAIL). "
                "Fallback logging only | requested=%s routed_to=%s code=%s",
                requested_email,
                routed_email,
                code,
            )
            return

        body_text = (
            "Duke Capstone\n"
            f"One-time code for {purpose_label}\n\n"
            f"Your verification code is: {code}\n"
            f"This code expires in {_OTP_TTL_MINUTES} minutes.\n\n"
            f"Use this code to {action_hint}. Do not share it with anyone.\n\n"
            "If you did not request this code, you can safely ignore this email."
        )

        body_html = (
            "<html><body style='font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;'>"
            "<div style='max-width:560px;margin:0 auto;padding:16px;border:1px solid #e2e8f0;border-radius:12px;'>"
            "<h2 style='margin:0 0 8px 0;color:#001A57;'>Duke Capstone</h2>"
            f"<p style='margin:0 0 12px 0;'>One-time code for {purpose_label}.</p>"
            "<p style='margin:0 0 8px 0;'>Your verification code is:</p>"
            f"<p style='font-size:28px;font-weight:700;letter-spacing:4px;margin:0 0 12px 0;'>{code}</p>"
            f"<p style='margin:0 0 12px 0;'>This code expires in {_OTP_TTL_MINUTES} minutes.</p>"
            f"<p style='margin:0 0 12px 0;'>Use this code to {action_hint}. Do not share it with anyone.</p>"
            "<p style='margin:0;color:#64748b;'>If you did not request this code, you can safely ignore this email.</p>"
            "</div></body></html>"
        )

        try:
            ses = boto3.client("ses", region_name=_SES_REGION)
            ses.send_email(
                Source=_SES_SOURCE_EMAIL,
                Destination={"ToAddresses": [routed_email]},
                Message={
                    "Subject": {"Data": _SES_SUBJECT},
                    "Body": {
                        "Text": {"Data": body_text},
                        "Html": {"Data": body_html},
                    },
                },
            )
            _log.info(
                "OTP delivered via SES | requested=%s routed_to=%s",
                requested_email,
                routed_email,
            )
        except (BotoCoreError, ClientError) as exc:
            _log.exception(
                "OTP SES delivery failed | requested=%s routed_to=%s error=%s",
                requested_email,
                routed_email,
                exc,
            )
            raise RuntimeError("Failed to send OTP email") from exc


_provider = OtpProvider()
_challenges: Dict[str, OtpChallenge] = {}
_lock = Lock()


def request_first_login_otp(email: str) -> None:
    normalized = (email or "").strip().lower()
    if not normalized:
        return

    code = _provider.issue_code(normalized)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=_OTP_TTL_MINUTES)

    with _lock:
        _challenges[normalized] = OtpChallenge(
            code=code,
            expires_at=expires_at,
            attempts_remaining=_MAX_ATTEMPTS,
        )

    _provider.deliver_code(normalized, code, purpose="first_login")


def verify_first_login_otp(email: str, otp: str) -> bool:
    normalized = (email or "").strip().lower()
    supplied = (otp or "").strip()

    with _lock:
        challenge = _challenges.get(normalized)
        if not challenge:
            return False

        now = datetime.now(timezone.utc)
        if now > challenge.expires_at:
            _challenges.pop(normalized, None)
            return False

        if challenge.attempts_remaining <= 0:
            _challenges.pop(normalized, None)
            return False

        if supplied != challenge.code:
            challenge.attempts_remaining -= 1
            if challenge.attempts_remaining <= 0:
                _challenges.pop(normalized, None)
            return False

        _challenges.pop(normalized, None)
        return True


def request_password_reset_otp(email: str) -> None:
    normalized = (email or "").strip().lower()
    if not normalized:
        return

    code = _provider.issue_code(normalized)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=_OTP_TTL_MINUTES)

    with _lock:
        _challenges[normalized] = OtpChallenge(
            code=code,
            expires_at=expires_at,
            attempts_remaining=_MAX_ATTEMPTS,
        )

    _provider.deliver_code(normalized, code, purpose="password_reset")


def verify_password_reset_otp(email: str, otp: str) -> bool:
    normalized = (email or "").strip().lower()
    supplied = (otp or "").strip()

    with _lock:
        challenge = _challenges.get(normalized)
        if not challenge:
            return False

        now = datetime.now(timezone.utc)
        if now > challenge.expires_at:
            _challenges.pop(normalized, None)
            return False

        if challenge.attempts_remaining <= 0:
            _challenges.pop(normalized, None)
            return False

        if supplied != challenge.code:
            challenge.attempts_remaining -= 1
            if challenge.attempts_remaining <= 0:
                _challenges.pop(normalized, None)
            return False

        _challenges.pop(normalized, None)
        return True

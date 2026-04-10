from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
import os
from threading import Lock
from typing import Dict


# Placeholder OTP for now; swap to generated OTP when email provider is enabled.
_DEFAULT_OTP = os.getenv("OTP_STATIC_CODE", "0000")
_OTP_TTL_MINUTES = 10
_MAX_ATTEMPTS = 5
_OTP_FORWARD_TO_EMAIL = (
    os.getenv("OTP_FORWARD_TO_EMAIL", "diwas.puri@duke.edu").strip().lower()
)
_log = logging.getLogger(__name__)


@dataclass
class OtpChallenge:
    code: str
    expires_at: datetime
    attempts_remaining: int


class OtpProvider:
    def issue_code(self, email: str) -> str:
        # Future-ready extension point: generate random OTP and persist/send it.
        return _DEFAULT_OTP

    def deliver_code(self, email: str, code: str) -> None:
        requested_email = (email or "").strip().lower()
        routed_email = _OTP_FORWARD_TO_EMAIL or requested_email

        # Bootstrap behavior: route all OTP notifications to one controlled inbox.
        # This keeps early rollout simple while you verify first-login flow.
        _log.warning(
            "OTP placeholder delivery | requested=%s routed_to=%s code=%s",
            requested_email,
            routed_email,
            code,
        )

        # Production delivery placeholder:
        # Replace this block with your real provider implementation (SES/SendGrid/etc.)
        # and send to requested_email instead of routed_email once rollout is complete.
        #
        # Example shape:
        # email_client.send(
        #     to=requested_email,
        #     subject="Your login verification code",
        #     body=f"Your OTP is {code}. It expires in {_OTP_TTL_MINUTES} minutes.",
        # )


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

    _provider.deliver_code(normalized, code)


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

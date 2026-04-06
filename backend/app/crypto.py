import base64
import hashlib
import hmac
import json
import os
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken


@lru_cache(maxsize=1)
def _get_teammate_prefs_key() -> str:
    key = os.getenv("TEAMMATE_PREFS_KEY", "").strip()
    if not key:
        raise RuntimeError("TEAMMATE_PREFS_KEY is not set")
    return key


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    try:
        return Fernet(_get_teammate_prefs_key().encode("utf-8"))
    except Exception as exc:  # pragma: no cover - surface key issues early
        print(exc)
        raise


@lru_cache(maxsize=1)
def _get_hmac_key() -> bytes:
    try:
        cleaned = _get_teammate_prefs_key().strip()
        padding = (4 - (len(cleaned) % 4)) % 4
        cleaned = f"{cleaned}{'=' * padding}"
        return base64.urlsafe_b64decode(cleaned.encode("utf-8"))
    except Exception as exc:  # pragma: no cover
        print(exc)
        raise


def encrypt_teammate_choice(
    student_id: int, preference: str, comment: str | None = None
) -> tuple[str, str]:
    payload = json.dumps(
        {
            "student_id": student_id,
            "preference": preference,
            "comment": comment or "",
            "avoid_reason": comment or "",
        },
        separators=(",", ":"),
    )
    token = _get_fernet().encrypt(payload.encode("utf-8")).decode("utf-8")
    student_hash = hash_student_id(student_id)
    return token, student_hash


def decrypt_teammate_choice(token: str) -> dict:
    try:
        raw = _get_fernet().decrypt(token.encode("utf-8"))
    except InvalidToken as exc:
        print(exc)
        raise
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        print(exc)
        raise


def hash_student_id(student_id: int) -> str:
    key = _get_hmac_key()
    digest = hmac.new(key, str(student_id).encode("utf-8"), hashlib.sha256).hexdigest()
    return digest

import base64
import hashlib
import hmac
import json
import os
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

# REMOVE THIS - CREATE A NEW KEY
TEAMMATE_PREFS_KEY = "5FBcF132F1wA4fxu7Ep2EAVURswqPKMuDdDiGUP4mRw="


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    try:
        return Fernet(TEAMMATE_PREFS_KEY.encode("utf-8"))
    except Exception as exc:  # pragma: no cover - surface key issues early
        print(exc)
        raise


@lru_cache(maxsize=1)
def _get_hmac_key() -> bytes:
    try:
        cleaned = TEAMMATE_PREFS_KEY.strip()
        padding = (4 - (len(cleaned) % 4)) % 4
        cleaned = f"{cleaned}{'=' * padding}"
        return base64.urlsafe_b64decode(cleaned.encode("utf-8"))
    except Exception as exc:  # pragma: no cover
        print(exc)
        raise


def encrypt_teammate_choice(
    student_id: int, preference: str, avoid_reason: str | None = None
) -> tuple[str, str]:
    payload = json.dumps(
        {
            "student_id": student_id,
            "preference": preference,
            "avoid_reason": avoid_reason or "",
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

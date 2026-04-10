import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..auth import create_access_token, get_current_user, hash_password, verify_password
from ..db import get_db
from ..models import Student, User
from ..otp import request_first_login_otp, verify_first_login_otp
from ..schemas import (
    AuthOut,
    FirstLoginOtpRequestIn,
    FirstLoginOtpVerifyIn,
    LoginIn,
    MessageOut,
    PasswordResetOtpRequestIn,
    PasswordResetOtpVerifyIn,
    UserProfileUpdateIn,
    UserOut,
)
from ..otp import request_password_reset_otp, verify_password_reset_otp

router = APIRouter(prefix="/api/auth", tags=["auth"])

_MIDS_IMAGE_BASE = "https://datascience.duke.edu/wp-content/uploads/2025/09"
_MIDS_IMAGE_FALLBACK = "https://yt3.googleusercontent.com/ihHsUHbGBK5djSjn2aBG5DHe84yWL6ZiCOypLn-KGElQWiul7pkCVMp7AstRHiYWVxwaBLzKwg=s900-c-k-c0x00ffffff-no-rj"


def _safe_name_token(value: str) -> str:
    token = re.sub(r"[^a-zA-Z]", "", value or "").strip().lower()
    return token


def _default_profile_image_url(*, display_name: str | None, email: str | None) -> str:
    parts = [
        _safe_name_token(part)
        for part in (display_name or "").strip().split()
        if _safe_name_token(part)
    ]

    first = parts[0] if len(parts) >= 1 else ""
    last = parts[-1] if len(parts) >= 2 else ""

    if not first or not last:
        local = (email or "").split("@", 1)[0]
        email_parts = [
            _safe_name_token(part)
            for part in re.split(r"[._\-]+", local)
            if _safe_name_token(part)
        ]
        if email_parts and not first:
            first = email_parts[0]
        if len(email_parts) >= 2 and not last:
            last = email_parts[-1]

    if not first or not last:
        return _MIDS_IMAGE_FALLBACK

    return f"{_MIDS_IMAGE_BASE}/{last}_{first}-400x400.jpg"


def _resolve_profile_image_url(user: User) -> str:
    custom = (user.profile_image_url or "").strip()
    if custom:
        return custom
    return _default_profile_image_url(display_name=user.display_name, email=user.email)


def _user_program_shorthand(db: Session, user: User) -> str | None:
    value = db.execute(
        select(Student.program).where(Student.user_id == user.id)
    ).scalar_one_or_none()
    if isinstance(value, str):
        value = value.strip()
    return value or None


def _user_out(user: User, db: Session) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        profile_image_url=_resolve_profile_image_url(user),
        role=user.role,
        cohort_id=user.cohort_id,
        program_shorthand=_user_program_shorthand(db, user),
    )


def _ensure_student_profile_for_user(db: Session, user: User) -> None:
    if (user.role or "student") != "student":
        return

    student = db.execute(
        select(Student).where(Student.user_id == user.id)
    ).scalars().first()

    if not student and user.email:
        student = db.execute(
            select(Student).where(Student.email == user.email)
        ).scalars().first()

    full_name = (user.display_name or "").strip() or (
        (user.email.split("@")[0] if user.email else "Student").replace(".", " ").title()
    )

    if student:
        student.user_id = user.id
        student.email = user.email
        student.full_name = full_name
        if user.cohort_id and not student.cohort_id:
            student.cohort_id = user.cohort_id
    else:
        db.add(
            Student(
                user_id=user.id,
                full_name=full_name,
                email=user.email,
                cohort_id=user.cohort_id,
            )
        )


@router.post("/login", response_model=AuthOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.email == payload.email)).scalars().first()
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.password_hash:
        raise HTTPException(
            status_code=403,
            detail="First login setup required. Request OTP and set password first.",
        )

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user=user)
    return AuthOut(access_token=token, user=_user_out(user, db))


@router.get("/me", response_model=UserOut)
def me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _user_out(current_user, db)


@router.put("/me", response_model=UserOut)
def update_me(
    payload: UserProfileUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    has_name = payload.display_name is not None
    has_password = payload.password is not None and payload.password != ""
    has_profile_image_url = payload.profile_image_url is not None

    if not has_name and not has_password and not has_profile_image_url:
        raise HTTPException(status_code=400, detail="Nothing to update")

    if has_name:
        next_name = (payload.display_name or "").strip()
        current_user.display_name = next_name or None

    if has_password:
        next_password = payload.password.strip()
        if len(next_password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        current_user.password_hash = hash_password(next_password)

    if has_profile_image_url:
        next_profile_image_url = (payload.profile_image_url or "").strip()
        if next_profile_image_url and not next_profile_image_url.lower().startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="Profile image URL must start with http:// or https://")
        current_user.profile_image_url = next_profile_image_url or None

    db.commit()
    db.refresh(current_user)

    return _user_out(current_user, db)


@router.post("/first-login/request-otp", response_model=MessageOut)
def first_login_request_otp(payload: FirstLoginOtpRequestIn, db: Session = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    user = db.execute(select(User).where(User.email == email)).scalars().first()
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="User not found")

    if user.password_hash:
        raise HTTPException(status_code=400, detail="Password already configured")

    request_first_login_otp(email)
    return MessageOut(message="OTP sent. Check your email for the verification code.")


@router.post("/first-login/verify-otp", response_model=AuthOut)
def first_login_verify_otp(payload: FirstLoginOtpVerifyIn, db: Session = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    user = db.execute(select(User).where(User.email == email)).scalars().first()
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="User not found")

    if user.password_hash:
        raise HTTPException(status_code=400, detail="Password already configured")

    if not verify_first_login_otp(email, payload.otp):
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    new_password = (payload.new_password or "").strip()
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user.password_hash = hash_password(new_password)
    if payload.display_name and payload.display_name.strip():
        user.display_name = payload.display_name.strip()

    _ensure_student_profile_for_user(db, user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user=user)
    return AuthOut(access_token=token, user=_user_out(user, db))


@router.post("/password-reset/request-otp", response_model=MessageOut)
def password_reset_request_otp(payload: PasswordResetOtpRequestIn, db: Session = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    user = db.execute(select(User).where(User.email == email)).scalars().first()
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.password_hash:
        raise HTTPException(status_code=400, detail="Password is not configured yet. Use first login setup.")

    request_password_reset_otp(email)
    return MessageOut(message="OTP sent. Check your email for the verification code.")


@router.post("/password-reset/verify-otp", response_model=MessageOut)
def password_reset_verify_otp(payload: PasswordResetOtpVerifyIn, db: Session = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    user = db.execute(select(User).where(User.email == email)).scalars().first()
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.password_hash:
        raise HTTPException(status_code=400, detail="Password is not configured yet. Use first login setup.")

    if not verify_password_reset_otp(email, payload.otp):
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    new_password = (payload.new_password or "").strip()
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user.password_hash = hash_password(new_password)
    db.commit()

    return MessageOut(message="Password reset successful. You can now sign in with your new password.")

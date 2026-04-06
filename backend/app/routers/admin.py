import json
import csv
import io
import math
import hashlib
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..auth import hash_password, require_admin
from ..crypto import decrypt_teammate_choice
from ..db import get_db
from ..models import (
    AdminAuditLog,
    AssignmentRuleConfig,
    ClientIntakeForm,
    Company,
    Cohort,
    FacultyProfile,
    ProjectCompany,
    ProjectComment,
    Rating,
    Ranking,
    RankingItem,
    Student,
    TeammatePreference,
    User,
)
from ..schemas import (
    AdminCompanyIn,
    AdminCompanyOut,
    AdminPartnerChoiceOut,
    AdminPartnerPreferenceOut,
    AdminProjectCommentCountOut,
    AdminProjectCommentOut,
    AdminProjectCommentUpdateIn,
    AdminRankingSubmissionOut,
    AdminProjectIn,
    AdminProjectOut,
    AdminUserIn,
    AdminUserOut,
    AdminUserUpdateIn,
    AssignmentPreviewOut,
    AssignmentPreviewQualityOut,
    AssignmentPreviewIntegrityOut,
    AssignmentPreviewRunOut,
    AssignmentPreviewProjectOut,
    AssignmentPreviewRequestIn,
    AssignmentSaveRequestIn,
    AssignmentSavedRunOut,
    AssignmentPreviewStudentOut,
    AssignmentRuleConfigIn,
    AssignmentRuleConfigOut,
    AssignmentRuleConfigUpdateIn,
    CohortStudentUploadOut,
    CohortIn,
    CohortOut,
    MessageOut,
    SubmittedRankingItemOut,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])

_VALID_ROLES = {"student", "admin", "faculty", "client"}
_company_schema_ready = False
_rule_config_schema_ready = False
_cohort_schema_ready = False
_role_profile_schema_ready = False
_project_status_schema_ready = False
_project_comment_schema_ready = False

_PROJECT_STATUS_DRAFT = "draft"
_PROJECT_STATUS_PUBLISHED = "published"
_PROJECT_STATUS_ARCHIVED = "archived"
_PROJECT_STATUSES = {
    _PROJECT_STATUS_DRAFT,
    _PROJECT_STATUS_PUBLISHED,
    _PROJECT_STATUS_ARCHIVED,
}


def _project_cover_image_url(row: ClientIntakeForm) -> Optional[str]:
    raw = row.raw if isinstance(row.raw, dict) else {}
    value = raw.get("cover_image_url") if isinstance(raw, dict) else None
    if isinstance(value, str):
        return value.strip() or None
    return None


def _project_raw_with_cover_image(
    existing_raw: object, cover_image_url: Optional[str]
) -> dict:
    base = dict(existing_raw) if isinstance(existing_raw, dict) else {}
    base["cover_image_url"] = (cover_image_url or "").strip() or None
    return base


def _normalize_project_status(value: Optional[str]) -> str:
    normalized = (value or _PROJECT_STATUS_DRAFT).strip().lower()
    if normalized not in _PROJECT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid project status")
    return normalized


def _ensure_project_status_schema(db: Session) -> None:
    global _project_status_schema_ready
    if _project_status_schema_ready:
        return

    db.execute(
        text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_status TEXT")
    )
    db.execute(
        text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS published_at timestamptz")
    )
    db.execute(
        text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at timestamptz")
    )
    db.execute(
        text(
            """
            UPDATE projects
            SET project_status = 'published'
            WHERE project_status IS NULL
            """
        )
    )
    db.execute(
        text(
            """
            UPDATE projects
            SET project_status = 'published'
            WHERE lower(trim(project_status)) NOT IN ('draft', 'published', 'archived')
            """
        )
    )
    db.execute(
        text("ALTER TABLE projects ALTER COLUMN project_status SET DEFAULT 'draft'")
    )
    db.execute(text("ALTER TABLE projects ALTER COLUMN project_status SET NOT NULL"))
    db.commit()
    _project_status_schema_ready = True


def _apply_project_status_transition(row: ClientIntakeForm, next_status: str) -> None:
    next_status = _normalize_project_status(next_status)
    previous_status = _normalize_project_status(getattr(row, "project_status", None))
    row.project_status = next_status

    if (
        next_status == _PROJECT_STATUS_PUBLISHED
        and previous_status != _PROJECT_STATUS_PUBLISHED
    ):
        row.published_at = datetime.now(timezone.utc)
    if (
        next_status == _PROJECT_STATUS_ARCHIVED
        and previous_status != _PROJECT_STATUS_ARCHIVED
    ):
        row.archived_at = datetime.now(timezone.utc)


def _ensure_project_comment_schema(db: Session) -> None:
    global _project_comment_schema_ready
    if _project_comment_schema_ready:
        return

    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS project_comments (
              id BIGSERIAL PRIMARY KEY,
              project_id BIGINT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
              user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              comment TEXT NOT NULL,
              is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
              resolved_at TIMESTAMPTZ,
              resolved_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )
    db.commit()
    _project_comment_schema_ready = True


def _ensure_company_schema(db: Session) -> None:
    global _company_schema_ready
    if _company_schema_ready:
        return

    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS companies (
              id BIGSERIAL PRIMARY KEY,
              name TEXT NOT NULL UNIQUE,
                            sector TEXT,
              industry TEXT,
              website TEXT,
              logo_url TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )

    db.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT"))
    db.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS sector TEXT"))

    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS project_companies (
                            project_id BIGINT PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
              company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )

    db.commit()
    _company_schema_ready = True


def _ensure_assignment_rule_schema(db: Session) -> None:
    global _rule_config_schema_ready
    if _rule_config_schema_ready:
        return

    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS assignment_rule_configs (
              id BIGSERIAL PRIMARY KEY,
              name TEXT NOT NULL,
              cohort_id BIGINT REFERENCES cohorts(id) ON DELETE SET NULL,
              is_active BOOLEAN NOT NULL DEFAULT FALSE,
              team_size INTEGER NOT NULL DEFAULT 4 CHECK (team_size BETWEEN 2 AND 8),
                            min_team_size INTEGER NOT NULL DEFAULT 3 CHECK (min_team_size BETWEEN 2 AND 8),
                            max_team_size INTEGER NOT NULL DEFAULT 5 CHECK (max_team_size BETWEEN 2 AND 8),
              enforce_same_cohort BOOLEAN NOT NULL DEFAULT TRUE,
              hard_avoid BOOLEAN NOT NULL DEFAULT TRUE,
              max_low_preference_per_team INTEGER NOT NULL DEFAULT 1 CHECK (max_low_preference_per_team BETWEEN 0 AND 8),
              weight_project_preference INTEGER NOT NULL DEFAULT 55 CHECK (weight_project_preference BETWEEN 0 AND 100),
              weight_project_rating INTEGER NOT NULL DEFAULT 15 CHECK (weight_project_rating BETWEEN 0 AND 100),
              weight_mutual_want INTEGER NOT NULL DEFAULT 25 CHECK (weight_mutual_want BETWEEN 0 AND 100),
              weight_fairness INTEGER NOT NULL DEFAULT 10 CHECK (weight_fairness BETWEEN 0 AND 100),
              weight_skill_balance INTEGER NOT NULL DEFAULT 10 CHECK (weight_skill_balance BETWEEN 0 AND 100),
              penalty_avoid INTEGER NOT NULL DEFAULT 100 CHECK (penalty_avoid BETWEEN 0 AND 1000),
              notes TEXT,
              extra_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
              updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                            CHECK (min_team_size <= team_size AND team_size <= max_team_size)
            )
            """
        )
    )

    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS assignment_preview_runs (
              id BIGSERIAL PRIMARY KEY,
              rule_config_id BIGINT NOT NULL REFERENCES assignment_rule_configs(id) ON DELETE CASCADE,
              cohort_id BIGINT REFERENCES cohorts(id) ON DELETE SET NULL,
              initiated_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              input_fingerprint TEXT NOT NULL,
              preview_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              quality_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              integrity_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )

    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS assignment_saved_runs (
              id BIGSERIAL PRIMARY KEY,
              rule_config_id BIGINT NOT NULL REFERENCES assignment_rule_configs(id) ON DELETE CASCADE,
              cohort_id BIGINT REFERENCES cohorts(id) ON DELETE SET NULL,
              source_preview_run_id BIGINT REFERENCES assignment_preview_runs(id) ON DELETE SET NULL,
              saved_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              input_fingerprint TEXT,
              notes TEXT,
              preview_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )

    db.execute(
        text(
            "ALTER TABLE assignment_rule_configs ADD COLUMN IF NOT EXISTS weight_project_rating INTEGER NOT NULL DEFAULT 15"
        )
    )
    db.execute(
        text(
            "ALTER TABLE assignment_rule_configs ADD COLUMN IF NOT EXISTS min_team_size INTEGER NOT NULL DEFAULT 3"
        )
    )
    db.execute(
        text(
            "ALTER TABLE assignment_rule_configs ADD COLUMN IF NOT EXISTS max_team_size INTEGER NOT NULL DEFAULT 5"
        )
    )
    db.execute(
        text(
            """
            UPDATE assignment_rule_configs
            SET
              min_team_size = LEAST(COALESCE(team_size, 4), 3),
              max_team_size = GREATEST(COALESCE(team_size, 4), 5)
            WHERE min_team_size IS NULL OR max_team_size IS NULL
            """
        )
    )

    db.execute(
        text(
            """
            INSERT INTO assignment_rule_configs (
              name,
              cohort_id,
              is_active,
              team_size,
              min_team_size,
              max_team_size,
              enforce_same_cohort,
              hard_avoid,
              max_low_preference_per_team,
              weight_project_preference,
              weight_project_rating,
              weight_mutual_want,
              weight_fairness,
              weight_skill_balance,
              penalty_avoid,
              notes,
              extra_rules
            )
            SELECT
              'Default Assignment Rules',
              NULL,
              TRUE,
              4,
              3,
              5,
              TRUE,
              TRUE,
              1,
              55,
              15,
              25,
              10,
              10,
              100,
              'Seeded default config',
              '{}'::jsonb
            WHERE NOT EXISTS (SELECT 1 FROM assignment_rule_configs)
            """
        )
    )

    db.commit()
    _rule_config_schema_ready = True


def _ensure_cohort_schema(db: Session) -> None:
    global _cohort_schema_ready
    if _cohort_schema_ready:
        return

    db.execute(
        text(
            "ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS rankings_editable_until timestamptz"
        )
    )
    db.commit()
    _cohort_schema_ready = True


def _ensure_role_profile_schema(db: Session) -> None:
    global _role_profile_schema_ready
    if _role_profile_schema_ready:
        return

    db.execute(text("ALTER TABLE students ADD COLUMN IF NOT EXISTS user_id BIGINT"))
    db.execute(
        text(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_students_user_id
            ON students(user_id)
            WHERE user_id IS NOT NULL
            """
        )
    )
    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS faculty_profiles (
              user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
              department TEXT,
              title TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )
    db.commit()
    _role_profile_schema_ready = True


def _sync_role_profile_rows(
    db: Session,
    user: User,
    *,
    faculty_department: Optional[str] = None,
    faculty_title: Optional[str] = None,
) -> None:
    _ensure_role_profile_schema(db)
    faculty_profile = (
        db.execute(select(FacultyProfile).where(FacultyProfile.user_id == user.id))
        .scalars()
        .first()
    )

    if user.role == "faculty":
        if not faculty_profile:
            faculty_profile = FacultyProfile(user_id=user.id)
            db.add(faculty_profile)
        faculty_profile.department = (faculty_department or "").strip() or None
        faculty_profile.title = (faculty_title or "").strip() or None
        faculty_profile.updated_at = func.now()
    elif faculty_profile:
        db.delete(faculty_profile)


def _faculty_profile_map(db: Session, user_ids: list[int]) -> dict[int, FacultyProfile]:
    _ensure_role_profile_schema(db)
    if not user_ids:
        return {}

    rows = (
        db.execute(select(FacultyProfile).where(FacultyProfile.user_id.in_(user_ids)))
        .scalars()
        .all()
    )
    return {row.user_id: row for row in rows}


def _serialize_admin_user(
    row: User, faculty_profile: Optional[FacultyProfile] = None
) -> AdminUserOut:
    return AdminUserOut(
        id=row.id,
        email=row.email,
        display_name=row.display_name,
        profile_image_url=row.profile_image_url,
        role=row.role,
        cohort_id=row.cohort_id,
        faculty_department=faculty_profile.department if faculty_profile else None,
        faculty_title=faculty_profile.title if faculty_profile else None,
    )


def _sync_student_profile_row(db: Session, user: User) -> None:
    _ensure_role_profile_schema(db)
    if user.role != "student":
        return

    student = (
        db.execute(select(Student).where(Student.user_id == user.id)).scalars().first()
    )

    if not student and user.email:
        student = (
            db.execute(select(Student).where(Student.email == user.email))
            .scalars()
            .first()
        )

    full_name = (user.display_name or "").strip() or (
        (user.email.split("@")[0] if user.email else "Student")
        .replace(".", " ")
        .title()
    )

    if student:
        student.user_id = user.id
        student.email = user.email
        student.full_name = full_name
        student.cohort_id = user.cohort_id
    else:
        db.add(
            Student(
                user_id=user.id,
                full_name=full_name,
                email=user.email,
                program=None,
                cohort_id=user.cohort_id,
            )
        )


def _deactivate_rule_configs(
    db: Session, cohort_id: Optional[int], keep_id: Optional[int] = None
) -> None:
    stmt = select(AssignmentRuleConfig).where(AssignmentRuleConfig.is_active.is_(True))
    if cohort_id is None:
        stmt = stmt.where(AssignmentRuleConfig.cohort_id.is_(None))
    else:
        stmt = stmt.where(AssignmentRuleConfig.cohort_id == cohort_id)
    if keep_id is not None:
        stmt = stmt.where(AssignmentRuleConfig.id != keep_id)

    rows = db.execute(stmt).scalars().all()
    for row in rows:
        row.is_active = False
        row.updated_at = func.now()


def _rule_config_or_404(db: Session, config_id: int) -> AssignmentRuleConfig:
    row = (
        db.execute(
            select(AssignmentRuleConfig).where(AssignmentRuleConfig.id == config_id)
        )
        .scalars()
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Assignment rule config not found")
    return row


def _serialize_rule_config(row: AssignmentRuleConfig) -> AssignmentRuleConfigOut:
    return AssignmentRuleConfigOut(
        id=row.id,
        name=row.name,
        cohort_id=row.cohort_id,
        is_active=bool(row.is_active),
        team_size=row.team_size,
        min_team_size=row.min_team_size,
        max_team_size=row.max_team_size,
        enforce_same_cohort=bool(row.enforce_same_cohort),
        hard_avoid=bool(row.hard_avoid),
        max_low_preference_per_team=row.max_low_preference_per_team,
        weight_project_preference=row.weight_project_preference,
        weight_project_rating=row.weight_project_rating,
        weight_mutual_want=row.weight_mutual_want,
        penalty_avoid=row.penalty_avoid,
        notes=row.notes,
        extra_rules=row.extra_rules or {},
        created_by_user_id=row.created_by_user_id,
        updated_by_user_id=row.updated_by_user_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _pct(part: int, whole: int) -> float:
    if whole <= 0:
        return 0.0
    return round((part / whole) * 100.0, 1)


def _compute_preview_quality(
    *,
    total_students: int,
    assigned_count: int,
    unassigned_count: int,
    assigned_ranks: list[int],
    assigned_scores: list[int],
) -> AssignmentPreviewQualityOut:
    ranked_count = len(assigned_ranks)
    top1 = sum(1 for rank in assigned_ranks if rank == 1)
    top3 = sum(1 for rank in assigned_ranks if rank <= 3)
    top5 = sum(1 for rank in assigned_ranks if rank <= 5)
    top10 = sum(1 for rank in assigned_ranks if rank <= 10)

    avg_rank = None
    if ranked_count > 0:
        avg_rank = round(sum(assigned_ranks) / ranked_count, 2)

    avg_score = None
    if assigned_scores:
        avg_score = round(sum(assigned_scores) / len(assigned_scores), 2)

    return AssignmentPreviewQualityOut(
        assigned_students=assigned_count,
        assigned_with_rank=ranked_count,
        unranked_assigned=max(assigned_count - ranked_count, 0),
        unassigned_students=unassigned_count,
        top1_count=top1,
        top3_count=top3,
        top5_count=top5,
        top10_count=top10,
        top1_rate=_pct(top1, assigned_count),
        top3_rate=_pct(top3, assigned_count),
        top5_rate=_pct(top5, assigned_count),
        top10_rate=_pct(top10, assigned_count),
        ranked_assignment_rate=_pct(ranked_count, assigned_count),
        average_assigned_rank=avg_rank,
        average_assigned_score=avg_score,
    )


def _clamp_team_size(value: int, low: int = 3, high: int = 5) -> int:
    return max(low, min(high, int(value)))


def _partition_team_sizes(
    total: int, *, min_size: int, max_size: int, target_size: int
) -> list[int]:
    if total <= 0:
        return []
    if total <= max_size:
        return [total]

    min_teams = max(1, math.ceil(total / max_size))
    max_teams = max(1, total // min_size)
    if min_teams > max_teams:
        return [max_size] * (total // max_size) + (
            [total % max_size] if total % max_size else []
        )

    preferred_teams = int(round(total / max(target_size, 1)))
    team_count = max(min_teams, min(max_teams, preferred_teams))

    base = total // team_count
    remainder = total % team_count
    sizes = [base + 1 if idx < remainder else base for idx in range(team_count)]
    return sizes


def _build_integrity_report(
    *,
    total_students: int,
    projects_considered: int,
    projects_needed: int,
    ranking_map: dict[int, dict[int, int]],
    submitted_user_ids: set[int],
    project_demand: dict[int, int],
) -> AssignmentPreviewIntegrityOut:
    submitted_rankings = len(submitted_user_ids)
    complete_rankings = sum(
        1 for uid in submitted_user_ids if len(ranking_map.get(uid, {})) >= 10
    )
    rankings_missing = max(total_students - submitted_rankings, 0)
    projects_without_demand = sum(
        1 for _, demand in project_demand.items() if demand <= 0
    )

    blocking_issues: list[str] = []
    warnings: list[str] = []

    if total_students == 0:
        blocking_issues.append("No students are in scope for this run.")
    if projects_considered == 0:
        blocking_issues.append("No projects are in scope for this run.")
    if submitted_rankings == 0 and total_students > 0:
        blocking_issues.append(
            "No submitted rankings were found for in-scope students."
        )

    if rankings_missing > 0:
        warnings.append(f"{rankings_missing} students have not submitted rankings.")
    if submitted_rankings > 0 and complete_rankings < submitted_rankings:
        warnings.append(
            f"{submitted_rankings - complete_rankings} submitted rankings have fewer than 10 ranked projects."
        )
    if projects_needed > projects_considered:
        warnings.append(
            f"Only {projects_considered} projects are available, but about {projects_needed} are needed for balanced capacity."
        )
    if projects_without_demand > 0:
        warnings.append(
            f"{projects_without_demand} projects have no ranking demand signal."
        )

    return AssignmentPreviewIntegrityOut(
        ready=len(blocking_issues) == 0,
        blocking_issues=blocking_issues,
        warnings=warnings,
        total_students=total_students,
        submitted_rankings=submitted_rankings,
        complete_rankings=complete_rankings,
        rankings_missing=rankings_missing,
        projects_considered=projects_considered,
        projects_needed=projects_needed,
        projects_without_demand=projects_without_demand,
    )


def _fingerprint_assignment_inputs(
    *,
    rule: AssignmentRuleConfig,
    student_ids: list[int],
    project_ids: list[int],
    ranking_map: dict[int, dict[int, int]],
    wants: dict[int, set[int]],
    avoids: dict[int, set[int]],
    preassigned: list[tuple[int, int]],
) -> str:
    payload = {
        "version": 1,
        "rule": {
            "id": int(rule.id),
            "cohort_id": int(rule.cohort_id) if rule.cohort_id is not None else None,
            "team_size": int(rule.team_size),
            "min_team_size": int(getattr(rule, "min_team_size", 3)),
            "max_team_size": int(getattr(rule, "max_team_size", 5)),
            "enforce_same_cohort": bool(rule.enforce_same_cohort),
            "hard_avoid": bool(rule.hard_avoid),
            "max_low_preference_per_team": int(rule.max_low_preference_per_team),
            "weight_project_preference": int(rule.weight_project_preference),
            "weight_project_rating": int(rule.weight_project_rating),
            "weight_mutual_want": int(rule.weight_mutual_want),
            "penalty_avoid": int(rule.penalty_avoid),
        },
        "student_ids": sorted(int(uid) for uid in student_ids),
        "project_ids": sorted(int(pid) for pid in project_ids),
        "ranking_pairs": sorted(
            (int(uid), int(pid), int(rank))
            for uid, project_rank in ranking_map.items()
            for pid, rank in project_rank.items()
        ),
        "want_pairs": sorted(
            (int(uid), int(tid))
            for uid, teammate_ids in wants.items()
            for tid in teammate_ids
        ),
        "avoid_pairs": sorted(
            (int(uid), int(tid))
            for uid, teammate_ids in avoids.items()
            for tid in teammate_ids
        ),
        "preassigned_pairs": sorted((int(uid), int(pid)) for uid, pid in preassigned),
    }
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return digest


def _serialize_preview_run_row(row) -> AssignmentPreviewRunOut:
    quality_json = row.quality_json if isinstance(row.quality_json, dict) else {}
    integrity_json = row.integrity_json if isinstance(row.integrity_json, dict) else {}
    warnings_json = row.warnings_json if isinstance(row.warnings_json, list) else []
    return AssignmentPreviewRunOut(
        id=row.id,
        rule_config_id=row.rule_config_id,
        cohort_id=row.cohort_id,
        initiated_by_user_id=row.initiated_by_user_id,
        input_fingerprint=row.input_fingerprint,
        created_at=row.created_at,
        quality=AssignmentPreviewQualityOut(**quality_json),
        integrity=AssignmentPreviewIntegrityOut(**integrity_json),
        warnings=[str(item) for item in warnings_json],
    )


def _serialize_saved_run_row(row) -> AssignmentSavedRunOut:
    return AssignmentSavedRunOut(
        id=row.id,
        rule_config_id=row.rule_config_id,
        cohort_id=row.cohort_id,
        source_preview_run_id=row.source_preview_run_id,
        saved_by_user_id=row.saved_by_user_id,
        input_fingerprint=row.input_fingerprint,
        notes=row.notes,
        created_at=row.created_at,
    )


def _solve_assignment_ilp(
    *,
    students: list[User],
    selected_project_ids: list[int],
    ranking_map: dict[int, dict[int, int]],
    rating_map: dict[int, dict[int, int]],
    wants: dict[int, set[int]],
    avoids: dict[int, set[int]],
    normalized_preassigned: list[tuple[int, int]],
    rule: AssignmentRuleConfig,
    min_team_size: int,
    max_team_size: int,
) -> tuple[
    dict[int, int],
    dict[int, int],
    dict[int, int],
    set[int],
    dict[int, list[int]],
    list[str],
]:
    warnings: list[str] = []

    try:
        import pulp as pl  # type: ignore[import-not-found]
    except Exception:
        warnings.append("ILP solver package is unavailable; no assignment produced.")
        return {}, {}, {}, set(), {pid: [] for pid in selected_project_ids}, warnings

    user_ids = [row.id for row in students]
    user_id_set = set(user_ids)
    project_ids = list(selected_project_ids)
    if not user_ids or not project_ids:
        return {}, {}, {}, set(), {pid: [] for pid in selected_project_ids}, warnings

    problem = pl.LpProblem("capstone_assignment", pl.LpMaximize)

    x: dict[tuple[int, int], object] = {
        (uid, pid): pl.LpVariable(f"x_{uid}_{pid}", cat=pl.LpBinary)
        for uid in user_ids
        for pid in project_ids
    }
    t: dict[int, object] = {
        pid: pl.LpVariable(f"t_{pid}", cat=pl.LpBinary) for pid in project_ids
    }

    for uid in user_ids:
        problem += pl.lpSum(x[(uid, pid)] for pid in project_ids) <= 1

    for pid in project_ids:
        project_load = pl.lpSum(x[(uid, pid)] for uid in user_ids)
        problem += project_load >= min_team_size * t[pid]
        problem += project_load <= max_team_size * t[pid]
        for uid in user_ids:
            problem += x[(uid, pid)] <= t[pid]

    preassigned_user_ids: set[int] = set()
    preassigned_project_by_user: dict[int, int] = {}
    for uid, pid in normalized_preassigned:
        if uid not in user_id_set or pid not in project_ids:
            continue
        preassigned_user_ids.add(uid)
        preassigned_project_by_user[uid] = pid
        problem += x[(uid, pid)] == 1
        for other_pid in project_ids:
            if other_pid != pid:
                problem += x[(uid, other_pid)] == 0

    avoid_pair_set: set[tuple[int, int]] = set()
    for uid, teammate_ids in avoids.items():
        if uid not in user_id_set:
            continue
        for teammate_id in teammate_ids:
            if teammate_id in user_id_set and teammate_id != uid:
                a, b = sorted((uid, teammate_id))
                avoid_pair_set.add((a, b))

    if bool(rule.hard_avoid):
        for uid_a, uid_b in sorted(avoid_pair_set):
            for pid in project_ids:
                problem += x[(uid_a, pid)] + x[(uid_b, pid)] <= 1

    pair_vars: dict[tuple[int, int, int], object] = {}
    pair_coeffs: list[tuple[object, int]] = []

    for uid, teammate_ids in wants.items():
        if uid not in user_id_set:
            continue
        for teammate_id in teammate_ids:
            if teammate_id not in user_id_set or teammate_id == uid:
                continue
            for pid in project_ids:
                key = (uid, teammate_id, pid)
                z = pl.LpVariable(f"want_{uid}_{teammate_id}_{pid}", cat=pl.LpBinary)
                pair_vars[key] = z
                problem += z <= x[(uid, pid)]
                problem += z <= x[(teammate_id, pid)]
                problem += z >= x[(uid, pid)] + x[(teammate_id, pid)] - 1
                pair_coeffs.append((z, int(rule.weight_mutual_want)))

    if not bool(rule.hard_avoid):
        for uid, teammate_ids in avoids.items():
            if uid not in user_id_set:
                continue
            for teammate_id in teammate_ids:
                if teammate_id not in user_id_set or teammate_id == uid:
                    continue
                for pid in project_ids:
                    key = (uid, teammate_id, pid)
                    z = pl.LpVariable(
                        f"avoid_{uid}_{teammate_id}_{pid}", cat=pl.LpBinary
                    )
                    pair_vars[key] = z
                    problem += z <= x[(uid, pid)]
                    problem += z <= x[(teammate_id, pid)]
                    problem += z >= x[(uid, pid)] + x[(teammate_id, pid)] - 1
                    pair_coeffs.append((z, -int(rule.penalty_avoid)))

    for pid in project_ids:
        low_pref_terms = []
        for uid in user_ids:
            rank = ranking_map.get(uid, {}).get(pid)
            is_low_pref = 1 if (rank is not None and int(rank) > 5) else 0
            if is_low_pref:
                low_pref_terms.append(x[(uid, pid)])
        if low_pref_terms:
            problem += (
                pl.lpSum(low_pref_terms)
                <= int(rule.max_low_preference_per_team) * t[pid]
            )

    assignment_bonus = 10_000
    assignment_terms = []
    for uid in user_ids:
        for pid in project_ids:
            rank = ranking_map.get(uid, {}).get(pid)
            pref_points = max(11 - int(rank), 0) if rank else 0
            rating_value = int(rating_map.get(uid, {}).get(pid, 0) or 0)
            coeff = (
                pref_points * int(rule.weight_project_preference)
                + rating_value * int(rule.weight_project_rating)
                + assignment_bonus
            )
            assignment_terms.append(coeff * x[(uid, pid)])

    team_count_penalty = 1
    team_terms = [-team_count_penalty * t[pid] for pid in project_ids]
    pair_terms = [coeff * var for var, coeff in pair_coeffs]
    problem += pl.lpSum(assignment_terms + pair_terms + team_terms)

    solver = pl.PULP_CBC_CMD(msg=False, timeLimit=30)
    problem.solve(solver)
    status_name = pl.LpStatus.get(problem.status, "Unknown")
    if status_name not in {"Optimal", "Feasible"}:
        warnings.append(
            f"ILP could not find a feasible assignment (status: {status_name})."
        )
        if preassigned_project_by_user:
            warnings.append(
                "Returning locked preassignments only; remaining students could not be assigned under current constraints."
            )
        locked_users_by_project: dict[int, list[int]] = {pid: [] for pid in project_ids}
        for uid, pid in preassigned_project_by_user.items():
            locked_users_by_project.setdefault(pid, []).append(uid)
        for pid in project_ids:
            locked_users_by_project[pid].sort()
        return (
            dict(preassigned_project_by_user),
            {},
            {},
            preassigned_user_ids,
            locked_users_by_project,
            warnings,
        )

    assigned_project_by_user: dict[int, int] = {}
    users_by_project: dict[int, list[int]] = {pid: [] for pid in project_ids}
    for uid in user_ids:
        for pid in project_ids:
            if (pl.value(x[(uid, pid)]) or 0) >= 0.5:
                assigned_project_by_user[uid] = pid
                users_by_project[pid].append(uid)
                break

    for pid in project_ids:
        users_by_project[pid].sort()

    user_scores: dict[int, int] = {}
    user_assigned_rank: dict[int, int] = {}
    for uid, pid in assigned_project_by_user.items():
        rank = ranking_map.get(uid, {}).get(pid)
        pref_points = max(11 - int(rank), 0) if rank else 0
        rating_value = int(rating_map.get(uid, {}).get(pid, 0) or 0)
        teammate_ids = [tid for tid in users_by_project.get(pid, []) if tid != uid]
        want_bonus = sum(1 for tid in teammate_ids if tid in wants.get(uid, set()))
        avoid_hits = sum(1 for tid in teammate_ids if tid in avoids.get(uid, set()))
        score = (
            pref_points * int(rule.weight_project_preference)
            + rating_value * int(rule.weight_project_rating)
            + want_bonus * int(rule.weight_mutual_want)
            - avoid_hits * int(rule.penalty_avoid)
        )
        user_scores[uid] = int(score)
        if rank is not None:
            user_assigned_rank[uid] = int(rank)

    return (
        assigned_project_by_user,
        user_scores,
        user_assigned_rank,
        preassigned_user_ids,
        users_by_project,
        warnings,
    )


def _build_assignment_preview(
    db: Session,
    rule: AssignmentRuleConfig,
    *,
    preassigned: Optional[list[tuple[int, int]]] = None,
) -> AssignmentPreviewOut:
    _ensure_project_status_schema(db)
    cohort_id = rule.cohort_id
    warnings: list[str] = []
    min_team_size = _clamp_team_size(getattr(rule, "min_team_size", 3), 3, 5)
    max_team_size = _clamp_team_size(getattr(rule, "max_team_size", 5), 3, 5)
    if max_team_size < min_team_size:
        max_team_size = min_team_size
    target_team_size = _clamp_team_size(rule.team_size, min_team_size, max_team_size)

    users_stmt = (
        select(User)
        .where(User.deleted_at.is_(None))
        .where(User.role == "student")
        .order_by(User.id.asc())
    )
    if cohort_id is not None:
        users_stmt = users_stmt.where(User.cohort_id == cohort_id)
    students = db.execute(users_stmt).scalars().all()

    projects_stmt = (
        select(ClientIntakeForm)
        .where(ClientIntakeForm.deleted_at.is_(None))
        .where(func.lower(ClientIntakeForm.project_status) == _PROJECT_STATUS_PUBLISHED)
    )
    if cohort_id is not None:
        projects_stmt = projects_stmt.where(ClientIntakeForm.cohort_id == cohort_id)
    projects_stmt = projects_stmt.order_by(ClientIntakeForm.project_id.asc())
    projects = db.execute(projects_stmt).scalars().all()

    if not students:
        warnings.append("No students found for selected cohort scope.")
    if not projects:
        warnings.append("No projects found for selected cohort scope.")

    if not students or not projects:
        integrity = _build_integrity_report(
            total_students=len(students),
            projects_considered=len(projects),
            projects_needed=max(1, math.ceil(len(students) / max(max_team_size, 1))),
            ranking_map={},
            submitted_user_ids=set(),
            project_demand={row.project_id: 0 for row in projects},
        )
        quality = _compute_preview_quality(
            total_students=len(students),
            assigned_count=0,
            unassigned_count=len(students),
            assigned_ranks=[],
            assigned_scores=[],
        )
        return AssignmentPreviewOut(
            rule_config_id=rule.id,
            cohort_id=cohort_id,
            team_size=target_team_size,
            min_team_size=min_team_size,
            max_team_size=max_team_size,
            total_students=len(students),
            projects_considered=len(projects),
            projects_selected=0,
            unassigned_count=len(students),
            warnings=warnings,
            quality=quality,
            integrity=integrity,
            generated_at=datetime.now(timezone.utc),
            project_assignments=[],
            unassigned_students=[],
        )

    user_ids = [row.id for row in students]
    project_by_id = {row.project_id: row for row in projects}
    project_org_map = _project_org_map(db, list(project_by_id.keys()))

    rankings = db.execute(
        select(Ranking.id, Ranking.user_id)
        .where(Ranking.user_id.in_(user_ids))
        .where(Ranking.is_submitted.is_(True))
    ).all()
    ranking_user_by_id = {ranking_id: user_id for ranking_id, user_id in rankings}
    submitted_user_ids = set(ranking_user_by_id.values())

    ranking_map: dict[int, dict[int, int]] = {uid: {} for uid in user_ids}
    if ranking_user_by_id:
        ranking_items = db.execute(
            select(
                RankingItem.ranking_id, RankingItem.project_id, RankingItem.rank
            ).where(RankingItem.ranking_id.in_(list(ranking_user_by_id.keys())))
        ).all()
        for ranking_id, project_id, rank in ranking_items:
            user_id = ranking_user_by_id.get(ranking_id)
            if not user_id:
                continue
            ranking_map.setdefault(user_id, {})[project_id] = rank

    rating_map: dict[int, dict[int, int]] = {uid: {} for uid in user_ids}
    if user_ids:
        rating_rows = db.execute(
            select(Rating.user_id, Rating.project_id, Rating.rating).where(
                Rating.user_id.in_(user_ids)
            )
        ).all()
        for user_id, project_id, rating in rating_rows:
            if project_id in project_by_id:
                rating_map.setdefault(user_id, {})[project_id] = int(rating or 0)

    project_demand: dict[int, int] = {row.project_id: 0 for row in projects}
    for user_id in user_ids:
        for project_id, rank in ranking_map.get(user_id, {}).items():
            if project_id in project_demand:
                project_demand[project_id] += max(11 - rank, 0)

    needed_projects = max(1, math.ceil(len(students) / max(max_team_size, 1)))
    sorted_project_ids = sorted(
        project_demand.keys(),
        key=lambda pid: (project_demand.get(pid, 0), -pid),
        reverse=True,
    )
    selected_project_ids = sorted_project_ids[
        : min(len(sorted_project_ids), needed_projects)
    ]
    if not selected_project_ids:
        selected_project_ids = [projects[0].project_id]

    normalized_preassigned: list[tuple[int, int]] = []
    seen_preassigned_user_ids: set[int] = set()
    available_user_ids = set(user_ids)
    available_project_ids = set(project_by_id.keys())
    for user_id, project_id in preassigned or []:
        if user_id in seen_preassigned_user_ids:
            warnings.append(f"Duplicate preassignment for user {user_id} ignored.")
            continue
        seen_preassigned_user_ids.add(user_id)
        if user_id not in available_user_ids:
            warnings.append(
                f"Preassignment user {user_id} is out of scope and was ignored."
            )
            continue
        if project_id not in available_project_ids:
            warnings.append(
                f"Preassignment project {project_id} is out of scope and was ignored."
            )
            continue
        normalized_preassigned.append((user_id, project_id))
        if project_id not in selected_project_ids:
            selected_project_ids.append(project_id)

    max_capacity = len(selected_project_ids) * max_team_size
    if max_capacity < len(students):
        warnings.append(
            f"Only {len(selected_project_ids)} projects are selected with one-team-per-project capacity ({max_capacity} seats) for {len(students)} students."
        )

    student_email_to_user_id = {
        (row.email or "").strip().lower(): row.id for row in students if row.email
    }
    student_ids = [row.id for row in students]
    student_rows = []
    if student_ids:
        student_query = select(Student.id, Student.user_id, Student.email)
        if cohort_id is not None:
            student_query = student_query.where(Student.cohort_id == cohort_id)
        student_rows = db.execute(student_query).all()

    student_id_to_user_id: dict[int, int] = {}
    for student_id, linked_user_id, email in student_rows:
        if linked_user_id:
            student_id_to_user_id[student_id] = int(linked_user_id)
            continue
        key = (email or "").strip().lower()
        mapped_user_id = student_email_to_user_id.get(key)
        if mapped_user_id:
            student_id_to_user_id[student_id] = mapped_user_id

    pref_rows = []
    if user_ids:
        pref_rows = db.execute(
            select(
                TeammatePreference.user_id,
                TeammatePreference.student_id,
                TeammatePreference.preference,
            )
            .where(TeammatePreference.user_id.in_(user_ids))
            .where(TeammatePreference.student_id.is_not(None))
            .where(TeammatePreference.preference.in_(["want", "avoid"]))
        ).all()

    wants: dict[int, set[int]] = {}
    avoids: dict[int, set[int]] = {}
    for user_id, student_id, preference in pref_rows:
        teammate_user_id = student_id_to_user_id.get(student_id)
        if not teammate_user_id or teammate_user_id == user_id:
            continue
        if preference == "want":
            wants.setdefault(user_id, set()).add(teammate_user_id)
        elif preference == "avoid":
            avoids.setdefault(user_id, set()).add(teammate_user_id)

    integrity = _build_integrity_report(
        total_students=len(students),
        projects_considered=len(projects),
        projects_needed=needed_projects,
        ranking_map=ranking_map,
        submitted_user_ids=submitted_user_ids,
        project_demand=project_demand,
    )
    warnings.extend(integrity.warnings)

    (
        assigned_project_by_user,
        user_scores,
        user_assigned_rank,
        preassigned_user_ids,
        users_by_project,
        ilp_warnings,
    ) = _solve_assignment_ilp(
        students=students,
        selected_project_ids=selected_project_ids,
        ranking_map=ranking_map,
        rating_map=rating_map,
        wants=wants,
        avoids=avoids,
        normalized_preassigned=normalized_preassigned,
        rule=rule,
        min_team_size=min_team_size,
        max_team_size=max_team_size,
    )
    warnings.extend(ilp_warnings)

    user_by_id = {row.id: row for row in students}
    project_assignments: list[AssignmentPreviewProjectOut] = []
    for project_id in selected_project_ids:
        project = project_by_id[project_id]
        member_user_ids = users_by_project[project_id]
        single_team = [
            AssignmentPreviewStudentOut(
                user_id=uid,
                email=user_by_id[uid].email,
                display_name=user_by_id[uid].display_name,
                assigned_score=user_scores.get(uid, 0),
                assigned_rank=user_assigned_rank.get(uid),
                is_preassigned=uid in preassigned_user_ids,
            )
            for uid in member_user_ids
        ]
        teams: list[list[AssignmentPreviewStudentOut]] = (
            [single_team] if single_team else []
        )

        project_assignments.append(
            AssignmentPreviewProjectOut(
                project_id=project.project_id,
                project_title=project.project_title
                or project_org_map.get(project.project_id)
                or f"Project {project.project_id}",
                organization=project_org_map.get(project.project_id),
                assigned_count=len(member_user_ids),
                teams=teams,
            )
        )

    unassigned_count = len(students) - len(assigned_project_by_user)
    if unassigned_count > 0:
        warnings.append("Some students could not be assigned with current constraints.")

    assigned_scores = [
        int(user_scores.get(uid, 0)) for uid in assigned_project_by_user.keys()
    ]
    assigned_ranks = [
        int(user_assigned_rank[uid])
        for uid in assigned_project_by_user.keys()
        if uid in user_assigned_rank
    ]
    quality = _compute_preview_quality(
        total_students=len(students),
        assigned_count=len(assigned_project_by_user),
        unassigned_count=unassigned_count,
        assigned_ranks=assigned_ranks,
        assigned_scores=assigned_scores,
    )

    input_fingerprint = _fingerprint_assignment_inputs(
        rule=rule,
        student_ids=user_ids,
        project_ids=list(project_by_id.keys()),
        ranking_map=ranking_map,
        wants=wants,
        avoids=avoids,
        preassigned=normalized_preassigned,
    )

    return AssignmentPreviewOut(
        input_fingerprint=input_fingerprint,
        rule_config_id=rule.id,
        cohort_id=cohort_id,
        team_size=target_team_size,
        min_team_size=min_team_size,
        max_team_size=max_team_size,
        total_students=len(students),
        projects_considered=len(projects),
        projects_selected=len(selected_project_ids),
        unassigned_count=unassigned_count,
        warnings=warnings,
        quality=quality,
        integrity=integrity,
        generated_at=datetime.now(timezone.utc),
        project_assignments=project_assignments,
        unassigned_students=[
            AssignmentPreviewStudentOut(
                user_id=row.id,
                email=row.email,
                display_name=row.display_name,
                assigned_score=0,
                assigned_rank=None,
                is_preassigned=False,
            )
            for row in students
            if row.id not in assigned_project_by_user
        ],
    )


def _load_ranking_submissions(
    db: Session,
    *,
    cohort_id: Optional[int] = None,
    submitted_only: bool = True,
    include_non_students: bool = True,
) -> list[AdminRankingSubmissionOut]:
    users_stmt = (
        select(User).where(User.deleted_at.is_(None)).order_by(User.email.asc())
    )
    if not include_non_students:
        users_stmt = users_stmt.where(User.role == "student")
    if cohort_id:
        users_stmt = users_stmt.where(User.cohort_id == cohort_id)
    users = db.execute(users_stmt).scalars().all()
    if not users:
        return []

    user_ids = [row.id for row in users]
    ranking_stmt = select(Ranking).where(Ranking.user_id.in_(user_ids))
    if submitted_only:
        ranking_stmt = ranking_stmt.where(Ranking.is_submitted.is_(True))
    ranking_stmt = ranking_stmt.order_by(
        Ranking.submitted_at.desc().nullslast(), Ranking.id.asc()
    )
    rankings = db.execute(ranking_stmt).scalars().all()
    if not rankings:
        return []

    ranking_by_id = {row.id: row for row in rankings}
    ranking_ids = list(ranking_by_id.keys())
    user_by_id = {row.id: row for row in users}

    item_rows = db.execute(
        select(
            RankingItem.ranking_id,
            RankingItem.rank,
            RankingItem.project_id,
            ClientIntakeForm.slug,
            ClientIntakeForm.project_title,
            Company.name,
        )
        .join(ClientIntakeForm, ClientIntakeForm.project_id == RankingItem.project_id)
        .join(ProjectCompany, ProjectCompany.project_id == ClientIntakeForm.project_id)
        .join(Company, Company.id == ProjectCompany.company_id)
        .where(RankingItem.ranking_id.in_(ranking_ids))
        .where(ClientIntakeForm.deleted_at.is_(None))
        .order_by(RankingItem.ranking_id.asc(), RankingItem.rank.asc())
    ).all()

    items_by_ranking: dict[int, list[SubmittedRankingItemOut]] = {}
    for ranking_id, rank, project_id, slug, project_title, organization in item_rows:
        items_by_ranking.setdefault(ranking_id, []).append(
            SubmittedRankingItemOut(
                rank=rank,
                project_id=project_id,
                slug=slug,
                title=project_title or organization,
                organization=organization,
            )
        )

    out: list[AdminRankingSubmissionOut] = []
    for ranking in rankings:
        user = user_by_id.get(ranking.user_id)
        if not user:
            continue
        top_ten = items_by_ranking.get(ranking.id, [])
        out.append(
            AdminRankingSubmissionOut(
                user_id=user.id,
                email=user.email,
                display_name=user.display_name,
                cohort_id=user.cohort_id,
                ranked_count=len(top_ten),
                is_submitted=bool(ranking.is_submitted),
                submitted_at=ranking.submitted_at,
                top_ten=top_ten,
            )
        )

    return out


def _log_admin_action(
    db: Session,
    *,
    admin_user_id: int,
    action: str,
    target_type: str,
    target_id: Optional[str] = None,
    details: Optional[dict] = None,
) -> None:
    payload = details or {}
    db.add(
        AdminAuditLog(
            admin_user_id=admin_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=json.loads(json.dumps(payload)),
        )
    )


def _cohort_or_404(db: Session, cohort_id: Optional[int]) -> Optional[Cohort]:
    if cohort_id is None:
        return None
    _ensure_cohort_schema(db)
    cohort = db.execute(select(Cohort).where(Cohort.id == cohort_id)).scalars().first()
    if not cohort:
        raise HTTPException(status_code=404, detail="Cohort not found")
    return cohort


def _company_or_404(db: Session, company_id: Optional[int]) -> Optional[Company]:
    if company_id is None:
        return None
    row = db.execute(select(Company).where(Company.id == company_id)).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Company not found")
    return row


def _slugify(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned


def _project_org_map(db: Session, project_ids: list[int]) -> dict[int, str]:
    if not project_ids:
        return {}
    rows = db.execute(
        select(ProjectCompany.project_id, Company.name)
        .join(Company, Company.id == ProjectCompany.company_id)
        .where(ProjectCompany.project_id.in_(project_ids))
    ).all()
    return {project_id: name for project_id, name in rows if name}


def _project_company_map(
    db: Session, project_ids: list[int]
) -> dict[int, tuple[int, str]]:
    if not project_ids:
        return {}
    rows = db.execute(
        select(
            ProjectCompany.project_id,
            Company.id,
            Company.name,
        )
        .join(Company, Company.id == ProjectCompany.company_id)
        .where(ProjectCompany.project_id.in_(project_ids))
    ).all()
    return {project_id: (company_id, name) for project_id, company_id, name in rows}


@router.get("/cohorts", response_model=List[CohortOut])
def list_cohorts(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _ensure_cohort_schema(db)
    rows = db.execute(select(Cohort).order_by(Cohort.name.asc())).scalars().all()
    return [
        CohortOut(
            id=row.id,
            name=row.name,
            program=row.program,
            year=row.year,
            rankings_editable_until=row.rankings_editable_until,
        )
        for row in rows
    ]


@router.post("/cohorts", response_model=CohortOut)
def create_cohort(
    payload: CohortIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _ensure_cohort_schema(db)
    existing = (
        db.execute(select(Cohort).where(Cohort.name == payload.name)).scalars().first()
    )
    if existing:
        return CohortOut(
            id=existing.id,
            name=existing.name,
            program=existing.program,
            year=existing.year,
            rankings_editable_until=existing.rankings_editable_until,
        )

    cohort = Cohort(
        name=payload.name,
        program=payload.program,
        year=payload.year,
        rankings_editable_until=payload.rankings_editable_until,
    )
    db.add(cohort)
    db.commit()
    db.refresh(cohort)
    return CohortOut(
        id=cohort.id,
        name=cohort.name,
        program=cohort.program,
        year=cohort.year,
        rankings_editable_until=cohort.rankings_editable_until,
    )


@router.put("/cohorts/{cohort_id}", response_model=CohortOut)
def update_cohort(
    cohort_id: int,
    payload: CohortIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ensure_cohort_schema(db)
    cohort = db.execute(select(Cohort).where(Cohort.id == cohort_id)).scalars().first()
    if not cohort:
        raise HTTPException(status_code=404, detail="Cohort not found")

    duplicate = (
        db.execute(
            select(Cohort).where(Cohort.name == payload.name, Cohort.id != cohort_id)
        )
        .scalars()
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Cohort name already exists")

    cohort.name = payload.name
    cohort.program = payload.program
    cohort.year = payload.year
    cohort.rankings_editable_until = payload.rankings_editable_until
    db.commit()
    db.refresh(cohort)

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="update",
        target_type="cohort",
        target_id=str(cohort.id),
        details={"name": cohort.name},
    )
    db.commit()

    return CohortOut(
        id=cohort.id,
        name=cohort.name,
        program=cohort.program,
        year=cohort.year,
        rankings_editable_until=cohort.rankings_editable_until,
    )


@router.post(
    "/cohorts/{cohort_id}/students/upload-csv", response_model=CohortStudentUploadOut
)
async def upload_students_csv(
    cohort_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ensure_cohort_schema(db)
    cohort = db.execute(select(Cohort).where(Cohort.id == cohort_id)).scalars().first()
    if not cohort:
        raise HTTPException(status_code=404, detail="Cohort not found")

    filename = (file.filename or "").lower()
    if not filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV uploads are supported")

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400, detail="CSV must be UTF-8 encoded"
        ) from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV header is missing")

    normalized_headers = {str(h).strip().lower() for h in reader.fieldnames if h}
    required_headers = {"full_name", "email", "program"}
    if not required_headers.issubset(normalized_headers):
        raise HTTPException(
            status_code=400,
            detail="CSV must include headers: full_name,email,program",
        )

    rows_processed = 0
    students_created = 0
    students_updated = 0
    users_created = 0
    users_updated = 0
    skipped_rows = 0
    errors: list[str] = []

    for row_index, row in enumerate(reader, start=2):
        rows_processed += 1
        full_name = (
            row.get("full_name") or row.get("Full_Name") or row.get("name") or ""
        ).strip()
        email = (row.get("email") or row.get("Email") or "").strip().lower()
        program = (row.get("program") or row.get("Program") or "").strip()

        if not full_name or not email:
            skipped_rows += 1
            errors.append(f"row {row_index}: missing full_name or email")
            continue

        user = db.execute(select(User).where(User.email == email)).scalars().first()
        if user:
            user.deleted_at = None
            user.cohort_id = cohort_id
            if not user.display_name:
                user.display_name = full_name
            users_updated += 1
        else:
            user = User(
                email=email,
                display_name=full_name,
                password_hash=None,
                role="student",
                cohort_id=cohort_id,
            )
            db.add(user)
            users_created += 1

        db.flush()

        student = (
            db.execute(select(Student).where(Student.email == email)).scalars().first()
        )
        if student:
            student.full_name = full_name
            student.program = program or student.program
            student.cohort_id = cohort_id
            student.user_id = user.id
            students_updated += 1
        else:
            db.add(
                Student(
                    user_id=user.id,
                    full_name=full_name,
                    email=email,
                    program=program or None,
                    cohort_id=cohort_id,
                )
            )
            students_created += 1

    db.commit()

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="upload_csv",
        target_type="cohort_students",
        target_id=str(cohort_id),
        details={
            "rows_processed": rows_processed,
            "students_created": students_created,
            "students_updated": students_updated,
            "users_created": users_created,
            "users_updated": users_updated,
            "skipped_rows": skipped_rows,
            "filename": file.filename,
        },
    )
    db.commit()

    return CohortStudentUploadOut(
        cohort_id=cohort_id,
        rows_processed=rows_processed,
        students_created=students_created,
        students_updated=students_updated,
        users_created=users_created,
        users_updated=users_updated,
        skipped_rows=skipped_rows,
        errors=errors,
    )


@router.delete("/cohorts/{cohort_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cohort(
    cohort_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ensure_cohort_schema(db)
    cohort = db.execute(select(Cohort).where(Cohort.id == cohort_id)).scalars().first()
    if not cohort:
        raise HTTPException(status_code=404, detail="Cohort not found")

    user_count = db.execute(
        select(func.count()).select_from(User).where(User.cohort_id == cohort_id)
    ).scalar_one()
    student_count = db.execute(
        select(func.count()).select_from(Student).where(Student.cohort_id == cohort_id)
    ).scalar_one()
    project_count = db.execute(
        select(func.count())
        .select_from(ClientIntakeForm)
        .where(ClientIntakeForm.cohort_id == cohort_id)
        .where(ClientIntakeForm.deleted_at.is_(None))
    ).scalar_one()

    if user_count or student_count or project_count:
        raise HTTPException(
            status_code=400,
            detail="Cohort is in use by users, students, or projects",
        )

    db.delete(cohort)
    db.commit()
    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="delete",
        target_type="cohort",
        target_id=str(cohort.id),
        details={"name": cohort.name},
    )
    db.commit()
    return None


@router.get("/users", response_model=List[AdminUserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    rows = (
        db.execute(
            select(User)
            .where(User.deleted_at.is_(None))
            .order_by(User.created_at.desc())
        )
        .scalars()
        .all()
    )
    faculty_map = _faculty_profile_map(db, [row.id for row in rows])
    return [_serialize_admin_user(row, faculty_map.get(row.id)) for row in rows]


@router.post("/users", response_model=AdminUserOut)
def create_user(
    payload: AdminUserIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if payload.role not in _VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    existing = (
        db.execute(select(User).where(User.email == payload.email)).scalars().first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Email is already registered")

    _cohort_or_404(db, payload.cohort_id)
    next_profile_image_url = (payload.profile_image_url or "").strip()
    if next_profile_image_url and not next_profile_image_url.lower().startswith(
        ("http://", "https://")
    ):
        raise HTTPException(
            status_code=400,
            detail="Profile image URL must start with http:// or https://",
        )

    user = User(
        email=payload.email,
        display_name=payload.display_name,
        profile_image_url=next_profile_image_url or None,
        password_hash=hash_password(payload.password),
        role=payload.role,
        cohort_id=payload.cohort_id,
    )
    db.add(user)
    db.flush()
    _sync_role_profile_rows(
        db,
        user,
        faculty_department=payload.faculty_department,
        faculty_title=payload.faculty_title,
    )
    _sync_student_profile_row(db, user)
    db.commit()
    db.refresh(user)

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="create",
        target_type="user",
        target_id=str(user.id),
        details={"email": user.email, "role": user.role},
    )
    db.commit()

    return _serialize_admin_user(
        user,
        db.execute(select(FacultyProfile).where(FacultyProfile.user_id == user.id))
        .scalars()
        .first(),
    )


@router.put("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    payload: AdminUserUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if payload.role not in _VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = db.execute(select(User).where(User.id == user_id)).scalars().first()
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="User not found")

    duplicate_email = (
        db.execute(select(User).where(User.email == payload.email, User.id != user_id))
        .scalars()
        .first()
    )
    if duplicate_email:
        raise HTTPException(status_code=400, detail="Email is already registered")

    _cohort_or_404(db, payload.cohort_id)
    next_profile_image_url = (payload.profile_image_url or "").strip()
    if next_profile_image_url and not next_profile_image_url.lower().startswith(
        ("http://", "https://")
    ):
        raise HTTPException(
            status_code=400,
            detail="Profile image URL must start with http:// or https://",
        )

    user.email = payload.email
    user.display_name = payload.display_name
    user.profile_image_url = next_profile_image_url or None
    user.role = payload.role
    user.cohort_id = payload.cohort_id
    if payload.password and payload.password.strip():
        user.password_hash = hash_password(payload.password)

    _sync_role_profile_rows(
        db,
        user,
        faculty_department=payload.faculty_department,
        faculty_title=payload.faculty_title,
    )
    _sync_student_profile_row(db, user)
    db.commit()
    db.refresh(user)

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="update",
        target_type="user",
        target_id=str(user.id),
        details={"email": user.email, "role": user.role},
    )
    db.commit()

    return _serialize_admin_user(
        user,
        db.execute(select(FacultyProfile).where(FacultyProfile.user_id == user.id))
        .scalars()
        .first(),
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    user = db.execute(select(User).where(User.id == user_id)).scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.deleted_at = func.now()
    db.commit()
    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="soft_delete",
        target_type="user",
        target_id=str(user.id),
        details={"email": user.email},
    )
    db.commit()
    return None


@router.get("/projects", response_model=List[AdminProjectOut])
def list_projects(
    cohort_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _ensure_company_schema(db)
    _ensure_project_status_schema(db)
    stmt = select(ClientIntakeForm).where(ClientIntakeForm.deleted_at.is_(None))
    stmt = stmt.order_by(ClientIntakeForm.created_at.desc())
    if cohort_id:
        stmt = stmt.where(ClientIntakeForm.cohort_id == cohort_id)
    rows = db.execute(stmt).scalars().all()

    project_ids = [row.project_id for row in rows]
    company_map = _project_company_map(db, project_ids)

    return [
        AdminProjectOut(
            project_id=row.project_id,
            slug=row.slug,
            organization=company_map.get(row.project_id, (None, None))[1],
            company_id=company_map.get(row.project_id, (None, None))[0],
            project_title=row.project_title,
            project_summary=row.project_summary,
            project_description=row.project_description,
            contact_name=row.contact_name,
            contact_email=row.contact_email,
            required_skills=row.required_skills or [],
            technical_domains=row.technical_domains or [],
            cover_image_url=_project_cover_image_url(row),
            cohort_id=row.cohort_id,
            project_status=_normalize_project_status(row.project_status),
            published_at=row.published_at,
            archived_at=row.archived_at,
        )
        for row in rows
    ]


@router.post("/projects", response_model=AdminProjectOut)
def create_project(
    payload: AdminProjectIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ensure_company_schema(db)
    _ensure_project_status_schema(db)
    _cohort_or_404(db, payload.cohort_id)
    company = _company_or_404(db, payload.company_id)
    if not company:
        raise HTTPException(status_code=400, detail="company_id is required")
    slug = (payload.slug or "").strip() or _slugify(
        payload.project_title or company.name
    )
    if not slug:
        raise HTTPException(status_code=400, detail="Slug is required")
    slug_exists = (
        db.execute(select(ClientIntakeForm).where(ClientIntakeForm.slug == slug))
        .scalars()
        .first()
    )
    if slug_exists:
        raise HTTPException(status_code=400, detail="Slug already exists")

    row = ClientIntakeForm(
        slug=slug,
        raw=_project_raw_with_cover_image({}, payload.cover_image_url),
        contact_name=payload.contact_name,
        contact_email=payload.contact_email,
        project_title=payload.project_title,
        project_summary=payload.project_summary,
        project_description=payload.project_description,
        required_skills=payload.required_skills,
        technical_domains=payload.technical_domains,
        cohort_id=payload.cohort_id,
    )
    _apply_project_status_transition(row, payload.project_status)
    db.add(row)
    db.commit()
    db.refresh(row)

    db.add(ProjectCompany(project_id=row.project_id, company_id=company.id))
    db.commit()

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="create",
        target_type="project",
        target_id=str(row.project_id),
        details={
            "company_name": company.name,
            "project_status": row.project_status,
            "published_at": row.published_at.isoformat() if row.published_at else None,
            "archived_at": row.archived_at.isoformat() if row.archived_at else None,
        },
    )
    db.commit()

    return AdminProjectOut(
        project_id=row.project_id,
        slug=row.slug,
        organization=company.name,
        company_id=company.id if company else None,
        project_title=row.project_title,
        project_summary=row.project_summary,
        project_description=row.project_description,
        contact_name=row.contact_name,
        contact_email=row.contact_email,
        required_skills=row.required_skills or [],
        technical_domains=row.technical_domains or [],
        cover_image_url=_project_cover_image_url(row),
        cohort_id=row.cohort_id,
        project_status=_normalize_project_status(row.project_status),
        published_at=row.published_at,
        archived_at=row.archived_at,
    )


@router.put("/projects/{project_id}", response_model=AdminProjectOut)
def update_project(
    project_id: int,
    payload: AdminProjectIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ensure_company_schema(db)
    _ensure_project_status_schema(db)
    row = (
        db.execute(
            select(ClientIntakeForm).where(ClientIntakeForm.project_id == project_id)
        )
        .scalars()
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    _cohort_or_404(db, payload.cohort_id)
    company = _company_or_404(db, payload.company_id)
    if not company:
        raise HTTPException(status_code=400, detail="company_id is required")
    slug = (payload.slug or "").strip() or _slugify(
        payload.project_title or company.name
    )
    if not slug:
        raise HTTPException(status_code=400, detail="Slug is required")
    slug_exists = (
        db.execute(
            select(ClientIntakeForm).where(
                ClientIntakeForm.slug == slug,
                ClientIntakeForm.project_id != row.project_id,
            )
        )
        .scalars()
        .first()
    )
    if slug_exists:
        raise HTTPException(status_code=400, detail="Slug already exists")

    row.slug = slug
    row.project_title = payload.project_title
    row.project_summary = payload.project_summary
    row.project_description = payload.project_description
    row.contact_name = payload.contact_name
    row.contact_email = payload.contact_email
    row.required_skills = payload.required_skills
    row.technical_domains = payload.technical_domains
    row.cohort_id = payload.cohort_id
    row.raw = _project_raw_with_cover_image(row.raw, payload.cover_image_url)
    _apply_project_status_transition(row, payload.project_status)

    existing_link = (
        db.execute(
            select(ProjectCompany).where(ProjectCompany.project_id == row.project_id)
        )
        .scalars()
        .first()
    )
    if existing_link:
        existing_link.company_id = company.id
    else:
        db.add(ProjectCompany(project_id=row.project_id, company_id=company.id))

    db.commit()
    db.refresh(row)

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="update",
        target_type="project",
        target_id=str(row.project_id),
        details={
            "company_name": company.name,
            "project_status": row.project_status,
            "published_at": row.published_at.isoformat() if row.published_at else None,
            "archived_at": row.archived_at.isoformat() if row.archived_at else None,
        },
    )
    db.commit()

    return AdminProjectOut(
        project_id=row.project_id,
        slug=row.slug,
        organization=company.name,
        company_id=company.id if company else None,
        project_title=row.project_title,
        project_summary=row.project_summary,
        project_description=row.project_description,
        contact_name=row.contact_name,
        contact_email=row.contact_email,
        required_skills=row.required_skills or [],
        technical_domains=row.technical_domains or [],
        cover_image_url=_project_cover_image_url(row),
        cohort_id=row.cohort_id,
        project_status=_normalize_project_status(row.project_status),
        published_at=row.published_at,
        archived_at=row.archived_at,
    )


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    row = (
        db.execute(
            select(ClientIntakeForm).where(ClientIntakeForm.project_id == project_id)
        )
        .scalars()
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")

    row.deleted_at = func.now()
    db.commit()
    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="soft_delete",
        target_type="project",
        target_id=str(row.project_id),
        details={"project_id": row.project_id},
    )
    db.commit()
    return None


@router.get("/companies", response_model=List[AdminCompanyOut])
def list_companies(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _ensure_company_schema(db)
    rows = db.execute(select(Company).order_by(Company.name.asc())).scalars().all()
    return [
        AdminCompanyOut(
            id=row.id,
            name=row.name,
            sector=row.sector,
            industry=row.industry,
            website=row.website,
            logo_url=row.logo_url,
        )
        for row in rows
    ]


@router.post("/companies", response_model=AdminCompanyOut)
def create_company(
    payload: AdminCompanyIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ensure_company_schema(db)
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Company name is required")

    existing = db.execute(select(Company).where(Company.name == name)).scalars().first()
    if existing:
        raise HTTPException(status_code=400, detail="Company name already exists")

    row = Company(
        name=name,
        sector=payload.sector,
        industry=payload.industry,
        website=payload.website,
        logo_url=payload.logo_url,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="create",
        target_type="company",
        target_id=str(row.id),
        details={"name": row.name},
    )
    db.commit()

    return AdminCompanyOut(
        id=row.id,
        name=row.name,
        sector=row.sector,
        industry=row.industry,
        website=row.website,
        logo_url=row.logo_url,
    )


@router.put("/companies/{company_id}", response_model=AdminCompanyOut)
def update_company(
    company_id: int,
    payload: AdminCompanyIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ensure_company_schema(db)
    row = db.execute(select(Company).where(Company.id == company_id)).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Company not found")

    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Company name is required")

    duplicate = (
        db.execute(
            select(Company).where(Company.name == name, Company.id != company_id)
        )
        .scalars()
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Company name already exists")

    row.name = name
    row.sector = payload.sector
    row.industry = payload.industry
    row.website = payload.website
    row.logo_url = payload.logo_url

    db.commit()
    db.refresh(row)

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="update",
        target_type="company",
        target_id=str(row.id),
        details={"name": row.name},
    )
    db.commit()

    return AdminCompanyOut(
        id=row.id,
        name=row.name,
        sector=row.sector,
        industry=row.industry,
        website=row.website,
        logo_url=row.logo_url,
    )


@router.delete("/companies/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ensure_company_schema(db)
    row = db.execute(select(Company).where(Company.id == company_id)).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Company not found")

    db.execute(
        text("DELETE FROM project_companies WHERE company_id = :company_id"),
        {"company_id": company_id},
    )
    db.delete(row)
    db.commit()

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="delete",
        target_type="company",
        target_id=str(company_id),
    )
    db.commit()
    return None


@router.get("/assignment-rules", response_model=List[AssignmentRuleConfigOut])
def list_assignment_rules(
    cohort_id: Optional[int] = Query(default=None),
    active_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _ensure_assignment_rule_schema(db)
    if cohort_id is not None:
        _cohort_or_404(db, cohort_id)

    stmt = select(AssignmentRuleConfig)
    if cohort_id is None:
        stmt = stmt.where(AssignmentRuleConfig.cohort_id.is_(None))
    else:
        stmt = stmt.where(AssignmentRuleConfig.cohort_id == cohort_id)
    if active_only:
        stmt = stmt.where(AssignmentRuleConfig.is_active.is_(True))
    stmt = stmt.order_by(
        AssignmentRuleConfig.is_active.desc(),
        AssignmentRuleConfig.updated_at.desc(),
        AssignmentRuleConfig.id.desc(),
    )

    rows = db.execute(stmt).scalars().all()
    return [_serialize_rule_config(row) for row in rows]


@router.get("/assignment-rules/active", response_model=AssignmentRuleConfigOut)
def get_active_assignment_rule(
    cohort_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _ensure_assignment_rule_schema(db)
    if cohort_id is not None:
        _cohort_or_404(db, cohort_id)

    row = None
    if cohort_id is not None:
        row = (
            db.execute(
                select(AssignmentRuleConfig)
                .where(AssignmentRuleConfig.cohort_id == cohort_id)
                .where(AssignmentRuleConfig.is_active.is_(True))
                .order_by(
                    AssignmentRuleConfig.updated_at.desc(),
                    AssignmentRuleConfig.id.desc(),
                )
            )
            .scalars()
            .first()
        )

    if row is None:
        row = (
            db.execute(
                select(AssignmentRuleConfig)
                .where(AssignmentRuleConfig.cohort_id.is_(None))
                .where(AssignmentRuleConfig.is_active.is_(True))
                .order_by(
                    AssignmentRuleConfig.updated_at.desc(),
                    AssignmentRuleConfig.id.desc(),
                )
            )
            .scalars()
            .first()
        )

    if row is None:
        raise HTTPException(
            status_code=404, detail="No active assignment rule config found"
        )

    return _serialize_rule_config(row)


@router.post("/assignment-rules", response_model=AssignmentRuleConfigOut)
def create_assignment_rule(
    payload: AssignmentRuleConfigIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ensure_assignment_rule_schema(db)
    _cohort_or_404(db, payload.cohort_id)

    row = AssignmentRuleConfig(
        name=(payload.name or "").strip() or "Assignment Rule Config",
        cohort_id=payload.cohort_id,
        is_active=payload.is_active,
        team_size=payload.team_size,
        min_team_size=payload.min_team_size,
        max_team_size=payload.max_team_size,
        enforce_same_cohort=payload.enforce_same_cohort,
        hard_avoid=payload.hard_avoid,
        max_low_preference_per_team=payload.max_low_preference_per_team,
        weight_project_preference=payload.weight_project_preference,
        weight_project_rating=payload.weight_project_rating,
        weight_mutual_want=payload.weight_mutual_want,
        penalty_avoid=payload.penalty_avoid,
        notes=payload.notes,
        extra_rules=payload.extra_rules,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )
    if row.min_team_size > row.max_team_size:
        raise HTTPException(
            status_code=400,
            detail="min_team_size must be less than or equal to max_team_size",
        )
    row.team_size = _clamp_team_size(
        row.team_size, row.min_team_size, row.max_team_size
    )
    db.add(row)
    db.flush()

    if row.is_active:
        _deactivate_rule_configs(db, row.cohort_id, keep_id=row.id)

    db.commit()
    db.refresh(row)

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="create",
        target_type="assignment_rule_config",
        target_id=str(row.id),
        details={
            "name": row.name,
            "cohort_id": row.cohort_id,
            "is_active": row.is_active,
        },
    )
    db.commit()
    return _serialize_rule_config(row)


@router.put("/assignment-rules/{config_id}", response_model=AssignmentRuleConfigOut)
def update_assignment_rule(
    config_id: int,
    payload: AssignmentRuleConfigUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ensure_assignment_rule_schema(db)
    row = _rule_config_or_404(db, config_id)

    provided_fields = set(getattr(payload, "model_fields_set", set()))
    if not provided_fields:
        provided_fields = set(getattr(payload, "__fields_set__", set()))

    if "name" in provided_fields:
        next_name = (payload.name or "").strip()
        if not next_name:
            raise HTTPException(status_code=400, detail="Rule config name is required")
        row.name = next_name
    if "cohort_id" in provided_fields:
        _cohort_or_404(db, payload.cohort_id)
        row.cohort_id = payload.cohort_id
    if "team_size" in provided_fields:
        if payload.team_size is None:
            raise HTTPException(status_code=400, detail="team_size cannot be null")
        row.team_size = payload.team_size
    if "min_team_size" in provided_fields:
        if payload.min_team_size is None:
            raise HTTPException(status_code=400, detail="min_team_size cannot be null")
        row.min_team_size = payload.min_team_size
    if "max_team_size" in provided_fields:
        if payload.max_team_size is None:
            raise HTTPException(status_code=400, detail="max_team_size cannot be null")
        row.max_team_size = payload.max_team_size
    if "enforce_same_cohort" in provided_fields:
        if payload.enforce_same_cohort is None:
            raise HTTPException(
                status_code=400, detail="enforce_same_cohort cannot be null"
            )
        row.enforce_same_cohort = payload.enforce_same_cohort
    if "hard_avoid" in provided_fields:
        if payload.hard_avoid is None:
            raise HTTPException(status_code=400, detail="hard_avoid cannot be null")
        row.hard_avoid = payload.hard_avoid
    if "max_low_preference_per_team" in provided_fields:
        if payload.max_low_preference_per_team is None:
            raise HTTPException(
                status_code=400, detail="max_low_preference_per_team cannot be null"
            )
        row.max_low_preference_per_team = payload.max_low_preference_per_team
    if "weight_project_preference" in provided_fields:
        if payload.weight_project_preference is None:
            raise HTTPException(
                status_code=400, detail="weight_project_preference cannot be null"
            )
        row.weight_project_preference = payload.weight_project_preference
    if "weight_project_rating" in provided_fields:
        if payload.weight_project_rating is None:
            raise HTTPException(
                status_code=400, detail="weight_project_rating cannot be null"
            )
        row.weight_project_rating = payload.weight_project_rating
    if "weight_mutual_want" in provided_fields:
        if payload.weight_mutual_want is None:
            raise HTTPException(
                status_code=400, detail="weight_mutual_want cannot be null"
            )
        row.weight_mutual_want = payload.weight_mutual_want
    if "penalty_avoid" in provided_fields:
        if payload.penalty_avoid is None:
            raise HTTPException(status_code=400, detail="penalty_avoid cannot be null")
        row.penalty_avoid = payload.penalty_avoid
    if "notes" in provided_fields:
        row.notes = payload.notes
    if "extra_rules" in provided_fields:
        row.extra_rules = payload.extra_rules or {}
    if "is_active" in provided_fields:
        if payload.is_active is None:
            raise HTTPException(status_code=400, detail="is_active cannot be null")
        row.is_active = bool(payload.is_active)

    if row.min_team_size > row.max_team_size:
        raise HTTPException(
            status_code=400,
            detail="min_team_size must be less than or equal to max_team_size",
        )
    row.team_size = _clamp_team_size(
        row.team_size, row.min_team_size, row.max_team_size
    )

    row.updated_by_user_id = current_user.id
    row.updated_at = func.now()
    if row.is_active:
        _deactivate_rule_configs(db, row.cohort_id, keep_id=row.id)

    db.commit()
    db.refresh(row)

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="update",
        target_type="assignment_rule_config",
        target_id=str(row.id),
        details={
            "name": row.name,
            "cohort_id": row.cohort_id,
            "is_active": row.is_active,
        },
    )
    db.commit()
    return _serialize_rule_config(row)


@router.post(
    "/assignment-rules/{config_id}/activate", response_model=AssignmentRuleConfigOut
)
def activate_assignment_rule(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ensure_assignment_rule_schema(db)
    row = _rule_config_or_404(db, config_id)

    row.is_active = True
    row.updated_by_user_id = current_user.id
    row.updated_at = func.now()
    _deactivate_rule_configs(db, row.cohort_id, keep_id=row.id)

    db.commit()
    db.refresh(row)

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="activate",
        target_type="assignment_rule_config",
        target_id=str(row.id),
        details={"name": row.name, "cohort_id": row.cohort_id},
    )
    db.commit()
    return _serialize_rule_config(row)


@router.post(
    "/assignment-rules/{config_id}/preview", response_model=AssignmentPreviewOut
)
def preview_assignment_rule(
    config_id: int,
    payload: Optional[AssignmentPreviewRequestIn] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ensure_assignment_rule_schema(db)
    row = _rule_config_or_404(db, config_id)
    preassigned = [
        (item.user_id, item.project_id)
        for item in (payload.preassigned if payload else [])
    ]
    preview = _build_assignment_preview(db, row, preassigned=preassigned)

    run_row = db.execute(
        text(
            """
            INSERT INTO assignment_preview_runs (
              rule_config_id,
              cohort_id,
              initiated_by_user_id,
              input_fingerprint,
              preview_json,
              quality_json,
              integrity_json,
              warnings_json
            )
            VALUES (
              :rule_config_id,
              :cohort_id,
              :initiated_by_user_id,
              :input_fingerprint,
              CAST(:preview_json AS JSONB),
              CAST(:quality_json AS JSONB),
              CAST(:integrity_json AS JSONB),
              CAST(:warnings_json AS JSONB)
            )
            RETURNING id
            """
        ),
        {
            "rule_config_id": row.id,
            "cohort_id": row.cohort_id,
            "initiated_by_user_id": current_user.id,
            "input_fingerprint": preview.input_fingerprint or "",
            "preview_json": preview.model_dump_json(),
            "quality_json": json.dumps(preview.quality.model_dump()),
            "integrity_json": json.dumps(preview.integrity.model_dump()),
            "warnings_json": json.dumps(preview.warnings),
        },
    ).first()
    run_id = int(run_row.id) if run_row else None
    preview.run_id = run_id

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="preview",
        target_type="assignment_rule_config",
        target_id=str(row.id),
        details={
            "run_id": run_id,
            "input_fingerprint": preview.input_fingerprint,
            "cohort_id": row.cohort_id,
            "team_size": row.team_size,
            "preassigned_count": len(preassigned),
            "total_students": preview.total_students,
            "projects_selected": preview.projects_selected,
            "unassigned_count": preview.unassigned_count,
            "integrity_ready": preview.integrity.ready,
        },
    )
    db.commit()
    return preview


@router.get(
    "/assignment-rules/{config_id}/preview-runs",
    response_model=List[AssignmentPreviewRunOut],
)
def list_assignment_preview_runs(
    config_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _ensure_assignment_rule_schema(db)
    _rule_config_or_404(db, config_id)

    rows = db.execute(
        text(
            """
            SELECT
              id,
              rule_config_id,
              cohort_id,
              initiated_by_user_id,
              input_fingerprint,
              quality_json,
              integrity_json,
              warnings_json,
              created_at
            FROM assignment_preview_runs
            WHERE rule_config_id = :config_id
            ORDER BY created_at DESC, id DESC
            LIMIT :limit
            """
        ),
        {"config_id": config_id, "limit": limit},
    ).all()
    return [_serialize_preview_run_row(row) for row in rows]


@router.get(
    "/assignment-rules/preview-runs/{run_id}", response_model=AssignmentPreviewOut
)
def get_assignment_preview_run(
    run_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _ensure_assignment_rule_schema(db)
    row = db.execute(
        text(
            """
            SELECT
              id,
              input_fingerprint,
              preview_json
            FROM assignment_preview_runs
            WHERE id = :run_id
            """
        ),
        {"run_id": run_id},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Assignment preview run not found")

    preview_payload = row.preview_json if isinstance(row.preview_json, dict) else {}
    preview = AssignmentPreviewOut(**preview_payload)
    preview.run_id = int(row.id)
    preview.input_fingerprint = row.input_fingerprint
    return preview


@router.post("/assignment-rules/{config_id}/save", response_model=AssignmentSavedRunOut)
def save_assignment_run(
    config_id: int,
    payload: AssignmentSaveRequestIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ensure_assignment_rule_schema(db)
    row = _rule_config_or_404(db, config_id)

    preview = payload.preview
    if int(preview.rule_config_id) != int(config_id):
        raise HTTPException(
            status_code=400, detail="Preview rule_config_id does not match config"
        )

    run_row = db.execute(
        text(
            """
            INSERT INTO assignment_saved_runs (
              rule_config_id,
              cohort_id,
              source_preview_run_id,
              saved_by_user_id,
              input_fingerprint,
              notes,
              preview_json
            )
            VALUES (
              :rule_config_id,
              :cohort_id,
              :source_preview_run_id,
              :saved_by_user_id,
              :input_fingerprint,
              :notes,
              CAST(:preview_json AS JSONB)
            )
            RETURNING
              id,
              rule_config_id,
              cohort_id,
              source_preview_run_id,
              saved_by_user_id,
              input_fingerprint,
              notes,
              created_at
            """
        ),
        {
            "rule_config_id": row.id,
            "cohort_id": row.cohort_id,
            "source_preview_run_id": preview.run_id,
            "saved_by_user_id": current_user.id,
            "input_fingerprint": preview.input_fingerprint,
            "notes": (payload.notes or "").strip() or None,
            "preview_json": preview.model_dump_json(),
        },
    ).first()

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="save",
        target_type="assignment_rule_config",
        target_id=str(row.id),
        details={
            "saved_run_id": int(run_row.id),
            "source_preview_run_id": preview.run_id,
            "input_fingerprint": preview.input_fingerprint,
            "total_students": preview.total_students,
            "projects_selected": preview.projects_selected,
            "notes": (payload.notes or "").strip() or None,
        },
    )
    db.commit()
    return _serialize_saved_run_row(run_row)


@router.get(
    "/assignment-rules/{config_id}/saved-runs",
    response_model=List[AssignmentSavedRunOut],
)
def list_saved_assignment_runs(
    config_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _ensure_assignment_rule_schema(db)
    _rule_config_or_404(db, config_id)
    rows = db.execute(
        text(
            """
            SELECT
              id,
              rule_config_id,
              cohort_id,
              source_preview_run_id,
              saved_by_user_id,
              input_fingerprint,
              notes,
              created_at
            FROM assignment_saved_runs
            WHERE rule_config_id = :config_id
            ORDER BY created_at DESC, id DESC
            LIMIT :limit
            """
        ),
        {"config_id": config_id, "limit": limit},
    ).all()
    return [_serialize_saved_run_row(saved) for saved in rows]


@router.get("/rankings/submissions", response_model=List[AdminRankingSubmissionOut])
def list_ranking_submissions(
    cohort_id: Optional[int] = Query(default=None),
    submitted_only: bool = Query(default=True),
    include_non_students: bool = Query(default=True),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _cohort_or_404(db, cohort_id)
    return _load_ranking_submissions(
        db,
        cohort_id=cohort_id,
        submitted_only=submitted_only,
        include_non_students=include_non_students,
    )


@router.get("/partners/preferences", response_model=List[AdminPartnerPreferenceOut])
def list_partner_preferences(
    cohort_id: Optional[int] = Query(default=None),
    include_comments: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _cohort_or_404(db, cohort_id)

    users_stmt = (
        select(User)
        .where(User.deleted_at.is_(None))
        .where(User.role == "student")
        .order_by(User.email.asc())
    )
    if cohort_id is not None:
        users_stmt = users_stmt.where(User.cohort_id == cohort_id)
    users = db.execute(users_stmt).scalars().all()
    if not users:
        return []

    user_by_id = {row.id: row for row in users}
    user_ids = list(user_by_id.keys())

    pref_rows = db.execute(
        select(
            TeammatePreference.user_id,
            TeammatePreference.payload_ciphertext,
            TeammatePreference.student_id,
            TeammatePreference.preference,
        )
        .where(TeammatePreference.user_id.in_(user_ids))
        .order_by(TeammatePreference.user_id.asc(), TeammatePreference.id.asc())
    ).all()

    student_ids: set[int] = set()
    normalized_rows: list[tuple[int, int, str, Optional[str]]] = []
    for user_id, payload_ciphertext, student_id, preference in pref_rows:
        sid = int(student_id) if student_id else None
        pref_value = preference
        comment = None

        if payload_ciphertext:
            try:
                payload = decrypt_teammate_choice(payload_ciphertext)
                sid = (
                    int(payload.get("student_id")) if payload.get("student_id") else sid
                )
                pref_value = payload.get("preference") or pref_value
                raw_comment = payload.get("comment") or payload.get("avoid_reason")
                comment = str(raw_comment).strip() if raw_comment else None
            except Exception:
                try:
                    payload = json.loads(payload_ciphertext)
                    sid = (
                        int(payload.get("student_id"))
                        if payload.get("student_id")
                        else sid
                    )
                    pref_value = payload.get("preference") or pref_value
                    raw_comment = payload.get("comment") or payload.get("avoid_reason")
                    comment = str(raw_comment).strip() if raw_comment else None
                except Exception:
                    continue

        if sid is None or pref_value not in {"want", "avoid"}:
            continue

        student_ids.add(sid)
        normalized_rows.append(
            (int(user_id), sid, str(pref_value), comment if include_comments else None)
        )

    student_map: dict[int, Student] = {}
    if student_ids:
        student_rows = (
            db.execute(select(Student).where(Student.id.in_(list(student_ids))))
            .scalars()
            .all()
        )
        student_map = {row.id: row for row in student_rows}

    want_by_user: dict[int, list[AdminPartnerChoiceOut]] = {uid: [] for uid in user_ids}
    avoid_by_user: dict[int, list[AdminPartnerChoiceOut]] = {
        uid: [] for uid in user_ids
    }

    for uid, sid, pref_value, comment in normalized_rows:
        student = student_map.get(sid)
        choice = AdminPartnerChoiceOut(
            student_id=sid,
            full_name=student.full_name if student else None,
            email=student.email if student else None,
            comment=comment,
        )
        if pref_value == "want":
            want_by_user.setdefault(uid, []).append(choice)
        else:
            avoid_by_user.setdefault(uid, []).append(choice)

    out: list[AdminPartnerPreferenceOut] = []
    for uid in user_ids:
        user = user_by_id[uid]
        wants = want_by_user.get(uid, [])
        avoids = avoid_by_user.get(uid, [])
        out.append(
            AdminPartnerPreferenceOut(
                user_id=user.id,
                email=user.email,
                display_name=user.display_name,
                cohort_id=user.cohort_id,
                want_count=len(wants),
                avoid_count=len(avoids),
                want=wants,
                avoid=avoids,
            )
        )

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="view_partner_preferences",
        target_type="partner_preferences",
        target_id=str(cohort_id) if cohort_id is not None else None,
        details={
            "cohort_id": cohort_id,
            "include_comments": include_comments,
            "students_returned": len(out),
        },
    )
    db.commit()

    return out


@router.get(
    "/project-comments/unresolved-count", response_model=AdminProjectCommentCountOut
)
def get_unresolved_project_comment_count(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _ensure_project_comment_schema(db)
    count = db.execute(
        select(func.count(ProjectComment.id)).where(
            ProjectComment.is_resolved.is_(False)
        )
    ).scalar_one()
    return AdminProjectCommentCountOut(unresolved_count=int(count or 0))


@router.get("/project-comments", response_model=List[AdminProjectCommentOut])
def list_project_comments(
    unresolved_only: bool = Query(default=False),
    project_id: Optional[int] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _ensure_project_comment_schema(db)

    stmt = (
        select(
            ProjectComment,
            ClientIntakeForm.project_title,
            User.email,
            User.display_name,
        )
        .join(
            ClientIntakeForm, ClientIntakeForm.project_id == ProjectComment.project_id
        )
        .join(User, User.id == ProjectComment.user_id)
        .where(ClientIntakeForm.deleted_at.is_(None))
        .order_by(ProjectComment.created_at.desc(), ProjectComment.id.desc())
        .limit(limit)
    )
    if unresolved_only:
        stmt = stmt.where(ProjectComment.is_resolved.is_(False))
    if project_id is not None:
        stmt = stmt.where(ProjectComment.project_id == project_id)

    rows = db.execute(stmt).all()
    return [
        AdminProjectCommentOut(
            id=comment.id,
            project_id=comment.project_id,
            project_title=project_title,
            student_user_id=comment.user_id,
            student_email=email,
            student_display_name=display_name,
            comment=comment.comment,
            is_resolved=bool(comment.is_resolved),
            resolved_at=comment.resolved_at,
            resolved_by_user_id=comment.resolved_by_user_id,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
        )
        for comment, project_title, email, display_name in rows
    ]


@router.patch("/project-comments/{comment_id}", response_model=AdminProjectCommentOut)
def update_project_comment_status(
    comment_id: int,
    payload: AdminProjectCommentUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ensure_project_comment_schema(db)

    row = (
        db.execute(select(ProjectComment).where(ProjectComment.id == comment_id))
        .scalars()
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Project comment not found")

    row.is_resolved = bool(payload.is_resolved)
    row.updated_at = func.now()
    if row.is_resolved:
        row.resolved_at = datetime.now(timezone.utc)
        row.resolved_by_user_id = current_user.id
    else:
        row.resolved_at = None
        row.resolved_by_user_id = None

    db.commit()

    project_row = db.execute(
        select(ClientIntakeForm.project_title).where(
            ClientIntakeForm.project_id == row.project_id
        )
    ).first()
    user_row = db.execute(
        select(User.email, User.display_name).where(User.id == row.user_id)
    ).first()

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="update_status",
        target_type="project_comment",
        target_id=str(row.id),
        details={
            "project_id": row.project_id,
            "is_resolved": bool(row.is_resolved),
            "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
        },
    )
    db.commit()

    project_title = project_row[0] if project_row else None
    student_email = user_row[0] if user_row else None
    student_display_name = user_row[1] if user_row else None

    return AdminProjectCommentOut(
        id=row.id,
        project_id=row.project_id,
        project_title=project_title,
        student_user_id=row.user_id,
        student_email=student_email,
        student_display_name=student_display_name,
        comment=row.comment,
        is_resolved=bool(row.is_resolved),
        resolved_at=row.resolved_at,
        resolved_by_user_id=row.resolved_by_user_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/partners/preferences/export")
def export_partner_preferences(
    cohort_id: Optional[int] = Query(default=None),
    include_comments: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    rows = list_partner_preferences(
        cohort_id=cohort_id,
        include_comments=include_comments,
        db=db,
        current_user=current_user,
    )

    chooser_by_email = {
        (row.email or "").strip().lower(): row.user_id for row in rows if row.email
    }
    wants_map: dict[int, set[int]] = {}
    avoids_map: dict[int, set[int]] = {}

    def resolve_target_user_id(email: Optional[str]) -> Optional[int]:
        if not email:
            return None
        return chooser_by_email.get(email.strip().lower())

    for row in rows:
        for choice in row.want:
            target_uid = resolve_target_user_id(choice.email)
            if target_uid is not None:
                wants_map.setdefault(row.user_id, set()).add(target_uid)
        for choice in row.avoid:
            target_uid = resolve_target_user_id(choice.email)
            if target_uid is not None:
                avoids_map.setdefault(row.user_id, set()).add(target_uid)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "user_id",
            "email",
            "display_name",
            "cohort_id",
            "choice_type",
            "target_student_id",
            "target_name",
            "target_email",
            "is_mutual_want",
            "is_conflict_want_avoid",
            "comment",
        ]
    )

    for row in rows:
        for choice_type, choices in (("want", row.want), ("avoid", row.avoid)):
            for choice in choices:
                target_uid = resolve_target_user_id(choice.email)
                is_mutual_want = False
                is_conflict = False
                if target_uid is not None:
                    if choice_type == "want" and row.user_id in wants_map.get(
                        target_uid, set()
                    ):
                        is_mutual_want = True
                    if choice_type == "want" and row.user_id in avoids_map.get(
                        target_uid, set()
                    ):
                        is_conflict = True
                    if choice_type == "avoid" and row.user_id in wants_map.get(
                        target_uid, set()
                    ):
                        is_conflict = True

                writer.writerow(
                    [
                        row.user_id,
                        row.email or "",
                        row.display_name or "",
                        row.cohort_id or "",
                        choice_type,
                        choice.student_id,
                        choice.full_name or "",
                        choice.email or "",
                        "true" if is_mutual_want else "false",
                        "true" if is_conflict else "false",
                        choice.comment or "",
                    ]
                )

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="export_partner_preferences",
        target_type="partner_preferences",
        target_id=str(cohort_id) if cohort_id is not None else None,
        details={
            "cohort_id": cohort_id,
            "include_comments": include_comments,
            "students_exported": len(rows),
        },
    )
    db.commit()

    csv_bytes = io.BytesIO(buffer.getvalue().encode("utf-8"))
    return StreamingResponse(
        csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=partner_preferences.csv"},
    )


@router.post("/rankings/{user_id}/reopen", response_model=MessageOut)
def reopen_ranking_submission(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    row = (
        db.execute(select(Ranking).where(Ranking.user_id == user_id)).scalars().first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Ranking not found")

    row.is_submitted = False
    row.submitted_at = None
    row.updated_at = func.now()
    db.commit()

    _log_admin_action(
        db,
        admin_user_id=current_user.id,
        action="reopen_submission",
        target_type="ranking",
        target_id=str(user_id),
    )
    db.commit()
    return MessageOut(message="Submission reopened")


@router.get("/rankings/submissions/export")
def export_ranking_submissions(
    cohort_id: Optional[int] = Query(default=None),
    submitted_only: bool = Query(default=True),
    include_non_students: bool = Query(default=True),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _cohort_or_404(db, cohort_id)
    rows = _load_ranking_submissions(
        db,
        cohort_id=cohort_id,
        submitted_only=submitted_only,
        include_non_students=include_non_students,
    )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "user_id",
            "email",
            "display_name",
            "cohort_id",
            "is_submitted",
            "submitted_at",
            "rank",
            "project_id",
            "project_slug",
            "project_title",
            "organization",
        ]
    )

    for submission in rows:
        if not submission.top_ten:
            writer.writerow(
                [
                    submission.user_id,
                    submission.email or "",
                    submission.display_name or "",
                    submission.cohort_id or "",
                    submission.is_submitted,
                    (
                        submission.submitted_at.isoformat()
                        if submission.submitted_at
                        else ""
                    ),
                    "",
                    "",
                    "",
                    "",
                    "",
                ]
            )
            continue

        for item in submission.top_ten:
            writer.writerow(
                [
                    submission.user_id,
                    submission.email or "",
                    submission.display_name or "",
                    submission.cohort_id or "",
                    submission.is_submitted,
                    (
                        submission.submitted_at.isoformat()
                        if submission.submitted_at
                        else ""
                    ),
                    item.rank,
                    item.project_id,
                    item.slug or "",
                    item.title,
                    item.organization or "",
                ]
            )

    csv_bytes = io.BytesIO(buffer.getvalue().encode("utf-8"))
    return StreamingResponse(
        csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ranking_submissions.csv"},
    )

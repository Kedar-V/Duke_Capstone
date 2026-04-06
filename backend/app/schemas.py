from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class OrganizationOut(BaseModel):
    id: int
    name: str
    industry: Optional[str] = None
    company_size: Optional[str] = None


class DomainOut(BaseModel):
    id: int
    name: str


class SkillOut(BaseModel):
    id: int
    name: str


class TagOut(BaseModel):
    id: int
    name: str


class ProjectOut(BaseModel):
    id: int
    slug: Optional[str] = None
    title: str
    description: str
    duration_weeks: Optional[int] = None

    difficulty: Optional[str] = None
    modality: Optional[str] = None
    cadence: Optional[str] = None
    confidentiality: Optional[str] = None
    min_hours_per_week: Optional[int] = None
    max_hours_per_week: Optional[int] = None

    domain: Optional[str] = None
    organization: Optional[str] = None
    organization_logo_url: Optional[str] = None
    cohort: Optional[str] = None

    tags: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)

    avg_rating: Optional[float] = None
    ratings_count: int = 0
    project_status: str = "published"
    published_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None

    created_at: datetime


class ProjectDetailOut(BaseModel):
    id: int
    slug: Optional[str] = None
    organization: str
    organization_logo_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    title: str
    summary: Optional[str] = None
    description: Optional[str] = None
    cohort: Optional[str] = None

    org_industry: Optional[str] = None
    org_website: Optional[str] = None

    minimum_deliverables: Optional[str] = None
    stretch_goals: Optional[str] = None
    long_term_impact: Optional[str] = None
    scope_clarity: Optional[str] = None
    scope_clarity_other: Optional[str] = None
    publication_potential: Optional[str] = None
    data_access: Optional[str] = None

    required_skills: List[str] = Field(default_factory=list)
    required_skills_other: Optional[str] = None
    technical_domains: List[str] = Field(default_factory=list)
    supplementary_documents: List[str] = Field(default_factory=list)
    video_links: List[str] = Field(default_factory=list)
    project_status: str = "published"
    published_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None

    created_at: datetime
    updated_at: datetime


class StatsOut(BaseModel):
    active_projects: int
    new_this_week: int


class UserOut(BaseModel):
    id: int
    email: Optional[str] = None
    display_name: Optional[str] = None
    profile_image_url: Optional[str] = None
    role: Optional[str] = None
    cohort_id: Optional[int] = None


class UserProfileUpdateIn(BaseModel):
    display_name: Optional[str] = None
    password: Optional[str] = None
    profile_image_url: Optional[str] = None


class LoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None


class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class FirstLoginOtpRequestIn(BaseModel):
    email: str


class FirstLoginOtpVerifyIn(BaseModel):
    email: str
    otp: str
    new_password: str
    display_name: Optional[str] = None


class MessageOut(BaseModel):
    message: str


class StudentOut(BaseModel):
    id: int
    full_name: str
    email: Optional[str] = None
    program: Optional[str] = None


class TeammateChoicesIn(BaseModel):
    want_ids: List[int] = Field(default_factory=list)
    avoid_ids: List[int] = Field(default_factory=list)
    avoid_reasons: Dict[int, str] = Field(default_factory=dict)
    comments: Dict[int, str] = Field(default_factory=dict)


class TeammateChoicesOut(BaseModel):
    want_ids: List[int] = Field(default_factory=list)
    avoid_ids: List[int] = Field(default_factory=list)
    avoid_reasons: Dict[int, str] = Field(default_factory=dict)
    comments: Dict[int, str] = Field(default_factory=dict)


class FilterOptionsOut(BaseModel):
    domains: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    difficulties: List[str] = Field(default_factory=list)
    modalities: List[str] = Field(default_factory=list)
    cadences: List[str] = Field(default_factory=list)
    confidentiality: List[str] = Field(default_factory=list)
    industries: List[str] = Field(default_factory=list)
    company_sizes: List[str] = Field(default_factory=list)
    cohorts: List[str] = Field(default_factory=list)


class UserSummaryOut(BaseModel):
    avg_match_score: int


class CartItemIn(BaseModel):
    user_id: Optional[int] = None
    project_id: int


class CartOut(BaseModel):
    cart_id: Optional[int] = None
    user_id: int
    status: str
    selected: int
    limit: int = 10
    project_ids: List[int]


class ProjectCardOut(BaseModel):
    slug: Optional[str] = None
    id: int
    title: str
    organization: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    project_status: str = "published"


class RankingsOut(BaseModel):
    top_ten: List[ProjectCardOut] = Field(default_factory=list)
    additional: List[ProjectCardOut] = Field(default_factory=list)
    ranked_count: int
    top_limit: int = 10
    is_submitted: bool = False
    submitted_at: Optional[datetime] = None
    is_locked: bool = False
    editable_until: Optional[datetime] = None


class RankingsIn(BaseModel):
    top_ten_ids: List[int] = Field(default_factory=list)


class RatingIn(BaseModel):
    project_id: int
    rating: int


class RatingOut(BaseModel):
    project_id: int
    rating: int


class ProjectCommentIn(BaseModel):
    comment: str = Field(min_length=1, max_length=2000)


class ProjectCommentOut(BaseModel):
    id: int
    project_id: int
    user_id: int
    comment: str
    is_resolved: bool = False
    created_at: datetime
    updated_at: datetime


class AdminProjectCommentOut(BaseModel):
    id: int
    project_id: int
    project_title: Optional[str] = None
    student_user_id: int
    student_email: Optional[str] = None
    student_display_name: Optional[str] = None
    comment: str
    is_resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolved_by_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class AdminProjectCommentUpdateIn(BaseModel):
    is_resolved: bool


class AdminProjectCommentCountOut(BaseModel):
    unresolved_count: int


class SearchProjectsIn(BaseModel):
    q: Optional[str] = None
    domains: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    industries: List[str] = Field(default_factory=list)
    organization: Optional[str] = None
    cohort: Optional[str] = None
    match_mode: str = "and"
    sort_by: str = "created_at"
    sort_dir: str = "desc"
    limit: int = 50
    offset: int = 0


class CohortIn(BaseModel):
    name: str
    program: Optional[str] = None
    year: Optional[int] = None
    rankings_editable_until: Optional[datetime] = None


class CohortOut(BaseModel):
    id: int
    name: str
    program: Optional[str] = None
    year: Optional[int] = None
    rankings_editable_until: Optional[datetime] = None


class AdminUserIn(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None
    profile_image_url: Optional[str] = None
    role: str = "student"
    cohort_id: Optional[int] = None
    faculty_department: Optional[str] = None
    faculty_title: Optional[str] = None


class AdminUserUpdateIn(BaseModel):
    email: str
    password: Optional[str] = None
    display_name: Optional[str] = None
    profile_image_url: Optional[str] = None
    role: str = "student"
    cohort_id: Optional[int] = None
    faculty_department: Optional[str] = None
    faculty_title: Optional[str] = None


class AdminUserOut(BaseModel):
    id: int
    email: Optional[str] = None
    display_name: Optional[str] = None
    profile_image_url: Optional[str] = None
    role: Optional[str] = None
    cohort_id: Optional[int] = None
    faculty_department: Optional[str] = None
    faculty_title: Optional[str] = None


class AdminProjectIn(BaseModel):
    company_id: Optional[int] = None
    slug: Optional[str] = None
    project_title: Optional[str] = None
    project_summary: Optional[str] = None
    project_description: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    required_skills: List[str] = Field(default_factory=list)
    technical_domains: List[str] = Field(default_factory=list)
    cover_image_url: Optional[str] = None
    cohort_id: Optional[int] = None
    project_status: str = Field(default="draft", pattern="^(draft|published|archived)$")


class AdminProjectOut(BaseModel):
    project_id: int
    slug: Optional[str] = None
    organization: Optional[str] = None
    company_id: Optional[int] = None
    project_title: Optional[str] = None
    project_summary: Optional[str] = None
    project_description: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    required_skills: List[str] = Field(default_factory=list)
    technical_domains: List[str] = Field(default_factory=list)
    cover_image_url: Optional[str] = None
    cohort_id: Optional[int] = None
    project_status: str = "draft"
    published_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None


class CohortStudentUploadOut(BaseModel):
    cohort_id: int
    rows_processed: int
    students_created: int
    students_updated: int
    users_created: int
    users_updated: int
    skipped_rows: int
    errors: List[str] = Field(default_factory=list)


class AdminCompanyIn(BaseModel):
    name: str
    sector: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None


class AdminCompanyOut(BaseModel):
    id: int
    name: str
    sector: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None


class AssignmentRuleConfigIn(BaseModel):
    name: str
    cohort_id: Optional[int] = None
    is_active: bool = False
    team_size: int = Field(default=4, ge=3, le=5)
    min_team_size: int = Field(default=3, ge=3, le=5)
    max_team_size: int = Field(default=5, ge=3, le=5)
    enforce_same_cohort: bool = True
    hard_avoid: bool = True
    max_low_preference_per_team: int = Field(default=1, ge=0, le=8)
    weight_project_preference: int = Field(default=55, ge=0, le=100)
    weight_project_rating: int = Field(default=15, ge=0, le=100)
    weight_mutual_want: int = Field(default=25, ge=0, le=100)
    penalty_avoid: int = Field(default=100, ge=0, le=1000)
    notes: Optional[str] = None
    extra_rules: Dict[str, object] = Field(default_factory=dict)


class AssignmentRuleConfigUpdateIn(BaseModel):
    name: Optional[str] = None
    cohort_id: Optional[int] = None
    is_active: Optional[bool] = None
    team_size: Optional[int] = Field(default=None, ge=3, le=5)
    min_team_size: Optional[int] = Field(default=None, ge=3, le=5)
    max_team_size: Optional[int] = Field(default=None, ge=3, le=5)
    enforce_same_cohort: Optional[bool] = None
    hard_avoid: Optional[bool] = None
    max_low_preference_per_team: Optional[int] = Field(default=None, ge=0, le=8)
    weight_project_preference: Optional[int] = Field(default=None, ge=0, le=100)
    weight_project_rating: Optional[int] = Field(default=None, ge=0, le=100)
    weight_mutual_want: Optional[int] = Field(default=None, ge=0, le=100)
    penalty_avoid: Optional[int] = Field(default=None, ge=0, le=1000)
    notes: Optional[str] = None
    extra_rules: Optional[Dict[str, object]] = None


class AssignmentRuleConfigOut(BaseModel):
    id: int
    name: str
    cohort_id: Optional[int] = None
    is_active: bool
    team_size: int
    min_team_size: int
    max_team_size: int
    enforce_same_cohort: bool
    hard_avoid: bool
    max_low_preference_per_team: int
    weight_project_preference: int
    weight_project_rating: int
    weight_mutual_want: int
    penalty_avoid: int
    notes: Optional[str] = None
    extra_rules: Dict[str, object] = Field(default_factory=dict)
    created_by_user_id: Optional[int] = None
    updated_by_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class AssignmentPreviewStudentOut(BaseModel):
    user_id: int
    email: Optional[str] = None
    display_name: Optional[str] = None
    assigned_score: int = 0
    assigned_rank: Optional[int] = None
    is_preassigned: bool = False


class AssignmentPreviewPreassignedIn(BaseModel):
    user_id: int
    project_id: int


class AssignmentPreviewRequestIn(BaseModel):
    preassigned: List[AssignmentPreviewPreassignedIn] = Field(default_factory=list)


class AssignmentPreviewProjectOut(BaseModel):
    project_id: int
    project_title: str
    organization: Optional[str] = None
    assigned_count: int = 0
    teams: List[List[AssignmentPreviewStudentOut]] = Field(default_factory=list)


class AssignmentPreviewQualityOut(BaseModel):
    assigned_students: int = 0
    assigned_with_rank: int = 0
    unranked_assigned: int = 0
    unassigned_students: int = 0
    top1_count: int = 0
    top3_count: int = 0
    top5_count: int = 0
    top10_count: int = 0
    top1_rate: float = 0.0
    top3_rate: float = 0.0
    top5_rate: float = 0.0
    top10_rate: float = 0.0
    ranked_assignment_rate: float = 0.0
    average_assigned_rank: Optional[float] = None
    average_assigned_score: Optional[float] = None


class AssignmentPreviewIntegrityOut(BaseModel):
    ready: bool = True
    blocking_issues: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    total_students: int = 0
    submitted_rankings: int = 0
    complete_rankings: int = 0
    rankings_missing: int = 0
    projects_considered: int = 0
    projects_needed: int = 0
    projects_without_demand: int = 0


class AssignmentPreviewOut(BaseModel):
    run_id: Optional[int] = None
    input_fingerprint: Optional[str] = None
    rule_config_id: int
    cohort_id: Optional[int] = None
    team_size: int
    min_team_size: int = 3
    max_team_size: int = 5
    total_students: int
    projects_considered: int
    projects_selected: int
    unassigned_count: int
    warnings: List[str] = Field(default_factory=list)
    quality: AssignmentPreviewQualityOut = Field(
        default_factory=AssignmentPreviewQualityOut
    )
    integrity: AssignmentPreviewIntegrityOut = Field(
        default_factory=AssignmentPreviewIntegrityOut
    )
    generated_at: datetime
    project_assignments: List[AssignmentPreviewProjectOut] = Field(default_factory=list)
    unassigned_students: List[AssignmentPreviewStudentOut] = Field(default_factory=list)


class AssignmentPreviewRunOut(BaseModel):
    id: int
    rule_config_id: int
    cohort_id: Optional[int] = None
    initiated_by_user_id: int
    input_fingerprint: str
    created_at: datetime
    quality: AssignmentPreviewQualityOut = Field(
        default_factory=AssignmentPreviewQualityOut
    )
    integrity: AssignmentPreviewIntegrityOut = Field(
        default_factory=AssignmentPreviewIntegrityOut
    )
    warnings: List[str] = Field(default_factory=list)


class AssignmentSaveRequestIn(BaseModel):
    preview: AssignmentPreviewOut
    notes: Optional[str] = None


class AssignmentSavedRunOut(BaseModel):
    id: int
    rule_config_id: int
    cohort_id: Optional[int] = None
    source_preview_run_id: Optional[int] = None
    saved_by_user_id: int
    input_fingerprint: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime


class SubmittedRankingItemOut(BaseModel):
    rank: int
    project_id: int
    slug: Optional[str] = None
    title: str
    organization: Optional[str] = None


class AdminRankingSubmissionOut(BaseModel):
    user_id: int
    email: Optional[str] = None
    display_name: Optional[str] = None
    cohort_id: Optional[int] = None
    ranked_count: int = 0
    is_submitted: bool = False
    submitted_at: Optional[datetime] = None
    top_ten: List[SubmittedRankingItemOut] = Field(default_factory=list)


class AdminPartnerChoiceOut(BaseModel):
    student_id: int
    full_name: Optional[str] = None
    email: Optional[str] = None
    comment: Optional[str] = None


class AdminPartnerPreferenceOut(BaseModel):
    user_id: int
    email: Optional[str] = None
    display_name: Optional[str] = None
    cohort_id: Optional[int] = None
    want_count: int = 0
    avoid_count: int = 0
    want: List[AdminPartnerChoiceOut] = Field(default_factory=list)
    avoid: List[AdminPartnerChoiceOut] = Field(default_factory=list)

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
    id: str
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

    tags: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)

    avg_rating: Optional[float] = None
    ratings_count: int = 0

    created_at: datetime


class ProjectDetailOut(BaseModel):
    id: str
    organization: str
    title: str
    summary: Optional[str] = None
    description: Optional[str] = None

    org_industry: Optional[str] = None
    org_industry_other: Optional[str] = None
    org_website: Optional[str] = None

    minimum_deliverables: Optional[str] = None
    stretch_goals: Optional[str] = None
    long_term_impact: Optional[str] = None
    scope_clarity: Optional[str] = None
    scope_clarity_other: Optional[str] = None
    publication_potential: Optional[str] = None
    data_access: Optional[str] = None
    project_sector: Optional[str] = None

    required_skills: List[str] = Field(default_factory=list)
    required_skills_other: Optional[str] = None
    technical_domains: List[str] = Field(default_factory=list)
    supplementary_documents: List[str] = Field(default_factory=list)
    video_links: List[str] = Field(default_factory=list)

    created_at: datetime
    updated_at: datetime


class StatsOut(BaseModel):
    active_projects: int
    new_this_week: int


class UserOut(BaseModel):
    id: int
    email: Optional[str] = None
    display_name: Optional[str] = None


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


class UserSummaryOut(BaseModel):
    avg_match_score: int


class CartItemIn(BaseModel):
    user_id: Optional[int] = None
    project_id: str


class CartOut(BaseModel):
    cart_id: Optional[int] = None
    user_id: int
    status: str
    selected: int
    limit: int = 10
    project_ids: List[str]


class ProjectCardOut(BaseModel):
    id: str
    title: str
    organization: Optional[str] = None
    tags: List[str] = Field(default_factory=list)


class RankingsOut(BaseModel):
    top_ten: List[ProjectCardOut] = Field(default_factory=list)
    additional: List[ProjectCardOut] = Field(default_factory=list)
    ranked_count: int
    top_limit: int = 10


class RankingsIn(BaseModel):
    top_ten_ids: List[str] = Field(default_factory=list)


class RatingIn(BaseModel):
    project_id: str
    rating: int


class RatingOut(BaseModel):
    project_id: str
    rating: int


class SearchProjectsIn(BaseModel):
    q: Optional[str] = None
    domains: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    industries: List[str] = Field(default_factory=list)
    organization: Optional[str] = None
    match_mode: str = "and"
    limit: int = 50
    offset: int = 0

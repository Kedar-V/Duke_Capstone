-- Duke Capstone database schema (PostgreSQL)
-- Complete schema including all migrations through 0009_prod_schema_sync

begin;

create table if not exists cohorts (
  id bigserial primary key,
  name text unique not null,
  program text,
  year int,
  rankings_editable_until timestamptz,
  created_at timestamptz not null default now()
);

-- Project records (historically intake-form sourced)
create table if not exists projects (
  project_id bigserial primary key,
  slug text unique,
  raw jsonb not null default '{}'::jsonb,
  contact_name text,
  contact_email text,
  project_title text,
  project_summary text,
  project_description text,
  minimum_deliverables text,
  stretch_goals text,
  long_term_impact text,
  scope_clarity text,
  scope_clarity_other text,
  publication_potential text,
  required_skills jsonb not null default '[]'::jsonb,
  required_skills_other text,
  technical_domains jsonb not null default '[]'::jsonb,
  data_access text,
  supplementary_documents jsonb not null default '[]'::jsonb,
  video_links jsonb not null default '[]'::jsonb,
  cohort_id bigint references cohorts(id) on delete set null,
  edit_token text unique,
  edit_url text,
  revisions jsonb not null default '[]'::jsonb,
  project_status text not null default 'draft',
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists idx_projects_slug on projects(slug);

create table if not exists companies (
  id bigserial primary key,
  name text unique not null,
  sector text,
  industry text,
  website text,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists project_companies (
  project_id bigint primary key references projects(project_id) on delete cascade,
  company_id bigint not null references companies(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Minimal user table (supports auth + cart + rankings)
create table if not exists users (
  id bigserial primary key,
  email text unique,
  display_name text,
  password_hash text,
  role text not null default 'student' check (role in ('student','admin','faculty','client')),
  cohort_id bigint references cohorts(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists user_profiles (
  user_id bigint primary key references users(id) on delete cascade,
  avg_match_score int not null default 86,
  updated_at timestamptz not null default now()
);

create table if not exists students (
  id bigserial primary key,
  user_id bigint unique references users(id) on delete set null,
  full_name text not null,
  email text unique,
  program text,
  cohort_id bigint references cohorts(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists faculty_profiles (
  user_id bigint primary key references users(id) on delete cascade,
  department text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists teammate_preferences (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  student_id_hash text not null,
  payload_ciphertext text not null,
  student_id bigint references students(id) on delete cascade,
  preference text check (preference in ('want','avoid')),
  created_at timestamptz not null default now(),
  unique (user_id, student_id_hash)
);

-- Cart
create table if not exists carts (
  id bigserial primary key,
  user_id bigint references users(id) on delete cascade,
  status text not null default 'open' check (status in ('open','submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cart_items (
  cart_id bigint not null references carts(id) on delete cascade,
  project_id bigint not null references projects(project_id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (cart_id, project_id)
);

create index if not exists idx_cart_items_cart on cart_items(cart_id);

create index if not exists idx_users_cohort on users(cohort_id);
create index if not exists idx_students_cohort on students(cohort_id);
create index if not exists idx_projects_cohort on projects(cohort_id);

-- Rankings (Top 10 per user)
create table if not exists rankings (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_submitted boolean not null default false,
  submitted_at timestamptz,
  unique (user_id)
);

create table if not exists ranking_items (
  ranking_id bigint not null references rankings(id) on delete cascade,
  project_id bigint not null references projects(project_id) on delete cascade,
  rank int not null check (rank between 1 and 10),
  added_at timestamptz not null default now(),
  primary key (ranking_id, project_id),
  unique (ranking_id, rank)
);

-- Ratings (per user, per project)
create table if not exists ratings (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  project_id bigint not null references projects(project_id) on delete cascade,
  rating int not null check (rating between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id)
);

create table if not exists admin_audit_log (
  id bigserial primary key,
  admin_user_id bigint not null references users(id) on delete cascade,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Assignment engine tables (from migration 0009)
create table if not exists assignment_rule_configs (
  id bigserial primary key,
  name text not null,
  cohort_id bigint references cohorts(id) on delete set null,
  is_active boolean not null default false,
  team_size integer not null default 4 check (team_size between 2 and 8),
  enforce_same_cohort boolean not null default true,
  hard_avoid boolean not null default true,
  max_low_preference_per_team integer not null default 1 check (max_low_preference_per_team between 0 and 8),
  weight_project_preference integer not null default 55 check (weight_project_preference between 0 and 100),
  weight_project_rating integer not null default 15 check (weight_project_rating between 0 and 100),
  weight_mutual_want integer not null default 25 check (weight_mutual_want between 0 and 100),
  weight_fairness integer not null default 10 check (weight_fairness between 0 and 100),
  weight_skill_balance integer not null default 10 check (weight_skill_balance between 0 and 100),
  penalty_avoid integer not null default 100 check (penalty_avoid between 0 and 1000),
  notes text,
  extra_rules jsonb not null default '{}'::jsonb,
  created_by_user_id bigint references users(id) on delete set null,
  updated_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assignment_preview_runs (
  id bigserial primary key,
  rule_config_id bigint not null references assignment_rule_configs(id) on delete cascade,
  cohort_id bigint references cohorts(id) on delete set null,
  initiated_by_user_id bigint not null references users(id) on delete cascade,
  input_fingerprint text not null,
  preview_json jsonb not null default '{}'::jsonb,
  quality_json jsonb not null default '{}'::jsonb,
  integrity_json jsonb not null default '{}'::jsonb,
  warnings_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists assignment_saved_runs (
  id bigserial primary key,
  rule_config_id bigint not null references assignment_rule_configs(id) on delete cascade,
  cohort_id bigint references cohorts(id) on delete set null,
  source_preview_run_id bigint references assignment_preview_runs(id) on delete set null,
  saved_by_user_id bigint not null references users(id) on delete cascade,
  input_fingerprint text,
  notes text,
  preview_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists project_comments (
  id bigserial primary key,
  project_id bigint not null references projects(project_id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  comment text not null,
  is_resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed a default assignment config if none exists
insert into assignment_rule_configs (
  name, cohort_id, is_active, team_size, enforce_same_cohort,
  hard_avoid, max_low_preference_per_team, weight_project_preference,
  weight_project_rating, weight_mutual_want, weight_fairness,
  weight_skill_balance, penalty_avoid, notes, extra_rules
)
select
  'Default Assignment Rules', null, true, 4, true,
  true, 1, 55, 15, 25, 10, 10, 100,
  'Seeded default config', '{}'::jsonb
where not exists (select 1 from assignment_rule_configs);

commit;

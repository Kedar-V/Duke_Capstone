-- Duke Capstone database schema (PostgreSQL)
-- Intake-form driven schema

begin;

create table if not exists cohorts (
  id bigserial primary key,
  name text unique not null,
  program text,
  year int,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table projects add column if not exists project_id bigserial;
alter table projects add column if not exists slug text;
alter table projects add column if not exists cohort_id bigint references cohorts(id) on delete set null;
alter table projects add column if not exists deleted_at timestamptz;
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

alter table companies add column if not exists sector text;

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

alter table users add column if not exists password_hash text;
alter table users add column if not exists role text default 'student';
alter table users add column if not exists cohort_id bigint references cohorts(id) on delete set null;
alter table users add column if not exists deleted_at timestamptz;

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

alter table students add column if not exists user_id bigint unique references users(id) on delete set null;
alter table students add column if not exists cohort_id bigint references cohorts(id) on delete set null;

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

alter table rankings add column if not exists is_submitted boolean not null default false;
alter table rankings add column if not exists submitted_at timestamptz;

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

commit;

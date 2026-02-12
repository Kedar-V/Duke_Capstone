-- Duke Capstone database schema (PostgreSQL)
-- Intake-form driven schema

begin;

-- Intake form data (source of project listings)
create table if not exists client_intake_forms (
  org_name text primary key,
  raw jsonb not null default '{}'::jsonb,
  org_industry text,
  org_industry_other text,
  org_website text,
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
  project_sector text,
  supplementary_documents jsonb not null default '[]'::jsonb,
  video_links jsonb not null default '[]'::jsonb,
  edit_token text unique,
  edit_url text,
  revisions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Minimal user table (supports auth + cart + rankings)
create table if not exists users (
  id bigserial primary key,
  email text unique,
  display_name text,
  password_hash text,
  created_at timestamptz not null default now()
);

alter table users add column if not exists password_hash text;

create table if not exists user_profiles (
  user_id bigint primary key references users(id) on delete cascade,
  avg_match_score int not null default 86,
  updated_at timestamptz not null default now()
);

create table if not exists students (
  id bigserial primary key,
  full_name text not null,
  email text unique,
  program text,
  created_at timestamptz not null default now()
);

create table if not exists teammate_preferences (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  student_id bigint not null references students(id) on delete cascade,
  preference text not null check (preference in ('want','avoid')),
  created_at timestamptz not null default now(),
  unique (user_id, student_id)
);

-- Cart (stores org_name from client_intake_forms)
create table if not exists carts (
  id bigserial primary key,
  user_id bigint references users(id) on delete cascade,
  status text not null default 'open' check (status in ('open','submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cart_items (
  cart_id bigint not null references carts(id) on delete cascade,
  org_name text not null references client_intake_forms(org_name) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (cart_id, org_name)
);

create index if not exists idx_cart_items_cart on cart_items(cart_id);

-- Rankings (Top 10 per user, by org_name)
create table if not exists rankings (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists ranking_items (
  ranking_id bigint not null references rankings(id) on delete cascade,
  org_name text not null references client_intake_forms(org_name) on delete cascade,
  rank int not null check (rank between 1 and 10),
  added_at timestamptz not null default now(),
  primary key (ranking_id, org_name),
  unique (ranking_id, rank)
);

commit;

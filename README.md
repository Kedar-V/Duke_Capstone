# Duke_Capstone

## Project Plan

### Goals
- Build a pixel-matching React + Tailwind UI for the provided capstone listing page.
- Expose FastAPI endpoints that serve projects, filters, summary stats, and cart data.
- Persist data in a SQL database.
- Add **user logins** so users can retain carts/ratings and remain isolated from other users.
- Deploy on AWS (EC2 microservices) via manual/CLI steps (no Terraform).

### Architecture (AWS)
- **Frontend service**: React + Tailwind served from **EC2** (dynamic app) behind an **ALB**.
- **API service**: FastAPI on **EC2** (Dockerized), behind an **ALB**.
- **Data service**: **RDS PostgreSQL** (primary; local Postgres removed).
- **Identity/Auth** (recommended): **Amazon Cognito** (User Pool) issuing JWTs, validated by the API service.
- **Networking**: VPC with public/private subnets, security groups, and NAT for private egress.
- **Compute**: Auto Scaling Groups for EC2 instances (single instance for dev).
- **Deployment**: Manual or scripted CLI deploys.

### Authentication + Isolation (App)
- **Login**: email/password (local dev) or Cognito-hosted UI / OIDC (AWS).
- **API auth**: Bearer JWT in `Authorization` header.
- **Isolation**: cart/ratings/rankings are scoped by the authenticated `user_id`.
	- The API should never accept an arbitrary `user_id` from the client for protected operations.
	- Example: `POST /api/cart/items` uses `user_id` from the JWT claims.
- **Passwords** (if self-hosted auth): store salted hashes (bcrypt/argon2), never plaintext.

### Execution Plan
1. **Frontend scaffold**
	- Set up React + Tailwind with theme tokens for the Duke palette.
	- Build UI components (`Card`, `Button`, `Input`, `Select`, `Tag`, `Pill`).
	- Recreate the provided HTML exactly in React.
2. **Backend scaffold**
	- Create FastAPI app with routers for `projects`, `filters`, `stats`, `cart`.
	- Add Pydantic schemas matching the UI data model.
3. **Auth + user isolation**
	- Add login flow (dev) and JWT auth middleware/dependency.
	- Update cart/ratings endpoints to use authenticated user context.
	- Add basic authorization rules (users can only see/modify their own cart/ratings).
4. **Database layer**
	- Define SQL schema and ORM models for projects, tags, skills, domains, organizations.
	- Seed sample data to match the UI mock.
	- Seed at least one dev user for local testing.
5. **API wiring**
	- Implement read endpoints for the UI.
	- Add basic “Add to cart” persistence.
	- Add ratings persistence per user (for ranking).
6. **AWS infrastructure**
	- EC2, RDS, VPC, ALB setup via AWS Console or CLI.
	- Configure Cognito (recommended) and wire JWT validation in the API.
7. **Docs + validation**
	- Local dev instructions.
	- AWS deployment steps.
	- Quick verification checklist for visual parity.

### Tech Stack
- **Frontend**: React, Tailwind CSS, Vite
- **Backend**: FastAPI, Uvicorn
- **Database**: PostgreSQL (RDS)
- **Auth**: Cognito (recommended) or self-hosted JWT + bcrypt/argon2
- **Infra**: AWS (EC2, RDS, ALB, VPC)

## Local Dev (RDS-only)

Set `DATABASE_URL` to your RDS instance (required for the API container):

```bash
export DATABASE_URL="postgresql+psycopg2://<user>:<password>@<rds-endpoint>:5432/postgres"
```

Or copy `.env.example` and use it:

```bash
cp .env.example .env
```

Then run:

```bash
docker compose --env-file .env up --build
```

To apply schema/seed to RDS, use `aws_connect.ipynb` (schema cell then seed cell).

## Database Schema (PostgreSQL)

This schema supports:
- Project catalog + organization metadata
- Tags/skills for filtering
- Ratings (1–5 stars)
- Cart selection (up to 10 projects)

```sql
-- Core lookup tables
create table organizations (
	id bigserial primary key,
	name text not null unique,
	industry text,
	company_size text
);

create table domains (
	id bigserial primary key,
	name text not null unique
);

create table skills (
	id bigserial primary key,
	name text not null unique
);

create table tags (
	id bigserial primary key,
	name text not null unique
);

-- Main project entity
create table projects (
	id bigserial primary key,
	title text not null,
	description text not null,
	duration_weeks int not null check (duration_weeks > 0),

	domain_id bigint references domains(id),
	organization_id bigint references organizations(id),

	difficulty text not null check (difficulty in ('Introductory','Intermediate','Advanced')),
	modality text not null check (modality in ('Remote','Hybrid','In-person')),
	cadence text check (cadence in ('Weekly','Bi-weekly','Monthly')),
	confidentiality text check (confidentiality in ('None','NDA Required','IP Agreement')),

	min_hours_per_week int check (min_hours_per_week >= 0),
	max_hours_per_week int check (max_hours_per_week >= 0),

	is_active boolean not null default true,
	created_at timestamptz not null default now()
);

create index idx_projects_domain on projects(domain_id);
create index idx_projects_organization on projects(organization_id);
create index idx_projects_active_created on projects(is_active, created_at desc);

-- Many-to-many for filtering
create table project_skills (
	project_id bigint not null references projects(id) on delete cascade,
	skill_id bigint not null references skills(id) on delete cascade,
	primary key (project_id, skill_id)
);

create table project_tags (
	project_id bigint not null references projects(id) on delete cascade,
	tag_id bigint not null references tags(id) on delete cascade,
	primary key (project_id, tag_id)
);

-- Optional: user profiles (minimal; enough to support carts and ratings)
create table users (
	id bigserial primary key,
	email text unique,
	display_name text,
	created_at timestamptz not null default now()
);

-- Ratings (the UI shows per-project star rating control)
create table project_ratings (
	id bigserial primary key,
	project_id bigint not null references projects(id) on delete cascade,
	user_id bigint references users(id) on delete set null,
	rating int not null check (rating between 1 and 5),
	created_at timestamptz not null default now(),
	unique (project_id, user_id)
);

create index idx_project_ratings_project on project_ratings(project_id);

-- Cart (UI shows "0 / 10 selected")
create table carts (
	id bigserial primary key,
	user_id bigint references users(id) on delete cascade,
	status text not null default 'open' check (status in ('open','submitted')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table cart_items (
	cart_id bigint not null references carts(id) on delete cascade,
	project_id bigint not null references projects(id) on delete cascade,
	added_at timestamptz not null default now(),
	primary key (cart_id, project_id)
);

create index idx_cart_items_cart on cart_items(cart_id);
```

Notes:
- `difficulty`, `modality`, `cadence`, `confidentiality`, `industry`, and `company_size` are stored as `text` with checks to keep the schema simple and migration-friendly.
- If we need stronger typing later, we can migrate these to PostgreSQL `enum` types.
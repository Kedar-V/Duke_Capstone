# Duke Capstone Project Selection Platform

A full-stack web application for Duke MIDS students to browse, evaluate, and rank capstone projects, and optionally submit teammate preferences. An admin dashboard enables faculty and staff to manage projects, cohorts, users, and assignment rules.

## What It Does

The platform supports the complete student project-selection workflow:

1. **Browse** a searchable, filterable catalog of capstone projects
2. **Explore** project details — requirements, deliverables, skills, domains, and sponsoring organizations
3. **Rate** projects on a 1–10 scale
4. **Shortlist** projects in a personal cart
5. **Rank** a prioritized top-10 list and submit it
6. **Teammate preferences** — optionally flag preferred or avoided teammates with encrypted storage

For admins, the platform also supports:

- Creating and managing cohorts, users, and projects
- Configuring assignment rules (team size, weights for preferences/ratings/fairness/skill balance)
- Running and saving assignment preview simulations
- Project lifecycle management (draft → published → archived)
- Commenting on projects

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router, Vite, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy, Alembic, Uvicorn |
| Database | PostgreSQL 15 |
| Auth | JWT-based (registration, login, role-based access) |
| Privacy | Teammate preferences encrypted via Fernet symmetric encryption |
| Infrastructure | Docker, Docker Compose, GitHub Actions CI/CD, AWS EC2 + RDS |

## Architecture

```mermaid
flowchart LR
    U[Student / Admin] --> FE[React SPA<br/>Vite + Tailwind]
    FE -->|REST /api| API[FastAPI Backend]
    API --> DB[(PostgreSQL<br/>RDS)]

    API --> AUTH[Auth Router]
    API --> CATALOG[Catalog Router]
    API --> ADMIN[Admin Router]
    API --> HEALTH[Health Router]
```

### Frontend Pages

| Page | Description |
|------|-------------|
| **Login** | Register or sign in with email/password |
| **Catalog** | Browse, search, filter, paginate, and rate projects |
| **Project Detail** | Full project info — deliverables, skills, domains, org details, ratings |
| **Rankings** | Review shortlisted projects and submit a prioritized top-10 |
| **Teammates** | Specify preferred/avoided teammates with optional comments |
| **Profile** | View and manage user profile |
| **Admin** | Manage cohorts, users, projects, assignment rules, and previews |

### Backend Routers

| Router | Responsibilities |
|--------|-----------------|
| `auth` | Registration, login, JWT tokens, current-user lookup, OTP |
| `catalog` | Project listing, detail, search, filters, stats, ratings, cart, rankings, teammate preferences |
| `admin` | CRUD for cohorts/users/projects, assignment rule configs, preview runs, saved runs, comments, project status |
| `health` | Readiness check |

## Database Schema

The database is managed via Alembic migrations. The canonical schema (for fresh bootstraps) is in `schema.sql`.

```mermaid
erDiagram
    cohorts ||--o{ projects : "scoped to"
    cohorts ||--o{ users : "belongs to"
    cohorts ||--o{ students : "enrolled in"
    projects ||--o{ project_companies : "sponsored by"
    companies ||--o{ project_companies : "sponsors"
    projects ||--o{ cart_items : "shortlisted in"
    projects ||--o{ ranking_items : "ranked in"
    projects ||--o{ ratings : "rated by"
    projects ||--o{ project_comments : "commented on"
    users ||--o{ carts : "owns"
    users ||--o{ rankings : "submits"
    users ||--o{ ratings : "rates"
    users ||--o{ teammate_preferences : "specifies"
    users ||--o| user_profiles : "has"
    users ||--o| faculty_profiles : "has"
    students }o--o| users : "linked to"
    assignment_rule_configs ||--o{ assignment_preview_runs : "generates"
    assignment_preview_runs ||--o{ assignment_saved_runs : "saved as"
```

### Core Tables

| Table | Purpose |
|-------|---------|
| `cohorts` | Academic cohorts (e.g., MIDS 2026, MIDS 2027) |
| `projects` | Capstone project records with status (draft/published/archived) |
| `companies` | Sponsoring organizations |
| `project_companies` | Links projects to their sponsor companies |
| `users` | Authenticated users with roles (student, admin, faculty, client) |
| `user_profiles` | Extended user info (e.g., match scores) |
| `students` | Student roster linked to user accounts |
| `faculty_profiles` | Faculty-specific profile data |

### Interaction Tables

| Table | Purpose |
|-------|---------|
| `carts` / `cart_items` | Project shortlists |
| `rankings` / `ranking_items` | Prioritized top-10 submissions |
| `ratings` | Per-user project ratings (1–10) |
| `teammate_preferences` | Encrypted preferred/avoided teammate selections |
| `project_comments` | Admin/faculty comments on projects |

### Assignment Engine Tables

| Table | Purpose |
|-------|---------|
| `assignment_rule_configs` | Configurable rules for team assignment (weights, constraints) |
| `assignment_preview_runs` | Simulated assignment results for review |
| `assignment_saved_runs` | Finalized/saved assignment results |

## Repository Structure

```
.
├── .github/workflows/
│   ├── deploy.yml                # CI/CD: build & deploy to EC2
│   └── playwright.yml            # E2E test runner
├── schema.sql                    # Canonical PostgreSQL schema (all tables)
├── seed.sql                      # Development seed data (cohorts, projects, users)
├── docker-compose.yml            # Local dev stack (api + frontend + postgres)
│
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── app/
│   │   ├── main.py               # FastAPI app setup
│   │   ├── db.py                 # SQLAlchemy engine and session config
│   │   ├── models.py             # SQLAlchemy ORM models
│   │   ├── schemas.py            # Pydantic request/response schemas
│   │   ├── auth.py               # JWT auth helpers
│   │   ├── crypto.py             # Fernet encryption for teammate preferences
│   │   ├── otp.py                # OTP utilities
│   │   └── routers/
│   │       ├── auth.py           # Auth endpoints
│   │       ├── catalog.py        # Student-facing catalog & interactions
│   │       ├── admin.py          # Admin management endpoints
│   │       └── health.py         # Health check
│   ├── migrations/
│   │   └── versions/             # Alembic migration scripts (0001–0009)
│   ├── scripts/
│   │   ├── load_students_from_csv.py
│   │   ├── import_projects_from_csv.py
│   │   ├── backfill_teammate_preferences.py
│   │   ├── seed_student_selections.py
│   │   ├── run_sql.py            # Execute multi-statement SQL files
│   │   ├── wipe_schema.py        # Drop and recreate public schema
│   │   ├── schema_check.py       # Check schema state for deploy decisions
│   │   ├── table_check.py        # Verify a specific table exists
│   │   └── diagnose_schema.py    # Print diagnostic schema info
│   └── data/
│       └── students.csv          # Student roster source
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── App.jsx               # Root component and routing
│       ├── api.js                # API client functions
│       ├── auth.js               # Auth context and helpers
│       ├── styles.css            # Global styles
│       └── pages/
│           ├── Catalog.jsx       # Project catalog with search/filter
│           ├── ProjectDisplay.jsx # Project detail page
│           ├── Rankings.jsx      # Top-10 ranking submission
│           ├── Partners.jsx      # Teammate preference selection
│           ├── Login.jsx         # Registration and login
│           ├── Profile.jsx       # User profile
│           └── Admin.jsx         # Admin dashboard
│
├── tests/                        # Playwright E2E tests
├── ApiContracts.md               # API endpoint contracts and payloads
├── HLD.md                        # High-level architecture diagram
├── aws_architecture.md           # AWS deployment architecture
├── assignment_policy.md          # Team assignment policy and governance
└── flow.md                       # Supplementary design notes
```

## API Overview

Base URL (local): `http://localhost:8001`

| Group | Endpoints |
|-------|-----------|
| Health | `GET /health` |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Projects | `GET /api/projects`, `GET /api/projects/{id}` |
| Search | `GET /api/search/projects`, `GET /api/filters`, `GET /api/stats` |
| Cohorts | `GET /api/cohorts` |
| Cart | `GET /api/cart`, `POST /api/cart/items`, `DELETE /api/cart/items/{id}` |
| Ratings | `GET /api/ratings`, `POST /api/ratings` |
| Rankings | `GET /api/rankings`, `POST /api/rankings` |
| Teammates | `GET /api/teammate-choices`, `POST /api/teammate-choices` |
| Admin | `GET/POST /api/admin/users`, `GET/POST /api/admin/projects`, `GET/POST /api/admin/cohorts` |

See `ApiContracts.md` for detailed request/response payloads.

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker + Docker Compose
- PostgreSQL 15 (or use the included Docker Compose Postgres service)

### Environment Variables

Create a `.env` file in the repo root:

```env
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/duke_capstone
TEAMMATE_PREFS_KEY=<your-fernet-key>
CORS_ORIGINS=http://localhost:5173
AWS_REGION=us-east-1
OTP_SES_SOURCE_EMAIL=otp@yourdomain.com
OTP_EMAIL_SUBJECT=Your OTP Code
OTP_FORWARD_TO_EMAIL=
OTP_STATIC_CODE=
```

Notes:
- `OTP_SES_SOURCE_EMAIL` must be a verified SES identity in the same region.
- Leave `OTP_FORWARD_TO_EMAIL` empty for normal behavior (send to each user's email).
- Leave `OTP_STATIC_CODE` empty in production; set it only for controlled local testing.

Generate a Fernet key:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### Running with Docker Compose

```bash
docker compose up --build
```

This starts:
- **Frontend** → `http://localhost:5173`
- **Backend API** → `http://localhost:8001`
- **PostgreSQL** → `localhost:5432`

### Running without Docker

**Backend:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

> **Note:** For non-Docker runs, update the proxy target in `frontend/vite.config.js` from `http://api:8000` to `http://localhost:8001`.

### Database Setup

**Option A — Docker Compose** (automatic): The Postgres service starts with the stack.

**Option B — Manual bootstrap:**
```bash
psql "$DATABASE_URL" -f schema.sql
cd backend && alembic -c alembic.ini stamp head
```

**Option C — Seed with sample data:**
```bash
psql "$DATABASE_URL" -f seed.sql
```

## Deployment

The project deploys to AWS EC2 via GitHub Actions on every push to the `diwas` branch.

| Workflow Action | Trigger | What It Does |
|----------------|---------|--------------|
| **deploy** | Push to `diwas` / manual | Pull code, build containers, run Alembic migrations, restart |
| **diagnose** | Manual only | Read-only diagnostics (git state, docker status, schema checks, logs) |
| **bootstrap_db** | Manual only | ⚠️ Destructive — wipes DB, applies `schema.sql`, stamps Alembic, optionally seeds |

The deploy is **safe and incremental** — it only runs new Alembic migrations and preserves all existing data.

## Security

- Teammate preferences are encrypted at rest using Fernet symmetric encryption
- `TEAMMATE_PREFS_KEY` is required at runtime and must not be committed to source control
- JWT tokens are used for authenticated API access
- Role-based access control separates student, admin, faculty, and client permissions

# Duke Capstone Project Selection Platform

This repository contains a full-stack web application for helping Duke students browse capstone projects, rate them, shortlist them, rank final choices, and optionally submit teammate preferences.

The codebase includes:
- a React + Vite frontend
- a FastAPI backend
- PostgreSQL schema artifacts
- supporting scripts for student loading and teammate preference backfill
- architecture and API design documents

## What the product does

The platform supports the student project-selection flow end to end:
- browse available capstone projects
- search and filter the catalog
- open a project detail page (PDP) for richer context
- rate projects on a `1–10` scale
- add projects to a shortlist/cart
- rank final top project choices
- submit optional teammate preferences with optional comments

## Key features

- **Project catalog:** searchable, filterable project listing with pagination
- **Project detail page:** expanded view of requirements, deliverables, domains, skills, links, and organization information
- **Ratings:** per-user project ratings stored in the backend and displayed as stars plus `x/10`
- **Cart/shortlist:** lets students save projects before ranking
- **Rankings:** supports prioritizing and submitting a top-10 project list
- **Teammate choices:** supports preferred / avoid teammate selections with encrypted persistence
- **Navigation UX:** burger menu across main pages and logo-based navigation back to Projects

## Tech stack

- **Frontend:** React 18, React Router, Vite, Tailwind CSS
- **Backend:** FastAPI, SQLAlchemy, Uvicorn
- **Database:** PostgreSQL
- **Auth:** JWT-based auth handled by FastAPI routes
- **Security / privacy:** teammate preferences are stored via encrypted payloads
- **Containerization:** Docker + Docker Compose

## Current high-level design (HLD)

### System view

The current implementation is a simple three-tier application:
- React SPA frontend for student interactions
- FastAPI backend exposing REST endpoints under `/api`
- PostgreSQL database for projects, users, ratings, cart, rankings, and teammate preferences

```mermaid
flowchart LR
	U[Student User] --> FE[React Frontend\nVite SPA]
	FE -->|REST /api| API[FastAPI Backend]
	API --> DB[(PostgreSQL)]

	API --> AUTH[Auth Router]
	API --> CATALOG[Catalog Router]
	API --> HEALTH[Health Router]

	CATALOG --> PREFS[Encrypted Teammate Preferences]
	CATALOG --> RATINGS[Ratings / Cart / Rankings]
```

### Major frontend flows

- **Projects page:** browse, search, filter, paginate, rate, and shortlist projects
- **Project detail page:** review deep project information and rate a project
- **Rankings page:** review shortlist and submit a prioritized top-10 list
- **Teammate choices page:** optionally specify preferred / avoided teammates
- **Login page:** register/sign in for persistence-enabled workflows

### Major backend responsibilities

- **Authentication:** registration, login, and current-user lookup
- **Catalog:** project listing, project detail, filters, search, and stats
- **User interactions:** ratings, cart, rankings, teammate preference storage
- **Health:** basic readiness endpoint

### Data model summary

Core tables defined in `schema.sql`:
- `client_intake_forms`: source of project data
- `users`: authenticated users
- `user_profiles`: summary fields like average match score
- `students`: class roster used for teammate preferences
- `teammate_preferences`: encrypted preference payloads
- `carts` / `cart_items`: shortlisted projects
- `rankings` / `ranking_items`: top-10 ranking submission
- `ratings`: per-user project ratings out of 10

### Target / cloud architecture artifacts

This repo also contains future-state / deployment-oriented design documents:
- `HLD.md`: expanded cloud-oriented Mermaid HLD
- `aws_architecture.md`: AWS architecture sketch
- `flow.md`: supporting flow/design notes

These documents describe a more scalable deployment target than the current local/dev setup.

## Repository structure

```text
.
├── ApiContracts.md               # Frontend/backend API contract reference
├── HLD.md                        # Higher-level architecture diagram (target-state oriented)
├── aws_architecture.md           # AWS deployment sketch
├── flow.md                       # Additional design flow notes
├── schema.sql                    # Canonical PostgreSQL schema for current app
├── cleanup.sql                   # Utility SQL for ranking/cart cleanup and migration support
├── seed.sql                      # Older dev seed artifact (see note below)
├── docker-compose.yml            # Dev stack for frontend + backend containers
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py               # FastAPI app setup
│   │   ├── db.py                 # SQLAlchemy engine/session configuration
│   │   ├── auth.py               # Auth helpers
│   │   ├── crypto.py             # Encrypted teammate preference helpers
│   │   ├── models.py             # SQLAlchemy models
│   │   ├── schemas.py            # Pydantic schemas
│   │   └── routers/
│   │       ├── auth.py
│   │       ├── catalog.py
│   │       └── health.py
│   ├── data/
│   │   └── students.csv          # Student roster source
│   └── scripts/
│       ├── load_students_from_csv.py
│       └── backfill_teammate_preferences.py
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── App.jsx
        ├── api.js
        ├── auth.js
        ├── styles.css
        └── pages/
            ├── Catalog.jsx
            ├── Login.jsx
            ├── Partners.jsx
            ├── ProjectDisplay.jsx
            └── Rankings.jsx
```

## Important notes about repo artifacts

- **`schema.sql`** is the primary schema for the current app.
- **`seed.sql`** appears to come from an older / alternate schema shape (`projects`, `domains`, `organizations`, etc.) and should be treated as a legacy dev artifact unless it is updated to match `schema.sql`.
- **`backend/app/db.py`** currently contains a fallback hardcoded `DATABASE_URL`; for real local/dev/prod use, you should override this with an environment variable.

## API overview

Base URL (local dev): `http://localhost:8001`

Key endpoint groups:
- **Health:** `GET /health`
- **Auth:** `/api/auth/register`, `/api/auth/login`, `/api/auth/me`
- **Projects:** `/api/projects`, `/api/projects/{project_id}`
- **Search/filter/stats:** `/api/search/projects`, `/api/filters`, `/api/stats`
- **Cart:** `/api/cart`, `/api/cart/items`, `/api/cart/items/{project_id}`
- **Ratings:** `/api/ratings`
- **Rankings:** `/api/rankings`
- **Teammate choices:** `/api/teammate-choices`

For detailed request/response payloads, see `ApiContracts.md`.

## Local development prerequisites

Install the following before running locally:
- **Python 3.11**
- **Node.js 20+**
- **npm**
- **Docker + Docker Compose** (if using containers)
- **PostgreSQL access** (local or remote)

You will also need these environment variables:
- `DATABASE_URL`
- `TEAMMATE_PREFS_KEY`
- optionally `CORS_ORIGINS`

Generate a teammate preference encryption key with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Environment setup

Create a `.env` file in the repo root (used by Docker Compose and backend dotenv loading) with values like:

```env
DATABASE_URL=postgresql+psycopg2://postgres:password@localhost:5432/duke_capstone
TEAMMATE_PREFS_KEY=your-generated-fernet-key
CORS_ORIGINS=http://localhost:5173
```

## Database setup

Initialize the schema before starting the app:

```bash
psql "$DATABASE_URL" -f schema.sql
```

Optional utilities:
- Load students from CSV using `backend/scripts/load_students_from_csv.py`
- Run `cleanup.sql` only if you are intentionally applying its maintenance logic

To load student data:

```bash
cd backend
python scripts/load_students_from_csv.py
```

## Running with Docker Compose

The repository’s `docker-compose.yml` starts:
- `api` on `http://localhost:8001`
- `frontend` on `http://localhost:5173`

### Steps

1. Create and populate `.env`
2. Initialize the database with `schema.sql`
3. Start the stack:

```bash
docker compose up --build
```

### Services

- **Frontend:** `http://localhost:5173`
- **Backend:** `http://localhost:8001`
- **Health check:** `http://localhost:8001/health`

## Running without Docker

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql+psycopg2://postgres:password@localhost:5432/duke_capstone"
export TEAMMATE_PREFS_KEY="your-generated-fernet-key"
export CORS_ORIGINS="http://localhost:5173"
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

For manual frontend + backend runs, note that `frontend/vite.config.js` currently proxies `/api` to `http://api:8000`, which works in Docker because `api` is the Compose service name. For non-Docker local runs, update that proxy target to `http://localhost:8001` or use Docker Compose.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend dev server default:
- `http://localhost:5173`

## Common developer workflows

### Register / sign in
- Open the frontend
- Create an account or sign in
- Persist ratings, cart, rankings, and teammate choices

### Rate and rank projects
- Browse the catalog
- Open a project detail page
- Rate projects out of 10
- Add projects to cart
- Submit top-10 rankings

### Teammate preferences
- Open **Teammate Choices**
- Add preferred / avoided students if you have anyone in mind
- Comments are optional and stored when provided

## Supporting scripts

### `backend/scripts/load_students_from_csv.py`
Loads student roster records from `backend/data/students.csv` into the `students` table.

### `backend/scripts/backfill_teammate_preferences.py`
Backfills / migrates teammate preference rows into encrypted payload storage. Requires `TEAMMATE_PREFS_KEY`.

Run it with:

```bash
cd backend
export TEAMMATE_PREFS_KEY="your-generated-fernet-key"
python scripts/backfill_teammate_preferences.py
```

## Security / privacy notes

- Teammate preference payloads are encrypted before storage.
- `TEAMMATE_PREFS_KEY` is required at runtime for teammate preference operations.
- Do not commit real credentials or production secrets to source control.

## Known caveats

- `backend/app/db.py` includes a hardcoded fallback database URL; this should be overridden via `DATABASE_URL` and ideally removed/refactored.
- `seed.sql` does not appear to match the current `client_intake_forms` schema and may not be safe to use as-is.
- There is no dedicated Postgres service in `docker-compose.yml`; you must provide a reachable Postgres instance yourself.

## Additional documents in this repo

- `ApiContracts.md` — endpoint contracts and example payloads
- `HLD.md` — target-state high-level architecture diagram
- `aws_architecture.md` — AWS architecture concept
- `flow.md` — supporting flow notes
- `aws_connect.ipynb` and `test.ipynb` — notebook artifacts for experimentation

## Recommended next improvements

- Add a real `postgres` service to `docker-compose.yml`
- Replace SQL bootstrap steps with migrations (Alembic)
- Remove hardcoded DB fallback from `backend/app/db.py`
- Refresh or replace `seed.sql` to match the active schema
- Add automated tests for ratings, rankings, and teammate preference flows


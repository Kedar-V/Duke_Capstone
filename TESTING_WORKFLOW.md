# Testing Workflow Guide

This document explains how student user-flow testing is automated in this repository.

## Goals

- Validate core student workflows before merge (`CI E2E`).
- Validate production-like behavior after deployment (`Post-Deploy Smoke`).
- Keep test execution reproducible locally and in GitHub Actions.

## What Runs Where

### 1) CI Student Workflow E2E

Workflow file: `.github/workflows/playwright.yml`

Runs on:
- `push` to `testing_suite`, `assignment_rule`, `diwas`
- `pull_request` to `main`, `master`, `testing_suite`, `assignment_rule`, `diwas`
- manual `workflow_dispatch`

What it does:
1. Checks out code.
2. Installs frontend dependencies and Playwright browser.
3. Boots full stack via `docker compose up -d --build`.
4. Waits for API health (`http://127.0.0.1:8001/health`).
5. Applies `schema.sql` and `seed.sql` to test DB.
6. Waits for frontend readiness (`http://127.0.0.1:5173`).
7. Runs Playwright tests:
   - `frontend/tests/student-workflows.spec.js`
   - `frontend/tests/randomized-student-workflow.spec.js`
8. Uploads Playwright artifacts (`playwright-report`, `test-results`).
9. Tears down stack.

### 2) Post-Deploy Student Smoke

Workflow file: `.github/workflows/post-deploy-e2e.yml`

Runs on:
- successful completion of workflow `Build & Deploy to EC2 via Docker` (via `workflow_run`)
- manual `workflow_dispatch`

What it does:
1. Checks out code.
2. Validates deployed app URL is configured.
3. Installs frontend dependencies and Playwright browser.
4. Runs smoke suite against deployed URL:
   - `frontend/tests/post-deploy-smoke.spec.js`
5. Uploads Playwright artifacts.

## Test Suites

### `frontend/tests/student-workflows.spec.js`
Covers UI-oriented core flow checks such as:
- unauthenticated guard behavior for protected routes
- login success and student navigation visibility
- catalog basic navigation/pagination presence
- partners page load and search interaction
- rankings page structural controls
- profile password mismatch validation + logout

### `frontend/tests/randomized-student-workflow.spec.js`
Covers API-level mutation flow with randomized data:
- auth token acquisition
- project search + ratings + cart updates
- ranking save and conditional submit handling
- teammate preference save/read validation
- resilience for locked/deadline states

### `frontend/tests/post-deploy-smoke.spec.js`
Fast smoke verification on deployed environment:
- unauthenticated redirect on protected route
- login and core page navigation (`/projects`, `/partners`, `/rankings`, `/profile`)
- logout behavior

## Required GitHub Configuration

### Repository Variables

- `APP_BASE_URL` (example: `https://dukemidscapstone.com`)
- `E2E_STUDENT_EMAIL`
- `E2E_STUDENT_PASSWORD`
- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`

### Repository Secrets

- `TEAMMATE_PREFS_KEY`

> If test creds are not set, workflows currently fall back to defaults in test code/workflow env.

## Local Execution

From repo root, ensure services are up first:

```bash
docker compose up -d --build
```

Run student workflow suite:

```bash
cd frontend
PLAYWRIGHT_USE_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npm run test:e2e -- tests/student-workflows.spec.js tests/randomized-student-workflow.spec.js
```

Run post-deploy smoke suite against local stack:

```bash
cd frontend
PLAYWRIGHT_USE_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npm run test:e2e:postdeploy
```

Run smoke suite against deployed environment:

```bash
cd frontend
PLAYWRIGHT_USE_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=https://dukemidscapstone.com npm run test:e2e:postdeploy
```

## Playwright Runtime Mode

File: `frontend/playwright.config.js`

- If `PLAYWRIGHT_USE_EXTERNAL_SERVER=true`, Playwright does **not** start `npm run dev`.
- If unset/false, Playwright starts local dev server via `webServer` config.

This makes the same tests usable in both CI docker-backed mode and deployed smoke mode.

## Artifacts and Debugging

Both workflows upload:
- `frontend/playwright-report/`
- `frontend/test-results/`

CI workflow also dumps `docker compose logs` on failure.

Use artifact videos/screenshots and traces to debug flaky/failing user flows.

## Alignment With Test Case Matrix

Source matrix: `student_workflow_test_cases.md`

Current implementation status:
- **Automated now:** core auth/navigation/catalog/partners/rankings/profile happy-path + key API mutation checks.
- **Partially automated:** broad matrix categories (many edge and negative paths remain manual or pending).
- **Recommended next step:** split matrix into tagged Playwright specs (e.g., `@auth`, `@rankings`, `@partners`) and gate PRs on Priority 1 subset.

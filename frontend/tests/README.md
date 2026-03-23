# Playwright E2E Tests

This folder contains Playwright tests for student workflows.

## Prerequisites

- Backend API running and reachable from frontend (`/api` proxy works)
- Frontend dependencies installed
- Playwright browsers installed

## Install

```bash
npm install
npx playwright install chromium
```

## Run

```bash
npm run test:e2e
```

Run headed mode:

```bash
npm run test:e2e:headed
```

## Environment Variables

Optionally override login credentials used by tests:

- `E2E_STUDENT_EMAIL` (default: `dev@duke.edu`)
- `E2E_STUDENT_PASSWORD` (default: `devpassword`)
- `PLAYWRIGHT_BASE_URL` (default: `http://127.0.0.1:5173`)

## Coverage

Current suite validates:

- unauthenticated route guard redirect
- student login success and nav visibility
- catalog navigation + pagination controls
- partners page load + search UI
- rankings page load + submit control visibility
- profile validation mismatch + logout

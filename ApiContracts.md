# API Contracts (Frontend ↔ Backend)

Base URL: `http://localhost:8001`
API Prefix: `/api`
Auth: Bearer token in `Authorization` header for protected endpoints.

## Headers
- `Content-Type: application/json`
- `Authorization: Bearer <access_token>` (required on protected endpoints)

---

## Health
### `GET /health`
**Auth:** No

**Response 200**
```json
{ "status": "ok" }
```

---

## Auth
### `POST /api/auth/register`
**Auth:** No

**Request**
```json
{
  "email": "student@duke.edu",
  "password": "secret",
  "display_name": "Student Name"
}
```

**Response 200**
```json
{
  "access_token": "jwt",
  "token_type": "bearer",
  "user": { "id": 1, "email": "student@duke.edu", "display_name": "Student Name" }
}
```

**Errors**
- `400` Email is already registered

### `POST /api/auth/login`
**Auth:** No

**Request**
```json
{ "email": "student@duke.edu", "password": "secret" }
```

**Response 200**
```json
{
  "access_token": "jwt",
  "token_type": "bearer",
  "user": { "id": 1, "email": "student@duke.edu", "display_name": "Student Name" }
}
```

**Errors**
- `401` Invalid email or password

### `GET /api/auth/me`
**Auth:** Yes

**Response 200**
```json
{ "id": 1, "email": "student@duke.edu", "display_name": "Student Name" }
```

---

## Projects (Client Intake Forms)
### `GET /api/projects`
**Auth:** No

**Query params**
- `q` (string, optional)
- `domain` (string, optional)
- `organization` (string, optional)
- `limit` (int, default 50)
- `offset` (int, default 0)

**Response 200**
```json
[
  {
    "id": "Blue Ridge SaaS",
    "title": "NLP for Customer Support Insights",
    "description": "Analyze support tickets...",
    "duration_weeks": null,
    "difficulty": null,
    "modality": null,
    "cadence": null,
    "confidentiality": null,
    "min_hours_per_week": null,
    "max_hours_per_week": null,
    "domain": "AI/ML",
    "organization": "Blue Ridge SaaS",
    "tags": ["Python","NLP","Topic Modeling"],
    "skills": ["Python","NLP","Topic Modeling"],
    "avg_rating": null,
    "ratings_count": 0,
    "created_at": "2026-02-12T12:00:00Z"
  }
]
```

---

## Search
### `POST /api/search/projects`
**Auth:** No

**Request**
```json
{
  "q": "analytics",
  "domains": ["AI/ML", "Analytics"],
  "skills": ["Dashboard", "SQL"],
  "industries": ["CPG"],
  "organization": "Duke",
  "match_mode": "and",
  "limit": 50,
  "offset": 0
}
```

**Response 200**
```json
[
  {
    "id": "Blue Ridge SaaS",
    "title": "NLP for Customer Support Insights",
    "description": "Analyze support tickets...",
    "duration_weeks": null,
    "difficulty": null,
    "modality": null,
    "cadence": null,
    "confidentiality": null,
    "min_hours_per_week": null,
    "max_hours_per_week": null,
    "domain": "AI/ML",
    "organization": "Blue Ridge SaaS",
    "tags": ["Python","NLP","Topic Modeling"],
    "skills": ["Python","NLP","Topic Modeling"],
    "avg_rating": null,
    "ratings_count": 0,
    "created_at": "2026-02-12T12:00:00Z"
  }
]
```

---

## Filters
### `GET /api/filters`
**Auth:** No

**Response 200**
```json
{
  "domains": ["AI/ML","Analytics"],
  "skills": ["Python","SQL"],
  "difficulties": [],
  "modalities": [],
  "cadences": [],
  "confidentiality": [],
  "industries": ["Software","Finance"],
  "company_sizes": []
}
```

---

## Organizations / Domains / Skills (derived from intake forms)
### `GET /api/organizations`
**Auth:** No

**Response 200**
```json
[{ "id": 1, "name": "Blue Ridge SaaS", "industry": "Software", "company_size": null }]
```

### `GET /api/domains`
**Auth:** No

**Response 200**
```json
[{ "id": 1, "name": "AI/ML" }]
```

### `GET /api/skills`
**Auth:** No

**Response 200**
```json
[{ "id": 1, "name": "Python" }]
```

---

## Stats
### `GET /api/stats`
**Auth:** No

**Response 200**
```json
{ "active_projects": 24, "new_this_week": 5 }
```

---

## User Summary
### `GET /api/user-summary`
**Auth:** Yes

**Response 200**
```json
{ "avg_match_score": 86 }
```

---

## Cart
### `GET /api/cart`
**Auth:** Yes

**Response 200**
```json
{
  "user_id": 1,
  "status": "open",
  "selected": 2,
  "limit": 10,
  "project_ids": ["Blue Ridge SaaS","QuillPay"]
}
```

### `POST /api/cart/items`
**Auth:** Yes

**Request**
```json
{ "project_id": "Blue Ridge SaaS" }
```

**Response 200** (same as `GET /api/cart`)

### `DELETE /api/cart/items/{project_id}`
**Auth:** Yes

**Response 200** (same as `GET /api/cart`)

---

## Teammate Choices
### `GET /api/students`
**Auth:** No

**Response 200**
```json
[{ "id": 1, "full_name": "Avery Patel", "email": "avery@duke.edu", "program": "MIDS" }]
```

### `GET /api/teammate-choices`
**Auth:** Yes

**Response 200**
```json
{ "want_ids": [1,2], "avoid_ids": [3] }
```

### `POST /api/teammate-choices`
**Auth:** Yes

**Request**
```json
{ "want_ids": [1,2], "avoid_ids": [3] }
```

**Response 200**
```json
{ "want_ids": [1,2], "avoid_ids": [3] }
```

**Errors**
- `400` Each list must have at most 5 students
- `400` A student cannot be in both lists

---

## Rankings
### `GET /api/rankings`
**Auth:** Yes

**Response 200**
```json
{
  "top_ten": [
    { "id": "Blue Ridge SaaS", "title": "NLP for Customer Support Insights", "organization": "Blue Ridge SaaS", "tags": ["Python","NLP"] }
  ],
  "additional": [
    { "id": "QuillPay", "title": "Product Growth Experimentation Lab", "organization": "QuillPay", "tags": ["A/B Testing"] }
  ],
  "ranked_count": 1,
  "top_limit": 10
}
```

### `POST /api/rankings`
**Auth:** Yes

**Request**
```json
{ "top_ten_ids": ["Blue Ridge SaaS","QuillPay"] }
```

**Response 200** (same as `GET /api/rankings`)

**Errors**
- `400` Top 10 max
- `400` Duplicate project

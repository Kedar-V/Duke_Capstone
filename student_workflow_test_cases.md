# Student Workflow Test Cases

Purpose: End-to-end and API-level test coverage for student-facing workflows in the Duke Capstone app.
Scope: Student user journey only (login/setup, catalog, ratings, shortlist/cart, rankings, teammate preferences, profile, auth guards).

## Test Data Setup

- Student account A in cohort C1 with password set.
- Student account B in cohort C1 with no password set (first-login flow).
- Student account C in cohort C2.
- At least 12 projects in cohort C1, 5 projects in cohort C2.
- At least 8 students in C1 and 4 students in C2.
- Some projects with and without company logos.

## Authentication and Session

### AUTH-001: Login success
- Precondition: Student A exists with valid password.
- Steps: Open `/login` -> enter valid email/password -> submit.
- Expected: Redirect to `/projects`, token stored, user context loaded.

### AUTH-002: Login invalid password
- Precondition: Student A exists.
- Steps: `/login` with wrong password.
- Expected: Error shown: incorrect credentials; stay on login page.

### AUTH-003: Login for deleted user
- Precondition: User marked deleted (`deleted_at` set).
- Steps: Attempt login.
- Expected: 401 invalid credentials behavior.

### AUTH-004: First-login required path
- Precondition: Student B has no password hash.
- Steps: Attempt normal login.
- Expected: UI switches to setup mode with first-login message.

### AUTH-005: Request OTP success
- Precondition: Student B no password hash.
- Steps: Setup mode -> click request OTP.
- Expected: Info toast/message confirming OTP sent.

### AUTH-006: Request OTP on already-configured account
- Precondition: Student A has password.
- Steps: Setup mode -> request OTP for Student A.
- Expected: Error: password already configured.

### AUTH-007: Verify OTP success
- Precondition: Student B OTP valid (dev code `0000`).
- Steps: Setup mode -> fill name/email/OTP/new password >=8 -> submit.
- Expected: Password set, token returned, redirect to `/projects`.

### AUTH-008: Verify OTP invalid code
- Precondition: Student B in setup mode.
- Steps: Enter wrong OTP -> submit.
- Expected: Error invalid/expired OTP.

### AUTH-009: Verify OTP weak password
- Precondition: Student B in setup mode.
- Steps: New password <8 chars.
- Expected: Password length error; no login.

### AUTH-010: Logout behavior
- Steps: Open account menu -> Sign out.
- Expected: Auth storage cleared, redirected to `/login`, protected routes blocked.

### AUTH-011: Session persistence after refresh
- Steps: Login, reload browser on `/projects`.
- Expected: Remains authenticated and on protected route.

### AUTH-012: Cross-tab auth change
- Steps: Login in tab A, sign out in tab B.
- Expected: tab A reacts to storage/auth change and loses protected access.

## Route Guards and Role Access

### ROUTE-001: Unauthenticated access denied
- Steps: Visit `/projects`, `/partners`, `/rankings`, `/profile` without token.
- Expected: Redirect to `/login`.

### ROUTE-002: Student blocked from admin route
- Steps: Login as student -> navigate to `/admin`.
- Expected: Redirect to `/projects`.

### ROUTE-003: Root route redirect
- Steps: Visit `/`.
- Expected: Redirect to `/login`.

### ROUTE-004: Unknown route redirect
- Steps: Visit unknown path.
- Expected: Redirect to `/login`.

## Catalog Browse, Search, Filter, Pagination

### CAT-001: Initial catalog load
- Steps: Login as Student A -> open `/projects`.
- Expected: Stats, filters, projects, cart, ratings, user summary load with no errors.

### CAT-002: Cohort scoping on catalog
- Precondition: Student A in C1, C2 projects exist.
- Steps: Open catalog.
- Expected: Only C1 projects returned.

### CAT-003: Search by keyword
- Steps: Enter keyword matching title/summary/org.
- Expected: Matching projects shown; non-matches hidden.

### CAT-004: Domain filter AND mode
- Steps: Select multiple domains with match mode `and`.
- Expected: Only projects satisfying all selected domains/criteria returned.

### CAT-005: Domain filter OR mode
- Steps: Select multiple domains with mode `or`.
- Expected: Projects matching any selected domain returned.

### CAT-006: Skill filter behavior
- Steps: Select one or more skills.
- Expected: Skill-matching projects only.

### CAT-007: Industry filter behavior
- Steps: Select industry filters.
- Expected: Matching org industry projects only.

### CAT-008: Cohort filter ignored for student own cohort
- Precondition: Student A in C1.
- Steps: Attempt filter for C2 cohort from UI payload path.
- Expected: Backend still enforces C1 scope.

### CAT-009: Pagination next/previous
- Steps: Navigate pages with Google-style controls.
- Expected: Correct page items, previous/next state accurate, ellipsis rendering valid.

### CAT-010: Empty search result
- Steps: Search impossible keyword.
- Expected: Empty state shown; no crash.

### CAT-011: Filter reset
- Steps: Apply filters then clear.
- Expected: Full scoped list restored to first page.

### CAT-012: Card details navigation
- Steps: Click card or details button.
- Expected: Navigate to `/projects/:slug`.

## Project Detail Page

### PDP-001: Project detail load by valid slug
- Steps: Open known project slug.
- Expected: Full detail sections render, including links/lists where present.

### PDP-002: Project detail not found
- Steps: Open unknown slug.
- Expected: Error state shown gracefully.

### PDP-003: Student blocked from other cohort project
- Precondition: Student A C1, project in C2.
- Steps: Open C2 slug directly.
- Expected: 404-style not found behavior.

### PDP-004: Logo fallback rendering
- Precondition: project without logo or broken URL.
- Steps: Open PDP.
- Expected: Initials fallback shown; no broken image icon retained.

### PDP-005: Rating interaction on PDP
- Steps: Click star rating.
- Expected: Rating saved and reflected immediately.

### PDP-006: Add to selected requires rating
- Steps: On unrated project click Select.
- Expected: Error instructing to rate first.

## Ratings

### RATE-001: Save valid rating bounds
- Steps: Submit rating 1 and 10.
- Expected: Both accepted and persisted.

### RATE-002: Reject out-of-range rating low
- Steps: API attempt rating 0.
- Expected: 400 rating between 1 and 10.

### RATE-003: Reject out-of-range rating high
- Steps: API attempt rating 11.
- Expected: 400.

### RATE-004: Rating upsert behavior
- Steps: Rate same project 6 then 9.
- Expected: One row updated to 9, not duplicated.

### RATE-005: Cannot rate out-of-cohort project as student
- Steps: API save rating for C2 project as C1 student.
- Expected: 404 project not found.

## Cart / Selected Projects

### CART-001: Add rated project to cart
- Steps: Rate project, click Select.
- Expected: Project appears in cart list/count.

### CART-002: Add unrated project rejected
- Steps: Select without rating.
- Expected: Backend 400 and UI message.

### CART-003: Remove project from cart
- Steps: Remove selected project.
- Expected: Item removed and counts updated.

### CART-004: Cart max 10 limit
- Steps: Attempt to add 11th rated project.
- Expected: Cart remains capped at 10.

### CART-005: Duplicate add idempotency
- Steps: Add same rated project twice.
- Expected: No duplicate cart entries.

### CART-006: Cart excludes deleted projects
- Precondition: Admin soft-deletes carted project.
- Steps: Reload cart/rankings.
- Expected: Deleted project not returned.

## Rankings (Autosave, Validation, Submit/Lock)

### RANK-001: Rankings page loads top + additional
- Steps: Open `/rankings` with cart items.
- Expected: Top Ten and additional sections render.

### RANK-002: Add to top ten requires rating
- Steps: Try move unrated project to top ten.
- Expected: Prevented with error popup.

### RANK-003: Top ten max size
- Steps: Try adding 11th project.
- Expected: Prevented with error.

### RANK-004: Drag reorder in top ten
- Steps: Drag item positions.
- Expected: Order updates and autosave triggers.

### RANK-005: Autosave executes after edit debounce
- Steps: Reorder list, wait.
- Expected: Save request issued; state shows Saved.

### RANK-006: Save rankings with duplicate IDs rejected
- Steps: API POST duplicate project ids.
- Expected: 400 duplicate project.

### RANK-007: Save rankings >10 rejected
- Steps: API POST >10 ids.
- Expected: 400 top 10 max.

### RANK-008: Save rankings with unrated project rejected
- Steps: API POST includes unrated project.
- Expected: 400 all ranked projects must be rated.

### RANK-009: Submit requires exactly 10 ranked items
- Steps: Submit with fewer than 10 valid ranked-in-cart items.
- Expected: 400 exact 10 required.

### RANK-010: Submit locks rankings
- Steps: Submit valid top ten.
- Expected: is_submitted true, submitted_at set, UI locked.

### RANK-011: Post-submit edits blocked
- Steps: After submit, attempt drag/add/remove/save.
- Expected: No changes accepted; backend returns locked error on save.

### RANK-012: Re-submit idempotent
- Steps: Submit again after lock.
- Expected: Existing submitted view returned without mutation.

### RANK-013: Deadline enforcement
- Precondition: `RANKINGS_SUBMISSION_DEADLINE_UTC` set to past.
- Steps: Save or submit rankings.
- Expected: 400 submission window closed.

## Teammate Preferences (Partners)

### PART-001: Partners page loads cohort students only
- Precondition: Student A in C1.
- Steps: Open `/partners`.
- Expected: Only C1 classmates shown; self excluded.

### PART-002: Search classmates
- Steps: Enter search text by name/email/program.
- Expected: Matching classmates filtered.

### PART-003: Add want up to limit
- Steps: Add 5 want selections.
- Expected: All accepted.

### PART-004: Want limit enforcement
- Steps: Attempt 6th want.
- Expected: UI error and no extra selection.

### PART-005: Add avoid up to limit
- Steps: Add 5 avoid selections.
- Expected: Accepted.

### PART-006: Avoid limit enforcement
- Steps: Attempt 6th avoid.
- Expected: UI error and no extra selection.

### PART-007: Mutual exclusivity want vs avoid
- Steps: Mark same person want then avoid.
- Expected: Person removed from want when added to avoid (and vice versa).

### PART-008: Save teammate choices success
- Steps: Save with valid lists/comments.
- Expected: Persisted and returned correctly from GET.

### PART-009: Reject overlap in backend
- Steps: API POST same student in want and avoid.
- Expected: 400 cannot be in both lists.

### PART-010: Reject >5 in backend
- Steps: API POST 6 want or 6 avoid.
- Expected: 400 each list max 5.

### PART-011: Reject out-of-cohort IDs for student
- Steps: API POST teammate id not in student cohort.
- Expected: 400 must be from your cohort.

### PART-012: Student without cohort cannot save teammate choices
- Precondition: student role with null cohort_id.
- Steps: POST teammate choices.
- Expected: 400 student cohort required.

### PART-013: Comment persistence
- Steps: Add comments for want/avoid, save, reload.
- Expected: Comments restored for mapped IDs.

### PART-014: Encryption path reliability
- Steps: Save teammate choices and inspect DB rows.
- Expected: ciphertext/hash persisted; no plaintext student id in payload.

## Profile Management

### PROF-001: Profile load success
- Steps: Open `/profile`.
- Expected: Display name, email, image URL loaded.

### PROF-002: Update display name only
- Steps: Change name -> save.
- Expected: Success banner, header/avatar uses updated stored user.

### PROF-003: Password change success
- Steps: Enter valid new password + matching confirm.
- Expected: Save success and future login works with new password.

### PROF-004: Password too short
- Steps: Enter <8 characters.
- Expected: Client-side error, no request.

### PROF-005: Password mismatch
- Steps: New and confirm mismatch.
- Expected: Client-side mismatch error.

### PROF-006: Update profile image URL valid
- Steps: Set `https://...` URL and save.
- Expected: Saved and reflected in account avatars.

### PROF-007: Invalid profile image URL schema
- Steps: Set non-http(s) URL and save.
- Expected: 400 from backend and error shown.

### PROF-008: Clear profile image URL to default resolver
- Steps: Clear image URL and save.
- Expected: Backend resolves default MIDS/fallback image URL.

### PROF-009: Update request with nothing changed
- Steps: API PUT `/api/auth/me` with empty payload.
- Expected: 400 nothing to update.

## Navigation and UX State

### NAV-001: Menu routes for student
- Steps: Use menu buttons Projects/Partners/Rankings.
- Expected: Correct navigation and active page state.

### NAV-002: Account dropdown actions
- Steps: Open account menu -> Profile, then Sign out.
- Expected: Profile route works; sign out clears session.

### NAV-003: Mobile menu toggle behavior
- Steps: Open and close burger menu on each student page.
- Expected: Menu visibility toggles correctly with no layout break.

## Security / Access Control Regression

### SEC-001: API rejects protected endpoints without token
- Steps: Call `/api/cart`, `/api/rankings`, `/api/teammate-choices`, `/api/auth/me` without token.
- Expected: Unauthorized response.

### SEC-002: Student cannot mutate admin endpoints
- Steps: Call `/api/admin/*` as student.
- Expected: Forbidden/unauthorized.

### SEC-003: Student cannot access other cohort resources by direct ID
- Steps: Try rating/carting/project-detail for different cohort.
- Expected: 404 not found semantics.

### SEC-004: Soft-deleted user token behavior
- Steps: Use token from user later marked deleted.
- Expected: Protected operations fail with auth/user-not-found behavior.

## Suggested Automation Priorities

- Priority 1: AUTH-001..009, CAT-001..009, RATE-001..005, CART-001..005, RANK-001..012, PART-001..011, PROF-001..008, ROUTE-001..004.
- Priority 2: NAV mobile checks, deadline behavior, encryption/DB-level checks.
- Priority 3: visual regression snapshots for Catalog/PDP/Rankings/Partners/Profile.

## Acceptance Criteria for Student Workflow Sign-off

- All Priority 1 tests pass in CI and staging.
- No P1/P2 defects open in auth, rankings submission/lock, or cohort isolation.
- Rankings submission and teammate selection constraints are enforced in both UI and API.
- Student cannot access admin capabilities or out-of-cohort project data.

# Backend review and plans for the remaining steps (22 Nov 2026)

A read-through of `server/` and the admin screens, done to decide what must still be built before the 27 Dec freeze and what would make the project stronger at the 18 Jan defence. Step numbers refer to `docs/next-steps.md`.

## 1. Where the backend stands

Strong already, and worth showing at the defence:

- **One permission table** (`lib/permissions.ts`) behind every route, with record-level checks in services and 404 instead of 403 for records a user may not know of.
- **Role-based views** built from explicit field lists (`discovery/visibility.ts`), so no route returns a whole database row.
- **Encryption** of private text (report reasons, contact introductions, messages) with key rotation, **audit rows** for every Admin decision, written in the same transaction as the change and the notification.
- **Request hardening:** Helmet, an Origin check against cross-site requests, rate limits on sign-in, email, invites, reports, comments, contacts and messages, a 100 kB body limit, HTTPS redirect and secure cookies in production.
- **Tests:** 1157 across 24 files, including denied cases, a guard that every route is either public or answers 401, and a check that responses never leak emails, hashes or tokens.
- **New this week:** no 90-second stall after idle, hourly cleanup of stale rows, and email confirmation at sign-up.

## 2. Bugs found during the review (fix first, small)

The two paging bugs were fixed with step 7 on 22 Nov; the review queue now signs screenshots for one page only.

| Bug | Where | Effect | Fix |
|-----|-------|--------|-----|
| Admin report queue shows only the first page | `client/src/components/ReportQueue.tsx` calls `/admin/reports?status=…` and ignores `hasMore` | With more than 20 open reports, the rest cannot be reached from the screen | Add "Load more" using `page`; part of step 7 |
| Admin user list shows only the first page | `AdminModeration.tsx` loads `/admin/users` once | Users beyond the first page cannot be found except by searching | Same "Load more" |
| Review queue signs every screenshot on every load | `admin/reviews.ts` `listReviews()` calls `signScreenshots` for each submission | One Supabase call per screenshot per page view; slow as the queue grows | Paging (step 7) plus link reuse (step 8) |

## 3. What to add

### Must (needed for the submission or the defence)

| # | Work | Why | Plan step |
|---|------|-----|-----------|
| M1 | Content policy page and report categories with a copyright option | **Done 22 Nov**, migration applied to the shared database | 6 |
| M2 | Page limits on every admin list, and "Load more" on the screens | Bugs above; queues must stay usable as data grows | 7 |
| M3 | Tests on every push (GitHub Actions) | NFR-M3; also shows evidence of testing at the defence | 10 |
| M4 | Change password while signed in | **Done 22 Nov:** `POST /api/auth/me/password` and a form on the account page | New, below |
| M5 | Clean shutdown and a health check that touches the database | **Done 22 Nov:** `/api/health` answers 503 when the database does not reply within 5 s; SIGTERM and SIGINT finish open requests (up to 10 s), stop the timers and close the database before exiting | New, below |
| M6 | One source for the Google button | It can show while the server has Google sign-in off, or the reverse | 9 |

### Should (makes the project noticeably more solid)

| # | Work | Why |
|---|------|-----|
| S1 | Reuse screenshot links until they expire (step 8) | Faster project pages and review queue |
| S2 | "Sign out other devices" on the account page | Users can end a session left open elsewhere; one `deleteMany` |
| S3 | Delete my account | Expected for personal data; keep audit rows, remove or anonymise the rest |
| S4 | Admin overview counts | One request returning how many submissions, revisions, reports, offers and role requests are waiting; badges on the Admin tabs |
| S5 | Audit log screen for Admins with filters (action, actor, date) | Today only per user and capped at 50; strong evidence for the security story |
| S6 | Short request log in production (method, path, status, time, no bodies) | Makes the load test (step 12) and demo problems explainable |

### Later, only if time is left

Email for key decisions (role approved, report closed), precomputed like and comment counts for the "most liked" order, and full-text search.

## 4. Plans for the remaining steps

### Step 6: Content policy and copyright reports (NFR-L1)

**Database (one migration, ask before applying):**
- `Report.category String @default("OTHER")`, values in `domain.ts` as `REPORT_CATEGORIES = ['SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'COPYRIGHT', 'PRIVACY', 'MISLEADING', 'OTHER']`. Existing reports become `OTHER`.
- For copyright: `Report.originalWorkUrl String?` and `Report.copyrightDeclaredAt DateTime?`.
- Optional, for evidence: `User.policyAcceptedAt DateTime?` and the same on `PendingRegistration`, set at sign-up.

**Server:**
- `reports/schemas.ts`: add `category` (required) and, with `superRefine`, require for `COPYRIGHT` a ticked declaration ("I own this work or am authorised to act for the owner") and allow an optional `originalWorkUrl` (http or https only, max 500). `COPYRIGHT` is allowed only for `PROJECT`, `COMMENT` and `OFFER` targets.
- `reports/service.ts`: store the new fields; the reason stays encrypted.
- `admin/reports.ts`: return `category`, `originalWorkUrl` and `copyrightDeclaredAt` in `reportView`; add `category` as an optional filter on `reportListQuery`.
- Confirming a copyright report uses the existing confirm → remove path, so no new removal logic.

**Client:**
- `ReportButton.tsx`: a category select before the reason; choosing Copyright shows the link field and the declaration tick box.
- New page `/policy` (static): what may be posted, ownership and copyright, how to report, what Admins do with a report, and consequences (hide, removal, restriction, ban), with links to FR13, FR14 and FR16 behaviour.
- A small site footer with "Content policy"; a line under the sign-up button: "By creating an account you agree to the Content policy".
- `ReportQueue.tsx`: category badge and filter; copyright details on the report.

**Tests:** category required; unknown category refused; copyright without the tick refused; copyright on a USER or CONVERSATION refused; a non-http link refused; the Admin view returns the new fields and still never the reporter's email; filter by category; `views.test.ts` field lists updated.

**Done when:** every report has a category, copyright reports carry the declaration, the policy page is linked from the footer and sign-up, and the tests above pass.

### Step 7: Page limits on admin lists

**One pattern for all lists**, matching what reports already do: `?page=` (1 to 1000, default 1), 20 per page, oldest first with `id` as the tie-break, response `{ page, items, hasMore }`, fetching 21 rows to know `hasMore`.

- Add `server/src/lib/paging.ts` with `pageQuery` (zod) and `toPage(rows, page)`, and use it in reports and users too, so there is one copy.
- Apply to: `GET /admin/reviews` (submissions and revisions paged separately with `submissionsPage` and `revisionsPage`, each with its own `hasMore`), `GET /admin/offers`, `GET /admin/projects/removed` (newest first), `GET /admin/role-requests`, and `GET /admin/users/:id/audit` (replacing the fixed 50).
- Client: a small `usePagedList(path)` hook returning `items`, `hasMore`, `loadMore` and `reload`, used by ReviewQueue, ReportQueue, AdminModeration (users, removed projects, role requests) and the offer queue. After a decision, remove the item from the list instead of reloading everything.

**Tests:** 21 items give 20 with `hasMore: true`, page 2 gives 1 with `hasMore: false`; a page past the end is empty; `page=0` and `page=abc` answer 400; order is stable when two rows share a timestamp; non-Admins still get 403; `views.test.ts` and `permissions.test.ts` updated for the new query and fields.

**Done when:** no admin list loads unbounded rows, and every admin screen can reach every item.

### Step 8: Reuse screenshot links

In `lib/storage.ts`, keep signed links in a `Map<path, { url, expiresAt }>` capped at about 2000 entries, reused until a minute before expiry and dropped when a file is deleted or replaced. **Test** with `MemoryStorage`: two views of a project make one signing call; a deleted screenshot is never served from the cache.

### Step 9: One source for the Google button

`GET /api/auth/config` returns `{ googleEnabled, googleClientId }` (the client id is public by design). `GoogleSignInButton.tsx` reads it from there and shows nothing when disabled; drop `VITE_GOOGLE_CLIENT_ID`. **Test:** config shape in `views.test.ts`; Google sign-in still refused with 503 when the server has no client id.

### Step 10: Tests on every push (NFR-M3)

`.github/workflows/ci.yml` on pull requests and pushes to `master`: Node 20, `npm ci`, both typechecks, then `npm test` with `TEST_DATABASE_URL` from a repository secret. Use a `concurrency` group so two runs never share the test schema at once, and a 60-minute timeout (the suite takes about 35 minutes against Supabase). The secret must be added on `NiyamulGoni/Project_Bridge`; pull requests from forks do not get secrets, so typechecks run there and the full suite runs once merged.

### M4: Change password while signed in

`POST /api/auth/me/password` with `{ currentPassword, newPassword }`, behind `requireAuth` and the email rate limiter. Check the current password with bcrypt, apply the new-password rules, save, delete every other session of the user, write a `PASSWORD_CHANGED` audit row, and keep the current session. Google-only accounts (no password) are told to use forgot-password. A form on the account page. **Tests:** wrong current password refused; weak new password refused; other sessions ended and the current one kept; Guest gets 401.

### M5: Clean shutdown and a real health check

In `index.ts`, on `SIGTERM` and `SIGINT` stop accepting requests, stop the keep-alive and cleanup timers, `prisma.$disconnect()`, then exit. `/api/health` runs `SELECT 1` with a short timeout and answers 503 when the database is unreachable, so a host or uptime monitor sees the real state.

## 5. Suggested order to 27 Dec

| Week | Work |
|------|------|
| 23–29 Nov | Step 7 (also fixes the two paging bugs), M4 |
| 30 Nov–6 Dec | Gate week: only fixes from the acceptance rehearsal |
| 7–13 Dec | Step 6 (migration first), M5 |
| 14–20 Dec | Steps 8, 9 and 10 |
| 21–27 Dec | S2 to S6 as time allows, then freeze |

## 6. Decisions needed from the team

1. **Sign-up agreement:** a tick box that must be ticked ("I agree to the Content policy"), or the passive line under the button? The tick box gives stronger evidence for NFR-L1.
2. **Report categories:** is the list in step 6 right, or does the proposal name its own?
3. **Page size:** 20 per page everywhere (as reports today), or 50?
4. **Deleting an account (S3):** remove the user's projects too, or keep published projects under "Deleted user"?

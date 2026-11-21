# Next steps (updated 21 Nov 2026)

Carried over from the last Claude Code session on Niyamul's MacBook, then checked against the code on 21 Nov. Course gates: **7 Dec** (F01–F07 and F13 accepted), **27 Dec** feature freeze, **18 Jan** defence.

Owners follow the team roles: Shezad (backend), Riyad (frontend), Rakibul (test/QA), Sourav (lead, docs and demo). Do each step on its own branch and check it on localhost before committing.

## Where things stand

| Area | State on 21 Nov |
|------|-----------------|
| Profile cover fix | Redone on Shezad's machine (`Account.tsx`, `styles.css`): empty cover is a drafting grid labelled "No cover photo", button readable in both themes. Not committed yet. The MacBook's `fix/profile-cover` branch was never pushed; drop it. |
| Email verification (FR01) | Built on branch `fix/db-stall`; its migration was applied to the shared database on 21 Nov (11 existing accounts marked verified). Sign-up saves a pending registration and emails a one-time link valid 24 hours; the account and its first sign-in exist only once the link is used. Later sign-ins need no email. Existing accounts are marked verified by the migration. |
| Content policy, copyright reports (NFR-L1) | Built on branch `fix/db-stall` (22 Nov), migration `20261122120000_report_categories` applied to the shared database on 22 Nov (2 existing reports set to Other). `/policy` page linked in the footer; sign-up and new Google accounts need a ticked agreement, recorded as `policyAcceptedAt`; every report has a category, and copyright reports carry the owner's statement and an optional link. |
| Database stall | Fixed on branch `fix/db-stall` (first request after 15 idle minutes: 2.4 s, was 91 s; all 1138 tests pass): `socket_timeout` 15 → 6 s, `pool_timeout` 40 → 15 s, transaction `maxWait` 40 → 15 s, and a `SELECT 1` per pooled connection every 3 minutes. Worst case for a read drops from about 85 s to 33 s, and the ping should stop the stall happening at all. |
| Session cleanup | Done on branch `fix/db-stall`: `server/src/lib/cleanup.ts` runs at start-up and hourly, deleting expired sign-ins, expired email links and guest sessions older than the 30-day guest cookie. Guest sessions were already created only by the feed, search and project view, which need them to count cards, so that part needed no change. |
| Admin list paging | Done (step 7, 22 Nov): every Admin list pages 20 at a time through `server/src/lib/paging.ts`, and every Admin screen has "Load more" (`client/src/lib/usePagedList.ts`). This also fixed the report queue and user list, which showed only their first page. |
| Screenshot links | Done (step 8, 22 Nov): `SignedUrlCache` in `server/src/lib/storage.ts` reuses each link while more than half its 15 minutes remain. A project page with 3 screenshots went from 1.8 s to about 0.6 s on repeat views. |
| Google button | Done (step 9, 22 Nov): `GOOGLE_CLIENT_ID` in `server/.env` is the only setting; the button reads it from `GET /api/auth/config`, and `VITE_GOOGLE_CLIENT_ID` is gone. |
| CI (NFR-M3) | Missing. No `.github/workflows`. |
| Final docs | Missing: deployment guide, backup steps, load test, accessibility and usability records. |

## Plan to 7 Dec: pass the gate

| # | Work | Owner | Done when |
|---|------|-------|-----------|
| 1 | Commit and merge the cover fix | Riyad | Empty and photo covers readable in light and dark, on master |
| 2 | Fix the 90-second stall | Shezad | Shorter socket and pool timeouts; a `SELECT 1` per pooled connection every 3 minutes keeps connections alive; `tests/prisma.test.ts` covers the settings; the first request after 15 idle minutes answers in under 5 s |
| 3 | Session cleanup | Shezad | Hourly job deletes expired sessions, expired email links and guest sessions whose cookie has expired (deleting them sooner would hand a guest a fresh 20-card budget); `tests/cleanup.test.ts` covers it |
| 4 | Email verification at sign-up (FR01) | Shezad + Riyad | No account until the emailed link is used; signing in before that is refused with "Send a new link"; signing up again or resending replaces the old link; Google proves the address too; tests for expired, reused, replaced and made-up links; migration `20261121120000_email_verification` applied with the team's OK |
| 5 | Gate rehearsal for F01–F07 and F13 | Rakibul | Each acceptance test (AT) for those features run by hand on a fresh database copy, with result and screenshot recorded in `docs/acceptance/` |

Step 4's migration adds `User.emailVerifiedAt` (backfilled for every existing account) and the `PendingRegistration` table. The team agreed on 21 Nov that existing, demo and test accounts count as verified. The migration is applied (21 Nov). Older code still runs against it, but `master` signs people up without confirmation until this branch is merged, so merge it soon.

## Plan to 27 Dec: finish features and harden

| # | Work | Owner | Done when |
|---|------|-------|-----------|
| 6 | Content policy page and copyright report option (NFR-L1) | Riyad + Shezad | **Built 22 Nov.** `/policy` page and footer link; required tick box at sign-up (also for Google); seven report categories; copyright reports need the ownership statement and allow a link; Admin queue shows and filters by category |
| 7 | Page limits on the remaining admin lists | Shezad | **Done 22 Nov.** Review queue (submissions and changes paged separately), offers, removed projects, role requests and account history load 20 at a time; `tests/adminPaging.test.ts` covers every list |
| 8 | Reuse screenshot links | Shezad | **Done 22 Nov.** Links reused while over half their lifetime remains (the gallery loads lazily), dropped when a file is removed; `tests/signedUrlCache.test.ts` |
| 9 | One source for the Google button | Riyad | **Done 22 Nov.** The button shows exactly when the server accepts Google sign-ins |
| 10 | CI on every push (NFR-M3) | Rakibul | GitHub Action runs install, both typechecks and the test suite against a test database secret; badge in README; master protected so a red run blocks merging |
| 11 | Full UI pass | Riyad + Rakibul | Every page checked as Guest, Uploader, Professional, Admin and banned, in light and dark, at 375 px; findings fixed or listed in `docs/ui-redesign/AUDIT.md` |

**27 Dec: feature freeze.** After this, only bug fixes.

## Plan to 18 Jan: submission and defence

| # | Work | Owner | Done when |
|---|------|-------|-----------|
| 12 | Load test | Rakibul | k6 or autocannon run on feed, search and project view at 50 concurrent users; results and the server's limits written up |
| 13 | Deployment guide and backup steps | Shezad | `docs/deployment.md`: env vars (names only), build, start, Supabase backup and restore tried once |
| 14 | Accessibility and usability records | Riyad | Keyboard and screen-reader check per page, contrast check in both themes; five-person usability test with tasks and findings |
| 15 | Requirements traceability | Sourav | Table mapping each FR and NFR to its route, screen and test, built from `docs/route-security.md` |
| 16 | Demo script and data | Sourav | Seeded demo database with realistic projects; a 10-minute walkthrough (guest → uploader publishes → admin reviews → professional contacts and offers → report and removal); backup recording in case the network fails |
| 17 | Slides and rehearsal | Whole team | Problem, design, security model (central permissions, tiered views, encryption, audit), testing evidence, live demo; two full rehearsals with Q&A, the week of 11 Jan |

## Backend performance findings (from the MacBook session)

Memory is fine (API server about 61 MB, uploads capped at 2 MB). The slowness is the connection to the remote Supabase database:

1. **First request after idle hangs about 90 s** (measured 91 s, then 0.37 s). Supabase closes idle connections and the server notices only by waiting out the timeouts above. Fixed by step 2.
2. **Sessions never expire from the database.** Every cookieless visitor, bots included, creates a guest session. Fixed by step 3.
3. **Some admin lists have no page limit.** Fine at demo size, slower as data grows. Step 7.
4. **Screenshot links are fetched on every view.** Adds delay to project pages and the review queue. Step 8.
5. **"Most liked and commented" order recounts per request.** Fine for hundreds of projects; low priority, no step.

## Running it locally

`npm run dev` reads `PORT` for the API. If something else sets `PORT` (the Claude desktop preview does), start it with `PORT=4000 npm run dev`, which is what `.claude/launch.json` does.

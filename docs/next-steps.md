# Next steps (updated 21 Nov 2026)

Carried over from the last Claude Code session on Niyamul's MacBook, then checked against the code on 21 Nov. Course gates: **7 Dec** (F01–F07 and F13 accepted), **27 Dec** feature freeze, **18 Jan** defence.

Owners follow the team roles: Shezad (backend), Riyad (frontend), Rakibul (test/QA), Sourav (lead, docs and demo). Do each step on its own branch and check it on localhost before committing.

## Where things stand

| Area | State on 21 Nov |
|------|-----------------|
| Profile cover fix | Redone on Shezad's machine (`Account.tsx`, `styles.css`): empty cover is a drafting grid labelled "No cover photo", button readable in both themes. Not committed yet. The MacBook's `fix/profile-cover` branch was never pushed; drop it. |
| Email verification (FR01) | Built on branch `fix/db-stall`; its migration was applied to the shared database on 21 Nov (11 existing accounts marked verified). Sign-up saves a pending registration and emails a one-time link valid 24 hours; the account and its first sign-in exist only once the link is used. Later sign-ins need no email. Existing accounts are marked verified by the migration. |
| Content policy, copyright reports (NFR-L1) | Missing. No policy page, and reports have no copyright option. |
| Database stall | Fixed on branch `fix/db-stall` (first request after 15 idle minutes: 2.4 s, was 91 s; all 1138 tests pass): `socket_timeout` 15 → 6 s, `pool_timeout` 40 → 15 s, transaction `maxWait` 40 → 15 s, and a `SELECT 1` per pooled connection every 3 minutes. Worst case for a read drops from about 85 s to 33 s, and the ping should stop the stall happening at all. |
| Session cleanup | Done on branch `fix/db-stall`: `server/src/lib/cleanup.ts` runs at start-up and hourly, deleting expired sign-ins, expired email links and guest sessions older than the 30-day guest cookie. Guest sessions were already created only by the feed, search and project view, which need them to count cards, so that part needed no change. |
| Admin list paging | Reports and users are paged. Review queue (`admin/reviews.ts`), removed projects and role requests (`admin/moderation.ts`) load every row. |
| Screenshot links | `storage.ts` asks Supabase for a new signed link on every view. |
| Google button | Two sources: the server uses `GOOGLE_CLIENT_ID` (`/api/auth/config`), the client uses `VITE_GOOGLE_CLIENT_ID`. They can disagree. |
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
| 6 | Content policy page and copyright report option (NFR-L1) | Riyad + Shezad | `/policy` page linked in the footer and on sign-up; reports accept a "Copyright" reason; Admin review shows it; test for the new reason |
| 7 | Page limits on the remaining admin lists | Shezad | Review queue, removed projects and role requests load 50 at a time with the same `page` style as reports; `views.test.ts` updated |
| 8 | Reuse screenshot links | Shezad | Signed links cached in memory until a minute before expiry; project page makes no Storage call on a second view |
| 9 | One source for the Google button | Riyad | Client asks `/api/auth/config` only; `VITE_GOOGLE_CLIENT_ID` removed or used only as the button's client id when the server says enabled |
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

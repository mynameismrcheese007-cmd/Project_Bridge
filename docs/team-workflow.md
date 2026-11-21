# How we share work (team agreement)

ProjectBridge is built by four people who pull each other's work. This page is the agreement that lets anyone pull a teammate's work and carry on **without re-running the 40-minute test suite**: the person who pushes has already done it, and everyone trusts that.

## The agreement

**Whoever pushes vouches for the work.** By pushing, you are saying: "I ran the full checks below on exactly this code, and they passed." Your teammates rely on that, so they do not test it again after pulling. Everyone does the same for everyone else.

If something turns out broken after a pull, tell the person who pushed it. They fix it in their copy and push again, so the history shows whose change it was and the fix comes from the person who understands it.

## Before you push (the pusher's checklist)

1. **Start from the latest work:** `git pull` from the teammate whose work you build on, then `npm install`.
2. **Typecheck both halves:**
   ```bash
   cd server && npx tsc --noEmit && cd ../client && npx tsc --noEmit
   ```
3. **Run the full test suite and let it finish** (about 35–40 minutes against the Supabase test schema):
   ```bash
   npm test
   ```
   Every test must pass. Note the totals, for example "26 files, 1184 tests passed".
4. **Look at the screens you changed** in the browser (`npm run dev`), in light and dark mode, and at phone width if it is a page people use on phones.
5. **Database changes:** if you added a migration, ask the team lead before applying it to the shared database, apply it once with `npx prisma migrate deploy` (in `server/`), and tell the team in the same message as the push.
6. **Update the docs** your change affects: `docs/next-steps.md`, `docs/route-security.md` after adding a route, `CLAUDE.md` if a rule changed.
7. **Push, and tell the team** what you pushed and that the checks passed, for example:
   > Pushed `fix/db-stall` to my copy. Full suite: 26 files, 1184 tests passed. Migration `20261122120000_report_categories` already applied to the shared database. Link: …

If you could not finish a step (the suite was cut short, the database was down), say so in that message, so nobody relies on a check that did not happen.

## After you pull (the puller's checklist)

1. `git pull` from the link you were given.
2. `npm install` (new packages and the Prisma client are set up by this).
3. Restart `npm run dev`.

That is all. You do **not** run the full suite again, because the pusher already did. Run a single test file only if you are about to change that area, or if something looks broken.

## The shared database

- All four of us use **one** Supabase database. A migration applied once is there for everyone straight away; nobody re-applies it after pulling.
- Migration files live in git (`server/prisma/migrations/`), so a pull always brings them. `npx prisma migrate status` in `server/` shows whether anything is waiting.
- Tests use the separate `projectbridge_test` schema, never real data. Two people running the full suite at the same moment share that schema and can fail each other's runs, so say in the team chat when you start a full run.

## Secrets

`server/.env` is never committed, printed or pasted into chats. Get it privately from the team lead. Everyone must use the same `ENCRYPTION_KEYS`, or encrypted text reads as blank. The client needs no `.env`.

## Who can pull

Each of us shares work from our own GitHub copy, by sending the link to the teammates who need it. See "Access" below for who can see each copy.

### Access

_To be filled in once we decide how each copy is shared (public, or private with the four of us as collaborators)._

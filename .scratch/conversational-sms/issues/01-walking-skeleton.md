# 01 — Walking skeleton

**What to build:** A reviewer clones the repository, runs one command, and the system is up:
Postgres, Redis, the API and the web app all running, with the database schema already migrated.
No domain behaviour yet — this is the ground every other ticket stands on, and the point is that
nobody ever has to run a second setup command.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] `docker compose up` on a clean machine brings up Postgres, Redis, the API and the web app
- [x] Migrations run automatically as part of that command; no manual migration step exists
- [x] `GET /health` returns 200 whenever the API process is alive
- [x] `GET /ready` returns 200 only when Postgres and Redis both answer a real query, and a
      non-200 when either is down
- [x] Environment variables are validated at startup and the process refuses to boot on a missing
      or malformed value, naming the offending variable
- [x] The web app serves a page confirming it can reach the API
- [x] Typecheck and the (empty) test suite run green from the workspace root

## Retrofit note

The TDD loop and the gates in [00-definition-of-done.md](./00-definition-of-done.md) were added
after this ticket shipped. It is not reopened, but it leaves one debt the gates now see:
`apps/worker/src/env.ts` is uncovered, so `pnpm test` fails the 90% threshold until ticket 02 runs
the worker's consumer in the test process. Ticket 02 owns closing it.

# 01 — Walking skeleton

**What to build:** A reviewer clones the repository, runs one command, and the system is up:
Postgres, Redis, the API and the web app all running, with the database schema already migrated.
No domain behaviour yet — this is the ground every other ticket stands on, and the point is that
nobody ever has to run a second setup command.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `docker compose up` on a clean machine brings up Postgres, Redis, the API and the web app
- [ ] Migrations run automatically as part of that command; no manual migration step exists
- [ ] `GET /health` returns 200 whenever the API process is alive
- [ ] `GET /ready` returns 200 only when Postgres and Redis both answer a real query, and a
      non-200 when either is down
- [ ] Environment variables are validated at startup and the process refuses to boot on a missing
      or malformed value, naming the offending variable
- [ ] The web app serves a page confirming it can reach the API
- [ ] Typecheck and the (empty) test suite run green from the workspace root

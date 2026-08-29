# Drizzle as the data access layer

Postgres access goes through Drizzle, and migrations are Drizzle's own.

The criterion was not ergonomics but schema legibility: data modeling is an explicit evaluation
item, and with Drizzle the schema checked into the repository is plain SQL DDL — indexes, the
idempotency unique constraint, types — rather than a DSL the reader has to translate.

## Considered Options

- **Prisma** — rejected despite being the obvious path. The two central mechanisms of this design
  are Postgres-specific SQL: `INSERT ... ON CONFLICT DO NOTHING` for deduplication and keyset
  pagination on the `(created_at, id)` tuple. In Prisma both become `$queryRaw`, which defeats
  the reason to adopt it.
- **Kysely + node-pg-migrate** — an equally defensible choice, slightly more verbose.
- **Raw `pg` with SQL files** — rejected on time cost without proportional gain.

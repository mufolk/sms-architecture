# Postgres as the source of truth, Redis for the queue, no MongoDB

Conversations and Messages are relational and transactional: idempotency depends on a unique
constraint, the history depends on stable ordering, and the Message lifecycle depends on atomic
status transitions. Postgres delivers all three without effort. Redis enters only as the queue
substrate and for ephemeral state.

## Considered Options

- **MongoDB as the source of truth** — rejected: the raw webhook payload, the only genuinely
  schemaless piece of data here, fits in a `jsonb` column. Adopting Mongo for its sake would
  trade transactional guarantees for flexibility we do not use.
- **Postgres + Redis + Mongo** (Mongo as a raw webhook log) — rejected: polyglot persistence
  without a problem to justify it, and a third system to operate.

If raw payload volume ever dominates the database, the answer is moving them to date-partitioned
object storage, not to a second document store.

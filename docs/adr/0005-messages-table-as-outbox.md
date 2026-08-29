# Redis queue, with the `messages` table acting as the outbox

The webhook writes the Inbound Message to Postgres and, **after the commit**, enqueues the job in
Redis (BullMQ). Since no transaction spans both systems, a crash between the two steps would
leave the Message in `received` with no job — persisted and never processed. A periodic reaper
scans for Messages in `received` older than N seconds without a job and re-enqueues them.

The durability point is the Postgres commit: after it, the message will be processed, even if
late. That, and only that, is what "no message loss" means here.

## Considered Options

- **Classic transactional outbox** (an `outbox` table plus a relay) — rejected: it is the same
  mechanism with one more table to keep in sync. The `messages` table already carries the state
  (`received`) and the timestamp the relay needs; it *is* the outbox.
- **`pg-boss`** (queue inside Postgres) — **technically the cleanest of the three**: the enqueue
  joins the insert's transaction and the dual-write problem disappears. It was rejected because
  Redis also backs rate limiting and backpressure between API and worker, not because the design
  is worse. If those two needs go away, `pg-boss` is the right choice and the migration is cheap.

## Consequences

One reaper covers both forms of lost work: a Message in `received` with no job, and a Message in
`processing` older than the job timeout (worker died mid-flight). BullMQ's stalled-job detection
covers only the second, and only while Redis knows about the job. A reaper scanning Postgres
covers both and keeps the rule consistent: **the database knows what needs doing; Redis is only
acceleration**.

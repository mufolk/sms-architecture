# One test seam: the system boundary

All tests are written at a single seam. They drive the system through `POST /webhooks/sms` and
observe it through two outputs — `FakeSmsProvider` (what reached the handset) and the admin REST
(what the operator sees) — with real Postgres and Redis via testcontainers and the worker's queue
consumer running in the test process.

Every claim this design makes is observable from there: the 5-second ack, both deduplication
layers, per-Conversation ordering, retry classification, the DLQ, the Failure Notice, Needs
Attention, the `sent → delivered` transition, and keyset pagination.

## Considered Options

- **A second seam at `packages/core`** — rejected. Testing a use case against fake repositories
  proves the fakes work, not that the system works, and it duplicates coverage the system seam
  already has while coupling tests to the shape of the use case.
- **A seam at the repositories** — rejected: couples to Drizzle and does not prove end-to-end
  idempotency, which is the claim that matters.
- **A seam at the worker's job handler** — rejected: the same logic runs through the system seam
  with the real queue.
- **A seam at `MessageProcessor`** — rejected for now. The rules are observable in the reply text
  from the system seam. If the rules grow complex enough to need their own table of cases, promote
  it to a seam then.

## Consequences

`packages/core` exists for the structural reason in ADR-0003 — the domain not importing Fastify
or the Twilio SDK — not because it is a test target.

Three control points must exist in production code so the seam can reach the failure paths:
a swappable queue client in the `apps/api` composition root (to fail the enqueue and exercise the
reaper), failure modes on `FakeSmsProvider` (retryable and permanent), and on-demand Delivery
Receipt triggering. They are composition-root wiring, not test-only branches inside domain logic.

# 04 — Idempotency: duplicate deliveries change nothing

**What to build:** Twilio redelivers webhooks it is unsure about. When it does, the person on the
other end must not receive a second reply. A redelivered Provider Message SID is acknowledged and
otherwise ignored — no new Message, no new job, no second send.

Two layers do this: a unique constraint in the database, which is the guarantee that survives
losing Redis, and a queue-level job identity, which is the cheap shortcut for the common case.

This ticket delivers the first of the two centrepiece tests.

**Blocked by:** 02

**Status:** done

- [x] A unique constraint on the provider and Provider Message SID prevents a second Inbound
      Message row for the same SID
- [x] The webhook inserts in a way that does not error on conflict, and detects that nothing was
      inserted
- [x] A redelivered SID returns 200, enqueues nothing, and sends nothing — even when the original
      Outbound Message has not been confirmed delivered
- [ ] The queue job identity equals the Provider Message SID, so a duplicate enqueue is dropped
      before any work happens — **implemented** in `bullmq-job-queue.ts`, **not provable in
      isolation** at the ADR-0011 seam: webhook redelivery is absorbed by the database layer first,
      and no test can distinguish which layer prevented a duplicate without leaving the agreed
      seam
- [x] The Outbound Message row is written before the provider is called, carrying an idempotency
      key on that request, so a crash between the call and recording its result cannot produce a
      second send
- [x] **Centrepiece test:** delivering the same webhook payload twice produces exactly one
      Outbound Message
- [x] A test covers the redelivery arriving while the first is still processing

## How to work it

Red → green → refactor, one criterion at a time, at the seam of ADR-0011. The loop and the gates
are in [00-definition-of-done.md](./00-definition-of-done.md).

### Test order

The centrepiece test is the first test, and it fails for a different reason at each slice.

1. Deliver the same payload twice → exactly one Outbound Message reached the fake provider.
2. Push it down to the database: a second row for the same (provider, Provider Message SID) is
   refused by the unique constraint, and the webhook inserts on-conflict-do-nothing and detects
   that nothing was inserted.
3. Redelivery returns 200, enqueues nothing, sends nothing — including while the first is still
   processing.
4. Queue job identity equal to the Provider Message SID, so the duplicate dies before any work.
5. The Outbound row is written before the provider call, carrying the idempotency key.

Branch coverage bites here: the "nothing was inserted" path is the one that matters, so it gets its
own test rather than riding along with the happy path.

### Gates

- [x] `pnpm typecheck` green
- [x] `pnpm lint` green
- [x] `pnpm test` green, coverage at or above 90% on lines, branches, functions and statements
- [x] Every acceptance criterion above checked off, or reported plainly as not done and why

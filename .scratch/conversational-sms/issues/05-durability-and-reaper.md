# 05 — Durability: no message is lost after the commit

**What to build:** Writing to the database and enqueuing to Redis are two operations with no
shared transaction. If the process dies between them, the Message is saved and never processed —
lost despite being persisted. A reaper closes that gap: it scans the database for work the queue
does not know about and re-enqueues it.

The rule this establishes, and which everything downstream depends on: the database knows what
needs doing; Redis is only acceleration. The durability point is the commit.

This ticket delivers the second centrepiece test, and the control point that makes it possible.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A reaper runs periodically inside the worker process
- [ ] It re-enqueues Inbound Messages left in the received state past a short threshold
- [ ] It re-enqueues Inbound Messages left in the processing state past the job timeout, covering
      a worker that died mid-flight
- [ ] It reconciles Outbound Messages left queued past the send timeout against the provider, and
      never blind-resends
- [ ] Re-enqueuing is itself idempotent: a reaper pass that overlaps with a live job does not
      cause duplicate work
- [ ] The queue client used by the API is swappable at the composition root, so a test can make
      the enqueue fail after the commit
- [ ] **Centrepiece test:** with the enqueue failing after the commit, the reaper recovers the
      Message and the reply still goes out
- [ ] A test confirms that stopping the worker entirely does not stop ingestion: messages are
      still accepted and are processed once it returns

## How to work it

Red → green → refactor, one criterion at a time, at the seam of ADR-0011. The loop and the gates
are in [00-definition-of-done.md](./00-definition-of-done.md).

### Test order

The swappable queue client comes first, because without it the centrepiece test cannot be
written at all.

1. Make the queue client swappable at the `apps/api` composition root, and prove the seam can
   install one that fails the enqueue after the commit.
2. Centrepiece: with that failing enqueue, the reaper recovers the Message and the reply still
   goes out.
3. The received-past-threshold and processing-past-timeout scans, one test each.
4. Outbound left queued past the send timeout is reconciled against the provider — assert
   explicitly that no blind resend happened.
5. A reaper pass overlapping a live job causes no duplicate work.
6. Stopping the worker does not stop ingestion; messages are processed once it returns.

The reaper's timers are a refactor target once green: the thresholds are configuration, not
literals scattered through the scan.

### Gates

- [ ] `pnpm typecheck` green
- [ ] `pnpm lint` green
- [ ] `pnpm test` green, coverage at or above 90% on lines, branches, functions and statements
- [ ] Every acceptance criterion above checked off, or reported plainly as not done and why

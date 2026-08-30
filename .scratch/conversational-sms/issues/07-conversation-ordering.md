# 07 — Replies never arrive out of order within a Conversation

**What to build:** Someone sends two messages two seconds apart. Webhook delivery order is not
guaranteed, and if both process in parallel they see different states of the Conversation and
their replies can arrive inverted — the failure the person on the other end actually notices.

At most one job in flight per Conversation. Global concurrency is untouched; only the same thread
is serialized. We process in arrival order and do not reorder by provider timestamp: that would
mean holding a Message while waiting for an earlier one that may never come.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A worker acquires a lock keyed by the Conversation before processing
- [ ] A worker that cannot acquire the lock returns the job to the queue with a short delay rather
      than blocking or failing it
- [ ] The lock is released on success, on failure, and when the worker dies — a crashed worker
      does not wedge a Conversation permanently
- [ ] Messages belonging to different Conversations continue to process concurrently
- [ ] **Test:** two Inbound Messages of the same Conversation submitted together are processed one
      at a time, and their replies leave in arrival order
- [ ] **Test:** Messages across many Conversations still process in parallel, so the lock is not a
      global bottleneck

## How to work it

Red → green → refactor, one criterion at a time, at the seam of ADR-0011. The loop and the gates
are in [00-definition-of-done.md](./00-definition-of-done.md).

### Test order

Both tests are written before any lock exists, and both are red for the right reason.

1. Two Inbound Messages of the same Conversation submitted together: replies leave in arrival
   order. Red first — it should fail by interleaving, not by crashing.
2. Messages across many Conversations still process in parallel.
3. Then the lock: acquire keyed by Conversation, requeue with a short delay when it cannot be
   acquired.
4. Release on success, on failure, and on worker death — the last one gets its own test, a crashed
   worker must not wedge a Conversation.

Do not reorder by provider timestamp (ADR-0007). Arrival order is the contract.

### Gates

- [ ] `pnpm typecheck` green
- [ ] `pnpm lint` green
- [ ] `pnpm test` green, coverage at or above 90% on lines, branches, functions and statements
- [ ] Every acceptance criterion above checked off, or reported plainly as not done and why

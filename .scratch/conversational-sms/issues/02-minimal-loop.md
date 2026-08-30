# 02 — The minimal complete loop

**What to build:** A person texts the service and gets an answer back. An inbound SMS arrives
through the fake provider, becomes an Inbound Message on a Conversation, is picked up by the
worker running as its own process, is processed, and the reply leaves as an Outbound Message
through the same provider. Both Messages are readable afterwards over HTTP.

This is the tracer bullet: it cuts through the schema, the domain, the API, the queue, the worker
and the provider. Everything after this ticket deepens a path that already works end to end.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Posting an inbound SMS payload to the webhook returns 200 well inside the 5-second budget
      and does no processing on that request
- [ ] A Conversation is created on first contact, identified by the (Inbound Number, User Number)
      pair, and reused for subsequent messages from the same pair
- [ ] The Inbound Message is persisted before the request returns
- [ ] The job is enqueued only after the database transaction commits
- [ ] The worker runs as a separate process, not as background work inside the API
- [ ] Processing takes a configurable simulated delay, defaulting to the 3–15 second range and
      set low in tests
- [ ] The reply leaves through the provider as an Outbound Message that records which Inbound
      Message it answers
- [ ] Both Messages are retrievable over HTTP for the Conversation, in chronological order
- [ ] The domain package imports neither the web framework nor the provider SDK
- [ ] An end-to-end test drives the webhook and asserts on what reached the fake provider

## How to work it

Red → green → refactor, one criterion at a time, at the seam of ADR-0011. The loop and the gates
are in [00-definition-of-done.md](./00-definition-of-done.md).

### Test order

Start with the test that proves the whole loop and let it drive the rest: post an inbound payload
to the webhook, wait for the reply to reach `FakeSmsProvider`. It fails on the first missing piece
each time, and each failure names the next slice.

1. The webhook returns 200 and the Inbound Message is readable over HTTP — no worker yet.
2. A second message from the same (Inbound Number, User Number) pair lands on the same
   Conversation; a different pair opens a new one.
3. The worker, consumer running in the test process, produces the Outbound Message and it reaches
   the fake provider.
4. The Outbound Message records which Inbound Message it answers, and both come back in
   chronological order.
5. The enqueue happens after commit, and the simulated delay is configurable — set low in tests.

Worker logic goes in modules the seam can import. `apps/worker/src/index.ts` is bootstrap only and
is excluded from coverage; nothing with a branch in it belongs there.

**This ticket also closes the coverage gap left by ticket 01** — `apps/worker/src/env.ts` becomes
reachable once the worker runs in the test process. The bar must be green at the 90% threshold
when this ticket ends.

### Gates

- [ ] `pnpm typecheck` green
- [ ] `pnpm lint` green
- [ ] `pnpm test` green, coverage at or above 90% on lines, branches, functions and statements
- [ ] Every acceptance criterion above checked off, or reported plainly as not done and why

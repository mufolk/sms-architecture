# 08 — When processing fails for good, nobody is left in the dark

**What to build:** Some Messages cannot be processed. From the sender's side, a failure and an
outage are indistinguishable, so silence is the one clearly wrong outcome: they get a Failure
Notice instead. And a system that fails silently for the operator is not a product, so the
Conversation is flagged as needing human attention.

Before giving up, retries are classified: a network blip is worth retrying, a malformed message is
not. Blind retry on a permanent error burns three attempts to reach the same conclusion.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Errors are classified as retryable or permanent before any retry decision
- [ ] Retryable errors retry a bounded number of times with exponential backoff plus jitter
- [ ] Permanent errors skip retries and move the Inbound Message straight to failed
- [ ] Exhausted work lands in a dead-letter queue rather than disappearing
- [ ] A Failure Notice is sent to the User Number, as an ordinary Outbound Message with its own
      status lifecycle
- [ ] The Failure Notice is sent through a separate low-priority path, so a provider outage that
      caused the failure does not take the notice down with it
- [ ] A failed Failure Notice never generates another Failure Notice — the mechanism cannot loop
- [ ] The Conversation is flagged Needs Attention and the admin shows that flag on the list and in
      the thread
- [ ] **Test:** a permanent provider error produces one failed Inbound Message, one Failure Notice
      to the user, a Needs Attention flag, and no retry attempts
- [ ] **Test:** a retryable error that succeeds on the second attempt produces no Failure Notice

## How to work it

Red → green → refactor, one criterion at a time, at the seam of ADR-0011. The loop and the gates
are in [00-definition-of-done.md](./00-definition-of-done.md).

### Test order

Classification first: it is the decision every other behaviour in this ticket hangs off.

1. A permanent provider error → one failed Inbound Message, one Failure Notice, a Needs Attention
   flag, zero retry attempts. Assert the attempt count, not just the outcome.
2. A retryable error succeeding on the second attempt → no Failure Notice.
3. Bounded retries with exponential backoff plus jitter; exhausted work lands in the DLQ.
4. The Failure Notice as an ordinary Outbound Message with its own lifecycle, sent through the
   separate low-priority path.
5. A failed Failure Notice generates no second notice — write this test explicitly, the loop is
   the failure mode.
6. Needs Attention on the list and in the thread.

Retry timing is configuration set low in tests; never a real sleep in the suite.

### Gates

- [ ] `pnpm typecheck` green
- [ ] `pnpm lint` green
- [ ] `pnpm test` green, coverage at or above 90% on lines, branches, functions and statements
- [ ] Every acceptance criterion above checked off, or reported plainly as not done and why

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

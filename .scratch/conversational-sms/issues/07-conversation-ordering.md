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

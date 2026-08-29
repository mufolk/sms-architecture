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

# 04 — Idempotency: duplicate deliveries change nothing

**What to build:** Twilio redelivers webhooks it is unsure about. When it does, the person on the
other end must not receive a second reply. A redelivered Provider Message SID is acknowledged and
otherwise ignored — no new Message, no new job, no second send.

Two layers do this: a unique constraint in the database, which is the guarantee that survives
losing Redis, and a queue-level job identity, which is the cheap shortcut for the common case.

This ticket delivers the first of the two centrepiece tests.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A unique constraint on the provider and Provider Message SID prevents a second Inbound
      Message row for the same SID
- [ ] The webhook inserts in a way that does not error on conflict, and detects that nothing was
      inserted
- [ ] A redelivered SID returns 200, enqueues nothing, and sends nothing — even when the original
      Outbound Message has not been confirmed delivered
- [ ] The queue job identity equals the Provider Message SID, so a duplicate enqueue is dropped
      before any work happens
- [ ] The Outbound Message row is written before the provider is called, carrying an idempotency
      key on that request, so a crash between the call and recording its result cannot produce a
      second send
- [ ] **Centrepiece test:** delivering the same webhook payload twice produces exactly one
      Outbound Message
- [ ] A test covers the redelivery arriving while the first is still processing

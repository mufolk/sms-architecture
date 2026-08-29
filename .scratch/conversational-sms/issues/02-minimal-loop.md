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

# Spec: Conversational SMS system

Status: ready-for-agent

Domain vocabulary: [CONTEXT.md](../../CONTEXT.md). Architecture: [ARCHITECTURE.md](../../ARCHITECTURE.md).
Decisions: [docs/adr/](../../docs/adr/) 0001–0011. Execution order: [docs/plan.md](../../docs/plan.md).

---

## Problem Statement

A person texts a phone number and expects an answer. Answering takes 3–15 seconds of processing,
but Twilio gives the webhook 5 seconds to respond, redelivers webhooks it is unsure about, and
does not guarantee the order in which they arrive. Answer inside the webhook and it times out;
answer naively outside it and messages get processed twice, get lost when a process dies, or come
back in the wrong order.

Separately, nobody can see what the system is doing. When a conversation stalls there is no way to
tell whether the message was received, whether processing failed, or whether the reply left and
never arrived.

## Solution

The webhook stops answering. It validates, persists the Inbound Message, enqueues, and returns —
tens of milliseconds. A separate worker process picks the job up, processes it, and sends the
reply as a new SMS. The Postgres commit is the durability point: after it, the message will be
processed even if every process dies, because a reaper re-enqueues work the queue lost.

Duplicates die at two layers, and a redelivery never resends. Messages of the same Conversation
are serialized so replies cannot arrive inverted. When processing fails for good, the user gets a
Failure Notice instead of silence, and the Conversation is flagged Needs Attention for the
operator.

An admin web interface lists Conversations by recent activity, opens a thread, and shows each
Message with its status updating live — including `delivered`, which only a Delivery Receipt can
confirm. A `/dev` page acts as the reviewer's handset so the whole loop can be exercised without a
Twilio account.

## User Stories

### The person texting

1. As a person texting the service, I want an answer to arrive as a normal SMS, so that I do not
   have to keep an app open waiting.
2. As a person texting the service, I want my message to be answered even if it takes fifteen
   seconds, so that slow processing does not simply drop it.
3. As a person texting the service, I want exactly one reply per message I send, so that I am not
   billed for or confused by duplicates.
4. As a person texting the service, I want my two rapid messages answered in the order I sent
   them, so that the replies make sense together.
5. As a person texting the service, I want my message answered even if the system crashed the
   moment it arrived, so that I do not have to text again.
6. As a person texting the service, I want to be told when the system could not answer me, so that
   I do not sit waiting on a reply that will never come.
7. As a person texting the service, I want to keep texting the same number over days and have it
   be one conversation, so that context is not reset by silence.
8. As a person texting different numbers of the service, I want each to be its own thread, so that
   unrelated conversations do not merge.

### The operator using the admin

9. As an operator, I want a list of Conversations ordered by most recent activity, so that the
    threads that need me are at the top.
10. As an operator, I want each row to show the Inbound Number, the User Number and the time of
    the last Message, so that I can identify a thread without opening it.
11. As an operator, I want to open a Conversation and see every Inbound and Outbound Message in
    order, so that I can read what happened.
12. As an operator, I want each Message to show its status, so that I can tell a Message that was
    accepted by the provider from one that actually reached the handset.
13. As an operator, I want an Outbound Message to show which Inbound Message it answers, so that I
    can follow the exchange when several are in flight.
14. As an operator, I want the open thread to update on its own while a Message is processing, so
    that I do not refresh to find out whether it finished.
15. As an operator, I want Conversations that hit a final failure flagged Needs Attention, so that
    a broken thread does not sit unnoticed.
16. As an operator, I want to scroll back through a long Conversation without the page loading the
    entire history, so that old threads stay usable.
17. As an operator, I want pagination that does not duplicate or skip Messages when new ones
    arrive mid-scroll, so that what I read is what happened.

### The reviewer of this repository

18. As a reviewer, I want the system to come up with a single command, so that I can evaluate it
    without a setup session.
19. As a reviewer, I want to send a message without a Twilio account, so that nothing external
    blocks me from seeing it work.
20. As a reviewer, I want to watch a Message move through its statuses in the admin, so that I can
    see the processing is genuinely asynchronous rather than take it on faith.
21. As a reviewer, I want to replay the same webhook and observe that no second reply is sent, so
    that I can confirm idempotency rather than read about it.
22. As a reviewer, I want to force a delivery failure, so that I can see the Failure Notice and
    the Needs Attention flag in action.
23. As a reviewer, I want the architecture document to answer the brief's eight points in the
    brief's own order, so that I am not hunting for answers.

### The engineer operating it

24. As an engineer, I want every log line for one processing attempt to share a correlation id, so
    that I can reconstruct an incident from the logs.
25. As an engineer, I want a re-enqueue to be distinguishable from the original attempt in the
    logs, so that two runs of the same Message do not blur together.
26. As an engineer, I want a record of every status transition a Message made, so that I can
    answer why a Message sat in `processing`.
27. As an engineer, I want to scale the worker without scaling the API, so that a backlog does not
    force me to over-provision the ingestion path.
28. As an engineer, I want a downed worker to not stop ingestion, so that an outage delays replies
    rather than losing messages.
29. As an engineer, I want a readiness endpoint that actually checks Postgres and Redis, so that
    an orchestrator does not route traffic to an instance that cannot serve it.
30. As an engineer, I want permanent errors to skip retries, so that a malformed message does not
    occupy a worker for thirty seconds to reach the same conclusion.

## Implementation Decisions

### Workspace and processes

A pnpm workspace with four units: `apps/api`, `apps/worker`, `apps/web`, `packages/core`. The
worker is a separate process, not background work inside the API (ADR-0003). `packages/core` holds
entities, the status machines, use cases and the interfaces every adapter implements; it imports
no framework and no provider SDK. Adapters live outside it.

Everything runs under docker-compose, and `docker compose up` must run migrations itself. A second
manual command is a defect.

### Domain interfaces

Declared in `packages/core`, implemented outside:

- `SmsProvider` — `send(to, from, body, idempotencyKey)` and `verifySignature(headers, body)`.
  Two implementations: `TwilioSmsProvider` and `FakeSmsProvider`, selected by environment.
- `MessageProcessor` — `process(inbound, history)` returning a reply draft. The shipped
  implementation is rule-based and deterministic, with a simulated 3–15 s delay.
- `ConversationRepository`, `MessageRepository`, `ConversationLock`.

Use cases: `HandleInboundMessage` (webhook path) and `ProcessInboundMessage` (worker path).

### Schema

Three tables — `conversations`, `messages`, `message_status_events` — via Drizzle, whose
migrations are the migrations (ADR-0008). Full column list and the five indexes are in
ARCHITECTURE.md §6. The load-bearing ones:

- `UNIQUE (inbound_number, user_number)` on `conversations` — Conversation identity (ADR-0001)
- `UNIQUE (provider, provider_message_sid)` on `messages` — the durable idempotency guarantee
- partial `(status, created_at)` where `status IN ('received','processing','queued')` — reaper scan
- `last_message_at` on `conversations`, denormalized, written in the same transaction as the
  Message insert

Statuses are split by `direction`: inbound `received → processing → processed | failed`, outbound
`queued → sent → delivered | undelivered | failed`.

### Ingestion path

`POST /webhooks/sms` verifies `X-Twilio-Signature` (enabled with the real provider, switched off
by config with the fake), resolves the Conversation, inserts the Inbound Message as `received` and
updates `last_message_at` in one transaction, and only **after the commit** enqueues the job with
`jobId` set to the Provider Message SID. Then it returns 200.

The insert is `ON CONFLICT DO NOTHING`. Zero rows affected means this SID was already seen: return
200, do not enqueue, do not resend (ADR-0004).

`POST /webhooks/status` consumes Delivery Receipts and moves the Outbound Message from `sent` to
`delivered` or `undelivered`.

### Processing path

The worker takes a job, acquires a Redis lock keyed by `conversation_id`, and returns the job with
a short delay if it cannot (ADR-0007). It marks the Inbound Message `processing`, runs the
`MessageProcessor`, **inserts the Outbound Message as `queued` before calling the provider** with
our row id as the request's idempotency key (ADR-0010), calls the provider, then records
`queued → sent` and `processing → processed`.

It must not hold a database transaction open across the 3–15 s of processing.

Retries: three attempts, exponential backoff 2 s / 8 s / 32 s plus jitter, job timeout 30 s.
Errors are classified before retrying — retryable (network, 5xx, 429) retry; permanent (400,
invalid number, malformed body) go straight to `failed`.

### Recovery

A reaper inside the worker process scans Postgres every 10 s and handles three cases:

- `received` older than 30 s — re-enqueue (the commit/enqueue gap)
- `processing` older than the job timeout — re-enqueue (worker died mid-flight)
- `queued` older than the send timeout — reconcile against the provider, never blind resend

The `messages` table is the outbox; there is no separate outbox table (ADR-0005).

### Final failure

Retries exhausted: Inbound Message to `failed`, job to the DLQ, a Failure Notice sent to the User
Number, and the Conversation flagged Needs Attention. The Failure Notice goes to its own
low-priority queue and its own failure generates no further Failure Notice (ADR-0006).

### Admin API

- `GET /conversations?cursor=&limit=` — ordered by `last_message_at DESC, id DESC`
- `GET /conversations/:id/messages?cursor=&limit=` — reverse chronological
- `GET /health` (liveness), `GET /ready` (checks Postgres and Redis for real)

Pagination is keyset on the `(created_at, id)` tuple, never offset.

### Frontend

Next.js and Tailwind. Conversation list, thread view with per-Message status, 3-second polling on
the open thread. A `/dev` page acts as the reviewer's handset: send a message as a User Number,
force `undelivered`, replay the same webhook.

### Observability

A `correlation_id` generated at ingestion, stored on the Message, carried into the job and onto
every log line; the Provider Message SID is stored beside it but is not the trace id (ADR-0009).
Structured logs via pino. Env validated by zod at startup.

## Testing Decisions

### What makes a good test here

A good test drives the system the way Twilio and the operator do, and asserts on what they can
see. It never reaches into a repository, a queue internal, or a use case's collaborators. If a
test still passes with the mechanism it is meant to protect deleted, it is not a test.

### One seam

All tests are written at a single seam (ADR-0011): drive through `POST /webhooks/sms`, observe
through `FakeSmsProvider` (what reached the handset) and the admin REST (what the operator sees).
Postgres and Redis are real, via testcontainers; the worker's consumer runs in the test process.

`packages/core` is deliberately not unit-tested in isolation. Testing a use case against fake
repositories proves the fakes work.

### Control points the seam needs

These are composition-root wiring in production code, not test-only branches inside domain logic:

1. A swappable queue client in the `apps/api` composition root, so a test can make the enqueue
   fail after the commit.
2. Failure modes on `FakeSmsProvider` — retryable and permanent.
3. On-demand Delivery Receipt triggering.

### The two centrepiece tests

1. The same webhook delivery, twice, produces exactly one Outbound Message.
2. With the enqueue failing after the commit, the reaper recovers the message and the reply still
   goes out.

They are the architecture in executable form: they prove the two claims a reviewer cannot verify
by reading the code.

### Also covered from the same seam

The 5-second ack budget; per-Conversation ordering under two concurrent inbound messages; retry
classification (permanent error does not retry); the DLQ and the Failure Notice; the Needs
Attention flag; `sent → delivered` on a Delivery Receipt; keyset pagination stability when a
Message arrives mid-pagination.

### Prior art

None — this is a greenfield repository. The seam described above is the prior art for everything
that follows.

## Out of Scope

- **Authentication**, on the admin or anywhere else. The brief waives it.
- **A real LLM as the processor.** The rule-based `MessageProcessor` stands in; the interface is
  the extension point.
- **SSE or WebSocket.** Polling ships; the transport upgrade is named in ARCHITECTURE.md §8.
- **Per-Inbound-Number rate limiting.** Designed for, not built — it is the first thing to add if
  time allows.
- **Table partitioning, pgbouncer, multi-region sending, metric emission.** Named in §8 as
  production work, not built.
- **Playwright or any browser-level test.** The brief states UI polish is not evaluated.
- **MongoDB.** Explicitly rejected in ADR-0002; the raw webhook payload lives in a `jsonb` column.
- **A dedicated outbox table.** The `messages` table plays that role (ADR-0005).
- **Reordering Messages by provider timestamp.** Explicitly rejected in ADR-0007.

## Further Notes

This is a technical assessment with a stated 4–6 hour suggestion, being built to roughly 8. The
cut order if time runs short is in `docs/plan.md`, along with the list of things that must never
be cut — removing any of those empties out what is being evaluated.

The trade-off most worth re-examining is the queue. `pg-boss` would put the enqueue inside the
insert's transaction and delete the dual-write problem, and therefore the reaper, entirely. It was
rejected because Redis also backs the per-Conversation lock, rate limiting and backpressure — not
because the design is worse (ADR-0005). If those needs disappear, the migration is cheap.

Two claims in this spec are asymmetric on purpose and should not be "fixed" by a later reader: a
redelivery never resends, even when the reply might not have gone out (we prefer a late reply to a
duplicate one); and Messages are processed in arrival order without reordering, because total
ordering needs a wait window and a wait window is guaranteed latency bought against a rare case.

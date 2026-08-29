# Diagrams

Diagrams 1–4 live embedded in [ARCHITECTURE.md](../ARCHITECTURE.md), where they answer the
points the brief asks for directly. This file holds the supporting ones: internal mechanisms and
how the design evolves under scale.

The Mermaid here and in `ARCHITECTURE.md` is the source of truth. When the design changes, change
these blocks in the same commit as the code.

---

## 5. Duplicate webhook delivery

Visual proof of ADR-0004: the two deduplication layers, and the rule that redelivery never
resends.

```mermaid
sequenceDiagram
    autonumber
    participant TW as Twilio
    participant API as apps/api
    participant PG as Postgres
    participant RQ as Redis (BullMQ)
    participant WK as apps/worker

    TW->>API: POST /webhooks/sms (SID=SM123)
    API->>PG: INSERT message ON CONFLICT DO NOTHING
    PG-->>API: inserted (1 row)
    API->>RQ: add(job, jobId=SM123)
    API-->>TW: 200 OK
    RQ->>WK: consumes SM123
    WK->>PG: status: processing -> processed
    WK->>TW: sends the reply

    Note over TW,API: Twilio redelivers the same SID

    TW->>API: POST /webhooks/sms (SID=SM123)
    API->>PG: INSERT message ON CONFLICT DO NOTHING
    PG-->>API: 0 rows (SID already present)
    API-->>TW: 200 OK
    Note right of API: does not enqueue, does not resend

    Note over API,RQ: Had the INSERT slipped through,<br/>jobId=SM123 would stop it at the queue
```

---

## 6. Crash between commit and enqueue, and the reaper

Visual proof of ADR-0005. The durability point is the Postgres commit; Redis is acceleration.

```mermaid
sequenceDiagram
    autonumber
    participant TW as Twilio
    participant API as apps/api
    participant PG as Postgres
    participant RQ as Redis
    participant RP as Reaper
    participant WK as apps/worker

    TW->>API: POST /webhooks/sms (SID=SM456)
    API->>PG: INSERT message (status=received)
    PG-->>API: COMMIT
    Note over API: durability point
    API--xRQ: process dies before the enqueue

    Note over PG,RQ: message persisted, no job in the queue

    loop every 10s
        RP->>PG: SELECT ... WHERE status='received'<br/>AND created_at < now() - interval '30s'
        PG-->>RP: SM456
        RP->>RQ: add(job, jobId=SM456)
    end

    RQ->>WK: consumes SM456
    WK->>PG: status: processing -> processed
    WK->>TW: sends the reply

    Note over RP,PG: The same scan covers 'processing' older<br/>than the job timeout, and 'queued'<br/>outbound rows awaiting reconciliation
```

---

## 7. `packages/core` — ports and adapters

The domain imports neither Fastify, nor Drizzle, nor the Twilio SDK. Everything crossing the
boundary is an interface declared here and implemented outside.

```mermaid
classDiagram
    direction LR

    class Conversation {
        +ConversationId id
        +PhoneNumber inboundNumber
        +PhoneNumber userNumber
        +Date lastMessageAt
        +boolean needsAttention
    }

    class Message {
        +MessageId id
        +ConversationId conversationId
        +Direction direction
        +MessageStatus status
        +string body
        +string providerMessageSid
        +string correlationId
        +MessageId inReplyTo
    }

    class MessageProcessor {
        <<interface>>
        +process(inbound, history) ReplyDraft
    }

    class SmsProvider {
        <<interface>>
        +send(to, from, body, idempotencyKey) ProviderSendResult
        +verifySignature(headers, body) boolean
    }

    class ConversationRepository {
        <<interface>>
        +findOrCreate(inbound, user) Conversation
        +touch(id, at) void
        +flagNeedsAttention(id) void
    }

    class MessageRepository {
        <<interface>>
        +insertInboundIfNew(msg) Message
        +transitionStatus(id, from, to, reason) void
        +findStale(status, olderThan) Message[]
    }

    class ConversationLock {
        <<interface>>
        +acquire(conversationId) Lease
    }

    class HandleInboundMessage {
        +execute(webhookPayload) void
    }

    class ProcessInboundMessage {
        +execute(messageId, correlationId) void
    }

    HandleInboundMessage ..> ConversationRepository
    HandleInboundMessage ..> MessageRepository
    ProcessInboundMessage ..> MessageProcessor
    ProcessInboundMessage ..> SmsProvider
    ProcessInboundMessage ..> MessageRepository
    ProcessInboundMessage ..> ConversationLock
    Conversation "1" o-- "*" Message
    Message --> Message : inReplyTo
```

Adapters live outside `core`: `DrizzleMessageRepository`, `TwilioSmsProvider`, `FakeSmsProvider`,
`RedisConversationLock`, `RuleBasedMessageProcessor`. Swapping the processor for an LLM is
swapping one implementation of `MessageProcessor`.

---

## 8. Scale: what multiplies

What changes as volume rises, and why the per-Conversation lock is what lets the worker scale
horizontally without breaking reply order.

```mermaid
flowchart TB
    subgraph edge[Edge]
        LB[Load balancer]
    end

    subgraph api[apps/api - N replicas, stateless]
        A1[api 1]
        A2[api 2]
        A3[api N]
    end

    subgraph data[State]
        PG[(Postgres<br/>primary + read replicas)]
        RD[(Redis<br/>queue + locks)]
    end

    subgraph workers[apps/worker - M replicas]
        W1[worker 1]
        W2[worker 2]
        W3[worker M]
    end

    LB --> A1 & A2 & A3
    A1 & A2 & A3 -->|"write: INSERT + commit"| PG
    A1 & A2 & A3 -->|"enqueue after commit"| RD
    RD -->|"concurrent consumption"| W1 & W2 & W3
    W1 & W2 & W3 -->|"lock per conversation_id"| RD
    W1 & W2 & W3 --> PG

    PG -.->|"admin reads"| A1
```

**Why the lock is not a bottleneck:** it is keyed by `conversation_id`, not global. With 10,000
active conversations and 50 workers, contention only appears when two messages of the *same*
conversation are in flight — exactly the case we want serialized. The cost is one `SET NX` per
job.

**What breaks first:** the Postgres connection pool, because each worker holds a connection
through the 3–15 s of processing. Immediate mitigation: do not hold a transaction open during
processing — open, mark `processing`, close; process; open again to write the result.

**Expected bottlenecks, in order:** Postgres connections (use pgbouncer) → provider throughput
(rate limit per Inbound Number) → the `messages` table (partition by `created_at`).

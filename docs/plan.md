# Execution plan — 8 hours

Execution order lives in the tickets, not here: `.scratch/conversational-sms/issues/`. Each ticket
is a vertical slice that is demoable on its own, and declares what blocks it. This file is the
**time budget** and the **cut order** — what to drop when the clock runs out.

## Budget

| Ticket | Est. | |
|---|---|---|
| 01 Walking skeleton | 0:40 | |
| 02 The minimal complete loop | 1:40 | the tracer bullet — everything after deepens it |
| 03 Admin and the reviewer's handset | 1:00 | first point the system is demoable to a human |
| 04 Idempotency | 0:40 | centrepiece test #1 |
| 05 Durability and reaper | 0:50 | centrepiece test #2 |
| 06 Status lifecycle and Delivery Receipts | 1:00 | largest single ticket |
| 07 Conversation ordering | 0:30 | |
| 08 Failure path | 0:50 | |
| 09 Keyset pagination | 0:30 | |
| 10 Real Twilio provider | 0:30 | |
| 11 Observability | 0:20 | |
| 12 Final documentation | 0:30 | |
| | **8:20** | over budget by 20 min — see cut order |

The frontier starts at 01 alone. After 02 clears, tickets 03, 04, 05, 07 and 10 all open at once.

## Cut order, if running late

Cut from the bottom up. Each line is a whole acceptance criterion, not a half-built ticket:

1. Per-Inbound-Number rate limiting — never scheduled, described in ARCHITECTURE.md §8
2. Ticket 09 (keyset pagination) — the thread renders without it on a short history
3. The extra `/dev` controls in ticket 06 — forcing undelivered, replaying a webhook
4. Ticket 11 (observability) down to structured logging alone
5. The Delivery Receipt half of ticket 06 — painful, but the loop closes without it

## Never cut

Removing any of these empties out what is being evaluated:

- The worker as a separate process (ticket 02)
- Two-layer deduplication (ticket 04)
- The reaper (ticket 05)
- Per-Conversation locking (ticket 07)
- Both centrepiece tests (tickets 04 and 05)
- ARCHITECTURE.md answering the brief's eight points in order (ticket 12)

## Verification before submitting

Run it, do not assume it. This is ticket 12's last acceptance criterion:

- [ ] `docker compose up` on a clean machine, one command, no manual step
- [ ] `/dev` → admin: visible transition received → processing → sent → delivered
- [ ] Replay the same webhook: no new Outbound Message
- [ ] `docker compose stop worker`, send a message, bring it back up: message gets processed
- [ ] Two messages sent together to the same Conversation: replies leave in order
- [ ] Force a permanent failure: Failure Notice arrives, Needs Attention shows in the admin
- [ ] `pnpm typecheck && pnpm test` green
- [ ] Diagrams checked against the code that actually exists

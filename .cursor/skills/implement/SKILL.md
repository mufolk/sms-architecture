---
name: implement
description: "Implement one ticket from .scratch/conversational-sms/issues/, test-first at the agreed seam, then review and commit."
disable-model-invocation: true
---

Implement the ticket the user names. If they name none, work the **frontier**: the
lowest-numbered ticket in `.scratch/conversational-sms/issues/` whose "Blocked by" list is
entirely complete. One ticket per session — do not start the next one.

## Before writing anything

Read, in this order:

1. The ticket file itself. Its acceptance criteria are the definition of done — all of them.
2. `.scratch/conversational-sms/spec.md` — the decisions behind the ticket.
3. `CONTEXT.md` — the domain glossary. Every name you write (types, functions, tests, columns)
   uses these terms. The glossary lists, per term, the synonyms to avoid.
4. `docs/adr/` — the ADRs touching the area. There are eleven and they are short.
5. `ARCHITECTURE.md` — the section relevant to this ticket.

If your implementation would contradict an ADR, **stop and say so** rather than silently
overriding it. The ADR may deserve reopening; that is the user's call, not yours.

## The seam is already agreed

Do not open a seam conversation — it was settled in ADR-0011. **There is one seam: the system
boundary.** Tests drive the system through `POST /webhooks/sms` and observe it through
`FakeSmsProvider` (what reached the handset) and the admin REST (what the operator sees), with
real Postgres and Redis via testcontainers and the worker's consumer running in the test process.

Do not write tests against repositories, the queue's internals, a use case's collaborators, or
`packages/core` in isolation. ADR-0011 lists why each was rejected. A test at an unagreed seam is
a defect, not extra coverage.

## The loop

Follow `/tdd` for what makes a test worth keeping. The rules that bind here:

- **Red before green.** Failing test first, then the minimum code that passes it.
- **Vertical slices.** One acceptance criterion → one test → one implementation → repeat. Never
  write all the tests first.
- **Refactoring is not part of the loop.** It happens at review.

Run typechecking often. Run the single test file you are working on often. Run the full suite once
at the end.

## Finishing

1. Every acceptance criterion in the ticket is checked off, or you state plainly which is not and
   why. A partially done ticket is reported as partially done.
2. Run `/code-review` against the commit you started from.
3. If implementation taught something that belongs in the glossary or an ADR, put it there — not
   patched into `ARCHITECTURE.md`, which is a document about decisions, not a scratch pad.
4. Commit to the current branch. One commit per ticket, its message naming the ticket number.

## Do not

- Start a second ticket.
- Build anything in the spec's **Out of Scope** list. Authentication, a real LLM processor, SSE,
  rate limiting, table partitioning and browser tests are all deliberately excluded.
- "Fix" either of these two behaviours — both are deliberate and documented:
  - A redelivered webhook never triggers a resend, even when the reply may not have gone out.
  - Messages are processed in arrival order and never reordered by provider timestamp.

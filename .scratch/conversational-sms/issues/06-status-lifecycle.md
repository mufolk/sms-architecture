# 06 — The full status lifecycle and Delivery Receipts

**What to build:** An operator needs to tell "the provider accepted this" from "this reached the
handset". Those are different facts, and only an asynchronous Delivery Receipt from the provider
establishes the second one.

This ticket puts the real state machines in place — separate ones for each direction, because
received makes no sense for an outgoing Message and sent makes no sense for an incoming one — adds
an append-only record of every transition, and consumes Delivery Receipts so a sent Outbound
Message can become delivered or undelivered in front of the operator's eyes.

**Blocked by:** 03

**Status:** done

- [x] An Inbound Message moves through received, processing, and then processed or failed
      _(failed: machine defines `processing → failed`; no production path dispatches it yet — ticket 08)_
- [x] An Outbound Message moves through queued, sent, and then delivered, undelivered or failed
- [x] Illegal transitions are rejected rather than silently applied
- [x] Every transition is recorded append-only, with the reason and the attempt that caused it
- [x] A Delivery Receipt endpoint accepts the provider's status callback and moves the Outbound
      Message from sent to delivered or undelivered
- [x] A Delivery Receipt for an unknown Provider Message SID is handled without error
- [x] Delivery Receipts arriving out of order, or repeated, do not move a Message backwards
      _(guaranteed by `SELECT … FOR UPDATE` and `UPDATE … WHERE status = fromStatus` in
      `transitionStatus`; not covered by test — the race is not observable from any seam this
      repository accepts. Repeated and backwards transitions are tested at the ADR-0011 seam.)_
- [x] The fake provider can be told to emit a delivered or an undelivered receipt on demand, and
      `/dev` exposes that
- [x] The admin shows the distinction between sent and delivered, and shows undelivered
      distinctly from failed
- [x] A test drives a send through to delivered and asserts the operator-visible status at each
      step

## How to work it

Red → green → refactor, one criterion at a time, at the seam of ADR-0011. The loop and the gates
are in [00-definition-of-done.md](./00-definition-of-done.md).

### Test order

Two state machines, so two red-green sequences. Illegal transitions before the happy path — the
rejection is the behaviour worth having.

1. An illegal transition is rejected, in each direction's machine.
2. The inbound path received → processing → processed, and its failed branch.
3. The outbound path queued → sent, with the append-only transition record carrying reason and
   attempt.
4. The Delivery Receipt endpoint moves sent → delivered, then → undelivered.
5. A receipt for an unknown SID is handled without error; out-of-order and repeated receipts never
   move a Message backwards.
6. The fake provider's on-demand receipt, `/dev` exposure, and the admin's sent/delivered and
   undelivered/failed distinctions.
7. The end-to-end test asserting the operator-visible status at each step.

Every rejected-transition branch needs its own test; this is the ticket where branch coverage is
earned or lost.

### Gates

- [x] `pnpm typecheck` green
- [x] `pnpm lint` green
- [x] `pnpm test` green, coverage at or above 90% on lines, branches, functions and statements
- [x] Every acceptance criterion above checked off, or reported plainly as not done and why

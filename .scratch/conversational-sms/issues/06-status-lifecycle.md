# 06 — The full status lifecycle and Delivery Receipts

**What to build:** An operator needs to tell "the provider accepted this" from "this reached the
handset". Those are different facts, and only an asynchronous Delivery Receipt from the provider
establishes the second one.

This ticket puts the real state machines in place — separate ones for each direction, because
received makes no sense for an outgoing Message and sent makes no sense for an incoming one — adds
an append-only record of every transition, and consumes Delivery Receipts so a sent Outbound
Message can become delivered or undelivered in front of the operator's eyes.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] An Inbound Message moves through received, processing, and then processed or failed
- [ ] An Outbound Message moves through queued, sent, and then delivered, undelivered or failed
- [ ] Illegal transitions are rejected rather than silently applied
- [ ] Every transition is recorded append-only, with the reason and the attempt that caused it
- [ ] A Delivery Receipt endpoint accepts the provider's status callback and moves the Outbound
      Message from sent to delivered or undelivered
- [ ] A Delivery Receipt for an unknown Provider Message SID is handled without error
- [ ] Delivery Receipts arriving out of order, or repeated, do not move a Message backwards
- [ ] The fake provider can be told to emit a delivered or an undelivered receipt on demand, and
      `/dev` exposes that
- [ ] The admin shows the distinction between sent and delivered, and shows undelivered
      distinctly from failed
- [ ] A test drives a send through to delivered and asserts the operator-visible status at each
      step

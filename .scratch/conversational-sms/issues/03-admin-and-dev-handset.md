# 03 — Admin interface and the reviewer's handset

**What to build:** An operator opens the admin, sees Conversations ordered by most recent
activity, clicks into one and reads the whole exchange with each Message's status. While a
Message is being processed the view updates on its own, without a refresh.

Alongside it, a `/dev` page acts as the reviewer's handset: type a User Number and a message, send
it, and watch it appear in the admin and be answered. After this ticket the system is
demonstrable to a human, not only to a test.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The conversation list shows the Inbound Number, the User Number and the time of the most
      recent Message, ordered by most recent activity
- [ ] Ordering uses a value maintained on the Conversation, not an aggregate computed per request
- [ ] Opening a Conversation shows every Inbound and Outbound Message in order, with direction
      distinguishable at a glance
- [ ] Each Message displays its current status
- [ ] An Outbound Message shows which Inbound Message it answers
- [ ] The open thread refreshes on its own roughly every 3 seconds, so a Message moving out of
      processing appears without user action
- [ ] The `/dev` page sends a message as a chosen User Number to a chosen Inbound Number
- [ ] Sending from `/dev` and watching the admin shows the reply arriving without a refresh

## How to work it

Red → green → refactor, one criterion at a time, at the seam of ADR-0011. The loop and the gates
are in [00-definition-of-done.md](./00-definition-of-done.md).

### Test order

The admin REST is half the observation surface of the seam, so it is tested; the React views and
`/dev` are verified by hand and are outside coverage.

1. The list endpoint returns Conversations ordered by most recent activity, reading the value
   maintained on the Conversation — assert the ordering changes when a new Message arrives.
2. The thread endpoint returns every Message in order with direction, status, and the Inbound
   Message an Outbound answers.
3. Only then the pages: list, thread with its ~3s refresh, and `/dev`.

Refactor step of the last slice: the maintained-activity column is the place duplication tends to
appear — one writer, not one per call site.

### Gates

- [ ] `pnpm typecheck` green
- [ ] `pnpm lint` green
- [ ] `pnpm test` green, coverage at or above 90% on lines, branches, functions and statements
- [ ] Every acceptance criterion above checked off, or reported plainly as not done and why

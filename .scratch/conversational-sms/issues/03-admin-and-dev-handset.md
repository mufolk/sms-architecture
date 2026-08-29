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

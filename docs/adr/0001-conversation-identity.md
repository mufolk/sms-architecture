# A Conversation is identified by the (Inbound Number, User Number) pair

A Conversation is permanently identified by the pair `(inbound_number, user_number)`, with no
session window: days of silence do not open a new Conversation.

## Considered Options

- **The number pair, permanently** (chosen) — supports multiple Inbound Numbers from day one,
  which is the first real requirement that shows up as the system grows.
- **The User Number alone** — would collapse conversations held on different numbers of ours
  into a single thread.
- **A session window (N hours of silence opens a new one)** — rejected: grouping by time is
  product policy, not identity. If we need it, it is a view over the messages, not a different
  key.

## Consequences

A Conversation grows without bound; the admin must paginate messages rather than load the whole
thread.

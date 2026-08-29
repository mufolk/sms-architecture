# The Outbound Message row is written before the provider call

The Outbound Message is inserted as `queued` **before** calling the provider, and our own row id
travels as the idempotency key on that request.

Without it, the send has the same dual-write problem as ingestion, mirrored: if the worker dies
between `POST /Messages` and writing the result, a retry has no record that the call ever
happened and sends a second SMS. With the row written first, the retry finds the `queued` row and
reconciles it instead of creating another — and the provider-side idempotency key stops the
duplicate even if our own check races.

This makes the outbound path obey the same rule as the inbound one: the database records the
intent before the side effect, so a crash leaves recoverable state rather than an unknown one.

## Consequences

`queued` is a real state that can persist across a crash, not a transient one. The reaper's scan
of stale work therefore has to consider `queued` Outbound Messages too, reconciling them against
the provider rather than blindly resending.

# Two-layer idempotency, and redelivery never resends

Duplicate webhook deliveries are dropped at two layers: a unique index on
`(provider, provider_message_sid)` in Postgres, which is the durable guarantee, and the queue
`jobId` set to the Provider Message SID, which is the cheap shortcut that avoids work in the
common case. The database layer exists because the queue layer does not survive losing Redis.

A redelivery of an already-processed SID is answered with 200 and does **not** trigger a new
send, even if the corresponding Outbound Message is not yet `delivered`. The webhook has no
information to tell "the reply never went out" from "the reply went out and Twilio merely
repeated the notification"; treating it as a possible failure sends the user a duplicate SMS.
Resending is the worker's retry responsibility, since it knows the real outcome of the send call.

## Consequences

The cost we accept is asymmetric and deliberate: we prefer a late reply to a duplicate reply.

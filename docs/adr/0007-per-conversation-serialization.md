# Processing is serialized per Conversation

At most one job in flight per Conversation: the worker acquires a Redis lock keyed by
`conversation_id` and, failing to get it, returns the job to the queue with a short delay. Global
concurrency is unchanged; only the same thread is serialized.

Twilio does not guarantee webhook delivery order. Without serialization, two messages from the
same user process in parallel, see different states of the Conversation, and can produce replies
that arrive inverted — the failure the end user actually sees.

## Considered Options

- **Reordering by provider timestamp before processing** — rejected. Reordering means holding a
  message while waiting for an earlier one that may never arrive; total ordering exists only with
  a wait window, and a wait window is guaranteed latency bought to defend against a rare case.

## Consequences

The stance is explicit: we process in arrival order, serialize per Conversation so replies do not
trample each other, and accept that arrival order may differ from send order.

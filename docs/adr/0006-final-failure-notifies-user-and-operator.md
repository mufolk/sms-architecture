# Final processing failure notifies the user and flags the operator

Once retries are exhausted, the Inbound Message moves to `failed`, the job goes to the DLQ, and
two things happen: a Failure Notice is sent to the User Number, and the Conversation is flagged
Needs Attention in the admin.

Silence would be the only clearly wrong option in a conversational system — from the sender's
side, a failure and an outage are indistinguishable. The Failure Notice is an ordinary Outbound
Message: same table, same status lifecycle, answering a failure rather than content. And a
system that fails silently for the operator is not a product.

## Consequences

The Failure Notice must not travel the path that just failed. If the provider caused the
failure, sending the notice fails too; it is enqueued as a low-priority send with its own retry
policy and **never** generates another Failure Notice on failure — otherwise the notification
mechanism becomes a loop.

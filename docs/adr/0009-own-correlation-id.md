# Our own correlation ID, distinct from the Provider Message SID

A `correlation_id` is generated at webhook ingestion, stored on the Message, propagated into the
job, and present on every log line. The Provider Message SID is stored alongside it but does not
play that role.

The SID is a business key: it identifies *the message*. What has to be told apart in the log is
*the attempt* — a reaper re-enqueue is a fresh pass through the system carrying the same SID.
Using the SID as the trace identifier merges both processing runs in exactly the log you would
open to understand the incident.

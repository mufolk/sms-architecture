# 11 — Reconstructing an incident from the logs

**What to build:** When something goes wrong at 3 a.m., the question is "what happened to this
message?" — and the answer has to come out of the logs. Every line touching one processing attempt
carries the same correlation identifier, from the moment the webhook accepted the message through
to the provider call.

The correlation identifier is ours, not the Provider Message SID. The SID identifies the Message;
what has to be told apart is the attempt. A reaper re-enqueue is a fresh pass through the system
carrying the same SID, and using the SID as the trace id merges exactly the two runs you opened
the log to separate.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] A correlation identifier is generated when the webhook accepts a Message and stored on it
- [ ] It travels into the queued job and appears on every log line the worker emits for that
      attempt
- [ ] It is recorded on each status transition
- [ ] A re-enqueue by the reaper is distinguishable in the logs from the original attempt, while
      the Provider Message SID stays the same on both
- [ ] Logs are structured, with a consistent field naming the event
- [ ] No log line contains message bodies or full phone numbers at default verbosity
- [ ] The readiness endpoint reflects real dependency health rather than process liveness
- [ ] Metrics worth alerting on are named in the architecture document even where not emitted:
      queue depth, processing latency, failure rate by error class

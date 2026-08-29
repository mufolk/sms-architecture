# 10 — The real Twilio provider, behind the same interface

**What to build:** The reviewer runs everything against the fake and never needs an account. But
the system must also be able to talk to the real Twilio, and the webhook must reject forged
requests — signature verification is not user authentication, it is the correctness of the
integration. Without it the endpoint accepts a message from anyone.

Both providers implement the same interface and are selected by configuration. Nothing else in the
system knows which one is active.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A real Twilio implementation of the provider interface sends messages and reports the
      Provider Message SID it was assigned
- [ ] The active provider is chosen by configuration, with the fake as the default
- [ ] Inbound webhook requests have their provider signature verified when the real provider is
      active
- [ ] A request with a missing or invalid signature is rejected without touching the database
- [ ] Signature verification is disabled by configuration when the fake provider is active, and
      the fake carries no cryptography
- [ ] Provider errors surface in a shape the retry classification can act on, so a 429 and a 400
      are not treated alike
- [ ] Switching providers requires no change outside configuration and the composition root

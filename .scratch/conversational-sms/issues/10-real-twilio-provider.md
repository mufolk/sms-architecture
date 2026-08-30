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

## How to work it

Red → green → refactor, one criterion at a time, at the seam of ADR-0011. The loop and the gates
are in [00-definition-of-done.md](./00-definition-of-done.md).

### Test order

Signature verification is testable at the seam; the real Twilio HTTP call is not, and is not to be
covered by a mock of the SDK.

1. With the real provider active, a request with a missing signature is rejected and nothing was
   written — assert the database is untouched, not only the status code.
2. An invalid signature is rejected; a valid one is accepted.
3. Verification is off when the fake is active, and the fake carries no cryptography.
4. Provider errors surface classified, so 429 and 400 do not land in the same retry branch — one
   test per class, reusing ticket 08's classification.
5. Provider selection by configuration, fake as the default, nothing outside the composition root
   aware of which is active.

The Twilio adapter's own network call is thin by design: everything with a branch lives in the
mapping to the classified error, and that is covered.

### Gates

- [ ] `pnpm typecheck` green
- [ ] `pnpm lint` green
- [ ] `pnpm test` green, coverage at or above 90% on lines, branches, functions and statements
- [ ] Every acceptance criterion above checked off, or reported plainly as not done and why

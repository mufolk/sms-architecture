# 00 — Definition of done

Not a ticket. This is the loop and the gates every ticket from 02 onwards is worked under. Each
ticket links here instead of repeating it.

## The loop: red → green → refactor

One acceptance criterion at a time, never all the tests first (horizontal slicing produces tests
for imagined behaviour — see `/tdd`).

1. **Red.** Write one test for one criterion at the seam and watch it fail. A test that has never
   failed proves nothing. If it passes on the first run, the test is wrong, not the code.
2. **Green.** The minimum code that makes it pass. No speculative interface, factory or generic
   layer for a case that does not exist yet.
3. **Refactor.** Only with the bar green, and only the code the slice just touched — names,
   duplication, dead branches. Rerun the gates after; a refactor that changes behaviour is a
   defect the slice was supposed to catch.
4. Repeat for the next criterion.

Run the single test file often while working. Run the full gates once before finishing.

## The seam is not negotiable

ADR-0011: drive through `POST /webhooks/sms`, observe through `FakeSmsProvider` and the admin
REST, with real Postgres and Redis. No test against repositories, queue internals, or
`packages/core` in isolation. A test at another seam is a defect, not extra coverage.

## The gates

```
pnpm typecheck && pnpm lint && pnpm test
```

or `pnpm verify`, which runs the three in that order.

- **typecheck** — every workspace package plus `tests/tsconfig.json`.
- **lint** — ESLint over the whole repo. `pnpm lint:fix` for the mechanical part.
- **test** — Vitest with V8 coverage, thresholds at **90% for lines, branches, functions and
  statements** (`vitest.config.ts`). Below any of the four, the command exits non-zero.

No ticket is reported done with a red gate. If a gate cannot be run, say so and say why — never
"should pass".

## What coverage counts, and what it does not

Coverage is measured over `apps/api/src`, `apps/worker/src` and `packages/core/src`.

Excluded, deliberately:

- `apps/web` — the seam observes the operator through the admin REST, and browser tests are in the
  spec's Out of Scope list. Web behaviour is verified by hand through `/dev`.
- Generated schema and Drizzle migration output.
- The process bootstraps — `apps/api/src/server.ts`, `apps/worker/src/index.ts` and the
  `packages/core/src/index.ts` barrel. They only wire and listen; the seam imports the app rather
  than spawning them. **Consequence: no logic may live in those three files.** Anything with a
  branch in it goes in a module the seam can import, and the bootstrap calls it.

Reaching 90% branches through one seam means the failure paths need real tests, not a test that
walks the happy path and an `/* istanbul ignore */` on the rest. Where a branch is genuinely
unreachable from the seam, delete the branch — an unreachable branch is dead code, not a coverage
problem.

## Known gap (as of ticket 01)

The bar sits at **81% lines / 86% branches**: `apps/worker/src/env.ts` has no coverage because the
worker has no seam-reachable behaviour until ticket 02 runs its consumer in the test process.
Ticket 02 closes it. Until then `pnpm test` is expected to fail on the threshold, and no other
ticket may start.

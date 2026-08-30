# 12 — Documentation matches the system that exists

**What to build:** The architecture document, the diagrams and the glossary were written before
the code. Implementation always teaches something, and a document that contradicts the code is
worse than no document — a reviewer who catches one divergence stops trusting all of them.

This ticket reconciles them, and writes the README a reviewer reads first.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11

**Status:** ready-for-agent

- [ ] All eight diagrams are checked against the code that actually exists, and corrected where
      they diverge
- [ ] Every claim in the architecture document is true of the shipped system, or is explicitly
      marked as future work
- [ ] Anything implementation taught that belongs in the glossary or an ADR is recorded there,
      not patched into the architecture document
- [ ] The README states what the system does, how to run it in one command, and how to exercise
      the loop through the reviewer's handset
- [ ] The README points to the architecture document, the glossary and the ADRs
- [ ] Deployment and monitoring notes are present, brief, and specific
- [ ] The verification checklist in the execution plan is run end to end on a clean machine and
      its result recorded

## How to work it

Red → green → refactor, one criterion at a time, at the seam of ADR-0011. The loop and the gates
are in [00-definition-of-done.md](./00-definition-of-done.md).

### Test order

No production code, so the loop is the gates plus a documentation pass.

1. Run `pnpm verify` on a clean checkout and record the real output, coverage numbers included.
2. Run the execution plan's verification checklist end to end on a clean machine and record its
   result.
3. Reconcile the eight diagrams, the architecture document and the glossary against the code that
   exists. Anything implementation taught goes to `CONTEXT.md` or an ADR, not into
   `ARCHITECTURE.md`.
4. Write the README: what the system does, the one command, the handset, the links, and brief
   deployment and monitoring notes.
5. Record the coverage exclusions from `00-definition-of-done.md` in the README, so a reviewer is
   not left to discover them from `vitest.config.ts`.

### Gates

- [ ] `pnpm typecheck` green
- [ ] `pnpm lint` green
- [ ] `pnpm test` green, coverage at or above 90% on lines, branches, functions and statements
- [ ] Every acceptance criterion above checked off, or reported plainly as not done and why

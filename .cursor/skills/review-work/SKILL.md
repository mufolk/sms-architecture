---
name: review-work
description: "Review a diff written by an agent — this repo's ticket work — against the AI-PR review rules in .scratch/conversational-sms/swe-rules.md. Hunts violated invariants on the path where state moves, verifies every finding against the real code, audits the diff's own tests, and ends in approve / request changes. Use after a ticket's implementation, before it is reported done."
disable-model-invocation: true
---

Review the work the user names. If they name nothing, review the **uncommitted diff plus the
commits on this branch since `main`**:

```
git diff main...HEAD && git diff && git status --porcelain
```

This is a review, not a fix. You produce findings and a decision. Do not edit source to make a
finding go away — except the throwaway tests of step 4, which you delete afterwards.

## Read before reviewing

1. `.scratch/conversational-sms/swe-rules.md` — **in full**. It is the review method: tier order
   is capture power, and the master question ("which invariant · enforced where · reversible by
   revert?") is asked of every changed line. Everything below assumes it.
2. The ticket the diff claims to implement, in `.scratch/conversational-sms/issues/`. Its
   acceptance criteria are the definition of done — a criterion with no test is a finding.
3. `.scratch/conversational-sms/issues/00-definition-of-done.md` — the loop and the gates.
4. `CONTEXT.md` — the glossary. A name from the synonyms-to-avoid list is a real finding: the
   domain language is a repo invariant, not taste.
5. `docs/adr/` — the eleven records. A diff that contradicts one is a finding unless the diff
   also says so out loud.

## Repo-specific: three things that look like findings and are not

Do not report these. Reporting them is the failure mode this section exists to stop.

- **A redelivered webhook that triggers no resend** (ADR-0004), even where the reply may never
  have gone out. A late reply beats a duplicate reply. The finding here is the *inverse*: a path
  that does resend on redelivery.
- **Messages processed in arrival order, never reordered by provider timestamp** (ADR-0007).
- **Tests only at the system boundary** (ADR-0011). A missing unit test for a repository, a use
  case's collaborators or `packages/core` is not a gap. A test *at* one of those seams is the
  finding.

## Procedure

### 1. Map before reading the diff

`ARCHITECTURE.md` plus the ADRs give the seams and the invariants. Write down, for this diff:
the invariants it can touch and the single place each is enforced. Without this map, Tier 1 of
the rules degrades into style review.

### 2. Find the critical path

Where does value or persistent state move — a row written, a queue job enqueued, an SMS handed
to the provider? Everything else in the diff is second pass. Severity starts at blast radius and
reversibility: reverting code does not unsend a message or unwrite a row.

### 3. Hunt, top-down through the tiers

Tier 1 first and with most of your attention — invariants and their enforcement point, multi-step
writes with no transaction, check-then-act races, idempotency on anything that moves value,
guards that fail open when config is absent, boundary-vs-domain validation, connascence of value
at a distance, pass-through layers. Then Tier 3 (deleted guards — every removed line owes a "why
did this exist?"), Tier 5 (contract changes, observability on the money path).

Tier 2 (SOLID) is vocabulary for writing the comment, not a source of findings. The
anti-checklist — naming taste, import order, function length, abstraction taste where the
behaviour is correct — gets zero severity. Spending attention there is the documented way this
review fails.

### 4. Verify each candidate before it reaches the user

Try to refute it against the real code first. What survives gets proved: a throwaway failing test
at the agreed seam, or a real command run, and you report the actual output. A finding you could
not prove is reported as unproven, with what you tried. Delete the throwaway test when done.

### 5. Audit the diff's own tests

The signature AI defect is a test that passes with and without the bug. For each test the diff
adds: **revert the line it supposedly covers and confirm it goes red.** A test that stays green
is a finding, and a bigger one than the code smell next to it. Also demand the negative cases —
the 4xx and the conflict, not only the happy path — and distrust a test built on a fixture that
already violates an invariant.

### 6. Run the gates yourself

```
pnpm verify
```

Do not take "should pass" from the diff's author, and do not report the review as done on a gate
you did not run. If it cannot run, say so and say why. A gate made green by lowering a threshold,
silencing a rule or widening an exclude list is a finding of its own — check `vitest.config.ts`,
`eslint.config.mjs` and the coverage excludes against `main`.

## Output

Findings ranked by blast radius, worst first. Each one:

- **the invariant** it violates, named, and **where** that invariant is enforced (or the fact
  that nothing enforces it)
- the concrete failure: inputs and state → wrong output, wrong row, wrong message
- **reversible by reverting the code?** — this is what sets severity, not diff size
- the evidence: the command you ran and its real output, or "unproven, here is what I tried"

Then one line: **approve** or **request changes**. If nothing survived verification, say that
plainly rather than padding the list with nits.

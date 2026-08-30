# Reviewing AI-authored PRs — concept map for the reviewing agent

Audience: an agent reviewing a diff written by another agent. Telegraphic on purpose.

## Premise

AI PRs fail differently from human PRs. Output is idiomatic, well-structured, plausible.
Defect lives in the **domain rule**, not the form. Style-layer canon (SOLID, DRY) mostly
misses it. Order below = capture power. Spend attention top-down.

**Master question, per changed line:**
> which invariant can this violate · where is that invariant enforced · if violated in
> production, is the damage reversible by reverting the code?

If the answer to #3 is "no" (wrong number persisted, message sent, money moved), severity
comes from that — not from diff size.

---

## Tier 1 — catches real AI bugs

### 1.1 Design by Contract / invariants
Pre-condition, post-condition, invariant. Review by asking "which invariant, enforced where",
not "is this cohesive".

Alternatives:
- **DbC** — one named invariant, one enforcement point. Pro: finding converts straight to a
  red test; severity derives from the invariant. Con: needs a system map first.
- **Defensive programming** — check everywhere. Pro: survives a new caller. Con: AI emits
  this heavily — 6 redundant checks and the one that matters missing; no single source of truth.
- **Type-driven / make illegal states unrepresentable** (`Cents`, non-negative newtype, status
  union). Pro: invariant becomes a compile error. Con: expensive retrofit; AI proposes it as
  over-engineering or not at all.

### 1.2 Atomicity / ACID / multi-step writes
Any write touching two sources of truth without a transaction = finding.
Related: **lost update**, read-modify-write without lock, **TOCTOU** (`if (allowed) { do }`
with a race between). AI writes check-then-act by default.

Consistency alternatives:
- single transaction — simple; same datastore only
- derive aggregate on read, no denormalized column — always correct; costs a query
- outbox / saga — works cross-service; high complexity
- async reconciliation — accepts drift; needs alerting or it is just a silent bug

### 1.3 Idempotency / delivery semantics
Value-moving POST with no idempotency key → client retry double-charges.
at-least-once vs at-most-once; exactly-once does not exist without receiver-side dedupe.

### 1.4 Fail-closed vs fail-open
When the gate cannot decide, does it deny or allow?
Canonical AI authz bug: `if (limit != null && amount > limit) reject` → no limit configured,
everything passes. Check every guard for its undefined/null/missing-config path.

### 1.5 Parse, don't validate — boundary vs domain
Where untrusted input becomes typed data.
- validate at boundary: fast, but domain stays unsafely reusable by the next caller
- validate in domain: one home for the rule, but boundary returns 500 where it owed 400
- declarative schema at boundary + type in domain: best, costs boilerplate

### 1.6 Coupling, cohesion, **connascence**
Connascence (Page-Jones), weakest→strongest: name, type, meaning, position, algorithm,
timing, execution, value. Rule: stronger connascence must live closer together.
AI's signature defect = **connascence of value at a distance** — two lines in different files
that must agree on a number, with nothing enforcing agreement.

### 1.7 Deep modules (Ousterhout) — direct counter to naive SRP
Small interface hiding large implementation. AI does the inverse: thin pass-through layers
that look like architecture. A layer that only forwards is cost without benefit.

---

## Tier 2 — SOLID, and what each item is actually worth here

| Principle | Real AI failure | How to charge it |
|---|---|---|
| SRP | 3 classes where 1 function sufficed; or business rule inside the route handler | do not count responsibilities. Ask "does this rule have exactly one owner?" Two copies of a rule = finding. One extra class = nit. |
| OCP | speculative abstraction: interface with 1 impl, factory for 1 case | OCP pays at the 3rd real case. Before that it is debt. |
| LSP | override narrowing a pre-condition / throwing where base did not | valid, rare in app code |
| ISP | almost never the problem | lowest priority |
| DIP | injects an interface for testability, then the test asserts against the mock | the **test** is the finding, not the injection |

Frameworks that outperform SOLID for this job:
- **CUPID** (North): Composable, Unix-like, Predictable, Idiomatic, Domain-based.
  Pro: "Predictable" + "Idiomatic" name exactly the AI sin — code that does non-obvious
  things and does not look like its neighbours. Con: vague, yields no citable finding.
- **GRASP** (Larman): Information Expert answers "who should decide this?" — best tool for
  rule-in-the-wrong-layer. Con: unfamiliar vocabulary.
- **Ousterhout**: depth, tactical vs strategic complexity, "define errors out of existence".
  Pro: only framework that attacks over-layering head-on. Con: contradicts SRP as commonly
  taught — team must agree first.
- **Connascence**: measurable, orderable, objective. Con: jargon; translate it in the comment.

Default: judge with **invariants + connascence + depth**; use SOLID only as shared vocabulary
when writing the comment.

---

## Tier 3 — simplicity and scope

- **YAGNI / KISS / AHA** ("avoid hasty abstractions") — antidote to premature DRY.
- **DRY vs WET / rule of three** — DRY: one rule one place, risks coupling things that merely
  look alike. WET: duplicate until the 3rd case, risks silent divergence.
  **Business rule → always DRY. Code shape → tolerate duplication.**
- **Chesterton's fence** — AI deletes guards it did not understand. Every *removed* line in an
  AI diff earns "why did this exist?".
- **Principle of least surprise / match the neighbours** — a convention departure (status code,
  error shape) is either a product decision or an oversight. Make the author say which.

---

## Tier 4 — tests (where AI most often fools the reviewer)

Signature pattern: a test that passes **with and without the bug**.

- **Mutation testing** — the only objective answer to "does this test prove anything?".
  Pro: kills vacuous tests. Con: slow. Cheap substitute: **revert the fix line, confirm the
  test goes red.** Do this for every test the PR adds.
- **Line coverage** — cheap; measures execution not assertion; AI optimizes for it. Weak signal.
- **Property-based testing** — best fit for numeric/money invariants ("total never negative").
  Con: needs generators; failures are hard to read.
- **Pyramid vs Testing Trophy** — pyramid (mock-heavy units) hides integration bugs, which is
  precisely where AI errs. Trophy (integration-weighted) catches more, runs slower.
  For agent-authored PRs: **weight integration.**
- **Test doubles** — mock vs stub vs fake vs spy. A test mocking the repository proves nothing
  about a rule that lives in SQL.
- Demand **negative cases** (403/409, not only 200), an explicit adversarial scenario, and
  distrust any test built on a fixture that already violates an invariant — it can pass for
  reasons unrelated to the code.

---

## Tier 5 — operations and reversibility

- **Blast radius** — request-level failure ≠ wrong value persisted. Reverting code does not
  unwrite data. Severity starts here.
- **Contract compatibility** — a new field in a response is new public API. Schema changes:
  expand/contract.
- **Least privilege + fail-closed** in authz. **Defense in depth** only counts if each layer
  is real, not theatre.
- **Observability** — AI rarely adds a log/metric on the path where value moves. Flag it when
  the path is money or state-mutating.
- **Ownership (Conway)** — an agent PR with no human owner is debt by construction.

---

## Anti-checklist — do not spend severity here

Naming, import order, `let` vs `const`, function length, "could be a map", missing comments,
and abstraction taste when the behaviour is correct. This is what AI already does well, and
it is exactly what drains the reviewer attention that Tier 1 needs.

---

## Reviewer procedure (short form)

1. Build/read the system map: seams, invariants, where each is enforced.
2. Identify the critical path the diff touches — where value or persistent state moves.
3. For each step on that path, enumerate the invariant that can break, and hunt for the
   missing enforcement, not the ugly code.
4. Adversarially verify each candidate finding: try to refute it against the real code; prove
   survivors with a throwaway failing test and real command output.
5. Audit the PR's own tests by reverting the change and expecting red.
6. Rank by blast radius and reversibility. Decide: approve / request changes.
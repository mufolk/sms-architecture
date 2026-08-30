# Conversational SMS

A conversational SMS system: Twilio webhook in, asynchronous processing, SMS reply out, with an
admin web interface over the history. See [ARCHITECTURE.md](./ARCHITECTURE.md).

`AGENTS.md` is a symlink to this file — both names resolve to the same instructions.

Everything committed to this repository is written in English — code, comments, glossary, ADRs,
tickets, commit messages. The conversation with me happens in Portuguese; the artefacts do not.

## Read before changing code

- `CONTEXT.md` — the domain glossary. Every name you write uses these terms; each entry lists the
  synonyms to avoid.
- `docs/adr/` — eleven short decision records. If your change contradicts one, say so rather than
  silently overriding it.
- `.scratch/conversational-sms/spec.md` — the spec, and its Out of Scope list.
- `.scratch/conversational-sms/issues/00-definition-of-done.md` — the TDD loop and the gates every
  ticket is worked under.

## Non-negotiables

**One test seam** (ADR-0011): the system boundary. Drive through `POST /webhooks/sms`, observe
through `FakeSmsProvider` and the admin REST, with real Postgres and Redis. No tests against
repositories, queue internals, or `packages/core` in isolation.

**Two behaviours that look like bugs and are not.** Do not "fix" either:

- A redelivered webhook never triggers a resend, even when the reply may not have gone out
  (ADR-0004). A late reply beats a duplicate reply.
- Messages are processed in arrival order and never reordered by provider timestamp (ADR-0007).
  Total ordering needs a wait window, and a wait window is guaranteed latency bought against a
  rare case.

**Test-first, and the gates are the definition of done.** Red → green → refactor, one acceptance
criterion per slice. Before a ticket is reported done, `pnpm verify` (typecheck, lint, test) is
green — coverage included, at 90% for lines, branches, functions and statements. Never make a gate
pass by lowering a threshold, silencing a rule or widening an exclude list.

## Work is ticketed

One ticket per session, from `.scratch/conversational-sms/issues/`. Work the frontier: the
lowest-numbered ticket whose "Blocked by" list is complete. Do not start a second one.

## Agent skills

Portable skills live in `.cursor/skills/` and are read by Cursor; `.claude/skills/` symlinks the
repo-specific ones so Claude Code sees the same files. `implement`, `tdd`, `code-review` and
`review-work` are available. `implement` and `review-work` are repo-specific and know the ticket
layout and the agreed seam; `review-work` reviews an agent-authored diff under
`.scratch/conversational-sms/swe-rules.md`.

### Issue tracker

Local markdown under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

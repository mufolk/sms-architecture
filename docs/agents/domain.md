# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root
- **`docs/adr/`** — read ADRs that touch the area you're about to work in

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This repo is single-context:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-conversation-identity.md
│   └── ...
├── packages/core/          ← the domain, free of I/O
└── apps/
```

The pnpm workspace layout is a code-organisation choice, not a context boundary. There is one
bounded context here — Conversational SMS — and `packages/core` is its materialisation.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

In particular: **Conversation**, **Inbound Number**, **User Number**, **Inbound Message**,
**Outbound Message**, **Provider Message SID**, **Delivery Receipt**, **Failure Notice**,
**Needs Attention**. The glossary lists the synonyms to avoid for each.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (per-Conversation serialization) — but worth reopening because…_

# 09 — Long histories stay usable

**What to build:** A Conversation is identified by a number pair permanently, so it grows without
bound. The operator must be able to scroll back through a long thread without the page loading the
whole history, and the list of Conversations must page too.

Paging is by cursor on a stable tuple, not by offset. In a list ordered by recent activity, offset
returns duplicated or missing rows when a Message arrives mid-scroll — and a Message arriving
mid-scroll is the normal case here, not the exception.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] The conversation list and the thread both accept a cursor and a limit
- [ ] Paging is keyset on a tuple that is unique and stably ordered, never an offset
- [ ] Indexes exist that let both queries page without scanning
- [ ] The admin loads more as the operator scrolls, in both views
- [ ] A default limit applies when none is given, and an excessive limit is clamped
- [ ] **Test:** inserting a Message between two page fetches causes no Message to be returned twice
      or skipped
- [ ] **Test:** paging through a Conversation with several pages of history returns every Message
      exactly once

## How to work it

Red → green → refactor, one criterion at a time, at the seam of ADR-0011. The loop and the gates
are in [00-definition-of-done.md](./00-definition-of-done.md).

### Test order

The two tests in the criteria are the drivers; the indexes follow from them.

1. Paging through a Conversation with several pages returns every Message exactly once.
2. Inserting a Message between two page fetches returns nothing twice and skips nothing — this is
   the test that kills offset paging, so write it before choosing the cursor tuple.
3. Default limit applied, excessive limit clamped: one test each, both branches.
4. Indexes that let both queries page without scanning, then infinite scroll in the admin.

Refactor step: the cursor encoding belongs in one place shared by both endpoints, not duplicated
per query.

### Gates

- [ ] `pnpm typecheck` green
- [ ] `pnpm lint` green
- [ ] `pnpm test` green, coverage at or above 90% on lines, branches, functions and statements
- [ ] Every acceptance criterion above checked off, or reported plainly as not done and why

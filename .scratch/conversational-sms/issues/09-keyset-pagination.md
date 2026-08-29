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

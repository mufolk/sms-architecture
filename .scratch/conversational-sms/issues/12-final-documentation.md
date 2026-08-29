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

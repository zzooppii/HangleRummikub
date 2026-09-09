# DRAW_RELAY architecture
P19A confirmed architecture; implementation follows P19B→P19C→P19D→P20.

Pure concrete domain owns deterministic books/routes/barrier/defaults/forfeits/reveal and validator. Application supplies shuffled seats/prompts, IDs and server timestamps. No generic GameModule, state blob, barrier framework or canvas engine.
Existing Room identity/session/primary/capability, mutation lane, UoW/CAS and idempotency reused. Exact DrawRelayRoomRecord added only P19C. V2-only. Capacity is game-specific 3–8; other games unchanged.
One stage scheduler; REVEAL has no scheduler but is not terminal. This requires concrete lifecycle inspection of running-without-deadline, without inventing a fake turn owner. StageToken stays stable across simultaneous submissions/draft saves, stale callback compares game and stage. Server checks auth+primary+game+stage+deadline; revisions serialize commits but unrelated participant saves must not starve simultaneous drawing.
Persist all server secrets, drafts, Book pages, streaks, reveal cursor and versions; concrete adapter validates route/page coherence on load. In-memory process-loss limitation remains.
Private draft saves may use whole-document replacement with explicit draft revision and bounded payload, one in-flight save with latest pending document. Owner-targeted refresh preferred; public submitted count updates only on submission. Refresh restores acknowledged draft. Submitted pages immutable.
No dependency. Native Pointer Events/canvas/Web Audio. Board identity notebook/markers/sticky notes, not CITY/GEM visual reuse. Existing Room Host policy must be inspected before Reveal integration; no concealed policy change.

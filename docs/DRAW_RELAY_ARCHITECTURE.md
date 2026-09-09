# DRAW_RELAY architecture
P19A confirmed architecture; implementation follows P19B→P19C→P19D→P20.

Pure concrete domain owns deterministic books/routes/barrier/defaults/forfeits/reveal and validator. Application supplies shuffled seats/prompts, IDs and server timestamps. No generic GameModule, state blob, barrier framework or canvas engine.
Existing Room identity/session/primary/capability, mutation lane, UoW/CAS and idempotency reused. Exact DrawRelayRoomRecord added only P19C. V2-only. Capacity is game-specific 3–8; other games unchanged.

## Confirmed Reveal / Finished Host succession

Status: **USER-APPROVED / P19A COMPLETE / DOMAIN READY**. The user resolved the application authorization policy below. Relay gameplay decisions are unchanged.

The request says to apply the existing Host-transfer policy when Host is offline in Reveal. Source inspection shows no such active-game disconnect policy:

- `application/room-presence-policy-service.ts::electLobbyHostIfNeeded` requires `room.phase === "LOBBY"` and a null Host. Active-game resume only cancels retention and resets streak.
- `docs/ARCHITECTURE.md §6.3` preserves Host identity during disconnect/resume; automatic 60-second grace removal/succession is Lobby-only.
- `application/room-leave-service.ts` NUMBER-specific successor selection applies to explicit leave, not socket disconnect. It cannot silently be generalized to DRAW_RELAY.

Approved: only in DRAW_RELAY REVEAL/FINISHED, after Host remains continuously OFFLINE for 60 seconds, transfer Host to the earliest-original-joinOrder CONNECTED, non-departed, non-forfeited participant. Preserve the former Host's identity, session, Book, pages, result and resume eligibility; transfer is not forfeit/leave. Resume before grace cancels succession. Resume after a committed transfer never reclaims Host. With no eligible successor, preserve Host/cursor/state and re-evaluate on participant resume. DRAW/GUESS/FINAL_GUESS never transfer under this policy; Lobby keeps existing rules. Use the current offline interval, including an interval that began before Reveal, rather than silently restarting the approved 60-second clock on phase entry. Apply under the room lane/UoW with presence lease and exact Host/room revision checks; stale callbacks no-op. Only roomRevision changes. New Host can continue the same cursor or rematch but sees no extra future pages.

P19B pure domain and twelve initial tests are preserved from the blocked audit. The approval unblocks the ordered quality gates; P19C registration follows only after the P19B checkpoint.

Checks after domain work: typecheck PASS, tests 1629 (shared110/Web409/server1110; zero failures/skips), build PASS with the existing large-chunk warning. P19C–P20 are not started. Original600 prompt dataset is not yet authored; its contract alone is documented. No Railway deployment.
One stage scheduler; REVEAL has no scheduler but is not terminal. This requires concrete lifecycle inspection of running-without-deadline, without inventing a fake turn owner. StageToken stays stable across simultaneous submissions/draft saves, stale callback compares game and stage. Server checks auth+primary+game+stage+deadline; revisions serialize commits but unrelated participant saves must not starve simultaneous drawing.
Persist all server secrets, drafts, Book pages, streaks, reveal cursor and versions; concrete adapter validates route/page coherence on load. In-memory process-loss limitation remains.
Private draft saves may use whole-document replacement with explicit draft revision and bounded payload, one in-flight save with latest pending document. Owner-targeted refresh preferred; public submitted count updates only on submission. Refresh restores acknowledged draft. Submitted pages immutable.
No dependency. Native Pointer Events/canvas/Web Audio. Board identity notebook/markers/sticky notes, not CITY/GEM visual reuse. Existing Room Host policy must be inspected before Reveal integration; no concealed policy change.

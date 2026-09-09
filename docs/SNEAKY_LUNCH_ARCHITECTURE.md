# SNEAKY_LUNCH architecture

P21A COMPLETE / DOMAIN READY. Starting clean HEAD `057fce8`.

Concrete pure domain owns settings, participants, progress/status, teacher state and hidden plan, countdown, eat/forfeit/result and state validation. Application supplies server time, IDs and bounded random samples. No React, transport, scheduler, persistence or ambient random/time inside transitions.

P21C adds exactly one identity-only GameType/Registry entry, concrete SneakyLunchRoomRecord, game-specific 2–8 admission and concrete storage/projector/lifecycle/start/scheduled branches. No generic module, state blob, realtime engine, or command framework. Other five games and dependencies remain unchanged.

Existing Room mutation lane + UoW/CAS commits serialize taps, teacher callbacks and presence races. Eat uses gameId + teacherStateRevision; gameRevision still increments for actual mutations but unrelated player taps must not invalidate each other. RequestId replay fingerprints preserve outcomes without replaying effects. Invalid/rate-limited taps do not change gameplay revision.

One active teacher timer per game: exact gameId + transition identity + hidden deadline. Independent presence grace bookkeeping is not a second teacher timer. Stale/recovered callbacks compare identity and deadline; overdue work advances once, anchored to server execution time without a catch-up storm. Current hidden plan persists, no resume reroll. Concrete adapter validates/clones state and exposes only lifecycle deadline internally. Existing in-memory recovery is not durable process-restart storage.

Presence grace uses the existing connection lease/room-lane convention. Record continuous offline intervals; resume/callback races are guarded at commit. FINISHED Host transfer changes roomRevision, not result/gameplay. Explicit leave roster bookkeeping is separate from frozen game/result roster. Rematch cancels old teacher work; old game callbacks cannot affect the new game.

Initial delivery uses canonical full snapshots. Only measured stress evidence can justify game-specific bounded progress coalescing; actor ACK, teacher transitions, catch and finish remain prompt. P22 must measure eight-client load for ≥15 seconds, scheduler behavior, event count, responsiveness and obvious memory growth.

Web owns only classroom presentation, food animation, input, accessible transient feedback and original synthesized sound. No future teacher schedule in DTO, DOM, audio, animation duration or debug UI. Difficulty-based visual speed may use published ranges, never the selected hidden duration. Home/capability registration waits until P21C is complete.

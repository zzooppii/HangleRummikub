# SNEAKY_LUNCH architecture

P21A COMPLETE / DOMAIN READY. Starting clean HEAD `057fce8`.

P21B: concrete `games/sneaky-lunch/domain/game.ts` implements detached validation and deterministic transitions. 21 additive domain tests cover 2–8 players, all box counts, timing bounds, fake cap, safe/danger/stale/rate semantics, terminal order and recovered plans. No GameType, Room, protocol or Web registration in P21B. Already-caught/forfeited progress remains frozen when presence changes; explicit departure is separate Room metadata.

Concrete pure domain owns settings, participants, progress/status, teacher state and hidden plan, countdown, eat/forfeit/result and state validation. Application supplies server time, IDs and bounded random samples. No React, transport, scheduler, persistence or ambient random/time inside transitions.

P21C adds exactly one identity-only GameType/Registry entry, concrete SneakyLunchRoomRecord, game-specific 2–8 admission and concrete storage/projector/lifecycle/start/scheduled branches. No generic module, state blob, realtime engine, or command framework. Other five games and dependencies remain unchanged.

Existing Room mutation lane + UoW/CAS commits serialize taps, teacher callbacks and presence races. Eat uses gameId + teacherStateRevision; gameRevision still increments for actual mutations but unrelated player taps must not invalidate each other. RequestId replay fingerprints preserve outcomes without replaying effects. Invalid/rate-limited taps do not change gameplay revision.

One active teacher timer per game: exact gameId + transition identity + hidden deadline. Independent presence grace bookkeeping is not a second teacher timer. Stale/recovered callbacks compare identity and deadline; overdue work advances once, anchored to server execution time without a catch-up storm. Current hidden plan persists, no resume reroll. Concrete adapter validates/clones state and exposes only lifecycle deadline internally. Existing in-memory recovery is not durable process-restart storage.

Presence grace uses the existing connection lease/room-lane convention. Record continuous offline intervals; resume/callback races are guarded at commit. FINISHED Host transfer changes roomRevision, not result/gameplay. Explicit leave roster bookkeeping is separate from frozen game/result roster. Rematch cancels old teacher work; old game callbacks cannot affect the new game.

Initial delivery uses canonical full snapshots. Only measured stress evidence can justify game-specific bounded progress coalescing; actor ACK, teacher transitions, catch and finish remain prompt. P22 must measure eight-client load for ≥15 seconds, scheduler behavior, event count, responsiveness and obvious memory growth.

Web owns only classroom presentation, food animation, input, accessible transient feedback and original synthesized sound. No future teacher schedule in DTO, DOM, audio, animation duration or debug UI. Difficulty-based visual speed may use published ranges, never the selected hidden duration. Home/capability registration waits until P21C is complete.

P21C implementation: concrete service/adapter/projector/presence/lifecycle under `games/sneaky-lunch`, exact shared settings/commands/projection branches, explicit existing-router registrations. Presence uses independent process-local offline intervals and the Room presence lease; caught participants can control Finished rematch, because catching is not departure. No eligible connected successor means no transfer. New Host does not gain any hidden teacher information.

P21C COMPLETE: root typecheck/build/diff-check PASS; 1,691 tests (shared 113 / Web 419 / server 1,159), no failure/skip. Eleven raw server cases plus three shared contract cases cover all game boundaries, primary binding, idempotency/rate/stale semantics, presence races, explicit leave/rematch, hidden projection and sustained eight-client traffic. Existing five-game tests remain. Home/capability still five at this checkpoint. No new dependency or Railway deployment.

Initial real-time stress (8 raw clients, 15,049ms tapping after countdown): 528 requests, 523 accepted bites, 9 teacher transitions, 4,256 snapshot events / 10,968,416 bytes across all viewers, max ACK 53ms, event-loop p99 40ms, sampled heap delta −16MiB (GC-dependent, not a leak proof). One scheduled teacher timer throughout. No evidence requiring a new delivery optimization. Exact observations vary with random plan/system load. Browser rendering verification follows in P21D/P22.

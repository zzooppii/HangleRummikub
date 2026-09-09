# SNEAKY_LUNCH — P22 local release gate

Verdict: **SNEAKY_LUNCH READY FOR USER PLAYTEST**. SOURCE / LOCAL only; **RAILWAY_NOT_DEPLOYED**.
Date: 2026-09-10. Starting clean master `057fce8`, baseline 1,656 (shared 110 / Web 419 / server 1,127).

## Checkpoints and approved contract

| Phase | Result | Checkpoint |
|---|---|---|
| P21A | Rules / architecture / privacy / original-product gate | `ca92599` |
| P21B | Concrete pure domain, 21 additive tests | `241ffe3` |
| P21C | Server/shared, 11 raw integration + 3 contract tests | `fdff7f6` |
| P21D | Classroom Web, 11 additive tests, two-browser smoke | `a4c3d90` |
| P22 | 60 complete-game combinations + 5 acceptance/race/recovery tests; full gates | this document's commit |

Each prior checkpoint was normally pushed to master after its quality gate. No force, rebase, tag move, dependency change or deployment. Historical `three-game-platform-v1` still targets `db0e6c6`.

Rules: [canonical rules](./SNEAKY_LUNCH_GAME_RULES.md), [architecture](./SNEAKY_LUNCH_ARCHITECTURE.md), [privacy / protocol](./SNEAKY_LUNCH_PRIVACY_PROTOCOL.md), [IP / product](./SNEAKY_LUNCH_IP_PRODUCT_GATE.md).

- 2–8 participants; 1–5 lunchboxes (default 3), 30 accepted bites each; default NORMAL.
- Three-second countdown; BOARD / SUSPICIOUS safe, WATCHING / RETURNING dangerous. No hold action.
- Seen teacher revision is the fairness fence. A delayed old frame gives no bite and no catch. Current danger catches before the 150ms safe rate limit.
- First complete player wins uniquely. Last survivor must finish eating. All caught/forfeited means TEACHER_WIN, no player winner or scoring.
- Progress is public, but the UI uses diminishing food / box graphics instead of numeric bite counters, as explicitly requested. Accessible progress values remain available.
- Future timing, fake/real outcome, RNG, scheduler identity and storage/session metadata remain server-only, including after finish.

## Complete-game and race evidence

`apps/server/src/sneaky-lunch.integration.test.ts` runs **all 60 combinations**: 2/3/4/6/8 players × EASY/NORMAL/HARD/NIGHTMARE × 1/3/5 lunchboxes. Time is injected/accelerated, but creation, configuration, start, every bite, snapshot and result use actual Socket.IO/application/UoW paths. Every accepted bite is asserted, completion is bounded, result count/settings/unique winner are exact, progress cannot overflow, and the teacher scheduler is zero after finish. Finished state round-trips through the concrete adapter.

Additional domain/raw tests cover:

| Area | Verified |
|---|---|
| Input races | Safe accepted before transition; old teacher frame after transition no bite/no catch; current WATCHING/RETURNING catch; same final-bite race produces exactly one winner |
| Idempotency | Exact replay no second bite/catch; conflicting request rejects; previously rate-limited request cannot become a bite on later retry |
| Multiple catches | 2/4/8 in one watching window; nonterminal catches retain teacher deadline; all eliminated finish |
| Recovery | All four teacher phases preserve hidden plan / identity / deadline; overdue callback advances once, anchored to current server time; stale callback no-op |
| Presence | 29s resume preserves progress/identity; 30s offline forfeit; caught spectator retained; no automatic survivor win |
| Host | Playing continues without Host; explicit leave transfers; Finished 60s offline transfer; no connected successor preserves state; old Host return does not reclaim; resume-generation races abort stale forfeit/transfer commits |
| Rematch | Same room/roster/session identities, explicit departures excluded; options can change; all gameplay reset; old game taps/timers cannot affect fresh game |
| Admission / isolation | One player start rejects, ninth Lobby join rejects; malformed settings/current-primary/wrong-phase/wrong-game requests fail closed; existing five games keep their capacities/contracts |

The first matrix driver incorrectly counted a rate-limited ACK at a short phase boundary as an accepted bite. Corrected the driver to retain the player's 150ms interval across phases and assert canonical progress after every accepted tap. Production rate limiting was not weakened or changed.

## Timing / fake audit

10,000 deterministic sample sweep per mode, plus a seeded 10,000-window fake-chain simulation. These are reproducible model observations, not proof of human difficulty or competitive balance.

| Mode | Mean BOARD ms | Mean SUSPICIOUS ms | Eligible fake probability | Observed capped-chain fake % |
|---|---:|---:|---:|---:|
| EASY | 5,999.85 | 999.99 | 18% | 18.35% |
| NORMAL | 4,249.88 | 724.99 | 30% | 30.15% |
| HARD | 2,899.89 | 500.00 | 43% | 42.83% |
| NIGHTMARE | 2,583.39 | 499.98 | 58% | 47.86% |

Nightmare mixes short/medium/long BOARD bands; its maximum fake streak is exactly two. Thus its observed fake share is lower than the eligible 58% proposal probability. Same current SUSPICIOUS animation/sound for fake and real; relief appears only after actual return to BOARD.

## Local production browser / visual acceptance

Production server at local port 3013. Two independent browser origins (`localhost` / `127.0.0.1`) joined room RQRDAY, with six additional raw test peers for an eight-person classroom. No production room was modified.

Observed: Host-only settings synchronized to other viewer; countdown; BOARD, SUSPICIOUS, WATCHING, RETURNING; accepted food/progress changes on both viewers; caught target overlay and disabled spectator action; public caught desks; one remaining player continued to full completion; unique winner; Finished refresh without past effects; same-room Lobby; settings changed from one/EASY to five/NIGHTMARE; all old caught states reset; six raw peers tapped live, then were caught in one teacher window; both browser participants also caught, yielding TEACHER_WIN.

Original vector classroom puts the teacher centrally, two NPC pupils in front and actual participants behind. Eight distinct seat identities, lunchbox food loss, chopsticks/chewing, large fixed eat dock, 2-second queued impact text, synthesized cues, sound preference, and five-step visual guide. No foreign image/audio asset or icon dependency. Result and help are visual, not score dashboards.

Inspected desktop 1280, tablet 768, mobile 390 and 320 layouts. Measured document width never exceeded viewport width (desktop scrollbar may reduce content width). Teacher remains prominent/sticky and the touch eat dock stays accessible with safe-area padding. Mobile inspections included caught/spectator and result views; normal progress and all controls remain readable. Corrected tray/text spacing, made header controls at least 44px, and replaced the returning teacher's blended duplicate faces with a side-turn silhouette. Reduced-motion disables animation without removing warnings or text. Sound OFF preserves all visual feedback. Both browser warning/error console audits were empty.

No claim of physical phone speaker quality, actual finger ergonomics or instrumented FPS. Moderate browser network throttling was not available through the exposed browser tools; raw stale-frame/transition tests verify delayed-input fairness instead.

## Performance observations

P22 full-gate sample: **8 raw clients**, 15,108ms tapping, **608 requests / 608 accepted bites**, 7 teacher transitions, 4,927 snapshot events / 12,698,817 payload bytes across all viewers, **max ACK 40ms**, **event-loop p99 32ms**, sampled heap delta −11MiB. Another run: 608 requests / 600 accepted, max ACK 43ms, p99 40ms. Random plans / machine load change counts. Heap deltas depend on GC, not a memory-leak proof.

Exactly one active teacher scheduler during play; zero at finish. Six automated peers plus two actual browser viewers rendered live progress without visible freezes or console warnings. Teacher SVG and student art are memoized; no new framework or generic realtime engine.

Full snapshots are intentionally retained: approximately 0.84MB/s aggregate payload across the eight viewers in that sample (~106KB/s per viewer, excluding transport overhead). This is acceptable for the local friend-group gate, not a many-room capacity guarantee. Higher production concurrency or low-end phone load should be measured before considering bounded SNEAKY-specific progress coalescing; actor ACK and teacher/catch/finish delivery must stay prompt.

## Quality / preservation

Final expected and verified count: **1,767 tests** = shared **113** + Web **430** + server **1,224**; **111 additive tests** over 1,656. No deleted/skipped tests or weakened assertions. Root typecheck, full tests (two final passes), production build, production-serving regressions and `git diff --check` PASS.

Existing HANGUL / NUMBER / GEM / CITY / DRAW domain/gameplay rules and presentation remain unchanged. Concrete platform routing/Room unions/snapshot/capability additions only. Two old test narrowing expressions were made explicitly game-scoped so sixth-game unions do not broaden their legacy fixtures. Home now has exactly six games. README lists source availability separately from public deployment.

Bundle: initial JS 630.55KB / gzip178.57KB → final JS660.27KB / gzip187.29KB (**+29.72KB raw, +8.72KB gzip**). CSS124.40KB →140.71KB. The pre-existing >500KB Vite warning remains disclosed; no new dependency, package/lockfile or large bitmap added.

Limitations: existing in-memory storage does not provide durable process-restart recovery; browser refresh/resume and concrete stored-state recovery were verified. Production deployment, remote latency/device/audio comfort and wider-concurrency capacity await user playtest. No background music, seventh game, generic module/effect engine, new persistence system or Railway operation started.

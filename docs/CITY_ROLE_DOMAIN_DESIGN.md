# CITY_ROLE — P15A pure domain

## 1. Scope and authority

Implementation baseline: `12521c5` (`docs: finalize city role game design`), existing 1,225 tests: shared91 / Web283 / server851. Historical release `three-game-platform-v1 → db0e6c6` is unchanged.

Authority for this implementation is [approved CITY rules](./CITY_ROLE_GAME_RULES.md), [P14B final audit](./CITY_ROLE_P14B_CONSISTENCY_AUDIT.md), [70 confirmed decisions](./CITY_ROLE_DECISION_GATE.md), and [approved original dataset](./CITY_ROLE_CARDSET_V1.md). CITY-001C/004B/018B/019B/070B, all other A choices, E01–03 and CLASSIC_REFERENCE_VERIFIED are preserved. The [Classic comparison](./CITY_ROLE_CLASSIC_COMPARISON.md) is reference history, not permission to replace CITY semantics. The [IP/product gate](./CITY_ROLE_IP_PRODUCT_GATE.md) still requires separate release review.

Only `apps/server/src/games/city-role/domain/`, additive server domain tests and this design document are in scope. No existing game, GameType/Registry, Room union, shared schema, event, scheduler, persistence integration, capability, Web or deployment is changed. This module has no production consumer; CITY remains unreachable from the running platform.

## 2. Concrete domain tree

| File | Responsibility |
| --- | --- |
| `identity.ts` | Domain-local branded player/game/action/physical building IDs; validates supplied opaque strings, generates nothing |
| `cardset-v1.ts` | Frozen approved30-template catalog; bind exactly60 supplied opaque physical IDs; exact inventory validation and canonical template lookup |
| `role.ts` | CR-01–08 own names/order, version constants and45/90-second duration constants |
| `game-state.ts` | Readonly concrete players, role partition, windows, pending choice, marks, completion latch, result and detached frozen cloning |
| `rule-engine.ts` | Concrete setup/action/timeout/forfeit/resume transitions and CITY-local orchestration |
| `result-engine.ts` | CITY scoring, competition ranking and the three approved finish reasons |
| `state-validator.ts` | Strict unknown-input shape validation plus full canonical identity/phase/card/role/result coherence |

There is no GameModule, generic engine/ability DSL, shared Result, generic TurnDraft or lifecycle registry. Internal candidate mutation uses only a detached CITY value; no live repository state is mutated.

## 3. Versions, identities and state

Versions are pinned to `city-rules-v1`, `city-cardset-v1`, `city-roles-v1`. All games start with a supplied game ID, unique player IDs and one pre-shuffled immutable seat order. The first seat becomes leader. Setup takes an explicit four-card hand for each of2–6 players and the remaining deck; all60 supplied instances must occur exactly once. Each player starts with gold2. One player's gold/hand/city persists across both roles in2/3-player rounds.

`CityBuildingCard` is only `{cardId, templateId}`. Printed cost, VP, category and name are read from the approved immutable catalog; commands cannot supply or override them. `CCS-*` document slots and template names do not generate physical IDs or deck order. The future application must supply unpredictable opaque identities and uniform shuffled orders; validating a nonempty ID alone cannot prove randomness or global uniqueness.

State contains the full server-side truth, not a client projection: deck/discard, all hands/cities, role ownership/removals, private marks and private pending cards. It contains no Room, session, socket, transport presence, platform revision, request ledger, Clock/deadline or scheduler handle.

`window` is `ROLE_SELECTION`, `ROLE_ACTION`, or null with a finished result. The action ID is supplied by the future application; each new waiting window requires a different supplied ID. Current game/action/player context is checked for client-style domain actions and timeout consequences. No separate round ID, pending ID, phase revision or domain gameRevision is invented. Global non-reuse of issued action IDs and expected gameRevision/CAS checks remain application responsibilities.

## 4. Draft and round progression

Round setup stores its eligible roster, draft leader, fixed roles/player and complete pick queue. Removal arithmetic is exact:

| Players | Roles each | Picks | Hidden removed | Public removed | Final hidden unselected |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 2 | 4 | 1 | 2 | 1 |
| 3 | 2 | 6 | 1 | 0 | 1 |
| 4 | 1 | 4 | 1 | 2 | 1 |
| 5 | 1 | 5 | 1 | 1 | 1 |
| 6 | 1 | 6 | 1 | 0 | 1 |

A supplied eight-role permutation partitions hidden first1, public nextN, then available. This is a deterministic representation of approved uniform removal, not a new player-visible procedure. CR-04 has no removal exception; no additional pick/discard is inserted. Queue order is leader-first seat order repeated when quota2. Leave skips remaining picks without redistributing selected roles or changing the current quota.

Role resolution walks CR-01→08 independently of seat/player order. Assignment identity remains in one partition through SELECTED/ACTIVE/RESOLVED/DISABLED/TOMBSTONED states. Forfeit tombstones all that owner's assignments but retains any already-public `revealed` fact. Unrevealed tombstones are never newly disclosed.

`revealedRoles` preserves only authorized normal-entry and normal-round-end disabled disclosures across atomic next-round setup. It is not a hidden-role history log. Immediate survivor/zero-eligible endings do not add round-end disclosures. Setup, skipping and round-end are bounded internal operations, not extra user-facing phases or timers.

## 5. Transition API and determinism

| API | Meaning |
| --- | --- |
| `createInitialCityGameState(input)` | Validate exact inventory/participants/deal and supplied first role order; create initial selection window |
| `applyCityAction(state, context, action, entropy?)` | Select role, take income, draw, choose, build, use one of five concrete optional-ability variants, or end role turn |
| `timeoutCityWindow(state, context, {offline, selectedRoleId?}, entropy?)` | Apply approved current-window default and streak/forfeit precedence, without reading a clock |
| `forfeitCityPlayers(state, playerIds, entropy?)` | Atomic domain asset/role cleanup; batch form can express the approved zero-eligible edge, not a client authorization surface |
| `resetCityOfflineStreak(state, playerId)` | Reset that eligible player's streak without a new action token or other gameplay change; credential verification is outside the domain |
| `assertCityGameState(unknown)` | Strict canonical validator; does not project or publish private information |
| `calculateCityResult(state, reason)` | CITY-only final score/rank calculation |

Domain command failures use `CityRuleError` with rule-specific codes, not Socket.IO codes or Korean UI errors. Setup/whole-state validation can also report invalid canonical inputs. Candidate validation failure never publishes a partially modified state. Output, nested arrays and records are detached and frozen.

`CityEntropy` contains optional `nextActionId`, `nextRoleOrder`, `discardOrder`: explicit deterministic application inputs, not random-source callbacks. New-window identity is consumed only when a new window is actually created; next-round role order only when preparing that round; discard permutation only when existing deck supply is insufficient and discard is nonempty. Missing/duplicate/forged required orders reject the whole candidate. Unused fields do not invoke or consume RNG. E03 validates the empty replacement request before any card/order operation.

The future application must sample timeout role selection uniformly, pass an available role ID, pin entropy to one attempted atomic mutation and commit its RNG state with the successful game state. The domain verifies membership/permutations but cannot prove sampling fairness from one supplied outcome.

## 6. Acquisition, pending and construction

Basic acquisition is exactly once per normal role action: gold2, or draw up to2 and choose1. Existing deck cards are drawn first. Only a shortage uses the supplied permutation of the entire current discard. Zero deck+discard rejects card acquisition without consuming the alternative gold choice. CR-07 bonus draw takes up to2 directly, with no pending selector.

Pending is a top-level canonical card zone bound to its owner, role and existing action ID. Repeated draw does not reroll it. Choose keeps the requested candidate and appends the rest to deck bottom in original draw order. Pending blocks build/ability/end. Timeout keeps first; explicit leave discards all. If another player's departure causes an immediate LPS result, the survivor's unresolved private pending cards remain frozen/conserved rather than being silently discarded or automatically chosen. No post-terminal choice command is admitted.

Construction independently verifies hand ownership, canonical cost, gold, city template uniqueness and role-local budget1 (CR-07 replaces it with3). It atomically pays gold, moves the physical card and latches first8-building completion. No hand/city cap, special-building engine or new stall/exhaustion ending is introduced.

## 7. Roles and approved edges

- CR-01/02 accept higher role targets independent of hidden ownership/removal/disable status. Self-owned targets are no-op before disable; absent/disabled transfer targets are no-op. Marks are role-local, not player-round-wide.
- Normal entry applies reveal, eligible marked-gold transfer, then leader/category/bonus effects. CR-04 becomes leader and receives CIVIC income; CR-05 receives CULTURE income and protects through round end; CR-06 receives TRADE income and exactly1 more after acquisition; CR-07 draws up to2 and has budget3; CR-08 receives GUARD income.
- Optional abilities require completed acquisition and share the role's once budget. CR-03 swaps only hands or discards selected own cards before drawing the same number. Discard reshuffle can return those same instances. CR-08 pays max(0,cost−1) to destroy one other eligible, non-complete, non-protected city's card into discard.
- **E01:** forfeit cancels only unresolved outgoing CR-01/02 marks. Committed gold transfers/skips are not rolled back.
- **E02:** apply/end current timeout window → inspect terminal condition → if still playing, perform third-offline-timeout forfeit → only then enter another role or prepare a new round. A4→3 roster change therefore creates a2-role quota in the next round, not an old4-player quota. Terminal completion before the forfeit boundary stops further mutation.
- **E03:** zero-card own replacement rejects with no ability, card, pending or RNG effect. Empty whole-hand exchange is a different allowed variant.

Selection/action timeouts share the same offline streak; connected timeout neither increments nor resets it. Successful domain resume-reset only clears it. Timeout never auto-builds. Leave/timeout-forfeit returns gold to the abstract unlimited bank, discards hand/pending, freezes city, tombstones roles, cancels unresolved source effects and transfers leader to the next eligible seat.

## 8. Scoring, validation and integration boundary

First8-building commit latches player/round. Remaining eligible roles complete before normal round-end scoring, including another role of the same player. Eligible score is cityVP + first4 OR other final8+2 + all5categories3. Forfeited players receive frozen cityVP only, behind the eligible subgroup with competition-rank offset. Highest eligible score ties share the win. LAST_PLAYER_STANDING and NO_ELIGIBLE_PLAYERS take precedence; the latter has no winner. Other reasons, gold/hand points and role tie-breaks are absent.

Whole-state validation checks exact versions/catalog, unique roster/order, 60-card zone conservation, 8-role partition/removal/quota/queue, gold and template constraints, actor/role/budget/pending correlation, marks/protection/disclosure/forfeit coherence, completion and recomputed results. A saved full state can be checked and cloned without filesystem or persistence dependencies. No validator can prove the authenticity of a wholly replaced catalog/zone history without an external trusted game record; future persistence/commands must retain the pinned inventory and not accept client-supplied canonical state.

P15B still owns authenticated Room/current-primary dispatch, CITY-only capacity6, additive shared V2/events, expected revision/idempotency/UoW/CAS, timers/deadlines and stale callbacks, concrete adapter/projector, private snapshots and credential-safe resume. P15C owns Web gameplay/Guide. Neither phase is implemented here. Railway deployment is not required for this unreachable domain addition.

## 9. Verification

The additive CITY suites cover approved catalog/identity, setup/draft2–6, all8roles, acquisition/pending/exhaustion, construction/scoring, E01–03/timeout/leave, whole-state malformed inputs, immutable cloning and source import boundaries. Deterministic2/3/4/5/6-player full-game sequences check every committed card/role partition and finish at the approved round-end condition.

Final quality gate: **CITY targeted103/103 PASS; root1,328/1,328 PASS (shared91 / Web283 / server954)**. Existing1,225 tests are unchanged;103 tests are additive. Typecheck, build and whitespace checks pass, with no skipped/cancelled/todo tests. The Web build retains the same existing JS/CSS bundle names because no Web source changed.

Coverage totals: cardset12, actions18, lifecycle39, result10, full-state validation16, full-game sequences5, AST/import boundary3. The source audit permits exactly16 new files: seven CITY domain files, seven test suites, one test-only fixture excluded from the production build, and this document. Existing tracked files, canonical rule documents, packages/manifests and integration code remain unchanged.

**P15A COMPLETE** after the verified source checkpoint. This is pure-domain completion, not public CITY availability or P15B completion. Checkpoint message: `feat: implement city role domain`; normal push only. Historical release tag remains on `db0e6c6`. **DEPLOYMENT_NOT_REQUIRED_FOR_P15A**. Next stage, only when separately requested: **P15B — CITY_ROLE server/shared integration**.

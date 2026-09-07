# GEM_CARD P11B — server/shared integration

> Status: SOURCE COMPLETE / P11C WEB NOT STARTED
> Starting checkpoint: `9e124e4 fix: simplify number tile joker semantics`
> Baseline: 1045 tests = shared 76 + Web 179 + server 790
> Deployment: `DEPLOYMENT_NOT_REQUIRED_FOR_P11B`

## Scope and preserved boundaries

P11B connects the unchanged P11A domain (`fb8324c`) to the actual platform. It does not implement P11C, change GEM rules/cardset, change Hangul/Number gameplay, or claim completion of the separately pending Number manual Railway/Chrome verification.

Server/shared identity is exactly `HANGUL_TILE | NUMBER_TILE | GEM_CARD`. GameRegistry remains frozen identity-only `{ gameType }`. RoomRecord is the exact `HangulRoomRecord | NumberTileRoomRecord | GemCardRoomRecord`; GEM state is concrete `GemGameState | null`. No generic GameModule, command executor, state envelope, Card, Resource, Result or Turn is introduced.

## Ownership and call paths

```text
Socket.IO strict input + current binding + entry receivedAt
  -> GemCardCommandRouter (canonical Room type)
  -> GemCardCommandService (four closed GEM-only paths)
  -> unchanged P11A domain
  -> existing Room lane / UoW / CAS / idempotency
  -> Gem V2 projection + existing snapshot delivery
GameStartRouter -> GemCardStartService
ScheduledTurnRouter -> GemCardTimeoutService
PlayerLifecycleRouter -> GemCardPlayerLifecycleActions
InMemoryPersistence -> GemCardGameStateAdapter
PlatformSnapshotV2Projector -> projectGemCardV2Game
```

GEM implementation files are under `apps/server/src/games/gem-card/application/` and `compatibility/`. Platform composition remains explicit. Shared browser-safe contracts are under `packages/shared/src/games/gem-card/`.

## Exact commands and admission

All four events reuse protocolVersion 1, requestId, expectedGameRevision, turnId and strict payload. No client price/payment/state/result is accepted.

| Event | payload |
| --- | --- |
| gem:collect | `{ selection: { kind: "BASIC", resources: [one or two distinct basic IDs] } }` OR `{ selection: { kind: "PRISM" } }` |
| gem:purchase | `{ source: { kind: "MARKET", tier, slotIndex } }` OR `{ source: { kind: "RESERVED", cardId } }` |
| gem:reserve | `{ source: { tier, slotIndex } }` |
| gem:yield | `{}` |

Tier is 1/2/3; slotIndex is 0/1/2. Reserved card IDs use the actual P11A canonical `GC-T1-01` through `GC-T3-15` identity form. Market selection uses immutable slot coordinates plus revision; refill cannot silently change the target of a stale request.

GEM create/join/resume requires negotiated snapshot 2 AND advertised GEM_CARD. Rejection precedes Room/member/session/binding/presence changes and bootstrap consumption. Legacy omitted capabilities remain Hangul-only; V1+GEM also fails closed. Reconnect rechecks capabilities. Current Web still advertises [2,1] and only HANGUL_TILE + NUMBER_TILE; Home still has exactly two cards and the decoder rejects GEM instead of falling back. The only Web production edit is exhaustive Korean error-copy mapping for six additive error codes.

## Start, commands and atomicity

Start is Host-only in Lobby, with 2–4 registered CONNECTED players and current authorization. It shuffles immutable player order then tier 1, 2, 3 decks using the existing frozen Fisher–Yates primitive. RNG consumption is n-1 + 42 calls. Nine cards are face-up, each private deck has 12 remaining cards, supply is five basic resources ×7 and PRISM ×5, player resources are zero, revision is 0 and the turn lasts 45 seconds.

A fresh start against PLAYING/FINISHED is rejected; accepted same-request replay cannot start/deal again and reuses the existing idempotency outcome. No new idempotency owner is created.

Collect cap9, deterministic basic-first/PRISM-deficit payment, max2 public reserves/no reward, same-slot refill, verified YIELD, scoring and conservation all call P11A domain functions. The six additive errors are RESOURCE_SUPPLY_EMPTY, RESOURCE_LIMIT_EXCEEDED, CARD_NOT_AVAILABLE, INSUFFICIENT_RESOURCES, RESERVE_LIMIT_REACHED and YIELD_NOT_ALLOWED. Reserved-card access probes normalize to CARD_NOT_AVAILABLE.

Every canonical command/timeout candidate increments gameRevision exactly once via nextGameRevision and commits with expected storage/room revision and authorization/presence lease precondition. Rejected/stale/no-op/replay does not add a revision. Presence-restored streak reset changes storage without changing gameplay revision. Room phase transitions retain platform roomRevision semantics.

Transport captures receivedAt before validation and forwards the same identifier through the router. Deadline acceptance remains receivedAt < deadlineAt. No router timestamp regeneration exists. A timeout and command racing for the lane produce one canonical winner; receivedAt does not let a command overwrite an already committed next turn.

Fingerprints include command kind/revision/turn and exact selection/source. Basic resource set order is canonicalized. Accepted retry reuses stored outcome while wire ack reprojects current canonical state. No hidden card/refill/payment data enters a request fingerprint.

## Rack-free V2 and privacy

Lobby: GEM room + game:null. Playing: exact GEM projection. Finished: exact GEM result, no active turn. Game fields include gameType/id/revision, closed rulesVersion/cardSetVersion, turnOrder, market, supply and playerStates. Playing adds turn and nullable fairRound reason; Finished adds result.

All viewers see exact holdings, purchased/reserved card descriptors, production discounts, score and forfeited flags. There is no privateState, rack or rackCount, including fake empty rack fields. Public card descriptors are explicit whitelists. Only face-up/owned cards and remaining deck counts are projected, never future deck IDs/order, RNG, pending internal queue, no-progress records, offline streak, credentials, storageRevision, idempotency or scheduler internals.

Outer GEM branch checks only Room/self/Host/game-player correlation. Hangul/Number private-rack correlation remains in their exact branches, with unchanged V1 and V2 serialized contracts. GEM coherence checks resource totals, unique cards, counts, score/discount derivation and result correlation. No GEM V1 bridge is present.

## Server actions and finish

Existing TurnScheduler and overdue sweeper route exact GEM scheduled identity to the concrete 45-second timeout. Stale/duplicate work is no-op. No GEM overall deadline, TIME_LIMIT, or game-deadline route exists.

Connected timeout advances without action and does not increment offline streak. Offline first/second timeout records that consequence; third timeout performs its no-action/no-progress consequence, then forfeit, then finish evaluation, all in one candidate. Offline-forfeited resources and cards remain frozen. Explicit leave instead returns resources then forfeits, freezes purchased/reserved cards, and atomically combines Room/session/game changes. Successful eligible resume resets streak to zero, not gameRevision.

Finish precedence is unchanged P11A:

1. LAST_PLAYER_STANDING
2. Existing pending fair-round reason
3. Newly reached score18 fair round
4. Market-exhaustion fair round
5. Revalidated NO_PROGRESS

Fair-round remaining eligible order runs only to the immutable cycle boundary; it never becomes a new full round and an existing reason is not overwritten. Market exhaustion requires empty decks/face-up slots and no eligible reserved cards. YIELD requires no legal main action; progress resets the tracker and forfeit prunes the actor, with current legality rechecked.

All four concrete results preserve eligible-first score-descending competition ranking, forfeited entries and public reserved cards. No generic result or mandatory advisory: GEM uses authoritative snapshot fan-out/acks only. Existing Hangul advisory ordering remains unchanged.

## Persistence, recovery and retention

GemCardGameStateAdapter deep-clones/validates cards, market/decks, resources, players, turn, tracker, pending fair-round and result using canonical factories, exact original card definitions (not just aggregate balance), and 45-card/resource conservation. It rejects corrupt versions/types, inconsistent phase/player/turn/result and invalid pending state. Caller mutation cannot reach live state. Platform persistence contains only exact adapter dispatch, not GEM card/resource copy logic.

Active-turn reader recovers GEM turn deadlines; active overall-deadline reader excludes GEM. Finished retention reader uses canonical result.finishedAt. Existing all-offline 30m retention, reconnect protection, fixed finishedAt+30m cleanup, Room code release and session cleanup mechanisms remain platform-owned. Recovery/sweeper/shutdown tests retain at-least-once and no-leak behavior.

## Verification evidence

- Baseline 1045 tests preserved; no existing test removed or skipped.
- Final total: 1083 = shared 85 + Web 180 + server 818 (38 additions).
- Added shared strict command/phase/privacy/capability contracts; GEM application/atomicity/CAS/routing/start/RNG/actions/finish/recovery/retention tests; real Socket.IO admission/isolation/three-player bootstrap reuse/current-primary/resume/leave tests; current Web GEM rejection.
- Existing AST receivedAt characterization extends to all four GEM handlers. Existing H/N fixtures gain explicit unused-GEM rejection collaborators/type narrowing without replacing their actual behavior.
- Actual built `apps/server/dist/server.js` with built Web dist: /health, /, direct Room SPA and same-origin WebSocket PASS. Independent A/B create/join/start, Hangul Draw, Number Draw, GEM Collect, privacy, resume and leave/finish PASS. Legacy omitted create/V1 PASS; graceful shutdown PASS.
- Raw GEM service/runtime test also exercises public reserve/refill, earning resources through COLLECT and successful market PURCHASE (no debug seed), duplicate request, V2 sync and session replacement. Deterministic domain/application fixtures cover legal YIELD/NO_PROGRESS, all finish reasons, pool exhaustion/fair round, deadline/lease races and explicit/offline-forfeit distinction.
- Root typecheck/test/build and git diff --check PASS; targeted GEM/Socket.IO/receivedAt/production-serving 38/38 PASS, including production-serving 6/6. No public deployment or actual GEM browser UI is claimed.
- Development verification caught fixture mistakes (bound credential shape, Number's existing flat V2 turn field, and assuming a fixed lane winner); corrected the test inputs/assertions to the existing contracts, not production behavior.

## Deferred work and limitations

P11C GEM Web gameplay is NOT STARTED. There is no GEM Home card, advertised current-Web capability, controller, renderer, assets or public three-game release. Existing process-memory persistence, single-process restart/deploy Room/session loss and Hangul test-dictionary-v1 limitations remain. Railway scale/config/deployment are untouched. Number manual browser verification remains pending separately.

No gameplay rules, P11A domain/cardset, Number Joker bare wire, Hangul source/rules/wire, dependency manifest/lockfile or scheduler mechanism was changed.

## File manifest

The following files are changed/added for this P11B checkpoint (plus this document):

```text
apps/server/src/application/game-start-router.test.ts
apps/server/src/application/game-start-router.ts
apps/server/src/application/phase16-finish-flows.test.ts
apps/server/src/application/platform-snapshot-v2-projector.test.ts
apps/server/src/application/platform-snapshot-v2-projector.ts
apps/server/src/application/player-lifecycle-router.test.ts
apps/server/src/application/player-lifecycle-router.ts
apps/server/src/application/room-admission-policy.ts
apps/server/src/application/room-lifecycle-services.test.ts
apps/server/src/application/room-presence-policy-service.ts
apps/server/src/application/room-session-service.test.ts
apps/server/src/application/scheduled-turn-router.test.ts
apps/server/src/application/scheduled-turn-router.ts
apps/server/src/application/turn-end-services.test.ts
apps/server/src/application/turn-transition.ts
apps/server/src/composition-root.ts
apps/server/src/game-registry.test.ts
apps/server/src/games/gem-card/application/gem-card-command-router.ts
apps/server/src/games/gem-card/application/gem-card-command-service.ts
apps/server/src/games/gem-card/application/gem-card-player-lifecycle-actions.ts
apps/server/src/games/gem-card/application/gem-card-start-service.ts
apps/server/src/games/gem-card/application/gem-card-timeout-service.ts
apps/server/src/games/gem-card/application/gem-card-transition.ts
apps/server/src/games/gem-card/compatibility/gem-card-game-state-adapter.ts
apps/server/src/games/gem-card/compatibility/gem-card-v2-game-projector.ts
apps/server/src/games/gem-card/gem-card-registration.ts
apps/server/src/gem-card-domain-import-boundary.test.ts
apps/server/src/gem-card-integration.test.ts
apps/server/src/gem-card-socket.integration.test.ts
apps/server/src/infrastructure/in-memory-persistence.ts
apps/server/src/model/persistence.ts
apps/server/src/number-tile-application.test.ts
apps/server/src/number-tile-persistence.test.ts
apps/server/src/transport/game-type-capability.test.ts
apps/server/src/transport/socket-io-routing-characterization.test.ts
apps/server/src/transport/socket-io-snapshot-negotiation.integration.test.ts
apps/server/src/transport/socket-io.test.ts
apps/server/src/transport/socket-io.ts
apps/web/src/lib/error-messages.ts
apps/web/src/lib/snapshot-wire-decoder.test.ts
docs/GEM_CARD_PROTOCOL_GATE.md
docs/MULTI_GAME_ARCHITECTURE.md
docs/MULTI_GAME_MIGRATION_ROADMAP.md
docs/MULTI_GAME_PLATFORM_SPEC.md
packages/shared/src/contract.test.ts
packages/shared/src/game-type.ts
packages/shared/src/games/gem-card/contracts.ts
packages/shared/src/games/gem-card/v2-projection-contracts.ts
packages/shared/src/gem-card-contract.test.ts
packages/shared/src/index.test.ts
packages/shared/src/index.ts
packages/shared/src/platform/platform-snapshot-v2.ts
packages/shared/src/protocol.ts
packages/shared/src/realtime.ts
packages/shared/src/validation.ts
```

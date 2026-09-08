# CITY_ROLE — P15B server/shared integration

## Scope and baseline

P15A source checkpoint: `3be5f1a344fa0bd86b2cfcc9724455556928cb2e`; baseline **1,328 tests (shared91 / Web283 / server954)** verified before changes. The historical `three-game-platform-v1` tag remains on `db0e6c638835dc8164236fc3841f4f3a88db6054`.

This phase connects the approved pure domain to the existing platform. CITY-001–070, E01–03, the approved original60-card deck and CLASSIC_REFERENCE_VERIFIED remain authoritative. It adds no gameplay mechanics. P15B Web still advertises HANGUL_TILE / NUMBER_TILE / GEM_CARD only and Home retains three entries; CITY is admitted only for explicit V2/CITY-capable clients. P15C is a separate checkpoint.

## Concrete integration boundaries

- Identity-only registry and exact fourth `CityRoleRoomRecord`; CITY admission max6, other games max4. No generic GameModule/codec/renderer/state registry.
- `CityRoleStoredGame` wraps the unchanged domain with CITY-only gameRevision, start/window/deadline/finish timestamps and a private entropy checkpoint. No fake Rack, turnOrder, player-role duplication or overall deadline.
- `CityRoleGameStateAdapter` clones/checks full domain state, identity, versions,60card/8role partitions and45/90-second window metadata. Active/finished inspections feed existing recovery and retention readers. Process memory is not durable storage.
- CITY application uses the existing room mutation lane, current-primary authorization, UoW/storage CAS, idempotency and post-commit private snapshot fan-out. Opaque physical card IDs come from the existing cryptographic ID port, parsed into the CITY brand.
- CITY entropy uses a server-private seed/counter, SHA-256 rejection sampling and injected startup randomness. A detached candidate advances the counter; reject/CAS failure cannot advance live entropy. Lazy cached permutations supply only domain-required randomness. No shared RNG framework or new dependency.

## Commands, privacy and replay

Seven concrete commands: `city:selectRole`, `city:takeIncome`, `city:drawBuildingCards`, `city:chooseBuildingCard`, `city:useRoleAbility`, `city:build`, `city:endTurn`. The existing `game:start` remains Host-only and requires all registered players connected. No generic command or ability execution framework is added.

Commands check canonical Room type, current actor, gameId, actionId, expectedGameRevision and server receivedAt. The wire success receipt is only `{gameId, committedGameRevision}` plus the existing Room-scoped ACK shell. Private choices come from current viewer snapshots, never stale replay payloads. A repeated request reuses its original commit receipt; different payload reuse fails closed.

V2 has separate CITY selection/action/finished branches. Participant shell remains the four public platform fields. City/gold/counts/building VP/reveals are public; own exact hand/roles/marks are private. Only the current chooser sees available roles; only the pending owner sees exact candidates. No other-role ownership, hidden removals, future IDs/order, RNG, streak, credentials, storage or request ledger is projected. Finished does not disclose hidden history; survivor pending is conserved privately.

## Scheduler and player lifecycle

One active CITY window: each pick45seconds, each normal role action90seconds. Intra-window acquisition/build/ability/choice commits reschedule the latest revision at the unchanged actionId and absolute deadline. Old callbacks are no-ops; overdue readers recover missed scheduling. New windows get new opaque IDs, and completed windows are cancelled. Guide/reconnect cannot pause or extend time.

Timeout uses domain consequences: random available role for selection; gold/default first candidate/end for action, never auto-build. E02 applies current consequence and terminal check before third-offline forfeit and next entry/setup. Actual timeout-forfeit also invalidates bound sessions in the same UoW; terminal-before-forfeit does not add cleanup. E01 cancels unresolved source marks; E03 empty self exchange rejects without mutation. Explicit leave discards hand/pending, returns gold, freezes city/tombstones roles, moves leader and removes the session atomically. Accidental disconnect is not leave.

Resume preserves player/game/private hand/roles/pending/action/deadline. A verified resume resets the offline streak as private bookkeeping without gameplay revision growth. Existing single-primary and credential failure behavior is unchanged.

## Verification checkpoint

P15B source gate PASS: **1,403/1,403** (shared108 / Web285 / server1,010), **75 additive tests**, zero skipped/deleted tests. Root typecheck, full test, production build and diff-check pass. The unchanged P15A domain remains covered; H/N/G regressions remain in the full suite. Production-serving6/6 and P12 raw three-game release19/19 separately pass.

CITY targeted evidence: application22/22, raw Socket.IO5/5, projector10/10, persistence10/10, transactional entropy9/9 and domain boundary3/3. Raw2-player create/join/start, secret picks, acquisition, pending card choice, build, round transition, current-primary replacement and same-player resume pass. Raw6-player draft/privacy and seventh-player rejection pass. Wrong-game commands, stale/expired/forged identity, E01/E02/E03 and private minimal replay receipts are checked. Runtime-corrupt non-string entropy seeds fail closed instead of passing regex coercion.

Web remains deliberately unactivated in this checkpoint; its three-game catalog/capability and CITY unsupported path are regression-tested. P15C begins only after this phase's normal commit/push and clean master/origin check. Railway is not deployed; the release tag is not moved.

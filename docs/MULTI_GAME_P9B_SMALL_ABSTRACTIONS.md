# Multi-game Platform P9B — Approved Small Abstractions

> 상태: P9B COMPLETE / P9A-001~004 APPROVED AND IMPLEMENTED / P10 READY
> 기준 checkpoint: `af6ae4b docs: analyze two-game abstractions`
> 범위: 두 production game에서 이미 같은 의미로 검증된 네 작은 primitive만 추출

## 1. 승인 범위

사용자는 다음 네 decision만 승인했다.

| Decision | 구현 | canonical 위치 |
| --- | --- | --- |
| `P9A-001` | pure GameRevision successor | `apps/server/src/domain/game-revision.ts` |
| `P9A-002` | detached/frozen Fisher–Yates | `apps/server/src/domain/frozen-fisher-yates.ts` |
| `P9A-003` | Web async single-flight | `apps/web/src/lib/async-single-flight.ts` |
| `P9A-004` | Web gameplay identity comparator | `apps/web/src/lib/gameplay-identity.ts` |

이 primitive들은 game state, rule, command payload, persistence, scheduler와 wire를 소유하지 않는다. `GameModule`, generic command executor, generic Tile/Rack/Turn/Result 또는 capability-bearing Registry는 추가하지 않았다.

## 2. P9A-001 — GameRevision successor

```ts
nextGameRevision(revision: GameRevision): GameRevision
```

`GameRevisionSchema`로 `revision + 1`을 다시 검증하는 유일한 successor다. start revision 0, successful canonical gameplay commit의 +1, reject/no-op/replay/presence-only의 no increment라는 기존 ownership과 timing은 각 concrete service에 남는다. Helper는 UoW, persistence, idempotency나 다른 revision을 알지 않는다.

적용 call site:

- Hangul: Submit, Draw, Pass, timeout, finish transition, game deadline와 player lifecycle forfeit
- Number: Submit, Draw, Pass, timeout, finished transition와 player lifecycle forfeit

`roomRevision`, `presenceVersion`, `storageRevision`, `turnNumber`에는 적용하지 않았다. 기존 Hangul `incrementGameRevision`과 Number `incrementNumberTileGameRevision`, deadline-local duplicate만 제거했다.

## 3. P9A-002 — Frozen Fisher–Yates

```ts
shuffleFrozen<T>(values: readonly T[], randomSource: RandomSource): readonly T[]
```

Helper는 readonly input을 복사하고 descending Fisher–Yates를 실행한 뒤 frozen detached output을 반환한다. 길이가 `n`이면 RNG를 기존과 같은 순서인 `n, n-1, ..., 2`의 `nextInt(maxExclusive)`로 정확히 `n - 1`회 호출한다. Empty/single input은 RNG를 호출하지 않는다.

- Hangul은 기존 public `fisherYatesShuffle` 이름을 canonical helper alias로 유지해 caller와 test API를 보존한다.
- Number는 기존 private `shuffleNumberTileValues`를 유지하고 canonical helper를 호출한다.
- Hangul call site는 consonant inventory, vowel inventory와 player turn order이고 Number call site는 physical inventory와 player turn order다.
- Canonical helper의 invalid index는 `FisherYatesRandomIndexError`다. Number wrapper는 이 오류만 기존 Number 전용 `RangeError` message로 번역하고 다른 오류는 그대로 전파한다.
- Tile inventory, deal 방식과 turn-order policy는 각 game의 initial-state 구현에 남는다.

Scripted RNG result, call bounds/order/count, input non-mutation, output detachment/freeze, members, empty/single input과 invalid index를 focused test로 고정했다.

## 4. P9A-003 — Web async single-flight

기존 네 wrapper를 source 단위로 비교한 결과 의미가 동일했다.

```ts
type AsyncSingleFlightRef = { current: Promise<void> | null };
runAsyncSingleFlight(ref, execute): Promise<void>
```

공통 의미:

- 첫 invocation만 `execute`를 호출한다.
- concurrent invocation은 새 작업을 만들지 않고 같은 Promise identity를 반환한다.
- resolve/reject 뒤 현재 flight identity가 같을 때만 ref를 비운다.
- reject value/error identity를 바꾸지 않는다.
- `execute`의 synchronous throw는 동기적으로 전파되며 ref에 lock을 남기지 않는다.

기존 wrapper와 caller-facing type 이름은 유지하고 내부 implementation만 위 helper에 위임했다.

- `runTurnSubmitSingleFlight`
- `runTurnActionSingleFlight`
- `runNumberTileCommandSingleFlight`
- `runRoomLeaveSingleFlight`

Payload, requestId, retry, ack-loss, error mapping과 draft policy는 caller가 계속 소유한다. Global mutex, queue, retry framework나 generic command controller를 만들지 않았다.

## 5. P9A-004 — Gameplay identity comparator

```ts
type GameplayIdentity = Readonly<{
  gameId: GameId;
  gameRevision: GameRevision;
  turnId: TurnId;
}>;

isSameGameplayIdentity(previous, next): boolean
```

Comparator는 in-memory local draft가 같은 canonical gameplay identity에 속하는지만 비교한다. 다음 두 draft reconciliation path가 사용한다.

- Hangul `decideTurnDraftReconciliation`
- Number `decideNumberTileTurnDraftReconciliation`

각 concrete reconciliation은 phase/game type, active-player와 refresh/session replacement 같은 lifecycle policy를 계속 소유한다. Comparator에는 `roomRevision`, `presenceVersion`, connection state, server time, snapshot version, nickname, Host 또는 rack object identity를 넣지 않았다. 그러므로 presence-only 변경과 V1/V2 representation-only 변경은 동일 gameplay identity를 supersede하지 않는다.

Pending-command ack supersession helpers는 그대로 유지했다. 그 command value에는 현재 `gameId`가 없고, 여기에 새 필드를 강제하면 command/retry semantics가 달라지므로 승인된 draft reconciliation 범위를 넘는다.

## 6. Behavior preservation

- Serialized `GameRevision`은 기존 numeric representation이다.
- 동일 RNG sequence는 동일 shuffle과 동일 consumption order/count를 만든다.
- 네 Web wrapper의 Promise identity, settle cleanup, rejection과 sync-throw 의미는 같다.
- Hangul/Number draft는 same game/revision/turn의 transient reconnect와 presence-only snapshot에서 유지되고 canonical game/revision/turn이 바뀌면 reset된다.
- Protocol version, V1/V2 snapshot, capability, event/payload/error, URL은 변경하지 않는다.
- Hangul/Number start, Submit, Draw, Pass, timeout, forfeit, result, privacy와 UI 의미는 변경하지 않는다.

## 7. 계속 보류하거나 concrete로 유지한 것

`WAIT_FOR_GEM_CARD`:

- lifecycle/codec registry와 stored game envelope
- start orchestration shell과 generic command executor
- ranking abstraction과 renderer registry
- offline timeout policy
- participant/lifecycle contract, direct Hangul V2와 rack-free outer validator migration

`KEEP_CONCRETE`:

- exact `HangulRoomRecord | NumberTileRoomRecord`
- identity-only `GameRegistry`
- game별 service/router/domain/projector/renderer
- Tile/Rack/Board/Table/Meld/Joker, Result, Turn, TurnDraft와 RuleEngine

Obsolete legacy router facets도 이번 승인 범위가 아니므로 정리하지 않았다. Hangul과 Number production/domain/Web feature 간 direct mutual import도 추가하지 않았다.

## 8. Verification scope

Focused tests는 revision successor/overflow, shuffle RNG와 immutability, async single-flight resolve/reject/sync throw, gameplay identity field별 변화와 presence/V1/V2 비관여를 검증한다. 기존 Hangul/Number service, start/deal, draft/reconnect, wire/privacy/cross-game isolation과 production-serving suite도 그대로 재실행했다.

- 신규 test: server 5, Web 9, 총 14
- 전체: shared 75, Web 151, server 704, 총 930/930 PASS
- Targeted: server gameplay/start/lifecycle/import 248/248, Web single-flight/draft 62/62 PASS
- Root typecheck와 build PASS
- Production-serving 6/6 PASS
- `git diff --check` PASS

승인된 네 primitive 밖의 abstraction이나 dependency를 추가하지 않았고 unresolved regression이 없으므로 **P9B COMPLETE / P10 READY**다.

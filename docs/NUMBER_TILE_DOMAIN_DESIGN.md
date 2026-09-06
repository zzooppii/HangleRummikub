# Number Tile Domain Design

> 상태: P7A DOMAIN COMPLETE / P7B SERVER INTEGRATED / P7C WEB PENDING
> Canonical ruleset: `number-tile-rules-v1`
> 기준 문서: [NUMBER_TILE_GAME_RULES.md](./NUMBER_TILE_GAME_RULES.md)

## 1. 범위

P7A는 `apps/server/src/games/number-tile/domain/`에 framework-independent Number Tile domain만 추가했다. P7B는 이 domain을 game-owned application/compatibility boundary를 통해 Room, persistence, registry, Socket.IO와 PlatformSnapshotV2에 연결했다. Domain 자체는 여전히 transport, persistence implementation, composition root와 Web을 import하지 않는다.

Hangul의 Board, WordGroup, RuleEngine, inventory, Joker recovery와 result를 import하거나 상속하지 않는다. 현재 두 구현 사이의 유사성은 P9 전까지 platform abstraction으로 승격하지 않는다.

## 2. Concrete model

```text
games/number-tile/domain/
  tile.ts             physical Tile와 stable rule color/number
  tile-inventory.ts   exact 106-Tile inventory
  table.ts            Table, ProposedTable, GROUP/RUN placement
  rule-engine.ts      whole-table Submit validation
  draw.ts             이미 server가 선택한 한 장의 pure 이동
  stalemate.ts        Pass, eligibility, no-play, forfeit, finish decision
  result-engine.ts    Number-specific penalty/result/ranking
  game-state.ts       Number-only initial state와 90초 Turn
```

Ordinary physical Tile은 opaque `tileId`, `kind = ORDINARY`, canonical `color`, canonical `number`를 가진다. Joker는 `tileId`와 `kind = JOKER`만 가지며 canonical face가 없다. Joker의 `assignedColor`와 `assignedNumber`는 Table placement에만 존재한다. Stable meld ID는 없다.

Inventory는 `RED/BLUE/BLACK/ORANGE` × 1~13 × 2 ordinary 104장과 Joker 2장, 총 106장이다. Inventory 생성에는 `generateTileId`만 요구한다. 초기 state factory는 좁힌 ID generator, `RandomSource`, `Clock`을 주입받고 system time/random을 직접 읽지 않는다. Nontrivial injected shuffle도 동일 입력에서 같은 immutable turn order를 재현한다.

## 3. Initial state

`createInitialNumberTileGameState`는 다음 Number-owned state를 만든다.

- `gameId`, `gameRevision = 0`, `rulesVersion`
- canonical `tilesById`, single `pool`, player별 rack 14장
- empty Table, player별 `initialMeldCompleted = false`
- Number rule state인 offline timeout streak, forfeited players, no-play tracker
- start 때 한 번 shuffle한 immutable turn order
- `turnId`, active player, `startedAt`, `deadlineAt = startedAt + 90_000`
- active state의 `result = null`

Room/session/presence, room/storage revision, idempotency, scheduler와 overall game deadline은 포함하지 않는다. 2/3/4명 pool은 각각 78/64/50장이고 모든 physical Tile은 정확히 한 canonical location에 있다. Canonical Map/Set view는 mutation method를 노출하지 않으며 nested array와 descriptor도 detached/frozen 상태다.

Turn command의 pure 시간 판정은 `receivedAt < deadlineAt`만 유효하다. Equality와 이후 시각은 expired이며 실제 Clock capture, callback race와 commit은 P7B Room lane이 소유한다.

## 4. Meld와 Table validation

`NumberTileTable`과 `NumberTileProposedTable`은 complete final meld collection이다. Client drag sequence나 partial intermediate arrangement는 domain input이 아니다.

- `GROUP`: effective number 동일, effective color distinct, 3~4장
- `RUN`: effective color 동일, 1~13 안에서 ascending consecutive, 3장 이상
- 두 kind 모두 meld당 Joker 최대 1장
- Joker assignment는 valid color/number여야 하고 canonical physical kind와 일치해야 한다.
- 같은 표시 pattern의 두 meld는 distinct physical IDs이면 허용한다.
- Table 전체에서 같은 `tileId` 중복은 허용하지 않는다.

## 5. Submit RuleEngine

Pure entry point는 다음 실제 validation 정보만 받는다.

```ts
validateNumberTileSubmit({
  canonicalTable,
  proposedTable,
  tilesById,
  actorRackTileIds,
  initialMeldCompleted,
})
```

성공값은 detached/frozen final Table, 새로 사용한 rack Tile IDs, 남은 rack Tile IDs, recovered Joker IDs, initial completion 여부와 initial meld value를 반환한다. Room, Clock, revision, actor authentication과 command idempotency는 받지 않는다.

실패는 Number-owned closed category다: invalid meld, duplicate reference, tile access, conservation, missing/low initial meld, forbidden initial rearrangement, missing rack contribution, invalid Joker assignment/recovery. 이것은 public wire error catalog가 아니며 P7B compatibility layer가 안전한 mapping을 결정한다.

검증 순서는 canonical corruption fail-fast, proposed duplicate, authorized source, pre-table conservation, placement/final-meld validity, phase-specific rule, Joker recovery, rack contribution 순이다. Proposed Tile이 pre-table 또는 actor rack에 없으면 known/unknown 여부와 무관하게 같은 `INVALID_TILE_ACCESS` category를 반환한다.

### 5.1 Initial meld

Stable meld ID 대신 physical `tileId`, meld kind와 Joker assignment를 포함한 canonical meld-content signature multiset을 사용한다. GROUP 내부 순서와 Table meld 순서는 identity가 아니지만 RUN의 validated ascending sequence는 보존한다. Pre-table signature multiset이 final Table에 그대로 존재해야 하며 차감 뒤 남은 하나 이상의 새 meld만 actor rack Tile로 구성되어야 한다. 새 meld effective value 합은 30 이상이어야 한다.

### 5.2 Normal rearrangement와 conservation

모든 pre-table physical ID는 final Table에 정확히 한 번 남고 final meld 전체가 valid해야 한다. Split, merge, extend, reorder와 multi-meld rebuild 자체에는 operation identity를 두지 않는다. Actor의 pre-turn rack에서 최소 한 physical Tile이 final Table에 새로 존재해야 한다.

### 5.3 Joker recovery

Stable meld identity 없이 다음 deterministic whole-table algorithm을 사용한다.

1. Duplicate/conservation으로 각 pre-table Joker `tileId`가 final Table에 정확히 한 번 존재함을 먼저 보장한다.
2. 같은 Joker `tileId`의 pre/final `(assignedColor, assignedNumber)`를 비교한다.
3. Assignment가 바뀐 Joker만 recovered/reassigned Joker다. 위치나 meld index는 비교하지 않는다.
4. Recovered Joker의 old face를 multiset demand로 센다.
5. Final Table에 새로 사용된 actor-rack ordinary Tile만 canonical face별 replacement supply로 센다.
6. 각 old-face demand에 exact physical ordinary supply 하나를 소비한다. 같은 old face의 Joker 두 장에는 distinct replacement 두 장이 필요하다.
7. Final Table validity가 Joker의 새 assignment와 same-Submit reuse를 별도로 보장한다.

Assignment가 같은 Joker는 배열/meld 위치가 바뀌어도 recovery로 추측하지 않는다. Exact replacement는 특정 old meld에 묶이지 않으며 whole-table final state 안에서 검증한다. 이 방식은 P6 clarification과 일치하며 ambiguous counterexample은 발견되지 않았다.

## 6. Draw, Pass와 lifecycle decision

`drawSelectedNumberTile`은 application/server가 이미 선택한 한 physical Tile을 single pool에서 rack으로 옮기는 detached pure helper다. Random selection, revision과 turn commit은 P7B가 소유한다.

Pass는 pool count가 0일 때만 가능하다. No-play tracker는 explicit Pass와 pool-empty timeout no-tile action을 기록하고 valid Submit 또는 pool을 비운 마지막 Draw 뒤 reset한다. Eligibility는 `forfeited = false`만 보며 presence는 읽지 않는다. Forfeit는 해당 player record만 제거하고 remaining eligible records를 보존한다.

Finish decision precedence는 이미 필요한 timeout action/forfeit가 적용됐다는 입력에서 다음과 같다.

1. `RACK_EMPTY`
2. eligible 한 명이면 `LAST_PLAYER_STANDING`
3. pool empty이고 eligible 두 명 이상의 full no-play cycle이면 `STALEMATE`
4. 아니면 계속 진행

Eligible 0명은 corrupt/unreachable state로 fail-closed하며 `ALL_PLAYERS_FORFEITED`를 만들지 않는다. Offline timeout streak helper는 첫 timeout을 1로, 두 번째 timeout action 뒤 forfeit해야 함을 2로 결정하고 resume reset은 0이다. Pure composition regression은 두 번째 timeout에서 pool draw 또는 pool-empty no-play를 먼저 반영하고 그 뒤 forfeit/terminal을 평가하며, draw Tile이 frozen rack penalty에 포함됨을 고정한다. Scheduling과 online/offline 판정은 platform/P7B 책임이다.

## 7. Result

Number result는 Hangul Result와 별개의 discriminated union이다.

- `RACK_EMPTY`, `LAST_PLAYER_STANDING`: exact single winner와 rank 없는 `playerResults`
- `STALEMATE`: `rankings`와 one-or-more non-forfeited winners

Ordinary penalty는 face number, Joker는 30이다. Single-winner score는 winner가 다른 모든 player penalty의 양수 합을 받고 나머지는 자기 penalty의 음수다. STALEMATE는 non-forfeited subgroup을 penalty ascending competition rank한 뒤 forfeited subgroup을 그 뒤에서 별도 competition rank한다. 모든 STALEMATE score는 `-penalty`다. Result factory는 `RACK_EMPTY`가 정확히 하나인 상태만 허용하고, empty rack이 남은 `LAST_PLAYER_STANDING`/`STALEMATE`를 더 높은 terminal condition 미처리 상태로 거절한다.

`TIME_LIMIT`과 `ALL_PLAYERS_FORFEITED`는 Number result reason에 없다.

## 8. Purity와 P7B seam

Import-boundary regression은 static import/export와 string-literal dynamic import를 모두 추적해 Number domain의 Hangul, application, persistence implementation, transport, composition root, Express, Socket.IO, React 의존과 직접 `Date.now`/`Math.random`/timer 사용, stable `meldId`를 금지한다. P7A의 production inertness 검사는 P7B에서 의도적으로 종료되고, 대신 platform dispatcher와 Number-owned application/compatibility만 domain을 import하는 방향을 검증한다.

P7B가 연결한 항목은 다음뿐이다.

- shared strict Number command/projection/error schemas
- RoomRecord state ownership과 clone/validation/projector capability
- start/submit/draw/pass application service, canonical gameType dispatch와 idempotent Room-lane commit
- injected random draw와 90초 Turn scheduler/recovery
- viewer별 rack/pool privacy와 `supportedGameTypes` admission

P7B 뒤 `GameType`, GameRegistry, exact Room state, PlatformSnapshotV2, Socket.IO events와 production composition은 Number를 지원한다. Web catalog/renderer와 Web의 `NUMBER_TILE` capability advertisement는 여전히 없으며 P7C로 남긴다. Concrete runtime 경계는 [NUMBER_TILE_SERVER_INTEGRATION.md](./NUMBER_TILE_SERVER_INTEGRATION.md)에 기록한다.

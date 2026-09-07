# Multi-game Platform P9A — Two-game Abstraction Analysis

> 상태: P9A ANALYSIS COMPLETE / P9A-001~004 APPROVED AND IMPLEMENTED / P9B COMPLETE
> 기준 checkpoint: `1fafc05 docs: complete two-game production verification`
> 분석 대상: production에서 검증된 `HANGUL_TILE`, `NUMBER_TILE`
> 원칙: 두 구현의 의미가 실제로 같을 때만 작은 공통 primitive를 제안하고, runtime source나 public contract는 변경하지 않는다.

## 1. Executive summary

두 게임은 Room/session/presence/admission, Room 단위 직렬화와 UoW/CAS, idempotency, snapshot fan-out, retention/cleanup, connection capability와 optional turn scheduler를 같은 의미로 재사용한다. 이 영역은 더 이상 후보가 아니라 `PROVEN_PLATFORM_CORE`다.

반면 두 게임이 모두 tile, rack, Joker, Submit, Draw, Pass를 가진다는 사실은 공통 domain model의 근거가 아니다. Hangul은 두 bag, Board/WordGroup, 한글 조합·사전, 60초 Turn과 overall deadline을 사용한다. Number는 single pool, Table/GROUP/RUN, number/color Joker recovery, 90초 Turn과 no overall deadline을 사용한다. payload, rule, timeout, stalemate와 result semantics도 다르다. 따라서 `GenericTile`, `GenericRack`, `GenericBoard`, `GenericMeld`, `GenericJoker`, `GenericTurnDraft`, `GenericResult`, giant `GameModule`, generic `game:command`는 기각한다.

P9B에 제안할 엄격한 `EXTRACT_NOW`는 다음 네 개뿐이다.

1. pure `GameRevision` successor helper
2. opt-in frozen Fisher–Yates shuffle utility
3. Web async single-flight helper
4. Web gameplay command supersession comparator

사용자는 네 항목만 승인했고 P9B는 그 범위만 구현했다. exact `RoomRecord` union과 identity-only `GameRegistry`는 유지하고, lifecycle adapter registry, common start/command executor, competition-ranking helper, renderer registry, direct Hangul V2 migration과 rack-free PlatformSnapshot validation 경계는 `GEM_CARD` 또는 별도 migration gate까지 보류한다.

## 2. Scope and evidence

분석은 문서 이름이나 class 이름이 아니라 실제 state, call path, runtime validator와 tests를 기준으로 했다.

- Server Hangul: `apps/server/src/games/hangul-tile/`와 기존 mixed application services
- Server Number: `apps/server/src/games/number-tile/`
- Platform: Room/session/presence, persistence/UoW, routers, scheduler/recovery, transport, composition root
- Shared: `packages/shared/src/platform/`, `packages/shared/src/games/`, root protocol/realtime compatibility facade
- Web: catalog, route/session/realtime shell, snapshot decoder/router, Hangul/Number draft/controller/renderer
- Rules: `GAME_RULES.md`, `NUMBER_TILE_GAME_RULES.md`, Number protocol/domain/server/Web documents
- Regression evidence: P8의 916 tests와 public two-game verification

P9A는 source, interface, schema, test, dependency와 runtime behavior를 변경하지 않는다.

## 3. Current two-game architecture

```text
Web platform shell
  -> capability negotiation + strict snapshot decode
  -> canonical snapshot gameType dispatch
     -> Legacy Hangul view/controller/renderer
     -> Number Tile view/controller/renderer

Socket.IO transport
  -> Room/session/presence platform services
  -> GameStartRouter
     -> Hangul start service
     -> Number start service
  -> concrete game command routers
  -> narrow lifecycle / scheduled-action routers

RoomRecord exact union
  -> typed Hangul state adapter/projector
  -> typed Number state adapter/projector
  -> common in-memory UoW/CAS, recovery and retention infrastructure
```

`HANGUL_TILE`과 `NUMBER_TILE`은 서로를 직접 import하지 않는다. platform/application, shared primitive와 composition root가 두 concrete implementation을 조립한다.

## 4. Classification rules

| 분류 | 판정 기준 |
| --- | --- |
| `PROVEN_PLATFORM_CORE` | 두 게임에서 같은 authority/lifecycle 의미로 사용되고 game rule을 모르는 platform 책임 |
| `PROVEN_CROSS_GAME_PRIMITIVE` | 두 게임에서 의미와 불변 조건이 같고 작은 opt-in primitive로 표현 가능 |
| `CROSS_GAME_CANDIDATE` | 두 게임에는 존재하지만 세 번째 게임에 요구할 근거 또는 안전한 최소 API가 부족 |
| `GAME_SPECIFIC` | state, rule, action, result 또는 projection semantics가 해당 게임 소유 |
| `ACCIDENTAL_SIMILARITY` | 이름이나 자료구조는 닮았지만 authority/rule/terminal 의미가 다름 |
| `COUPLED / MIGRATION_DEBT` | platform과 concrete game 책임이 실제 파일·validator·type branch에 함께 있음 |

`EXTRACT_NOW`는 두 구현의 동일 semantics, 실제 duplication, 거의 없는 game branch, opt-in 사용, wire/behavior-neutral migration을 모두 만족할 때만 부여한다.

## 5. Proven platform core

다음 책임은 두 production game에서 같은 의미로 재사용됐다.

| 책임 | 실제 근거 | 판정 |
| --- | --- | --- |
| Room identity/code, membership, Host | `room-session-service.ts`, `room-admission-policy.ts` | core |
| bootstrap/session/resume와 single-primary | `session-resume-service.ts`, `connection-registry.ts` | core |
| presence와 reconnect | `room-presence-policy-service.ts` | core |
| snapshot/game capability admission | shared snapshot negotiation, connection metadata | core; persisted game rule이 아님 |
| immutable `Room.gameType` | `model/persistence.ts` | core |
| Room mutation lane | `keyed-serial-executor.ts`와 application Room boundary | core |
| UoW/CAS와 revisions | `room-unit-of-work.ts`, `in-memory-persistence.ts` | core |
| request ID/idempotency co-commit | in-memory persistence와 command services | core |
| Socket.IO/HTTP/same-origin serving | transport/server composition | core |
| per-recipient snapshot fan-out | transport delivery infrastructure | core; projection 내용은 game-owned |
| Lobby grace, all-offline retention, finished retention | presence/retention services | core |
| cleanup/resource release | `room-lifecycle-resources.ts` | core |
| optional timed-turn scheduling mechanism | scheduler, sweeper, recovery reader | core; timeout rule은 game-owned |

`roomRevision`, `storageRevision`, `presenceVersion`은 Room/platform mutation을 나타낸다. `gameRevision`은 두 게임에서 같은 gameplay semantics가 확인됐지만 각 concrete state 안에 계속 저장한다.

## 6. GameType and identity-only GameRegistry

`GameRegistry`는 immutable private Map에 `{ readonly gameType: GameType }`만 등록하고 exact lookup, duplicate detection과 unknown fail-closed를 제공한다. Catalog, Web support capability, start/command/projector capability를 소유하지 않는다.

두 게임을 추가하는 과정에서 이 작은 역할은 충분했다.

- runtime 지원 identity는 `HANGUL_TILE`, `NUMBER_TILE` 두 개다.
- catalog enablement와 current Web capability는 별도 authority다.
- create admission은 requested type과 connection capability를 검증한다.
- 기존 Room의 dispatch authority는 canonical `RoomRecord.gameType`이다.
- start, commands, projection, persistence와 server action은 별도의 typed router/adapter가 담당한다.

결론은 identity-only Registry 유지다. capability-bearing Registry는 heterogeneous state를 담기 위해 type erasure/assertion 또는 거대한 optional interface를 요구하고, 현재 composition root의 명시적 type safety를 약화한다.

## 7. Stored Room game representation

현재 `apps/server/src/model/persistence.ts`는 다음 상관관계를 exact union으로 보존한다.

```text
HangulRoomRecord
  gameType: HANGUL_TILE
  game: HangulGameState | null

NumberTileRoomRecord
  gameType: NUMBER_TILE
  game: NumberTileGameState | null
```

| 선택지 | 장점 | 비용/위험 | P9A 권고 |
| --- | --- | --- | --- |
| A. exact discriminated union 유지 | compile-time correlation, exhaustive narrowing, corrupt pairing 차단 | 새 게임마다 central branch 추가 | 현재 유지 |
| B. `{ gameType, game }` correlated envelope | ownership을 시각화할 수 있음 | discriminator 위치만 바꾸며 null Lobby와 narrowing migration 비용이 큼 | `WAIT_FOR_GEM_CARD` |
| C. registration-owned codec/state | durable persistence에는 유용할 수 있음 | heterogeneous registry의 existential typing/type erasure 문제 | durable storage 또는 GEM 증거까지 대기 |

`unknown`, `any`, opaque JSON, `GameStateBase`는 선택지가 아니다. 현재 branch duplication은 명시적 type safety의 비용이며 코드 줄 수만으로 제거하지 않는다.

## 8. Proven cross-game primitives

### 8.1 Game revision

양쪽 모두 start가 revision 0이고, successful canonical gameplay commit마다 정확히 1 증가하며 rejection/no-op/presence-only mutation에서는 유지된다. `GameRevision`은 `PROVEN_CROSS_GAME_PRIMITIVE`다. 다만 generic revision manager를 만들거나 state 밖으로 이동하지 않는다.

동일 successor 구현은 `application/turn-transition.ts`, `number-tile-turn-transition.ts`, `game-deadline-service.ts`에 반복된다. 하나의 pure branded increment helper가 안전한 추출 후보이다.

### 8.2 Scheduled turn identity

두 게임 모두 scheduler에 `{ roomId, gameId, gameRevision, turnId, deadlineAt }`을 전달하며 stale callback은 no-op 처리한다. registration/replacement/cancel/recovery/at-least-once callback은 공통이다. Turn duration, next-player rule과 timeout action은 공통이 아니다.

### 8.3 Active gameplay identity

두 state의 active Turn은 `turnId`, `turnNumber`, `activePlayerId`, `startedAt`, `deadlineAt`을 가진다. Web draft/pending command도 `gameId`, `gameRevision`, `turnId` 변화로 canonical identity change를 판정한다. 이 작은 identity tuple은 공통 primitive지만 `GenericTurn`의 근거는 아니다.

### 8.4 Physical identity and privacy principles

opaque `TileId`, physical instance uniqueness/conservation, viewer-own private collection과 opponent count-only projection 원칙은 두 게임에서 동일하다. Tile descriptor, Rack type, bag/pool와 board/table model은 game-specific다.

### 8.5 Small implementation primitives

두 initial-state 구현은 injected `RandomSource`로 immutable frozen-copy Fisher–Yates shuffle을 수행한다. Web command wrappers는 동일 Promise identity를 공유하는 async single-flight와 동일 revision/turn supersession 판정을 반복한다. 이들은 game model을 요구하지 않는 opt-in 작은 primitive다.

## 9. Cross-game candidates

다음은 두 게임에서 보이지만 `EXTRACT_NOW` 기준을 충족하지 않는다.

- `cloneAndValidate` + `inspectLifecycle` adapter contract: API는 닮았지만 heterogeneous generic registry의 type cost가 큼
- lifecycle base read model: RUNNING/FINISHED vocabulary는 같지만 active Turn과 deadline을 모든 게임에 요구할 수 없음
- start orchestration shell: presence lease와 overall deadline/advisory 차이 때문에 hook bag이 됨
- authenticated gameplay mutation shell: payload, error precedence, deadline, result와 post-commit action 차이가 큼
- player participant inspection: persistence의 direct `turnOrder` access를 줄일 수 있으나 adapter surface 결정을 GEM까지 보류
- offline two-strike timeout policy: 현재 두 제품 규칙은 같지만 platform invariant라고 할 근거가 없음
- competition-ranking utility: 1,1,3 계산은 닮았지만 eligibility, subgroup와 ordering key가 다름
- projection/renderer registration: Hangul V2→V1 adapter와 Number native V2의 비대칭이 아직 큼
- shared schema assembly factory: strict runtime validation과 inferred discriminated union 위험이 benefit보다 큼

## 10. Game-specific areas

`HANGUL_TILE`에 남는 것:

- 156개 inventory, consonant/vowel bags와 selected bag Draw
- Hangul symbol/composition, Board/WordGroup/syllable placement
- DictionaryProvider와 ALLOWED/NOT_ALLOWED/UNAVAILABLE semantics
- Hangul Joker assignment/recovery
- initial meld와 rearrangement rules
- 60초 Turn, 최대 3장 timeout penalty, 25분 overall game deadline
- Hangul stalemate, five finish reasons, score/ranking/result
- legacy V1 projection/advisory와 Hangul Web TurnDraft/editor/screens

`NUMBER_TILE`에 남는 것:

- 106개 inventory, single pool와 server-random Draw
- Table, GROUP/RUN, number/color assignment와 exact Joker recovery
- 30-point initial meld와 whole-table rearrangement
- 90초 Turn, one-tile/no-play timeout, no overall deadline
- eligible full no-play cycle, three finish reasons, forfeited subgroup ranking
- Number V2 projection, no advisory와 Number Web TurnDraft/editor/screens

## 11. Accidental similarities

| 겉보기 유사성 | 실제 차이 | 판정 |
| --- | --- | --- |
| Tile | descriptor, inventory, assignment와 rule이 다름 | `GenericTile` 금지 |
| Rack | 두 tile game의 private collection일 뿐 GEM에는 없을 수 있음 | `GenericRack` 금지 |
| Board/Table | WordGroup/syllable와 GROUP/RUN meld는 의미가 다름 | generic placement model 금지 |
| Joker | Hangul component substitution과 Number number/color recovery가 다름 | `GenericJoker` 금지 |
| Submit | atomic proposal pattern만 같고 payload/rule/error/result가 다름 | generic payload 금지 |
| Draw | selected dual bags와 random single pool | concrete commands 유지 |
| Pass | two-bag empty와 pool-empty no-play cycle | concrete rules 유지 |
| Result | reason set, rank presence, eligibility와 score가 다름 | `GenericResult` 금지 |
| TurnDraft | local lifecycle은 일부 같아도 editable domain model이 다름 | generic editor/controller 금지 |

## 12. Coupled / migration debt

실제 debt는 숨기지 않되 P9A에서 고치지 않는다.

1. `model/persistence.ts`와 central routers는 exact two-game union을 import한다. 이는 현재 type-safety tradeoff이기도 하다.
2. `in-memory-persistence.ts`가 adapter 뒤에서도 concrete `game.turnOrder`를 읽어 Room players와 비교한다.
3. 두 storage adapter가 비슷한 lifecycle union/API를 각각 정의하고 persistence가 gameType switch로 선택한다.
4. `player-lifecycle-router.ts`, `turn-transition.ts`, presence service가 두 concrete state를 union/branch한다.
5. finished leave path 일부는 Hangul advisory를 직접 분기한다.
6. Number start가 common-looking start DTO/schema를 Hangul mixed service 위치에서 import한다.
7. PlatformSnapshot V2의 outer refinement가 `game.playerStates`, `rackCount`, `privateState.rack`을 platform invariant처럼 안다. rackless GEM을 막는 가장 명확한 wire-validation debt다.
8. Hangul canonical state는 V1 projection을 거쳐 V2로 map되지만 Number는 direct V2 projector를 사용한다.
9. `use-lobby-app.ts`는 platform connection/session과 두 game의 pending/retry/action state를 함께 소유한다.
10. Web/shared exact discriminated unions과 root compatibility files는 두 game을 직접 열거한다.
11. legacy Hangul command router의 unused start facet과 server-action router의 duplicate timeout facet이 남아 있다.

## 13. Server comparison

### 13.1 Start orchestration

두 start service는 Room lane, idempotency preflight, Room/type/phase/Host/player-count/connected validation, initial state creation, UoW commit과 post-commit Turn schedule을 공유한다.

그러나 Hangul은 presence snapshot을 읽고 Turn과 overall game deadline을 등록한다. Number는 commit precondition에 RoomPresenceLease를 포함하고 overall deadline이 없다. inventory/deal/rule version/turn duration도 각자 다르다. 공통 start template은 policy hooks가 많은 framework가 되므로 `WAIT_FOR_GEM_CARD`다. `GameStartRouter`의 canonical gameType dispatch는 이미 platform core다.

### 13.2 Command pipeline

두 구현은 current-primary, lane, canonical type/phase, turn identity, receivedAt/deadline, revision, requestId/idempotency, detached candidate와 atomic UoW라는 패턴을 공유한다. Number는 자체 `number-tile-command-support.ts`에서 일부 반복을 줄였다.

Hangul Submit에는 async dictionary와 overall deadline precedence가 있고 Number Submit에는 Table/Joker/no-play semantics가 있다. Draw/Pass의 authority와 error precedence도 다르다. 공통 executor는 callback과 policy parameter가 늘어나므로 현재는 concrete service를 유지한다.

### 13.3 Submit

공통점은 live state를 수정하지 않고 whole proposed state를 검증한 뒤 한 번 commit한다는 application pattern뿐이다. `ProposedBoard`와 `ProposedTable`은 common data model이 아니다.

### 13.4 Draw

Hangul client는 CONSONANT/VOWEL bag을 선택하고 Number server는 single pool에서 random draw한다. revision/UoW shell을 제외한 action semantics는 game-specific이므로 `turn:draw`와 `number:draw`를 유지한다.

### 13.5 Pass and stalemate

Hangul Pass는 두 bag이 모두 empty일 때 가능하며 no-move tracker를 사용한다. Number Pass는 pool empty와 eligible full no-play cycle을 사용한다. 동일한 단어는 accidental similarity다.

### 13.6 Timeout

scheduled identity, stale/duplicate no-op와 offline streak orchestration은 닮았다. Hangul은 최대 3장 penalty와 two-bag/overall-deadline 규칙, Number는 one random tile 또는 no-play rule을 수행한다. scheduler는 공통이고 transition은 concrete다.

### 13.7 Leave, forfeit and result

Room authentication/session/UoW/resource cleanup은 platform leave service가 소유하고 PLAYING consequence는 narrow game action에 위임한다. Hangul은 `ALL_PLAYERS_FORFEITED`와 advisory가 가능하지만 Number는 one eligible player에서 즉시 `LAST_PLAYER_STANDING`이며 advisory가 없다. generic forfeit/result는 만들지 않는다.

## 14. Result and competition ranking comparison

Hangul은 모든 finish reason에서 ranking entries를 만들며 `TIME_LIMIT`, `ALL_PLAYERS_FORFEITED`도 지원한다. Number는 single-winner result와 stalemate rankings가 다른 discriminant이고, STALEMATE에서 forfeited subgroup을 non-forfeited 뒤에 배치한다.

`winnerPlayerIds`, numeric score, rack count, penalty와 forfeited flag가 둘에 있다고 의미까지 같은 것은 아니다. competition rank 1,1,3 계산은 pure algorithm 후보로 보이지만 input eligibility와 ordering key가 다르다. 지금 추출하면 result policy가 utility에 새거나 caller contract가 과도해지므로 concrete 유지한다.

## 15. Persistence comparison

`LegacyHangulGameStateStorage`와 `NumberTileGameStateStorage`는 각각 다음 역할을 수행한다.

- `cloneAndValidate(state)`
- `inspectLifecycle(state)`

두 adapter 덕분에 in-memory repository는 Board/Table, rack, bags/pool와 result deep-copy 규칙을 직접 구현하지 않는다. 공통 lifecycle evidence는 다음까지다.

- RUNNING: gameId, gameRevision와 active scheduled-turn identity
- FINISHED: gameId와 finishedAt
- Hangul-only optional capability: overall `gameDeadlineAt`

API의 구조적 유사성은 실제지만 generic `GameStatePersistenceAdapter<TState>` registry는 heterogeneous states를 안전하게 보관하기 어렵고 current switch보다 type complexity가 크다. exact typed adapters와 switch를 유지한다. persistence가 직접 읽는 `turnOrder` participant equality는 migration debt로 기록하되 P9B에 자동 포함하지 않는다.

## 16. Scheduling, lifecycle and recovery comparison

Turn scheduler 등록, replacement/cancel, stale identity, overdue sweep, at-least-once callback, recovery와 shutdown은 두 게임에서 같은 mechanism이다. `ScheduledTurnRouter`가 canonical gameType으로 concrete timeout transition을 고른다.

Overall game deadline은 Hangul에만 있으므로 mandatory module member가 아니다. active-turn recovery는 common이고 overall deadline recovery는 optional Hangul capability다. PLAYING all-offline 30분과 FINISHED `finishedAt + 30m` retention은 Room lifecycle policy로 두 게임에 적용된다.

offline timeout first/second strike와 resume reset은 두 게임 규칙이 현재 같지만, no-timer 또는 다른 disconnect rule을 가진 GEM에도 강제할 근거가 없다. `CROSS_GAME_CANDIDATE`로 남긴다.

## 17. Projection comparison

검증된 방향은 platform shell과 game-discriminated projection의 결합이다.

```text
Room/platform state
  -> common room/player/presence/revision shell
  + viewer-specific concrete game projection
  -> exact PlatformSnapshotV2 variant
```

현재 비대칭은 다음과 같다.

- Hangul: canonical state → Legacy V1 projection → V2 mapper
- Number: canonical state → direct Number V2 projection

Legacy V1은 production compatibility surface이므로 제거하지 않는다. direct Hangul V2는 debt를 줄이지만 privacy와 V1/V2 golden contract에 대한 위험이 크고 작은 primitive 추출이 아니다. 별도 gated migration 또는 GEM 이후 판단으로 둔다.

Projector의 최소 개념인 `projectForPlayer(state, viewer)`는 두 구현에 존재하지만 typed heterogeneous registry를 만들려면 type erasure가 필요하다. 현재 exact branches가 더 안전하다.

PlatformSnapshot V2 outer validation의 rack/playerStates correlation은 두 tile game에서는 맞지만 platform shell 의미가 아니다. 장기적으로 각 game validator가 자신의 privacy correlation을 소유해야 하나, strict wire validator 이동은 P9B의 네 pure 후보와 분리해 별도 승인·golden/privacy gate로 수행한다.

## 18. Protocol comparison

Platform commands는 bootstrap, create/join/resume/leave/sync와 shared `game:start`다. Gameplay commands는 다음 concrete compatibility surface를 유지한다.

- Hangul: `turn:submit`, `turn:draw`, `turn:pass`
- Number: `number:submit`, `number:draw`, `number:pass`

`game:command` envelope는 payload validation과 TypeScript exhaustiveness를 약화시키고 기존 event/ack/idempotency fingerprint migration을 요구한다. 두 게임의 action set이 우연히 비슷한 지금 바꿀 이점이 없다. third game도 자체 action namespace를 가질 수 있다.

Hangul의 `turn:started`, `game:finished` advisory와 Number의 no-advisory 선택은 advisory가 mandatory platform concept이 아님을 증명한다. authoritative snapshot이 공통 source of truth다.

`supportedSnapshotVersions`와 `supportedGameTypes`는 별도 connection capability이고 persisted Room/session authority가 아니다. 이 분리는 GEM 추가에도 그대로 확장 가능하다.

## 19. Web comparison

### 19.1 Proven platform shell

다음은 Web platform core다.

- `game-catalog.ts`의 catalog mechanism; 각 catalog entry는 product/game metadata
- `/`와 `/room/{ROOM_CODE}`, invitation과 Room URL parsing
- session storage, bootstrap/resume, primary replacement와 reconnect
- `realtime-client.ts`의 transport, capability handshake와 ack correlation
- strict V1/V2 decode, Room snapshot ordering과 common Room shell normalization
- canonical snapshot `gameType` dispatch와 incompatible state
- common Lobby/connection shell

Catalog, `SUPPORTED_GAME_TYPES`, Web-supported types는 현재 같은 두 값을 가지지만 authority가 다르므로 한 mutable source로 합치지 않는다.

### 19.2 Game-owned Web state

Hangul and Number Playing/Finished, TurnDraft, editor operations, dirty confirmation, rule-specific error UX는 각각 concrete feature에 남긴다. 둘 다 draft라는 이유로 state shape나 hooks를 합치지 않는다.

공통으로 증명된 작은 lifecycle은 canonical gameplay identity가 바뀌면 pending/draft가 invalidated된다는 것이다. 구체 hook이 먼저 phase/gameType을 narrow한 뒤 pure comparator가 revision/turn identity만 비교할 수 있다.

### 19.3 Pending command and retry

`turn-submit.ts`, `turn-actions.ts`, `number-tile-actions.ts`, `room-leave.ts`에 동일 Promise identity를 공유하고 settle 후 동일 reference일 때만 clear하는 single-flight 구현이 반복된다. command construction, requestId reuse, ack-loss retry, sync와 user error mapping은 concrete caller가 계속 소유해야 한다.

`use-lobby-app.ts`가 platform connection/session과 두 game command flows를 함께 소유하는 것은 실제 migration debt지만 한 번에 generic controller로 분해하지 않는다.

### 19.4 Countdown

공통 `calculateTurnCountdown` pure math는 이미 재사용된다. 두 Playing screen의 interval/clock-offset hook도 유사하지만 timer가 optional임을 흐리지 않도록 우선순위가 낮은 후보로 두며 P9B proposed scope에는 포함하지 않는다.

## 20. Error handling comparison

ack/error envelope와 transport mapping은 platform/shared infrastructure다. Room/session/auth/capability errors와 stale/deadline/revision checks 일부는 여러 command에서 나타난다.

하지만 Hangul rule errors와 Number rule errors, validation precedence와 Web recovery/dirty UX는 concrete다. 현재 flat `PROTOCOL_ERROR_CODES`와 `error-messages.ts`는 platform 및 두 game code를 함께 열거하는 debt지만 v1 wire code rename/namespace migration은 허용하지 않는다. 내부 grouping은 향후 가능하나 P9B 근거는 아니다.

## 21. Shared package comparison

현재 tree는 목표 방향에 상당히 근접했다.

```text
packages/shared/src/
  platform/platform-snapshot-v2.ts
  games/hangul-tile/*
  games/number-tile/*
  protocol.ts
  projections.ts
  realtime.ts
  validation.ts
  index.ts
```

game-owned command/projection contracts는 game namespace에 있다. root files는 protocol v1과 existing import API를 유지하는 compatibility/aggregation surface이므로 당장 제거하지 않는다.

남은 leakage는 root protocol/realtime이 두 command set과 flat error union을 함께 구성하고, outer V2 schema가 rack/playerStates correlation을 안다는 점이다. package는 root export만 제공하므로 새 subpath API를 추측해 만들지 않는다.

## 22. Composition root and dependency graph

Composition root가 두 game의 adapter, services, routers와 projectors를 명시적으로 만드는 것은 반복처럼 보여도 의도한 정책 차이를 드러낸다. factory 하나로 줄이면 dictionary, presence lease, optional game deadline, random source, advisory와 result hook을 매개변수화해야 한다. 명시적 wiring을 유지한다.

현재 주요 방향은 다음과 같다.

```text
Transport
  -> platform application/router
  -> concrete game compatibility/application
  -> concrete game domain

Platform projection shell
  -> exact Hangul/Number projector

Room persistence
  -> exact typed state adapters

Web platform route/session
  -> strict decoded game view
  -> concrete controller/renderer
```

확인된 direct production imports는 다음과 같다.

- Hangul domain → Number domain: 0
- Number domain → Hangul domain: 0
- Hangul Web feature → Number Web feature: 0
- Number Web feature → Hangul Web feature: 0

Platform/root files가 두 concrete module을 import하는 것은 위 debt 목록의 명시적 seam이다. 현재 boundary tests에서 source relative-import cycle은 발견되지 않았다.

## 23. Duplication inventory

| 위치/함수 | 반복 책임 | 의미 동일성 | 이익 | 위험 | 판정 |
| --- | --- | --- | --- | --- | --- |
| `application/turn-transition.ts::incrementGameRevision`, Number transition, `game-deadline-service.ts` local helper | branded revision +1과 parser guard | 동일 | 작은 canonical rule | 낮음 | `EXTRACT_NOW` |
| Hangul `domain/game-state.ts::fisherYatesShuffle`, Number `domain/game-state.ts::shuffleNumberTileValues` | input copy, descending swap, injected RNG index guard, freeze | 동일 | algorithm/error guard 한 곳 | 낮음 | `EXTRACT_NOW` |
| `lib/turn-submit.ts`, `turn-actions.ts`, `number-tile-actions.ts`, `room-leave.ts` single-flight wrappers | in-flight Promise 공유, settled identity 확인 후 clear | 동일 | race cleanup 한 곳 | 낮음 | `EXTRACT_NOW` |
| Hangul/Number draft reconciliation | gameId/revision/turn identity로 local draft 지속 여부 판정 | 동일 | draft invalidation identity 한 곳 | 낮음 | `EXTRACT_NOW` |
| `GameStartService.#startWithinRoomBoundary`, `NumberTileStartService.#startWithinRoomBoundary` | lane, preflight, validation, UoW, post-commit scheduling | 구조만 유사 | line 감소 | 높음: presence/deadline hooks | `WAIT_FOR_GEM_CARD` |
| Hangul and Number Submit/Draw/Pass services | lane, idempotency, authority, detached candidate, UoW | 구조만 유사 | apparent high | 높음: error/rule/action hooks | `WAIT_FOR_GEM_CARD` |
| `TurnTimeoutService`와 `NumberTileTimeoutService` room-boundary methods | scheduled identity, presence lease, action, UoW | 일부 동일 | medium | 높음: penalty/no-play/deadline | `WAIT_FOR_GEM_CARD` |
| `LegacyHangulGameStateStorage`, `NumberTileGameStateStorage` | `cloneAndValidate`, `inspectLifecycle` | base vocabulary 동일 | medium | medium: heterogeneous states | `WAIT_FOR_GEM_CARD` |
| Hangul `result-engine.ts::rankEntries`, Number `result-engine.ts::rankNumberTileSubgroup` | competition rank number 부여 | output sequence 일부 동일 | low | medium: eligibility/subgroups | `KEEP_CONCRETE` |
| Hangul/Number Playing screen countdown effects | server offset와 1초 tick을 common pure calculator에 공급 | 동일 mechanism | low | low, optional timer 주의 | 후순위 candidate |
| `LegacyHangulV1CommandRouter.start`, `LegacyHangulServerActionRouter.handleTurnTimeout` | active routers와 중복되거나 production transport에서 unused delegate | 동일 delegate | cleanup | 낮음 | `REMOVE_DUPLICATION_ONLY` |
| turn/game-deadline/finished-retention overdue sweepers | periodic read, due filter, dispatch와 retry loop | mechanism 유사 | low | medium: payload/failure semantics | P9B 제외 |

## 24. Abstraction score table

| 후보 | Evidence | Benefit | Risk | Third-game confidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Room/session/presence/UoW | HIGH | HIGH | LOW | HIGH | `PLATFORM_CORE_ALREADY` |
| identity-only Registry | HIGH | HIGH | LOW | HIGH | `PLATFORM_CORE_ALREADY` |
| exact Room union | HIGH | HIGH safety | LOW current | HIGH | `KEEP_CONCRETE` |
| `GameRevision` successor | HIGH | MEDIUM | LOW | HIGH | `EXTRACT_NOW` |
| scheduled-turn identity | HIGH | HIGH | LOW | MEDIUM | `PLATFORM_CORE_ALREADY`, opt-in |
| frozen Fisher–Yates | HIGH | MEDIUM | LOW | HIGH | `EXTRACT_NOW` |
| Web async single-flight | HIGH | MEDIUM | LOW | HIGH | `EXTRACT_NOW` |
| gameplay supersession comparator | HIGH | MEDIUM | LOW | MEDIUM | `EXTRACT_NOW` |
| common lifecycle adapter registry | HIGH API resemblance | MEDIUM | MEDIUM/HIGH | MEDIUM | `WAIT_FOR_GEM_CARD` |
| participant inspection seam | HIGH | MEDIUM | MEDIUM | MEDIUM | `WAIT_FOR_GEM_CARD` |
| start orchestration template | MEDIUM | MEDIUM | HIGH | LOW | `WAIT_FOR_GEM_CARD` |
| generic mutation executor | MEDIUM | HIGH apparent | HIGH | LOW | `WAIT_FOR_GEM_CARD` |
| offline timeout policy | HIGH for two | LOW | MEDIUM | LOW | `WAIT_FOR_GEM_CARD` |
| competition rank helper | MEDIUM | LOW | MEDIUM | MEDIUM | `KEEP_CONCRETE` |
| projector/renderer registry | MEDIUM | MEDIUM | HIGH | MEDIUM | `WAIT_FOR_GEM_CARD` |
| direct Hangul V2 projection | HIGH debt | HIGH | HIGH | HIGH | separate migration, not P9B |
| rack-free outer V2 validation | HIGH debt | HIGH | MEDIUM | HIGH | separate decision/gate |
| generic `game:command` | LOW | LOW | HIGH | LOW | `KEEP_CONCRETE` |
| Generic Tile/Rack/Board/Meld/Joker/Result/Draft | LOW semantic | LOW | HIGH | LOW | `KEEP_CONCRETE` |
| giant `GameModule` | LOW need | LOW | HIGH | LOW | `KEEP_CONCRETE` |

## 25. GameModule reassessment

하나의 큰 `GameModule`은 필요하지 않다. 두 구현만으로도 capability는 비대칭이다.

- start는 둘 다 있지만 concrete service inputs와 presence/deadline orchestration이 다르다.
- command event/payload/result가 다르다.
- clone/validation과 projection은 typed state correlation이 필요하다.
- timed Turn은 현재 둘 다 쓰지만 future game에 필수가 아니다.
- overall deadline과 advisory는 Hangul만 쓴다.
- result discriminant와 finish reasons가 다르다.

권고 구조는 identity-only registration과 composition root에서 명시적으로 조립하는 narrow typed collaborators다. optional capability를 한 interface의 optional methods로 모으지 않는다. 새 게임이 생기면 필요한 router/adapter/projector를 독립적으로 추가하고, 동일한 세 번째 usage가 나타날 때 작은 contract를 재검토한다.

## 26. GEM_CARD stress test

GEM/Card형 게임을 rack, physical tile, meld, rearrangement, Draw/Pass, local TurnDraft 또는 timer가 없을 수 있는 모델로 가정했다. 예상 action은 market card purchase/reserve와 resource acquisition이고, public market/resources와 private reserved state가 중심일 수 있다.

그 상태에서도 그대로 재사용 가능한 것은 다음이다.

- Room/session/Host/presence/reconnect/invitation
- connection capability admission과 immutable gameType
- Room lane, UoW/CAS, request ID/idempotency
- common snapshot shell/version negotiation과 per-viewer fan-out
- Lobby, retention/cleanup와 same-origin transport
- opt-in scheduled action infrastructure가 필요한 경우의 mechanism

다음은 GEM에 강제하면 실패한다.

- Tile/Rack/Board/Meld/Joker/Draw/Pass/TurnDraft/Result 공통 model
- mandatory active Turn/deadline/advisory
- PlatformSnapshot outer validator의 rack/playerStates invariant
- shared start/command executor가 tile-game hooks를 요구하는 구조

따라서 현재 narrow-collaborator architecture는 giant module보다 GEM stress에 강하다. exact unions의 third branch 추가 비용은 존재하지만 잘못된 base type보다 안전하다.

## 27. EXTRACT_NOW candidates and decisions

아래 네 항목만 엄격한 기준을 통과했고 사용자가 모두 승인했다. P9A에서는 구현하지 않았으며 P9B에서 승인 범위 그대로 구현했다.

| Decision ID | 상태 | 최소 변경 | 근거 |
| --- | --- | --- | --- |
| `P9A-001` | `APPROVED / IMPLEMENTED` | pure `nextGameRevision(revision)` helper | 동일 branded +1 semantics, no game branch |
| `P9A-002` | `APPROVED / IMPLEMENTED` | `shuffleFrozen(values, randomSource)` | 양 initial state의 동일 injected-RNG algorithm, opt-in 사용 |
| `P9A-003` | `APPROVED / IMPLEMENTED` | Web `runAsyncSingleFlight(ref, execute)` | 네 wrapper의 동일 Promise/race cleanup semantics |
| `P9A-004` | `APPROVED / IMPLEMENTED` | `isSameGameplayIdentity(previous, next)` | Hangul/Number draft의 동일 game/revision/turn identity rule |

`P9A-001`은 revision 저장 위치, increment timing 또는 error를 바꾸지 않는다. `P9A-002`는 inventory/deal/order policy를 소유하지 않으며 Number wrapper가 기존 Number 전용 invalid-index error message를 번역해 보존한다. `P9A-003`은 payload/requestId/retry/error mapping을 caller에 남긴다. `P9A-004`는 concrete caller가 phase/gameType과 active player를 먼저 판정하며 draft model을 받지 않는다. Pending-command ack supersession helpers는 `gameId`를 보유하지 않는 기존 command model의 의미를 넓히지 않기 위해 그대로 두었다.

## 28. KEEP_CONCRETE list

- exact `RoomRecord` Hangul/Number union
- identity-only `GameRegistry`
- concrete start and command services/routers
- Hangul and Number RuleEngine/state/inventory/deal
- Submit payloads, Draw/Pass/timeout/forfeit rules
- game-specific events and advisory policy
- Tile, Rack, Board/Table, WordGroup/Meld, Joker
- result/reason/scoring/ranking implementations
- Hangul and Number projectors and Web renderers
- both TurnDraft/editor/controller models
- legacy Hangul V1 compatibility surface

## 29. WAIT_FOR_GEM_CARD list

- stored game envelope or registration-owned codec/state abstraction
- common persistence adapter registry and participant inspection surface
- mandatory lifecycle/Turn interface
- start orchestration template
- generic authenticated mutation executor
- offline timeout streak platform policy
- competition-ranking utility
- projector/renderer/client registration manifest
- `use-lobby-app` decomposition contract
- PlatformSnapshot schema assembly factory
- direct Hangul V2 path and rack-free outer V2 validator boundary; 각각 별도 wire/privacy migration gate 필요

`legacy-hangul-v1-command-router`의 unused start, legacy server-action duplicate timeout facet와 dead Number current-turn identity type은 `REMOVE_DUPLICATION_ONLY`지만 P9B의 네 승인 단위와 섞지 않는다. 별도 cleanup decision으로 후속 제안할 수 있다.

## 30. P9B approved scope and migration risk

P9B는 사용자가 명시적으로 승인한 네 Decision ID만 구현했다. 각 primitive는 독립 rollback이 가능하며 public wire나 game state를 소유하지 않는다.

| ID | 주요 affected files | Wire | Persistence | Scheduler | Web | Rollback | 필수 regression |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `P9A-001` | revision helper, Hangul/Number transition/deadline callers | LOW | LOW | LOW | NONE | easy | start=0, success +1, reject/no-op unchanged, exhaustion |
| `P9A-002` | pure utility, both `game-state.ts` | NONE | NONE | NONE | NONE | easy | deterministic shuffle, inventory/deal/order, invalid RNG |
| `P9A-003` | Web action helpers and focused tests | NONE | NONE | NONE | LOW | easy | same Promise, exact-once, retry/requestId, settle cleanup |
| `P9A-004` | Web draft reconciliation helpers and tests | NONE | NONE | NONE | LOW | easy | game/revision/turn change, presence-only/reconnect, both games |

한 ID마다 targeted tests 후 916-test full regression, typecheck, build와 diff-check를 수행한다. public event/schema, GameType, Room representation, persistence format, scheduler behavior, UI와 gameplay는 변경하지 않는다. 여러 ID를 승인하더라도 각 변경의 semantic diff와 rollback boundary를 유지한다.

## 31. Regression strategy

P9B의 공통 stop gate는 다음과 같다.

- P1 V1 wire/golden/privacy characterization
- P2 immutable GameType/Registry
- P3A state adapter/projection, P3B routing/receivedAt, P3C lifecycle/server action
- P5 V1/V2 negotiation and strict schemas
- P7 Hangul/Number domain, server/shared and Web suites
- P8 cross-game command/admission/privacy/recovery/production-serving coverage
- total 916 tests, full typecheck/build/diff-check

`P9A-001`은 revision overflow/exhaustion과 all terminal paths를, `P9A-002`는 deterministic random source와 inventory counts를, `P9A-003/004`는 same-ID retry, stale sync, reconnect와 draft invalidation을 추가 targeted gate로 사용한다. 테스트 expectation을 새 behavior에 맞춰 약화하지 않는다.

## 32. Decision outcome

P9A 분석은 완료됐고 사용자는 아래 네 항목을 모두 승인했다. P9B는 승인되지 않은 후보를 추가하지 않고 이 네 항목만 구현했다.

| Decision ID | 제안 | 현재 상태 |
| --- | --- | --- |
| `P9A-001` | canonical pure GameRevision successor | `APPROVED / IMPLEMENTED` |
| `P9A-002` | canonical frozen Fisher–Yates utility | `APPROVED / IMPLEMENTED` |
| `P9A-003` | Web async single-flight helper | `APPROVED / IMPLEMENTED` |
| `P9A-004` | Web gameplay supersession comparator | `APPROVED / IMPLEMENTED` |

구현 위치와 call site, 보존된 의미는 [MULTI_GAME_P9B_SMALL_ABSTRACTIONS.md](./MULTI_GAME_P9B_SMALL_ABSTRACTIONS.md)에 기록한다. lifecycle/codec registry, start shell, generic command executor, ranking, renderer registry, offline timeout policy와 stored game envelope는 계속 `WAIT_FOR_GEM_CARD` 또는 `KEEP_CONCRETE`다.

## 33. P9A non-changes

- runtime/shared/server/Web source와 tests 변경 없음
- protocol/events/snapshot/schema/UI/gameplay 변경 없음
- dependencies와 package manifests 변경 없음
- `GEM_CARD` runtime identifier/placeholder/implementation 없음
- Railway deploy 없음

## 34. Validation record

- `npm run typecheck`: PASS
- `npm test`: PASS — shared 75, Web 142, server 699, total 916
- `npm run build`: PASS
- `git diff --check`: PASS
- Hangul↔Number domain/Web direct import source search: 0 in both directions
- changed scope: this analysis document plus architecture/roadmap/spec status and links only

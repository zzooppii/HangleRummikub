# Multi-game Platform Architecture

> 상태: P0 target boundary 후보 + P1 characterization + P2 internal identity checkpoint + P3A state/projection boundary checkpoint (최종 quality gate와 checkpoint push 조건부)
> 작성일: 2026-09-05
> 원칙: 현재 한글 게임을 기준 implementation으로 보존하고, 구현되지 않은 후보 contract나 directory를 완료된 것으로 해석하지 않는다.

제품 범위는 [MULTI_GAME_PLATFORM_SPEC.md](./MULTI_GAME_PLATFORM_SPEC.md), 실행 순서와 Phase별 명령은 [MULTI_GAME_MIGRATION_ROADMAP.md](./MULTI_GAME_MIGRATION_ROADMAP.md)를 따른다. P1에서 확인한 exact wire, persistence/projector/service/scheduler/web ownership은 [MULTI_GAME_P1_CHARACTERIZATION.md](./MULTI_GAME_P1_CHARACTERIZATION.md)에 기록한다.

## 1. 분석 범위와 방법

다음 영역의 실제 import, state 접근, validation, command path, projection을 확인했다.

- `packages/shared/src`: identifier, policy, protocol, projection, realtime, validation
- `apps/server/src`: domain, application, infrastructure, transport, persistence, scheduler, room/session/presence
- `apps/web/src`: Home, Lobby, realtime, Playing, TurnDraft, Finished, session/reconnect
- 각 workspace의 관련 test와 package script

분류 기준은 다음과 같다.

- `PLATFORM_CORE`: 게임 종류가 바뀌어도 의미와 불변 조건이 거의 그대로인 영역
- `HANGUL_GAME`: 한글 타일 규칙·상태·명령·표현에 종속된 영역
- `CROSS_GAME_CANDIDATE`: 재사용 가능성이 있지만 두 번째 구현 전에는 일반화를 확정할 수 없는 영역
- `COUPLED/UNCERTAIN`: 한 파일 또는 service가 플랫폼과 한글 게임 책임을 함께 수행하는 영역

파일은 현재 주된 책임을 기준으로 분류한다. 한 파일 안에 두 책임이 섞였으면 억지로 한쪽에 넣지 않고 `COUPLED/UNCERTAIN`으로 기록한다.

## 2. 현재 architecture 요약

현재 코드는 단일 한글 게임의 완성된 vertical slice에 최적화되어 있다.

```text
Web App / useLobbyApp
  -> shared StateSnapshot, command, realtime contract
  -> Socket.IO transport
  -> room/session service 또는 Hangul turn service
  -> RoomRecord { immutable gameType + platform fields + concrete GameState }
  -> in-memory repositories / deadline schedulers

concrete GameState
  -> Hangul tile inventory, rack, Board/WordGroup
  -> Hangul composition + dictionary
  -> turn/deadline/stalemate/result
```

이 구조는 한 게임에는 명료한 end-to-end type safety를 제공한다. 문제는 이름이 `game`, `StateSnapshot`, `Playing`처럼 일반적이어도 실제 shape와 validator가 한글 타일 의미를 포함한다는 점이다. 따라서 이름만 보고 core로 승격하면 coupling을 숨긴 채 고정하게 된다.

P3A는 이 aggregate type을 범용 envelope로 바꾸지 않았다. 대신 typed in-memory `GameState`의 clone·validation·최소 lifecycle 판정을 Legacy Hangul 소유 adapter 뒤로 옮기고, snapshot 조립을 Room shell과 Legacy Hangul v1 projection으로 나눴다. 이는 저장 형식이나 public wire의 일반화가 아니라 현재 구현의 소유권을 명시한 첫 내부 seam이다.

## 3. 현재 코드 분류

### 3.1 `PLATFORM_CORE`

다음은 현재 코드에서도 게임 종류와 거의 무관한 의미가 확인된다.

| 영역 | 현재 파일/모듈 | 판단과 주의점 |
| --- | --- | --- |
| 지속 식별자 | `packages/shared/src/identifiers.ts`의 `RoomId`, `PlayerId`, `RequestId`, `SessionToken`, `RoomCode`, `Nickname` | `GameId`, `TurnId`, `TileId`는 아직 이 범주가 아니다. |
| 공통 session 정책 | `packages/shared/src/policies.ts`의 bootstrap/player session, room code, nickname, single-primary connection 정책 | browser storage key의 제품명은 web migration seam이다. |
| Room/session command | `session:bootstrap`, `room:create`, `room:join`, `room:leave`, `session:resume`, `state:sync`의 envelope·ack 구조 | payload 내부의 player 수나 game revision은 별도 검토가 필요하다. |
| Room 생성·참가 | `apps/server/src/application/room-session-service.ts`의 credential, idempotency, Host, Room code 처리 | 최대 4명 고정은 game/catalog policy 후보다. |
| Session resume | `apps/server/src/application/session-resume-service.ts` | snapshot projector가 현재 한글에 결합되어 있으므로 service 전체가 완전히 독립된 것은 아니다. |
| Connection registry | `apps/server/src/infrastructure/connection-registry.ts` 및 관련 port | `playerId`와 `socketId` 분리, primary 교체는 그대로 유지한다. |
| Mutation serialization | `apps/server/src/infrastructure/keyed-serial-executor.ts` | 같은 Room mutation의 직렬화는 모든 game에 필요하다. |
| Session/Room repository 역할 | `apps/server/src/ports/session-repository.ts`, `room-repository.ts`, `room-unit-of-work.ts`의 책임 | 현재 `RoomRecord` type이 concrete Hangul state를 포함하므로 type 경계는 coupled다. |
| Room cleanup 기반 | room/session cleanup service, retention sweeper와 lifecycle resource | finished 판별을 concrete result에서 떼어내야 한다. |
| 공통 server shell | Express server, health/static serving, Socket.IO connection setup, graceful shutdown | transport handler body는 별도 분리 대상이다. |
| Web URL·session plumbing | `apps/web/src/lib/room-url.ts`, `request-id.ts`, `ack-correlation.ts`, `session-storage.ts`의 credential 처리 | pending create payload와 storage migration은 gameType 추가 시 조정한다. |
| Web 공통 화면 shell | Home의 entry shell, Lobby의 Room code/invite/Host/presence/leave, connection/session 상태 | 현재 branding, 2~4명, start eligibility는 분리 대상이다. |

플랫폼 core로 분류됐더라도 현재 concrete type에 의존하는 import는 migration에서 adapter를 거쳐 제거해야 한다.

### 3.2 `HANGUL_GAME`

| 영역 | 현재 파일/모듈 | 한글 전용 근거 |
| --- | --- | --- |
| 한글 조합 | `apps/server/src/domain/hangul/composition.ts` | 초성·중성·종성, 복합 모음·받침 조합 |
| 게임 state | `apps/server/src/domain/game/game-state.ts` | `hangul-rummikub` rules, 156 tiles, 자음/모음 bag, rack, initial meld, turn, 한글 result |
| inventory | `apps/server/src/domain/game/tile-inventory.ts` | 한글 symbol 수량과 tile cost |
| board/rules | `apps/server/src/domain/game/board.ts`, `rule-engine.ts` | WordGroup, syllable placement, Joker와 dictionary 판정 |
| 종료·점수 | `apps/server/src/domain/game/result-engine.ts`, `stalemate.ts` | rack penalty, RACK_EMPTY 등 현재 종료 이유와 ranking |
| turn application | `turn-submit-service.ts`, `turn-draw-service.ts`, `turn-pass-service.ts`, `turn-timeout-service.ts` | board/rack/bag/initial meld/turn 규칙을 직접 변경 |
| turn 전이 | `turn-transition.ts` | 현재 turn order, offline streak, stalemate semantics |
| 사전 | `apps/server/src/ports/system.ts`의 `DictionaryProvider`, `apps/server/src/infrastructure/test-dictionary-provider.ts` | 한글 단어 허용 판정과 `test-dictionary-v1` |
| shared command | `ProposedBoard`, `WordGroup`, syllable/tile placement, `turn:submit/draw/pass` | 한글 board와 consonant/vowel bag을 wire에 표현 |
| shared projection | Board, rack tile, bag counts, initial meld, 현재 GameResult | 한글 tile/score/result 규칙을 직접 validation |
| web game UI | `TurnDraftEditor.tsx`, `use-turn-draft.ts` | 한글 rack/자모 slot/Joker/board 편집. 공통 Room chrome도 가진 `PlayingScreen.tsx` 전체는 coupled로 분류한다. |
| web game helpers | `turn-draft.ts`, `turn-submit.ts`, `turn-actions.ts`, `playing-status.ts`, `finished-result.ts` | 현재 한글 command와 종료 이유를 전제 |

현재 `domain/game`이라는 일반 이름은 분류 근거가 아니다. 그 내부의 state와 rule은 실제로 `HANGUL_TILE` module이다.

### 3.3 `CROSS_GAME_CANDIDATE`

| 후보 | 재사용 가능성 | 지금 확정하면 안 되는 이유 |
| --- | --- | --- |
| `gameRevision` | game state의 optimistic concurrency와 event ordering에 유용 | 모든 game의 mutation/version 범위가 동일한지 아직 모른다. |
| `GameId` | Room 재경기나 instance 식별에 유용 | Room당 instance 수명주기와 재경기 정책이 아직 하나뿐이다. |
| game start orchestration | Host가 Lobby에서 module을 시작한다는 흐름은 공통 가능 | player 수, readiness, 초기화 입력은 game policy다. |
| Turn scheduler | NUMBER_TILE에도 turn timer가 있을 가능성 | 모든 game에 turn, 단일 active player, `TurnId`가 있는 것은 아니다. |
| Game deadline scheduler | optional 전체 제한 시간에 재사용 가능 | 현재 Hangul이 가진 두 deadline 중 하나일 뿐이고 GEM_CARD 요구가 미정이다. |
| result summary | winner IDs와 finished 시점은 공통 가능성이 높음 | numeric score, rank, penalty, forfeit 의미는 다르다. |
| player projection | 공통 identity/presence와 game progress를 조합할 수 있음 | 현재 `rackCount`, `initialMeldCompleted`, `forfeited`가 섞여 있다. |
| Room capacity/start capability | catalog UX와 서버 gate에 필요 | 현재 2~4가 Room service, start service, Hangul rules에 중복된다. |
| `Clock`, random, ID generation | module에 주입할 port로 유용 | 현재 `IdGenerator`가 `generateTurnId`와 `generateTileId`를 모든 game에 요구한다. |
| web countdown/result shell | 일부 표시 구조 재사용 가능 | timer와 ranking을 모든 game에 강제할 수 없다. |
| deadline/finish transition 역할 | serialized commit과 종료 lifecycle orchestration 일부는 재사용 가능 | 현재 concrete 파일은 한글 finish reason과 turn 정리가 섞여 있어 아래 coupled 범주에 둔다. |
| active/recovery reader 역할 | overdue work를 조회하는 port라는 역할은 유망 | 현재 concrete port/query는 turn/deadline/result field에 고정되어 아래 coupled 범주에 둔다. |

이 후보는 `NUMBER_TILE`과 `GEM_CARD`에서 같은 의미가 확인되기 전까지 platform contract에 필수 필드로 넣지 않는다.

### 3.4 `COUPLED/UNCERTAIN`

다음은 실제로 두 책임이 섞여 있어 우선 seam이 필요한 곳이다.

| 파일/모듈 | 발견된 결합 |
| --- | --- |
| `apps/server/src/model/persistence.ts` | `RoomRecord.game`이 `GameState | null`을 직접 import하여 platform aggregate가 한글 state 구조를 안다. |
| `apps/server/src/infrastructure/in-memory-persistence.ts` | P3A에서 state clone·structural validation, Room phase 판정과 active turn/game deadline/finished retention metadata 추출을 Legacy Hangul state adapter에 위임했다. persistence는 더 이상 Tile/Board/rack/bag/result/turn 내부를 직접 읽지 않지만, 기존 recovery port 자체는 turn/deadline-shaped이므로 optional capability 판단은 P3C 대상이다. |
| 같은 persistence의 idempotency cleanup | `room-player:`/`room-timeout:` scope prefix나 terminal result의 `roomId`를 해석한다. 향후 module이 임의 scope를 만들면 cleanup 누락 위험이 있다. |
| `apps/server/src/application/lobby-state-snapshot-projector.ts` | P3A에서 Room identity·presence·revision·server time shell만 조립하고, Board, Joker, rack, bag, initial meld, result 및 player별 privacy는 별도 Legacy Hangul v1 projector에 위임한다. class 이름과 최종 v1 DTO는 compatibility를 위해 유지한다. |
| `apps/server/src/application/game-start-service.ts` | Host/phase/presence/idempotency/serialization과 `createInitialGameState`, turn/game scheduling을 한 service가 수행한다. |
| `apps/server/src/application/room-leave-service.ts` | 공통 Room leave/session 삭제와 실행 중 한글 forfeit, stalemate, next turn/result 처리를 함께 수행한다. |
| `apps/server/src/application/room-presence-policy-service.ts` | 공통 presence/grace/retention이 `PlayingGameState`, offline timeout streak, concrete result를 직접 읽고 변경한다. |
| `apps/server/src/ports/system.ts` | `Clock`/random 같은 공통 port와 `DictionaryProvider`, turn/tile ID, Hangul-shaped scheduler contract가 한 파일에 있다. |
| `game-deadline-service.ts`, `game-deadline-transition.ts`, `game-finish-transition.ts` | Room lane/UoW/deadline·finish orchestration과 현재 Hangul timeout/result/turn 규칙이 함께 있다. |
| `active-turn-reader.ts`, `active-game-reader.ts`, `finished-room-retention-reader.ts` 및 overdue sweepers | recovery mechanism이 concrete `turn`, `gameDeadlineAt`, `result.finishedAt` query shape를 전제한다. |
| `apps/server/src/transport/socket-io.ts` | session/create/join/resume/sync와 `turn:submit/draw/pass`, Hangul turn/result advisory validation·broadcast가 한 transport에 있다. |
| `apps/server/src/composition-root.ts` | 하나의 `TestDictionaryProvider`와 한글 service/scheduler를 직접 조립한다. P3A state/projector collaborator도 여기서 별도로 조립하며, P2의 `GameRegistry`는 의도적으로 identity/availability lookup만 유지한다. command/server-action routing은 아직 위임받지 않는다. |
| `packages/shared/src/protocol.ts` | platform command와 ProposedBoard/WordGroup/`turn:*` command, generic·Hangul error code가 한 union에 있다. |
| `packages/shared/src/projections.ts` | generic 이름의 `StateSnapshot`이 한글 symbol, Board/rack/bag, 2~4명, initial meld, 한글 ranking 수식까지 직접 조립한다. |
| `packages/shared/src/realtime.ts` | socket lifecycle event와 현재 한글 start/turn/finish ack·advisory가 한 event map에 있다. |
| `packages/shared/src/validation.ts` | 모든 platform/Hangul command와 snapshot validator를 단일 entry surface로 묶는다. |
| `apps/web/src/App.tsx` | phase routing이 Hangul Playing/Finished validator에 의존하고 둘 다 실패하면 Lobby로 fallback한다. 다른 game snapshot을 잘못 Lobby로 표시할 위험이 있다. |
| `apps/web/src/app/use-lobby-app.ts` | 1,700줄 이상의 한 hook이 routing, create/join, session, reconnect, revision, presence와 Hangul draft/Submit/Draw/Pass/retry를 모두 소유한다. |
| `apps/web/src/lib/realtime-client.ts` | 공통 socket/ack/reconnect와 모든 Hangul command/event method·validator가 단일 class에 있다. |
| `PlayingScreen.tsx`, `FinishedScreen.tsx` | 공통 Room chrome/presence/leave와 rack/bag/turn/한글 result UI가 한 component에 있다. |
| 제품명·저장 key | `packages/shared/src/index.ts`의 `APP_NAME`, `@hangul-rummikub/*` workspace명, web Home/Lobby/`index.html` 문구, browser storage key가 단일 한글 제품명을 사용한다. 초기에는 rename하지 않고 별도 naming/storage migration seam으로 둔다. |

가장 큰 위험은 단순한 directory 위치가 아니라 platform persistence, projection, transport가 concrete 한글 state를 직접 해석한다는 점이다.

## 4. 목표 dependency 방향

장기 dependency 방향은 다음과 같다.

```text
Transport / Web composition
        |
        v
Platform application  --->  GameRegistry  --->  concrete GameModule
        |                         |                    |
        v                         v                    v
Platform ports             minimal contracts       module domain
        |                                              |
        v                                              v
Infrastructure  <--- platform-provided context/ports --+
```

규칙은 다음과 같다.

1. composition root와 registry만 등록된 concrete module 목록을 안다.
2. platform room/session/presence/persistence/realtime 코드는 `games/hangul-tile/*`를 import하지 않는다.
3. module은 Room lane, credential repository, socket registry를 직접 조작하지 않는다.
4. module은 platform이 인증·직렬화한 actor/context와 제한된 Clock/random/ID port만 받는다.
5. module state는 platform 관점에서 opaque하지만 `any`가 아니다. concrete module 내부는 strict type을 유지하고 runtime boundary는 validator/codec으로 좁힌다.
6. platform이 module state를 저장·복제·투영해야 할 때 registry를 통해 정확한 gameType implementation에 위임한다.
7. web platform은 한글 component를 직접 import하지 않고 web game registry가 authoritative `gameType`에 맞는 decoder/renderer를 선택한다.

## 5. Platform lifecycle와 game lifecycle

### 5.1 분리 가능성

현재 Room의 `phase`와 concrete `game.turn`/`game.result`는 함께 검사된다. 이를 한 번에 없애지 말고 다음 seam으로 분리할 수 있다.

```text
Room lifecycle                Module lifecycle
---------------               ----------------
LOBBY                         no game instance
PLAYING/GAME_RUNNING   --->    module-defined running state
FINISHED               --->    module-defined finished state/result
cleanup/closed                 no further module mutation
```

플랫폼은 Room 전이와 persistence commit을 소유한다. module은 동작 결과로 `RUNNING` 또는 `FINISHED`라는 최소 lifecycle outcome을 돌려주며, 구체적인 turn/result field를 platform이 검사하지 않게 한다.

초기 migration에서는 기존 `LOBBY | PLAYING | FINISHED` wire 값을 유지한다. 이름 변경과 protocol version 변경을 module extraction에 섞지 않는다.

### 5.2 경계 사건

다음 사건은 platform에서 시작하지만 module 판단이 필요할 수 있다.

- `game:start`: platform이 Host, Room phase, actor, idempotency, serialization을 검증하고 module이 player set으로 초기화한다.
- `room:leave`: platform이 membership/session 처리를 소유하고, 실행 중이면 module에 player-left server action을 전달해 하나의 candidate를 만든다. platform record와 module state는 동일 Room UoW/CAS에서 함께 commit하거나 함께 rollback하며, module capability 부재·거절 때 player/session만 먼저 삭제하지 않는다.
- Lobby disconnect grace 만료: platform이 current policy대로 player 제거와 Host 승계를 처리한다.
- Playing reconnect: platform이 presence를 복구하고, 현재 Hangul에만 필요한 offline timeout streak reset을 module action으로 전달할 수 있다.
- Playing all-offline retention: platform Room policy로 유지하며 game state mutation으로 일반화하지 않는다.
- deadline: platform scheduler가 Room lane 안에서 module server action을 재호출한다.
- module finish: module outcome을 근거로 platform이 Room phase와 retention을 갱신한다.

이 사건을 generic turn method로 모델링하지 않는다.

## 6. `GameModule` 후보 contract

다음은 platform application이 보는 개념적 facade 역할을 설명하기 위한 P0 후보이며 TypeScript 구현안이 아니다. 실제 registry entry는 아래의 좁은 capability collaborator를 조합해 이 facade를 제공한다. 같은 command나 projection을 facade와 collaborator가 두 번 실행하는 병렬 경로를 만들지 않는다.

P2는 이 `GameModule` 또는 capability surface를 구현하지 않았다. P3A도 registry entry를 확장하거나 이 conceptual facade를 구현하지 않았다. 실제 runtime registry entry는 계속 `gameType` identity만 가지며, P3A는 persistence와 projection의 실제 caller에 각각 별도 Legacy Hangul collaborator를 직접 주입했다. command와 server-action capability는 P3B/P3C에서 필요해질 때만 검증한다.

```ts
interface GameModule {
  readonly gameType: GameType;

  createInitialState(
    context: GameStartContext,
  ): Awaitable<GameOperationResult>;

  handleCommand(
    state: OpaqueModuleState,
    command: ValidatedGameCommand,
    context: GameCommandContext,
  ): Awaitable<GameOperationResult>;

  handleServerAction?(
    state: OpaqueModuleState,
    action: ValidatedServerAction,
    context: GameServerActionContext,
  ): Awaitable<GameOperationResult>;

  projectForPlayer(
    state: OpaqueModuleState,
    context: GameProjectionContext,
  ): GameProjection;
}
```

`Awaitable<T>`는 동기 결과 또는 `Promise<T>`를 뜻하는 설명용 표기다. 현재 Hangul `RuleEngine`과 `DictionaryProvider` 경로가 비동기이므로 operation boundary는 이를 수용해야 한다. `handleCommand`는 하나의 open payload bag을 뜻하지 않는다. 각 module이 닫힌 discriminated command union과 runtime validator를 소유하고, registry adapter가 그 concrete type을 보존해야 한다. `handleServerAction`은 player leave나 deadline처럼 필요한 module만 제공하는 optional capability 후보다.

`GameOperationResult`의 최소 의미 후보는 다음이다.

- 검증을 통과한 다음 module state 또는 구조화된 failure
- `RUNNING | FINISHED` lifecycle outcome
- commit 성공 뒤 등록·취소할 optional scheduled actions

구현 시 concrete module adapter는 자기 state, command, action, projection type을 유지한다. registry boundary에서 `unknown`을 받는 경우 반드시 gameType별 runtime validator로 좁힌다. `OpaqueModuleState`를 `any` 또는 검증 없는 JSON으로 구현한다는 뜻이 아니다.

### 6.1 포함하지 않는 surface

- `submit`, `draw`, `pass`, `reserve`, `purchase`: game-specific command다.
- `TurnDraft`, `Rack`, `Tile`, `Board`: 공통 contract가 아니다.
- `getActiveDeadline()`: 현재 한글 게임 자체에도 turn deadline과 game-wide deadline 두 개가 있어 단수 API가 맞지 않는다.
- 필수 timer hook: timer가 없는 module도 허용해야 한다.
- 별도 `getPublicState()`: `projectForPlayer`가 public/player-private view를 만들 수 있으므로 실제 필요가 입증되기 전 중복 API를 만들지 않는다.
- concrete `isFinished()`와 result field 직접 검사: P3A의 Hangul compatibility adapter에서는 operation outcome 또는 narrow lifecycle inspector 중 가장 작은 seam을 사용하고, 공통 lifecycle shape는 두 game을 비교하는 P9A/P9B에서 재검토한다.

### 6.2 module 밖에 둘 책임

- session token 검증
- Socket.IO ack와 connection 관리
- Room lookup과 immutable gameType 확인
- idempotency record 수명주기
- Room 단위 serial executor
- transaction/unit-of-work와 commit
- Room phase, presence, retention, cleanup
- scheduler 실행과 crash recovery mechanism

module은 이 책임의 context를 신뢰 가능한 서버 입력으로 받되 repository를 임의 호출하지 않는다.

### 6.3 별도 capability 후보와 P3A 선택

모든 역할을 하나의 concrete class에 넣지 않는다. 위 `GameModule`은 platform-facing conceptual facade다. P3A는 아래 후보 중 실제로 필요한 state/projector collaborator를 registry와 분리해 조립했고, P3B/P3C에서 command/server-action dispatch가 필요해질 때 registry entry 또는 composition boundary가 좁은 collaborator를 어떻게 연결할지 검증한다.

- `GameCommandAdapter`: game별 닫힌 command union의 runtime validation, idempotency fingerprint 및 handler
- `GameInitializer`: confirmed player policy와 server context로 초기 state candidate 생성
- `GameStateCodec`: 현재 in-memory 단계에서는 state validate/clone만 담당. durable persistence가 실제 도입될 때만 `stateSchemaVersion`별 serialize/deserialize/migration을 확장 후보로 둔다.
- `GameProjector`: viewer context를 받아 player별 projection 생성
- `GameLifecycleInspector`: platform이 필요한 game instance, scoped game revision, running/finished, finishedAt 등 operational metadata를 state에서 산출하고 cache/envelope와의 일치를 검증
- optional `GameServerActionAdapter`: leave, presence restore, deadline 등 실제로 필요한 action만 처리
- optional `GameRecoveryAdapter`: persisted state에서 overdue scheduled action을 재산출

이 목록은 최종 interface 목록이 아니다. P3A가 실제로 검증한 것은 다음 두 boundary뿐이다.

- typed in-memory `GameState`를 clone·validate하고 phase/recovery에 필요한 좁은 lifecycle read model을 산출하는 Legacy Hangul state adapter
- current `StateSnapshot` v1의 game-specific 부분과 rack privacy를 만드는 Legacy Hangul v1 projector

두 collaborator는 P2 identity registry에 빈 future method로 붙이지 않고 composition에서 실제 caller에 주입한다. state adapter의 lifecycle surface는 `RUNNING`의 game/revision/active-turn/game-deadline identity와 `FINISHED`의 game/finished identity뿐이며 timeout action이나 result 계산을 넣지 않았다. projector도 새 game projection이나 public envelope를 만들지 않았다. registry capability 조합 방식은 P3B/P3C의 실제 routing 요구가 생긴 뒤 다시 결정한다.

현재 각 Hangul application service가 가진 terminal-result replay validation도 idempotency mechanism 자체와 분리한다. platform은 record 저장·Room association·재전송을 소유하고, game adapter는 game-specific terminal payload를 validator/codec으로 해석한다.

## 7. `GameRegistry` 방향

registry의 최소 책임 후보는 다음과 같다.

- 정확한 `gameType`에서 하나의 module을 조회한다.
- duplicate registration과 필수 production module 누락을 startup에서 실패시킨다.
- executable module이 등록되어 있는지 확인한다.
- 저장 state, command, projection을 동일 gameType의 validator/codec으로 보낸다.
- 알 수 없는 persisted or wire gameType을 조용히 한글 게임으로 fallback하지 않는다.

registry가 맡지 않을 책임은 다음과 같다.

- Room, session, connection state 저장
- module command 실행 중 persistence commit
- catalog UI 문구나 licensing 결정
- 모든 game의 세부 command를 하나의 giant union으로 수동 분기
- 공통 Tile/Rack/score model 제공

catalog metadata와 executable registry의 책임은 분리한다. production enablement, 표시 이름, 설명은 catalog/policy가 담당하고 exact engine lookup은 registry가 담당한다. catalog가 enabled라고 해도 registry에 executable module이 없으면 startup/configuration error이며, registry 등록만으로 production UI에 노출하지 않는다.

P2의 registry에는 `HANGUL_TILE` identity 하나만 등록되어 있다. `GameRegistration`의 실제 surface는 `{ gameType }`뿐이고 `find`/`getRequired`는 runtime-validated exact lookup만 수행한다. 입력 목록과 entry는 private registry state로 복사되고 저장 entry와 registry object는 freeze된다. unknown lookup, 필수 registration 누락, duplicate registration은 fallback 없이 실패한다.

composition root는 legacy Hangul registration 하나를 기본 등록하고 필수 default가 없으면 startup에서 fail-fast한다. `RoomSessionApplicationService.createRoom`은 canonical state를 만들기 전에 legacy default registration을 확인하고, `GameStartService`는 초기 한글 state를 만들기 전에 저장된 `RoomRecord.gameType` registration을 확인한다. P3A에서도 이 registry는 service callback, state adapter/projector, command adapter 또는 server action을 소유하지 않는다. storage와 projection collaborator는 exact `HANGUL_TILE`을 독립적으로 fail-closed하고 composition root에서 주입된다. `NUMBER_TILE`/`GEM_CARD` placeholder와 final `GameModule`도 없다.

## 8. Command architecture

### 8.1 현재 상태

현재 platform과 game command가 한 Socket.IO event map에 있다.

- platform 성격: `session:bootstrap`, `room:create`, `room:join`, `session:resume`, `state:sync`, `room:leave`
- 경계 command: `game:start`
- 한글 전용: `turn:submit`, `turn:draw`, `turn:pass`

`room:leave`와 `game:start`는 route는 platform에 속하지만 실행 중 module policy 또는 초기화가 필요할 수 있다.

### 8.2 선택지 A: game별 event namespace

예: `hangul:submit`, `hangul:draw`, `number:meld`, `gem:purchase`

장점:

- runtime schema와 telemetry가 명시적이다.
- TypeScript event map과 권한 정책을 command 단위로 좁히기 쉽다.
- 잘못된 game client의 command가 event 이름에서 드러난다.

단점:

- 새 game마다 transport event map과 handler 수가 증가한다.
- 공통 ack/idempotency/revision boilerplate가 반복될 수 있다.
- 기존 `turn:*` rename은 불필요한 production compatibility 부담을 만든다.

### 8.3 선택지 B: 단일 game command envelope

개념 예:

```ts
{
  protocolVersion,
  requestId,
  roomId?,
  gameType,
  command: {
    type,
    expectedRevisions: CommandSpecificRevisionScope,
    payload
  }
}
```

`roomId`는 bound session에서 유도할 수 있으면 생략하고, payload로 받는 경우 membership과 대조한다. `gameType`도 dispatch 권위가 아니라 canonical Room 값과 불일치를 검출하는 discriminator다. revision은 모든 command에 room/game 두 값을 강제하지 않고, 각 command가 실제로 보호해야 하는 scope만 닫힌 schema로 요구한다.

장점:

- transport outer envelope와 ack path가 안정적이다.
- registry dispatch, auth, serialization, idempotency를 한 경로에서 처리할 수 있다.
- 새 game이 Socket.IO infrastructure를 변경하지 않을 수 있다.

단점:

- nested command의 runtime validation과 typed event ergonomics가 어려워진다.
- giant union이나 unchecked payload로 퇴행할 위험이 있다.
- client가 보낸 `gameType`을 Room의 authoritative 값과 대조하지 않으면 dispatch 취약점이 된다.

### 8.4 단계적 권고

1. P1~P4에서는 기존 `turn:*` wire event를 그대로 유지한다.
2. server 내부 adapter만 이 event를 `HANGUL_TILE` module command로 변환한다.
3. `NUMBER_TILE` command set이 rules gate에서 구체화된 뒤 두 선택지를 다시 비교한다.
4. 현재 handler의 반복을 고려하면 장기적으로는 안정된 outer `game:command`와 registry-owned game별 discriminated command schema를 우선 후보로 둔다.
5. 이를 도입하면 protocol version을 올리고 기존 Hangul `turn:*` adapter의 지원 기간을 명시한다.
6. 어느 방식이든 Room의 stored `gameType`, actor, phase, revision을 서버가 먼저 확인한다.

P0에서는 공개 command 이름을 확정하거나 변경하지 않는다.

### 8.5 Error contract 경계

현재 한 배열에 섞인 `PROTOCOL_ERROR_CODES`도 outer platform failure와 game-specific failure catalog로 논리 분리할 후보다. transport는 malformed envelope, authentication, Room, phase, version 같은 platform error를 소유한다. module은 tile/board/word/bag 또는 card/resource 같은 error를 구조화해 반환하고, compatibility composition이 이를 v1 `ErrorDto` code로 번역한다. public error namespace와 versioning 방식은 P5A와 P6에서 실제 두 command set을 본 뒤 결정하며, 내부 detail이나 private resource 존재 여부를 노출하지 않는다.

## 9. Shared protocol 분리 방향

### 9.1 현재 platform-generic contract

- Room/Player/Request/session identifier. `GameId`, Tile·Turn identity는 cross-game candidate
- protocol version, server time
- Room revision, presence version
- credential과 common ack/error envelope
- session bootstrap, create/join/resume/sync/leave
- connection status와 공통 public player identity/presence

단, `StateVersions.gameRevision`, Room phase, 2~4명 constraints는 재검토가 필요한 candidate다.

### 9.2 현재 Hangul-specific contract

- `TileId`, `TurnId`의 현재 사용
- Hangul symbol universe와 compound composition mapping
- ProposedBoard, WordGroup, syllable slot, tile placement
- consonant/vowel bag, rack projection, initial meld
- `turn:submit`, `turn:draw`, `turn:pass`
- tile/board/composition/dictionary/bag error code
- 현재 finish reason, penalty, rack count, score/ranking 검증
- 현재 turn started와 game finished advisory payload

### 9.3 target layout 후보

```text
packages/shared/src/
  platform/
    identifiers.ts
    protocol.ts
    room.ts
    session.ts
    realtime.ts
    projection.ts
    validation.ts
  games/
    hangul-tile/
      commands.ts
      projection.ts
      realtime.ts
      validation.ts
    number-tile/
    gem-card/
  index.ts
```

이는 장기 target이다. 먼저 새 barrel/compatibility export를 두고 consumer import를 작은 Phase로 옮긴다. 파일 이동만을 목표로 하지 않는다.

공통 validator는 outer platform envelope와 `game.type` discriminator까지만 검증하고, `game.state`와 `game.command`는 정확한 module validator에 위임한다. 한 개의 giant `ClientCommandSchema`나 모든 game state를 아는 monolithic validator가 다시 생기지 않게 한다.

## 10. Projection 방향

### 10.1 현재 결합

현재 `StateSnapshot`은 phase union이면서 PLAYING/FINISHED에 한글 Board, rack, bag, turn, result를 직접 포함한다. 공통 player view도 `rackCount`, `initialMeldCompleted`, `forfeited`를 가진다. 따라서 generic한 이름과 달리 새 game projection을 수용하지 못한다.

### 10.2 target envelope 후보

```ts
type PlatformSnapshot = {
  protocolVersion: number;
  versions: PlatformVersions;
  serverTime: ServerTime;
  room: {
    roomId: RoomId;
    roomCode: RoomCode;
    phase: RoomPhase;
    gameType: GameType;
    players: PlatformPlayerView[];
  };
  self: PlatformSelfView;
  game:
    | null
    | { type: "HANGUL_TILE"; state: HangulTileProjection }
    | { type: "NUMBER_TILE"; state: NumberTileProjection }
    | { type: "GEM_CARD"; state: GemCardProjection };
};
```

실제 Room field 이름은 P2, public projection union 위치는 P5A에서 확정한다. 중요한 불변 조건은 다음이다.

- `room.gameType`과 `game.type`은 일치한다.
- 동일 Room ID의 snapshot에서 gameType은 바뀌지 않는다.
- player identity/presence와 game-specific player progress를 분리한다.
- game module만 private rack/resource/reserved card를 projection한다.
- unauthorized tile/resource reference는 존재 여부를 누설하지 않는 현재 정책을 유지한다.
- 지원하지 않는 projection은 Lobby fallback이 아니라 명시적인 incompatible 상태로 처리한다.

공개 상태를 따로 broadcast하고 개인 상태를 덧붙이는 구현보다, 현재처럼 player별 완성 projection을 만드는 방식이 privacy 검증에 유리하다. 이 판단은 새 game에서도 유지하되 wire 중복 최적화는 후순위다.

## 11. Result 방향

현재 `GameResult`는 다음 한글 semantics를 모두 포함한다.

- `RACK_EMPTY`, `TIME_LIMIT`, `STALEMATE`, `LAST_PLAYER_STANDING`, `ALL_PLAYERS_FORFEITED`
- remaining rack count와 penalty cost
- score 계산과 competition ranking
- forfeit 정보

이를 generic result로 이름만 바꾸지 않는다.

platform completion metadata 후보는 `resultVersion`, `finishedAt`, `winnerPlayerIds` 정도다. Room phase가 이미 finished를 표현하므로 별도 boolean도 필수라고 가정하지 않는다. 나머지 rank, score, penalty, resources는 `game.state.result` 아래 module-specific schema가 소유한다.

이 필드도 아직 공통 contract가 아니라 candidate다. winner가 한 명인지, 공동 우승·무승부·협동 성공·winner 없음이 가능한지는 각 rules gate에서 확인한다. 최소 result envelope의 고정은 `NUMBER_TILE`만이 아니라 `GEM_CARD`까지 검증하거나 명시적인 product requirement가 생긴 뒤로 미룬다.

## 12. Persistence 방향

### 12.1 현재 상태

현재 in-memory aggregate는 Map/Set을 포함한 concrete `GameState`를 저장하고 `RoomRecord.game` type도 이를 직접 참조한다. P3A 전에는 persistence가 rack까지 복제하는 `cloneGameState`, `turn`/`result` lifecycle 판정과 recovery metadata 추출을 직접 수행했다. P3A 후 clone·structural validation·running/finished 판정 및 기존 recovery reader에 필요한 metadata는 injected Legacy Hangul state adapter가 소유한다. persistence에 남은 결합은 concrete `GameState` type과 turn/deadline-shaped recovery port를 소비한다는 사실이지 nested Hangul field 해석은 아니다.

### 12.2 JSON blob 선택지

장점:

- `room + gameType + stateSchemaVersion + payload` 구조로 SQL/Redis에 저장하기 쉽다.
- 새 game을 persistence table schema 변경 없이 추가할 수 있다.
- module별 serializer/migrator를 독립적으로 둘 수 있다.

단점:

- 검증하지 않은 JSON을 허용하면 type safety와 invariant가 사라진다.
- Map/Set, branded ID, deadline 같은 현재 in-memory 구조를 명시적으로 encode해야 한다.
- 운영 query/index와 partial migration이 어렵다.
- versioned decoder와 migration test가 필수다.

### 12.3 TypeScript discriminated union 선택지

장점:

- 현재 in-memory 구현에서 exhaustive type checking과 module-state 관계가 명확하다.
- 잘못된 gameType/state 조합을 compile time에 줄일 수 있다.
- 초기 두세 game의 contract를 관찰하기 쉽다.

단점:

- platform persistence가 union의 각 concrete field를 분기하면 새 game마다 수정된다.
- 장기 external storage format과 migration 문제를 해결하지 않는다.
- union이 한 package의 거대한 모든-game schema로 팽창할 수 있다.

### 12.4 권고

현재 단계의 권고는 typed in-memory state를 유지하면서 state 내부의 소유권만 module boundary로 옮기는 것이다. P2의 `RoomRecord.gameType`은 clone/read/UoW 전반에서 보존되고 replace의 `GAME_TYPE_MISMATCH`가 lifetime 변경을 원자적으로 거부한다. P3A는 여기에 별도 Legacy Hangul state adapter를 주입했지만 `RoomRecord.game: GameState | null`을 `unknown`, JSON blob, generic union 또는 envelope로 바꾸지 않았다.

이 선택은 discriminated envelope를 폐기한다는 뜻이 아니다. 실제 두 번째 game state와 durable persistence 요구가 생기면 다음 후보를 비교한다.

```text
RoomRecord
  + immutable gameType
  + optional versioned game-state envelope or typed union
  + module-owned validate/clone/serialize boundary
```

`stateSchemaVersion`은 durable payload decoder/migration이 실제 필요할 때만 도입할 후보다. 현재 `storageRevision`은 in-memory UoW/CAS, `roomRevision`은 Room command scope, `presenceVersion`은 transient presence ordering, `gameRevision`은 현재 game command/advisory scope를 담당한다. 특히 reconnect의 offline timeout streak reset처럼 state/storage를 바꾸지만 `gameRevision`을 올리지 않는 경로가 있으므로 이를 모든 mutation의 번호로 재정의하지 않는다.

P3A lifecycle inspector는 기존 Room phase 및 recovery caller가 실제 사용한 정보만 산출한다. `RUNNING`은 `gameId`, `gameRevision`, active `turnId`/deadline과 game deadline을, `FINISHED`는 `gameId`와 `finishedAt`을 가진다. 이 read model은 기존 scheduler port를 보존하기 위한 Legacy Hangul seam이며 모든 game의 필수 lifecycle contract가 아니다. P3C에서 optional recovery/server-action capability와 함께 다시 최소화하고, P9에서 cross-game 공통성을 재검토한다. operational summary를 별도 저장하거나 cache하지 않으므로 module state와 독립적으로 수정 가능한 두 source도 만들지 않았다.

외부 database를 도입할 때만 serialize/deserialize와 version별 decoder/migrator를 설계한다. `JsonValue`라는 이유만으로 validation 없는 arbitrary state를 허용하지 않으며, future envelope 또는 union은 `NUMBER_TILE`의 실제 shape를 본 뒤 결정한다.

idempotency cleanup에는 module이 임의 문자열 prefix를 만들게 하지 않고 platform-owned Room association metadata를 둬야 한다. P0에서는 schema나 repository를 변경하지 않는다.

## 13. Scheduler 방향

### 13.1 현재 분류

- `RoomPolicyScheduler`와 retention/disconnect cleanup mechanism은 platform core에 가깝다.
- `TurnScheduler`는 `TurnId`, turn deadline, current player, game revision을 전제하므로 Hangul 또는 cross-game candidate다.
- `GameDeadlineScheduler`는 재사용 가능성이 있지만 모든 game의 필수 기능은 아니다.
- current sweeper가 concrete `turn`과 `gameDeadlineAt`을 persistence에서 직접 찾는 부분은 coupled다.

### 13.2 optional scheduled server action 후보

장기적으로 module operation은 zero or more scheduled action descriptor를 반환할 수 있다.

```text
ScheduledGameAction
  roomId
  gameInstanceId
  expected state revision
  actionId / kind
  deadlineAt
  module-owned validated payload
```

플랫폼 scheduler는 시간 도래 시 다음만 수행한다.

1. Room lane을 획득한다.
2. Room과 game instance/type/revision을 다시 확인한다.
3. registry를 통해 해당 module의 server action을 호출한다.
4. module이 deadline과 state를 다시 검증한 뒤 성공 시 한 번만 commit한다.
5. 새 action 등록·취소와 projection broadcast를 처리한다.

timer가 없는 module은 scheduled action을 반환하지 않는다. deadline은 client 시간이 아니라 module state와 서버 Clock을 기준으로 판정한다.

이 generic mechanism은 당장 구현하지 않는다. P3C에서는 기존 TurnScheduler와 GameDeadlineScheduler를 Hangul adapter 뒤에서 그대로 사용하고, NUMBER_TILE 요구가 나온 뒤 descriptor surface를 검증한다.

operation이 반환한 일회성 effect만으로는 scheduler registration 실패나 scheduler 재생성 뒤 overdue action을 복구할 수 없다. 현 process-memory 단계의 recovery는 같은 process/repository가 살아 있는 범위에 한정된다. 실제 process restart recovery는 durable persistence가 도입된 뒤에만 가능하다. 후속 decision gate에서는 (a) scheduled descriptor를 Room state/UoW와 함께 atomic하게 저장하는 방식과 (b) module-owned recovery adapter가 persisted state에서 pending action을 결정론적으로 재산출하는 방식을 비교한다. 어느 쪽이든 schedule 등록과 state commit 사이의 crash window, 중복 실행, stale instance/revision을 test해야 하며, P0/P3에서 하나의 generic contract로 확정하지 않는다.

## 14. Server target structure

현재 repository를 고려한 장기 후보는 다음과 같다.

```text
apps/server/src/
  platform/
    room/
    session/
    presence/
    idempotency/
    persistence/
    realtime/
    lifecycle/
    scheduling/
  games/
    game-module.ts
    game-registry.ts
    hangul-tile/
      domain/
      application/
      infrastructure/
    number-tile/
      domain/
      application/
      infrastructure/
    gem-card/
      domain/
      application/
      infrastructure/
  composition-root.ts
```

이 tree를 한 Phase에 만들지 않는다. 권장 순서는 dependency seam과 compatibility adapter를 먼저 만들고, import 방향이 안정된 뒤 파일을 이동하는 것이다. 특히 다음 매핑은 동작 변경 없이 점진적으로 수행한다.

| 현재 | 장기 소유자 |
| --- | --- |
| `domain/game/*` | `games/hangul-tile/domain/*` |
| `domain/hangul/*` | `games/hangul-tile/domain/hangul/*` |
| `turn-*-service.ts` | `games/hangul-tile/application/*` |
| `DictionaryProvider` / test provider | Hangul module port/infrastructure |
| Room/session/presence services | `platform/*` |
| concrete snapshot projector | platform envelope + Hangul projector |
| Socket.IO giant handler | platform handler + internal game command adapter/router |

`Clock`, serial executor, raw timer facility처럼 실제로 공통인 infrastructure는 platform port 뒤에서 module에 제공할 수 있다. 파일 이동 자체를 architecture 완료로 보지 않는다.

## 15. Web target structure

장기 후보는 다음과 같다.

```text
apps/web/src/
  platform/
    app/
    home/
    catalog/
    lobby/
    room-shell/
    realtime/
    session/
    routing/
    state/
  games/
    game-client-registry.ts
    hangul-tile/
      ui/
      state/
      commands/
      result/
    number-tile/
    gem-card/
```

server `GameModule`과 React module을 하나의 generic interface로 억지로 맞추지 않는다. web registry의 최소 후보는 다음뿐이다.

- `gameType`
- game projection runtime decoder
- running/finished renderer 또는 하나의 game route renderer

TurnDraft, Submit, Draw, Pass, timer, rack method를 web registry interface에 넣지 않는다.

### 15.1 첫 migration seam

1. `App.tsx`의 Hangul-validator 실패 → Lobby fallback을 phase + authoritative gameType dispatch로 바꿀 준비를 한다.
2. `use-lobby-app.ts`에서 route/session/create/join/resume/sync/presence를 platform controller로, Hangul pending command/draft/advisory를 game controller로 분리한다.
3. 현재 leave/start/game command가 공유하는 single-flight, 동일 request ID retry, revision ordering은 platform mutation coordinator에서 보존한다.
4. realtime connection/ack core와 Hangul command adapter를 분리하되 wire event는 그대로 둔다.
5. Room chrome은 실제 중복인 connection/session/Room code/leave 정도만 추출한다. player game stats와 result body는 module에 둔다.
6. global CSS 분리는 시각 회귀 위험이 크므로 초기 architecture migration의 목표로 삼지 않는다.

### 15.2 catalog와 invitation

- Home의 선택은 create 요청에만 사용한다.
- ack loss retry를 위해 pending create record에 동일한 gameType과 requestId를 보존한다.
- create 성공 후에도 local 선택값이 아니라 server ack snapshot의 gameType을 사용한다.
- `/room/{ROOM_CODE}`는 그대로 유지한다.
- join/resume/sync는 snapshot의 gameType으로 renderer를 선택한다.
- unsupported game은 Hangul/Lobby로 fallback하지 않고 안전한 incompatible 화면에서 command를 차단한다.
- 기존 `hangul-rummikub.*.v1` storage key 변경은 session 손실을 일으킬 수 있으므로 dual-read migration 또는 유지 전략을 별도 설계한다.

## 16. Production compatibility seam

| Phase 범위 | compatibility 전략 |
| --- | --- |
| P1 boundary 준비 | public type, event, URL, UI, behavior 변경 없음 |
| P2 gameType/registry | `HANGUL_TILE` identity-only registration, v1 create 내부 default, Room lifetime immutability와 create/start availability check; 외부 wire·snapshot·web 유지 |
| P3A~P3D Hangul extraction | state/projection/persistence, command, server action, 물리 이동을 별도 stop gate로 수행; rule/state semantics 불변 |
| P4 regression | 573 tests + 새 characterization/E2E + production-like smoke; 기능 추가 없음 |
| P5A~P5C catalog/protocol | versioned snapshot, web routing/storage, catalog/create를 별도 stop gate로 수행; invitation URL 유지 |
| P6 이후 | disabled game을 production에 노출하지 않고 rules/implementation/E2E gate 순서 준수 |

strict old client가 unknown snapshot field를 거부할 수 있으므로 wire에 단순 field 하나를 추가하는 것도 무조건 backward-compatible하다고 가정하지 않는다. protocol version, full-stack 동시 배포, 필요 시 legacy Hangul adapter 기간을 명시한다.

현재 process-memory 서비스는 deploy/restart 시 active Room이 사라진다. 이는 알려진 운영 제약이지 migration 수단이 아니다. rollout은 진행 중 game을 의도적으로 깨지 않는 시간과 절차로 수행한다.

## 17. 테스트 migration과 safety net

production 기준선은 shared 55, web 87, server 431로 총 573 tests였다. 이후 추가된 characterization과 migration test도 이동이나 경계 추출 때문에 삭제·skip하거나 assertion을 약화하지 않는다.

### 17.1 계속 보존할 회귀

- 기존 create/join/invitation/Host/start
- session resume/replacement/reconnect/presence
- idempotency replay와 stale revision rejection
- submit candidate validation과 atomic commit
- draw/pass/timeout serialization
- disconnect forfeit, room cleanup, result/ranking
- unauthorized tile reference privacy
- browser TurnDraft reconciliation과 retry

### 17.2 추가할 platform tests

- immutable Room gameType
- exact registry dispatch와 unknown/disabled type fail-closed
- Legacy Hangul state adapter의 active/finished clone·validation·nested isolation
- persistence와 projector의 unsupported/corrupt gameType fail-closed
- Room shell + Legacy Hangul v1 projection의 exact snapshot/privacy compatibility
- invitation join/resume가 URL/local selection이 아니라 snapshot type을 따름
- same Room snapshot에서 gameType 변화 거부
- create retry가 선택된 gameType과 requestId를 보존
- non-Hangul PLAYING snapshot이 Lobby로 fallback하지 않음
- game별 private projection의 비밀 정보 격리
- scheduled action이 stale instance/revision에서 no-op 또는 구조화된 reject
- Room leave/presence event가 정확한 module server action으로 한 번 전달됨
- 서로 다른 game Room 사이의 idempotency, scheduler, broadcast 격리

state envelope의 gameType/stateSchemaVersion runtime validation은 envelope를 실제 도입하는 후속 Phase의 test다. P3A는 존재하지 않는 wire/storage contract를 미리 test하지 않는다.

`apps/web/src/lib/release-ui.test.ts`가 component/CSS 물리 경로를 직접 읽으므로 추후 파일 이동 시 test를 삭제하지 않고 경로만 조정한다.

## 18. 결정 gate와 migration 위험

| 위험 | 완화 gate |
| --- | --- |
| 이름만 generic인 한글 type을 core로 승격 | P1 classification/characterization과 import rule |
| persistence가 concrete state 내부를 계속 검사 | P3A의 별도 module-owned clone/lifecycle adapter로 storage 책임을 먼저 분리하고, recovery metadata와 저장 형식 변경은 각각 P3C와 실제 second-game/durable persistence gate로 미룸 |
| gameType을 client URL/selection에서 신뢰 | Room stored value와 snapshot만 authoritative하게 사용 |
| 새 game command가 giant unchecked union이 됨 | module-owned discriminated runtime validator 필수 |
| scheduler가 모든 game에 turn을 강제 | optional server action이며 두 번째 game 전 generic화 금지 |
| web renderer가 unknown game을 Lobby/Hangul로 fallback | explicit unsupported state와 command 차단 test |
| 추출 중 retry/revision/single-flight 소실 | 기존 tests + orchestration characterization를 이동 전 추가 |
| player count 2~4를 플랫폼 규칙으로 고정 | catalog/module policy 경계를 두 번째 game에서 검증 |
| 공개 protocol을 내부 refactor와 함께 변경 | P1~P4 wire freeze, P5A~P5C에 versioned 변경 분리 |
| 상용 game 명칭/asset 결합 | neutral internal ID, 공개 naming/licensing 별도 gate |

## 19. P0 결론

멀티게임화의 첫 기술 과제는 directory를 나누는 일이 아니다. `RoomRecord`, snapshot projector, persistence recovery, Socket.IO handler, `App.tsx`, `use-lobby-app.ts`가 한글 state 내부를 직접 아는 지점을 registry/module 경계로 감싸는 일이다.

최소 공통 표면은 Room/session/presence/idempotency/serialization/persistence·scheduler mechanism과 player별 projection 호출이다. game state, command, result, timer의 구체 모양은 module에 남긴다. 이 경계는 `NUMBER_TILE`로 한 번, `GEM_CARD`로 다시 검증한 뒤에만 안정된 platform abstraction으로 확정한다.

## 20. P1 characterized boundary checkpoint

P1은 public contract를 변경하지 않고 다음 사실을 test와 inventory로 고정했다.

- 실제 v1 event set은 Client 10개, Server 5개이며 protocol과 strict snapshot shape는 그대로다.
- `RoomRecord.game: GameState | null`, persistence clone/recovery reader, projector, leave/presence/deadline path가 concrete Hangul state를 직접 안다.
- scheduler engine과 sweepers는 비교적 중립적이지만 state extraction과 timeout/deadline result decision은 current Hangul game에 속한다.
- web의 `App.tsx`, `use-lobby-app.ts`, realtime client는 platform lifecycle과 Hangul action/rendering을 함께 소유한다.
- production source에서 추출한 seam은 기존 App renderer decision을 보존하는 순수 `resolveLegacyHangulRoomView`뿐이다.

`GameLifecycleInspector`, game-state cloner adapter, projector collaborator, command adapter는 P3로 보류했다. P1에서 이를 빈 generic interface로 추가하지 않은 것은 target 방향의 철회가 아니라, `gameType` 없이 concrete Hangul dependency를 한 단계 감추는 무의미한 indirection을 피하기 위한 stop gate였다.

## 21. P2 internal game identity checkpoint

P2는 public multi-game 기능 없이 다음 내부 identity 경계만 추가했다.

- shared `GameType` runtime 값은 `HANGUL_TILE` 하나뿐이며 future ID는 아직 허용하지 않는다.
- 기존 strict v1 `room:create`에는 `gameType` field가 없고, server가 누락된 값을 legacy default로 해석한다.
- `RoomRecord.gameType`은 생성부터 cleanup까지 보존되며 persistence replace/UoW에서 변경할 수 없다.
- identity-only `GameRegistry`와 legacy registration은 exact availability만 나타낸다. composition startup 및 create/start 경로는 필수 registration 부재를 fail-closed한다.
- `protocolVersion = 1`, v1 command/event/ack, `StateSnapshot`, Socket.IO 이름, URL, web renderer는 바뀌지 않았다.
- process-memory 저장소에는 restart를 넘는 old Room이 없으므로 state backfill/codec migration은 수행하지 않았다.
- `GameModule`, state envelope, game command dispatch, catalog, `NUMBER_TILE`, `GEM_CARD`는 구현하지 않았다.

P2의 root quality gate가 모두 통과한 checkpoint를 기준으로 P3A를 시작했다.

## 22. P3A state/projection boundary checkpoint

P3A는 `RoomRecord` 저장 형식이나 public protocol을 일반화하지 않고 현재 Hangul state 지식을 다음의 좁은 소유권 경계로 옮겼다.

- Legacy Hangul state adapter가 typed `GameState`의 deep clone, canonical structural validation과 phase/recovery용 `RUNNING | FINISHED` lifecycle inspection을 소유한다. running inspection은 game/revision/active-turn/game-deadline identity, finished inspection은 game/finished identity만 노출한다.
- in-memory persistence는 adapter를 주입받아 LOBBY/null 및 Room phase coherence를 확인하고, Tile inventory, 두 bag, rack, Board/WordGroup, Joker, initial meld, scoring/result, offline/stalemate tracker의 clone 방식을 직접 알지 않는다.
- outer snapshot projector는 Room ID/code/phase, Host/player identity, presence, revisions, `serverTime` shell을 만들고 별도 Legacy Hangul v1 projector가 Board/rack/bag/turn/result와 player별 privacy를 만든다.
- 두 경계는 canonical `gameType`이 정확히 `HANGUL_TILE`인지 확인하며 unsupported/corrupt 값에서 Hangul fallback하지 않는다.
- P2 `GameRegistry`는 `{ gameType }` identity/availability lookup으로 유지한다. state/projector capability나 `GameModule` method를 미리 추가하지 않았다.
- `RoomRecord.game: GameState | null`은 typed in-memory 안전성을 위해 남겼다. JSON blob, generic codec, discriminated game-state envelope, `stateSchemaVersion`은 도입하지 않았다.
- protocolVersion 1, strict `room:create`, `StateSnapshot` v1, Socket.IO event/ack, URL, web renderer와 Hangul rule behavior는 변경하지 않았다.

남은 결합은 다음 stop gate로 보낸다.

- P3B: `GameStartService`, Submit/Draw/Pass application service와 Socket.IO의 fixed Hangul command/advisory routing
- P3C: leave forfeit, reconnect offline streak, turn/game deadline action, result/retention과 현재 turn/deadline-shaped recovery port를 optional module server-action/recovery capability로 다루는 방식
- P3D: `domain/game`, `domain/hangul`과 shared protocol/projection/validation의 물리 경로 및 import ownership. concrete `RoomRecord.game` type을 범용화하는 일은 실제 second-game state가 이를 요구할 때 별도 결정한다.

**P3A COMPLETE / P3B READY** 판정은 P1/P2 regression을 포함한 root typecheck, 전체 test, build, `git diff --check`, P3A checkpoint commit과 일반 `origin/master` push가 모두 성공한 경우에만 유효하다.

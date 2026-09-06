# Multi-game Platform Specification

> 상태: P0~P7C COMPLETE / P8 READY
> 작성일: 2026-09-06
> 적용 범위: 현재 production 한글 타일 게임을 보존하면서 여러 턴제 보드게임을 수용하기 위한 제품 경계  
> 비고: 이 문서는 구현 계약이 아니라 후속 Phase의 의사결정 기준이다.

## 1. 문서 목적

현재 저장소의 한글 타일 게임은 Railway에서 동작이 검증된 단일 vertical slice다. 멀티게임 전환은 이 구현을 폐기하거나 새 프로젝트로 다시 만드는 작업이 아니다. 검증된 Room, Session, Presence, Reconnect, Socket.IO, lifecycle 경로를 보존하면서 게임별 규칙과 표현을 점진적으로 분리하는 작업이다.

P0의 목적은 다음 세 가지다.

1. 현재 코드에서 이미 플랫폼 의미가 분명한 부분과 한글 게임 전용 부분을 사실에 근거해 구분한다.
2. 두 번째와 세 번째 게임을 구현하며 검증할 수 있는 최소 경계만 제안한다.
3. production 동작을 유지하는 단계별 migration과 품질 gate를 정의한다.

상세 코드 분류와 구조 후보는 [MULTI_GAME_ARCHITECTURE.md](./MULTI_GAME_ARCHITECTURE.md), 실행 순서는 [MULTI_GAME_MIGRATION_ROADMAP.md](./MULTI_GAME_MIGRATION_ROADMAP.md)를 따른다.

## 2. 목표

- 하나의 서비스와 공통 Room lifecycle 안에서 서로 다른 게임을 선택하고 플레이할 수 있게 한다.
- Room, Player, Host, Session, Reconnect, Presence, invitation URL, Socket.IO connection, idempotency, revision, room mutation serialization, persistence boundary, scheduler infrastructure, lifecycle cleanup을 플랫폼 책임으로 분리한다.
- 한글 조합, 사전, 타일 inventory, WordGroup, 한글 RuleEngine, 한글 TurnDraft, 한글 점수·Draw·Timeout 규칙을 `HANGUL_TILE` 게임 모듈 책임으로 분리한다.
- `NUMBER_TILE`을 두 번째 reference implementation으로 사용해 첫 번째 경계를 검증한다.
- 전혀 다른 상태와 명령을 가진 `GEM_CARD`를 세 번째 reference implementation으로 사용해 플랫폼 공통성이 실제인지 다시 검증한다.
- TypeScript strict, 런타임 입력 검증, server-authoritative state, 비공개 정보 projection, 서버 Clock, atomic commit, room 단위 mutation serialization이라는 현재 불변 조건을 유지한다.
- 각 Phase를 독립적으로 검증하고 되돌릴 수 있을 만큼 작게 유지한다.

## 3. 비목표

P0 및 초기 migration의 비목표는 다음과 같다.

- 현재 애플리케이션을 big-bang 방식으로 재작성하지 않는다.
- 모든 게임을 현재 `GameState`, Tile, Rack, Board, TurnDraft, Submit, Joker, WordGroup 모양에 맞추지 않는다.
- `GenericTile`, `GenericWordGroup`, `GenericRackMove`, `GenericJoker`를 만들지 않는다.
- 두 번째 게임의 규칙을 확정하기 전에 `NUMBER_TILE` 구현을 시작하지 않는다.
- 세 번째 게임의 규칙·명칭·asset 정책을 확정하기 전에 `GEM_CARD` 구현을 시작하지 않는다.
- Redis, PostgreSQL, multi-replica, distributed lock, cross-process scheduler를 이번 전환의 선행 조건으로 삼지 않는다.
- 현재 `test-dictionary-v1`을 production 사전으로 교체하지 않는다.
- 공개 명칭, 상표, logo, 공식 art asset의 사용 가능성을 추정하지 않는다.
- 기존 `GAME_RULES.md`의 `TO_BE_CONFIRMED`를 플랫폼 작업을 이유로 확정하지 않는다.

## 4. 제품 식별자와 명명 경계

내부의 중립적인 game identifier와 향후 후보는 다음과 같다.

| ID | 역할 | 현재 상태 |
| --- | --- | --- |
| `HANGUL_TILE` | 기존 한글 타일 게임 | production 기준 implementation |
| `NUMBER_TILE` | 숫자 타일 게임 | P7A domain + P7B server/shared + P7C Web 완료, P8 E2E 대기 |
| `GEM_CARD` | 보석·카드형 게임 | 후속 rules gate 대상 |

`HANGUL_TILE`과 `NUMBER_TILE`은 확정된 중립 내부 식별자이고 `GEM_CARD`는 후속 rules gate의 후보다. 장기적으로 protocol, persistence, registry, telemetry에서 일관되게 사용하되 공개 UI 명칭과 licensing은 별도 결정하며, 특정 상용 게임 브랜드나 asset 이름을 결합하지 않는다.

Runtime contract인 `SUPPORTED_GAME_TYPES`와 `GameTypeSchema`는 `HANGUL_TILE`, `NUMBER_TILE` 두 값만 허용한다. Identity-only GameRegistry와 P7C Current Web capability/catalog도 이 두 값만 가진다. 후보 `GEM_CARD`는 runtime 지원 값, registration 또는 placeholder card가 아니다.

## 5. 공통 플랫폼 범위

플랫폼은 게임 규칙을 수행하는 대신 게임이 안전하게 실행되는 공통 환경을 제공한다.

### 5.1 Room과 참가자

- 고유 Room ID와 초대용 Room code
- Room 생성·참가·퇴장·cleanup
- Player 지속 식별자와 Host 역할
- player 수용 정책을 조회·적용하는 경계
- immutable `gameType`
- Room phase와 게임 instance의 연결

플랫폼의 player와 Socket.IO connection은 동일한 개념이 아니다. 기존과 같이 `playerId`와 `socketId`를 분리한다.

### 5.2 Session과 연결

- bootstrap session과 player session
- opaque `sessionToken`
- reconnect/resume
- primary connection 교체
- presence와 disconnect grace
- invitation URL

`sessionToken`은 URL, log, broadcast payload에 노출하지 않는다. game module은 raw token이나 socket identity를 알 필요가 없어야 한다.

### 5.3 명령 안전성

- runtime validation
- actor와 Room membership 인증
- phase와 immutable `gameType` 확인
- idempotency와 request replay
- scoped revision 확인
- Room 단위 mutation serialization
- candidate를 검증한 뒤 한 번만 commit하는 원자성

게임별 tile ownership, resource conservation, legal move 같은 판정은 해당 module이 수행한다. 플랫폼은 그 상태를 추측하지 않는다.

### 5.4 공통 수명주기와 기반 시설

- Room lifecycle와 retention/cleanup
- persistence port와 unit-of-work 경계
- Clock과 scheduling mechanism
- server action 재진입 시 Room lane 획득
- protocol version과 server time
- 공통 Home, catalog, Lobby, connection/session shell

스케줄러는 optional capability다. timer가 없는 게임도 유효해야 한다.

## 6. 게임 모듈 범위

게임 모듈은 자기 상태의 의미와 전이를 독점적으로 소유한다.

- 초기 상태 생성과 규칙 configuration
- game-specific command schema와 runtime validation
- actor가 요청한 게임 동작의 판정
- timeout, deadline, disconnect/forfeit 등 game-specific server action
- 비공개 상태를 보호하는 player별 projection
- 종료 조건과 game-specific result
- 저장 상태의 version/codec 또는 clone 전략
- 필요한 경우 optional scheduled action 요청

게임 모듈이 Room code, session token, socket 연결, idempotency 저장소, cleanup 정책을 직접 소유하지 않는다. 반대로 플랫폼은 board, rack, token market 같은 내부 구조를 직접 읽지 않는다.

## 7. 게임별 책임

### 7.1 `HANGUL_TILE`

- 156개 한글 tile inventory와 opaque tile identity
- 초성·중성·종성 조합 및 Joker 허용 규칙
- `DictionaryProvider`와 단어 허용 판정
- WordGroup과 board arrangement
- rack과 initial meld
- Submit, Draw, Pass
- turn/game deadline에 대한 한글 규칙
- stalemate, disconnect forfeit, score, ranking, penalty
- 현재 wire projection과 UI TurnDraft

현재 동작은 기준 implementation이다. 경계를 추출하더라도 규칙, 결과, 타이밍, projection의 의미를 바꾸지 않는다.

### 7.2 `NUMBER_TILE`

두 번째 게임은 Tile, Rack, Board, Joker, initial meld, rearrangement 같은 어휘가 일부 겹칠 가능성이 있다. 그러나 규칙 state와 RuleEngine은 독립적으로 구현한다.

공통화는 두 구현을 비교한 뒤 의미와 불변 조건이 동일함이 입증된 작은 primitive에 한한다. 이름이 비슷하다는 이유만으로 한글 board나 TurnDraft를 재사용하지 않는다.

P6는 [NUMBER_TILE_GAME_RULES.md](./NUMBER_TILE_GAME_RULES.md)에 `number-tile-rules-v1`과 `NT-001`~`NT-044`의 확정 규칙을, [NUMBER_TILE_PROTOCOL_GATE.md](./NUMBER_TILE_PROTOCOL_GATE.md)에 confirmed command·projection·compatibility 방향을 기록했다. P7A가 독립 domain을 구현하고 P7B가 shared/server runtime에 연결했으며 P7C가 Web catalog와 renderer를 추가했다.

### 7.3 `GEM_CARD`

세 번째 게임은 card market, resources/tokens, purchase, reserve, score처럼 전혀 다른 state와 action을 가질 수 있다. 이 게임이 Tile, Rack, Board, Submit을 전혀 사용하지 않아도 Room, Session, Presence, Reconnect, realtime transport, persistence boundary, cleanup을 재사용할 수 있어야 한다.

이 시점까지 공통으로 유지되는 표면만 검증된 platform abstraction으로 본다.

## 8. `gameType` 정책

다음은 catalog와 versioned contract가 도입될 때의 장기 정책이다.

- 사용자는 Home catalog에서 Room을 만들기 전 game을 선택한다.
- `gameType`은 Room 생성 요청에서 선택되고 서버가 검증한다.
- 생성된 Room의 `gameType`은 immutable이다.
- 저장·복구·snapshot·registry lookup의 권위는 서버의 Room record다.
- client가 보낸 `gameType`은 권위가 아니며 해당 Room의 값과 반드시 대조한다.
- invitation URL에는 Room code만 둔다. URL query/path의 game 이름으로 renderer를 선택하지 않는다.
- join, resume, state sync 이후 client는 서버 snapshot의 `gameType`으로 game client를 선택한다.
- 알 수 없거나 지원하지 않는 `gameType`은 `HANGUL_TILE`로 조용히 fallback하지 않고 game command를 차단한다.

P2에서는 이 public create contract를 아직 열지 않았다. P5C는 event 이름과 `protocolVersion = 1`을 유지하면서 기존 payload에 optional `gameType`만 additive하게 열었다.

```text
Legacy create payload                  Current Web create payload
{                                      {
  bootstrapCredential,                  bootstrapCredential,
  nickname                              nickname,
}                                      gameType: HANGUL_TILE
                                       }
```

서버의 create resolver는 field가 없으면 `LEGACY_V1_DEFAULT_GAME_TYPE`, 명시되어 있으면 strict `GameType`으로 해석한다. 현재 두 경로의 effective type은 모두 `HANGUL_TILE`이다. top-level `gameType`, `NUMBER_TILE`, `GEM_CARD`, `UNKNOWN`, 빈 문자열, 잘못된 scalar/object와 무관한 extra field는 계속 `INVALID_PAYLOAD`로 거절한다. resolved type은 Room/session/idempotency mutation 전에 identity-only `GameRegistry`의 exact registration으로 확인하고 canonical `RoomRecord.gameType`으로 저장한다.

Create idempotency fingerprint에는 normalized nickname뿐 아니라 resolved effective `gameType`도 포함한다. 따라서 omitted legacy create와 explicit `HANGUL_TILE` create는 같은 semantic request이며 같은 bootstrap scope/request ID로 replay할 수 있다. 향후 다른 type이 실제 supported contract가 되면 같은 request ID의 다른 effective type은 conflict가 된다. 현재는 미지원 type이 fingerprint나 mutation 단계에 도달하기 전에 validation에서 거절된다.

생성된 `RoomRecord.gameType`은 canonical lifetime identity다. persistence create 경계는 지원하지 않는 값을 거부하고, replace/UoW는 기존 Room의 값을 바꾸려는 candidate를 거부한다. 현재 저장소는 process-memory이고 배포·restart 시 Room이 사라지므로 P2에는 durable pre-P2 record backfill이나 migration이 없다.

## 9. Room과 lifecycle

### 9.1 Platform Room lifecycle

개념적 lifecycle은 다음과 같다.

```text
NO_ROOM -> LOBBY -> GAME_RUNNING -> FINISHED -> ROOM_CLOSED
```

- `NO_ROOM`: 서버에 Room aggregate가 없다.
- `LOBBY`: 참가·presence·Host·start 준비를 관리한다.
- `GAME_RUNNING`: 선택된 module의 게임 instance가 실행 중이다.
- `FINISHED`: module이 종료 결과를 만들었고 Room retention이 적용된다.
- `ROOM_CLOSED`: 명시적 종료 또는 cleanup으로 더 이상 접근할 수 없다.

현재 wire phase인 `LOBBY | PLAYING | FINISHED`는 초기 Phase에서 이름이나 의미를 바꾸지 않는다. `GAME_RUNNING`은 플랫폼과 게임 lifecycle을 설명하기 위한 개념명이다.

### 9.2 Game-specific lifecycle

각 module은 자기 내부 단계와 상태를 정의한다. 플랫폼은 다음만 알아야 한다.

- instance를 시작할 수 있는가
- 현재 실행 중인가 또는 종료됐는가
- 어떤 player별 projection을 내보낼 것인가
- 다음 commit 뒤 어떤 optional server action이 필요한가

`HANGUL_TILE`의 turn, initial meld, stalemate나 `GEM_CARD`의 market/resource 상태를 Room phase로 끌어올리지 않는다.

## 10. Home과 game catalog

P5C의 Home 흐름은 다음과 같다.

```text
게임 선택 -> 방 만들기 -> 공통 Lobby -> 서버 snapshot에 따른 game renderer
```

catalog는 Web이 소유하는 static product metadata이며 server `GameRegistry`와 별개다. 현재 item은 UI에 실제 필요한 `gameType`, 중립적인 표시 이름과 짧은 설명만 가진다. server registration, player 수, start 가능 여부, renderer 또는 game rule은 catalog metadata에서 결정하지 않는다.

P7C catalog에는 실제 end-to-end 구현을 갖춘 `HANGUL_TILE`, `NUMBER_TILE` 두 항목만 있다. `GEM_CARD`, `UNKNOWN`, disabled/준비 중 card와 fake availability metadata는 존재하지 않는다. 별도 `/games`, `game:catalog` 또는 catalog snapshot discovery API도 만들지 않는다.

Home은 실제 `GameType` selection model을 사용한다. 기본 선택은 catalog의 첫 `HANGUL_TILE` item이며 두 card 모두 native semantic control의 keyboard/focus/selected-state 표현을 제공한다. create handler는 literal을 다시 hard-code하지 않고 `selectedGameType`을 pending create command로 전달한다. 이 선택 preference 자체는 local/session storage에 영구 저장하지 않는다.

직접 초대 URL로 들어온 사용자는 gameType을 아직 모르므로 일반적인 참가 화면을 본다. `room:join`은 game selection이나 `gameType`을 받지 않고, 참가 성공 후 canonical server snapshot을 기준으로 Lobby와 renderer를 선택한다. Home의 local selection은 invitation, direct Room, resume 또는 Room 내부 routing의 authority가 아니다.

## 11. 호환성 요구사항

멀티게임 migration의 모든 중간 단계는 다음을 지켜야 한다.

- 기존 `/` 및 `/room/{ROOM_CODE}` 동작을 유지한다.
- 기존 Room create/join, Host, game start, Submit/Draw/Pass, timeout, disconnect/forfeit, result 동작을 유지한다.
- session resume, replacement, reconnect, presence, idempotency, revision ordering을 유지한다.
- 기존 한글 게임의 tile privacy와 player별 rack projection을 약화하지 않는다.
- 기존 573개 test를 삭제하거나 assertion을 약화하지 않는다.
- P5C의 `room:create` additive field 뒤에도 field가 없는 legacy payload를 그대로 지원한다.
- snapshot contract 변경은 protocol version 및 client/server 배포 전략을 동반한다.
- single service, one replica, process-memory라는 현재 운영 제약은 별도 persistence Phase 전까지 그대로 명시한다.
- 배포 restart 시 Room/Game/session이 사라지는 현재 특성을 멀티게임 P0가 해결했다고 표현하지 않는다.

P5A는 이 호환성 정책 아래 새 `PlatformSnapshotV2`를 additive하게 정의했다. 기존 `StateSnapshot`과 `StateSnapshotSchema`는 이름과 의미를 바꾸지 않은 Legacy Hangul v1 contract다. `snapshotVersion: 2`는 snapshot 표현을 식별하고 realtime `protocolVersion = 1`과 별개다.

V2는 Room identity·phase·player identity/presence·Room/presence revision·server time·canonical `gameType`을 platform shell에 둔다. `gameRevision`, game state와 private rack, result는 concrete game projection에 남긴다. P5A 당시 Hangul-only였던 strict phase/game correlation은 P7B에서 Hangul과 Number 각각의 LOBBY/PLAYING/FINISHED branch로 확장됐다. Number는 V1 down-conversion 없이 V2만 사용한다.

P5A의 server mapper는 이미 검증되고 player-private한 v1 snapshot과 canonical Room `gameType`을 V2 구조로 재배치하는 transitional seam이다. game rule을 다시 계산하거나 canonical private state를 읽지 않는다. P5B는 이를 per-socket negotiation 뒤 production transport에 연결했다. capability가 없는 legacy socket은 exact V1, `[2, 1]`을 광고하는 Current Web은 V2를 같은 `state:snapshot` event에서 받는다. Web은 V2 canonical `room.gameType`을 먼저 확인해 Hangul은 pure compatibility adapter로 기존 UI에 연결하고 Number는 direct V2 renderer로 전달한다. Unsupported/future/malformed V2는 명시적인 incompatible 화면으로 차단한다. 세부 계약은 [MULTI_GAME_P5A_PLATFORM_SNAPSHOT_V2.md](./MULTI_GAME_P5A_PLATFORM_SNAPSHOT_V2.md), [MULTI_GAME_P5B_SNAPSHOT_MIGRATION.md](./MULTI_GAME_P5B_SNAPSHOT_MIGRATION.md), [NUMBER_TILE_WEB_IMPLEMENTATION.md](./NUMBER_TILE_WEB_IMPLEMENTATION.md)에 기록한다.

## 12. Production 기준선과 rollout

P0 시작 시 기준은 다음과 같다.

- branch: `master`
- production checkpoint: `abbfbb9 docs: complete railway deployment verification`
- tag: `hangul-game-v1`이며 위 checkpoint를 가리킨다.
- public URL: <https://hanglerummikub-production.up.railway.app>
- deployment: Railway single service / 1 replica
- state: process-memory
- dictionary: `test-dictionary-v1`

P2 구조 전환은 identity-only registry에 `HANGUL_TILE` 하나만 등록했다. composition root는 이 필수 registration의 누락·중복을 startup에서 fail-fast하고, Room create와 game start는 각각 legacy default와 canonical Room `gameType`의 registration을 확인한다. 이 entry는 service callback이나 state capability를 갖지 않으며 `GameModule`도 구현하지 않았다.

Legacy `StateSnapshot` V1 shape는 그대로다. P5B의 snapshot format은 Room/Player/session property가 아니라 socket handshake capability이며 reconnect마다 다시 협상한다. 같은 Room의 V1/V2 client가 각자 선택한 표현을 받는다. Legacy V1 socket이 explicit `HANGUL_TILE` Room을 만들어도 V1에는 `snapshotVersion`이나 `gameType`이 나타나지 않고, V2 socket은 `snapshotVersion = 2`와 canonical `room.gameType = HANGUL_TILE`을 받는다.

P5C의 catalog metadata는 Web bundle에만 있고 `GameRegistry`는 `{ gameType }` identity-only entry를 유지한다. Current Web의 pending create command는 acknowledgement loss retry를 위해 explicit `gameType`과 같은 `requestId`를 기존 v1 storage key 아래 잠시 보존한다. 이는 Home selection preference나 renderer authority를 저장한다는 뜻이 아니다. bound Player credential과 pending join에는 여전히 `gameType`/snapshot capability가 없고, Room 진입 뒤에는 snapshot만 권위다.

P7B는 identity-only Registry에 `NUMBER_TILE`을 추가했고 P7C가 Web catalog metadata와 exact game capability를 함께 확장했다. Number Room admission에는 connection-scoped `supportedGameTypes`의 `NUMBER_TILE` 포함과 selected snapshot V2가 모두 필요하다. Field를 보내지 않는 legacy client는 effective Hangul-only이므로 Number Room에 mutation/binding되기 전에 차단된다. Server/shared 구현 세부는 [NUMBER_TILE_SERVER_INTEGRATION.md](./NUMBER_TILE_SERVER_INTEGRATION.md)를 따른다.

## 13. 결과 모델 방향

플랫폼이 공통 결과로 요구할 가능성이 높은 최소 정보는 다음과 같다.

- result schema/version
- finished timestamp 또는 Room 종료 시점
- winner player IDs

이 최소 집합도 아직 candidate다. `NUMBER_TILE`만으로 고정하지 않고 `GEM_CARD`까지 검증하거나 명시적인 product requirement가 생긴 뒤 확정한다. 공동 우승, 무승부, 협동 성공, winner 없음도 가능성을 닫지 않는다. `score`, `rank`, `remainingRackCount`, `penaltyCost`, `forfeited`, `resources`는 game-specific projection에 둔다. 모든 게임에 numeric score나 한글 게임의 competition ranking을 강제하지 않는다.

## 14. P0에서 확정하지 않는 결정

다음 항목은 여러 실제 game implementation을 비교해야 하는 cross-game 결정이다. `NUMBER_TILE` 자체의 규칙과 protocol은 P6 rules/protocol 문서의 stable decision ID가 우선한다.

- 여러 game에 공통 command envelope를 도입할지 여부. Number v1은 확정된 game-specific `number:*` events를 사용한다.
- `gameRevision` 이름을 그대로 공통화할지 더 중립적인 state revision으로 versioning할지
- player 수 제한을 catalog metadata, module policy, server capability projection 중 어디에 둘지
- persistence의 장기 저장 형식과 migration tooling
- optional scheduled action의 공개 contract
- 플랫폼 result summary의 필수 필드
- web game renderer contract의 세부 component API

P0 문서는 이 결정들을 위한 seam과 검증 기준만 제공한다. Number-specific P6 결정이 확정됐더라도 이 항목들을 공통 platform contract로 성급히 승격하지 않는다.

## 15. P6 Number Tile rules/protocol gate

P6는 runtime 구현 전에 다음 경계를 확정했다.

- 사용자가 `ALL:A`와 consistency clarification A/A/A를 승인해 `NT-001`~`NT-044`를 `CONFIRMED`로 만들고 `number-tile-rules-v1`을 canonical ruleset으로 기록했다.
- Inventory 106장, 2~4명, rack 14장, GROUP/RUN, initial 30, whole-table rearrangement, exact Joker recovery, single-pool Draw/Pass, 90초 timer와 no overall deadline을 확정했다.
- Finish reason은 `RACK_EMPTY`, `STALEMATE`, `LAST_PLAYER_STANDING`이며 Number에는 `ALL_PLAYERS_FORFEITED`와 `TIME_LIMIT`이 없다.
- STALEMATE는 eligible/non-forfeited full no-play cycle로 판정하고 forfeited result entry는 non-forfeited 뒤에 별도 competition ranking하며 모두 `score = -penalty`를 사용한다.
- Number 전용 `Table`/`Meld`/`ProposedTable`과 player-private projection을 확정 방향으로 두고 Hangul Board/RuleEngine/TurnDraft reuse를 금지했다.
- existing platform Room/session/presence/reconnect/idempotency/serialization mechanism과 Number-specific rule/state/result를 reuse matrix로 분리했다.
- `game:start`와 protocol v1을 유지하면서 additive `number:submit`/`number:draw`/`number:pass`, V2-only projection, no Number advisory를 확정했다.
- Current snapshot capability만으로는 Hangul-only V2 Web과 Number-capable Web을 구분할 수 없으므로 `selectedSnapshotVersion === 2`와 exact `supportedGameTypes`의 `NUMBER_TILE` 포함을 create/join/resume mutation 전에 함께 확인하도록 확정했다.
- P7A, P7B와 P7C가 완료됐고 P8이 다음 stop gate다.

현재 P6/P7A/P7B/P7C 판정은 `COMPLETE`, P8은 `READY`다. Current Web bundle의 catalog와 rendering은 exact 두 game을 지원하지만 P7C checkpoint 자체는 Railway에 배포하지 않는다.

## 16. P7B Number Tile server/shared integration

P7B는 실제 두 번째 state를 추가한 뒤에도 미래 game을 추측하는 `GameModule`을 만들지 않았다.

- `RoomRecord`는 game type과 concrete state가 상관된 exact Hangul/Number union이다. In-memory persistence는 game별 clone/validation/lifecycle adapter를 명시적으로 사용하고 mismatch를 원자적으로 거절한다.
- `supportedGameTypes`는 snapshot version과 독립된 connection capability다. Omission은 Hangul-only이며 Number create/join/resume은 advertised Number + selected V2를 membership/session/presence mutation 전에 요구한다.
- Shared `game:start`는 canonical Room type으로 두 start path를 고르고, Number gameplay는 strict protocol v1 `number:submit`/`number:draw`/`number:pass`를 사용한다. Cross-game fallback은 없다.
- Number start는 2~4명 rack 14장, pool 78/64/50장, shuffled immutable order와 90초 Turn을 만든다. Timeout/recovery는 common scheduling mechanism에 연결되지만 overall game deadline은 없다.
- `PlatformSnapshotV2`는 Number LOBBY/PLAYING/FINISHED와 viewer-private rack을 지원한다. Pool은 count만, 상대 rack은 count만 공개하며 FINISHED에서도 privacy를 유지한다.
- Number command/timeout/leave 결과는 authoritative snapshot으로 전달하고 Number advisory를 추가하지 않는다. Existing Hangul V1/V2와 advisory는 유지한다.
- Home Number card, exact Web capability, decoder/renderer/editor는 P7C에서 완료됐다.

## 17. P7C Number Tile Web

P7C는 common Room shell과 canonical V2 game routing을 유지하면서 `apps/web/src/features/number-tile/`에 Number 전용 TurnDraft, editor, PLAYING/FINISHED 화면을 추가했다. Draft는 full proposed Table과 physical `tileId`, base game/revision/turn, 최대 50 history를 보존하며 Hangul Board/TurnDraft를 사용하지 않는다. Submit/Draw/Pass는 P7B strict commands와 authoritative snapshot-bearing ack만 사용하고 Number advisory를 만들지 않는다.

Home은 Hangul/Number 두 항목만 제공하지만 join payload와 `/room/{ROOM_CODE}`에는 game type이 없다. Number는 V2-only이며 incompatible projection은 fail-closed한다. Countdown은 server deadline의 display-only view이고 rule/result/privacy 계산은 server가 계속 소유한다. 상세 Web contract는 [NUMBER_TILE_WEB_IMPLEMENTATION.md](./NUMBER_TILE_WEB_IMPLEMENTATION.md), 다음 two-game 검증은 P8 roadmap을 따른다.

## 17. 완료 조건

P0는 다음 조건을 만족할 때 완료다.

- 현재 shared/server/web 코드가 네 범주로 분류되어 있다.
- 실제 file-level coupling이 기록되어 있다.
- platform과 game lifecycle, dependency 방향, 최소 module/registry 후보가 설명되어 있다.
- command, projection, persistence, scheduler, web rendering의 대안과 단계적 권고가 있다.
- P0부터 P12까지 작은 migration Phase와 각 Phase별 실행 명령이 있다.
- application source와 dependency는 바뀌지 않았다.
- 기존 typecheck, 573 tests, build, `git diff --check`가 통과한다.

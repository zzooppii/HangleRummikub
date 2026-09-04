# Multi-game Platform Specification

> 상태: P0 분석/설계 기준선  
> 작성일: 2026-09-04  
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

내부의 중립적인 game identifier 후보는 다음과 같다.

| ID | 역할 | 현재 상태 |
| --- | --- | --- |
| `HANGUL_TILE` | 기존 한글 타일 게임 | production 기준 implementation |
| `NUMBER_TILE` | 숫자 타일 게임 | 후속 rules gate 대상 |
| `GEM_CARD` | 보석·카드형 게임 | 후속 rules gate 대상 |

이 ID는 protocol, persistence, registry, telemetry에서 일관되게 사용할 수 있는 내부 식별자다. 공개 UI 명칭과 licensing은 별도 결정이며, 내부 ID에 특정 상용 게임 브랜드나 asset 이름을 결합하지 않는다.

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

### 7.3 `GEM_CARD`

세 번째 게임은 card market, resources/tokens, purchase, reserve, score처럼 전혀 다른 state와 action을 가질 수 있다. 이 게임이 Tile, Rack, Board, Submit을 전혀 사용하지 않아도 Room, Session, Presence, Reconnect, realtime transport, persistence boundary, cleanup을 재사용할 수 있어야 한다.

이 시점까지 공통으로 유지되는 표면만 검증된 platform abstraction으로 본다.

## 8. `gameType` 정책

- 사용자는 Home catalog에서 Room을 만들기 전 game을 선택한다.
- `gameType`은 Room 생성 요청에서 선택되고 서버가 검증한다.
- 생성된 Room의 `gameType`은 immutable이다.
- 저장·복구·snapshot·registry lookup의 권위는 서버의 Room record다.
- client가 보낸 `gameType`은 권위가 아니며 해당 Room의 값과 반드시 대조한다.
- invitation URL에는 Room code만 둔다. URL query/path의 game 이름으로 renderer를 선택하지 않는다.
- join, resume, state sync 이후 client는 서버 snapshot의 `gameType`으로 game client를 선택한다.
- 알 수 없거나 지원하지 않는 `gameType`은 `HANGUL_TILE`로 조용히 fallback하지 않고 game command를 차단한다.

초기 migration 동안 기존 gameType 없는 create 흐름은 서버 내부에서만 `HANGUL_TILE`로 해석할 수 있다. 이 호환 정책은 versioned contract가 도입되기 전까지 기존 URL, event 이름, DOM 동작을 보존하기 위한 임시 전략이며 영구적인 ambiguous default가 아니다.

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

장기 Home 흐름은 다음과 같다.

```text
게임 선택 -> 방 만들기 -> 공통 Lobby -> 서버 snapshot에 따른 game renderer
```

catalog는 최소한 내부 `gameType`, 표시 metadata, 사용 가능 상태를 제공한다. player 수나 feature availability를 표시할 수 있지만, client metadata가 start 가능 여부의 권위가 되어서는 안 된다.

초기에는 `HANGUL_TILE`만 enabled로 노출할 수 있다. `NUMBER_TILE`과 `GEM_CARD`는 rules gate와 구현·E2E가 끝나기 전에는 선택 가능한 production 항목으로 노출하지 않는다.

직접 초대 URL로 들어온 사용자는 gameType을 아직 모르므로 일반적인 참가 화면을 본다. 참가 성공 후 서버 snapshot을 기준으로 Lobby와 renderer를 선택한다.

## 11. 호환성 요구사항

멀티게임 migration의 모든 중간 단계는 다음을 지켜야 한다.

- 기존 `/` 및 `/room/{ROOM_CODE}` 동작을 유지한다.
- 기존 Room create/join, Host, game start, Submit/Draw/Pass, timeout, disconnect/forfeit, result 동작을 유지한다.
- session resume, replacement, reconnect, presence, idempotency, revision ordering을 유지한다.
- 기존 한글 게임의 tile privacy와 player별 rack projection을 약화하지 않는다.
- 기존 573개 test를 삭제하거나 assertion을 약화하지 않는다.
- wire contract 변경 전에는 기존 event 이름과 payload를 adapter로 그대로 지원한다.
- snapshot contract 변경은 protocol version 및 client/server 배포 전략을 동반한다.
- single service, one replica, process-memory라는 현재 운영 제약은 별도 persistence Phase 전까지 그대로 명시한다.
- 배포 restart 시 Room/Game/session이 사라지는 현재 특성을 멀티게임 P0가 해결했다고 표현하지 않는다.

## 12. Production 기준선과 rollout

P0 시작 시 기준은 다음과 같다.

- branch: `master`
- production checkpoint: `abbfbb9 docs: complete railway deployment verification`
- tag: `hangul-game-v1`이며 위 checkpoint를 가리킨다.
- public URL: <https://hanglerummikub-production.up.railway.app>
- deployment: Railway single service / 1 replica
- state: process-memory
- dictionary: `test-dictionary-v1`

초기 구조 전환은 registry에 `HANGUL_TILE` 하나만 등록하고 기존 create 요청을 그 game으로 resolve한다. catalog와 새 snapshot discriminator는 내부 경계가 검증된 뒤 별도 Phase에서 연다. production rollout 전에는 현재 한글 user journey를 smoke/E2E로 다시 검증한다.

## 13. 결과 모델 방향

플랫폼이 공통 결과로 요구할 가능성이 높은 최소 정보는 다음과 같다.

- result schema/version
- finished timestamp 또는 Room 종료 시점
- winner player IDs

이 최소 집합도 아직 candidate다. `NUMBER_TILE`만으로 고정하지 않고 `GEM_CARD`까지 검증하거나 명시적인 product requirement가 생긴 뒤 확정한다. 공동 우승, 무승부, 협동 성공, winner 없음도 가능성을 닫지 않는다. `score`, `rank`, `remainingRackCount`, `penaltyCost`, `forfeited`, `resources`는 game-specific projection에 둔다. 모든 게임에 numeric score나 한글 게임의 competition ranking을 강제하지 않는다.

## 14. P0에서 확정하지 않는 결정

다음 항목은 실제 두 번째 command/state가 준비되는 후속 gate에서 결정한다.

- 공개 wire가 game별 event namespace를 쓸지 단일 `game:command` envelope를 쓸지
- `gameRevision` 이름을 그대로 공통화할지 더 중립적인 state revision으로 versioning할지
- player 수 제한을 catalog metadata, module policy, server capability projection 중 어디에 둘지
- persistence의 장기 저장 형식과 migration tooling
- optional scheduled action의 공개 contract
- 플랫폼 result summary의 필수 필드
- web game renderer contract의 세부 component API

P0 문서는 이 결정들을 위한 seam과 검증 기준만 제공한다.

## 15. 완료 조건

P0는 다음 조건을 만족할 때 완료다.

- 현재 shared/server/web 코드가 네 범주로 분류되어 있다.
- 실제 file-level coupling이 기록되어 있다.
- platform과 game lifecycle, dependency 방향, 최소 module/registry 후보가 설명되어 있다.
- command, projection, persistence, scheduler, web rendering의 대안과 단계적 권고가 있다.
- P0부터 P12까지 작은 migration Phase와 각 Phase별 실행 명령이 있다.
- application source와 dependency는 바뀌지 않았다.
- 기존 typecheck, 573 tests, build, `git diff --check`가 통과한다.

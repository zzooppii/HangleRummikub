# 시스템 아키텍처

## 1. 목적과 설계 원칙

이 문서는 한글 루미큐브 MVP의 client/server/shared 경계, 상태 수명주기, 실시간 protocol, 원자적 검증, 재접속, 배포 및 확장 지점을 정의한다. Phase 7A에서 확정한 gameplay 수치와 정책은 [GAME_RULES.md](./GAME_RULES.md)를 규범적 source로 삼으며, Phase 7B가 필요한 exact Tile inventory와 symbol 표현은 그 전까지 architecture나 code에 고정하지 않는다.

핵심 원칙은 다음과 같다.

1. 서버가 유일한 authority다.
2. `Player` identity와 `Socket.IO Connection`을 분리한다.
3. 클라이언트의 `TurnDraft`는 Submit 전까지 서버 상태가 아니다.
4. Submit은 candidate state를 검증한 뒤 한 번만 commit한다.
5. Room, Game, transient presence는 서로 다른 단조 증가 version으로 식별한다.
6. public state와 player-private state를 분리한다.
7. domain은 React, Express, Socket.IO, 메모리 저장 방식에 의존하지 않는다.
8. storage, clock, random, dictionary, scheduler를 교체 가능한 port로 둔다.
9. 메모리 MVP는 단일 프로세스·단일 replica라는 한계를 명시한다.

## 2. 전체 구조

### 2.1 계획된 monorepo

아래는 단계적으로 구현할 논리적 구조다. Phase 6까지 최상위 workspace, browser-safe shared contract/runtime validation, server persistence/application/Socket.IO transport와 React Lobby web flow를 생성했으며, 나머지 디렉터리는 해당 Roadmap 단계에서 필요할 때 생성한다.

```text
/
├── apps/
│   ├── web/                    # React + Vite browser client
│   │   └── src/
│   │       ├── app/            # app bootstrap, routing, providers
│   │       ├── features/lobby/ # create, join, lobby, invitation UI
│   │       ├── features/game/  # board rendering and local TurnDraft UX
│   │       └── lib/            # typed socket client, session/state utilities
│   └── server/                 # Node.js + Express + Socket.IO
│       └── src/
│           ├── model/          # server-only persistence record와 value type
│           ├── transport/      # HTTP/Socket.IO adapters and runtime validation
│           ├── application/    # commands/use cases and authorization orchestration
│           ├── domain/         # Room, Game, RuleEngine, state transitions
│           ├── ports/          # repositories, clock, random, dictionary, scheduler
│           └── infrastructure/ # in-memory adapters, Socket.IO projection delivery
└── packages/
    └── shared/                 # browser-safe serialized contracts
```

실제 하위 폴더는 구현 중 필요한 만큼만 만든다. 계층을 만들기 위해 빈 추상화나 불필요한 dependency를 선행 추가하지 않는다.

### 2.2 의존성 방향

```text
apps/web ───────────────> packages/shared

server transport ───────> packages/shared
server transport ───────> server application
server application ─────> server domain
server application ─────> server ports
server infrastructure ──> server ports

server domain ──X──> React / Express / Socket.IO / storage driver / system clock
```

- `apps/web`은 서버 projection을 렌더링하고 local draft와 connection UX를 관리한다.
- `apps/server`은 command 인증, 검증, 상태 전이, scheduling, projection을 책임진다.
- `packages/shared`에는 wire format에 필요한 DTO, event contract, public enum, error code를 둔다.
- 서버 내부 entity, mutable repository state, token/hash, visibility policy상 player-private인 rack state는 shared public contract에 두지 않는다.
- TypeScript 타입 공유는 런타임 안전성을 보장하지 않는다. network boundary에서는 별도 runtime validation을 수행한다.

## 3. 책임 분리

### 3.1 Web client

Web client가 담당하는 일:

- Room 생성·참가·초대 URL·Lobby 화면
- 자신의 session credential을 안전하게 보관하고 resume에 사용
- `/`와 canonical `/room/{ROOM_CODE}` route를 browser History API로 처리
- accepted create/join의 acknowledgement 유실에 대비해 pending operation을 같은 `requestId`로 재전송
- 서버가 보낸 개인별 snapshot을 `roomRevision`, `gameRevision`, `presenceVersion`으로 적용
- public board와 자신의 rack 렌더링
- 현재 턴에만 client-only `TurnDraft` 생성·편집·reset
- command 전송, acknowledgement, loading/error/reconnect UX
- `serverTime`과 `deadlineAt`을 이용한 표시용 countdown 보정
- delta/advisory event에서 version gap 발견 시 full sync 요청

Web client가 최종 판정하지 않는 일:

- 현재 actor의 권한
- tile ownership과 tile 보존
- 낱말, initial meld, joker, 재조합의 유효성
- 실제 draw tile
- turn 종료와 다음 Player
- timeout 성립 여부
- 승자와 `FINISHED` 전이

클라이언트에서 동일한 validation을 UX 보조용으로 실행할 수는 있으나 서버 validation을 대체할 수 없다.

### 3.2 Server transport

Express/Socket.IO adapter는 다음만 담당한다.

- network payload의 runtime schema와 크기 검증
- 인증된 socket context 조회
- client command를 application command로 변환
- acknowledgement와 server event 직렬화
- protocol-level rate limiting 및 안전한 error mapping

Socket.IO handler 안에서 Room state를 직접 수정하거나 게임 규칙을 판정하지 않는다.

### 3.3 Application layer

- Room create/join/start/resume/leave use case 조정
- 인증된 actor와 command의 대상 Room 연결
- Room별 mutation 직렬화
- repository transaction/CAS 경계
- idempotency 처리
- domain validation 호출
- commit 후 player별 projection 생성과 event 발행
- Host/disconnect/retention 같은 policy 호출

### 3.4 Domain layer

- `Room`과 `Game` state machine
- Tile/rack/board/turn 불변 조건
- candidate state 생성
- 확정된 `RulesConfig` 기반 한글 조합과 게임 규칙 검증
- 다음 턴, 종료 조건, 결과 계산

Domain API는 가능한 한 plain serializable data를 받고 새 state 또는 구조화된 domain error를 반환하는 deterministic 함수로 만든다.

### 3.5 Port와 MVP adapter

| Port | 책임 | MVP 구현 | 향후 구현 |
| --- | --- | --- | --- |
| `RoomRepository` | Room 조회, code 예약, scoped revision 기반 원자적 commit, 삭제 | process memory | Redis/PostgreSQL |
| `SessionRepository` | token hash와 Player/Room binding, 만료 | process memory | Redis/PostgreSQL |
| `IdempotencyRepository` | scope/request/fingerprint 분류와 caller-driven cleanup | process memory | Redis/PostgreSQL |
| `RoomUnitOfWork` | command별로 관련 code/Room/Game/Player/session/idempotency/outbox record를 함께 바꾸는 원자 경계 | single in-memory critical section | Redis transaction/Lua 또는 PostgreSQL transaction |
| `DictionaryProvider` | 정규화된 낱말 허용 여부 | 고정 테스트 단어 목록 | versioned 사전 데이터 또는 외부 adapter |
| `Clock` | server time 제공 | system clock | fake clock in tests |
| `RandomSource` | tile shuffle/draw의 무작위성 | server random adapter | seeded test random / 보안 요구에 맞는 adapter |
| `IdGenerator` | room/player/game/turn/tile ID 생성 | process adapter | 동일 contract 유지 |
| `RoomCodeGenerator` | 짧은 code 후보 생성 | process adapter | 동일 contract 유지 |
| `SessionTokenIssuer` | opaque token 발급·hash | process adapter | managed secret/KMS 고려 가능 |
| `TurnScheduler` | active deadline마다 timeout command를 at-least-once enqueue | in-process timer + overdue sweeper | Redis-backed job/lease |
| `RealtimePublisher` | player별 projection 전달 | Socket.IO | multi-node Socket.IO adapter |

Port를 만든다는 이유만으로 Redis/PostgreSQL package를 MVP에 설치하지 않는다.

## 4. 식별자와 상태 모델

### 4.1 식별자 분리

| Identifier | 수명과 용도 |
| --- | --- |
| `roomId` | 내부의 안정적인 Room identity |
| `roomCode` | 사람이 입력·공유하는 locator. Room identity나 credential로 단독 사용하지 않는다. |
| `playerId` | Room 안에서 재접속 후에도 유지되는 Player identity |
| `socketId` | 연결마다 바뀔 수 있는 transport identity |
| `gameId` | 한 번 시작된 Game identity |
| `turnId` | timeout 및 stale command를 구분하는 Turn identity |
| `tileId` | 실제 Tile 인스턴스의 opaque하고 쉽게 열거할 수 없는 identity |
| `requestId` | client command 재전송의 idempotency key |
| `roomRevision` | membership, Host, phase 같은 canonical Room metadata commit 버전 |
| `gameRevision` | board, rack, bag, turn, result 같은 canonical gameplay commit 버전 |
| `presenceVersion` | transient socket presence projection의 순서를 나타내며 TurnDraft 동시성에는 사용하지 않는 버전 |
| `storageRevision` | 전체 Room aggregate의 lost update를 막는 server-only persistence version. wire contract에는 노출하지 않는다. |

payload가 `playerId`를 포함하더라도 actor 판정에는 사용하지 않는다. actor는 검증된 session과 server-side socket binding에서 얻는다.

### 4.2 Canonical Room 개념 모델

```text
Room
  roomId
  roomCode
  phase: LOBBY | PLAYING | FINISHED
  hostPlayerId
  players: ordered durable Player records
  game: GameState | absent
  roomRevision
  storageRevision
  createdAt / updatedAt
  retention metadata
```

`Player`에는 `playerId`, 표시 nickname, join order와 durable game participation 상태를 둘 수 있다. connection status, `socketId`, disconnect timestamp, raw session token은 domain Room에 저장하지 않고 connection/presence infrastructure에서 관리한다.

### 4.3 Canonical Game 개념 모델

```text
GameState
  gameId
  gameRevision
  immutable RulesConfig snapshot
  tilesById
  bags:
    consonants: server-ordered tileId collection
    vowels: server-ordered tileId collection
  racks: playerId -> tileId collection
  board: ordered WordGroup collection
    WordGroup:
      stable groupId
      ordered Tile placements
      syllable segmentation
      explicit Joker assignments
  playerGameStatus:
    initialMeldCompleted
    forfeit
    consecutiveOfflineTimeouts
  turnOrder: immutable shuffled playerId collection
  turn:
    turnId
    turnNumber
    activePlayerId
    startedAt
    deadlineAt
  gameStartedAt
  gameDeadlineAt
  stalemate tracking
  result: absent or server-computed result
```

- Tile은 `kind: CONSONANT | VOWEL | JOKER`와 규칙이 정한 표시/조합 정보를 가질 수 있다.
- 같은 symbol을 가진 Tile이 여러 개 있어도 `tileId`는 모두 달라야 한다.
- 하나의 `tileId`는 최종 Board 전체에 최대 한 번만 나타나며 모든 Tile은 정확히 하나의 WordGroup, rack 또는 bag 같은 허용 위치에 속해야 한다.
- WordGroup collection의 표시 순서는 UI 안정성을 위한 것이고 낱말 유효성에는 영향을 주지 않는다.
- `RulesConfig`는 최소한 rules/dictionary/inventory version, 60초 turn, 25분 Game, 시작 rack 7/7, initial meld 최소 Tile 6개·최소 2음절, timeout penalty 3개, 최대 4명과 Joker 규칙 reference를 snapshot할 수 있어야 한다.
- exact Tile inventory, symbol representation과 Joker exact symbol universe는 Phase 7B 전까지 type이나 상수로 제한하지 않는다.
- 저장 state는 plain data와 명시적인 schema/rules version을 가져야 한다. socket, timer handle, framework object를 직렬화 state에 넣지 않는다.

### 4.4 Connection과 Session state

Domain Room 밖의 connection registry는 다음 관계를 관리한다.

```text
sessionToken hash ──> roomId + playerId + session metadata
socketId ──────────> authenticated roomId + playerId
playerId ──────────> zero, one, or policy가 허용한 active socket bindings
binding ───────────> connectionGeneration and presenceVersion
```

raw `sessionToken`은 직접 credential response에서만 client에 전달하고 server에는 가능하면 hash만 저장한다. MVP browser client는 bound credential을 `sessionStorage`에 저장하며 URL, snapshot, 일반 event와 application log에는 넣지 않는다. bound session은 Room이 server memory에 존재하는 동안 유효하고 explicit leave 또는 Room cleanup에서 종료하며 별도 absolute expiry를 두지 않는다.

Phase 6 web client는 `{ protocolVersion, playerId, credential: { roomCode, sessionToken } }` 형태의 bound Player session을 `sessionStorage`에서 runtime validation한 뒤 사용한다. create/join 전에는 bootstrap credential, `requestId`, command kind와 normalized payload를 별도 pending operation으로 저장하며 성공 ack와 bound session 저장이 확인된 뒤 삭제한다. malformed JSON/schema는 폐기하고, URL Room과 저장된 `roomCode`가 다르면 해당 credential을 자동 전송하지 않는다.

MVP duplicate connection policy는 `single-primary`다. 각 binding은 server-only `connectionGeneration`을 가지며 새 socket의 resume이 성공하면 generation이 증가하고 이전 socket의 Room/gameplay command 권한이 끝난다. 늦게 도착한 이전 socket의 disconnect가 새 연결의 presence를 offline으로 되돌리거나 reconnect grace/Host policy를 시작하지 못하게 한다.

Phase 5의 process-local `ConnectionRegistry`는 `socketId → current authenticated binding`과 `(roomId, playerId) → primary socket`을 양방향으로 관리한다. 새 Player binding과 offline Player의 resume, current primary disconnect처럼 공개 presence가 실제로 전이할 때만 Room별 `presenceVersion`을 증가시킨다. 이미 `CONNECTED`인 Player의 primary 교체와 교체된 socket의 늦은 disconnect는 version을 증가시키지 않는다. 이 registry와 version은 `RoomRecord`에 저장하지 않는다.

### 4.5 Scoped version 규칙

- wire의 `roomRevision`, `gameRevision`, `presenceVersion`은 0 이상의 safe integer다. Game 부재는 revision `0`이 아니라 `gameRevision: null`로 표현한다.
- Lobby join/leave, Host 변경, phase 변경처럼 durable Room metadata가 바뀌면 `roomRevision`을 증가시킨다.
- board, racks, bag, turn, result가 바뀌면 `gameRevision`을 증가시킨다.
- game start/finish처럼 두 영역을 함께 바꾸는 command는 하나의 unit-of-work에서 필요한 두 version을 함께 증가시킨다.
- 전체 aggregate를 저장하는 adapter는 모든 canonical write에서 server-only `storageRevision`을 CAS하고 증가시킨다. 두 scoped version만으로 서로의 field를 덮어쓰지 않는다.
- storage가 scope별 partial update를 지원하더라도 서로 영향을 주는 invariant와 phase 전이는 `RoomUnitOfWork`로 묶는다.
- socket 연결 변화는 Room/Game을 변경하지 않는다. 공개 상태가 `OFFLINE ↔ CONNECTED`로 실제 전이한 경우에만 `presenceVersion`을 증가시키며, connected primary 교체와 stale disconnect는 증가시키지 않는다.
- reconnect grace 만료 후 실제 Player 제거, Host 변경, 기권처럼 policy가 canonical 결과를 만들 때만 관련 Room/Game version을 증가시킨다.
- `TurnDraft`와 `turn:submit`의 optimistic concurrency는 `gameRevision`을 기준으로 한다. 단순 presence 변화나 unrelated Lobby metadata가 draft를 stale로 만들지 않는다.
- full snapshot은 세 version을 함께 제공한다. client는 각 version 차원을 비교해 gameplay와 presence를 서로 덮어쓰지 않는다.

## 5. 상태 projection

canonical state를 그대로 client에 보내지 않는다.

```text
Canonical Room/Game
        │
        ├── projectFor(player A) ──> public state + A rack/private fields
        ├── projectFor(player B) ──> public state + B rack/private fields
        └── projectFor(player C) ──> public state + C rack/private fields
```

Phase 2 shared wire snapshot:

```text
StateSnapshot
  protocolVersion
  versions:
    roomRevision
    gameRevision: revision | null
    presenceVersion
  serverTime
  room: PublicRoomView             # roomId, roomCode, phase, ordered players
    players: PublicPlayerView[]    # playerId, nickname, isHost, connectionStatus
  self: PrivatePlayerView
```

- Lobby에서 Game이 아직 없으면 `StateVersions.gameRevision`은 `null`이며 `0` sentinel로 부재를 나타내지 않는다.
- `PublicPlayerView.connectionStatus`는 `CONNECTED | OFFLINE`이고 `PublicRoomView.players` 배열 순서가 공개 표시 순서다.
- Phase 2의 `PrivatePlayerView`에는 현재 `playerId`만 있다. gameplay DTO를 실제로 추가하는 Phase에서는 본인 rack 상세, initial meld 완료 상태, connection 상태와 forfeit 여부를 self projection에 추가하며 raw credential은 넣지 않는다.
- Phase 7A visibility policy에 따라 future public gameplay projection에는 Board 전체, active Player, turn deadline/order, 각 Player의 rack 개수·initial meld 요약, Game phase/result와 자음·모음 bag 잔여 개수를 포함한다.
- 상대 rack 상세, bag 순서, future draw Tile과 server random state는 public DTO에 넣지 않는다. `sessionToken`, token hash, `socketId`, `connectionGeneration`, bootstrap credential, server-only `storageRevision`, repository 내부 정보는 public/private 어느 snapshot에도 넣지 않는다.
- Socket.IO room 전체로 동일 snapshot을 broadcast하지 않는다. 공개 변화 알림 뒤 각 Player에게 projection을 보내거나, 처음부터 socket별 snapshot을 emit한다.

MVP는 patch protocol보다 full snapshot을 우선한다. 최대 4명 규모에서는 단순성과 복구 가능성이 더 중요하다. 이후 측정 결과가 필요할 때 scoped-version delta를 추가할 수 있다.

## 6. Room lifecycle

Room의 게임 phase와 메모리 보존 lifecycle은 분리한다.

```text
[없음]
   │ room:create + code reservation
   ▼
 LOBBY ───── game:start ─────> PLAYING ───── end condition ─────> FINISHED
   │                              │                                  │
   │ create/join/resume           │ no new join; resume 및            │ gameplay 금지; resume 및
   │                              │ Room command는 policy에 따름      │ Room command는 policy에 따름
   └──────────── retention/empty/expiry policy에 따라 별도 삭제 ─────┘
```

### 6.1 Create

1. client가 먼저 `session:bootstrap`으로 server-issued high-entropy credential을 받고 안전하게 보관한다.
2. nickname payload와 bootstrap session을 runtime 검증한다.
3. 내부 `roomId`, Host `playerId`와 완성된 candidate Room을 생성한다.
4. `RoomCodeGenerator`로 후보를 만든다.
5. `RoomUnitOfWork`가 normalized code 예약, Room/Host 생성, bootstrap session의 Player binding, pre-auth `requestId` 결과를 한 번에 commit한다.
6. code 충돌이면 아무 partial state도 남기지 않고 최대 10개의 후보를 시도한다.
7. 10개 후보가 모두 충돌하면 안정적인 public error `ROOM_CODE_EXHAUSTED`를 반환한다.
8. Phase 4 application core는 최소 non-secret Room/Player 결과를 반환한다. current socket binding과 개인별 snapshot 전달은 Phase 5 transport가 담당하며, raw token은 bootstrap 단계에서 client가 이미 받았으므로 create 결과에 다시 넣지 않는다.

canonical code는 `ABCDEFGHJKMNPQRSTUVWXYZ23456789` alphabet의 uppercase ASCII 6자리다. 사용자 입력은 trim 후 uppercase로 정규화하고 같은 alphabet으로 검증한다. code 재사용 대기시간은 계속 미확정이다.

### 6.2 Join

1. client가 `session:bootstrap`으로 credential을 확보한 뒤 code, nickname, bootstrap session을 정규화·검증한다.
2. Room을 조회하고 `LOBBY`인지 확인한다.
3. 정원이 4명 미만인지 서버에서 확인한다.
4. application은 Room별 직렬화 경계 안에서 최신 Room을 다시 읽어 phase, 정원, nickname 중복을 검증한다.
5. `RoomUnitOfWork`가 Room CAS, Player 추가, bootstrap session binding, pre-auth idempotency 결과, `roomRevision` 증가를 한 번에 commit한다.
6. 모든 client에 각자의 최신 projection을 보내는 일은 Phase 5 transport가 담당한다.

정원 확인·추가와 session binding은 하나의 원자적 operation이어야 한다. 어느 단계가 실패해도 ghost Player, 회수할 수 없는 Room, 새는 code reservation, stale session을 남기지 않는다. MVP scope 결정으로 `PLAYING` 이후 새 Player 참가는 거절하며 기존 Player의 `session:resume`과 구분한다. 향후 중도 참가 지원은 별도 규칙·migration 설계 없이는 추가하지 않는다.

### 6.3 Host와 leave/disconnect

- Host는 `hostPlayerId`가 가리키는 Player 역할이다. 현재 socket이 Host인 것이 아니다.
- Host 권한은 명시적으로 허용된 Room/Lobby command에만 적용하며 turn ownership, tile ownership, validation, 승패 판정을 우회하지 못한다.
- disconnect는 connection registry와 presence만 바꾸며 Player나 rack을 삭제하지 않는다.
- 명시적 leave는 사용자가 의도한 command이며 disconnect와 다른 policy를 거친다.
- LOBBY Host의 explicit leave는 당시 CONNECTED Player 중 가장 낮은 `joinOrder`에게 Host를 즉시 이전한다.
- LOBBY Host disconnect는 60초 resume grace를 시작한다. 계속 OFFLINE이면 당시 CONNECTED Player 중 가장 낮은 `joinOrder`에게 이전하고, 대상이 없으면 기존 Host identity를 유지한다.
- grace 뒤 대상이 없어 이전하지 못했으면 eligible Player가 생길 때 재평가한다. 한 번 이전된 Host는 이전 Host reconnect만으로 자동 복원하지 않는다.
- PLAYING에서 Host 역할은 gameplay authority에 특별한 효과가 없고 explicit leave는 일반 Player와 같이 forfeit다.
- 이 시간 기반 조건은 `HostSuccessionPolicy` 같은 application/domain 경계에 구현하고 socket handler에 흩뜨리지 않는다.
- 모든 Player가 offline이거나 Room이 `FINISHED`인 경우의 삭제는 별도 retention policy가 결정한다.

## 7. Game lifecycle

### 7.1 Start

`game:start` command는 Room mutation 경계 안에서 다음을 검증한다.

- session이 유효하고 actor가 `hostPlayerId`와 같은가
- Room phase가 `LOBBY`인가
- 등록 Player 수가 2~4명인가
- 규칙상 필요한 추가 시작 조건이 충족되는가
- 이미 처리한 `requestId`가 아닌가

성공 시 서버는 확정된 `RulesConfig` snapshot을 Game에 연결하고, Player 목록을 server-side `RandomSource`로 한 번 shuffle해 immutable `turnOrder`를 만든다. 모든 Tile에 `tileId`를 부여하고 자음·모음 bag에서 각 Player에게 7개씩 배분한 뒤 turnOrder 첫 Player의 `turnId`, `startedAt`, `deadlineAt = startedAt + 60초`와 `gameDeadlineAt = gameStartedAt + 25분`을 만들고 Room을 `PLAYING`으로 한 번에 commit한다.

실제 Tile inventory, Joker의 시작 배분 방식과 disconnected Player가 있는 상태의 시작 허용 여부는 Phase 7B 또는 남은 policy 결정이 선행되어야 한다. 그 전에는 `game:start`를 구현하지 않는다.

### 7.2 Playing

- Room mutation lane에서 검증된 application command만 canonical gameplay state를 바꾼다. 여기에는 accepted Player command와 확정된 policy가 생성한 timeout/disconnect server command가 포함될 수 있다.
- 모든 gameplay mutation은 current `gameId`, `turnId`, `gameRevision`을 다시 확인한다.
- client draft 동작은 mutation으로 취급하지 않는다.
- invalid Submit은 state를 바꾸거나 turn을 끝내지 않으며 deadline 전까지 다시 Submit할 수 있다.
- accepted initial meld 또는 normal Submit은 turn을 종료한다. normal Submit은 actor rack Tile을 최소 하나 사용해야 하고 모든 기존 Board Tile을 보존해야 한다.
- 일반 draw는 Player가 자음·모음 bag을 선택하고 서버가 Tile 하나를 선택한 뒤 turn을 종료한다. 선택한 bag만 비었다면 상태를 바꾸지 않고 다른 bag 선택을 요구하며, 두 bag이 모두 비어야 no-draw turn end가 가능하다.
- timeout은 canonical Board를 바꾸지 않고 server-random bag 선택으로 최대 penalty Tile 3개를 지급한 뒤 turn을 넘긴다.
- 유효한 결과를 commit한 뒤 다음 turn/deadline, offline-timeout streak, stalemate progress 또는 result를 함께 계산하고 하나의 commit에 포함한다.
- timeout scheduler callback 자체는 state를 직접 바꾸지 않고 application command를 enqueue한다.

### 7.3 Finished

- server-side RuleEngine이 rack-empty, 25분 Game deadline, stalemate 또는 active non-forfeit Player 1명이라는 확정 종료 조건을 만족했다고 판정할 때만 `FINISHED`로 전이한다.
- 결과, 종료 사유, 마지막 `gameRevision`과 `FINISHED` phase 전이는 하나의 unit-of-work에 포함한다.
- `FINISHED`에서는 gameplay mutation을 거절한다. snapshot/resume과 별도의 leave/retention command 허용 여부는 Room policy가 결정한다.
- rematch, Room 재사용, 결과 보존 기간은 현재 scope에서 미확정이며 임의 구현하지 않는다.

## 8. Connection과 reconnection

### 8.1 Bootstrap과 최초 session binding

create/join mutation 전에 server는 `session:bootstrap`의 직접 응답으로 raw credential을 한 번 발급한다.

```text
opaque high-entropy sessionToken
  -> token hash
  -> UNBOUND bootstrap session + 5-minute expiry
  -> create/join atomic commit에서 BOUND(roomId, playerId)에 one-time promotion
```

- bootstrap ack가 유실되면 아직 Room/Player mutation이 없으므로 client는 새 bootstrap을 요청하고 orphan bootstrap은 TTL로 정리한다.
- `RoomUnitOfWork`는 `UNBOUND → BOUND(roomId, playerId)` conditional transition을 정확히 한 번만 허용한다. 같은 bootstrap token으로 서로 다른 create/join request가 경쟁하면 하나만 성공한다.
- 이미 `BOUND`인 token에는 정확히 일치하는 이전 request의 idempotent replay 또는 `session:resume`만 허용하고, 다른 `requestId`의 create/join은 거절한다.
- token을 받은 뒤의 `room:create`/`room:join`은 bootstrap scope의 `requestId`로 idempotent하다.
- create/join commit 후 ack가 유실돼도 같은 token과 request ID로 이전의 non-secret result를 다시 받거나 `session:resume`할 수 있다. 새 Room/ghost Player를 만들지 않는다.
- 이미 Player session으로 promotion된 token이 같은 create/join request ID와 payload를 재전송한 경우에는 신규 mutation보다 저장된 idempotency result 조회를 먼저 허용한다.
- pre-auth idempotency result에는 `roomCode`, `playerId`, scoped versions 같은 non-secret data만 저장하고 raw token을 재저장하지 않는다.
- client는 create/join을 보내기 전에 bootstrap token과 `requestId`를 함께 browser-side session state에 기록하고, terminal ack 또는 명시적 abandon 전까지 같은 pair로 retry한다.
- invitation URL에는 `roomCode`만 넣는다.
- server가 raw token을 client로 전송하는 경우는 bootstrap 또는 명시적 rotation의 직접 credential 응답뿐이다. `state:snapshot`, `state:sync`, 일반 ack/event, query string, analytics, application log에 넣지 않는다.
- nickname이나 room code만으로 기존 Player를 복구하지 않는다.
- bootstrap credential은 server time 기준 발급 후 5분 미만일 때만 유효하고 만료 시각부터 invalid다.
- create/join 성공 시 credential은 정확히 한 Room/Player에 bound된다. bound session은 해당 Room이 memory에 존재하는 동안 유효하며 explicit leave 또는 Room cleanup에서 종료하고 MVP absolute expiry는 없다.
- MVP web client는 bound credential을 `sessionStorage`에 저장한다. 같은 tab의 refresh와 일시 단절은 복구할 수 있지만 tab/browser session 종료 뒤 복구는 보장하지 않는다.

### 8.2 Resume flow

```text
Browser                    Socket transport          Session/Application        Room
   │ connect                     │                          │                    │
   │ session:resume(token,       │                          │                    │
   │ roomCode, lastVersions) ───>│ validate envelope       │                    │
   │                             │─────────────────────────>│ verify token hash  │
   │                             │                          │ bind new socket    │
   │                             │                          │ update presence ──>│
   │                             │                          │ projectFor(player) │
   │<──────── session ack + authoritative full snapshot ───────────────────────│
```

1. server는 token이 해당 Room/Player에 bind되어 있고 유효한지 검증한다.
2. 새 `socketId`를 인증된 `playerId`에 연결한다.
3. `single-primary` 정책을 적용하고 새 `connectionGeneration`을 발급한다.
4. Player presence를 갱신하되 gameplay state는 임의 변경하지 않는다.
5. client의 `lastSeenVersions`과 무관하게 MVP에서는 최신 full snapshot을 보낼 수 있다.
6. client는 local draft를 자동으로 authority로 승격하지 않는다. canonical `gameRevision`이 달라졌다면 reset 또는 사용자 안내가 필요하다.

같은 bound session의 새 resume이 성공하면 새 socket만 primary가 되고 이전 socket의 Room/gameplay command 권한은 끝난다. 이전 socket에는 `session:replaced`와 `NEW_PRIMARY_CONNECTION` reason을 전달할 수 있지만 권한 회수는 notification 전달 성공에 의존하지 않는다. credential 검증에 실패한 resume은 기존 primary를 교체하지 않는다.

### 8.3 Disconnect flow

`socket.disconnect`가 발생하면:

1. connection registry에서 정확히 해당 `socketId`/`connectionGeneration` binding만 제거한다.
2. disconnect된 binding이 여전히 current `connectionGeneration`인지 재검사한다.
3. 더 새 primary binding이 있으면 presence를 offline으로 바꾸거나 grace policy를 시작하지 않는다.
4. current primary가 사라졌을 때만 `presenceVersion`을 증가시킨다. Phase 5의 process-local registry는 `disconnectedAt`을 저장하지 않으며 Player 자체도 삭제하지 않는다.
5. 다른 Player에게 policy가 허용한 connection status projection을 보낸다.
6. 현재 turn timer와 Game timer는 계속 진행하며 client disconnect 자체가 timer callback을 취소하지 않는다.
7. 검증된 current presence를 기준으로 Host 또는 Player disconnect policy를 application service에 enqueue한다.

PLAYING Player가 authoritative OFFLINE 상태에서 연속 두 번 자신의 turn timeout을 맞으면 두 번째 penalty 뒤 forfeit한다. 성공적인 resume은 이 연속 횟수를 reset한다. LOBBY Host는 60초 grace 뒤 C-19의 승계 정책을 적용한다. canonical forfeit와 Host 변경은 connection event가 직접 수행하지 않고 검증된 server command로 처리한다.

### 8.4 복구할 수 없는 경우

메모리 MVP에서 server process가 restart/redeploy되어 Room이나 session이 사라지면 resume할 수 없다. 이 경우 server는 `ROOM_NOT_FOUND` 또는 `SESSION_NOT_FOUND`를 명확히 응답하고 client는 stale credential을 정리한 뒤 사용자에게 새 Room이 필요함을 알려야 한다.

네트워크 재접속과 process-level durability를 같은 보장으로 표현하지 않는다.

Phase 5의 composition root는 `createApplicationRuntime()` 호출마다 독립적인 in-memory persistence, application service, system adapter, mutation executor, connection registry와 projector를 조립한다. `createHttpServer()`가 만든 한 HTTP/Socket.IO server 안에서는 모든 socket이 이 runtime 하나를 공유하며, module import만으로 process-global state를 생성하지 않는다. 새 server/runtime을 만들면 이전 process-memory Room과 session을 resume할 수 없다.

## 9. Socket.IO protocol 개념

Phase 5는 아래 event 중 `session:bootstrap`, `room:create`, `room:join`, `session:resume`, `state:sync`의 browser-safe wire contract와 Socket.IO listener를 실제로 연결했다. 그 밖의 event와 gameplay command는 해당 Roadmap 단계에서 구현한다.

첫 `protocolVersion`은 `1`이다. 모든 Phase 2 client command가 이를 명시하며 server는 호환 가능한 version만 session/bootstrap/resume command에 허용한다. 구형 client에는 secret 없는 `INCOMPATIBLE_PROTOCOL` 응답과 향후 reload/update UX를 제공한다.

### 9.1 Command envelope와 acknowledgement

```text
ClientCommand<TPayload, TKind>
  kind
  protocolVersion
  requestId
  payload: TPayload

RoomVersionedClientCommand<TPayload, TKind>
  ClientCommand fields + required expectedRoomRevision

GameVersionedClientCommand<TPayload, TKind>
  ClientCommand fields + required expectedGameRevision

TurnClientCommand<TPayload, TKind>
  GameVersionedClientCommand fields + required turnId

StateVersions
  roomRevision
  gameRevision: revision | null
  presenceVersion

UnscopedAck<T>        # bootstrap 또는 Room 생성 전 결과
  scope: UNSCOPED
  requestId
  ok
  serverTime
  ok: true + data / ok: false + error

RoomScopedAck<T>
  scope: ROOM
  requestId
  ok
  versions: StateVersions
  serverTime
  ok: true + data / ok: false + error

CommandAck<T> = UnscopedAck<T> | RoomScopedAck<T>
```

- authenticated command의 `requestId`는 Room/Player 범위의 idempotency key다. pre-auth bootstrap/create/join은 별도 bootstrap scope를 사용한다.
- create/join에는 client-supplied `expectedRoomRevision`이 없다. application은 Room별 직렬화 경계에서 최신 state의 phase·정원·nickname을 다시 검증하고, `RoomUnitOfWork`의 `roomRevision`/`storageRevision` CAS와 conditional session promotion으로 경쟁을 막는다.
- 같은 `requestId`와 다른 payload가 오면 재사용 오류로 거절한다.
- ack는 command 요청자에게 결과를 알리고, canonical state 변화는 player별 snapshot/event로 동기화한다.
- Phase 5의 create/join/resume/sync 성공 ack는 Room-scoped이며 `data: { snapshot: StateSnapshot }`을 가진다. Room scope를 확정할 수 없는 실패는 unscoped이고, 유효한 client `requestId`조차 읽을 수 없는 malformed command만 `requestId: null`인 명시적 uncorrelated `INVALID_PAYLOAD` failure를 사용한다.
- runtime ack schema는 success `data`를 `unknown`으로 통과시키지 않는다. `createUnscopedAckSchema(dataSchema)`, `createRoomScopedAckSchema(dataSchema)`, `createCommandAckSchema(dataSchema)`에 command별 data schema를 전달하며, bootstrap의 직접 credential 응답은 `BootstrapSessionAckSchema`로 검증한다.
- client가 보낸 timestamp는 deadline 판정에 사용하지 않는다.
- Phase 2 error object는 `code`, 안전한 `message`, `recoverable`만 가지며 stack trace, secret과 internal exception shape를 제외한다.

Room에 속한 server event는 다음 공통 envelope를 사용한다.

```text
RoomServerEvent<T>
  eventId
  kind
  versions: StateVersions
  serverTime
  payload: T

UnscopedServerError
  eventId
  kind: server:error
  serverTime
  error
```

bootstrap ack와 Room을 찾기 전의 오류에는 존재하지 않는 version을 0 같은 sentinel로 만들지 않고 unscoped variant를 사용한다. `state:snapshot`만 client state를 교체하는 authoritative message다. `turn:started`, `game:finished`, `player:connection-changed` 같은 event는 UX를 위한 advisory notification이며 같은 version의 snapshot보다 우선하지 않는다.

### 9.2 예상 client → server event

| Event | 인증 | 목적 |
| --- | --- | --- |
| `session:bootstrap` | 없음 | Room mutation 전에 server-issued bootstrap credential 발급 |
| `room:create` | bootstrap credential | nickname으로 Room과 Host session 생성 |
| `room:join` | bootstrap credential | roomCode와 nickname으로 Lobby 참가 |
| `session:resume` | token | 기존 Player에 새 socket bind |
| `state:sync` | session | 최신 player-specific full snapshot 요청 |
| `room:leave` | session | 명시적 퇴장 요청. 허용 동작은 policy에 따름 |
| `game:start` | Host session | `LOBBY`에서 Game 시작 |
| `turn:submit` | active Player session | proposed board 전체 제출 |
| `turn:draw` | active Player session | 확정된 draw 규칙 실행 |

`turn:draw`는 선택한 CONSONANT/VOWEL bag에서 서버가 Tile 하나를 가져오고 turn을 종료한다. 일반 PASS command는 두 bag에 Tile이 남아 있는 동안 제공하지 않는다. 두 bag이 모두 empty일 때 허용하는 no-draw turn end의 exact transport shape는 Phase 14에서 `turn:draw`와 구분 가능한 최소 contract로 정하되, 별도 일반 PASS로 확대하지 않는다.

### 9.3 예상 server → client event

| Event | 목적 |
| --- | --- |
| `state:snapshot` | 해당 Player에게 허용된 최신 full state 전달 |
| `state:changed` | 새 scoped version이 있음을 알리고 필요 시 snapshot 동기화 유도 |
| `player:connection-changed` | policy가 공개를 허용한 presence 상태 갱신 |
| `turn:started` | 새 turnId와 server deadline 알림 |
| `game:finished` | server-computed result와 종료 사유 알림 |
| `session:replaced` | duplicate connection policy로 기존 socket 권한이 끝났음을 알림 |
| `room:closed` | retention/운영 policy에 따른 Room 종료 알림 |
| `server:error` | 특정 command ack에 묶이지 않은 복구 가능한 transport/server 오류 |

MVP에서는 독립 event 수를 줄이고 `state:snapshot`을 중심으로 구현할 수 있다. advisory event는 state source가 아니며 transport 도착 순서 대신 envelope의 scoped versions로 해석한다.

### 9.4 Scoped version 처리

- client는 `roomRevision`, `gameRevision`, `presenceVersion`을 각각 비교한다.
- Phase 6 Lobby reducer는 incoming full snapshot의 모든 relevant version이 current와 같거나 새로우면 적용하고, 모두 같거나 오래된 vector는 유지/무시한다. 일부는 새롭고 일부는 오래된 비교 불가능 vector는 임의 merge하지 않고 `state:sync`를 요청한다.
- full snapshot은 중간 version이 없어도 그 자체가 완전하므로 최신 version vector라면 직접 적용한다.
- delta를 향후 도입하거나 advisory event만 먼저 받아 version gap이 생기면 `state:sync`를 요청한다.
- 같은 `gameRevision`이어도 더 새 `presenceVersion`을 가진 snapshot은 presence 부분을 적용할 수 있다.
- 더 새 `gameRevision`을 적용해도 더 오래된 `presenceVersion`으로 presence를 되돌리지 않는다.
- reconnect 후 server는 최신 full snapshot으로 client를 회복시킨다.
- Socket.IO의 자동 재연결이 application command의 exactly-once 실행을 보장한다고 가정하지 않는다.
- accepted command의 결과는 제한된 idempotency cache에 보존해 중복 적용을 막는다.

### 9.5 Error code 범주

최소한 다음처럼 client가 안정적으로 분기할 수 있는 code가 필요하다.

- 입력/인증: `INVALID_PAYLOAD`, `INCOMPATIBLE_PROTOCOL`, `UNAUTHENTICATED`, `SESSION_NOT_FOUND`
- Lobby 입력: `NICKNAME_INVALID`, `NICKNAME_TAKEN`, `ROOM_CODE_INVALID`, `ROOM_CODE_EXHAUSTED`
- Room: `ROOM_NOT_FOUND`, `ROOM_FULL`, `ROOM_NOT_JOINABLE`, `HOST_ONLY`
- State: `INVALID_PHASE`, `STALE_ROOM_REVISION`, `STALE_GAME_REVISION`
- Tile security boundary: `INVALID_TILE_ACCESS`
- Idempotency: `REQUEST_ID_REUSED`
- Server: `TEMPORARILY_UNAVAILABLE`, `INTERNAL_ERROR`

내부 예외 message나 stack trace를 그대로 보내지 않는다. gameplay 세부 error code는 해당 규칙과 command를 구현하는 단계에서만 추가한다.
존재하지 않는 Tile과 actor가 볼 수 없거나 소유하지 않은 Tile은 외부에 `INVALID_TILE_ACCESS`처럼 같은 범주의 오류로 응답해 private Tile 존재 여부를 oracle로 만들지 않는다. server 내부 진단은 secret이 없는 구조화 log에서만 더 세분화할 수 있다.

## 10. TurnDraft → Submit → validation → commit

### 10.1 Local TurnDraft

`TurnDraft`는 특정 canonical `gameRevision`의 board와 자신의 rack view를 바탕으로 만든 client-only working copy다.

- 확정된 board model에 따른 타일 배치 편집과 undo/reset은 network mutation이 아니다.
- draft는 일시적으로 invalid할 수 있으며 server는 Submit된 최종 결과만 authoritative하게 검사한다.
- 현재 active Player만 편집하고 draft를 다른 Player에게 realtime broadcast하지 않는다.
- 다른 `gameRevision`을 받으면 draft를 자동 merge한다고 가정하지 않는다. MVP는 안전한 reset과 명확한 안내를 우선한다. `presenceVersion` 변화만으로 draft를 버리지 않는다.
- draft에는 visibility policy상 actor에게 허용되지 않은 rack이나 bag data가 존재하지 않는다.

권장 `turn:submit` payload는 다음 정보만 포함한다.

```text
requestId
expectedGameRevision
turnId
proposedBoard:
  ordered WordGroup collection
  stable groupId and ordered tileId placements
  syllable segmentation and explicit Joker assignments
```

client가 계산한 next turn, rack, bag, score, winner는 제출하지 않거나 모두 무시한다.

### 10.2 원자적 validation pipeline

모든 mutation은 Room별 serialized command queue 또는 동등한 exclusive unit-of-work를 통과한다.

```text
receive and timestamp
        │
        ▼
runtime payload validation
        │
        ▼
authenticate session → derive actor
        │
        ▼
enqueue in room mutation lane
        │
        ▼
idempotency / room / phase / turn / deadline / gameRevision checks
        │
        ▼
build candidate from canonical state
        │
        ▼
tile existence / uniqueness / conservation / ownership
        │
        ▼
RulesConfig / Hangul composition / DictionaryProvider validation
        │
        ├── failure ──> discard candidate; unchanged state/gameRevision; error ack
        │
        ▼
derive rack, board, meld state, rules-defined continuation/next turn/result
        │
        ▼
atomic accepted-result + state CAS:
  expected gameRevision and server-only storageRevision
  → affected gameRevision/roomRevision and storageRevision + 1
        │
        ▼
publish player-specific snapshots; retry/resync on delivery failure
```

검증 순서는 값싼 보안·구조 검사를 먼저 하고 domain/사전 검사를 뒤에 두되, 어느 단계도 commit 전 live state를 변경하지 않는다.

### 10.3 필수 검증

1. payload schema, collection count, 문자열/배열 크기가 허용 범위인가
2. session이 유효하고 socket이 해당 Player에 bind되어 있는가
3. Room과 Game이 존재하고 phase가 `PLAYING`인가
4. `requestId`가 신규인지 또는 동일 payload의 안전한 retry인지
5. actor가 canonical `activePlayerId`인가
6. `turnId`가 현재 turn과 같은가
7. server가 기록한 command 수신 시각이 `receivedAt < deadlineAt`을 만족하는가
8. `expectedGameRevision`이 현재 `gameRevision`과 같은가
9. proposed board의 모든 `tileId`가 존재하고 한 번만 나타나는가
10. 기존 board tile이 규칙에 반해 사라지거나 rack으로 돌아가지 않았는가
11. board에 새로 들어온 tile이 모두 actor rack 소유인가
12. 다른 Player rack 또는 bag의 tile을 참조하지 않았는가
13. joker assignment가 확정된 규칙을 만족하는가
14. 자모 조합과 board에서 규칙상 판정 대상이 되는 모든 낱말이 유효한가
15. `DictionaryProvider`가 정규화된 word를 허용하는가
16. initial meld와 rearrangement 제약이 충족되는가
17. commit 후 tile conservation과 모든 domain invariant가 유지되는가

검증 실패 시 authoritative board, racks, bag, turn, timer, `gameRevision`은 그대로여야 한다.

### 10.4 Commit과 논리적 rollback

실제 live state를 수정한 뒤 되돌리는 방식은 사용하지 않는다.

- immutable 또는 격리된 candidate를 만든다.
- 모든 validation, 결과 계산, projection 직렬화 가능성 검사가 성공한 뒤 repository가 `gameRevision`을 조건으로 state와 accepted idempotency record를 한 번에 교체한다.
- repository commit은 application이 read한 server-only `storageRevision`도 함께 CAS해 unrelated Room write를 덮어쓰지 않는다.
- storage CAS가 경쟁으로 실패하면 최신 aggregate를 다시 읽는다. `gameRevision` 또는 적용되는 authorization/phase가 바뀌었으면 안전하게 거절하고, game state가 그대로인 unrelated metadata change뿐이면 candidate를 다시 만들고 전체 검증 후 bounded retry할 수 있다.
- Submit/timeout이 종료 조건을 만들면 `gameRevision`, `roomRevision`, `storageRevision`과 `FINISHED` result를 같은 commit에서 갱신한다.
- CAS가 실패하면 candidate를 버리고 `STALE_GAME_REVISION`으로 처리한다.
- 실패 시 candidate 폐기가 곧 rollback이며 별도의 역연산을 수행하지 않는다.
- commit 후에만 realtime event를 발행한다.
- canonical commit이 성공한 뒤 ack 또는 publish가 실패해도 mutation을 실패한 것으로 되돌려 말하지 않는다. 해당 command는 이미 성공이며, idempotent retry나 `state:sync`가 committed version을 회복한다.
- post-commit delivery failure는 log/metric과 bounded retry 대상으로 처리하고 game state rollback의 이유로 사용하지 않는다.

DB 도입 후 accepted idempotency record와 outbox는 state와 같은 transaction에 넣는다. 이를 통해 commit과 event publish 사이의 process failure를 복구한다.

### 10.5 Idempotency

- client는 논리적 command마다 새 `requestId`를 만든다.
- server는 Room/Player 범위에서 request ID, payload fingerprint, terminal result를 제한된 기간 보관한다.
- accepted mutation의 idempotency record는 canonical state commit과 같은 atomic unit에 포함한다. state만 commit되고 retry record가 빠지는 창을 만들지 않는다.
- mutation 없는 rejected result는 별도 bounded cache에 둘 수 있지만 canonical state를 바꾼 것처럼 기록하지 않는다.
- 같은 ID와 같은 payload의 retry는 이전 ack를 돌려주고 다시 mutate하지 않는다.
- 같은 ID와 다른 payload는 `REQUEST_ID_REUSED`로 거절한다.
- 특히 draw, start, submit, timeout처럼 타일이나 turn을 바꾸는 command는 반드시 idempotent해야 한다.

cache 크기와 TTL은 운영 정책으로 정하지만, active Room의 정상적인 retry window보다 짧아 correctness를 깨지 않게 한다.

### 10.6 Submit과 timeout 경합

`TurnScheduler`는 `roomId`, `gameId`, `turnId`, 예상 `gameRevision`, `deadlineAt`을 포함한 timeout command를 enqueue한다.

- canonical `deadlineAt`이 authority이며 timer handle 자체는 authority가 아니다.
- 새 turn commit 후 scheduler 등록을 시도한다. 등록 실패는 committed turn을 되돌리지 않고 즉시 retry queue와 monitoring에 기록한다.
- in-memory overdue sweeper는 active Game의 deadline을 주기적으로 재검사하며, resume 및 새 Room command 처리 시에도 overdue turn을 확인한다. 개별 `setTimeout` 유실만으로 turn이 영구 정지되지 않게 한다.
- scheduler는 at-least-once delivery를 제공하고 timeout command의 stale 검증과 idempotency가 중복 실행을 무해하게 만든다.
- callback은 실행 시 current game/turn/`gameRevision`과 server `Clock`을 다시 검사한다.
- 이미 다음 turn으로 넘어간 오래된 timer는 no-op다.
- client Submit과 timeout은 같은 Room mutation lane에서 순서화된다.
- Socket listener는 server 수신 시각을 기록한다. `receivedAt >= deadlineAt`이면 expired이며 모든 code path에 같은 경계를 적용한다.
- local test dictionary는 deterministic하게 동작한다.
- 향후 async external dictionary를 쓰면 live state를 수정한 채 await하지 않는다. validation 후 commit 직전에 `gameRevision`/turn을 재검사하거나 command serialization 전략을 유지한다.
- dictionary unavailable/error는 recoverable `TEMPORARILY_UNAVAILABLE` 성격으로 실패시키고 canonical state를 바꾸지 않는다. lookup 때문에 turn deadline을 연장하지 않는다.
- persistent repository를 도입한 뒤에는 process 시작과 scheduler lease takeover 시 active `deadlineAt`을 scan해 누락된 timeout job을 복원한다. 메모리 MVP는 process restart 후 Room 자체가 없으므로 복원 대상도 없다.

## 11. Host와 Player disconnect 설계

구현 구조는 Phase 7A에서 확정된 gameplay/Host policy와 아직 남은 Room retention 결정을 분리해 처리해야 한다.

| 상황 | 확정 동작 | 아직 남은 사항 |
| --- | --- | --- |
| Lobby non-Host disconnect | Player/session을 삭제하지 않고 presence만 OFFLINE | 장기 offline 제거·Room retention |
| Lobby Host disconnect | 60초 grace, 이후 CONNECTED 중 최저 `joinOrder`에게 승계 | Room에 다른 Player가 없을 때 cleanup |
| Current Player disconnect | rack/turn ownership과 timer 유지, normal timeout penalty 적용 | 없음 |
| PLAYING Player 장기 offline | OFFLINE인 자기 turn timeout 2회 연속 뒤 forfeit | 없음 |
| 모든 Player disconnect | Room state가 즉시 부분 삭제되지 않음 | idle TTL과 cleanup |
| duplicate session connect | 새 resume 성공 시 새 `connectionGeneration`만 primary, 이전 권한 회수와 stale disconnect 무시 | 없음 |
| explicit leave during PLAYING | 즉시 forfeit, rack/result metadata 유지 | 없음 |

policy가 어떤 결정을 하더라도 server command와 timer만 canonical state를 변경하며, connection event가 domain state를 임의로 건너뛰어 수정하지 않는다.

## 12. In-memory MVP

### 12.1 저장 방식

Phase 3의 `InMemoryPersistence`는 process 내부 Map 기반 adapter다.

- 하나의 private backing state가 Room ID/code index, session verification index, scope/request idempotency index를 함께 소유한다.
- `RoomRepository`는 code와 internal ID index를 관리하고, 입력 저장 및 조회 반환 시 detached copy를 사용한다.
- `RoomUnitOfWork.commit(changeSet)`은 declarative change set에 필요한 Room candidate, session binding/cleanup, accepted idempotency record를 별도 Map copy에 먼저 완성한 뒤 backing state reference를 한 번만 교체한다. failure injection이나 precondition 실패 시 live state는 바뀌지 않는다.
- create의 `storageRevision`은 adapter가 `0`으로 부여한다. replace는 expected `roomRevision`과 expected server-only `storageRevision`을 각각 CAS하고 성공 시에만 `storageRevision`을 1 증가시킨다.
- code 예약과 정원 확인/추가는 이 unit-of-work 안에서 재검사한다. 예외 시 기존 Map/index를 유지하고 partial entry를 노출하지 않는다.
- `KeyedSerialExecutor`는 같은 Room key의 async mutation을 등록 순서로 실행하되 다른 Room key는 서로 막지 않으며, reject 뒤에도 다음 작업을 실행하고 idle key를 정리한다.
- `SessionRepository`는 token hash와 Player binding을 관리한다.
- Room cleanup change set은 연결된 session과 caller가 명시한 idempotency scope를 같은 commit에서 제거하고 cleanup command의 terminal result를 함께 기록할 수 있다.
- idempotency record 보존 기간은 아직 숫자로 고정하지 않으며 scope 또는 caller-supplied cutoff cleanup만 제공한다.
- 개별 `RoomRepository.delete`는 low-level persistence primitive다. 실제 Room lifecycle cleanup은 누락 없는 idempotency scope 목록과 `DELETE_BY_ROOM` session cleanup을 포함한 `RoomUnitOfWork`를 사용한다.
- idempotency terminal result는 application이 명시적인 non-secret replay projection으로 구성해야 한다. in-memory adapter의 private field-name 거절은 방어 계층이며 임의 문자열 속 secret을 판별하는 scanner가 아니다.
- scheduler handle은 infrastructure에 두고 canonical state에는 deadline 값만 둔다.
- retention worker는 policy가 정한 빈/종료 Room을 명시적으로 제거한다.

Node.js가 single-threaded라는 사실만으로 async handler의 원자성이 보장된다고 가정하지 않는다.

### 12.2 제한

- process restart 시 Room, session, idempotency 기록, timer가 모두 사라진다.
- replica를 둘 이상 띄우면 각 process의 Map이 분리되어 correctness가 깨진다.
- 따라서 MVP Railway 배포는 replica 하나로 제한한다.
- memory 상태 유실은 감추지 않고 사용자-facing reconnect failure로 처리한다.

## 13. Redis/PostgreSQL 확장 지점

### 13.1 Redis

Redis를 도입할 수 있는 영역:

- Redis-only profile에서 Room/session/presence의 TTL state
- normalized room code key에 대한 `SET NX` 예약
- `WATCH/MULTI` 또는 Lua 기반 `storageRevision`/scoped-version CAS
- shared idempotency record
- Socket.IO Redis adapter를 통한 cross-node event delivery
- fencing token을 가진 distributed room lease 또는 single-room owner/actor routing
- sorted set/job queue/lease 기반 turn scheduler

분산 lock 획득만 correctness로 간주하지 않는다. lease가 만료된 이전 holder도 실행을 계속할 수 있으므로 최종 scoped-version CAS 또는 fencing token 검사가 유일한 commit authority여야 한다. Socket.IO Redis adapter만 추가한다고 canonical state, lock, timer가 자동으로 공유되는 것도 아니다.

### 13.2 PostgreSQL

PostgreSQL을 도입할 수 있는 영역:

- Room, Player, Game snapshot 또는 move 기록의 내구성
- normalized `roomCode` column/key에 대한 UNIQUE constraint
- token hash 저장과 session lifecycle
- transaction + row lock 또는 `UPDATE ... WHERE storage_revision = ?` aggregate CAS와 command별 `game_revision` precondition
- audit/result/history가 scope에 들어올 경우 영구 기록
- commit 후 event 유실을 막기 위한 transactional outbox

event sourcing은 현재 요구사항이 아니므로 미리 도입하지 않는다. snapshot 저장과 command log 중 선택은 실제 복구·감사 요구가 생길 때 결정한다.

Redis와 PostgreSQL을 함께 쓰는 profile에서는 PostgreSQL을 durable canonical source로, Redis를 cache/presence/realtime coordination 용도로 두는 것을 기본 방향으로 한다. Redis-only ephemeral profile과 혼합 profile을 동시에 모호하게 운영하지 않는다. dual write가 필요하면 PostgreSQL transaction/outbox에서 Redis 갱신을 유도하고 cache miss 또는 version 불일치 시 canonical source에서 재구성한다.

### 13.3 다중 인스턴스 체크리스트

수평 확장 전에 다음을 함께 해결해야 한다.

- 공유 canonical repository
- Room별 cross-node command serialization
- distributed timer ownership과 stale job 방지
- process 시작/lease takeover 시 persisted active deadline scan
- durable idempotency
- Socket.IO cross-node publisher
- polling transport를 허용할 경우 sticky session
- connection/presence consistency
- process crash 중 commit/publish 복구

단순히 in-memory repository 구현체만 Redis로 교체하는 것으로 충분하지 않다.

## 14. Production deployment 개념

### 14.1 Single public origin

production에서는 하나의 Node.js HTTP server에 Express와 Socket.IO를 붙인다.

```text
https://game.example/
  ├── /api/...          Express HTTP endpoints
  ├── /socket.io/...    Socket.IO handshake, polling, WebSocket upgrade
  ├── /assets/...       Vite hashed static assets
  └── /*                React SPA index.html fallback for GET routes only
```

- browser Lobby route는 `/`와 `/room/{ROOM_CODE}`를 사용하고, 초대 URL은 `{origin}/room/{ROOM_CODE}`로 만든다. `sessionToken`, `playerId`, verification data와 `socketId`는 URL에 넣지 않는다.
- browser는 상대 URL로 HTTP/Socket.IO에 연결한다.
- API와 Socket.IO path를 static SPA fallback이 가로채지 않도록 route 순서를 정한다.
- hashed asset은 장기 cache, `index.html`은 배포 갱신을 반영할 cache policy를 사용한다.
- 동일 origin을 기본으로 해 production CORS와 credential 복잡도를 줄인다.
- 동일 origin이어도 Socket.IO handshake의 `Origin`을 explicit allowlist로 검증한다. same-origin 배포가 origin 검증을 자동으로 대신한다고 가정하지 않는다.
- MVP credential 저장소는 `sessionStorage`다. 향후 cookie 방식으로 변경한다면 `HttpOnly`, `Secure`, `SameSite`와 CSRF 방어를 별도 보안 결정으로 함께 확정한다.
- Railway reverse proxy 뒤에서 secure cookie나 IP 기반 rate limit을 사용할 때는 알려진 proxy hop에만 맞춘 정확한 Express `trust proxy` 설정을 사용한다.
- client bundle에 server secret이나 private environment variable을 주입하지 않는다.
- shared wire contract에 `protocolVersion`을 두고 deploy 뒤 열린 구형 tab이 호환되지 않으면 명시적 reload/update UX로 처리한다.

### 14.2 Development

개발 중 web은 `http://localhost:5173`에서 상대 `/socket.io` 경로를 사용하고, Vite가 handshake와 WebSocket upgrade를 `http://127.0.0.1:3001`의 Express/Socket.IO server로 proxy한다. production contract는 동일 origin을 기준으로 유지한다.

### 14.3 Railway

- Railway가 제공하는 `PORT`를 읽고 `0.0.0.0`에 bind한다.
- reverse proxy의 HTTPS와 WebSocket upgrade를 고려한다.
- health endpoint는 process readiness를 확인하되 private game state를 노출하지 않는다.
- build는 shared contract, web asset, server output이 올바른 순서로 준비되게 한다.
- production start command는 Express가 실제 web build output을 찾도록 한다.
- graceful shutdown 시 새 command 수신을 중단하고 connection을 정리한다. 메모리 MVP는 Room durability를 보장하지 못한다.
- Redis 등 공유 state를 도입하기 전에는 replica 수를 1로 유지한다.

현재 Railway 동작의 근거는 공식 [Socket.IO 배포 guide](https://docs.railway.com/guides/socketio)와 [monorepo 배포 문서](https://docs.railway.com/deployments/monorepo)를 구현 시점에 다시 확인한다.

## 15. 테스트 경계

- Domain unit test: fixed `Clock`, seeded/fake `RandomSource`, test `DictionaryProvider`로 state transition과 invariant 검증
- Repository contract test: code 충돌, capacity race, scoped-version CAS, session lookup
- Application test: authorization, idempotency, candidate discard, timeout race
- Socket integration test: bootstrap/create/join/start/resume, 잘못된 token, stale scoped version, duplicate request와 lost ack
- Projection test: visibility policy상 private인 rack/bag 정보와 token이 허용되지 않은 payload에 포함되지 않는지 검증
- Client test: snapshot version vector 처리, draft reset, reconnect/error UX
- End-to-end test: 2~4 browser, refresh, disconnect, valid/invalid Submit, Railway smoke flow

테스트가 가능하도록 system time, random, dictionary, repository, publisher를 전역 singleton에 숨기지 않는다.

## 16. 결정 대기 항목과 architecture 영향

| 미확정 결정 | 영향을 받는 component |
| --- | --- |
| exact Tile inventory, symbol·회전 규칙과 Joker 대체 universe | `RulesConfig`, tile factory, Hangul composition, start validation |
| 동일 낱말 WordGroup 중복 허용 | RuleEngine, Submit validation |
| game:start 시 OFFLINE 참가자 포함 여부 | start validation, participant snapshot |
| production dictionary dataset·license·exact 어휘 범위 | `DictionaryProvider`, version storage |
| Lobby 비-Host explicit leave와 Room retention/code 재사용 | session/Room cleanup, generator, abuse controls |
| command/Submit 운영 한도 | transport validation, rate limiting |
| rematch와 누적 match | result model, Room lifecycle |

이 항목은 [GAME_RULES.md](./GAME_RULES.md)의 `PHASE_7B_REQUIRED`와 `TO_BE_CONFIRMED`에 동기화한다. 특히 Phase 7B 전에는 임시 symbol 목록이나 tileInventoryVersion을 production logic으로 만들지 않는다.

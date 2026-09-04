# Multi-game Platform P1 Characterization

> 상태: P1 compatibility baseline 및 migration seam 인벤토리
> 작성일: 2026-09-04
> 분석 기준: `7d2dce0` (`docs: design multi-game platform migration`)
> production 기준선: `hangul-game-v1` / `abbfbb9`

이 문서는 멀티게임 기능을 추가하기 전 현재 production 한글 게임의 wire와 주요 내부 contract를 고정한다. 저장소의 실제 구현과 test를 source of truth로 사용하며, 이 문서에서 `Legacy Hangul v1`은 현재 `protocolVersion = 1` vertical slice를 뜻한다.

P1은 새 platform contract를 확정하는 단계가 아니다. 이 문서에서 `platform-like`, `cross-game candidate`, `Hangul-specific`은 현재 책임을 분류하기 위한 표현이며, 두 번째 게임 구현 전 공통 abstraction으로 승격되었다는 뜻이 아니다.

## 1. 시작 기준과 compatibility baseline

P1 시작 시 working tree는 clean이었고 HEAD는 P0 checkpoint `7d2dce0`이었다. `hangul-game-v1` tag는 production checkpoint `abbfbb9`를 가리켰다. 시작 전 root 검증은 shared 55, web 87, server 431로 총 573 tests, typecheck, build가 모두 통과했다.

P1 전후에 보존하는 외부 기준선은 다음과 같다.

- protocol은 `protocolVersion = 1`이다.
- create에 game 선택이 없으며 생성되는 Room은 현재 한글 게임만 실행한다.
- 공개 route는 `/`와 `/room/{ROOM_CODE}`이고 invitation URL에 credential을 넣지 않는다.
- Railway single-origin static/SPA/Socket.IO serving을 유지한다.
- 기존 Socket.IO command/event name, ack scope, error code를 유지한다.
- `StateSnapshot` v1의 serialized shape와 public/private projection을 유지한다.
- create/join/start/submit/draw/pass/timeout/leave/forfeit/finish와 session resume/reconnect/presence 동작을 유지한다.
- 기존 UI 문구와 사용 흐름의 의미를 유지한다.

P1에서는 Railway deploy나 public URL smoke를 수행하지 않는다. production serving은 기존 local production-serving integration test로 회귀를 확인한다.

## 2. Wire v1 inventory

`packages/shared/src/realtime.ts`의 event map과 `packages/shared/src/protocol.ts`, `projections.ts`, `validation.ts`의 strict runtime validator가 현재 contract다. root index export를 통해 동일 contract가 web/server에 제공된다.

### 2.1 Client → Server

모든 command는 top level에 `kind`, `protocolVersion`, `requestId`, `payload`를 가진다. 아래 revision field는 해당 command의 top level에만 추가된다. 모든 schema는 extra field를 거절한다.

| Event | 추가 top-level precondition | Payload의 현재 v1 내용 | 현재 transport 대상 |
| --- | --- | --- | --- |
| `session:bootstrap` | 없음 | `{}` | `RoomSessionApplicationService.bootstrapSession` |
| `room:create` | 없음 | `bootstrapCredential`, `nickname` | `RoomSessionApplicationService.createRoom` |
| `room:join` | 없음 | `bootstrapCredential`, `nickname`, `roomCode` | `RoomSessionApplicationService.joinRoom` |
| `session:resume` | 없음 | `credential`, `lastSeenVersions` | `SessionResumeService.resumeSession` |
| `state:sync` | 없음 | `{}` | repository read + snapshot projector |
| `room:leave` | `expectedRoomRevision`, nullable `expectedGameRevision` | `{}` | `RoomLeaveService.leave` |
| `game:start` | `expectedRoomRevision` | `{}` | `GameStartService.start` |
| `turn:submit` | `expectedGameRevision`, `turnId` | `proposedBoard` | `TurnSubmitService.submit` |
| `turn:draw` | `expectedGameRevision`, `turnId` | `bagKind` | `TurnDrawService.draw` |
| `turn:pass` | `expectedGameRevision`, `turnId` | `{}` | `TurnPassService.pass` |

현재 실제 Client event set은 위 10개가 전부다. P1은 event alias, namespace 또는 `game:command` envelope를 추가하지 않는다.

### 2.2 Server → Client

| Event | Version scope | Payload/필드 | 역할 |
| --- | --- | --- | --- |
| `state:snapshot` | `versions` 있음 | `payload.snapshot` | canonical player-specific state delivery |
| `turn:started` | `versions` 있음 | `gameId`, `turnId`, `turnNumber`, `activePlayerId`, `deadlineAt` | current Hangul turn advisory |
| `game:finished` | `versions` 있음 | `gameId`, `reason`, `winnerPlayerIds`, `finalGameRevision`, `finishedAt` | current Hangul finish advisory |
| `session:replaced` | `versions` 없음 | top-level `reason = NEW_PRIMARY_CONNECTION` | 기존 primary connection 종료 통지 |
| `room:closed` | `versions` 없음 | `roomId`, `roomCode` | Room 삭제 통지 |

현재 실제 Server event set은 위 5개가 전부다. P0 문서에서 architecture 후보로 언급된 `state:changed`, `player:connection-changed`, `server:error`는 현재 `ServerToClientEvents`에 존재하지 않으므로 Legacy Hangul v1 inventory에 포함하지 않는다.

`turn:started`와 `game:finished`는 advisory다. 브라우저의 canonical 복구 경로는 player-specific snapshot이 포함된 ack, `state:snapshot`, `session:resume`, `state:sync`다.

### 2.3 Ack scope와 revision representation

- 읽을 수 없는 `requestId`를 포함한 malformed input은 `scope = UNSCOPED`, `requestId = null`이다.
- Room context를 확보하기 전 실패는 `UNSCOPED`다.
- Room-scoped 성공과, 현재 binding/snapshot을 안전하게 읽을 수 있는 Room 실패는 `scope = ROOM`과 `versions`를 가진다.
- `versions.roomRevision`, `versions.presenceVersion`은 non-negative integer다.
- `versions.gameRevision`은 LOBBY에서 `null`, PLAYING/FINISHED에서 non-negative integer다.
- `state:snapshot` event의 protocol, server time, versions는 내부 snapshot과 일치해야 한다. snapshot success ack는 protocol field를 갖지 않으며 server time과 versions가 내부 snapshot과 일치해야 한다.

P1 characterization은 TypeScript event map의 key union이 위 inventory와 양방향 exact match인지, 대표 command/event의 key set과 strict extra-field rejection이 유지되는지를 함께 검증한다.

## 3. StateSnapshot v1 golden characterization

전체 JSON 문자열이나 timestamp/opaque ID literal에 의존하지 않고 stable key set, discriminant, required/forbidden field를 고정한다.

### 3.1 공통 구조

| 위치 | LOBBY | PLAYING | FINISHED |
| --- | --- | --- | --- |
| top level | `protocolVersion`, `versions`, `serverTime`, `room`, `self` | 공통 + `game` | 공통 + `game` |
| `versions.gameRevision` | `null` | number | number |
| `room.phase` | `LOBBY` | `PLAYING` | `FINISHED` |
| `room.players[]` | identity/Host/presence | Lobby fields + `rackCount`, `initialMeldCompleted`, `forfeited` | PLAYING과 동일한 공개 player shape |
| `self` | `playerId` | `playerId`, private `rack` | `playerId`, private `rack` |
| `game` | 없음 | common game projection + `turn`; `result` 없음 | common game projection + `result`; `turn` 없음 |

공통 game projection의 현재 key는 `gameId`, `board`, `turnOrder`, `bagCounts`다. 이는 현재 Hangul v1 shape를 기술할 뿐 향후 모든 게임의 필수 shape가 아니다.

PLAYING `turn`의 key는 `turnId`, `turnNumber`, `activePlayerId`, `startedAt`, `deadlineAt`다. FINISHED `result`의 key는 `reason`, `winnerPlayerIds`, `rankings`, `finishedAt`이고 ranking entry는 `playerId`, `rank`, `score`, `remainingRackCount`, `penaltyCost`, `forfeited`를 가진다.

### 3.2 Hangul projection의 현재 내용

- `board.wordGroups`는 group/syllable과 choseong/jungseong/jongseong placement를 투영한다.
- 공개 Board Tile은 편집에 필요한 opaque `tileId`, physical/kind, assigned/allowed symbol metadata를 포함한다.
- `self.rack`은 본인 Tile의 opaque `tileId`, kind, physical type, source bag, allowed symbols를 포함한다.
- bag은 consonant/vowel count만 공개한다.
- player list는 상대 rack count만 공개한다.

이 구조를 `PlatformSnapshot`의 최종 형태로 재명명하거나 Number/Gem에 강제하지 않는다.

## 4. Projection privacy characterization

PLAYING Host A와 Guest B의 동일 canonical Room projection을 각각 생성해 다음 invariant를 고정한다.

- A의 `self.rack`에는 A의 Tile detail이 있고 B는 `rackCount`만 보인다.
- B의 `self.rack`에는 B의 Tile detail이 있고 A는 `rackCount`만 보인다.
- A snapshot에는 B rack의 `tileId` 값이 없고, B snapshot에는 A rack의 `tileId` 값이 없다.
- 어느 snapshot에도 consonant/vowel bag의 `tileId` 또는 draw order가 없다.
- FINISHED에서도 각 player의 own rack만 `self.rack`에 남고 상대 rack Tile detail은 공개되지 않는다.
- `sessionToken`, `verificationData`, `socketId`, `connectionGeneration`, `storageRevision`, idempotency/scheduler 내부, offline timeout streak, stalemate tracker가 serialized snapshot에 없다.

추가 regression test는 value-level Tile ID 누출과 내부 key 누출을 모두 검사한다. canonical `racks`, `consonantBag`, `vowelBag`, `tilesById` 같은 server-only collection 이름도 wire에 나타나지 않아야 한다.

## 5. RoomRecord와 persistence coupling

### 5.1 현재 aggregate shape

`apps/server/src/model/persistence.ts`의 `RoomRecord`는 Room ID/code/phase/Host/players/revisions/timestamps와 함께 concrete `GameState | null`을 직접 가진다. `RoomUnitOfWork` port 자체는 Room mutation, session mutation, idempotency, room/storage CAS와 commit precondition을 표현하며 game 내부를 직접 읽지 않지만, change set의 `RoomRecord` type을 통해 concrete state 결합을 상속한다.

### 5.2 direct field access inventory

| 위치 | 직접 읽는 concrete game 정보 | 현재 목적 | 분류 |
| --- | --- | --- | --- |
| `cloneRoomWriteCandidate` | `game`, `turn`, `result` | LOBBY/PLAYING/FINISHED coherence 검증 | game lifecycle knowledge |
| `cloneRoomWriteCandidate` → `cloneGameState` | Hangul GameState 전체 | detached/frozen clone 및 canonical validation | storage 필요 + Hangul 구현 결합 |
| `listActiveTurnDeadlines` | `turn`, `result`, `gameId`, `gameRevision`, `turnId`, `turn.deadlineAt` | 같은 process에서 누락/overdue scheduling을 복구할 active turn identity | current-game lifecycle knowledge |
| `listActiveGameDeadlines` | `turn`, `result`, `gameId`, `gameDeadlineAt` | game deadline recovery | optional current-game deadline knowledge |
| `listFinishedRoomRetentions` | `turn`, `result`, `gameId`, `result.finishedAt` | finished Room cleanup recovery | lifecycle/retention knowledge |
| idempotency cleanup | `room-player:*`, `room-timeout:*`, terminal result의 `roomId` | Room 삭제 시 replay record 정리 | current command/scope naming 결합 |

향후 inspector/codec seam이 대체해야 할 operational field의 실제 최소 집합은 다음과 같다.

- active 또는 finished lifecycle 판정
- `gameId`, `gameRevision`
- optional active turn identity: `turnId`, `activePlayerId`, `deadlineAt`
- optional `gameDeadlineAt`
- optional `finishedAt`

모든 게임이 turn이나 deadline을 가진다고 가정하지 않기 때문에 마지막 세 종류는 capability 또는 optional read model이어야 한다.

### 5.3 Persistence 책임 분류

| 분류 | 현재 책임 |
| --- | --- |
| A. Pure storage | map snapshot copy, detached return, Room/code index, create/replace/delete, room/storage CAS, atomic Room+Session+idempotency publish, atomic cleanup |
| B. Game lifecycle knowledge | phase↔turn/result coherence, active turn/game deadline reader, finished retention reader, current idempotency scope naming |
| C. Hangul-specific | `cloneGameState`가 rules config, tiles, two bags, racks, Board/WordGroup, initial meld, offline streak, forfeits, no-move tracker, turn order/deadlines, Hangul result를 clone·validate하고 terminal scoring을 재계산 |

기존 clone/isolation test는 caller mutation이 저장 상태에 영향을 주지 않는 detached copy와 일부 반환 object/array의 freeze를 이미 검증한다. `Object.freeze(new Map())`이 Map entry mutation까지 막는다는 보장은 하지 않는다. P1은 여기에 invalid Room phase/GameState 조합이 write 전에 거절되고 Room ID/code ghost index가 남지 않는 characterization을 추가한다.

P1에서 JSON clone, opaque blob, generic codec framework를 추가하지 않는다. `cloneGameState`는 이미 안전한 Legacy Hangul cloner이므로 P3A에서 module-owned adapter로 소유권을 옮길 대상이다.

## 6. Snapshot projector coupling

현재 `LobbyStateSnapshotProjector` 한 클래스가 아래 책임을 조합한다.

| 영역 | 실제 책임 |
| --- | --- |
| Platform-like shell | self membership, Clock/serverTime, protocol version, Room ID/code/phase, Host/player identity, presence status/version, roomRevision |
| Lifecycle coupling | Room phase와 concrete `turn`/`result` coherence 검사, Lobby `gameRevision = null` |
| Cross-game candidate | gameId, gameRevision, turnOrder, active turn/result 선택 |
| Hangul v1 projection | rack count/private rack, initial meld, forfeit, two bag counts, Board WordGroup/syllable placement, Tile/Joker metadata, Hangul result |

자연스러운 후속 seam은 `projectRoomShell(...)`과 `projectLegacyHangulV1Game(...)`에 해당하는 내부 collaborator다. 마지막 조합과 `StateSnapshotSchema` parse는 v1 compatibility adapter가 유지해야 한다.

P1에서는 source projector를 분해하지 않았다. 현재 로직은 strict union 조립과 private Tile projection이 한 control flow에 밀접하게 연결되어 있고, `gameType` 없이 collaborator 선택 경계를 넣어도 dependency 방향이 줄지 않기 때문이다. 대신 PLAYING exact shape/A·B privacy와 FINISHED privacy를 강화해 P3A 추출의 안전망을 만들었다.

## 7. Application service coupling matrix

| Service | Platform orchestration 또는 candidate | Hangul/current-game decision |
| --- | --- | --- |
| `GameStartService` | Room lane, auth lease, Host/phase/revision/presence, idempotency, UoW, post-commit scheduling | 2~4인 gate, `createInitialGameState`, inventory/deal/turn, turn/game deadline |
| `TurnSubmitService` | actor/current-primary, Room serialization, idempotency, stale revision, UoW/CAS, post-commit delivery identity | ProposedBoard 변환, Tile ownership/conservation, RuleEngine+Dictionary, initial meld, Board/rack commit, rack-empty result, next turn |
| `TurnDrawService` | 동일한 mutation orchestration shell | consonant/vowel bag 선택과 pop, rack update, no-move reset, next turn |
| `TurnPassService` | 동일한 mutation orchestration shell | 두 bag empty 조건, no-move cycle, stalemate/forfeit result, next turn |
| `TurnTimeoutService` | detached timeout identity, Room lane, idempotency, Clock/deadline recheck, presence lease, UoW, applied listener | penalty draw, rack mutation, offline streak, forfeit, stalemate/result, next turn |
| `GameDeadlineService` | detached deadline identity, Room lane, idempotency, stale identity/deadline recheck, UoW, applied listener | 단일 game deadline과 Hangul TIME_LIMIT scoring/result |
| `RoomLeaveService` | membership/auth/idempotency, Lobby removal/Host succession, session cleanup, UoW/resource cleanup | PLAYING forfeit, current-turn replacement, no-move/result, gameRevision/timer follow-up |
| `RoomPresencePolicyService` | disconnect/resume generation lease, Lobby grace/Host election, all-offline/finished retention scheduling | gameId/finishedAt read와 reconnect 시 Hangul offline timeout streak reset |
| `RoomRetentionService` | Clock/presence/cleanup orchestration | PLAYING gameId, FINISHED gameId/result.finishedAt identity 검사 |
| `RoomCleanupService` | Room/session/idempotency/presence/resource cleanup | 없음 |
| `LobbyDisconnectGraceService` | generation/presence/Room membership recheck와 Lobby cleanup/election | 없음 |

`game-finish-transition.ts`는 concrete Hangul GameState와 GameResult에 결합되어 있고, `turn-transition.ts`도 중립적인 파일명과 달리 turn order, forfeit, Hangul rules duration을 안다. 파일명만 보고 PLATFORM_CORE로 승격하지 않는다.

공통으로 보이는 Room lane/UoW/idempotency/authorization shell도 P1에서 generic command bus로 만들지 않는다. command별 failure/replay/post-commit semantics가 다르며 두 번째 게임이 아직 이를 검증하지 않았다.

## 8. Scheduler coupling matrix

| Scheduler path | Mechanism | Concrete state extraction/decision | P1 판정 |
| --- | --- | --- | --- |
| Turn | `InProcessTurnScheduler`는 schedule/dedupe/cancel/callback만 수행 | `turn-transition`, persistence recovery reader, `TurnTimeoutService`가 game/turn/revision/deadline과 Hangul timeout 결과를 안다 | engine은 재사용 후보, contract/action은 current-game-specific |
| Game deadline | `InProcessGameDeadlineScheduler`는 schedule/dedupe/cancel/callback만 수행 | `game-deadline-transition`, persistence reader, `GameDeadlineService`가 gameDeadlineAt과 Hangul TIME_LIMIT 결과를 안다 | optional capability 후보 |
| Room policy | `InProcessRoomPolicyScheduler`는 discriminated deadline의 timer mechanism을 수행 | Lobby grace는 platform-clear; playing/finished retention은 gameId/finishedAt을 읽음 | mechanism은 platform-like, 일부 identity는 coupled |
| Recovery sweepers | detached deadline을 Clock과 비교하고 enqueue | concrete state read는 persistence reader에서 이미 수행 | mechanism은 platform-like |
| Lifecycle resources | Room별 timer cancel/cleanup | turn/game-deadline slot을 명시적으로 보유 | cleanup은 platform-like이나 capability shape는 coupled |

P1에서는 unified scheduler를 만들지 않는다. P3C에서는 기존 scheduler와 callback wiring을 유지하면서 concrete timeout/deadline decision을 optional Hangul server-action adapter에 위임한다. 두 번째 게임 전 generic scheduled-action mechanism을 만들지 않고 timer가 없는 game에는 capability를 강제하지 않는다.

## 9. Socket.IO transport coupling

### 9.1 Current routing lock

Section 2.1의 표가 transport→service mapping의 exact inventory다. 추가로 disconnect는 `ConnectionRegistry.disconnect` 후 `RoomPresencePolicyService.onCurrentDisconnect`를 호출한다. `session:resume`은 resume 성공 후 `RoomPresencePolicyService.onResume`을 연결한다.

`socket-io-routing-characterization.test.ts`는 TypeScript AST에서 각 `socket.on` callback의 실제 CallExpression을 읽어 위 direct service path와 disconnect의 ConnectionRegistry/PresencePolicy path를 고정한다. 기존 Socket.IO integration suite는 각 event가 create/join/resume/sync/start/submit/draw/pass/timeout/finish/leave/forfeit 결과를 만드는 것으로 mapping을 behavior-level에서도 고정한다. mock 호출 횟수까지는 중복 고정하지 않는다.

### 9.2 Responsibility split

| Common transport | Hangul/current-game-specific transport |
| --- | --- |
| `receivedAt` capture, unknown input runtime validation, request correlation | fixed `GameStartService`, Submit/Draw/Pass service 선택 |
| current-primary binding과 authorization lease | PLAYING/FINISHED Hangul snapshot type guard |
| ack scope/error mapping | `turn:started`, `game:finished` payload 조립 |
| player-specific snapshot load/fan-out와 post-commit recovery | `room:leave` 전 activePlayerId peek으로 advisory 여부 결정 |
| connection/session replacement와 Room channel membership | current Hangul result/turn shape에서 advisory 생성 |

P1에서는 event name, handler 등록 순서, router behavior를 바꾸지 않았고 `executeAuthenticatedRoomCommand`나 generic command bus도 추출하지 않았다. P3B에서 기존 event별 handler를 보존한 채 Hangul compatibility facade를 호출하는 것이 먼저다.

Composition root는 현재 persistence/clock/random/ID/presence/Room lane과 fixed Hangul services, `TestDictionaryProvider`, Turn/Game/Room-policy schedulers 및 sweepers를 직접 조립한다. 따라서 P2의 single-entry compatibility registry를 삽입할 가장 명확한 assembly seam이다.

## 10. Web characterization

### 10.1 Route와 session behavior

- `/`는 Home이고 정확한 `/room/{6-character ROOM_CODE}`는 Room route다.
- lower-case valid code는 canonical upper-case path로 `replaceState` 된다.
- malformed route와 valid-looking-but-missing Room은 구분된 기존 UI 흐름을 유지한다.
- invitation은 current origin + canonical Room path이며 session token을 포함하지 않는다.
- refresh는 route와 matching stored Room credential을 이용해 resume한다.
- stale session은 credential/client Room state를 정리하고 기존 안내 흐름으로 돌아간다.
- pending create/join만 같은 request ID로 session storage에 보존한다. gameplay/leave retry는 page memory에만 둔다.
- ordered snapshot 적용은 LOBBY → PLAYING → FINISHED와 room/game/presence version ordering을 유지한다.

### 10.2 `App.tsx` ownership

| PLATFORM | HANGUL | MIXED |
| --- | --- | --- |
| pathname guard, connection/session-replaced presentation, invite URL, Home/Lobby shell, leave/goHome | Playing/Finished validator와 screens, TurnDraft, Submit/Draw/Pass, forfeited action gate | phase renderer 선택, game start control, Playing route의 connection/session/leave chrome + Hangul editor |

P0에서 확인한 current fallback은 다음 순서다.

1. `validatePlayingStateSnapshot` 성공이면 Playing renderer
2. 아니면 `validateFinishedStateSnapshot` 성공이면 Finished renderer
3. 둘 다 실패하면 Lobby renderer

P1은 이 결정을 `resolveLegacyHangulRoomView` 순수 함수로 추출하고 LOBBY/PLAYING/FINISHED 및 malformed PLAYING/FINISHED test로 고정했다. DOM, 문구, props, command 또는 state ownership은 바뀌지 않았다.

이 fallback은 Legacy Hangul v1 compatibility behavior이지 target platform behavior가 아니다. P5B에서 authoritative unknown `gameType`, invalid game projection, incompatible version은 Lobby/Hangul로 조용히 fallback하지 않고 명시적인 incompatible state에서 command를 차단해야 한다.

### 10.3 `use-lobby-app.ts` ownership

| 분류 | 실제 state/ref/function/effect |
| --- | --- |
| PLATFORM | `route`, nickname/room input, connection/operation/error/copy/session state; route/snapshot/client refs; entry/resume/sync/leave flight와 retry; `updateRoute`, `navigateToRoom`, stored session, bootstrap/create/join/finalize/resume/sync/leave/copy/goHome; stale/replaced handling |
| HANGUL | submit/action pending과 flight/retry, TurnDraft reset generation, `executeTurnSubmitCommand`, `executeTurnActionCommand`, `submitTurn`, `drawTurn`, `passTurn`; rack/turn/bag-derived action input; turn-started/game-finished advisory 처리 |
| MIXED | `StateSnapshot` 전체 ownership, `clearCurrentRoomClientState`, `applyOrderedSnapshot`, `receiveSnapshot`, `startGame`, reconnect recovery replay ordering, 한 effect 안의 platform/game listener 조립 |

`game:start`는 Room lifecycle command처럼 보이지만 현재 player count와 Hangul initial state/scheduler로 직결되므로 P1에서는 MIXED로 둔다. hook 전면 분해나 speculative `useGameController`는 하지 않는다. P3/P5에서 snapshot decoder와 Hangul controller 경계가 생긴 뒤 state ownership을 이동한다.

### 10.4 Realtime client ownership

| 분류 | Commands/events |
| --- | --- |
| PLATFORM | bootstrap/create/join/leave/resume/sync; connection, session-replaced, room-closed |
| HANGUL | submit/draw/pass; turn-started/game-finished advisory |
| MIXED | game:start, canonical StateSnapshot decode/delivery |
| Shared infrastructure | Socket.IO connection, acknowledgement timeout/correlation, runtime validation, protocol issue, snapshot ack/event version consistency |

P1에서는 public method/event name을 바꾸거나 `platformRealtime`/`legacyHangulRealtime`로 물리 분리하지 않는다.

## 11. Error, revision, result characterization

### 11.1 Error code 분류

v1 code name은 compatibility contract이므로 분류와 무관하게 rename/remove하지 않는다.

| 분류 | 현재 code |
| --- | --- |
| Platform/transport 명확 | `INVALID_PAYLOAD`, `INCOMPATIBLE_PROTOCOL`, `UNAUTHENTICATED`, `SESSION_NOT_FOUND`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `ROOM_NOT_JOINABLE`, `HOST_ONLY`, `STALE_ROOM_REVISION`, `REQUEST_ID_REUSED`, `NICKNAME_INVALID`, `NICKNAME_TAKEN`, `ROOM_CODE_INVALID`, `ROOM_CODE_EXHAUSTED` |
| Hangul gameplay 명확 | `NOT_YOUR_TURN`, `TURN_EXPIRED`, `GAME_EXPIRED`, `BAG_EMPTY`, `PASS_NOT_ALLOWED`, `INVALID_TILE_ACCESS`, `INVALID_BOARD`, `INVALID_HANGUL_COMPOSITION`, `WORD_NOT_ALLOWED`, `RULE_VIOLATION` |
| Coupled/cross-game candidate | `INVALID_PHASE`, `NOT_ENOUGH_PLAYERS`, `PLAYERS_NOT_CONNECTED`, `STALE_GAME_REVISION` |
| Shared infrastructure | `TEMPORARILY_UNAVAILABLE`, `INTERNAL_ERROR` |

향후 error namespace 또는 v2 code 정책은 public protocol을 설계하는 P5A decision point다. P1/P2/P3에서 v1 code를 namespace화하지 않는다.

### 11.2 `gameRevision`

현재 semantics는 다음과 같이 characterization한다.

- Game이 없는 LOBBY snapshot은 `null`이다.
- Game start 직후 concrete Hangul GameState는 `0`이다.
- accepted canonical gameplay commit은 증가한다.
- rejected candidate와 stale/no-op은 증가하지 않는다.
- presence-only 변화에는 증가하지 않는다.
- reconnect 시 server-only offline timeout streak reset은 storageRevision을 바꾸지만 gameRevision은 유지한다.

마지막 항목은 `gameRevision`이 현재 모든 stored game mutation의 revision이 아니라 browser-visible canonical gameplay revision임을 보여준다. Number/Gem 전에는 cross-game candidate로만 둔다.

### 11.3 Hangul v1 result

현재 finish reason은 `RACK_EMPTY`, `TIME_LIMIT`, `STALEMATE`, `LAST_PLAYER_STANDING`, `ALL_PLAYERS_FORFEITED`다. result는 winner IDs와 모든 player의 ranking을 가지며 ranking에 score, remaining rack count, penalty cost, forfeited가 포함된다.

ordinary Tile penalty는 1, Joker penalty는 30이다. Rack-empty/last-player-standing single winner는 다른 player penalty 합을 score로 받고, time limit은 rack count 후 penalty, stalemate/all-forfeited는 penalty를 rank key로 사용한다. 이 scoring과 shape 전체를 `Hangul v1 result`로 분류하며 platform-wide Result로 재명명하지 않는다.

미래 platform completion metadata 후보는 `resultVersion`, `finishedAt`, `winnerPlayerIds` 정도다. Room phase가 이미 finished를 표현하므로 별도 boolean을 필수로 가정하지 않는다. 이 후보도 실제 두 번째·세 번째 게임 결과를 보기 전 contract로 구현하지 않는다.

## 12. Existing E2E와 production-serving lock

신규 mega-E2E를 중복 작성하지 않고 다음 기존 coverage를 P1 gate로 재사용한다.

- Socket.IO integration: bootstrap, create, join, resume, sync, start, Submit, Draw, Pass, timeout, finish, idempotency, privacy, recovery
- lifecycle integration: Lobby leave/room close, Playing forfeit/finish, disconnect grace/resume
- 2/3/4-player complete/security matrix: create부터 finish, reconnect storm, malformed input, privacy probe
- web route/session/snapshot-state tests: root/Room/refresh/invitation/stale session, ordered LOBBY → PLAYING → FINISHED, retry state
- production serving: `/health`, `/`, `/room/ABC234`, SPA fallback exclusions, static assets, same-origin polling/WebSocket and bootstrap/create/join/start/resume, missing build fail-fast, graceful shutdown

Transport routing은 source mapping characterization, 위 integration behavior, Section 2/9의 exact inventory로 고정한다. 내부 concrete service 호출 횟수를 mock으로 재현하지는 않는다.

## 13. P1에서 구현한 seam과 보류한 seam

### 13.1 구현

`apps/web/src/lib/legacy-hangul-room-view.ts`의 `resolveLegacyHangulRoomView` 하나만 production source seam으로 추가했다.

- 기존 Playing → Finished → Lobby 검사 순서를 그대로 옮긴 pure function이다.
- 기존 shared validator를 그대로 사용한다.
- App의 rendered component, props, route, UI 문구, command와 effect는 바꾸지 않는다.
- malformed Playing이 Lobby로 fallback하는 현재 위험한 behavior까지 의도적으로 보존한다.
- 네 가지 renderer decision test가 추출 전후 의미를 고정한다.

### 13.2 구현하지 않고 P3로 보류

- `GameLifecycleInspector`: 실제 field surface는 확인했지만 `gameType`/module ownership이 없는 P1 wrapper는 concrete Hangul 호출을 한 단계 감출 뿐이다.
- `LegacyHangulGameStateCloner`: 기존 `cloneGameState`가 이미 deep clone과 canonical validation을 수행한다. P3A에서 module-owned adapter로 연결한다.
- projector collaborator: P1 exact shape/privacy test를 먼저 추가했고 실제 split은 P3A에서 한다.
- authenticated command helper: command별 ack/replay/post-commit 차이를 보존한 facade가 P3B에 생긴 뒤 검토한다.
- web gameplay controller: current hook의 mixed snapshot/reconnect replay ordering을 먼저 decoder/controller 경계와 함께 분리해야 한다.

서버/shared production source에는 seam을 추가하지 않았다.

## 14. P2/P3 migration handoff

### 14.1 P2 준비점

1. Room에 immutable stored `gameType`을 도입하되 기존 create wire에는 field를 추가하지 않고 누락을 `HANGUL_TILE` compatibility default로 해석한다.
2. composition root에 HANGUL-only registration/metadata를 조립한다.
3. registry는 exact lookup/unknown fail-closed와 enablement를 담당하되 giant `GameModule`이나 command bus를 만들지 않는다.
4. StateSnapshot v1에는 `gameType`을 추가하지 않는다. strict old client compatibility를 유지하고 public versioning은 P5A에서 결정한다.
5. existing event/service/DTO는 compatibility entry가 가리키는 현재 구현을 그대로 사용한다.

### 14.2 P3A 준비점

1. existing `cloneGameState`를 Hangul module-owned clone/validate adapter로 둔다.
2. persistence의 phase coherence 및 recovery reader가 Section 5.2의 최소 operational inspector/read model만 소비하게 한다.
3. deadline/turn/finished read는 optional capability로 분리한다.
4. projector를 Room/presence shell과 Legacy Hangul v1 game projection으로 나누되 마지막 strict v1 조합을 보존한다.
5. 이번 P1의 snapshot key/privacy와 clone/isolation tests를 이동하지 않고 계속 통과시킨다.

### 14.3 P3B/P3C 준비점

1. P3B는 existing `game:start`, `turn:submit`, `turn:draw`, `turn:pass` handler와 ack/event를 alias 그대로 보존하면서 Hangul compatibility facade에 위임한다.
2. P3C는 leave, presence streak reset, turn timeout, game deadline, finish transition의 Hangul decision을 optional server-action capability 뒤로 이동한다.
3. scheduler engine과 sweepers는 유지하고 concrete state extraction/action만 module-owned boundary로 이동한다.
4. `room:leave` transport의 active-turn peek도 operational inspection/advisory result로 대체한다.
5. Number/Gem placeholder, generic Tile/Rack/Turn/Result/Timer contract는 추가하지 않는다.

## 15. P1 명시적 비변경

다음은 구현하지 않았다.

- `gameType`, `GameModule`, `GameRegistry`, game state envelope
- `NUMBER_TILE`, `GEM_CARD`, catalog 또는 create-room game selection
- protocol v2, Socket.IO event/ack/error rename, StateSnapshot field 변경
- Room model/persistence format의 멀티게임 전환, JSON blob
- generic scheduler/result/command bus
- server/shared directory 이동 또는 Hangul namespace 이동
- UI 문구/흐름, route/storage key 변경
- dependency 또는 package/lockfile 변경
- Railway deploy

이 문서와 P1 tests는 P2/P3가 보존해야 하는 기준선이다. 신규 game 구현이 이 shape를 공통 모델로 재사용해야 한다는 뜻은 아니다.

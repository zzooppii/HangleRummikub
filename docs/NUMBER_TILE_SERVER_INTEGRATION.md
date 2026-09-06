# Number Tile Server Integration

> 상태: P7B IMPLEMENTED / P7C WEB INTEGRATED / P8 SOURCE E2E VERIFIED / PUBLIC DEPLOYMENT PENDING
> 기준 규칙: `number-tile-rules-v1`
> 적용 범위: shared wire, server application, persistence, projection, scheduling, admission

## 1. 경계와 호환성

P7B는 `NUMBER_TILE`을 두 번째 실제 server runtime game으로 연결했다. Runtime의 exact supported game type과 identity registration은 `HANGUL_TILE`, `NUMBER_TILE` 두 개다. `GEM_CARD`나 future placeholder는 없다. P7C Current Web도 exact 두 game capability, Home card, Number V2 renderer와 editor를 갖추었으며 server contract는 변경하지 않았다.

다음 기존 계약은 그대로 유지한다.

- realtime `protocolVersion = 1`
- Hangul flat `StateSnapshot` V1과 Hangul `PlatformSnapshotV2`
- `/room/{ROOM_CODE}`, join payload와 existing platform command/event names
- Hangul `turn:*`, `turn:started`, `game:finished` 동작

Number는 V1 표현으로 변환하지 않는다. `PlatformSnapshotV2`와 namespaced `number:*` command만 사용하며 Number-specific advisory event를 만들지 않는다.

## 2. Canonical Room과 persistence

`RoomRecord`는 미래 base type이나 opaque blob 대신 실제 두 상태만 표현하는 exact discriminated union이다.

```text
HangulRoomRecord { gameType: HANGUL_TILE, game: HangulGameState | null }
|
NumberTileRoomRecord { gameType: NUMBER_TILE, game: NumberTileGameState | null }
```

`RoomWriteCandidate`도 distributive union이므로 game type과 state의 상관관계를 유지한다. In-memory persistence는 canonical `Room.gameType`으로 exact state adapter를 고르고 silent fallback하지 않는다. 양쪽 adapter가 clone, structural validation과 최소 lifecycle inspection을 소유한다. Persistence는 Room identity, phase coherence, player set, CAS, storage revision, immutable game type과 atomic UoW만 소유한다.

Number adapter는 tiles, pool order, racks, Table/Joker placements, player maps/set, no-play tracker, Turn과 result를 detached clone하고 exact 106-tile conservation과 canonical result를 검증한다. Inspector는 RUNNING의 game/revision/turn/deadline 또는 FINISHED의 game/finishedAt만 반환한다. Number에는 overall game deadline 정보가 없다.

## 3. Connection capability와 admission

Snapshot capability와 game capability는 서로 독립이다.

```text
supportedSnapshotVersions -> selected snapshot wire version
supportedGameTypes        -> client가 표현·실행 가능한 product game set
```

`supportedGameTypes`는 non-empty bounded known-type array이며 duplicate, unknown, malformed value를 handshake에서 fail-closed한다. Field omission은 pre-P7B compatibility를 위해 effective `[HANGUL_TILE]`로 해석한다. 이 metadata는 connection-scoped이고 Room, Player, Session 또는 authorization state로 저장하지 않는다.

Number create/join/resume은 다음 두 조건을 모두 만족해야 한다.

1. effective supported game set에 `NUMBER_TILE`이 있다.
2. negotiated snapshot version이 2다.

검사는 create의 ID/code/session/idempotency 준비 전, join의 canonical Room 확인 후 Player/session mutation 전, resume의 primary binding/presence/streak reset 전 수행한다. Join payload에는 game type이 없고 canonical Room의 immutable value만 사용한다. Capability 주장 자체는 identity, membership, Host 또는 command authority를 부여하지 않는다. Public incompatibility는 `INCOMPATIBLE_GAME_CAPABILITY`로 snapshot negotiation failure와 구분한다.

## 4. Start와 command routing

Shared `game:start` event는 platform `GameStartRouter`가 canonical Room type으로 exact Hangul 또는 Number start capability에 한 번 위임한다. Number start는 Host, 2~4명, 모든 registered Player CONNECTED, current actor와 Room revision을 확인한 뒤 server ID/random/Clock으로 initial state를 만들고 UoW에서 commit한다. CONNECTED 상태를 읽은 presence lease와 actor authorization은 candidate 생성 뒤 UoW precondition에서 함께 재검증하므로, initial deal 직전 connection 상태가 바뀌면 `PLAYERS_NOT_CONNECTED`로 atomic reject한다.

- rack: player마다 14장
- pool: 2명 78장, 3명 64장, 4명 50장
- game revision: 0
- immutable shuffled turn order와 90초 Turn
- empty Table, initial-meld false, offline timeout streak 0
- overall game deadline 없음

Number gameplay events는 protocol v1에 additive하게 추가한 strict `number:submit`, `number:draw`, `number:pass`다. Payload에는 game type이나 client-selected Tile face/pool position이 없다. `NumberTileCommandRouter`는 canonical `NUMBER_TILE`만 확인하고 rule·pool·score를 계산하지 않는다. Hangul Room의 `number:*`와 Number Room의 legacy `turn:*`는 서로 fallback하지 않는다.

Transport는 handler entry에서 `receivedAt`을 한 번 capture해 그대로 service까지 전달한다. Existing Room lane, current-primary authorization, full-payload fingerprint, request ID, idempotency store와 UoW/CAS를 재사용한다. Rejected, stale, cross-game 또는 replay command는 canonical mutation을 추가하지 않는다.

## 5. Number application actions

`number:submit`은 actor/Turn/deadline/revision을 확인하고 P7A RuleEngine에 complete proposed Table을 전달한다. RuleEngine의 detached successful Table만 rack, initial-meld state와 no-play tracker에 반영한다. Rack empty면 `RACK_EMPTY`, 아니면 next eligible Turn으로 진행한다. Unknown/opponent/inaccessible physical tile probe는 모두 `INVALID_TILE_ACCESS`로 normalize한다.

`number:draw`는 non-empty pool에서 server RNG로 한 physical Tile을 고르고 rack +1, pool -1, tracker reset, revision +1과 immediate next Turn을 atomic commit한다. Client가 Tile이나 pool position을 선택하지 않는다. Validation/idempotency/current-state checks 전에는 RNG를 소비하지 않으며 duplicate replay는 두 번째 draw를 만들지 않는다.

현재 in-memory UoW API는 candidate factory를 deferred하게 받지 않는다. 따라서 위 검사를 통과한 뒤 최종 authorization/presence/CAS precondition이 경합으로 실패하면 canonical Room, revision, idempotency, ack와 draw 결과는 전혀 바뀌지 않지만 사용되지 않은 RNG entropy 한 번은 소비될 수 있다. 이는 gameplay state atomicity나 replay 결과를 깨지 않는 내부 제약이며, deferred UoW contract가 실제 두 game에서 필요하다고 검증되기 전에는 범용 abstraction으로 확장하지 않는다.

`number:pass`는 empty pool에서만 no-play를 기록한다. Eligible non-forfeited Players의 full consecutive cycle이면 P7A result engine으로 `STALEMATE`, 아니면 revision +1과 next Turn이다. Successful Submit은 tracker를 reset한다.

Public Number errors는 필요한 closed categories만 protocol catalog에 추가한다. Domain failure detail이나 physical Tile 존재 여부는 노출하지 않는다.

## 6. Timeout, reconnect, leave와 retention

Common Turn scheduler와 overdue recovery reader는 canonical Room type으로 concrete timeout service를 고른다. Hangul은 기존 60초 규칙, Number는 90초 규칙을 그대로 소유한다. Number active Turn identity/deadline은 restart recovery 대상이지만 Number game-deadline registration이나 fake infinite deadline은 없다.

Number timeout은 pool이 있으면 server draw를, empty면 no-tile 기록을 먼저 적용한다. Offline active Player의 두 번째 연속 timeout이면 해당 action 뒤 forfeit한다. 이후 `LAST_PLAYER_STANDING`, `STALEMATE`, next Turn 순으로 판정한다. Stale/duplicate scheduled identity는 extra draw, revision, streak, forfeit 또는 Turn을 만들지 않는다.

Successful Number resume은 Number-owned offline timeout streak만 0으로 reset하고 game revision, Table, pool과 rack을 바꾸지 않는다. PLAYING explicit leave는 platform Room/session UoW 안에서 Number forfeit action을 실행한다. Survivor 한 명이면 즉시 `LAST_PLAYER_STANDING`; Number는 `ALL_PLAYERS_FORFEITED`와 `TIME_LIMIT`을 만들지 않는다. Finished +30분과 playing all-offline +30분 retention/cleanup은 기존 platform policy다.

## 7. PlatformSnapshotV2와 privacy

V2는 phase와 game type이 상관된 여섯 branch를 strict하게 검증한다: Hangul/Number 각각 LOBBY, PLAYING, FINISHED. Number LOBBY는 `game = null`; PLAYING은 Number turn; FINISHED는 Number-specific result를 가진다.

Number public game projection은 game ID/revision, Table, pool count, Turn, player별 rack count/initial-meld/forfeit summary를 제공한다. Table ordinary face와 Joker assignment는 공개한다. Viewer private state에는 자기 rack physical descriptors만 있다. Pool Tile IDs/order, 상대 rack Tile IDs, session/persistence/idempotency/scheduler 내부 값은 PLAYING과 FINISHED 모두 노출하지 않는다.

Number command success와 timeout은 player별 authoritative V2 snapshot을 fan-out한다. Number용 `turn:started`, `game:finished` 또는 새 advisory는 emit하지 않는다. Hangul advisory ordering은 변경하지 않는다.

## 8. Current Web와 P8 gate

P7C Current Web은 handshake마다 `supportedGameTypes: [HANGUL_TILE, NUMBER_TILE]`과 snapshot versions `[2,1]`을 광고한다. Home catalog의 두 card는 create 선택만 소유하며 join/resume 뒤 renderer는 canonical V2 `room.gameType`을 따른다. Number V2를 Hangul V1로 변환하거나 local Home 선택으로 route하지 않는다.

Number-local TurnDraft/editor는 P7B projection/command를 그대로 사용한다. Giant `GameModule`, generic Tile/Rack/Turn/Result, generic `game:command`, Number advisory, persistent JSON state 또는 new dependency는 없다. 상세는 [NUMBER_TILE_WEB_IMPLEMENTATION.md](./NUMBER_TILE_WEB_IMPLEMENTATION.md)이며 P8이 two-game E2E/deployment stop gate다.

## 9. P7B verification checkpoint

- P7A baseline 784 tests를 삭제하거나 skip하지 않고 shared 75, web 109, server 694로 총 878 tests를 통과했다.
- Targeted gate는 shared contract, admission atomicity, exact two-state persistence, 2/3/4-player start, Submit/Draw/Pass, timeout/offline/resume/leave, all three Number results, V2 privacy, mixed-game routing, actual overdue recovery와 finished retention cleanup을 포함한다.
- Existing Hangul production-serving regression 5/5와 V1/V2 wire characterization을 유지했다.
- 실제 `npm run build` 산출물을 `npm start`로 구동한 raw A/B smoke에서 Number create, join, start, 90초 Turn, rack 14, pool 78, Draw 뒤 rack 15/pool 77/revision 1, opponent privacy, advisory 0, stable-player resume와 no-duplicate membership을 확인했다.
- P7B는 public Railway deploy를 수행하지 않는다. Current public deployment가 이 checkpoint를 포함하는지는 별도 manual deployment 확인 대상이며, process-memory 특성상 deploy/restart 시 active Room/Game/session은 사라진다.

## 10. P8 two-game integration gate

P8은 production implementation을 바꾸지 않고 다음 누락된 integration evidence를 추가했다.

- Raw `number:submit`의 exact-29 atomic rejection과 exact-30 RUN/GROUP success를 실제 transport → router → application → domain → UoW → viewer projection 경로로 검증한다.
- Pre-turn Table의 wrong ordinary Tile로 Joker 역할을 대체하면 atomic reject하고, actor rack의 exact ordinary replacement와 final Table의 동일 Joker `tileId` 재사용은 성공한다.
- 한 runtime에 Hangul V1 Room과 Number V2 Room을 동시에 두고 `turn:*`/`number:*` 양방향 wrong command와 cross-shaped payload가 상태, revision, idempotency와 advisory를 만들지 않음을 고정한다.
- 두 Room의 same-request-ID parallel Draw와 replay는 각 Room에서 한 번씩만 commit한다. Hangul은 기존 advisory를 유지하고 Number advisory는 0이다.
- Recovery scan은 Hangul 60초와 Number 90초 active Turn을 각각 반환하며 overall game deadline은 Hangul만 반환한다.
- Production-serving harness는 Number A/B explicit create, gameType 없는 join, shared start, idempotent Draw, private rack과 stable-player resume를 실제 HTTP/Socket.IO runtime에서 수행한다.

P8 source/local gate 결과는 shared 75, Web 142, server 699, 총 916 tests다. Railway 최신 deployment 확인 전 최종 상태는 `SOURCE_E2E_COMPLETE / DEPLOYMENT_PENDING_USER_ACTION`이다. 상세 matrix는 [MULTI_GAME_P8_TWO_GAME_E2E_GATE.md](./MULTI_GAME_P8_TWO_GAME_E2E_GATE.md)에 있다.

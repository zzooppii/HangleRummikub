# Multi-game Platform P5B — Snapshot Negotiation and Web Routing

> 상태: P5B COMPLETE / P5C READY
> 작성일: 2026-09-06
> 기준: P5A checkpoint `05cac94`, P5B shared 69 + web 105 + server 503 = 677/677 tests

## 1. 목적과 compatibility matrix

P5B는 P5A의 `PlatformSnapshotV2`를 production realtime path에 연결한다. snapshot 표현만 Socket connection별로 협상하며 command, advisory, Room/session, Hangul gameplay는 바꾸지 않는다.

| Client | capability | Server snapshot |
| --- | --- | --- |
| Legacy V1 | field 없음 | exact `StateSnapshot` V1 |
| New Web | `[2, 1]` | `PlatformSnapshotV2` |
| Explicit V1 | `[1]` | exact `StateSnapshot` V1 |
| Future-compatible | `[3, 2, 1]` | 현재 server의 최고 공통 version인 V2 |

같은 Room에서도 각 socket은 독립적으로 V1 또는 V2를 받는다. capability는 authorization, Player identity, Room `gameType` 또는 command permission의 근거가 아니다.

## 2. Negotiation

New Web은 Socket.IO handshake `auth.supportedSnapshotVersions`에 `[2, 1]`을 보낸다. Server middleware는 runtime schema로 명시적 metadata를 검증하고 server preference `[2, 1]`에서 client와 공통인 첫 version을 선택한다.

- capability field 부재: legacy compatibility mode V1
- malformed, empty, duplicate 또는 oversized list: `INVALID_SNAPSHOT_CAPABILITY`로 connection fail-closed
- 공통 version 없음: `INCOMPATIBLE_SNAPSHOT_VERSION`으로 connection fail-closed
- 명시적 capability를 보낸 뒤 mapping 오류: V1 silent downgrade 없음

협상 거절은 transient network failure가 아니므로 Web client는 같은 metadata로 자동 재접속하지 않는다. 명시적 incompatible 화면의 수동 Home 이동은 연결을 즉시 다시 열지 않아 안정적으로 빠져나온다.

선택값은 `socket.data.selectedSnapshotVersion`에만 있다. Room, Player, session credential, persistence 또는 browser `sessionStorage`에는 저장하지 않는다. disconnect/replacement 때 socket과 함께 사라지고 reconnect는 다시 협상한다.

## 3. Wire contract

Socket.IO event 이름은 계속 `state:snapshot` 하나이고 outer `protocolVersion`은 계속 `1`이다. 기존 `StateSnapshot`, `StateSnapshotSchema`, V1 ack/event schema와 legacy event maps는 exact V1 의미를 유지한다. P5B는 별도 additive contract만 제공한다.

```text
StateSnapshotWirePayload
  = StateSnapshot V1
  | PlatformSnapshotV2
```

Snapshot을 담는 create/join/resume/sync/start/submit/draw/pass success ack도 같은 socket 선택을 따른다. `turn:started`, `game:finished`, `session:replaced`, `room:closed`와 모든 client command payload는 변경하지 않는다.

## 4. Server selection and delivery

Server는 먼저 기존 `LobbyStateSnapshotProjector`로 viewer별 privacy-safe V1을 만든다. Selector는 같은 조회에서 얻은 canonical `RoomRecord.gameType`을 검증한다.

```text
canonical Room + viewer
  -> privacy-safe StateSnapshot V1
  -> socket.data.selectedSnapshotVersion
     -> 1: exact V1
     -> 2: P5A mapper(canonical Room.gameType, V1) -> strict V2
```

V1을 선택해도 corrupt/unsupported canonical game type을 Hangul로 추측하지 않는다. V2 mapping/validation 실패도 V1로 downgrade하지 않는다. Room fan-out은 active binding의 exact socket을 찾아 recipient별 selector를 호출한다. 이 공통 fan-out이 join/start/turn command뿐 아니라 disconnect, leave/presence, timeout, game deadline과 cleanup 전 authoritative delivery에도 적용된다. `state:sync`의 direct event와 모든 snapshot-bearing success ack도 같은 selector를 사용한다.

## 5. Web decoding and routing

Web realtime client는 V1/V2 union event와 ack를 strict하게 검증한다. 한 connection에서 처음 관찰한 snapshot version이 이후 바뀌면 incompatible state로 차단하며 reconnect 시 관찰값을 초기화하고 새 협상을 따른다.

Incoming snapshot은 다음 순서로 처리한다.

```text
raw payload
  -> version-aware decoder
     -> valid V1: LEGACY_HANGUL_V1 compatibility rule
     -> valid V2: canonical room.gameType 확인
        -> HANGUL_TILE: pure V2 -> legacy Hangul view adapter
        -> unsupported/invalid: explicit incompatible state
  -> phase-aware Room renderer decision
```

V1의 “legacy snapshot은 Hangul client를 뜻한다”는 규칙은 decoder 한 곳에 있다. 기존 malformed V1 PLAYING/FINISHED의 Lobby fallback은 P1 characterization대로 유지한다. V2는 LOBBY를 공통 Lobby로, PLAYING/FINISHED `HANGUL_TILE`을 현재 Hangul 화면으로 보낸다. future snapshot version, unsupported game type, malformed V2 projection은 Lobby/Home/Hangul로 fallback하지 않고 명시적 incompatible 화면을 표시하며 자동 navigation하지 않는다.

## 6. Transitional Hangul adapter

`adaptPlatformSnapshotV2ToLegacyHangulV1`은 strict `HANGUL_TILE` V2를 현재 화면/controller가 소비하는 V1-shaped view로 재배치한다. 이 함수는 rule, score, privacy 또는 Tile을 계산하지 않고 V2의 public/player/private 값을 옮긴 뒤 기존 V1 schema로 다시 검증한다.

이는 migration debt다. V2의 canonical `gameType` routing을 먼저 통과한 뒤에만 호출되므로 future game이 Hangul UI에 들어가지는 않는다. 두 번째 game renderer가 생길 때 Web controller가 normalized legacy Hangul state를 중심으로 소유하는 범위를 다시 줄인다.

## 7. TurnDraft, reconnect and session replacement

Adapter는 `gameId`, `gameRevision`, `turnId`, Player identity와 rack Tile identity를 그대로 보존한다. 따라서 기존 규칙이 유지된다.

- 같은 game revision/turn 및 presence-only update: dirty draft 유지
- canonical revision, turn 또는 game identity 변경: draft reset
- page refresh 또는 session replacement: draft discard
- reconnect: capability 재협상 후 same Player session resume, duplicate Player 없음

Reconnect 전후 revision vector가 같아도 renderer-routing metadata는 새 socket에서 받은 representation으로 갱신하되 canonical V1-shaped controller state는 교체하지 않는다. command request ID, retry/idempotency와 advisory-driven sync는 기존 owner를 유지한다.

## 8. Privacy and persistence boundary

V2는 이미 viewer별로 완성된 V1을 매핑하므로 own rack만 private state에 들어간다. 상대 rack Tile, bag Tile/order, credential, hash, socket/generation, storage revision, idempotency, scheduler/offline/stalemate internal state는 V1/V2 어느 쪽에도 추가되지 않는다.

Browser storage format은 변경하지 않는다. stored Player credential과 pending create/join operation은 snapshot version, supported versions와 `gameType`을 포함하지 않으며 strict schema가 오염된 extra field를 거절한다.

## 9. Scope boundary and rollback

P5B는 `NUMBER_TILE`, `GEM_CARD`, catalog, Home cards, room-create `gameType`, renderer mega-registry, generic command/event, persistence/scheduler redesign을 추가하지 않는다. 현재 enabled game과 internal Room default는 계속 `HANGUL_TILE` 하나다.

Rollback 시 P5B negotiation/union/Web routing layer를 제거하면 P5A의 latent V2 + exact V1 runtime으로 돌아간다. 배포 restart는 현재 process-memory Room/Game/session을 삭제하므로 public rollout 보고에서 별도 운영 제한으로 표시한다.

## 10. P5C gate

P5B의 mixed V1/V2 integration, Web decoding/routing, TurnDraft/reconnect, full Hangul regression, production serving과 public behavior가 모두 통과하고 checkpoint가 push된 뒤에만 P5C를 연다. P5C는 Home catalog와 explicit create-room game selection만 다루며 P5B snapshot negotiation을 다시 설계하지 않는다.

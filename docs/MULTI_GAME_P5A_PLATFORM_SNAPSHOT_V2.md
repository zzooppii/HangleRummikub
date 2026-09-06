# Multi-game Platform P5A — PlatformSnapshot V2 Contract

> 상태: P5A implementation checkpoint
> 작성일: 2026-09-06
> 기준: P4 checkpoint `60eb77e`, 631/631 tests

## 1. 목적과 범위

P5A는 기존 Legacy Hangul `StateSnapshot` v1을 교체하지 않고 platform Room shell과 game-specific projection을 분리한 새 contract를 준비한다. V2는 shared runtime schema와 pure server mapper로 검증되지만 production Socket.IO와 Web에는 연결하지 않는다.

이번 단계에서 그대로 유지하는 compatibility surface는 다음과 같다.

- `StateSnapshot` / `StateSnapshotSchema`의 기존 의미와 serialized shape
- realtime `protocolVersion = 1`
- `state:snapshot`을 포함한 10개 client event와 5개 server event
- command payload, ack/error, revision semantics
- `/`와 `/room/{ROOM_CODE}`
- current Web validator, session state와 Legacy Hangul renderer
- Hangul rules, privacy와 lifecycle behavior

## 2. Versioning 결정

새 contract의 이름은 `PlatformSnapshotV2`, runtime validator는 `PlatformSnapshotV2Schema`다. top-level literal `snapshotVersion: 2`가 representation discriminator다.

V2 snapshot object에는 `protocolVersion`을 넣지 않는다. `protocolVersion`은 현재 Socket.IO command/event compatibility 전체를 식별하는 값이고, `snapshotVersion`은 하나의 state representation을 식별한다. P5A는 realtime protocol negotiation을 구현하지 않으므로 둘을 같은 숫자로 올리거나 같은 의미로 재해석하지 않는다. production event는 계속 `protocolVersion: 1`과 V1 snapshot을 전달한다.

## 3. Contract 구조

```text
PlatformSnapshotV2
├─ snapshotVersion: 2
├─ versions
│  ├─ roomRevision
│  └─ presenceVersion
├─ serverTime
├─ room
│  ├─ roomId
│  ├─ roomCode
│  ├─ phase
│  ├─ gameType: HANGUL_TILE
│  └─ players[]
│     ├─ playerId
│     ├─ nickname
│     ├─ isHost
│     └─ connectionStatus
├─ self
│  └─ playerId
└─ game
   ├─ null                                      (LOBBY)
   └─ HangulTilePlaying/FinishedProjectionV2
      ├─ gameType: HANGUL_TILE
      ├─ gameRevision
      ├─ publicState
      ├─ playerStates[]
      │  ├─ playerId
      │  ├─ rackCount
      │  ├─ initialMeldCompleted
      │  └─ forfeited
      └─ privateState
         └─ rack                                (self only)
```

`playerId`가 platform identity와 Hangul player state의 join key다. nickname, Host와 presence는 Room shell에만 있고 rack progress와 forfeit는 Hangul projection에만 있다.

## 4. Phase 표현

### LOBBY

- `room.phase = LOBBY`
- `room.gameType = HANGUL_TILE`
- `game = null`
- fake initial Hangul state나 nullable game revision을 만들지 않는다.

### PLAYING

- `room.phase = PLAYING`
- `game.gameType = HANGUL_TILE`
- `publicState`는 기존 active Hangul public game schema다.
- `gameRevision`, Board, bag counts와 current turn은 Hangul projection에 있다.
- `privateState.rack`은 `self.playerId`의 rack만 가진다.

### FINISHED

- `room.phase = FINISHED`
- `game.gameType = HANGUL_TILE`
- `publicState`는 active turn이 없고 terminal Hangul result가 있는 기존 finished schema다.
- reason, winner IDs, ranking, score, penalty, remaining rack과 forfeit는 Hangul-specific result로 남는다.
- 종료 뒤에도 상대 rack detail은 공개하지 않는다.

## 5. Runtime invariant

모든 object schema는 strict하고 다음을 거부한다.

- missing/wrong `snapshotVersion`
- unknown extra key
- unsupported Room 또는 game projection type
- LOBBY의 non-null game
- PLAYING의 null/finished game
- FINISHED의 null/active game
- Room `gameType`과 game discriminator 불일치
- duplicate Room/game player, self가 없는 Room, 둘 이상의 Host
- Room player와 Hangul player-state/turn-order 집합 불일치
- self rack count 불일치
- duplicate private Tile 또는 Board/private rack Tile 중복
- malformed rack Tile metadata
- finished ranking과 player progress metadata 불일치

현재 supported `GameType`과 V2 projection은 `HANGUL_TILE` 하나다. `NUMBER_TILE`, `GEM_CARD`, `UNKNOWN`은 schema union에 placeholder가 없으며 fail-closed한다.

## 6. Projection 생성 전략

P5A는 다음 transitional path를 선택했다.

```text
canonical RoomRecord.gameType
          +
validated, player-private StateSnapshot v1
          ↓
mapLegacyStateSnapshotV1ToPlatformSnapshotV2
          ↓
PlatformSnapshotV2Schema parse
```

mapper는 두 입력을 runtime-validate하고 canonical type이 exact `HANGUL_TILE`인지 다시 확인한다. 이미 검증된 V1 field를 새 위치로 옮길 뿐 다음 작업은 하지 않는다.

- `RoomRecord.game` 또는 canonical private state 조회
- game rule, result, revision 계산
- rack/bag privacy 재판단
- GameRegistry lookup 또는 capability dispatch
- Socket.IO emission

이 선택은 P3A/P4에서 검증된 V1 privacy projection을 그대로 신뢰하여 P5A의 regression surface를 최소화한다.

## 7. Privacy와 semantic parity

A/B viewer별 V1 snapshot을 각각 mapper에 넣어 다음을 검증한다.

- Room ID/code/phase, Host, player order/identity/nickname/presence 동일
- Room/presence revision과 server time 동일
- Hangul game ID, Board, bag count, turn 또는 result 동일
- game revision과 player progress 동일
- 각 viewer의 own rack만 private state에 존재
- 상대 rack Tile ID와 bag Tile ID/order가 새로 나타나지 않음
- session/token/hash/socket/generation/storage/idempotency/scheduler/offline/stalemate 내부 key 없음
- FINISHED에서도 같은 privacy 적용

V1과 V2는 구조가 다르며 서로의 runtime schema로 parse되지 않는다.

## 8. Production wire isolation

P5A 이후에도 production path는 다음과 같다.

```text
LobbyStateSnapshotProjector
  → StateSnapshot V1
  → StateSnapshotDeliveryDataSchema
  → state:snapshot (protocolVersion 1)
  → Web validateStateSnapshotEvent
  → resolveLegacyHangulRoomView
```

source characterization은 다음을 고정한다.

- shared `realtime.ts`가 `StateSnapshotSchema`만 사용
- Socket.IO transport/composition이 V2 mapper를 import/call하지 않음
- mapper의 production consumer가 없음
- Web `.ts`/`.tsx` production source가 V2 symbol/version을 사용하지 않음
- App이 계속 `resolveLegacyHangulRoomView(app.snapshot)`을 사용

P5A에는 V2 opt-in, handshake, per-socket format choice, 새 event가 없다.

## 9. Shared ownership

- `platform/platform-snapshot-v2.ts`: platform shell, version, phase composition과 cross-section coherence
- `games/hangul-tile/v2-projection-contracts.ts`: Hangul public/private/player projection과 Tile/result coherence
- root `index.ts`: 새 symbol의 additive export
- 기존 `projections.ts`, `realtime.ts`, `validation.ts`: V1 의미 유지

`ConnectionStatusSchema`는 의미상 platform field지만 현재 mixed v1 `projections.ts`에서 import한다. P5A에서는 이를 옮겨 public compatibility risk를 늘리지 않는다.

## 10. Rollback과 migration debt

P5A contract는 production consumer가 없으므로 rollback은 새 V2 schema/mapper/export/test와 문서만 제거하면 되며 V1 wire rollback이나 data migration이 필요 없다.

남은 debt는 다음과 같다.

- mapper가 V1 projection shape에 의존하는 transitional coupling
- canonical gameType을 mapper caller가 정확한 Room에서 전달해야 하는 책임
- source-regex isolation test가 runtime wire test를 보완하는 characterization이라는 한계
- `RoomRecord.game: GameState | null` concrete Hangul type
- Web의 Legacy Hangul v1 decoder/renderer와 malformed projection → Lobby fallback
- version negotiation, incompatible version UX와 serializer architecture

P5B는 version negotiation, Web V2 decoding과 authoritative gameType routing만 다룬다. Home catalog/create selection은 P5C이며, 실제 second-game projection 전에는 future schema나 generic Result/Turn을 추가하지 않는다.

## 11. Regression gate

P5A는 P4의 631 tests를 삭제·skip하지 않고 다음 14 cases를 추가한다.

- shared 6: LOBBY/PLAYING/FINISHED, strict/coherence invalid matrix, unsupported games, V1/V2 runtime separation
- server 5: LOBBY/PLAYING/FINISHED mapping, invalid input/type, forbidden private key
- server 3: shared realtime, Socket.IO/composition, Web production wire isolation

최종 gate는 shared 65, web 91, server 489, 총 645 tests와 root typecheck/build, production-serving, `git diff --check`다.

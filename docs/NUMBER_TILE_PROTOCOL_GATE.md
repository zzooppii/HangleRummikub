# Number Tile Protocol Gate

> 상태: `AWAITING_RULE_DECISIONS`
> 작성일: 2026-09-06
> 범위: `NUMBER_TILE`의 conceptual wire·projection·compatibility contract
> 주의: 이 문서는 TypeScript schema, Socket.IO event 또는 runtime registration을 추가하지 않는다.

## 1. 목적과 현재 기준선

P5C 현재 runtime은 다음 상태다.

- `protocolVersion = 1`
- `GameTypeSchema`와 identity-only `GameRegistry`는 `HANGUL_TILE`만 지원
- `room:create`는 optional `gameType`; omission과 explicit `HANGUL_TILE`만 성공
- `/room/{ROOM_CODE}`, `room:join`, `session:resume`, `state:sync`는 URL/payload에서 game type을 추론하지 않음
- capability가 없으면 flat legacy StateSnapshot V1, `[2,1]`이면 `PlatformSnapshotV2`
- V2 `room.gameType`과 game projection union도 현재 exact `HANGUL_TILE` only
- existing `turn:submit`, `turn:draw`, `turn:pass`, `turn:started`, `game:finished`는 Hangul-specific payload 또는 result에 결합
- `RoomRecord.game`과 in-memory state adapter도 concrete Hangul `GameState`에 결합

따라서 `NUMBER_TILE`은 registry 값 하나를 추가해서 활성화할 수 없다. 규칙 승인 뒤 domain(P7A), shared/server integration(P7B), Web(P7C)을 모두 통과하기 전 catalog에 노출해서는 안 된다.

## 2. Platform commands reused

다음 command의 제품 의미와 outer transport는 재사용 가능하다. 실제 Number 지원은 해당 Phase에서 strict schema와 pre-mutation compatibility test를 추가해야 한다.

| Command | 재사용 방향 | Number-specific 주의점 |
| --- | --- | --- |
| `session:bootstrap` | 그대로 유지 | handshake game capability 결정(`NT-042`)과 별개로 credential은 platform-owned |
| `room:create` | existing optional `gameType` 사용 가능 | `NUMBER_TILE` schema/registration 이후에만 허용; exact client capability를 mutation 전에 검사 |
| `room:join` | payload에 gameType을 추가하지 않음 | canonical Room을 조회해 Number capability를 참가자 생성 전에 확인 |
| `session:resume` | same player/session mechanism 유지 | target Room이 Number이면 새 socket의 exact capability를 re-check |
| `state:sync` | snapshot re-delivery mechanism 유지 | socket에 negotiated된 compatible projection만 반환 |
| `room:leave` | platform envelope 유지 | PLAYING forfeit/result는 `NT-033`·`NT-034` Number lifecycle 규칙에 위임 |
| `game:start` | empty payload와 expected Room revision 재사용 가능성이 높음 | 현재 `GameStartService`는 Hangul state/timer/deal에 결합되어 있어 Number start implementation은 별도 |

Invitation URL은 계속 Room code만 포함한다. URL query/path, Home의 과거 선택 또는 join payload는 canonical game type의 권위가 아니다.

## 3. Conceptual Number commands

현재 권고안은 `NT-038` Option A다.

| Conceptual event | 역할 | 존재 조건 |
| --- | --- | --- |
| `number:submit` | Number 전용 complete proposed table 제출 | 항상 필요 |
| `number:draw` | single pool에서 server-selected draw | `NT-020`~`NT-022` 승인 시 |
| `number:pass` | explicit no-play action | `NT-023`에서 command를 채택할 때 |

기존 `turn:submit`은 `proposedBoard`, `turn:draw`는 consonant/vowel `bagKind`를 요구하므로 Number command로 재해석하지 않는다. 현재 Hangul events와 adapters는 그대로 유지한다.

## 4. Proposed payloads

다음은 wire 설계를 검토하기 위한 pseudotype이다. 필드명·normalization·size limit은 P7B schema가 아니며 관련 decision 승인 전 확정되지 않는다.

```ts
type NumberSubmitCommandCandidate = {
  kind: "number:submit";
  protocolVersion: 1; // NT-039 Option A를 승인한 경우
  requestId: RequestId;
  expectedGameRevision: GameRevision;
  turnId: TurnId;
  payload: {
    proposedTable: {
      melds: Array<{
        meldId: string;
        kind: "GROUP" | "RUN";
        tiles: Array<
          | { tileId: TileId; kind: "NUMBER" }
          | {
              tileId: TileId;
              kind: "JOKER";
              assignedNumber: number;
              assignedColor: NumberTileColor;
            }
        >;
      }>;
    };
  };
};

type NumberDrawCommandCandidate = {
  kind: "number:draw";
  protocolVersion: 1; // NT-039 Option A를 승인한 경우
  requestId: RequestId;
  expectedGameRevision: GameRevision;
  turnId: TurnId;
  payload: {};
};

type NumberPassCommandCandidate = {
  kind: "number:pass";
  protocolVersion: 1; // NT-039 Option A를 승인한 경우
  requestId: RequestId;
  expectedGameRevision: GameRevision;
  turnId: TurnId;
  payload: {};
};
```

`meldId`가 canonical identity인지 client-local ordering key인지, GROUP ordering을 fingerprint에서 canonicalize할지, Joker assignment를 placement에 둘지는 P7A domain shape를 본 뒤 P7B에서 결정한다. client가 tile face value를 별도로 보내고 서버가 믿는 구조는 금지한다. 서버는 `tileId`로 canonical tile을 찾는다.

## 5. Atomic Submit direction

Number rearrangement에는 operation-by-operation mutation보다 Number-owned whole `ProposedTable`이 적합한 후보로 보인다.

```text
wire strict validation
  -> authenticated current-primary actor
  -> canonical Room.gameType dispatch
  -> Room lane / phase / revision / turn / deadline validation
  -> detached candidate
  -> ownership + physical conservation
  -> every final GROUP/RUN + Joker assignment
  -> initial-meld or normal-turn legality
  -> terminal/result calculation
  -> one Room/game/idempotency commit
  -> viewer-specific V2 snapshots
```

이 방식은 drag 중의 temporary invalid table을 server state에 만들지 않는다. validation failure, stale revision, deadline failure 또는 unsupported capability는 Room, game revision, storage revision과 accepted idempotency record를 변경하지 않는다.

`ProposedTable`은 Number 전용이다. Hangul `ProposedBoard`를 union으로 늘리거나 `GenericBoard`로 이름만 바꾸지 않는다.

## 6. Revision and idempotency

`NT-040` 제안은 Number game이 자기 canonical gameplay revision과 immutable turn identity를 갖는 것이다.

- game start snapshot의 Number revision은 0
- successful submit/draw/pass/timeout/forfeit처럼 canonical game state를 바꾼 commit마다 1 증가
- rejected/no-op command와 presence-only 변화에는 증가하지 않음
- 모든 Number player action은 `expectedGameRevision`, `turnId`, `requestId`를 전달
- router는 revision을 변경하지 않고 Number application/domain path가 Room lane 안에서 검사·commit

Idempotency fingerprint 후보:

| Command | fingerprint input |
| --- | --- |
| submit | action kind + expected revision + turn ID + canonicalized complete proposed table |
| draw | action kind + expected revision + turn ID |
| pass | action kind + expected revision + turn ID |

Room/player는 fingerprint 내부가 아니라 idempotency repository의 scope다. 서버가 결정한 drawn tile은 request fingerprint에 넣지 않는다. 같은 accepted request의 replay는 저장된 non-secret terminal response/result를 재사용하고, transport는 현재 canonical Room에서 viewer별 snapshot을 다시 project한다. 같은 scope/request ID의 다른 fingerprint는 conflict다. 이것을 범게임 불변 조건으로 승격하는 일은 Number 구현 검증 뒤 P9에서 판단한다.

## 7. Projection requirements

Number projection은 player별로 만들어야 하며 public table과 viewer의 private rack을 명시적으로 분리한다.

Conceptual PLAYING projection:

```ts
type NumberTilePlayingProjectionCandidate = {
  gameType: "NUMBER_TILE";
  gameId: GameId;
  gameRevision: GameRevision;
  remainingTileCount: number;
  table: {
    melds: readonly NumberMeldView[];
  };
  playerStates: readonly {
    playerId: PlayerId;
    rackCount: number;
    initialMeldCompleted: boolean;
    forfeited: boolean;
  }[];
  turn: null | {
    turnId: TurnId;
    activePlayerId: PlayerId;
    deadlineAt?: ServerTime;
  };
  privateState: {
    rack: readonly NumberTileView[];
  };
};
```

Conceptual FINISHED projection은 terminal table과 Number-specific result를 포함하고 turn은 없다. 상대 rack 공개 범위는 `NT-035` 결정에 따른다. LOBBY는 Number state가 없더라도 canonical `room.gameType = NUMBER_TILE`을 전달해야 한다.

## 8. PlatformSnapshot V2 integration

현재 `PlatformSnapshotV2Schema`는 Room의 세 phase와 game projection 모두 literal `HANGUL_TILE`이다. P6에서는 union을 수정하지 않는다.

P7B 이후 필요한 방향:

```text
PlatformSnapshotV2
  = Lobby(HANGUL_TILE | NUMBER_TILE, game = null)
  | Playing(HANGUL_TILE, HangulTilePlayingProjectionV2)
  | Finished(HANGUL_TILE, HangulTileFinishedProjectionV2)
  | Playing(NUMBER_TILE, NumberTilePlayingProjectionV2)
  | Finished(NUMBER_TILE, NumberTileFinishedProjectionV2)
```

필수 invariants:

- `snapshotVersion === 2`
- `room.gameType === game.gameType` in PLAYING/FINISHED
- Room player IDs와 Number `playerStates` exact set 일치
- viewer의 private rack count가 자기 `playerStates.rackCount`와 일치
- no Number game state in LOBBY
- unknown game type/projection/version은 Hangul 또는 Lobby로 fallback하지 않음

기존 flat V1에는 `gameType`이 없고 Hangul shape만 표현할 수 있으므로 Number snapshot을 V1으로 down-convert하지 않는다.

## 9. Client capability and admission gate

현재 Socket.IO handshake의 `supportedSnapshotVersions: [2,1]`은 wire version만 말한다. P5B Web도 V2를 이해하지만 decoder와 renderer는 `HANGUL_TILE`만 이해하므로 “V2 지원”은 “NUMBER_TILE 지원”과 동치가 아니다.

`NT-042` 권고:

```ts
// conceptual only
auth: {
  supportedSnapshotVersions: [2, 1],
  supportedGameTypes: ["HANGUL_TILE", "NUMBER_TILE"]
}
```

- metadata가 없으면 legacy `HANGUL_TILE` only로 해석
- malformed/unknown entry는 handshake 또는 exact use 지점에서 fail-closed
- Number create는 Room/player/session/idempotency mutation 전에 capability 확인
- Number join은 canonical Room lookup 뒤 player/session mutation 전에 capability 확인
- Number resume과 primary replacement는 새 socket capability를 다시 확인
- capability는 connection metadata이지 Room/session credential이나 persistence state가 아님

권고하지 않는 대안:

- selected snapshot version 2만 확인: 기존 Hangul-only V2 Web을 구분하지 못함
- join/bind 뒤 incompatible UI 표시: ghost membership, Host/capacity side effect와 session ambiguity를 이미 만듦

실패에는 existing `INCOMPATIBLE_PROTOCOL`을 재사용할 수 있는지 P7B에서 wire compatibility를 검토한다. P6에서는 error enum을 수정하지 않는다.

## 10. Privacy

Projection과 command error 모두 private tile 존재를 누설하지 않아야 한다.

- own rack: exact tile ID와 face/Joker detail
- other racks: count only; FINISHED policy는 `NT-035`
- table: placed physical tile과 public Joker assignment
- pool: count only
- forbidden: pool order/IDs, opponent rack IDs, RNG state, credential/token hash, socket ID, connection generation, storage revision, idempotency data, scheduler descriptors
- unauthorized tile reference는 “그 tile이 존재하지만 네 것이 아님”을 구별하지 않는 normalized gameplay error로 반환

`INVALID_TILE_ACCESS` 같은 existing normalized category를 재사용할지 Number-specific code를 둘지는 P7B error taxonomy에서 결정한다.

## 11. Server actions

Rule decisions에 따른 optional server action은 다음과 같다.

| Action | 필요 조건 | Platform mechanism | Number-owned decision |
| --- | --- | --- | --- |
| Turn timeout | `NT-025` timer 채택 | Clock, scheduler registration/cancellation, overdue safe delivery | `NT-026` action과 `NT-034` offline streak |
| Game deadline | `NT-027` deadline 채택 | game deadline scheduler/recovery | finish reason, ordering, score |
| Explicit leave | 항상 platform command 존재 | Room lane, session removal, cleanup | PLAYING forfeit·result candidate |
| Presence restored | reconnect mechanism 재사용 | connection lease/presence version | offline streak reset 여부 |
| Retention/cleanup | Room lifecycle mechanism 재사용 | finishedAt 기반 cleanup | Number lifecycle inspection seam |

현재 `LegacyHangulServerActionRouter`와 `LegacyHangulPlayerLifecycleActions`는 exact Hangul capability다. 이를 이름만 generic하게 바꾸지 않고 Number 규칙에 맞는 별도 implementation과 최소 dispatch seam을 P7B에서 설계한다.

## 12. Error categories

Conceptual 분류이며 shared error code 추가가 아니다.

| Platform/shared candidate | Number-specific candidate |
| --- | --- |
| unauthenticated/session/Room not found | invalid meld |
| Host/phase/current-primary | initial meld below threshold |
| not your turn/expired turn | initial meld own tiles only |
| stale Room/game revision | no new rack tile |
| request ID reused | invalid Joker assignment/recovery |
| incompatible client capability | invalid proposed table / conservation |
| internal/configuration failure | pool empty / pass not allowed |

Error naming과 protocolVersion 정책은 `NT-038`·`NT-039` 선택과 함께 결정한다. 내부 detail, tile ownership과 solver 정보는 public message에 노출하지 않는다.

## 13. Command protocol options

### Option A — additive game-specific events (`PROPOSED_DEFAULT`)

```text
game:start
number:submit
number:draw
number:pass   # only if rule exists
```

장점:

- existing Hangul `turn:*` surface와 의미가 섞이지 않음
- each payload가 closed strict schema라 runtime validation과 telemetry가 명확
- 현재 architecture에 가장 작은 additive change
- giant command bus 없이 canonical `Room.gameType` router를 둘 수 있음

단점:

- game 수가 늘 때 event map이 늘어남
- 일부 transport helper 중복이 생길 수 있음

### Option B — generic closed `game:command`

```ts
{ command: { kind, payload } }
```

장점:

- outer transport event는 하나
- 이후 games의 action union을 한 dispatch 지점에 둘 수 있음

단점:

- outer event만 보고 command schema를 고를 수 없어 canonical Room lookup 뒤 per-game strict parse가 필요
- per-game strict validation, ack/result typing과 version negotiation이 복잡
- 두 번째 game 전부터 generic command bus를 고정할 위험
- 현재 Hangul v1 adapters와 migration surface가 커짐

### Option C — `number:command` + closed Number action union

Number 내부 event 수는 줄지만 submit/draw/pass ack가 union이 되고 handler가 먼저 action kind를 분기한다. A보다 이점이 작고 B보다 범위가 좁다.

어느 option에서도 client payload의 `gameType`은 dispatch authority가 아니다. Room-authenticated scope로 canonical Room을 읽어 exact game capability와 schema를 선택한다. 현재 권고는 Option A이며, P9 abstraction review에서 두 실제 game router를 비교한 뒤 공통 transport surface를 다시 판단한다.

### Command protocol version (`NT-039`)

- A (`PROPOSED_DEFAULT`): outer `protocolVersion = 1`을 유지하고 `number:*`를 additive strict events로 추가한다. Number capability가 없는 client는 Number Room mutation 전에 차단하며 existing Hangul command/event schema는 그대로다.
- B: `protocolVersion = 2` client만 Number commands를 사용할 수 있게 하고 v1은 Hangul compatibility surface로 유지한다. handshake, ack/error versioning과 dual runtime cost가 커진다.

Snapshot의 `snapshotVersion = 2`와 realtime command `protocolVersion`은 서로 다른 축이다. `NT-039=A`도 Number client capability와 Number V2 projection을 요구하며, V2 snapshot 지원만으로 Number command 지원을 추론하지 않는다.

## 14. Advisory options

현재 `turn:started`는 deadline을 필수로 하고 `game:finished`는 Hangul finish reason에 결합되어 있어 Number에 그대로 재사용할 수 없다.

- A (`PROPOSED_DEFAULT`): Number 첫 구현은 snapshot-bearing ack와 player별 `state:snapshot` V2만 authoritative delivery로 사용. 별도 Number advisory 없음.
- B: secret-free `number:turn-started`, `number:finished`를 추가하고 event gap은 state sync만 유발.
- C: 새 versioned generic advisory를 설계하되 Hangul v1 events는 유지.

어느 선택에서도 advisory는 권위 상태가 아니며 snapshot fan-out 뒤/기존 ordering policy에 맞춰 중복에 안전해야 한다.

## 15. Platform reuse matrix

| 분류 | 현재 요소 | 판단 |
| --- | --- | --- |
| `REUSE_AS_IS` | Room ID/code, Host/Player membership, immutable canonical gameType | 게임 규칙과 무관한 identity/lifecycle shell |
| `REUSE_AS_IS` | session/bootstrap/resume, ConnectionRegistry, presence | Number draft/rule을 넣지 않음 |
| `REUSE_AS_IS` | invitation `/room/{ROOM_CODE}`, join payload no gameType | server Room snapshot이 renderer 권위 |
| `REUSE_AS_IS` | Room UoW/CAS, storageRevision, KeyedSerialExecutor | state adapter/envelope 확장은 필요하지만 mechanism은 유지 |
| `REUSE_AS_IS` | requestId/idempotency storage, snapshot negotiation mechanism, fan-out | command fingerprint와 projection은 Number-owned |
| `REUSE_AS_IS` | identity-only GameRegistry semantics | P6에서 capability를 추가하지 않음 |
| `LIKELY_REUSE` | `game:start` outer event와 Host/Room checks | existing service는 Hangul deal/timer에 결합 |
| `LIKELY_REUSE` | game revision, turn ID/order, Clock, RandomSource, ID source | `NT-025`, `NT-037`, `NT-040` 승인 후 검증 |
| `LIKELY_REUSE` | Turn/Game scheduler mechanisms, recovery, retention | timer/deadline/lifecycle decisions 후 adapter 필요 |
| `LIKELY_REUSE` | PlatformSnapshot V2 outer shell | current concrete schema/mapper/Web decoder는 Hangul-only |
| `GAME_SPECIFIC` | inventory, pool, rack, Table/Meld, Joker | Number domain owns all semantics |
| `GAME_SPECIFIC` | initial meld, rearrangement, draw/pass, timeout/stalemate | Number RuleEngine and application actions |
| `GAME_SPECIFIC` | score/result, private projection, error detail | Hangul format을 공통화하지 않음 |
| `GAME_SPECIFIC` | Number commands/router, state clone/inspection, Web draft/renderer | P7A~P7C에서 각각 구현 |

## 16. Current implementation blockers

| Blocker | 현재 사실 | 해소 Phase |
| --- | --- | --- |
| Rules | `NT-001`~`NT-037`, `NT-043`, `NT-044` 미승인 | P6 decision follow-up |
| Game type | `SUPPORTED_GAME_TYPES`가 `HANGUL_TILE` only | P7B, domain 완료 후 |
| Persistence state | `RoomRecord.game: GameState | null`; in-memory adapter가 LOBBY에도 exact Hangul type 요구 | P7B의 typed multi-game state/storage seam |
| Snapshot schema | V2 Room/game union literal `HANGUL_TILE` only | P7B |
| Projection mapper | current V1→V2 mapper/projector가 Hangul only | P7B |
| Start | current service가 Hangul initial deal/turn/deadline 생성 | P7B Number start path |
| Commands | `turn:*` payload와 router가 Hangul only | `NT-038`·`NT-039`, P7B |
| Server actions | timeout/deadline/lifecycle capabilities가 Hangul only | rule decisions, P7B |
| Client admission | snapshot version metadata만 있고 supported game metadata 없음 | `NT-042`, P7B/P7C coordinated rollout |
| Web | catalog, decoder, view/controller/editor가 Hangul only | P7C, server/domain complete 후 |
| Result/error | current event/error set에 Hangul concepts 혼재 | P7B, Number-specific contract only |

이 blocker를 해결하기 전에 catalog에 Number card를 추가하면 안 된다. 특히 membership mutation 뒤 snapshot projection에 실패하는 구조를 만들지 않는다.

## 17. Unresolved rule dependencies

- inventory/rack/player decisions은 initial deal과 start projection을 결정한다.
- GROUP/RUN/Joker/initial meld/rearrangement는 `ProposedTable` validation과 error categories를 결정한다.
- Draw/Pass는 command set과 idempotency fingerprint를 결정한다.
- timer/timeout/deadline은 turn projection, scheduler capability와 race semantics를 결정한다.
- forfeit/stalemate/score는 FINISHED projection과 result schema를 결정한다.
- privacy는 projection validator와 Web rendering을 결정한다.
- protocol/advisory/client capability decisions은 P7B/P7C rollout 순서를 결정한다.

## 18. Implementation gate

- 현재 상태는 `AWAITING_RULE_DECISIONS`다.
- P7A는 core rule IDs 승인과 그 결과의 canonical `number-tile-rules-v1` 기록 전 `NOT_READY`다.
- P7B는 domain 완료와 `NT-035`, `NT-038`~`NT-042` 승인 전 `NOT_READY`다.
- P7C는 server/shared contract 완료와 `NT-036` 승인 전 `NOT_READY`다.
- P7A~P7C 전체가 통과할 때까지 `NUMBER_TILE` registration/catalog/public create를 enable하지 않는다.
- P6에서는 `GameType`, registry, protocol, snapshot schema, Web 또는 server source를 변경하지 않는다.

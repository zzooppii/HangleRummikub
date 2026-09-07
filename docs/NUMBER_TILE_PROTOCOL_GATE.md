# Number Tile Protocol Gate

> 상태: `IMPLEMENTED` — P6/P7A/P7B/P7C/P8 COMPLETE / PUBLIC TWO-GAME VERIFIED / P9A READY
> 확정일: 2026-09-06
> 사용자 결정: `ALL:A` + consistency blocker clarification A/A/A
> 범위: `NUMBER_TILE`의 confirmed wire·projection·compatibility contract와 P7B 구현 결과

## 1. 목적과 현재 기준선

P6가 이 문서를 확정할 당시 P5C runtime은 다음 상태였다.

- `protocolVersion = 1`
- `GameTypeSchema`와 identity-only `GameRegistry`는 `HANGUL_TILE`만 지원
- `room:create`는 optional `gameType`; omission과 explicit `HANGUL_TILE`만 성공
- `/room/{ROOM_CODE}`, `room:join`, `session:resume`, `state:sync`는 URL/payload에서 game type을 추론하지 않음
- capability가 없으면 flat legacy StateSnapshot V1, `[2,1]`이면 `PlatformSnapshotV2`
- V2 `room.gameType`과 game projection union도 현재 exact `HANGUL_TILE` only
- existing `turn:submit`, `turn:draw`, `turn:pass`, `turn:started`, `game:finished`는 Hangul-specific payload 또는 result에 결합
- `RoomRecord.game`과 in-memory state adapter도 concrete Hangul `GameState`에 결합

P7A는 독립 domain을, P7B는 shared/server integration을 완료해 이 결합을 실제 두-game 경계로 바꿨다. P7C는 exact Web capability, renderer와 catalog item을 추가해 브라우저 vertical slice를 완성했다. 상세 server 구현은 [NUMBER_TILE_SERVER_INTEGRATION.md](./NUMBER_TILE_SERVER_INTEGRATION.md), Web 구현은 [NUMBER_TILE_WEB_IMPLEMENTATION.md](./NUMBER_TILE_WEB_IMPLEMENTATION.md)에 기록한다.

## 2. Platform commands reused

다음 command의 제품 의미와 outer transport는 재사용 가능하다. 실제 Number 지원은 해당 Phase에서 strict schema와 pre-mutation compatibility test를 추가해야 한다.

| Command | 재사용 방향 | Number-specific 주의점 |
| --- | --- | --- |
| `session:bootstrap` | 그대로 유지 | 확정된 handshake game capability와 별개로 credential은 platform-owned |
| `room:create` | existing optional `gameType` 사용 가능 | `NUMBER_TILE` schema/registration 이후에만 허용; exact client capability를 mutation 전에 검사 |
| `room:join` | payload에 gameType을 추가하지 않음 | canonical Room을 조회해 Number capability를 참가자 생성 전에 확인 |
| `session:resume` | same player/session mechanism 유지 | target Room이 Number이면 새 socket의 exact capability를 re-check |
| `state:sync` | snapshot re-delivery mechanism 유지 | socket에 negotiated된 compatible projection만 반환 |
| `room:leave` | platform envelope 유지 | PLAYING explicit leave 즉시 forfeit와 last-standing 판정은 Number lifecycle 규칙에 위임 |
| `game:start` | empty payload와 expected Room revision 재사용 | 현재 `GameStartService`는 Hangul state/timer/deal에 결합되어 있어 Number start implementation은 별도 |

Invitation URL은 계속 Room code만 포함한다. URL query/path, Home의 과거 선택 또는 join payload는 canonical game type의 권위가 아니다.

## 3. Confirmed conceptual Number commands

`NT-038` Option A가 확정됐다.

| Conceptual event | 역할 |
| --- | --- |
| `number:submit` | Number 전용 complete proposed table 제출 |
| `number:draw` | single pool에서 server-selected 1장 Draw 후 turn 종료 |
| `number:pass` | pool이 empty일 때만 허용되는 explicit no-play action |

기존 `turn:submit`은 `proposedBoard`, `turn:draw`는 consonant/vowel `bagKind`를 요구하므로 Number command로 재해석하지 않는다. 현재 Hangul events와 adapters는 그대로 유지한다.

## 4. Conceptual payloads

다음은 확정된 conceptual direction을 나타내는 pseudotype이다. 실제 필드명·normalization·size limit과 TypeScript/Zod 표현은 P7B에서 확정한다.

```ts
type NumberSubmitCommandCandidate = {
  kind: "number:submit";
  protocolVersion: 1;
  requestId: RequestId;
  expectedGameRevision: GameRevision;
  turnId: TurnId;
  payload: {
    proposedTable: {
      melds: Array<{
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
  protocolVersion: 1;
  requestId: RequestId;
  expectedGameRevision: GameRevision;
  turnId: TurnId;
  payload: {};
};

type NumberPassCommandCandidate = {
  kind: "number:pass";
  protocolVersion: 1;
  requestId: RequestId;
  expectedGameRevision: GameRevision;
  turnId: TurnId;
  payload: {};
};
```

Stable meld identity는 도입하지 않는다. Array ordering과 GROUP fingerprint canonicalization, Joker assignment의 concrete representation은 P7A domain shape를 본 뒤 P7B에서 정하되 gameplay rule을 바꾸지 않는다. Client가 ordinary tile face value를 보내고 서버가 믿는 구조는 금지한다. 서버는 `tileId`로 canonical tile을 찾고 Joker의 claimed number/color assignment를 meld context와 함께 검증한다.

## 5. Atomic Submit direction

Number rearrangement는 operation-by-operation server mutation이 아니라 Number-owned whole `ProposedTable`로 처리한다.

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

`NT-040`에 따라 Number game은 자기 canonical gameplay revision과 immutable turn identity를 갖는다.

- game start snapshot의 Number revision은 0
- successful submit/draw/pass/timeout/forfeit처럼 canonical game state를 바꾼 commit마다 1 증가
- rejected/no-op command와 presence-only 변화에는 증가하지 않음
- 모든 Number player action은 `expectedGameRevision`, `turnId`, `requestId`를 전달
- router는 revision을 변경하지 않고 Number application/domain path가 Room lane 안에서 검사·commit

Idempotency fingerprint direction:

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
    deadlineAt: ServerTime;
  };
  privateState: {
    rack: readonly NumberTileView[];
  };
};
```

Conceptual FINISHED projection은 terminal table과 Number-specific discriminated result를 포함하고 turn은 없다. `RACK_EMPTY`와 `LAST_PLAYER_STANDING`은 exact winner IDs와 player별 penalty/score/forfeited를, `STALEMATE`는 그 정보에 confirmed competition ranking을 함께 제공한다. 상대 rack detail은 공개하지 않고 count/value/result summary만 제공한다. Number result reason은 이 세 가지뿐이며 `TIME_LIMIT`과 `ALL_PLAYERS_FORFEITED`는 포함하지 않는다. LOBBY는 Number state가 없더라도 canonical `room.gameType = NUMBER_TILE`을 전달해야 한다.

## 8. PlatformSnapshot V2 integration

현재 `PlatformSnapshotV2Schema`는 Room의 세 phase와 game projection 모두 literal `HANGUL_TILE`이다. P6에서는 union을 수정하지 않는다.

P7B에서 구현할 확정 방향:

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

`NT-042` 확정 requirement:

```ts
// conceptual only
auth: {
  supportedSnapshotVersions: [2, 1],
  supportedGameTypes: ["HANGUL_TILE", "NUMBER_TILE"]
}
```

- Number admission은 `selectedSnapshotVersion === 2`와 exact `supportedGameTypes`의 `NUMBER_TILE` 포함을 모두 요구한다. 어느 하나만 만족하면 incompatible이다.
- metadata가 없으면 legacy `HANGUL_TILE` only로 해석
- malformed/unknown entry는 handshake 또는 exact use 지점에서 fail-closed
- Number create는 Room/Player/session promotion/idempotency acceptance 전에 두 조건을 확인
- Number join은 canonical Room lookup 뒤 Player/session/idempotency mutation 전에 두 조건을 확인
- Number resume과 primary replacement는 connection binding과 presence transition 전에 새 socket의 두 조건을 다시 확인
- Number state sync와 command도 stored Room type과 connection capability를 대조
- capability는 connection metadata이지 Room/session credential이나 persistence state가 아님

Rejected alternatives:

- selected snapshot version 2만 확인: 기존 Hangul-only V2 Web을 구분하지 못함
- join/bind 뒤 incompatible UI 표시: ghost membership, Host/capacity side effect와 session ambiguity를 이미 만듦

실패에 existing `INCOMPATIBLE_PROTOCOL`을 재사용할지 Number-capability-specific safe error를 둘지는 P7B에서 wire compatibility를 검토한다. P6에서는 error enum을 수정하지 않는다.

## 10. Privacy

Projection과 command error 모두 private tile 존재를 누설하지 않아야 한다.

- own rack: exact tile ID와 face/Joker detail
- other racks in PLAYING: `rackCount` only
- other racks in FINISHED: rack tile detail 없이 `remainingRackCount`, `remainingRackValue`, score 같은 result summary only
- table: placed physical tile과 public Joker assignment
- pool: count only
- forbidden: pool order/IDs, opponent rack IDs, RNG state, credential/token hash, socket ID, connection generation, storage revision, idempotency data, scheduler descriptors, offline-timeout streak, full-no-play tracker internals
- unauthorized tile reference는 “그 tile이 존재하지만 네 것이 아님”을 구별하지 않는 normalized gameplay error로 반환

`INVALID_TILE_ACCESS` 같은 existing normalized category를 재사용할지 Number-specific code를 둘지는 P7B error taxonomy에서 결정한다.

## 11. Server actions

확정 규칙에 필요한 server action은 다음과 같다.

| Action | 필요 조건 | Platform mechanism | Number-owned rule |
| --- | --- | --- | --- |
| Turn timeout | 90초 turn deadline | Clock, scheduler registration/cancellation, overdue safe delivery | pool draw/no-tile turn, offline streak와 second-timeout forfeit |
| Explicit leave | 항상 platform command 존재 | Room lane, session removal, cleanup | PLAYING 즉시 forfeit, last-standing/result |
| Presence restored | reconnect mechanism 재사용 | connection lease/presence version | successful resume의 offline streak reset |
| Retention/cleanup | Room lifecycle mechanism 재사용 | finishedAt 기반 cleanup | Number lifecycle inspection seam |

Number Tile v1에는 overall game deadline, `TIME_LIMIT` finish reason과 GameDeadlineScheduler capability가 없다.

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

Error naming은 P7B의 closed schema 작업에서 정한다. `protocolVersion = 1` additive direction은 확정됐으며 내부 detail, tile ownership과 solver 정보는 public message에 노출하지 않는다.

## 13. Command protocol decision record

### Selected Option A — additive game-specific events (`CONFIRMED`)

```text
game:start
number:submit
number:draw
number:pass
```

장점:

- existing Hangul `turn:*` surface와 의미가 섞이지 않음
- each payload가 closed strict schema라 runtime validation과 telemetry가 명확
- 현재 architecture에 가장 작은 additive change
- giant command bus 없이 canonical `Room.gameType` router를 둘 수 있음

단점:

- game 수가 늘 때 event map이 늘어남
- 일부 transport helper 중복이 생길 수 있음

### Rejected Option B — generic closed `game:command`

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

### Rejected Option C — `number:command` + closed Number action union

Number 내부 event 수는 줄지만 submit/draw/pass ack가 union이 되고 handler가 먼저 action kind를 분기한다. A보다 이점이 작고 B보다 범위가 좁다.

Client payload의 `gameType`은 dispatch authority가 아니다. Room-authenticated scope로 canonical Room을 읽어 exact game capability와 schema를 선택한다. P9 abstraction review에서 두 실제 game router를 비교할 수 있지만 P7 구현은 확정된 Option A를 따른다.

### Command protocol version (`NT-039`)

- Selected A (`CONFIRMED`): outer `protocolVersion = 1`을 유지하고 `number:*`를 additive strict events로 추가한다. Number capability가 없는 client는 Number Room mutation 전에 차단하며 existing Hangul command/event schema는 그대로다.
- Rejected B: `protocolVersion = 2` client만 Number commands를 사용할 수 있게 하고 v1은 Hangul compatibility surface로 유지한다.

Snapshot의 `snapshotVersion = 2`와 realtime command `protocolVersion`은 서로 다른 축이다. `NT-039=A`도 Number client capability와 Number V2 projection을 요구하며, V2 snapshot 지원만으로 Number command 지원을 추론하지 않는다.

## 14. Advisory decision record

현재 `turn:started`는 deadline을 필수로 하고 `game:finished`는 Hangul finish reason에 결합되어 있어 Number에 그대로 재사용할 수 없다.

- Selected A (`CONFIRMED`): Number는 snapshot-bearing ack와 player별 `state:snapshot` V2만 authoritative delivery로 사용한다. `turn:started`, `game:finished`, Number-specific advisory를 emit하지 않는다.
- Rejected B: secret-free `number:turn-started`, `number:finished` 추가.
- Rejected C: 새 versioned generic advisory 추가.

Existing Hangul advisory behavior는 그대로 유지한다. Number의 authoritative UI 전이는 ack와 viewer별 V2 snapshot으로만 결정한다.

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
| `LIKELY_REUSE` | game revision, turn ID/order, Clock, RandomSource, ID source | 확정 Number semantics로 concrete reuse 검증 필요 |
| `LIKELY_REUSE` | Turn scheduler/recovery mechanism과 retention | 90초 timer/lifecycle에 맞는 adapter 필요; Game deadline capability는 없음 |
| `REUSE_VERIFIED` | PlatformSnapshot V2 outer shell | strict Hangul/Number branch를 Web이 canonical game type으로 route |
| `GAME_SPECIFIC` | inventory, pool, rack, Table/Meld, Joker | Number domain owns all semantics |
| `GAME_SPECIFIC` | initial meld, rearrangement, draw/pass, timeout/stalemate | Number RuleEngine and application actions |
| `GAME_SPECIFIC` | score/result, private projection, error detail | Hangul format을 공통화하지 않음 |
| `GAME_SPECIFIC` | Number commands/router, state clone/inspection, Web draft/renderer | P7A~P7C에서 각각 구현 |

## 16. P7B implementation status

| Prerequisite | P7B 결과 | 남은 Phase |
| --- | --- | --- |
| Game type | exact `HANGUL_TILE | NUMBER_TILE`; identity-only Registry에 두 registration | 없음 |
| Persistence state | exact two-game Room union과 game별 clone/inspection adapter | 없음 |
| Snapshot schema | phase×gameType correlated V2 Hangul/Number union; Number V1 없음 | 없음 |
| Projection | Hangul V1/V2 보존 + player-specific Number V2 projector | 없음 |
| Start | shared `game:start`가 canonical Room type으로 exact start path dispatch | 없음 |
| Commands | legacy Hangul `turn:*` 유지 + strict protocol v1 `number:*` | 없음 |
| Server actions | common Turn mechanism이 concrete timeout을 dispatch; Number game deadline 없음 | 없음 |
| Client admission | independent `supportedGameTypes`; Number는 advertised support + selected V2 필수 | Current Web이 exact 두 game을 광고 |
| Web | canonical Number V2 decoder/renderer와 독립 TurnDraft/editor | P7C 완료 |
| Result/error | Number-owned result projection과 closed safe error mapping | 없음 |

P7C는 Web capability, Number V2 renderer와 독립 TurnDraft/editor를 연결했다. Catalog에는 구현된 Hangul/Number 두 game만 있으며 다음 배포 stop gate는 P8이다.

## 17. Confirmed implementation consequences

- 확정 inventory/rack/player rules가 initial deal과 start projection을 결정한다.
- GROUP/RUN/Joker/initial meld/rearrangement rules가 whole `ProposedTable` validation과 error categories를 결정한다.
- Draw/Pass rules가 exact command set과 idempotency fingerprint를 결정한다.
- 90초 timer와 timeout rules가 turn projection, Turn scheduler capability와 race semantics를 결정한다. Overall game deadline은 없다.
- Leave/forfeit/stalemate/score rules가 FINISHED projection과 Number-specific result schema를 결정한다.
- FINISHED privacy와 draft rules가 projection validator와 Web rendering을 결정한다.
- Protocol v1 `number:*`, no-advisory, V2-only, exact game capability decisions이 P7B/P7C rollout 순서를 결정한다.

## 18. Implementation gate

- P6와 P7A는 `COMPLETE`이며 canonical ruleset은 `number-tile-rules-v1`이다.
- P7B는 shared/server runtime integration을 완료했다.
- P7C Current Web은 exact `[HANGUL_TILE, NUMBER_TILE]` capability를 광고하고 strict Number V2 projection만 Number renderer로 전달한다.
- Home catalog는 구현된 두 game을 공개하며 join과 URL에는 game type을 추가하지 않았다.
- Number-local draft/editor와 `number:submit/draw/pass` client가 준비됐고 P8 public two-game gate까지 완료했다. 다음 별도 단계는 P9A two-game abstraction analysis다.

구체 Web 구조와 reconnect/accessibility 제한은 [NUMBER_TILE_WEB_IMPLEMENTATION.md](./NUMBER_TILE_WEB_IMPLEMENTATION.md)를 따른다.

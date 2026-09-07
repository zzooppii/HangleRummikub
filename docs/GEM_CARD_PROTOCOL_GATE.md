# GEM_CARD Protocol Gate

> 상태: `PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED`
> 기준 checkpoint: `3f6f9be refactor: extract proven game primitives`
> 범위: P10 문서 설계만 해당하며 shared/server/Web runtime contract는 변경하지 않음
> 연관 규칙: `GC-001`~`GC-038` — [GEM_CARD_GAME_RULES.md](./GEM_CARD_GAME_RULES.md)

## 1. 목적과 현재 runtime 기준선

이 문서는 세 번째 게임 `GEM_CARD`를 구현하기 전에 platform command 재사용 범위, game-specific command 후보, `PlatformSnapshotV2` projection, capability admission, revision/idempotency, server action과 privacy 요구를 고정하기 위한 protocol gate다. 아래 pseudotype과 event 이름은 모두 **conceptual candidate**이며 사용자가 관련 `GC-*` 결정을 확정하고 P11B가 strict TypeScript/Valibot contract를 구현하기 전에는 public wire가 아니다.

현재 production 기준선은 다음과 같다.

- `protocolVersion = 1`
- runtime `GameType`, identity-only `GameRegistry`, exact Room union은 `HANGUL_TILE | NUMBER_TILE`만 지원
- `PlatformSnapshotV2`와 realtime event map도 두 game만 지원
- capability가 없는 client는 `HANGUL_TILE` legacy mode이며 `NUMBER_TILE`은 selected snapshot V2와 exact game capability가 모두 필요
- `RoomRecord`는 exact `HangulRoomRecord | NumberTileRoomRecord`
- Home/catalog/decoder/renderer에는 두 production game만 존재
- `GEM_CARD` identifier, registration, command, projection, Web capability와 catalog item은 없음

P10에서는 이 기준선을 변경하지 않는다. 특히 `GEM_CARD` placeholder, `game:command`, giant `GameModule`, generic state/result/turn/card abstraction을 추가하지 않는다.

현재 source에서 확인한 P11 integration seam은 다음과 같다.

| Current source | 확인된 제약/재사용점 |
| --- | --- |
| `packages/shared/src/game-type.ts` | exact `HANGUL_TILE | NUMBER_TILE`; capability max length도 supported type 집합에서 파생 |
| `apps/server/src/model/persistence.ts` | exact two-game discriminated Room union |
| `apps/server/src/application/room-session-service.ts` | shared create/join/session path와 현재 global max 4 |
| `apps/server/src/application/room-admission-policy.ts` | exact game capability + selected snapshot version admission; 현재 V2-only rule은 Number literal branch |
| `apps/server/src/application/game-start-router.ts` | canonical Room type으로 두 concrete start capability를 explicit dispatch |
| `apps/server/src/application/player-lifecycle-router.ts` | leave/presence consequence를 두 concrete game으로 explicit dispatch |
| `apps/server/src/application/scheduled-turn-router.ts` | optional common timer identity를 두 concrete timeout transition으로 dispatch |
| `packages/shared/src/platform/platform-snapshot-v2.ts` | exact phase×game union이지만 outer refinement에 tile-game `rack` assumption이 존재 |
| `packages/shared/src/realtime.ts` | legacy event map과 V2-capable `SnapshotWireClientToServerEvents`가 분리됨 |
| `apps/web/src/lib/room-snapshot-view.ts`, `apps/web/src/App.tsx` | canonical V2 game type을 두 exact renderer branch로 route |
| `apps/web/src/features/game-catalog/game-catalog.ts` | server Registry와 독립인 Web-owned two-game product metadata |

따라서 P11은 이 지점에 exact third branch를 추가하되, P10에서 미리 registry/module framework를 만들지 않는다.

## 2. Authority와 공통 invariant

GEM_CARD가 구현되더라도 authority는 기존 platform 원칙을 유지한다.

- Room의 immutable canonical `gameType`만 command/projector/router 선택의 근거다. URL, event 이름, client local selection과 payload의 claimed game type은 권위가 아니다.
- 모든 wire input은 strict runtime schema로 검사하고 extra field, oversized collection과 unknown discriminant를 거절한다.
- current-primary actor, membership, phase, revision과 turn identity를 server가 검증한다.
- Room mutation lane 안에서 detached candidate를 검증한 뒤 Room/game/idempotency를 한 번에 commit한다.
- client가 계산한 price, permanent discount, score, market refill, supply 또는 terminal result를 신뢰하지 않는다.
- hidden deck order, private reserved card와 credential/storage/scheduler 내부 정보는 viewer별 projection 밖으로 나가지 않는다.
- wrong-game command는 다른 concrete game으로 fallback하지 않고 mutation 전에 fail-closed한다.

게임 규칙의 exact 의미는 `GC-001`~`GC-038` 확정 전까지 미정이다.

## 3. 재사용할 platform commands

| Command | 재사용 방향 | GEM_CARD gate |
| --- | --- | --- |
| `session:bootstrap` | 그대로 재사용 | credential 발급은 game-independent |
| `room:create` | optional `payload.gameType`에 `GEM_CARD`를 P11B에서 additive하게 허용 가능 | `GC-001`, `GC-031`; registration·V2·capability를 Room/Player/session/idempotency mutation 전에 확인 |
| `room:join` | payload에 game type을 추가하지 않음 | canonical Room lookup 후 capability를 Player/session mutation 전에 확인 |
| `session:resume` | same Player/session mechanism 재사용 | 새 connection의 V2 + exact GEM capability를 binding/presence 전 다시 확인 |
| `state:sync` | negotiated viewer snapshot 재전송 | GEM Room은 V2 only; V1 down-conversion 금지 |
| `room:leave` | outer command와 Room/session cleanup 재사용 | PLAYING consequence는 `GC-023`, `GC-025`에 따른 concrete GEM lifecycle action |
| `game:start` | 기존 event와 `expectedRoomRevision` 재사용 후보 | Host/readiness는 `GC-031`, capacity/setup/turn order는 `GC-001`, `GC-032`, deck/market은 `GC-005`, `GC-006`, `GC-033`, `GC-037` |

초대 URL은 계속 `/room/{ROOM_CODE}`다. Join URL과 join payload에 game type을 넣지 않는다.

## 4. Game-specific command strategy — `GC-029`

### Option A — additive strict GEM events (`PROPOSED DEFAULT`)

```text
game:start
gem:collect
gem:purchase
gem:reserve          // GC-010에서 reserve를 채택한 경우만
gem:yield            // GC-026의 NO_PROGRESS 규칙을 채택한 경우만
```

`gem:purchase`는 market와 own reserved source를 strict discriminated payload로 구분하는 방향을 우선 제안한다. 별도 `gem:purchase-reserved` event보다 purchase legality·cost calculation의 한 owner를 유지하면서 source access만 분기할 수 있다. 다만 reserve를 채택하지 않으면 reserved branch도 존재하지 않는다.

장점:

- Hangul `turn:*`, Number `number:*`와 payload 의미가 섞이지 않는다.
- action별 closed schema, error, idempotency fingerprint와 telemetry가 명확하다.
- market/resources/reserve가 없는 game에 해당 개념을 강제하지 않는다.
- current explicit router/composition style과 맞는다.

비용:

- event map과 transport handler가 늘어난다.
- reserve/no-progress rule 결정에 따라 event set이 달라진다.

### Option B — one `gem:command` event + closed GEM action union

GEM 내부 event 수는 줄지만 ack와 error가 넓은 union이 되고 transport에서 action discriminant를 한 번 더 해석해야 한다. Option A보다 의미가 명확하지 않아 기본안으로 권장하지 않는다.

### Option C — generic `game:command`

선택하지 않는다. Canonical Room lookup 뒤 open/generic payload dispatch를 요구해 strict validation과 exact ack typing을 약화하고 P9의 `KEEP_CONCRETE` 결정을 거스른다.

Number처럼 GEM-specific `turn:started`/`game:finished` advisory는 기본적으로 추가하지 않고, snapshot-bearing ack와 viewer별 authoritative `state:snapshot`을 source of truth로 쓰는 안을 `GC-029`의 일부로 제안한다. 현재 `turn:started`와 `game:finished`는 Hangul-specific deadline/result에 결합돼 있으므로 GEM에 재해석하지 않는다.

GEM `game:start` success ack는 exact GEM PLAYING V2 snapshot을, 각 GEM action success ack는 `GC-017`/`GC-018`의 terminal timing에 따라 exact GEM PLAYING 또는 FINISHED V2 snapshot을 담는 후보로 둔다. Outer Room-scoped ack/error envelope와 `state:snapshot` event 이름은 재사용한다.

## 5. Common command envelope — `GC-030`

각 canonical GEM player action은 다음 existing primitive를 opt-in으로 재사용하는 안을 제안한다.

```ts
type GemTurnCommandCandidate<TKind extends string, TPayload> = {
  kind: TKind;
  protocolVersion: 1;
  requestId: RequestId;
  expectedGameRevision: GameRevision;
  turnId: TurnId;
  payload: TPayload;
};
```

- start는 기존 `game:start`의 `expectedRoomRevision`을 사용하고 game revision/turn ID를 보내지 않는다.
- start 성공 시 `gameRevision = 0`을 proposed baseline으로 둔다.
- successful canonical action commit은 `nextGameRevision`을 사용해 정확히 1 증가한다.
- reject, stale, timeout stale callback, replay와 presence-only 변화는 추가 증가가 없다.
- active action마다 immutable `turnId`를 사용한다. timer를 쓰지 않아도 stale prior-turn action을 구별하는 identity로 유효하다.
- Proposed one-main-action model에서는 successful collect/purchase/reserve/yield가 해당 Turn을 끝내고 fresh next-turn identity를 만든다. Terminal precedence가 먼저 만족되면 next Turn을 만들지 않는다. 이 동작은 `GC-029`/`GC-030`과 함께 확정한다.
- timer를 채택하면 transport가 handler entry에서 capture한 `receivedAt`을 concrete GEM service까지 그대로 전달하고 `GC-020`/`GC-021`의 deadline rule에 사용한다. Client time은 판정 근거가 아니다.

이 방향 자체가 `GC-030 USER_DECISION_REQUIRED`다. `GenericTurn`이나 revision service를 만들지 않는다.

## 6. Candidate payloads

다음 pseudotype은 payload ownership을 보여주기 위한 것으로 field 이름, resource ID, max length와 exact union은 확정 contract가 아니다.

### 6.1 Collect — `GC-002`, `GC-004`, `GC-007`, `GC-008`

```ts
type GemCollectPayloadCandidate = {
  selections: readonly {
    resourceType: GemResourceType;
    count: number;
  }[];
  // GC-008이 limit + same-action return을 확정한 경우에만 존재
  returns?: readonly {
    resourceType: GemResourceType;
    count: number;
  }[];
};
```

서버는 canonical supply, selection pattern, total count, per-type count, post-action holding limit과 conservation을 검증한다. Limit 초과를 해결하기 위해 별도 반쯤 완료된 turn state를 만들지 않는다. `GC-008`이 limit과 반환 선택을 채택하면 collect/return을 하나의 atomic payload로 처리하는 방향을 우선한다.

### 6.2 Purchase — `GC-003`, `GC-009`, `GC-014`

```ts
type GemPurchasePayloadCandidate = {
  source:
    | { kind: "MARKET"; cardId: GemCardId }
    | { kind: "RESERVED"; cardId: GemCardId };
};
```

`RESERVED` branch는 reserve가 enabled일 때만 존재한다. Server가 canonical card cost, permanent production/discount, basic resource payment, wildcard shortfall, supply return, ownership, score와 market refill을 계산한다. Client-computed effective cost, discount, score 또는 refill card는 payload에 넣지 않는다. `GC-003`/`GC-009`/`GC-014`가 복수의 합법적 payment allocation을 만들 경우에만 server-verifiable explicit payment choice를 추가 검토한다.

### 6.3 Reserve — `GC-010`~`GC-013`, `GC-028`, `GC-034`

```ts
type GemReservePayloadCandidate = {
  source:
    | { kind: "MARKET"; cardId: GemCardId }
    | { kind: "DECK"; category: GemCardCategory };
};
```

Reserve disabled이면 event/schema 자체를 만들지 않는다. Blind deck reserve 가능 여부, reserve capacity, resulting privacy, wildcard reward와 exhausted deck behavior는 각각 `GC-010`~`GC-013`, `GC-028`, `GC-034`가 확정해야 한다. Client는 hidden deck top의 card ID를 보내지 않는다.

### 6.4 Yield — `GC-026`

```ts
type GemYieldPayloadCandidate = {};
```

`gem:yield`는 proposed `GC-026`에서 collect/purchase/reserve 중 어느 legal action도 없는 player에게만 허용하고, eligible players의 consecutive full yield cycle이 `NO_PROGRESS` 종료를 만드는 안을 선택할 때만 존재한다. 일반적인 free pass가 아니며 서버가 legal-action absence를 계산한다. 다른 action commit 또는 eligible-player set 변화에 대한 tracker reset은 `GC-026`에서 확정해야 한다.

## 7. Strict validation과 atomic mutation

모든 GEM action은 다음 순서를 따른다.

```text
strict wire validation
  -> authenticated socket/session context
  -> canonical Room.gameType === GEM_CARD routing
  -> Room lane
  -> idempotency preflight
  -> current-primary actor / Room membership
  -> canonical type + phase + game revision + turn identity (+ deadline if enabled)
  -> detached GEM candidate
  -> card/resource ownership, availability and conservation
  -> game-specific rule validation
  -> refill/score/end computation
  -> one Room/game/idempotency UoW commit
  -> viewer-specific V2 ack/snapshot fan-out
```

실패하면 Room/game/storage revision, supply, resources, cards, market, accepted idempotency, turn과 server action registration이 모두 그대로여야 한다. Concurrent purchase/reserve/collect는 같은 Room lane에서 직렬화하고 먼저 commit한 canonical state를 다음 command가 다시 읽는다.

## 8. Idempotency fingerprint

`GC-030`이 proposed revision strategy를 승인하는 경우의 candidate다.

| Command | Canonical fingerprint input |
| --- | --- |
| `gem:collect` | action kind + expected revision + turn ID + ordered/canonical resource selection + optional return selection |
| `gem:purchase` | action kind + expected revision + turn ID + source kind + referenced card ID |
| `gem:reserve` | action kind + expected revision + turn ID + source kind + public card ID 또는 deck category |
| `gem:yield` | action kind + expected revision + turn ID |

Scope는 existing Room/player command scope를 재사용한다. Hidden refill card, RNG outcome와 server-computed payment/result는 request fingerprint에 넣지 않는다. Accepted replay는 추가 mutation 없이 stored non-secret terminal result를 재사용하고 transport는 current canonical Room에서 viewer별 snapshot을 다시 project한다. 같은 scope/request ID의 다른 fingerprint는 `REQUEST_ID_REUSED`다.

## 9. PlatformSnapshotV2 projection requirements

GEM은 Legacy V1 표현을 만들지 않고 exact `PlatformSnapshotV2` branch만 추가하는 방향이다.

```text
Lobby(GEM_CARD)
  room.gameType = GEM_CARD
  game = null

Playing(GEM_CARD)
  platform shell + exact GemCardPlayingProjectionV2

Finished(GEM_CARD)
  platform shell + exact GemCardFinishedProjectionV2
```

Existing Room-scoped ack와 `state:snapshot` event의 `versions.gameRevision` numeric representation은 유지한다. GEM Lobby에서는 `null`, PLAYING/FINISHED에서는 exact GEM projection의 `gameRevision`과 같아야 한다. `roomRevision`과 `presenceVersion`은 계속 platform mutation 의미이며 GEM action rule이 직접 계산하지 않는다.

Conceptual PLAYING projection:

```ts
type GemCardPlayingProjectionCandidate = {
  gameType: "GEM_CARD";
  gameId: GameId;
  gameRevision: GameRevision;
  market: readonly {
    category: GemCardCategory;
    cards: readonly PublicGemCardView[];
    remainingDeckCount: number;
  }[];
  resourceSupply: readonly {
    resourceType: GemResourceType;
    count: number;
  }[];
  playerStates: readonly {
    playerId: PlayerId;
    resourceCount: number;
    publicResources?: readonly GemResourceCount[];
    production: readonly GemProductionCount[];
    purchasedCards: readonly PublicGemCardView[];
    reservedCardCount: number;
    score: number;
    forfeited: boolean;
  }[];
  turn: {
    turnId: TurnId;
    turnNumber: number;
    activePlayerId: PlayerId;
    deadlineAt?: ServerTime;
  };
  privateState: {
    resources?: readonly GemResourceCount[];
    reservedCards?: readonly PrivateGemReservedCardView[];
  };
};
```

Optional fields above는 final schema에서 optional로 남기라는 뜻이 아니다. `GC-020`, `GC-027`, `GC-028` 결정 후 exactly one strict shape를 고른다. Public purchased-card identity/effect와 production/score, exact resources 또는 count-only policy도 rule/privacy decision과 일치해야 한다.

`GC-015`가 special ability를 선택한 경우에만 public card view에 그 exact original ability discriminant를 추가한다. `GC-035`가 objective system을 선택한 경우에만 public/private policy가 확정된 concrete objective projection을 추가한다. 빈 future field나 open effect payload를 미리 두지 않는다.

FINISHED projection은 final public market/supply/player state와 concrete GEM result를 포함하고 active turn은 없다. Result field는 scoring source `GC-016`, target/end trigger `GC-017`, round completion `GC-018`, tie-break `GC-019`, leave/last-player/no-progress의 `GC-023`, `GC-025`, `GC-026`이 요구하는 exact score, winner/tie/forfeit 정보만 가진다. `GenericResult`와 tile-game penalty/ranking shape를 사용하지 않는다.

`GC-038`이 확정할 canonical `rulesVersion`/`cardSetVersion`은 persisted GEM state validation과 original dataset provenance에 필요하다. 기존 두 game처럼 wire projection에 노출할 실제 client requirement가 입증되지 않으면 snapshot에는 넣지 않는다.

### Existing V2 blocker

현재 `PlatformSnapshotV2` outer validator의 `privateRackMatchesSelfCount`는 Hangul/Number `playerStates.rackCount`와 `privateState.rack` 길이 일치를 platform-level invariant처럼 검사한다. GEM에 fake Rack을 추가하면 안 된다. P11B에서는:

- Room player와 game player identity-set 일치는 platform shell invariant로 유지하고,
- Rack correlation은 Hangul/Number exact game schema가 소유하게 하며,
- GEM은 resource/reserve privacy correlation을 자기 exact schema에서 검사하고,
- V1과 기존 Hangul/Number V2 key set/privacy가 바뀌지 않도록 golden tests를 통과해야 한다.

이것은 giant projection framework나 schema factory를 만들라는 뜻이 아니라, 이미 드러난 rack-specific outer coupling을 좁은 wire/privacy migration으로 해소해야 한다는 뜻이다.

`GC-001`이 5명을 허용하면 현재 Room service의 `MAX_ROOM_PLAYERS = 4`와 V2의 `LobbyPlatformPlayersV2Schema`/`ActivePlatformPlayersV2Schema` max 4도 별도 platform compatibility change가 필요하다. Proposed 2~4를 택하면 이 blocker는 발생하지 않는다.

## 10. Capability와 admission

P11B/P11C의 conceptual handshake:

```ts
auth: {
  supportedSnapshotVersions: [2, 1],
  supportedGameTypes: ["HANGUL_TILE", "NUMBER_TILE", "GEM_CARD"]
}
```

Admission requirement:

- GEM create/join/resume/state-sync/command는 `selectedSnapshotVersion === 2`와 exact `supportedGameTypes`의 `GEM_CARD` 포함을 모두 요구한다.
- capability가 없거나 Hangul/Number만 광고한 client, V1-only client는 GEM Room mutation/binding 전에 거절한다.
- malformed/duplicate/unknown game capability는 fail-closed한다.
- connection capability는 representation/admission metadata일 뿐 Room, Player 또는 Session에 persist하지 않는다. Reconnect마다 다시 협상한다.
- Lobby create는 Room/Player/session/idempotency state를 만들기 전에, join은 canonical Room lookup 뒤 새 Player를 만들기 전에 검사한다.
- unsupported client가 URL 또는 stale local state로 GEM renderer를 강제할 수 없다.
- V2 snapshot의 canonical `room.gameType`과 exact GEM projection이 일치하지 않으면 Web은 explicit incompatible state로 차단하고 Hangul/Number/Lobby로 fallback하지 않는다.

P11B가 server/shared support를 추가해도 Current Web이 GEM decoder/renderer를 갖추기 전에는 Web `supportedGameTypes`와 Home catalog에 GEM을 넣지 않는다. P11C에서 exact decoder/renderer가 준비된 뒤 capability를 광고하고, production catalog enablement는 P12 gate가 통제한다. Identity-only `GameRegistry`는 계속 `{ gameType }`만 보유한다.

## 11. Server actions와 optional scheduler

| Server action | Platform reuse | Concrete GEM decision |
| --- | --- | --- |
| Turn timeout | Clock, `TurnScheduler`, scheduled identity, stale/duplicate no-op와 recovery mechanism은 opt-in 재사용 | timer `GC-020`, fallback `GC-021`을 확정한 경우에만 GEM timeout transition 추가 |
| Overall deadline | `GameDeadlineScheduler`는 optional mechanism | `GC-022`가 deadline을 선택한 경우에만 GEM deadline transition/recovery 추가 |
| Explicit leave | `room:leave`, Room lane, session cleanup 재사용 | `GC-023`, `GC-025`, result/end semantics는 GEM-owned |
| Presence restored | reconnect/presence mechanism 재사용 | offline streak reset은 `GC-024`가 해당 정책을 채택한 경우에만 GEM-owned mutation |
| Retention/cleanup | all-offline/finished retention과 process-local resource cleanup 재사용 | GEM lifecycle inspector는 running/finished/optional active deadlines만 노출 |
| Market refill | scheduler가 아님 | purchase/reserve와 같은 atomic GEM commit에서 `GC-033`, `GC-034`대로 처리 |

Timer가 없으면 GEM state와 projection에 deadline을 강제하지 않고 scheduler registration, active-turn recovery deadline과 timeout router capability를 추가하지 않는다. Overall deadline도 동일하게 opt-in이다. Offline two-timeout forfeit를 Hangul/Number에서 복사하지 않고 `GC-024`의 독립 결정으로 둔다.

## 12. Privacy matrix

| Data | Public candidate | Owner-only candidate | Never expose |
| --- | --- | --- | --- |
| face-up market | card ID, cost, production/effect, points | 없음 | refill 전 hidden deck card/order |
| deck | category별 remaining count | 없음 | exact order, hidden card IDs, RNG state |
| resource supply | type별 current count | 없음 | internal mutation metadata |
| player resources | `GC-027`에 따라 exact type/count 또는 total count | public이 아니면 owner exact holdings | another player's hidden resource breakdown |
| purchased cards/production | proposed public identity/effect/count/score | 없음 | internal cached calculations |
| reserved cards | `GC-012`, `GC-028`에 따라 identity 또는 count | hidden policy이면 owner exact card | unauthorized viewer의 hidden card ID/cost/effect |
| result | confirmed public score/winner/tie/forfeit summary | 없음 | private holdings beyond confirmed final disclosure |
| platform/session | Player identity, nickname, Host, presence | own `self.playerId` | session token/hash, socket ID/generation, storage revision, idempotency record, scheduler descriptor |

Forbidden resource/reserved-card probe는 “존재하지만 네 것이 아님”과 “존재하지 않음”을 외부에서 구분하지 않는 safe error로 normalize한다. FINISHED에서 hidden reserved/resource detail을 자동 공개하지 않는다. 공개 전환은 `GC-027`/`GC-028`의 명시적 결정이 있어야 한다.

## 13. Conceptual error taxonomy

다음은 후보 category이며 P10에서 shared enum을 변경하지 않는다.

| Existing platform/shared category | GEM-specific candidate | Rule dependency |
| --- | --- | --- |
| `INVALID_PAYLOAD` | `INVALID_RESOURCE_SELECTION` | `GC-002`, `GC-007`, `GC-008` |
| `INCOMPATIBLE_GAME_CAPABILITY` | `CARD_NOT_AVAILABLE` | `GC-005`, `GC-006`, `GC-014`, `GC-033`, `GC-034` |
| auth/session/Room not found | `INSUFFICIENT_RESOURCES` | `GC-003`, `GC-009`, `GC-014` |
| `HOST_ONLY`, invalid phase/readiness | `RESOURCE_SUPPLY_EMPTY` | `GC-004`, `GC-007`, `GC-013` |
| `NOT_YOUR_TURN`, optional `TURN_EXPIRED` | `RESOURCE_LIMIT_EXCEEDED` | `GC-008` |
| stale Room/game revision | `RESERVE_NOT_ENABLED` / `RESERVE_LIMIT_REACHED` | `GC-010`, `GC-011` |
| `REQUEST_ID_REUSED` | `INVALID_RESERVED_CARD_ACCESS` | `GC-012`, `GC-014`, `GC-028` |
| `INTERNAL_ERROR` | `ACTION_NOT_AVAILABLE` / `YIELD_NOT_ALLOWED` | `GC-026` |

P11B는 confirmed rules에 실제 필요한 error만 strict shared enum/schema에 additive하게 추가한다. Private card/resource, deck order, exact reason calculation과 internal IDs를 message에 노출하지 않는다. Existing Hangul/Number error 이름이나 precedence는 바꾸지 않는다.

## 14. Concrete routing and integration boundaries

P11B는 current architecture를 다음처럼 explicit하게 확장하는 것이 기본 방향이다.

```text
Socket.IO strict GEM handler
  -> canonical Room.gameType dispatch
  -> concrete GemCard application service
  -> Room UoW / idempotency
  -> concrete GemCard V2 projector
  -> existing per-socket fan-out
```

- `GameType`과 identity-only `GameRegistry`에 exact `GEM_CARD` identity/registration을 추가하되 capability methods는 넣지 않는다.
- `RoomRecord`는 우선 exact third `GemCardRoomRecord` branch로 확장한다. `unknown`, `any`, JSON blob과 fake base state로 바꾸지 않는다.
- `GameStartRouter`, player lifecycle router와 optional scheduled routers는 필요한 exact GEM capability branch를 composition root에서 명시적으로 받는다.
- command service는 collect/purchase/reserve/yield의 confirmed set만 구현한다. Generic authenticated executor나 command bus를 만들지 않는다.
- persistence는 concrete GEM clone/validation/lifecycle seam을 사용한다. Platform persistence가 deck/resource/private reserve internals를 deep-copy하지 않는다.
- projector는 concrete viewer-aware GEM V2 projection을 만든다. GameRegistry에 projector를 넣지 않는다.
- Web decoder/room view/App은 exact GEM branch를 추가한다. Renderer registry는 별도 승인 없이 만들지 않는다.

이 explicit third branch 비용은 type safety를 위한 현재 정책이다. P11 구현 경험이 실제 세 번째 중복을 증명한 뒤에만 lifecycle/codec/start/renderer abstraction을 별도 decision으로 재검토한다.

## 15. Platform reuse matrix

| Classification | Element | GEM 판단 |
| --- | --- | --- |
| `REUSE_AS_IS` | Room ID/code, membership, Host, immutable gameType, invitation | rules와 독립; `GC-001`이 4명 초과면 capacity만 별도 변경 |
| `REUSE_AS_IS` | bootstrap/session/resume, single-primary, presence/reconnect | game state와 credential을 혼합하지 않음 |
| `REUSE_AS_IS` | capability negotiation/admission mechanism | exact GEM + V2 branch만 추가 |
| `REUSE_AS_IS` | Room mutation lane, UoW/CAS, storage revision | resource/card transaction을 한 commit으로 보호 |
| `REUSE_AS_IS` | request ID/idempotency store와 replay mechanism | GEM fingerprint/result parser는 concrete |
| `REUSE_AS_IS` | Socket.IO/HTTP/same-origin, ack/error envelope, viewer fan-out | GEM event/schema/projection 내용은 concrete |
| `REUSE_AS_IS` | Lobby, all-offline/finished retention, cleanup | concrete lifecycle inspection만 추가 |
| `REUSE_AS_IS` | identity-only `GameRegistry` semantics | exact `GEM_CARD` identity만 추가; capability 없음 |
| `PROVEN_SMALL_PRIMITIVE` | `nextGameRevision` | `GC-030` 승인 시 opt-in |
| `PROVEN_SMALL_PRIMITIVE` | frozen Fisher–Yates | `GC-032`, `GC-037`에 따른 turn/deck shuffle에 의미가 같을 때 opt-in |
| `PROVEN_SMALL_PRIMITIVE` | Web async single-flight | GEM command caller가 같은 Promise semantics를 가질 때 opt-in |
| `NOT_ASSUMED` | Web gameplay identity comparator | direct one-action UI에 persistent draft가 없으면 사용할 이유 없음 |
| `OPTIONAL` | Turn scheduler/recovery | `GC-020`, `GC-021`이 timer를 선택한 경우만 |
| `OPTIONAL` | overall game deadline scheduler | `GC-022`가 deadline을 선택한 경우만 |
| `GAME_SPECIFIC` | resource names/supply/holdings/conservation | `GC-002`~`GC-004`, `GC-007`, `GC-008` |
| `GAME_SPECIFIC` | decks, market, cards, refill/exhaustion | `GC-005`, `GC-006`, `GC-014`, `GC-033`, `GC-034`, `GC-037` |
| `GAME_SPECIFIC` | reserve, wildcard, production/discount | `GC-003`, `GC-009`~`GC-014`, `GC-028` |
| `GAME_SPECIFIC` | timeout/forfeit/end/result/privacy | `GC-016`~`GC-028` |
| `NOT_APPLICABLE` | Tile/Rack/Board/Table/Meld/Joker/Draw/Pass/TurnDraft | GEM state/action에 강제하지 않음 |

## 16. P9 abstraction stress test

| P9 item | GEM evidence at P10 | P10/P11 direction |
| --- | --- | --- |
| lifecycle/codec registry | GEM도 clone/validate/inspect가 필요하지만 state shape가 완전히 다름 | exact third adapter/switch부터 구현; registry는 계속 `WAIT_FOR_GEM_CARD_IMPLEMENTATION` |
| stored game envelope | third branch pressure는 생겼지만 heterogeneous type safety 문제는 동일 | exact `HangulRoomRecord | NumberTileRoomRecord | GemCardRoomRecord` 우선; generic envelope 보류 |
| start orchestration shell | Room lane/Host/readiness/UoW는 닮지만 deck/market/scheduler/end setup이 다름 | concrete GEM start를 먼저 구현; hook-bag template 금지 |
| generic command executor | GEM commands는 whole-board Submit/Draw/Pass와 다름 | concrete GEM services 유지; `game:command` 금지 |
| offline timeout policy | `GC-024`가 아직 미정이고 proposed A도 기존 two-strike가 아닌 third-timeout forfeit이며 no-timer도 가능 | platform policy로 승격하지 않음 |
| ranking abstraction | score/end/tie가 `GC-016`~`GC-019` 미정이고 proposed A는 공동 winner/no tie-break | concrete GEM result 유지 |
| renderer registry | third renderer pressure는 생기지만 state/controller가 tile games와 다름 | P11C exact route 먼저; registry는 별도 승인 전 보류 |
| mandatory lifecycle/Turn | turn identity는 유용할 수 있으나 deadline은 optional | `GenericTurn` 금지; concrete GEM turn만 confirmed rule에 맞춰 설계 |
| PlatformSnapshot schema factory | third strict union branch는 추가되나 privacy invariant가 다름 | schema factory 대신 exact branch; rack-free outer invariant만 gated correction |
| generic Tile/Rack/Result/Draft | GEM에는 대응 개념이 없거나 의미가 다름 | `KEEP_CONCRETE`; P9 결론 강화 |

P10의 rules thought experiment는 giant `GameModule`이 필요 없음을 재확인한다. 정확한 세 번째 implementation이 끝나기 전에는 “세 게임에서 보일 것”을 추측해 framework를 추가하지 않는다.

## 17. Rule dependency and P11 blocker matrix

| Blocker | GC dependency | 차단되는 contract/implementation |
| --- | --- | --- |
| Player capacity/start readiness | `GC-001`, `GC-031` | Room max, V2 player bounds, start preconditions |
| Resource identity/supply | `GC-002`~`GC-004` | resource schemas, collect/purchase state and projection |
| Market/card original dataset | `GC-005`, `GC-006`, `GC-033`, `GC-034`, `GC-037`, `GC-038` | card/category IDs, market/deck schema, refill, balance/ruleset version |
| Collect/limit | `GC-007`, `GC-008` | collect payload, return selection, errors and timeout fallback legality |
| Wild/production/purchase | `GC-003`, `GC-009`, `GC-014` | payment calculation, purchase payload and conservation |
| Reserve/privacy | `GC-010`~`GC-013`, `GC-028` | reserve event/source, private projection, wildcard reward |
| Special/objective/score/end/tie | `GC-015`~`GC-019`, `GC-025`, `GC-026`, `GC-035` | card schema, result schema, terminal transition and optional yield |
| Timer/deadline/offline | `GC-020`~`GC-022`, `GC-024` | turn projection, scheduler/recovery, timeout/presence-restored action |
| Leave | `GC-023`, `GC-025` | playing leave consequence, finish/continue/result |
| Resource/reserve disclosure | `GC-027`, `GC-028` | viewer-specific PLAYING/FINISHED projection and error normalization |
| Commands/revision | `GC-029`, `GC-030` | event map, payload envelope, ack/idempotency and advisory policy |
| First player/order | `GC-032` | start randomness and immutable order |
| Public product naming | `GC-036` + IP/product gate | catalog display/copy; internal neutral ID remains candidate until approved |

All high-impact decisions remain `USER_DECISION_REQUIRED`. P11A cannot begin while this matrix contains unresolved rules.

Conditional consistency gates도 함께 해결해야 한다.

- `GC-020=C`(turn timer 없음)이면 scheduled timeout action `GC-021`과 “offline timeout 횟수” 기반 `GC-024`는 그대로 구현할 수 없다. 두 항목을 `NOT_APPLICABLE`로 확정하거나 timer와 무관한 별도 disconnect policy를 명시적으로 선택해야 하며, protocol이 임의로 보완하지 않는다.
- `GC-022=B/C`(overall deadline 있음)이면 GEM-specific `TIME_LIMIT` terminal/result shape, winner/tie 계산과 `GC-017` threshold, `GC-026` exhaustion/no-progress, `GC-023` leave 사이의 exact precedence가 추가로 확정돼야 한다.
- `GC-023=C`(PLAYING leave 즉시 전체 game 종료)이면 concrete finish reason, current-score result와 remaining eligible player 처리 방식이 필요하다. 이를 existing Hangul/Number result로 대체하지 않는다.
- `GC-025=B/C`는 한 명만 남은 상태의 allowed actions와 finish timing, 이후 0 eligible player가 reachable한지, reachable하다면 exact terminal/result를 정의해야 한다. Proposed A의 immediate `LAST_PLAYER_STANDING` 의미를 다른 option에 묵시적으로 적용하지 않는다.

## 18. P11 technical blockers after rule approval

Even after `GC-001`~`GC-038` are confirmed, P11B/C must explicitly clear these implementation gates.

1. Add `GEM_CARD` to `GameType` and identity-only Registry only with real domain/server support; no placeholder.
2. Extend exact Room/persistence clone/lifecycle branches without `unknown`, JSON blob or capability-bearing Registry.
3. Define an opaque browser-safe GEM `cardId` and its generator/validator without reusing `TileId` or creating `GenericPhysicalItemId`.
4. Add exact GEM command schemas and only the V2-capable realtime handler map without changing the legacy `ClientToServerEvents` or existing Hangul/Number wire. Every success ack is snapshot-bearing; whether each action may return PLAYING or FINISHED follows `GC-017`/`GC-018` terminal timing.
5. Add V2 GEM Lobby/Playing/Finished branches and remove the rack-specific outer assumption from platform validation while preserving existing privacy/golden contracts.
6. Enforce V2 + exact GEM admission before create/join/resume mutation; no V1 fallback.
7. Extend start/player-lifecycle/optional scheduled-action dispatch by canonical Room type without generic command executor.
8. Add viewer-aware resource/reserve projection and unauthorized-reference nondisclosure tests.
9. Add exact Web decoder/renderer before advertising GEM capability; enable the Home card only at the controlled release gate.
10. If `GC-001` permits five players, change Room capacity and V2 bounds under a separate compatibility regression gate.
11. If timer/deadline is disabled, prove the absence of scheduler/recovery registration; if enabled, test stale/duplicate/race behavior.

## 19. Required P11 protocol tests

After rules are confirmed, P11B/C tests must cover at least:

- strict command schemas, unknown/extra/oversized payload rejection and additive protocol v1 compatibility
- exact `GEM_CARD` create/join/resume/state-sync admission and V1 rejection before mutation
- shared `game:start` Host/readiness/player-count/setup semantics
- collect/purchase/reserve/yield accepted and rejected atomicity according to confirmed action set
- request replay, request ID conflict, stale revision/turn, deadline boundary if enabled and concurrent market-card race
- resource/card/deck conservation, server-computed payment/discount/refill/score/end
- Room/game/storage revision and idempotency co-commit semantics
- LOBBY/PLAYING/FINISHED V2 strict keys, phase/game correlation and Room/game player identity set
- A/B viewer privacy for resources/reserved cards, hidden deck order and unauthorized probe normalization
- explicit leave, reconnect/presence reset and retention/cleanup; optional scheduler/recovery only when rules require it
- wrong-game command isolation in all directions among Hangul, Number and GEM
- existing Hangul V1/V2, Number V2, two-game gameplay/privacy/serving regression unchanged

## 20. Implementation gate

P10 first pass remains `AWAITING_RULE_DECISIONS` while any high-impact `GC-001`~`GC-038` item is unresolved. This document does not authorize runtime work.

P11A may become READY only after:

- all required rules and original balance/ruleset decisions are `CONFIRMED`,
- consistency audit has no blocker,
- IP/product gate allows the selected neutral naming, terminology, data and asset policy,
- protocol payload/projection/privacy choices have one exact interpretation,
- no unreviewed commercial game data or expression is treated as a default.

P11B then implements the confirmed strict shared/server contract after P11A domain completion. P11C implements the exact Web decoder/controller/renderer after P11B. P12 is the three-game E2E, controlled catalog enablement and deployment gate.

## 21. Explicit non-changes

- no `GEM_CARD` runtime `GameType`, Registry entry or Room state
- no shared schema/event/error/PlatformSnapshot union change
- no `gem:*` Socket.IO event or application/domain implementation
- no Home card, capability advertisement, decoder, renderer or asset
- no generic `game:command`, GameModule, GameState, Turn, Result, Card/Resource model or renderer registry
- no package/dependency/lockfile change
- no Hangul/Number rule, wire, projection, scheduler, gameplay or UI change

# GEM_CARD Protocol Gate

> 상태: `CONFIRMED / P10 COMPLETE / P11A READY / RUNTIME NOT IMPLEMENTED`
> 기준 checkpoint: `8d5444f docs: define gem card rules and ip gate`
> 범위: P10 문서 설계만 해당하며 shared/server/Web runtime contract는 변경하지 않음
> 사용자 결정: `GC-001`~`GC-038` 중 `GC-023=B`, 나머지는 모두 `A`
> 연관 규칙: 확정된 `GC-001`~`GC-038` — [GEM_CARD_GAME_RULES.md](./GEM_CARD_GAME_RULES.md)
> 연관 data: 확정된 original 45-card input — [GEM_CARD_CARDSET_V1.md](./GEM_CARD_CARDSET_V1.md)

## 1. 목적과 현재 runtime 기준선

이 문서는 세 번째 게임 `GEM_CARD`를 구현하기 전에 platform command 재사용 범위, game-specific command, `PlatformSnapshotV2` projection, capability admission, revision/idempotency, server action과 privacy 요구를 고정하는 protocol gate다. 아래 event 이름과 의미는 확정된 conceptual contract다. P11B가 strict TypeScript/Valibot schema를 구현하기 전에는 runtime public wire가 아니며, 설명용 pseudotype의 정확한 TypeScript field spelling은 runtime 구현으로 간주하지 않는다.

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
- Room mutation lane 안에서 detached prospective state를 검증한 뒤 Room/game/idempotency를 한 번에 commit한다.
- client가 계산한 price, permanent discount, score, market refill, supply 또는 terminal result를 신뢰하지 않는다.
- hidden deck order와 credential/storage/scheduler 내부 정보는 projection 밖으로 나가지 않는다. 확정 규칙상 resource holdings와 reserved cards는 공개 정보다.
- wrong-game command는 다른 concrete game으로 fallback하지 않고 mutation 전에 fail-closed한다.

게임 규칙의 exact 의미는 확정된 `GC-001`~`GC-038`이 소유한다. Protocol은 그 의미를 재해석하거나 다른 game의 규칙으로 보충하지 않는다.

## 3. 재사용할 platform commands

| Command | 재사용 방향 | GEM_CARD gate |
| --- | --- | --- |
| `session:bootstrap` | 그대로 재사용 | credential 발급은 game-independent |
| `room:create` | existing optional `payload.gameType`에 `GEM_CARD`를 P11B에서 additive하게 허용 | `GC-001`, `GC-031`; registration·V2·capability를 Room/Player/session/idempotency mutation 전에 확인 |
| `room:join` | payload에 game type을 추가하지 않음 | canonical Room lookup 후 capability를 Player/session mutation 전에 확인 |
| `session:resume` | same Player/session mechanism 재사용 | 새 connection의 V2 + exact GEM capability를 binding/presence 전 다시 확인 |
| `state:sync` | negotiated viewer snapshot 재전송 | GEM Room은 V2 only; V1 down-conversion 금지 |
| `room:leave` | outer command와 Room/session cleanup 재사용 | PLAYING leave는 resources 반환 뒤 forfeit, 필요 시 즉시 `LAST_PLAYER_STANDING`; Room/session+game atomic commit |
| `game:start` | 기존 event와 `expectedRoomRevision` 재사용 | Host-only, 2~4명 모두 CONNECTED, server-shuffled immutable order, original 45-card setup과 market 구성 |

초대 URL은 계속 `/room/{ROOM_CODE}`다. Join URL과 join payload에 game type을 넣지 않는다.

## 4. 확정된 game-specific command strategy — `GC-029=A`

### Additive strict GEM events

```text
game:start
gem:collect
gem:purchase
gem:reserve
gem:yield
```

이 event들은 `protocolVersion = 1`에 additive하게 추가하며 기존 Hangul/Number event 이름, payload와 legacy client event map을 바꾸지 않는다.

`gem:purchase`는 market와 actor 자신의 reserved source를 strict discriminated payload로 구분한다. 별도 `gem:purchase-reserved` event는 만들지 않으며 purchase legality·cost calculation의 한 game-specific owner가 source access를 검증한다.

장점:

- Hangul `turn:*`, Number `number:*`와 payload 의미가 섞이지 않는다.
- action별 closed schema, error, idempotency fingerprint와 telemetry가 명확하다.
- market/resources/reserve가 없는 game에 해당 개념을 강제하지 않는다.
- current explicit router/composition style과 맞는다.

선택하지 않은 방식:

- one `gem:command` + action union
- platform-wide generic `game:command`

GEM-specific `turn:started`/`game:finished` advisory는 추가하지 않는다. Snapshot-bearing ack와 authoritative `state:snapshot`이 source of truth다. 현재 Hangul advisory를 GEM 의미로 재해석하지 않는다.

`game:start` success ack는 exact GEM PLAYING V2 snapshot을 담는다. 각 `gem:*` success ack는 terminal precedence와 fair-round 경계에 따라 exact GEM PLAYING 또는 FINISHED V2 snapshot을 담는다. Outer Room-scoped ack/error envelope와 `state:snapshot` event 이름은 재사용한다.

## 5. Common command envelope — `GC-030`

각 canonical GEM player action은 다음 existing primitive를 사용한다.

```ts
type GemTurnCommandConcept<TKind extends string, TPayload> = {
  kind: TKind;
  protocolVersion: 1;
  requestId: RequestId;
  expectedGameRevision: GameRevision;
  turnId: TurnId;
  payload: TPayload;
};
```

- start는 기존 `game:start`의 `expectedRoomRevision`을 사용하고 game revision/turn ID를 보내지 않는다.
- start 성공 시 `gameRevision = 0`이다.
- successful canonical action commit은 `nextGameRevision`을 사용해 정확히 1 증가한다.
- reject, stale, timeout stale callback, replay와 presence-only 변화는 추가 증가가 없다.
- active action마다 immutable `turnId`를 사용해 stale prior-turn action/callback을 구별한다.
- successful collect/purchase/reserve/yield와 canonical timeout은 해당 Turn을 끝내고 fresh next-turn identity를 만든다. Terminal precedence가 먼저 만족되면 next Turn을 만들지 않는다.
- transport가 handler entry에서 capture한 `receivedAt`을 concrete GEM service까지 그대로 전달한다. `receivedAt < deadlineAt`인 command만 45초 deadline을 통과하며 client time은 판정 근거가 아니다.

`GenericTurn`이나 revision service는 만들지 않는다.

## 6. 확정된 conceptual payloads

다음 pseudotype은 확정된 payload 의미와 최소 입력을 보여준다. P11B는 이를 strict schema로 옮기되 optional rule branch나 client-computed state를 추가하지 않는다.

### 6.1 Collect — `GC-002`, `GC-004`, `GC-007`, `GC-008`

```ts
type GemCollectPayloadConcept = {
  selections: readonly {
    resourceType: GemResourceType;
    count: number;
  }[];
};
```

서버는 canonical supply, selection pattern, total count, per-type count, post-action holding limit과 conservation을 검증한다. 합법 패턴은 available basic resource 중 서로 다른 type 1~2개를 각 1개, 또는 basic 대신 `PRISM` 1개다. 결과 holdings가 9를 넘으면 전체 action을 거절하며 return selection은 없다.

### 6.2 Purchase — `GC-003`, `GC-009`, `GC-014`

```ts
type GemPurchasePayloadConcept = {
  source:
    | { kind: "MARKET"; cardId: GemCardId }
    | { kind: "RESERVED"; cardId: GemCardId };
};
```

Server가 canonical card cost와 permanent discount를 적용하고, basic holdings를 먼저 지불한 뒤 `PRISM`으로 남은 deficit을 충당한다. Supply return, ownership, purchased-card discount, score와 same-tier market refill도 server가 계산한다. Client-computed payment plan, effective cost, discount, score 또는 refill card는 payload에 넣지 않는다.

### 6.3 Reserve — `GC-010`~`GC-013`, `GC-028`, `GC-034`

```ts
type GemReservePayloadConcept = {
  source: { kind: "MARKET"; cardId: GemCardId };
};
```

Reserve는 face-up market card만 대상으로 하고 actor당 최대 2장이다. 별도 resource reward는 없고 reserved card identity/cost/effect는 PLAYING과 FINISHED 모두 공개다. 성공한 reserve는 같은 atomic commit에서 same-tier slot을 즉시 refill하며 deck이 비었으면 slot을 비워 둔다. Hidden deck reserve branch는 없다.

### 6.4 Yield — `GC-026`

```ts
type GemYieldPayloadConcept = {};
```

`gem:yield`는 collect/purchase/reserve 중 legal action이 하나도 없음을 server가 canonical state로 증명한 경우에만 허용한다. 일반적인 free pass가 아니다. 성공하면 actor의 no-progress record를 남기고 turn을 advance한다. 모든 eligible player가 연속으로 한 번씩 yield하면 `NO_PROGRESS`로 종료한다. Successful collect/purchase/reserve는 cycle을 reset한다. Forfeit는 그 player의 record만 제거하고 나머지 eligible records는 보존하며, presence는 eligibility를 바꾸지 않는다.

### 6.5 Terminal and fair-round state — `GC-017`~`GC-026`

- Non-forfeited eligible player가 정확히 1명 남는 순간 `LAST_PLAYER_STANDING`으로 즉시 종료한다. 이 condition은 진행 중인 fair round와 no-progress tracker보다 우선한다.
- Score가 18 이상이 된 action은 conceptual `END_TRIGGERED` state와 finish reason `SCORE_THRESHOLD_ROUND_END`를 기록해 fair round를 시작한다. Trigger player 뒤에서 immutable order의 현재 cycle에 아직 남은 eligible players가 한 번씩 action하고, order가 cycle start로 wrap하기 전에 종료한다. Exact runtime field/discriminant는 P11A의 concrete GEM state가 이 의미를 보존하도록 정한다.
- Pending fair round에서는 successful player action, verified yield와 canonical timeout이 해당 eligible player의 remaining turn을 소비한다. Forfeited player는 skip하지만 OFFLINE presence만으로는 eligibility를 잃지 않으므로 server timeout으로 진행한다.
- `MARKET_EXHAUSTED_ROUND_END`는 모든 tier deck과 face-up market slot이 비었고, eligible/non-forfeited player가 reserved card를 하나도 소유하지 않을 때만 fair-round trigger가 된다. 현재 affordability와 무관하게 eligible player의 reserved card가 하나라도 있으면 collect 후 purchase 가능성이 있으므로 이 trigger를 지연한다. Forfeited player에게 동결된 reserved card는 trigger를 막지 않는다.
- Eligible reserve가 남아 market-exhaustion fair round가 시작되지 않은 동안에는 collect/purchase/yield의 일반 규칙을 적용한다. Full verified no-action cycle이 먼저 완성되면 `NO_PROGRESS`로 종료할 수 있다.
- 같은 commit에서 score threshold와 market exhaustion이 함께 성립하면 `SCORE_THRESHOLD_ROUND_END` reason이 우선한다.
- 같은 mutation에서 newly eligible market exhaustion과 completed no-progress tracker가 함께 성립하면 `GC-026=A`의 `MARKET_EXHAUSTED_ROUND_END` fair-round trigger가 `NO_PROGRESS`보다 우선한다. `NO_PROGRESS`는 source exhaustion 전 또는 eligible reserve 때문에 market trigger가 보류된 상태의 verified cycle을 끝낸다.
- Forfeit는 해당 player의 no-progress record만 제거하고 나머지를 보존하되 새 YIELD로 세지 않는다. 전체 forfeit effect 뒤 `LAST_PLAYER_STANDING`을 먼저 판정한다. Preserved records가 remaining eligible set을 모두 덮으면 current canonical state에서 legal action을 다시 계산한다. Legal action이 없으면 같은 mutation에서 `NO_PROGRESS`로 끝낼 수 있고, explicit leave가 resources를 supply에 반환해 새 collect가 가능해졌다면 stale record만으로 종료하지 않는다.
- Overall game deadline과 `TIME_LIMIT` finish reason은 없다.

## 7. Strict validation과 atomic mutation

모든 GEM action은 다음 순서를 따른다.

```text
strict wire validation
  -> authenticated socket/session context
  -> canonical Room.gameType === GEM_CARD routing
  -> Room lane
  -> idempotency preflight
  -> current-primary actor / Room membership
  -> canonical type + phase + game revision + turn identity + 45초 deadline
  -> detached prospective GEM state
  -> card/resource ownership, availability and conservation
  -> game-specific rule validation
  -> refill/score/end computation
  -> one Room/game/idempotency UoW commit
  -> viewer-specific V2 ack/snapshot fan-out
```

실패하면 Room/game/storage revision, supply, resources, cards, market, accepted idempotency, turn과 server action registration이 모두 그대로여야 한다. Concurrent purchase/reserve/collect는 같은 Room lane에서 직렬화하고 먼저 commit한 canonical state를 다음 command가 다시 읽는다.

Resource conservation은 type별 `initial supply = current shared supply + all player holdings`로 검사한다. Explicit leave가 반환된 뒤 forfeited player의 holdings는 0이고 반환량만 shared supply에 더해진다. Card conservation은 각 `cardId`가 정확히 하나의 deck, face-up market slot, 한 player의 reserve 또는 purchased collection에 존재하는 것으로 검사한다. Forfeit된 player의 reserved/purchased cards는 계속 그 player zone에 남는다.

## 8. Idempotency fingerprint

`GC-030=A`에 따른 canonical fingerprint 의미다.

| Command | Canonical fingerprint input |
| --- | --- |
| `gem:collect` | action kind + expected revision + turn ID + canonical resource selection |
| `gem:purchase` | action kind + expected revision + turn ID + source kind + referenced card ID |
| `gem:reserve` | action kind + expected revision + turn ID + `MARKET` source + public card ID |
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

Existing Room-scoped ack와 `state:snapshot` event envelope은 유지한다. V2 `versions`에는 현재처럼 `roomRevision`과 `presenceVersion`만 있고, game revision은 PLAYING/FINISHED의 exact GEM `game.gameRevision` numeric field에 둔다. GEM Lobby의 `game`은 `null`이므로 game revision field도 없다. Legacy V1의 `versions.gameRevision` representation은 변경하지 않는다. Room/presence revisions는 계속 platform mutation 의미이며 GEM action rule이 직접 계산하지 않는다.

Confirmed conceptual PLAYING projection:

```ts
type GemCardPlayingProjectionConcept = {
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
    resources: readonly GemResourceCount[];
    production: readonly GemProductionCount[];
    purchasedCards: readonly PublicGemCardView[];
    reservedCards: readonly PublicGemCardView[];
    score: number;
    forfeited: boolean;
  }[];
  turn: {
    turnId: TurnId;
    turnNumber: number;
    activePlayerId: PlayerId;
    deadlineAt: ServerTime;
  };
  fairRound: null | {
    finishReason:
      | "SCORE_THRESHOLD_ROUND_END"
      | "MARKET_EXHAUSTED_ROUND_END";
  };
};
```

`resourceSupply`, 모든 player의 exact `resources`, purchased cards와 reserved cards는 public이다. GEM game projection에는 viewer-private holdings section이 없다. Outer platform `self.playerId`는 계속 현재 viewer identity를 나타내지만 game information 자체는 viewer별로 달라지지 않는다. Public card view는 original v1의 card ID, tier, basic cost vector, one discount type과 points만 포함한다. Special ability와 objective field는 존재하지 않는다.

`fairRound`는 round-end 진행 여부와 최종 finish reason을 UI가 표시하는 최소 public 상태다. Internal round cursor, no-progress record set, offline-timeout streak와 scheduler descriptor는 노출하지 않는다. Exact field spelling과 boundary representation은 P11B strict schema에서 확정하되 이 privacy/semantic 범위를 바꾸지 않는다.

FINISHED projection은 final public market/supply/player state와 concrete GEM result를 포함하고 active turn은 없다. Confirmed finish reasons는 `SCORE_THRESHOLD_ROUND_END`, `MARKET_EXHAUSTED_ROUND_END`, `NO_PROGRESS`, `LAST_PLAYER_STANDING`이다. `TIME_LIMIT`, `ALL_PLAYERS_FORFEITED`와 tile-game finish reason을 넣지 않는다. 일반 finish에서는 non-forfeited players를 score 내림차순으로 먼저 competition-rank하고 최고점 동점을 공동 winner로 둔다. Forfeited players는 모든 non-forfeited player 뒤에서 score 내림차순과 competition ranking을 적용한다. `LAST_PLAYER_STANDING`은 유일한 non-forfeited player만 winner/rank 1이다. 각 score는 자기 purchased-card points 그대로이며 score transfer는 없다. Result를 `GenericResult` 또는 Hangul/Number result shape로 일반화하지 않는다.

Canonical start state는 immutable `rulesVersion = "gem-rules-v1"`과 `cardSetVersion = "gem-cardset-v1"`을 보유한다. 이 값은 persistence validation과 original 45-card dataset provenance에 필요하다. Wire projection에 실제 client compatibility requirement가 입증되지 않으면 자동 노출하지 않으며, P11B가 노출을 선택하더라도 exact closed literals로 검증한다.

### Existing V2 blocker

현재 `PlatformSnapshotV2` outer validator의 `privateRackMatchesSelfCount`는 Hangul/Number `playerStates.rackCount`와 `privateState.rack` 길이 일치를 platform-level invariant처럼 검사한다. GEM에 fake Rack을 추가하면 안 된다. P11B에서는:

- Room player와 game player identity-set 일치는 platform shell invariant로 유지하고,
- Rack correlation은 Hangul/Number exact game schema가 소유하게 하며,
- GEM exact schema는 public resource/reserve shape와 hidden-deck non-exposure를 검사하되 fake `privateState`를 요구하지 않고,
- V1과 기존 Hangul/Number V2 key set/privacy가 바뀌지 않도록 golden tests를 통과해야 한다.

이것은 giant projection framework나 schema factory를 만들라는 뜻이 아니라, 이미 드러난 rack-specific outer coupling을 좁은 wire/privacy migration으로 해소해야 한다는 뜻이다.

`GC-001=A`의 2~4명은 현재 Room service의 `MAX_ROOM_PLAYERS = 4`와 V2의 `LobbyPlatformPlayersV2Schema`/`ActivePlatformPlayersV2Schema` 범위에 맞으므로 capacity migration은 필요하지 않다.

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

## 11. Server actions와 scheduler ownership

| Server action | Platform reuse | Concrete GEM decision |
| --- | --- | --- |
| Turn timeout | Clock, `TurnScheduler`, scheduled identity, stale/duplicate no-op와 recovery mechanism 재사용 | 45초에 자원/card 획득 없이 canonical no-action turn commit 후 advance |
| Overall deadline | 사용하지 않음 | GEM state에 `gameDeadlineAt` 없음; `GameDeadlineScheduler` registration/callback 없음 |
| Explicit leave | `room:leave`, Room lane, session cleanup 재사용 | held resources를 shared supply에 반환한 뒤 즉시 forfeit; purchased/score/reserved cards는 player에 동결; 한 명이면 즉시 `LAST_PLAYER_STANDING` |
| Presence restored | reconnect/presence mechanism 재사용 | successful resume은 GEM-owned consecutive offline-timeout streak를 0으로 reset |
| Retention/cleanup | all-offline/finished retention과 process-local resource cleanup 재사용 | GEM lifecycle inspector는 running/finished와 active turn deadline만 노출 |
| Market refill | scheduler가 아님 | purchase/reserve와 같은 atomic GEM commit에서 `GC-033`, `GC-034`대로 처리 |

Timeout은 successful gameplay action과 같은 Room lane에서 command/leave와 경쟁한다. Stale/duplicate callback은 no-op이고 canonical timeout commit만 revision을 1 증가시키며 fresh turn identity를 만든다. Actor가 OFFLINE인 자신의 turn에서 연속 세 번째 timeout이면 하나의 atomic candidate에서 no-action/no-progress accounting과 streak 3을 먼저 적용하고 반드시 forfeit한 뒤 actor record를 제거한다. 중간 `NO_PROGRESS`를 commit하지 않으며 전체 effect 뒤 `LAST_PLAYER_STANDING`, pending fair-round, remaining eligible no-progress를 precedence대로 평가한다. Connected timeout은 streak에 포함하지 않는다. Resume reset은 presence-only gameRevision 증가를 만들지 않는다.

Timeout과 no-progress 관계도 game-specific이다. Timeout 시 legal collect/purchase/reserve가 있었다면 기존 yield cycle을 reset하고 actor의 yield record는 남기지 않는다. Legal action이 전혀 없었다면 그 timeout은 `gem:yield`와 같은 no-progress record로 계산하며, full consecutive eligible cycle이면 `NO_PROGRESS`로 종료한다.

## 12. Privacy matrix

| Data | Public | Owner-only | Never expose |
| --- | --- | --- | --- |
| face-up market | card ID, cost, permanent discount type, points | 없음 | refill 전 hidden deck card/order |
| deck | category별 remaining count | 없음 | exact order, hidden card IDs, RNG state |
| resource supply | type별 current count | 없음 | internal mutation metadata |
| player resources | 모든 player의 type별 exact holdings | 없음 | internal cached conservation data |
| purchased cards/production | public identity/cost/discount/points와 derived production/score | 없음 | internal cached calculations |
| reserved cards | PLAYING/FINISHED 모두 exact card identity/cost/discount/points | 없음 | ownership mutation internals |
| result | public score/winner/competition-rank/forfeit summary | 없음 | internal terminal calculation trace |
| platform/session | Player identity, nickname, Host, presence | own `self.playerId` | session token/hash, socket ID/generation, storage revision, idempotency record, scheduler descriptor |

Resources와 reserved cards가 public이어도 actor가 소유하지 않은 reserved card를 `RESERVED` purchase source로 참조할 권한은 없다. Forbidden card probe는 “존재하지만 네 것이 아님”과 “존재하지 않음”을 외부에서 구분하지 않는 safe error로 normalize한다. Public projection은 deck order, future refill card, offline streak, no-progress tracker identities와 accepted request record를 노출하지 않는다.

## 13. Conceptual error taxonomy

다음은 확정 규칙에서 필요한 semantic category다. P10에서는 shared enum을 변경하지 않으며 P11B가 existing precedence와 nondisclosure를 보존하는 exact public names를 결정한다.

| Existing platform/shared category | GEM-specific semantic category | Rule dependency |
| --- | --- | --- |
| `INVALID_PAYLOAD` | `INVALID_RESOURCE_SELECTION` | `GC-002`, `GC-007`, `GC-008` |
| `INCOMPATIBLE_GAME_CAPABILITY` | `CARD_NOT_AVAILABLE` | `GC-005`, `GC-006`, `GC-014`, `GC-033`, `GC-034` |
| auth/session/Room not found | `INSUFFICIENT_RESOURCES` | `GC-003`, `GC-009`, `GC-014` |
| `HOST_ONLY`, invalid phase/readiness | `RESOURCE_SUPPLY_EMPTY` | `GC-004`, `GC-007` |
| `NOT_YOUR_TURN`, `TURN_EXPIRED` | `RESOURCE_LIMIT_EXCEEDED` | `GC-008` |
| stale Room/game revision | `RESERVE_LIMIT_REACHED` | `GC-010`, `GC-011` |
| `REQUEST_ID_REUSED` | `INVALID_RESERVED_CARD_ACCESS` | `GC-012`, `GC-014`, `GC-028` |
| `INTERNAL_ERROR` | `ACTION_NOT_AVAILABLE` / `YIELD_NOT_ALLOWED` | `GC-026` |

P11B는 confirmed rules에 실제 필요한 error만 strict shared enum/schema에 additive하게 추가한다. Deck order, exact reason calculation과 internal IDs를 message에 노출하지 않는다. Existing Hangul/Number error 이름이나 precedence는 바꾸지 않는다.

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
- `GameStartRouter`, player lifecycle router와 scheduled-turn router는 필요한 exact GEM capability branch를 composition root에서 명시적으로 받는다. Game-deadline route는 추가하지 않는다.
- command service는 collect/purchase/reserve/yield의 confirmed set만 구현한다. Generic authenticated executor나 command bus를 만들지 않는다.
- persistence는 concrete GEM clone/validation/lifecycle seam을 사용한다. Platform persistence가 deck/resource/reserved-card internals를 deep-copy하지 않는다.
- projector는 concrete viewer-aware GEM V2 projection을 만든다. GameRegistry에 projector를 넣지 않는다.
- Web decoder/room view/App은 exact GEM branch를 추가한다. Renderer registry는 별도 승인 없이 만들지 않는다.

이 explicit third branch 비용은 type safety를 위한 현재 정책이다. P11 구현 경험이 실제 세 번째 중복을 증명한 뒤에만 lifecycle/codec/start/renderer abstraction을 별도 decision으로 재검토한다.

## 15. Platform reuse matrix

| Classification | Element | GEM 판단 |
| --- | --- | --- |
| `REUSE_AS_IS` | Room ID/code, membership, Host, immutable gameType, invitation | confirmed 2~4 범위가 current platform capacity와 일치 |
| `REUSE_AS_IS` | bootstrap/session/resume, single-primary, presence/reconnect | game state와 credential을 혼합하지 않음 |
| `REUSE_AS_IS` | capability negotiation/admission mechanism | exact GEM + V2 branch만 추가 |
| `REUSE_AS_IS` | Room mutation lane, UoW/CAS, storage revision | resource/card transaction을 한 commit으로 보호 |
| `REUSE_AS_IS` | request ID/idempotency store와 replay mechanism | GEM fingerprint/result parser는 concrete |
| `REUSE_AS_IS` | Socket.IO/HTTP/same-origin, ack/error envelope, viewer fan-out | GEM event/schema/projection 내용은 concrete |
| `REUSE_AS_IS` | Lobby, all-offline/finished retention, cleanup | concrete lifecycle inspection만 추가 |
| `REUSE_AS_IS` | identity-only `GameRegistry` semantics | exact `GEM_CARD` identity만 추가; capability 없음 |
| `PROVEN_SMALL_PRIMITIVE` | `nextGameRevision` | canonical GEM gameplay/timeout commit에서 사용 |
| `PROVEN_SMALL_PRIMITIVE` | frozen Fisher–Yates | immutable player order와 original card decks에서 동일 RNG contract로 사용 |
| `PROVEN_SMALL_PRIMITIVE` | Web async single-flight | GEM command caller가 같은 Promise semantics를 가질 때 opt-in |
| `NOT_ASSUMED` | Web gameplay identity comparator | direct one-action UI에 persistent draft가 없으면 사용할 이유 없음 |
| `REUSE_MECHANISM` | Turn scheduler/recovery | 45초 GEM turn identity/deadline과 concrete timeout transition을 exact branch로 추가 |
| `NOT_USED` | overall game deadline scheduler | GEM에는 overall deadline과 `TIME_LIMIT` 없음 |
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
| offline timeout policy | GEM은 third consecutive offline timeout 후 forfeit로 Hangul/Number와 횟수·action 의미가 다름 | platform policy로 승격하지 않고 concrete GEM action 유지 |
| ranking abstraction | GEM은 card-score descending/shared winners이고 tile-game penalty result와 다름 | concrete GEM result 유지 |
| renderer registry | third renderer pressure는 생기지만 state/controller가 tile games와 다름 | P11C exact route 먼저; registry는 별도 승인 전 보류 |
| mandatory lifecycle/Turn | GEM도 turn identity/deadline을 사용하지만 action/end/timeout state가 다름 | `GenericTurn` 금지; concrete GEM turn 유지 |
| PlatformSnapshot schema factory | third strict union branch는 추가되나 privacy invariant가 다름 | schema factory 대신 exact branch; rack-free outer invariant만 gated correction |
| generic Tile/Rack/Result/Draft | GEM에는 대응 개념이 없거나 의미가 다름 | `KEEP_CONCRETE`; P9 결론 강화 |

P10의 rules thought experiment는 giant `GameModule`이 필요 없음을 재확인한다. 정확한 세 번째 implementation이 끝나기 전에는 “세 게임에서 보일 것”을 추측해 framework를 추가하지 않는다.

## 17. Confirmed rule-to-contract traceability

| Confirmed rule | GC decision | Contract consequence |
| --- | --- | --- |
| Player capacity/start | `GC-001=A`, `GC-031=A`, `GC-032=A` | 2~4, Host only, 모두 CONNECTED, server-shuffled immutable order |
| Resource identity/supply | `GC-002=A`~`GC-004=A` | five basic types + held `PRISM`; basic 7 each, PRISM 5; exact public supply/holdings |
| Market/card dataset | `GC-005=A`, `GC-006=A`, `GC-033=A`, `GC-034=A`, `GC-037=A`, `GC-038=A` | three tiers, three face-up slots each, same-tier immediate refill, empty exhausted slot, original 15 cards/tier and immutable rules/data versions |
| Collect/limit | `GC-007=A`, `GC-008=A` | max two distinct basic or one PRISM; holding cap 9; no return sub-payload |
| Discount/purchase | `GC-009=A`, `GC-014=A` | one card from MARKET/RESERVED; server deterministic basic-first then PRISM payment |
| Reserve/publicity | `GC-010=A`~`GC-013=A`, `GC-028=A` | face-up only, max two, no reward, exact reserve public in PLAYING/FINISHED |
| Card/result basis | `GC-015=A`~`GC-019=A`, `GC-035=A` | no abilities/objectives, purchased-card points only, threshold 18, fair round, shared highest-score winners and competition ranking |
| Timer/offline | `GC-020=A`~`GC-022=A`, `GC-024=A` | 45초 server turn, no-action timeout, no overall deadline, third consecutive offline timeout action then forfeit |
| Explicit leave | `GC-023=B`, `GC-025=A` | return held resources then forfeit; freeze cards/score; one eligible player means immediate `LAST_PLAYER_STANDING` |
| Exhaustion/no progress | `GC-026=A` | distinct market-source fair-round trigger plus server-proven `gem:yield`/full eligible cycle `NO_PROGRESS` |
| Public information | `GC-027=A`, `GC-028=A` | shared supply, all exact player holdings and reserves public; hidden deck/order and internal trackers private |
| Commands/identity | `GC-029=A`, `GC-030=A` | exact `gem:*` events; gameRevision + immutable turnId + requestId/idempotency; no advisory requirement |
| Naming/IP | `GC-036=A` + IP/product gate | internal `GEM_CARD`, working public name “보석 카드 게임”; release clearance remains separate |

Confirmed consistency consequences:

- 45초 timer가 있으므로 timeout/recovery와 offline-timeout streak가 applicable하며, no overall deadline이므로 `TIME_LIMIT` state/result/route는 없다.
- Explicit leave의 resource return, forfeit, session cleanup, active-turn change와 potential `LAST_PLAYER_STANDING`은 one Room/session/game UoW에서 atomic하게 처리한다.
- `LAST_PLAYER_STANDING`은 진행 중인 `SCORE_THRESHOLD_ROUND_END`/`MARKET_EXHAUSTED_ROUND_END` fair round와 no-progress보다 우선한다. 0 eligible/all-forfeited post-terminal path는 만들지 않는다.
- Score 18과 market source exhaustion이 같은 action에서 성립하면 `SCORE_THRESHOLD_ROUND_END`가 fair-round reason이다.
- Market exhaustion은 all decks + all face-up slots empty만으로 충분하지 않다. Eligible/non-forfeited owner의 reserved card가 없어야 하며, forfeited owner의 frozen reserve는 blocker가 아니다.
- Eligible reserve가 남은 동안 normal collect/purchase/yield를 계속 적용한다. Server-proven full no-action cycle은 `NO_PROGRESS`가 될 수 있다.
- Forfeit가 eligible set을 바꿀 때 actor의 yield record만 제거한다. Resource return으로 legal collect가 생겼으면 current canonical legality가 stale record보다 우선하여 `NO_PROGRESS`를 막는다.
- Presence 변화 자체는 eligibility나 yield record를 바꾸지 않는다. Timeout은 legal action 유무에 따라 cycle reset 또는 one no-progress record로 처리한다.

## 18. P11 technical blockers after protocol confirmation

규칙 선택은 확정됐지만 P11A/B/C는 다음 implementation gates를 명시적으로 해소해야 한다. 이 목록은 product-rule 재결정이 아니라 strict implementation work다.

1. Add `GEM_CARD` to `GameType` and identity-only Registry only with real domain/server support; no placeholder.
2. Extend exact Room/persistence clone/lifecycle branches without `unknown`, JSON blob or capability-bearing Registry.
3. Define an opaque browser-safe GEM `cardId` and its generator/validator without reusing `TileId` or creating `GenericPhysicalItemId`.
4. Add exact `gem:collect`/`purchase`/`reserve`/`yield` schemas and only the V2-capable realtime handler map without changing legacy `ClientToServerEvents` or existing Hangul/Number wire. Every success ack is snapshot-bearing and may return PLAYING or FINISHED according to confirmed terminal timing.
5. Add V2 GEM Lobby/Playing/Finished branches and remove the rack-specific outer assumption from platform validation while preserving existing privacy/golden contracts.
6. Enforce V2 + exact GEM admission before create/join/resume mutation; no V1 fallback.
7. Extend start/player-lifecycle/scheduled-turn dispatch by canonical Room type without a generic command executor; do not add a game-deadline branch for GEM.
8. Add exact public resource/reserve projection and unauthorized-reference nondisclosure tests. Do not invent a private GEM holdings envelope.
9. Add exact Web decoder/renderer before advertising GEM capability; enable the Home card only at the controlled release gate.
10. Translate the confirmed original 45-card dataset into an immutable typed seed and machine-validate every row against `gem-cardset-v1`; do not substitute an unreviewed card table.
11. Implement 45초 scheduler/recovery, third-offline-timeout handling and timeout-versus-command/leave races. Prove that GEM has no overall game deadline registration.
12. Implement fair-round cursor, reserved-card-aware market exhaustion and no-progress tracking as concrete GEM state. Explicit leave resource return must re-evaluate legal action atomically before a no-progress finish.
13. Keep `GameRegistry` identity-only and keep exact routers/unions even if a third branch creates duplication. No lifecycle/codec registry, `GameModule`, renderer registry or generic `game:command` is authorized.

## 19. Required P11 protocol tests

P11B/C tests must cover at least:

- strict command schemas, unknown/extra/oversized payload rejection and additive protocol v1 compatibility
- exact `GEM_CARD` create/join/resume/state-sync admission and V1 rejection before mutation
- shared `game:start` Host/readiness/player-count/setup semantics
- collect/purchase/reserve/yield accepted and rejected atomicity according to confirmed action set
- request replay, request ID conflict, stale revision/turn, exact 45초 deadline boundary and concurrent market-card race
- resource/card/deck conservation, server-computed payment/discount/refill/score/end
- Room/game/storage revision and idempotency co-commit semantics
- LOBBY/PLAYING/FINISHED V2 strict keys, phase/game correlation and Room/game player identity set
- A/B public equality for resources/reserved cards, hidden deck order and unauthorized probe normalization
- explicit leave resource return exactly once with frozen cards, leave replay, reconnect/presence reset, third offline timeout, retention/cleanup and scheduler/recovery
- fair-round boundary, reserved-card-aware market exhaustion, timeout/yield no-progress accounting and leave-return legality re-evaluation
- wrong-game command isolation in all directions among Hangul, Number and GEM
- existing Hangul V1/V2, Number V2, two-game gameplay/privacy/serving regression unchanged

## 20. Implementation gate

The P10 protocol gate is `CONFIRMED`: all `GC-001`~`GC-038` choices have one conceptual protocol interpretation and the consistency audit above has no protocol blocker. This document itself authorizes no runtime change.

The protocol prerequisite for P11A is satisfied. The synchronized P10 rules, original card-set and IP/product documents record the same confirmed choices and original-data policy, so P11A is `READY`. This does not authorize copied or unreviewed commercial card data, text or artwork.

P11A implements the concrete GEM domain and translates the confirmed `gem-cardset-v1` rows into an immutable typed seed with machine validation. P11B then implements the confirmed strict shared/server contract. P11C implements the exact Web decoder/controller/renderer. P12 remains the three-game E2E, controlled catalog enablement and deployment gate.

## 21. Explicit non-changes

- no `GEM_CARD` runtime `GameType`, Registry entry or Room state
- no shared schema/event/error/PlatformSnapshot union change
- no `gem:*` Socket.IO event or application/domain implementation
- no Home card, capability advertisement, decoder, renderer or asset
- no generic `game:command`, GameModule, GameState, Turn, Result, Card/Resource model or renderer registry
- no package/dependency/lockfile change
- no Hangul/Number rule, wire, projection, scheduler, gameplay or UI change

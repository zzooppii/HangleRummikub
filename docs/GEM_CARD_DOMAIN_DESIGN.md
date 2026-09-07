# GEM_CARD Domain Design

> 상태: `P11A IMPLEMENTED / P11B INTEGRATION PENDING`
> 규칙: `gem-rules-v1`
> 카드셋: `gem-cardset-v1`
> 범위: 순수 server domain만. Runtime registration, Room, persistence, protocol, Web에는 아직 연결하지 않는다.

## 1. Canonical namespace and dependency boundary

순수 구현은 `apps/server/src/games/gem-card/domain/`에만 있다.

```text
gem-card/domain/
  actions.ts          collect, payment, purchase, reserve, legal-action/YIELD gate
  card.ts             GEM-owned Card/CardId/tier
  cardset-v1.ts       immutable 45-card seed and static validator/audit
  game-state.ts       GEM-specific Playing/Finished aggregate and setup
  market.ts           ordered tier decks, three fixed slots, same-slot refill
  player-state.ts     holdings, purchased/reserved cards, forfeit/streak
  progress.ts         no-progress, timeout, forfeit, fair-round and precedence
  resource.ts         six resource identifiers, counts, cap and conservation
  result-engine.ts    four exact finish reasons and GEM ranking
  turn.ts             45-second turn metadata and eligible-player traversal
```

이 module은 `@hangul-rummikub/shared`의 neutral identity/time/revision types와 기존 `valibot` validation만 사용한다. Hangul/Number domain, Room/UoW, persistence, scheduler, transport, composition root와 Web을 import하지 않는다. 반대로 production source도 아직 이 module을 import하지 않는다. 따라서 P11A source는 production-inert다.

## 2. Resources and players

Basic resource는 `DAWN`, `TIDE`, `GROVE`, `EMBER`, `ECHO`, wild는 `PRISM`이다. 모든 count object는 여섯 key의 non-negative safe integer를 검증한 detached frozen record다. 초기 supply는 basic 각 7, `PRISM` 5이며 player 총 보유 한도는 9다. Supply와 모든 player holding의 resource별 합이 초기 총량과 같은지 별도 conservation assertion이 검증한다.

Player state는 `playerId`, exact resources, purchased/reserved card ID, `forfeited`, `offlineTimeoutStreak`만 저장한다. Score와 permanent discount는 purchased cards에서 매번 derive하여 중복 canonical field를 두지 않는다. Reserved limit은 2이고 purchased/reserved ID는 중복되거나 겹칠 수 없다.

## 3. Cards, cardset and market

Card는 GEM-owned `cardId`, numeric tier `1 | 2 | 3`, 다섯 basic-only printed cost, production resource와 points만 가진다. `GemCardId`는 canonical `GC-T{1..3}-{01..15}` runtime parser를 거친다. Objective, special ability, title, character와 artwork field는 없다.

`GEM_CARDSET_V1`은 [GEM_CARD_CARDSET_V1.md](./GEM_CARD_CARDSET_V1.md)의 45행을 그대로 옮긴 deeply frozen seed다. Validator는 45 unique IDs, tier별 15, tier/resource별 production 3, 전체 resource별 production 9, tier cost/point envelope, tier 안 duplicate tuple 부재와 confirmed aggregate audit를 검사한다. Confirmed aggregate는 printed demand resource별 61, total VP 95, points `0/1/2/3/4/5 = 10/10/5/10/5/5`다.

Market은 tier별 ordered private deck과 고정된 slot index `0 | 1 | 2` 세 개다. Setup은 caller가 server-authoritatively 섞은 tier deck을 받아 앞의 3장을 공개 slot에 놓고 나머지 12장을 private deck으로 유지한다. Purchase/reserve removal은 같은 tier의 deck top으로 같은 slot을 즉시 채운다. Deck이 비면 `null`이고, 다른 tier 대체나 slot compression은 없다.

## 4. Main actions

- `COLLECT_BASIC`: available basic 1~2종을 각 1개 받는다. 빈 선택, 중복, 3종 이상과 `PRISM` 혼합은 거절한다.
- `COLLECT_PRISM`: supply에 남은 `PRISM` 정확히 1개를 받는다.
- 모든 collect는 결과 holding 9 이하일 때만 전체 성공한다. Partial grant/automatic return은 없다.
- Permanent discount는 purchased card의 production resource마다 +1이다. Effective cost는 resource별 `max(0, printed - discount)`다.
- Purchase payment는 same basic을 먼저 쓰고 전체 부족분만 `PRISM`으로 채운다. Client payment plan은 없다.
- Market purchase는 한 face-up card를 purchased collection으로 이동하고 같은 action candidate에서 refill한다.
- Reserved purchase는 actor 자신의 reserved ID만 제거해 purchased collection으로 이동하며 market을 바꾸지 않는다.
- 지불된 basic/`PRISM`은 supply에 반환한다. Canonical initial cap을 넘는 반환은 corrupt conservation state로 fail-closed한다.
- Reserve는 face-up card만 대상으로 하며 최대 2장, reward 없이 동일 `cardId`를 보존하고 즉시 refill한다.

예상 가능한 illegal action은 closed domain failure로 반환하고 input object는 변경하지 않는다. Canonical state corruption은 조용히 fallback하지 않고 예외로 차단한다.

## 5. Legal action, YIELD and timeout

Legal main action evaluator는 canonical supply, cap, face-up/own-reserved cards, discounts, payment ability와 reserve capacity로 `COLLECT | PURCHASE | RESERVE` 가능성을 각각 계산한다. 세 action 중 하나라도 가능하면 YIELD는 `YIELD_NOT_ALLOWED`다. 아무 것도 가능하지 않을 때만 verified YIELD가 actor를 no-progress tracker에 기록한다.

Successful main action은 empty tracker helper로 cycle을 reset한다. Tracker eligibility는 non-forfeited player이며 presence를 알지 않는다. 모든 eligible player를 한 번씩 덮을 때만 cycle complete이고, forfeit 뒤 preserved tracker로 끝내기 전에는 모든 remaining eligible player의 legal action을 canonical state에서 다시 계산한다.

Timeout pure rule도 같은 evaluator를 직접 사용한다. Legal action이 있으면 `NO_ACTION_ADVANCE`와 tracker reset, 없으면 `VERIFIED_NO_PROGRESS` record다. Caller가 제공한 offline 여부가 true일 때 streak만 증가한다. 세 번째 offline timeout은 먼저 위 action/tracker 결과와 streak 3을 만들고, 이어서 resource를 반환하지 않는 offline-timeout forfeit를 적용한다. Connected timeout은 streak를 증가시키지 않고, resume integration은 zero-reset helper를 P11B에서 사용한다. Clock callback, scheduler와 idempotency는 이 domain에 없다.

## 6. Forfeit and progress

Explicit leave와 offline-timeout forfeit는 서로 다른 concrete transition이다.

- Explicit leave: 모든 holding을 supply에 반환하고 player holding을 0으로 만든다.
- Offline third-timeout: holding을 player 아래에 그대로 동결하며 supply에 반환하지 않는다.
- 두 path 모두 purchased/reserved cards를 보존하고 player를 forfeited로 만들며 tracker에서 해당 player record만 제거한다.

Eligible player가 정확히 한 명이면 `LAST_PLAYER_STANDING`이 즉시 우선한다. Zero eligible state는 정상 reachable state가 아니며 fail-closed한다.

## 7. Fair-round and finish precedence

Pending fair round는 reason과 아직 행동할 `remainingPlayerIds`만 저장한다. 별도 round counter나 stable round ID는 없다. Immutable order `A,B,C`에서 consumed action trigger 후 queue는 actor 뒤부터 cycle 끝까지다: A trigger는 B,C, B trigger는 C, C trigger는 empty라 같은 commit에서 완료된다. Forfeited player는 queue에서 빠진다. Out-of-turn forfeit가 market condition을 만들면 현재 active player부터 cycle 끝까지 queue에 둬 그 mutation 자체가 turn을 소비하지 않았음을 보존한다.

판정 순서는 다음과 같다.

1. eligible 1명: `LAST_PLAYER_STANDING`
2. 이미 pending인 fair-round reason 유지 및 boundary completion
3. 같은 purchase의 score threshold와 market exhaustion: `SCORE_THRESHOLD_ROUND_END`
4. 새 `MARKET_EXHAUSTED_ROUND_END`
5. revalidated complete tracker의 `NO_PROGRESS`

Market exhaustion predicate는 모든 tier deck과 face-up slot이 비고, non-forfeited player의 reserved card도 없을 때만 true다. Forfeited player 아래 frozen reserve는 progress 후보가 아니다. Exhaustion은 즉시 종료가 아니라 같은 fair-round queue를 시작한다.

## 8. Result and GameState

Finish reasons는 정확히 다음 네 개다.

- `SCORE_THRESHOLD_ROUND_END`
- `MARKET_EXHAUSTED_ROUND_END`
- `NO_PROGRESS`
- `LAST_PLAYER_STANDING`

Result score는 purchased-card points 합이다. Non-forfeited group을 score descending competition ranking하고 최고 tie는 공동 winner다. Forfeited group은 모든 non-forfeited entry 뒤에서 별도 score-desc competition ranking을 적용한다. Additional bonus/transfer/tie-break는 없다. Last-player-standing은 유일한 non-forfeited player만 winner다.

`GemGameState`는 game ID/revision, literal rule/cardset versions, canonical cards, market/decks, supply, players, immutable turn order, 45-second turn, no-progress tracker, pending fair round와 result만 가진다. Room/session/presence, storage/room revision, idempotency, connection, scheduler와 overall game deadline은 포함하지 않는다. Setup factory는 pre-shuffled player/tier order와 이미 생성된 exact 45-second initial turn을 받으므로 RNG와 Clock을 소유하지 않는다.

## 9. Verification and remaining boundary

P11A는 GEM domain 신규 76 cases를 추가했다. 최종 기준선은 shared 75, Web 151, server 780으로 총 1006 tests이며, root typecheck/build, 기존 production-serving regression과 `git diff --check`를 함께 통과해야 checkpoint가 성립한다. Test matrix는 exact 45-card seed/balance, resource/card conservation, collect/payment/purchase/reserve/refill, legal-action/YIELD/no-progress, 45-second timeout, explicit/offline forfeit, fair-round/finish precedence, concrete result/ranking, deep immutability와 import boundary를 포함한다.

P11A는 개별 aggregate factory와 pure transition 경계를 제공하지만 persisted `GemGameState` 전체를 clone/validate하는 codec은 만들지 않는다. Room phase, active actor, scoped revision/turn/request, UoW/idempotency, scheduler/recovery와 함께 complete candidate를 조립하고 commit 전후 whole-state coherence/conservation을 검증하는 책임은 P11B integration gate에 남긴다.

## 10. P11B handoff

P11B에서만 다음을 연결한다.

- `GEM_CARD` GameType/identity registration과 exact RoomRecord branch
- server RNG를 이용한 turn order/tier deck shuffle와 server Clock/ID materialization
- action services, scoped revision/turn/request validation, Room lane/UoW/idempotency
- state clone/validation/lifecycle adapter and persistence selection
- `gem:*` strict shared commands, V2 projection and deck-order privacy
- 45-second scheduler/recovery and resume streak reset
- capability/admission; Web/catalog enablement는 P11C/P12 gate까지 별도다.

P11A에서는 `GameRegistry`, stored envelope, generic command executor, `GameModule`, shared protocol, catalog와 renderer를 변경하지 않는다.

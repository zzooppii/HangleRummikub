# GEM_CARD Game Rules Gate

> 상태: `CONFIRMED` — P10 COMPLETE / P11A READY
> 작성일: 2026-09-07
> 사용자 결정: `GC-001`~`GC-038` 모두 A, 단 `GC-023=B`
> 내부 식별자: `GEM_CARD`
> 공개 작업명: 보석 카드 게임(working title; release 전 독립 naming review 필수)
> Version policy: 별도 immutable `rulesVersion = gem-rules-v1` / `cardSetVersion = gem-cardset-v1`
> 구현 gate: **OPEN FOR P11A** — 이 문서의 확정 규칙과 original-data 정책만 구현 가능
> 주의: 이 문서는 법률 자문이 아니며 특정 상용 게임의 명칭·표현·자료를 사용할 수 있다는 판단을 하지 않는다.

## 1. Document status

이 문서는 세 번째 게임 `GEM_CARD`의 canonical v1 규칙이다. 사용자가 `GC-001`~`GC-038`에서 모두 A를 선택하고 explicit PLAYING leave만 `GC-023=B`로 선택했다. 이후 clarification으로 resource 이동, fair-round boundary, YIELD/no-progress, timeout과 market-source exhaustion의 관계를 확정했다.

확정 범위는 당시 decision table의 선택지와 사용자 clarification뿐이다. 문서에 없는 새 mechanic, 수치 또는 asset 사용 권한까지 승인된 것으로 확대하지 않는다. 기존 [GAME_RULES.md](./GAME_RULES.md)와 [NUMBER_TILE_GAME_RULES.md](./NUMBER_TILE_GAME_RULES.md)는 각각 `HANGUL_TILE`, `NUMBER_TILE`의 별도 canonical rule이다.

## 2. Game identity

- **CONFIRMED:** 중립 내부 ID는 `GEM_CARD`다.
- **CONFIRMED:** 공개 작업명은 문서와 개발 중 **보석 카드 게임**을 사용한다. 이는 release naming clearance가 아니며 공개 출시 전 독립 review를 거친다.
- **CONFIRMED:** 제품은 공유 시장에서 카드를 확보하고 자원을 순환시키며 각자 영구 생산 효과와 점수를 쌓는 독립적인 턴제 engine-building game이다.
- Tile, Rack, Meld, Board rearrangement, Joker, Draw/Pass 또는 whole-table Submit을 요구하지 않는다.
- 특정 상용 브랜드, 고유 명칭, 공식 logo/art, rulebook 표현, published card/deck table 또는 trade dress를 이 게임의 정체성으로 사용하지 않는다.

## 3. IP/product boundary

일반적인 game mechanic 아이디어와 구체적인 상업적 표현을 분리한다. 공개 시장, 자원 지불, 영구 효과, 점수, reserve 같은 일반 개념은 독립적으로 설계할 수 있는 후보로 다루되, 특정 제품의 이름·문장·그림·배치·icon·exact 수치표를 출처로 삼지 않는다.

개발 정책은 다음과 같다.

- title, terminology, visual identity와 card data는 `ORIGINAL_ONLY`를 기본으로 한다.
- 외부 asset은 자체 제작, 적법하게 licensed, 또는 호환 가능한 public-domain 자료만 사용하고 출처·license를 기록한다.
- 기존 rulebook 문장을 복사하거나 가까운 표현으로 다시 쓰지 않는다.
- 공개 전 naming/asset/data provenance를 별도로 검토한다. 이 검토는 법적 clearance를 보장하지 않는다.
- 인터넷의 공식 카드 이미지나 published balance table을 참고 자료라는 이유로 source/data에 옮기지 않는다.

## 4. Confirmed platform invariants

다음은 `GEM_CARD` 세부 규칙이 아니라 현재 플랫폼에서 이미 확정된 안전·운영 불변 조건이다.

1. Room, Player, Host, session, reconnect, presence, invitation URL, Room lane, UoW/CAS, idempotency와 cleanup은 플랫폼이 소유한다.
2. Room의 canonical `gameType`은 서버가 저장하고 lifetime 동안 바꾸지 않는다. URL이나 client local selection은 Room game type의 권위가 아니다.
3. game state, random deck order, command legality, score와 result는 서버 권위다. Client preview는 판정 근거가 아니다.
4. 실제 state mutation은 인증·phase·game type·scoped revision·request identity를 검사한 뒤 원자적으로 한 번 commit하며, 실패 시 canonical state와 accepted idempotency record를 남기지 않는다.
5. player별 projection은 private state를 다른 player나 공용 broadcast에 노출하지 않는다. Session credential, socket identity, storage revision, RNG와 scheduler internals도 wire에 넣지 않는다.
6. 알 수 없거나 지원하지 않는 game type/client capability는 `HANGUL_TILE` 또는 다른 renderer로 fallback하지 않고 admission·command 전에 fail-closed한다.
7. Game-specific command/event, projection, result, timer와 rule은 concrete module이 소유한다. `GameModule`, GenericCard/Resource/Turn/Result를 미리 만들지 않는다.
8. P10 시점의 runtime supported games와 Home catalog는 `HANGUL_TILE`, `NUMBER_TILE`뿐이다. `GEM_CARD`는 아직 runtime value가 아니다.

## 5. Confirmed original mechanics overview

다음은 확정된 A안과 `GC-023=B`를 한데 모은 canonical summary다.

| 영역 | `CONFIRMED` |
| --- | --- |
| Player | 2~4명 |
| Basic resources | original working type 5종 |
| Wild resource | `PRISM` working ID 1종; collect에서 basic 2개 대신 1개 선택 |
| Supply | Player 수와 무관하게 basic 각 7, wild 5 |
| Market | tier 3개, tier별 face-up 3장 |
| Deck | tier별 15장, 총 45장의 독립 제작 dataset |
| Card | unique `cardId`, basic-resource cost, 한 종류 permanent discount +1, points, special ability 없음 |
| Collect | 서로 다른 available basic 최대 2개 또는 wild 1개 |
| Holding limit | 총 9개; action 결과가 넘으면 command 거절, 반환 sub-step 없음 |
| Reserve | face-up card만, Player당 최대 2장, 공개, reward 없음 |
| Purchase | market/reserved card 한 장; server가 basic token 우선, wild가 남은 부족분을 대체 |
| Turn | 정확히 한 canonical main action; 서버가 처음 한 번 shuffle한 immutable order |
| Timer | server-authoritative 45초; timeout은 no-action turn advance |
| Offline | 자신의 연속 offline timeout 3번째 action 적용 뒤 forfeit; resume 시 reset |
| Overall deadline | 없음 |
| End | score 18 도달 또는 market exhaustion이면 fair round completion; verified no-action full cycle이면 `NO_PROGRESS`; 한 명만 남으면 즉시 `LAST_PLAYER_STANDING` |
| Score | purchased card points 합; non-forfeited 최고점 공동 winner, 별도 tie-break 없음 |
| Objectives/abilities | v1 없음 |
| Privacy | Shared supply와 모든 player resource, reserve/purchased/market은 exact public; deck order와 server internals만 private |
| Explicit leave | held resources 전부 supply 반환 후 forfeit; purchased/reserved cards와 score는 해당 player 아래 동결 |

이 묶음은 상용 제품의 data table을 재현하기 위한 것이 아니다. 특히 3×3 market, 45-card original dataset, collect/wild 방식, reserve 2장/no reward, holding limit 9, target 18과 no-tie-break를 함께 독립 baseline으로 확정했다.

## 6. Decision record and status legend

- 사용자 선택은 `GC-001`~`GC-038`에 대해 A이며 `GC-023`만 B다.
- A/B/C 원문은 결정 이력과 alternative의 영향을 보존하기 위해 아래 표에 남긴다.
- `CONFIRMED (A)` 또는 `CONFIRMED (B)`만 P11 구현 근거다. 선택되지 않은 option은 구현 후보가 아니다.
- IP/product 정책은 original expression/data를 요구하지만 법적 clearance를 의미하지 않는다.

## 7. Full decision table

모든 행은 사용자 승인과 consistency audit을 마쳤다. `GC-023`만 B이고 나머지는 A다.

| ID | Rule | A — recommended original baseline | B | C | Status | Implementation impact | IP/design impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `GC-001` | Player count | 2~4명 | 2~5명 | 3~4명 | `CONFIRMED (A)` | Room capacity, start validation, supply/balance test 범위 | 일반 mechanic; exact balance는 인원별 독립 검증 필요 |
| `GC-002` | Basic resource count/types | 5종; working IDs `DAWN/TIDE/GROVE/EMBER/ECHO`, UI color는 별도 | 4종 `DAWN/TIDE/GROVE/EMBER` | 6종, A에 working ID `MIST` 추가 | `CONFIRMED (A)` | Cost vector, supply, projection, collect UI 전체 차원 결정 | 이름·icon·색 배합은 original naming/visual review 대상 |
| `GC-003` | Wild resource existence/acquisition | Held wild `PRISM` 1종 있음; collect에서 basic 선택 대신 획득 | Held wild 1종 있음; reserve reward로만 획득 | wild 없음 | `CONFIRMED (A)` | Cost solver, supply conservation, collect/reserve schema 분기 | generic wild concept만 사용; icon/name은 original-only |
| `GC-004` | Resource supply counts | 인원과 무관하게 basic 각 7, wild 5 | 2인 basic 각 5/wild 3, 3인 6/4, 4인 7/5, 5인 8/6 | 인원과 무관하게 basic 각 6, wild 4 | `CONFIRMED (A)` | Setup, availability, conservation, balance fixture | published token table 복제 금지; 수치는 독립 playtest 필요 |
| `GC-005` | Market tiers/categories | 3 tier (`TIER_1..3` internal) | 2 tier | 4 tier | `CONFIRMED (A)` | Deck/state/refill 구조와 balance dataset 수 | tier naming·visual hierarchy를 독자적으로 디자인 |
| `GC-006` | Face-up cards per tier | tier별 3장 | tier별 4장 | tier별 2장 | `CONFIRMED (A)` | Market slot count, snapshot size, responsive layout | exact commercial layout/trade dress를 피하도록 3-slot baseline 권장 |
| `GC-007` | Collect action | 서로 다른 available basic 최대 2개 또는 wild 1개 | 서로 다른 basic 최대 3개; wild 직접 획득 없음 | basic 한 종류 2개(행동 전 해당 supply ≥3) 또는 서로 다른 basic 2개 | `CONFIRMED (A)` | Selection validator, liveness, supply depletion와 UI complexity | collect pattern을 독립적인 제품 mechanic으로 명시 |
| `GC-008` | Player resource limit | 총 9; 결과가 넘는 action은 거절, return selection 없음 | 총 10; 초과분을 같은 action에서 선택 반환 | 제한 없음 | `CONFIRMED (A)` | A는 단순 validator, B는 atomic return payload/timeout 필요 | exact familiar limit 복제를 피하고 UX/balance 근거 기록 |
| `GC-009` | Permanent discount | Purchased card마다 표시 basic type discount +1; effective cost floor 0 | card마다 +1/+2 production value 가능 | permanent discount 없음 | `CONFIRMED (A)` | Player engine, cost calculation, public projection | bonus icon/layout과 value distribution은 original dataset 소유 |
| `GC-010` | Reserve enabled/source | 사용; face-up market card만 reserve | face-up 또는 hidden deck top reserve | reserve 없음 | `CONFIRMED (A)` | State/action/private projection와 refill path 결정 | hidden draw pattern을 자동 채택하지 않고 A로 차별화 |
| `GC-011` | Reserve capacity | Player당 2장 | 1장 | 3장 | `CONFIRMED (A)` | Capacity error, UI slots, end-state calculation | exact capacity는 independent balance decision |
| `GC-012` | Reserve privacy during PLAYING | 모든 reserved card identity/cost/effect public | face-up source는 public, hidden-deck source는 owner-only | 모든 reserved card owner-only, 상대는 count만 | `CONFIRMED (A)` | Viewer-specific schema 필요 정도가 달라짐; `GC-010`과 연동 | 카드 뒷면/secret UI는 original asset 필요 |
| `GC-013` | Reserve reward | 별도 resource reward 없음 | wild가 supply에 있으면 1개 지급 | 선택한 basic 1개를 supply에서 지급 | `CONFIRMED (A)` | Reserve atomic mutation과 holding limit interaction | familiar reward package 복제를 피하기 위해 A 권장 |
| `GC-014` | Purchase semantics | card 한 장 지정; server가 discount 후 basic token을 먼저 쓰고 wild로 부족분 충당 | Client payment plan을 제출하고 server가 검증 | 한 action에 affordable cards 최대 2장 bundle | `CONFIRMED (A)` | A는 deterministic minimal payload, B/C는 choice·fingerprint 확대 | payment UX와 card layout은 독립 표현 사용 |
| `GC-015` | Special card abilities | v1 없음; discount+points만 | 일부 card가 purchase 때 선택한 available basic 1개를 얻는 one-shot만 가짐 | 일부 card가 reserve capacity를 +1 하는 persistent ability만 가짐 | `CONFIRMED (A)` | Rule/state/action complexity와 card schema 크게 증가 | 고유 ability text/data는 original authoring·review 필수 |
| `GC-016` | Scoring sources | Purchased card points만 | card points + `GC-035=B` public objectives | card points + 종료 시 선택된 모든 basic type을 하나씩 보유한 set당 +1 | `CONFIRMED (A)` | Result calculator와 projection field 결정 | published score distributions/objectives 복제 금지 |
| `GC-017` | Target/end score | 18점 이상 | 15점 이상 | 22점 이상 | `CONFIRMED (A)` | End trigger와 balance/test duration 결정 | 숫자와 card point curve를 original dataset과 함께 검증 |
| `GC-018` | Round completion | Threshold/exhaustion trigger 후 현재 immutable round 끝까지 진행 | Trigger action 직후 즉시 종료 | Trigger 뒤 각 other eligible player에게 정확히 1회 추가 turn | `CONFIRMED (A)` | Pending-end state와 forfeit/turn-order edge 처리 | fair-round 동작을 우리 문장과 UI로 독립 표현 |
| `GC-019` | Tie-break/ranking | Non-forfeited 최고점 공동 winner, competition rank `1,1,3`; 별도 tie-break 없음 | 최고점 뒤 purchased card 수가 적은 순 | 최고점 뒤 남은 resource 수가 적은 순 | `CONFIRMED (A)` | Result/winner/rank shape와 deterministic display | familiar tie-break 조합 자동 복제 대신 A 권장 |
| `GC-020` | Turn timer | server-authoritative 45초 | 60초 | timer 없음 | `CONFIRMED (A)` | Turn scheduler/recovery capability optionality 결정 | 다른 게임 수치를 자동 복사하지 않고 45초 original baseline |
| `GC-021` | Timeout action (`GC-020=A/B`일 때; timer 없음이면 `N/A`) | 자원·card 획득 없이 turn advance | 현재 supply가 가장 많은 basic 1개 획득(동점은 `GC-002` 순서) 후 advance | 같은 turn 첫 timeout에 15초 한 번 연장, 다음 timeout은 no-action advance | `CONFIRMED (A)` | Scheduled mutation, RNG 여부, revision/idempotency race | A가 단순하고 hidden automatic choice 없음 |
| `GC-022` | Overall deadline | 없음 | 30분; 도달 즉시 `TIME_LIMIT`, current score를 `GC-019`로 ranking | 20분; 도달 즉시 `TIME_LIMIT`, current score를 `GC-019`로 ranking | `CONFIRMED (A)` | Game-deadline scheduler와 `TIME_LIMIT` result 필요 여부 | 다른 두 game 정책을 자동 상속하지 않음 |
| `GC-023` | Explicit PLAYING leave | 즉시 forfeit; resources/cards는 result용 동결, supply로 반환하지 않음 | 즉시 forfeit하며 held resources만 supply로 반환 | `PLAYER_EXIT`로 전체 game 즉시 종료; leaving actor는 forfeited, remaining non-forfeited를 current score와 `GC-019`로 ranking | `CONFIRMED (B)` | Conservation, next turn, result와 session atomicity | Game-specific product policy이며 기존 게임 복사 금지 |
| `GC-024` | Offline timeout/forfeit (`GC-020=A/B`일 때; timer 없음이면 `N/A`) | 자신의 연속 offline timeout 3번째 action 적용 뒤 forfeit; resume 시 reset | 2번째 뒤 forfeit | automatic offline forfeit 없음 | `CONFIRMED (A)` | Streak state, presence-restored action과 privacy 필요 | P9 보류 정책을 세 번째 game 근거로 검증하는 핵심 결정 |
| `GC-025` | Last-player behavior | non-forfeited eligible 1명 순간 즉시 `LAST_PLAYER_STANDING` 단독 winner | 1명이어도 score/market/no-progress end trigger까지 solo 계속; 마지막 player도 forfeit하면 `ALL_PLAYERS_FORFEITED`, winner 없이 current scores를 `GC-019` 순서로 기록 | 즉시 `ABANDONED`, winner 없이 current scores만 기록 | `CONFIRMED (A)` | Terminal precedence와 all-forfeit reachable 여부 결정 | 기존 game finish set을 자동 복제하지 않음 |
| `GC-026` | Stalemate/deck exhaustion | 모든 deck+market empty면 fair-round end trigger; 그 전 legal collect/purchase/reserve가 전부 없을 때만 `gem:yield`, eligible 전원 연속 yield면 `NO_PROGRESS` | Market exhaustion만 종료, yield/no-progress 없음 | Active player에게 legal action이 하나도 없으면 즉시 종료 | `CONFIRMED (A)` | A는 bounded legal-action checker, no-progress tracker와 conditional command 필요 | 별도 solver/상용 stalemate 문구 복제 없이 독립 liveness policy |
| `GC-027` | Resource visibility during PLAYING | Shared supply와 모든 player의 type별 exact holdings public | 본인은 exact, 상대는 total count; shared supply는 type별 available 여부만 공개 | 본인만 exact, 상대 holding은 비공개; shared supply는 type별 available 여부만 공개 | `CONFIRMED (A)` | Viewer-specific projection/privacy tests 결정 | Public supply/history로 간접 추론 가능한 범위를 privacy claim에 반영 |
| `GC-028` | Reserved-card privacy at FINISHED | PLAYING의 `GC-012` 정책을 그대로 유지 | FINISHED에서 모든 reserve identity 공개 | FINISHED에서도 모두 owner-only, 상대는 count만 | `CONFIRMED (A)` | FINISHED projection과 result audit fields 결정 | `GC-012`는 PLAYING, 본 항목은 FINISHED reveal policy로 중복 아님 |
| `GC-029` | Command event strategy | `gem:collect`, `gem:purchase`, `gem:reserve`; `GC-026=A`면 `gem:yield` 추가 | 하나의 `gem:command` + closed Gem action union | platform-wide generic `game:command` | `CONFIRMED (A)` | Shared event maps, validators, router/ack typing | A가 game identity를 명확히 하고 generic bus 고정을 피함 |
| `GC-030` | Mutation identity | `gameRevision` + immutable `turnId` + `requestId`/idempotency | `gameRevision` + requestId만 | Room revision + action nonce | `CONFIRMED (A)` | Stale/race/replay contract와 persistence fingerprint 결정 | Product-neutral safety; numeric wire representation은 별도 protocol gate |
| `GC-031` | Start readiness | Host only, `GC-001`에서 선택한 범위의 registered players 모두 CONNECTED | Host only, offline participant 제외 후 선택된 최소 인원 이상이면 시작 | 선택된 인원 모두 투표하면 자동 시작 | `CONFIRMED (A)` | Platform start router와 presence precondition 결정 | A는 현 platform UX reuse지만 Gem policy로 별도 승인 필요 |
| `GC-032` | First player/turn order | Server가 start 때 한 번 shuffle, immutable order | join order | Host가 첫 player를 선택 후 cyclic order | `CONFIRMED (A)` | RNG consumption, fairness와 recovery state 결정 | A는 P9B shuffle primitive 사용 가능 후보일 뿐 의무 아님 |
| `GC-033` | Market refill timing | Purchase/reserve 성공 안에서 같은 tier slot 즉시 refill | Turn 종료 때 빈 slot batch refill | 다음 round 시작 때 refill | `CONFIRMED (A)` | Atomicity, snapshot transient state, end trigger timing | Refill animation/layout은 rule과 분리하고 독자 표현 |
| `GC-034` | Deck exhaustion per tier | 해당 tier slot은 empty로 유지; 다른 tier에서 대체하지 않음 | 같은 tier의 남은 face-up cards를 왼쪽부터 압축 | 인접 tier deck이 slot을 대체 | `CONFIRMED (A)` | Market shape와 validators, final exhaustion 계산 | A가 tier 의미와 transparent state를 가장 단순하게 보존 |
| `GC-035` | Objective system | v1 없음 | 공개 shared objectives | player-private missions | `CONFIRMED (A)` | State, score, privacy, data authoring 규모가 크게 달라짐 | 기존 제품의 objective/bonus 체계를 복제하지 않기 위해 A 권장 |
| `GC-036` | Exact public naming policy | 내부 `GEM_CARD`, 공개 작업명 “보석 카드 게임”; release 전 독립 title clearance/review 필수 | original 후보 “빛 조각 공방”을 별도 review 후 사용 | P11까지 public name 없이 codename만 사용 | `CONFIRMED (A)` | Catalog copy, analytics, storage migration naming 범위 결정 | 상표 사용 가능성을 단정하지 않으며 logo/title original-only |
| `GC-037` | Original deck size/data | tier별 15장, 총 45장; cost/bonus/points table을 처음부터 작성해 별도 승인 | tier별 12장, 총 36장 | tier별 18장, 총 54장 | `CONFIRMED (A)` | Setup/refill/end/balance fixture와 실제 P11 domain data의 필수 blocker | Published deck/card table을 복제하지 않고 provenance 기록 필수 |
| `GC-038` | Rules/data versioning | 별도 immutable `rulesVersion`과 `cardSetVersion`을 start state에 snapshot | 단일 ruleset version에 card data 포함 | version field 없이 deploy version만 사용 | `CONFIRMED (A)` | Persistence/replay/migration과 test fixture 재현성 결정 | Original dataset provenance와 release audit에는 A가 가장 명확 |

## 8. Setup

**CONFIRMED (`GC-001`, `004`~`006`, `031`~`034`, `037`, `038`):**

1. Host가 2~4명의 모든 registered player가 `CONNECTED`인 Lobby에서 기존 platform `game:start`를 요청한다.
2. 서버가 각 tier의 original card deck을 독립적으로 shuffle하고 player turn order를 한 번 shuffle한다.
3. Basic resource 5종은 각각 7개, `PRISM`은 5개로 shared supply를 만든다. Player 수에 따른 supply scaling은 없다.
4. 각 player는 resource, purchased card, reserved card와 score 없이 시작한다.
5. 각 tier의 15-card deck에서 3장을 공개 market slot에 둔다. Deck top/order는 공개하지 않는다.
6. 이 game instance가 사용하는 immutable `rulesVersion = gem-rules-v1`과 `cardSetVersion = gem-cardset-v1`을 start state에 함께 고정한다.

Turn order는 start 뒤 immutable하며 forfeited player는 배열에서 삭제하지 않고 active rotation에서 건너뛴다. P9B frozen Fisher–Yates는 동일한 난수 소비 semantics가 유지될 때 사용할 수 있는 검증된 primitive일 뿐, GEM domain의 deck/turn-order 정책을 소유하지 않는다.

## 9. Resources

**CONFIRMED (`GC-002`, `004`, `008`, `023`, `027`):**

- Basic resource working IDs는 `DAWN`, `TIDE`, `GROVE`, `EMBER`, `ECHO`다. 이는 공개 release 명칭이나 icon이 아니다.
- UI hue, texture, symbol과 domain identifier를 분리하고 색각에만 의존하지 않는다.
- Successful collect는 shared supply에서 player holding으로, successful purchase payment는 player holding에서 shared supply로 resource를 원자적으로 이동한다.
- Player가 보유할 수 있는 basic과 `PRISM`의 합은 최대 9개다. Action 결과가 9를 넘으면 일부만 적용하거나 반환 sub-step을 열지 않고 전체 command를 거절한다.
- Explicit PLAYING leave는 그 player가 가진 basic과 `PRISM` 전부를 shared supply에 먼저 반환하고 holding을 0으로 만든 뒤 forfeit한다.
- Offline-timeout forfeit는 explicit leave가 아니므로 resource를 반환하지 않는다. 그 player의 holding은 canonical state와 result audit를 위해 동결한다.
- 두 forfeit path 모두 purchased/reserved cards와 이미 얻은 score를 player 아래에 동결하며 다른 player나 market/deck으로 옮기지 않는다.

## 10. Wild resource

**CONFIRMED (`GC-003`, `007`, `013`, `014`):**

- `PRISM`은 card printed cost에는 등장하지 않는 fungible wild working type이다.
- Collect에서는 basic 1~2개 선택 대신 supply의 `PRISM` 정확히 1개를 선택할 수 있다.
- Reserve는 basic이나 `PRISM` 보상을 주지 않는다.
- Purchase 시 서버가 permanent discount를 먼저 적용하고 각 basic holding을 가능한 만큼 소비한 뒤, 남은 모든 부족분만큼 `PRISM`을 소비한다.
- Client가 wild assignment나 payment plan을 보내더라도 서버는 canonical cost, purchased-card engine과 holding에서 지불을 다시 계산한다.

## 11. Market and decks

**CONFIRMED (`GC-005`, `006`, `026`, `033`, `034`, `037`):**

- 3개 tier는 각각 15-card deck과 face-up 3-slot market을 가진다.
- Market card가 purchase 또는 reserve되면 같은 atomic action 안에서 같은 tier deck top으로 그 slot을 즉시 refill한다.
- 한 tier deck이 empty면 그 tier의 빠진 slot은 명시적으로 empty로 남는다. Slot을 압축하거나 다른 tier card로 대체하지 않는다.
- Public projection은 slot별 face-up card 또는 empty와 tier별 remaining deck count를 공개한다.
- Deck order, next card와 shuffle state는 private server state다.
- **Market source exhausted**는 모든 tier deck과 모든 face-up market slot이 empty인 상태만 뜻한다. 한 tier만 empty인 것은 end trigger가 아니다.
- Source가 exhausted여도 non-forfeited eligible player가 reserved card를 하나라도 보유하면 즉시 market 종료하지 않는다. 해당 card는 normal collect/purchase 또는 verified `YIELD` 흐름으로 계속 처리한다.
- Source가 exhausted이고 non-forfeited eligible player 아래 reserved card가 더는 없을 때 별도 `MARKET_EXHAUSTED_ROUND_END` fair-round trigger를 설정한다. Forfeited player 아래 동결된 reserved card는 eligible progress에 포함하지 않는다.
- Source exhaustion 뒤 eligible reserve가 남아 있지만 아무도 legal action을 할 수 없다면 `YIELD`/timeout no-progress cycle이 `NO_PROGRESS`를 만들 수 있다.

Canonical cost/production/point rows는 [GEM_CARD_CARDSET_V1.md](./GEM_CARD_CARDSET_V1.md)의 original `gem-cardset-v1` 45장으로 확정했다. `GC-037=A`의 tier별 15장, 총 45장과 original-authoring 정책을 충족하며 published dataset을 참조하거나 승인하지 않는다. P11A는 이 문서의 row를 immutable typed seed로 옮기고 machine-readable schema/range/distribution 검사를 추가한다. P11B/public enablement 전에는 version 연결, simulation/playtest balance와 release provenance review를 별도로 거친다.

## 12. Cards

**CONFIRMED (`GC-009`, `014`~`016`, `037`):**

최소 concrete card domain requirement는 다음과 같다. 실제 TypeScript representation은 P11A가 정한다.

```text
GemCard
  cardId: unique opaque identity
  tier: TIER_1 | TIER_2 | TIER_3
  cost: exact basic-resource vector
  productionType: exactly one confirmed basic resource type
  points: non-negative integer
```

- 각 card는 game 안에서 고유한 `cardId`를 갖고 deck, market, 한 player의 reserve 또는 한 player의 purchased collection 중 정확히 한 곳에 존재한다.
- Face-up, reserved, purchased card의 identity, printed cost, production type과 points는 Room participant에게 public이다.
- v1에는 별도 card name, flavor text, character, objective 또는 special ability가 없다.
- Platform `GenericCard`를 만들지 않고 `GEM_CARD` domain이 card data와 validation을 소유한다.

## 13. Collect action

**CONFIRMED (`GC-007`, `008`, `026`):**

Active player는 한 turn에 다음 중 정확히 하나를 요청한다.

1. Supply가 양수인 서로 다른 basic type 1개 또는 2개를 선택해 type별 1개씩 받는다.
2. Basic 선택 대신 supply의 `PRISM` 정확히 1개를 받는다.

Basic과 `PRISM` 선택은 한 action에서 섞지 않는다. 같은 basic 두 개를 선택할 수 없다. 선택한 type 중 하나라도 unavailable이거나 결과 holding 총합이 9를 넘으면 전체 command를 reject한다.

- Holding 7 이하는 availability가 허용하는 범위에서 서로 다른 basic 최대 2개 또는 `PRISM` 1개를 받을 수 있다.
- Holding 8은 basic 1개 또는 `PRISM` 1개만 받을 수 있다.
- Holding 9에서는 collect가 legal하지 않다.

Server는 canonical supply와 holding을 검증하고 client가 보낸 count를 믿지 않는다. Successful collect는 resource를 원자적으로 이동하고 no-progress tracker를 reset하며 turn을 즉시 끝낸다.

## 14. Purchase action

**CONFIRMED (`GC-009`, `014`, `016`, `026`, `033`):**

1. Active player는 public market 또는 자기 reserve 중 source와 `cardId` 한 개를 지정한다.
2. Server는 card가 그 canonical source에 있고 actor가 접근할 수 있는지 검증한다.
3. 각 basic type별 `effectiveCost = max(0, printedCost - permanentDiscount)`를 계산한다.
4. 각 type에서 matching basic holding을 가능한 만큼 먼저 소비한다.
5. 남은 부족분 합계만큼 `PRISM`을 소비한다. 부족하면 command 전체를 거절한다.
6. 지불 resource를 supply로 반환하고 card를 purchased collection에 추가한다.
7. Market source라면 같은 tier slot을 즉시 refill한다. Reserved source라면 actor reserve에서 해당 card만 비운다.
8. Score와 end predicate를 서버가 계산하고 no-progress tracker를 reset한 뒤 하나의 canonical commit으로 turn을 끝낸다.

Source가 이미 exhausted인 상태에서 마지막 eligible reserved card를 purchase하면 `MARKET_EXHAUSTED_ROUND_END` fair-round trigger 조건을 만족할 수 있다. 같은 purchase가 score 18 이상도 만들면 `SCORE_THRESHOLD_ROUND_END`가 우선한다. Client cost preview와 animation은 편의 기능이며 authority가 아니다. Bundle purchase와 client-chosen payment allocation은 없다.

## 15. Reserve action

**CONFIRMED (`GC-010`~`013`, `026`, `028`, `033`):**

- Active player는 face-up market `cardId` 한 장을 지정한다.
- 자기 reserve가 2장 미만일 때만 가능하다.
- Card를 actor reserve로 옮기고 원래 market slot은 같은 tier에서 즉시 refill한다.
- Reserved card detail은 PLAYING과 FINISHED 모두 모든 Room participant에게 public이다.
- Reserve reward는 없고, reserve 자체는 points나 permanent discount를 주지 않는다. Purchase된 순간부터만 적용된다.
- Deck top blind reserve는 허용하지 않는다.
- Successful reserve는 no-progress tracker를 reset하고 turn을 끝낸다.
- Reserve action이 마지막 face-up card를 제거해 source를 exhausted로 만들어도 actor의 새 reserved card가 eligible progress이므로 즉시 `MARKET_EXHAUSTED_ROUND_END`를 설정하지 않는다.

`GC-012`는 PLAYING 중 visibility, `GC-028`은 FINISHED 전환 뒤 visibility를 정한다. 둘은 같은 질문의 중복이 아니다.

## 16. Permanent production/discount

**CONFIRMED (`GC-009`):**

- Purchased card 한 장은 자기 `productionType`의 permanent discount를 1 증가시킨다.
- Discount는 소모되지 않고 future purchase마다 다시 적용된다.
- Type별 discount가 printed cost보다 커도 effective cost는 0 아래로 내려가지 않는다.
- `PRISM` holding이나 reserved card는 permanent discount를 만들지 않는다.
- Server는 purchased cards로 discount를 검증하거나 다시 계산할 수 있어야 하며 client 합계를 authority로 받지 않는다.

## 17. Turn and fair-round model

**CONFIRMED (`GC-018`, `029`, `030`, `032`):**

- Server가 start 때 한 번 shuffle한 circular player order를 game lifetime 동안 immutable하게 보존한다. `eligible`은 이 order에 속하고 아직 forfeited하지 않은 player를 뜻하며 presence는 eligibility를 바꾸지 않는다.
- 한 turn의 successful canonical main action은 정확히 하나다: `COLLECT`, `PURCHASE`, `RESERVE`, 또는 legal action이 전혀 없을 때의 `YIELD`.
- Rejected action은 turn, state, `gameRevision`과 no-progress tracker를 바꾸지 않으므로 deadline 전에 수정해 재시도할 수 있다.
- Successful action과 canonical timeout은 각각 `gameRevision`을 정확히 한 번 증가시키고 다음 eligible player를 위한 새 immutable `turnId`를 만든다. Replay나 no-op callback은 추가 증가시키지 않는다.

Score가 18 이상이 된 canonical action은 conceptual `END_TRIGGERED` 상태와 reason `SCORE_THRESHOLD_ROUND_END`를 기록한다. `SCORE_THRESHOLD_ROUND_END`와 `MARKET_EXHAUSTED_ROUND_END`의 fair round는 trigger player의 immutable-order 위치 뒤에 있는 eligible player만 현재 cycle에서 한 번씩 행동하게 하고, cycle start로 wrap하기 직전에 끝난다. Forfeited player는 건너뛴다. Exact TypeScript field/discriminant는 P11A에서 이 의미를 보존하는 concrete state로 정한다.

- Order A→B→C에서 A가 trigger하면 B, C가 행동한 뒤 finish한다.
- B가 trigger하면 C가 행동한 뒤 finish한다.
- C가 trigger하면 그 action commit에서 곧바로 finish한다.
- Pending 중 eligible player가 forfeited하면 그 player는 남은 turn에서 빠진다. 정확히 한 명만 남으면 fair-round boundary보다 `LAST_PLAYER_STANDING`이 즉시 우선한다.

Page-local resource selection state는 server TurnDraft나 platform `GenericTurnDraft`가 아니다.

## 18. Timer and timeout

**CONFIRMED (`GC-020`~`024`):**

- Turn deadline은 server Clock 기준 45초이며 overall game deadline은 없다.
- Command의 시간 판정은 transport가 캡처한 authoritative receive time과 canonical deadline으로 한다. Client countdown은 display뿐이다.
- Timeout은 resource/card를 자동 선택하지 않고 no-action canonical turn을 commit한 뒤 다음 eligible player로 이동한다.
- Timeout 시 server가 canonical state에서 actor에게 legal `COLLECT`, `PURCHASE` 또는 `RESERVE`가 하나라도 있었는지 검사한다.
  - Legal action이 있었다면 기존 no-progress tracker를 reset하고 actor의 yield record를 추가하지 않는다.
  - Legal action이 전혀 없었다면 successful `YIELD`와 같은 방식으로 actor의 no-progress record를 추가하며 full cycle이면 `NO_PROGRESS`로 finish할 수 있다.
- Offline player의 세 번째 연속 timeout은 하나의 atomic candidate에서 no-action advance/no-progress accounting과 streak 3을 먼저 적용한 뒤 반드시 player를 forfeit하고 그 player의 no-progress record를 제거한다. 중간 `NO_PROGRESS` terminal을 commit하지 않고, 전체 forfeit effect 뒤 `LAST_PLAYER_STANDING`과 remaining eligible set의 terminal condition을 최종 평가한다.
- Stale/duplicate timeout callback과 player command race에서는 Room lane 안에서 정확히 하나만 commit한다.

## 19. Disconnect, reconnect and forfeit

**CONFIRMED (`GC-023=B`, `GC-024=A`, `GC-025=A`):**

- Network disconnect는 즉시 forfeit가 아니며 platform reconnect/session/presence와 current turn timer가 계속 동작한다. Offline이어도 non-forfeited player는 eligible이다.
- OFFLINE인 자기 turn에서 세 번 연속 timeout되면 세 번째 timeout action을 먼저 적용한 뒤 forfeit한다.
- 성공한 resume은 offline-timeout streak를 0으로 reset한다. Connected timeout은 그 streak에 넣지 않는다.
- Offline-timeout forfeit는 held resources와 purchased/reserved cards를 해당 player 아래에 동결한다. 이 path는 explicit leave resource-return policy를 사용하지 않는다.
- PLAYING explicit leave는 하나의 atomic mutation으로 다음 순서를 적용한다.
  1. Leaver의 basic과 `PRISM` holding 전부를 shared supply로 반환하고 holding을 0으로 만든다.
  2. Leaver를 forfeited로 표시하고 active turn rotation에서 제외한다.
  3. Purchased cards, score와 reserved cards는 그 player 아래에 동결한다. 다른 player에게 이전하거나 supply/market/deck으로 반환하지 않는다.
  4. Platform Room/session mutation과 game mutation은 future integration에서 동일 UoW로 commit한다.
- Current player가 forfeit하고 game이 계속되면 다음 eligible player의 fresh turn을 만든다. Non-current forfeit는 current turn identity를 유지한다.
- Non-forfeited eligible player가 정확히 한 명이 되는 순간 pending fair round와 no-progress tracker보다 먼저 `LAST_PLAYER_STANDING`으로 종료한다. 마지막 player의 post-terminal forfeit path는 만들지 않는다.

Forfeit 시 그 player의 no-progress record만 제거하고 나머지 eligible player 기록은 보존한다. 전체 forfeit effect 뒤 `LAST_PLAYER_STANDING`을 먼저 판정한다. Game이 계속되고 preserved records가 current eligible set을 모두 덮으면 server는 canonical supply/state에서 remaining eligible player에게 legal main action이 있는지 다시 확인한다. 하나라도 있으면 `NO_PROGRESS`로 끝내지 않으며, 다음 successful collect/purchase/reserve가 tracker를 reset한다. 아무 legal action도 없으면 그 forfeit mutation에서 `NO_PROGRESS`로 종료할 수 있다. 특히 explicit leave의 resource 반환으로 collect가 새로 legal해졌다면 stale record만으로 종료할 수 없다. 이는 기록 보존과 “YIELD는 legal action이 없을 때만”이라는 규칙을 동시에 지킨다.

이 offline policy는 세 번째 concrete rule일 뿐 platform-wide common abstraction을 확정하지 않는다.

## 20. End conditions and terminal precedence

**CONFIRMED (`GC-017`, `018`, `022`, `025`, `026`):**

GEM_CARD v1의 finish reason은 정확히 다음 네 가지다.

- `SCORE_THRESHOLD_ROUND_END`: successful purchase 뒤 player score가 18 이상이 되었고 confirmed fair round가 완료됨.
- `MARKET_EXHAUSTED_ROUND_END`: 모든 tier deck과 face-up market이 empty이고 non-forfeited eligible player 아래 reserved card가 더는 없는 상태에서 설정된 fair round가 완료됨.
- `NO_PROGRESS`: 모든 eligible player가 연속된 verified no-progress turn을 한 번씩 완료함.
- `LAST_PLAYER_STANDING`: non-forfeited eligible player가 정확히 한 명만 남음.

`MARKET_EXHAUSTED_ROUND_END`는 `NO_PROGRESS`와 다른 reason이다. Source가 exhausted되었어도 eligible reserved card가 있으면 market reason을 보류하고 normal action/YIELD 흐름을 계속한다. 마지막 eligible reserved card가 purchase되거나 그 owner가 forfeited되어 eligible progress에서 빠진 뒤, server가 canonical state에서 source exhaustion과 eligible reserve 부재를 함께 확인하면 market fair-round trigger가 활성화된다. Gameplay action이 trigger한 경우 그 action player의 immutable-order 위치를 fair-round anchor로 사용한다. Out-of-turn forfeit로 조건이 새로 성립한 경우에는 그 mutation이 current turn을 소비한 것으로 간주하지 않으며, 현재 canonical turn부터 남은 cycle을 진행하고 다음 cycle start로 wrap하기 직전에 finish한다. 이는 extra action을 주는 새 mechanic이 아니라 confirmed immutable-cycle boundary를 out-of-turn mutation에 적용한 것이다.

`YIELD`와 no-progress tracker는 다음과 같다.

1. Server가 actor에게 legal `COLLECT`, `PURCHASE`, `RESERVE`가 모두 없음을 증명한 경우에만 `YIELD`를 허용한다.
2. Successful `YIELD`는 resource/card를 바꾸지 않고 actor를 tracker에 기록하고 다음 eligible player로 진행한다.
3. 모든 current eligible player가 중복 없이 한 번씩 연속 기록되면 `NO_PROGRESS`로 즉시 finish한다.
4. Successful collect/purchase/reserve는 tracker 전체를 reset한다.
5. Legal action이 있던 timeout도 tracker 전체를 reset한다. Legal action이 없던 timeout은 2번과 같은 기록을 만든다.
6. Forfeit는 해당 player 기록만 제거하고 나머지를 보존하며 그 자체를 새 YIELD record로 세지 않는다. `LAST_PLAYER_STANDING`을 먼저 판정한 뒤 preserved records가 remaining eligible set을 모두 덮는 경우 canonical legal-action existence를 다시 검사한다. Legal action이 없으면 같은 mutation에서 `NO_PROGRESS`로 끝낼 수 있고, explicit leave의 resource 반환 등으로 하나라도 legal해졌으면 끝낼 수 없다.
7. Presence 변화만으로 tracker나 eligibility를 바꾸지 않는다.

Terminal precedence는 다음과 같다.

1. 어떤 mutation이 eligible player를 한 명으로 만들면 `LAST_PLAYER_STANDING`으로 즉시 종료한다.
2. 같은 purchase가 threshold와 market-exhaustion predicate를 함께 만족하면 `SCORE_THRESHOLD_ROUND_END`가 fair-round reason이 된다.
3. 같은 mutation에서 newly eligible `MARKET_EXHAUSTED_ROUND_END`와 completed no-progress tracker가 함께 성립하면 `GC-026=A`의 market fair-round trigger를 먼저 적용한다. `NO_PROGRESS`는 market source exhaustion 전 또는 eligible reserve 때문에 market trigger가 보류된 상태의 verified cycle을 종료하기 위한 reason이다.
4. 이미 pending인 fair-round reason은 이후 낮은 우선순위 reason으로 교체하지 않는다.
5. Pending fair round가 있는 동안 `NO_PROGRESS` tracker가 완성되더라도 pending reason의 confirmed boundary를 먼저 적용한다.
6. Fair-round boundary에 도달하면 최종 canonical score를 계산하고 pending reason으로 finish한다.

Overall deadline이 없으므로 `TIME_LIMIT`가 없고, immediate last-player 종료 때문에 `ALL_PLAYERS_FORFEITED`도 reachable finish reason이 아니다.

## 21. Scoring and ranking

**CONFIRMED (`GC-016`~`019`, `025`):**

- Player score는 purchased cards의 printed points 합이다.
- `SCORE_THRESHOLD_ROUND_END`, `MARKET_EXHAUSTED_ROUND_END`, `NO_PROGRESS`에서는 non-forfeited player를 score 내림차순으로 먼저 competition-ranking한다.
- 같은 score는 공동 rank와 공동 winner를 허용하며 purchased-card count, resource count, reserve count 등 추가 tie-break를 사용하지 않는다. Competition ranking은 `1,1,3`이다.
- Forfeited player도 result entry와 자기 purchased-card score를 유지하지만 winner가 될 수 없고 모든 non-forfeited player 뒤에 배치한다. Forfeited group 안에서는 score 내림차순과 동일 competition-ranking semantics를 적용한다.
- Explicit leave로 반환된 resources는 score에 영향을 주지 않는다. Purchased/reserved card가 동결되므로 purchased-card points는 보존된다.
- `LAST_PLAYER_STANDING`은 유일한 non-forfeited player를 winner/rank 1로 둔다. Score transfer 없이 모든 player의 score는 자기 purchased-card points 그대로다.

Exact result DTO와 rank representation은 protocol gate/P11에서 concrete GEM_CARD contract로 정하며 Hangul/Number Result를 재사용하지 않는다.

## 22. Objective and special-ability policy

**CONFIRMED (`GC-015`, `035`):** v1에는 public/private objective, character power, one-shot 또는 ongoing special ability를 넣지 않는다. Card는 cost, 한 종류 permanent discount와 points만 가진다.

추후 추가하려면 새 rules/card-set version과 별도 original-data/IP review가 필요하다.

## 23. Privacy matrix

**CONFIRMED (`GC-012`, `027`, `028`):** Resource와 reserve는 전략적 public information이다. Exact shared supply와 exact player holdings를 함께 공개하므로 가능한 산술적 추론을 private이라고 주장하지 않는다.

| Data | Owner | Other Room players | Unbound/public observer | Server only |
| --- | --- | --- | --- | --- |
| Face-up market cards | exact | exact | Room membership 없이는 없음 | deck relation |
| Tier deck | remaining count | remaining count | 없음 | exact card IDs/order/RNG |
| Shared resource supply | type별 exact count | type별 exact count | 없음 | canonical conservation data |
| Player basic/`PRISM` holdings | type별 exact | type별 exact | 없음 | canonical exact all players |
| Purchased cards/discount/score | exact public | exact public | 없음 | derived validation data |
| Reserved cards in PLAYING | exact public | exact public | 없음 | source/refill transition |
| Reserved cards in FINISHED | PLAYING policy 유지 | PLAYING policy 유지 | 없음 | canonical frozen state |
| Forfeited/resource-return status | canonical public result/state | canonical public result/state | 없음 | mutation audit detail |
| Offline-timeout streak | 없음 | 없음 | 없음 | exact |
| Pending end/no-progress tracker | 필요한 public status만 | 필요한 public status만 | 없음 | exact identities/history |
| Session/storage/idempotency/scheduler | 없음 | 없음 | 없음 | exact internals |

DOM, browser log, error detail과 telemetry도 wire privacy boundary를 우회하지 않는다. Unknown/reserved `cardId` probe는 해당 card 존재, owner 또는 deck position을 구분할 수 없는 safe game-specific error로 normalize한다.

## 24. Server authority and atomic mutation

- Client는 desired action과 필요한 opaque identity만 제안한다. Resource supply, legal-action existence, cost, discount, score, end condition과 refill 결과는 server가 canonical state에서 계산한다.
- Purchase는 source/ownership, cost/discount, basic/wild payment, token return, card movement, market refill, score/end predicate, no-progress reset, next turn과 revision/idempotency를 한 UoW에서 commit한다.
- Reserve는 capacity, market availability, card movement, refill, no-progress reset과 next turn을 같은 commit에 넣는다.
- Collect는 selection, supply, holding limit, conservation, no-progress reset과 turn advance를 commit 전에 검증한다.
- YIELD/timeout은 legal-action check, tracker update, end predicate와 turn advance를 한 canonical mutation으로 처리한다.
- Explicit leave는 resource return, forfeit/card freeze, tracker/turn/end transition과 platform Room/session mutation을 future integration에서 같은 UoW로 commit한다.
- Invalid, stale, expired, duplicate-conflict 또는 unauthorized command는 partial resource/card movement나 accepted replay record를 남기지 않는다.
- 같은 Room의 command, timeout, leave/forfeit는 동일 serialization lane에서 경쟁한다.
- `cardId`, player ID, revision과 turn identity는 opaque/canonical identity이며 display name이나 array index로 authority를 정하지 않는다.

## 25. Conceptual state and projection

아래는 confirmed rule을 빠뜨리지 않기 위한 설명용 read model이다. 실제 TypeScript field와 discriminated union은 P11에서 concrete GEM_CARD domain/protocol로 설계한다.

```text
GemCardGameState (conceptual)
  gameId / gameRevision
  rulesVersion / cardSetVersion
  decks (private ordered card IDs)
  market (public tier slots)
  resourceSupply
  players
    exact public holdings
    purchased cards / reserved cards
    forfeited / offline-timeout streak
  turn / 45-second deadline
  pending fair-round end / no-progress tracker
  Gem-specific result
```

Future `PlatformSnapshotV2` branch는 LOBBY에서 canonical `room.gameType`과 `game = null`, PLAYING에서 public market/supply/player state/turn, FINISHED에서 final state와 GEM_CARD-specific result를 제공해야 한다. Resource/reserve는 confirmed public data지만 projection은 credential과 server internals를 포함하지 않는다. P10에서는 snapshot union이나 runtime schema를 수정하지 않는다.

## 26. Confirmed valid examples

### 26.1 Collect and limit

- `DAWN`과 `TIDE` supply가 각각 남아 있고 actor holding이 7이면 각 1개를 받아 9개가 되는 collect는 valid다.
- Holding 8이면 available basic 한 개 또는 `PRISM` 한 개만 받을 수 있다.
- Basic 대신 `PRISM` 한 개를 받는 collect는 supply와 limit을 만족하면 성공하고 turn을 끝낸다.

### 26.2 Purchase with discount and wild

Card cost가 `DAWN 4 + TIDE 3`, actor discount가 `DAWN 1 + TIDE 1`, holding이 `DAWN 2 + TIDE 1 + PRISM 2`라면 effective cost는 `DAWN 3 + TIDE 2`다. Server는 basic `DAWN 2 + TIDE 1`을 먼저 쓰고 남은 2를 `PRISM 2`로 지불한다.

### 26.3 Reserve/refill and market source

Actor reserve가 1장일 때 face-up `card-27`을 reserve하면 capacity 2를 넘지 않는다. 해당 slot은 같은 tier deck top으로 즉시 refill하고 deck이 empty면 empty로 남는다. 이 action으로 모든 deck/market이 empty여도 `card-27`이 eligible actor의 reserve에 있으므로 즉시 `MARKET_EXHAUSTED_ROUND_END`로 가지 않는다.

### 26.4 Fair final round

Immutable order A→B→C에서 B의 purchase가 score 18을 만들면 `SCORE_THRESHOLD_ROUND_END`가 pending되고 C가 한 번 행동한 뒤 finish한다. C가 trigger하면 즉시 finish하며 A가 trigger하면 B와 C가 행동한 뒤 cycle start A로 wrap하기 전에 finish한다.

### 26.5 YIELD and timeout

A와 B 모두 canonical state에서 legal collect/purchase/reserve가 없다. A의 valid `YIELD` 뒤 B도 valid `YIELD`를 하면 full consecutive eligible cycle이 되어 `NO_PROGRESS`로 finish한다. B가 command 대신 timeout되어도 timeout 시 legal action이 없으면 같은 record를 만들 수 있다. 반대로 B에게 legal collect가 있다면 timeout은 tracker를 reset하고 record를 추가하지 않는다.

### 26.6 Explicit leave

B가 basic 2개와 `PRISM` 1개, purchased card 3장, reserved card 1장을 가진 채 explicit leave하면 resource 3개는 각 type shared supply로 돌아가고 B holding은 0이 된다. B는 forfeited되고 purchased/reserved cards와 score는 B 아래에 동결된다. 다른 eligible player가 한 명만 남으면 같은 atomic transition에서 `LAST_PLAYER_STANDING`으로 finish한다.

### 26.7 Shared winner

Final non-forfeited scores가 A=21, B=21, C=17이면 A와 B가 공동 rank 1/winner이고 C는 rank 3이다. Card 수나 resource 수로 동점을 깨지 않는다.

## 27. Confirmed invalid examples

- 같은 collect에서 `DAWN` 두 개를 요청하거나 basic 둘과 `PRISM`을 함께 요청하면 reject한다.
- Holding 8인 player가 basic 두 개를 요청해 결과가 10이 되면 하나만 주지 않고 전체 reject한다.
- Reserve가 이미 2장인데 새 card를 reserve하거나 deck top blind reserve를 요청하면 reject한다.
- Opponent reserve card를 자기 reserved source purchase로 참조하면 존재/owner를 구분하지 않는 safe error로 reject한다.
- Client가 보낸 discount 합계, score, supply count, legal-action 판정 또는 next card를 믿어 mutation하지 않는다.
- Market card를 제거한 뒤 payment가 부족함을 발견하고 card만 사라진 partial state를 commit하지 않는다.
- Source가 exhausted여도 eligible reserved card가 남아 있는데 즉시 `MARKET_EXHAUSTED_ROUND_END`로 finish하지 않는다.
- Legal collect/purchase/reserve가 있는데 `gem:yield`로 turn을 끝내거나 no-progress record를 추가할 수 없다.
- Explicit leave가 supply를 늘린 직후 preserved yield records만 보고 legal-action revalidation 없이 `NO_PROGRESS`로 finish할 수 없다.
- Deck order, offline streak, accepted request record나 session/storage data를 snapshot, DOM, log에 노출하지 않는다.

## 28. Edge cases and precedence

1. 같은 market card를 두 player가 거의 동시에 요청하면 Room lane에서 먼저 유효하게 commit된 command만 성공하고 다음 command는 stale/unavailable로 state 변화 없이 실패한다.
2. Refill할 deck이 empty면 slot은 empty다. Market array를 압축하거나 다른 tier card를 이동하지 않는다.
3. Purchase/reserve 뒤 refill을 끝낸 canonical state에서 전체 deck/market source exhaustion을 평가한다.
4. Threshold와 market-exhaustion predicate가 같은 purchase에서 성립하면 `SCORE_THRESHOLD_ROUND_END`가 우선한다.
5. Fair round 중 다른 player가 더 높은 score에 도달할 수 있으며 boundary에서 전체 final score를 비교한다.
6. Fair round 중 forfeit로 한 명만 남으면 `LAST_PLAYER_STANDING`이 즉시 우선한다.
7. Explicit leaver의 resources만 supply로 반환한다. 그 player의 purchased/reserved cards와 score, 그리고 offline-timeout forfeiter의 resources/cards는 각각 confirmed policy대로 동결한다.
8. Source exhaustion 뒤 eligible reserve가 남으면 normal action/YIELD를 계속한다. Eligible reserves가 모두 사라진 canonical state에서만 market fair-round trigger를 활성화한다.
9. Explicit leave resource 반환으로 collect가 legal해졌다면 old yield records만으로 no-progress 종료하지 않는다. Forfeited record만 제거하고 나머지는 보존하되 현재 state의 legality를 다시 확인한다.
10. All players offline이어도 presence만으로 끝나지 않는다. Timer와 platform retention이 각각 동작한다.
11. Legal-action checker는 canonical market, supply, holdings, discounts, reserve ownership/capacity와 holding limit을 사용하며 hidden deck top의 card face를 보지 않는다.
12. Duplicate accepted request는 resource/card movement를 반복하지 않고 기존 ack/replay semantics를 유지한다.

## 29. Resource and card conservation

```text
각 resource type:
initial supply
= current shared supply
+ all non-forfeited player holdings
+ offline-timeout-forfeited player frozen holdings
+ explicit-leave-forfeited player holdings (항상 0)

각 cardId:
exactly one of
deck | market slot | one player reserve | one player purchased collection
```

Explicit leave resource는 같은 atomic mutation에서 supply로 반환되므로 별도 discard/exile zone을 만들지 않는다. Offline-timeout forfeit resource는 player 아래 동결된다. 모든 forfeit의 reserved/purchased cards는 동일 player 아래 동결되며 card conservation에서 계속 한 위치를 차지한다. Payment/refund, card movement와 resource return은 partial commit 없이 수행한다.

## 30. Planned rule test matrix

P10에서는 runtime test를 작성하지 않는다. P11A 이후 최소 다음 table-driven domain coverage가 필요하다.

- 2/3/4 player setup, fixed supply/card totals, deck/order shuffle determinism과 unique `cardId`
- tier별 3-slot fill/refill, empty slot, no cross-tier replacement, exact card conservation과 source exhaustion
- Source exhaustion + eligible reserve delay, last eligible reserve purchase, threshold/exhaustion same-action priority
- Collect 1/2 distinct basic, `PRISM` alternative, unavailable/duplicate selection과 holding 7/8/9 boundary
- Type별 permanent discount, floor-zero effective cost, basic-first/`PRISM` payment와 insufficient resources
- Market/reserved purchase authorization, reserve capacity/public visibility/no reward와 immediate refill
- One-action-per-turn, revision/turn/request replay, stale/rejected atomic no-op
- 45-second deadline edge, duplicate callback와 command/timeout/leave race
- Timeout with/without legal action, yield-record/reset semantics와 full eligible no-progress cycle
- Offline streak/resume, third timeout-before-forfeit, timeout-forfeit resource freeze
- Explicit leave resource return, card/score freeze, active/non-active turn behavior와 Room/session/game atomicity
- Forfeit record removal, preserved records, post-return legal-action revalidation와 last-player precedence
- Exact A/B/C fair-round boundaries, threshold, market exhaustion와 pending reason stability
- Shared winners, forfeited ordering, no secondary tie-break와 last-player result
- Public resource/reserve projection, deck privacy와 unauthorized card probe normalization
- Original 45-card dataset schema/range/distribution와 immutable rules/card-set version snapshot

## 31. Platform reuse and P9 abstraction stress test

| Classification | Candidate | P10 finding |
| --- | --- | --- |
| `REUSE_AS_IS` | Room/session/presence/Host/reconnect/invitation | Gem rule을 Tile/Rack에 맞추지 않고 사용 가능 |
| `REUSE_AS_IS` | capabilities, Snapshot V2 shell, Room lane, UoW/CAS, idempotency, retention, Socket.IO mechanism | Concrete Gem validator/projector/action은 별도 필요 |
| `REUSE_AS_IS` | identity-only GameRegistry, Home catalog mechanism | 실제 P11/P12 완료 뒤 exact entry/item만 추가 후보 |
| `PROVEN_SMALL_PRIMITIVE` | GameRevision successor | Concrete Gem revision에서 같은 successor semantics를 사용 가능 |
| `PROVEN_SMALL_PRIMITIVE` | Frozen Fisher–Yates | Shuffled decks/order에서 RNG semantics가 같을 때 opt-in 가능 |
| `PROVEN_SMALL_PRIMITIVE` | Web async single-flight | Direct command UI의 동일 pending semantics에만 사용 가능 |
| `NOT_ASSUMED` | Gameplay supersession comparator | Direct actions에는 persistent TurnDraft가 없으므로 필요하지 않을 수 있음 |
| `OPTIONAL_MECHANISM` | Turn scheduler | Confirmed 45-second timer를 concrete Gem server action과 연결하되 policy는 Gem 소유 |
| `GAME_SPECIFIC` | Card/deck/market/resource/purchase/reserve/end/result | Concrete Gem state/rules로 유지 |

Stress-test 결론:

- `GenericRack`, `GenericTile`, `GenericBoard`, `GenericMeld`, `GenericJoker`, `GenericDraw/Pass`는 적용 대상이 없다.
- Resource selection UI의 transient state를 GenericTurnDraft로 승격하지 않는다.
- Result, ranking, timeout/offline policy와 legal-action/end semantics는 Gem-specific이다.
- Lifecycle/codec registry, start shell, generic executor, ranking/renderer abstraction, offline timeout policy와 stored envelope는 P10 규칙만으로 구현하지 않는다. 실제 third implementation 뒤 별도 승인한다.

## 32. IP risk summary

| Area | Risk | Development policy |
| --- | --- | --- |
| Game title | 상표·혼동 가능성 | `NEUTRAL_NAMING`; working title은 release 전 review |
| Logo | 고유 시각표현 복제 | `ORIGINAL_ONLY`; 공식 logo 참조/변형 금지 |
| Card artwork | 저작권·character/style 모방 | `ORIGINAL_ONLY` 또는 추적 가능한 license |
| Card layout | trade dress/전체 인상 유사 | 자체 hierarchy/grid/iconography 설계, `REVIEW_BEFORE_RELEASE` |
| Resource icons | 기존 icon 형태·색 조합 모방 | original symbol+label+texture, 색상만 의존 금지 |
| Rulebook text | 문장 표현 복제 | `DO_NOT_COPY`; 우리 규칙을 독립 문장으로 작성 |
| Card/deck data | exact cost/point/quantity table 복제 | `DO_NOT_COPY`; original dataset와 provenance 기록 |
| Terminology | 고유 명칭·character 이름 사용 | neutral internal IDs, original public copy |
| Exact balance numbers | published distribution의 실질 복제 | independent model/playtest로 생성·검토 |
| Objective system | 고유 보너스/조건 조합 모방 | v1에서는 제외; 추가 시 original design review |
| Marketing screenshots | 공식 board/card visual 노출 | 자체 build와 자체 asset만 촬영 |

## 33. Asset, data and text policy

- P10에서는 asset을 다운로드하거나 생성하지 않는다.
- Future asset manifest는 source, author, license, modification 여부와 allowed use를 추적해야 한다.
- Card art와 UI icon은 자체 제작, 적법한 commissioned/licensed work 또는 compatible public-domain source만 허용한다.
- Exact cost/point/deck table은 P10의 [GEM_CARD_CARDSET_V1.md](./GEM_CARD_CARDSET_V1.md)에 original design artifact로 확정했다. P11A는 이를 새로 추측하지 않고 typed seed로 옮기며, 이후 simulation/playtest balance와 release provenance를 검토한다.
- AI-generated asset을 쓰더라도 service terms와 input reference provenance를 검토하고 특정 작품/브랜드의 모방을 지시하지 않는다.
- Rule text, tutorial, tooltips와 marketing copy는 이 프로젝트가 독립적으로 작성한다.

## 34. Final consistency audit

`GC-001`~`GC-038`의 선택 결과(A, 단 `GC-023=B`)와 사용자 clarification을 함께 대입했다. 문서 수준의 직접 contradiction은 **없다**.

- Player/supply/start: 2~4명, fixed supply와 all-connected start가 일관된다.
- Resource/wild/cap: `PRISM`의 collect와 payment path가 닫혀 있고, cap 9 초과는 반환 sub-step 없이 reject된다.
- Reserve/privacy: Face-up reserve만 있으며 PLAYING/FINISHED 모두 public이라 hidden-card branch가 없다.
- Market: 한 tier empty와 전체 source exhaustion을 구분한다. Eligible reserve가 있으면 market end를 보류하고, 없을 때 별도 `MARKET_EXHAUSTED_ROUND_END` fair-round reason을 사용하므로 `NO_PROGRESS`와 역할이 겹치지 않는다.
- Fair round: Immutable circular order의 trigger 뒤 eligible positions만 실행하고 wrap 전에 finish한다. Forfeit skip과 immediate `LAST_PLAYER_STANDING` precedence가 모순되지 않는다.
- Timer/offline: 45초 no-action timeout은 legal-action 유무에 따라 tracker를 reset 또는 record하며, offline 3번째 timeout action 뒤 forfeit한다. Overall deadline race는 없다.
- YIELD/liveness: YIELD는 server가 세 main action 모두 불가능함을 확인해야만 가능하다. Successful action reset, forfeit record removal, presence non-eligibility와 full consecutive cycle 정의가 일관된다.
- Explicit leave: Resource return이 collect를 새로 legal하게 만들 수 있으므로 preserved record만으로 leave commit에서 `NO_PROGRESS`를 확정하지 않고 canonical legality를 재검사한다. 이는 “record 보존”과 “YIELD는 legal action 없음”을 함께 만족한다.
- Forfeit inventory: Explicit leave만 resource를 반환하고 offline-timeout forfeit는 resources를 동결한다. 두 path 모두 cards/score를 동결하므로 conservation이 닫힌다.
- End/result: `SCORE_THRESHOLD_ROUND_END`, `MARKET_EXHAUSTED_ROUND_END`, `NO_PROGRESS`, `LAST_PLAYER_STANDING` 네 reason만 사용한다. Threshold/market simultaneous priority와 last-player immediate priority가 명확하다.
- Same-mutation market exhaustion/no-progress: `GC-026=A`의 market fair-round가 `NO_PROGRESS`보다 먼저 적용되어 두 terminal이 경쟁하지 않는다.
- Ranking: 일반 terminal은 non-forfeited score ranking, last standing은 단독 winner이며 forfeited player는 뒤쪽 result entry를 유지한다.
- Privacy: Exact supply와 holdings를 함께 public으로 두므로 arithmetic inference와 projection claim이 충돌하지 않는다.

`MARKET_EXHAUSTED_ROUND_END`를 별도 reason으로 유지하는 것은 `GC-026=A`의 “all deck+market empty fair-round trigger”와 reserved-card progress clarification을 함께 적용한 결과다. Source exhaustion만으로 즉시 끝내지 않고 eligible reserve가 모두 해소된 뒤 trigger하므로 새 mechanic을 추가하지 않는다.

## 35. Remaining implementation inputs and release gates

Rule decision 또는 consistency blocker는 남아 있지 않다. 남은 항목은 승인된 규칙을 구현·출시하기 위한 입력과 review다.

1. P11A에서 P10에 확정한 tier별 15장, 총 45장의 original cost/production/point rows를 immutable typed seed로 옮기고 `cardSetVersion = gem-cardset-v1` 및 모든 static constraint를 machine-validate한다. 외부 published table로 대체하지 않는다.
2. Concrete domain/protocol type, public error, legal-action checker, pending fair-round/no-progress state representation은 이 문서의 behavior를 정확히 구현하되 새 rule을 만들지 않는다.
3. 공개 작업명, visual language와 asset provenance는 release 전 독립 review 대상이다. 이는 P11A domain 구현을 막는 규칙 blocker는 아니다.
4. Companion protocol gate는 four command events, V2-only projection/capability, no advisory, Gem-specific result/end reason과 server-action semantics를 이 문서와 일치시켜야 한다.

## 36. Implementation gate

P10 판정은 **`COMPLETE`**, 다음 단계는 **`P11A READY`**다.

- `GC-001`~`GC-038` 모두 사용자 선택과 `CONFIRMED` 완료
- 선택 결과의 consistency, liveness, conservation과 terminal precedence blocker 없음
- `GC-037` original 45-card authoring 정책 및 `GC-038` independent version 전략 확정
- Privacy, unauthorized access normalization과 server-authoritative action boundary 확정
- `MARKET_EXHAUSTED_ROUND_END`와 eligible reserved-card progress 관계 확정
- Runtime `GameType`, Registry, protocol union, Home catalog, domain source와 UI는 P10에서 변경하지 않음
- Existing `HANGUL_TILE`/`NUMBER_TILE` runtime, wire와 UI는 그대로 유지

다음 작업은 **Multi-game Platform P11A — GEM_CARD domain**이다.

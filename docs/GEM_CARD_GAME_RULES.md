# GEM_CARD Game Rules Gate

> 상태: `PROPOSED / USER_DECISION_REQUIRED` — P10 FIRST PASS
> 작성일: 2026-09-07
> 내부 식별자 후보: `GEM_CARD` (`USER_DECISION_REQUIRED`)
> 공개 작업명 후보: 보석 카드 게임 (`USER_DECISION_REQUIRED`, release name 아님)
> 규칙 버전 후보: user approval 뒤 부여 (`USER_DECISION_REQUIRED`)
> 구현 gate: **CLOSED** — `GC-001`~`GC-038` 결정과 consistency/IP audit 전 P11A 시작 금지
> 주의: 이 문서는 법률 자문이 아니며 특정 상용 게임의 명칭·표현·자료를 사용할 수 있다는 판단을 하지 않는다.

## 1. Document status

이 문서는 세 번째 게임 후보의 규칙을 구현 전에 결정하기 위한 P10 초안이다. 아래에서 `CONFIRMED`인 것은 이미 production에서 검증된 **플랫폼 안전 불변 조건**뿐이다. Player 수, 자원, 카드, 행동, timer, 종료, 점수, 공개 명칭 등 `GEM_CARD` 세부사항은 모두 **`PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED`**다.

따라서 문서의 A안과 예시는 구현 계약이 아니다. A는 독립 구현을 시작하기 위한 권장 초안일 뿐이며 사용자가 선택하기 전에는 runtime, shared schema, catalog 또는 asset으로 옮기지 않는다. 기존 [GAME_RULES.md](./GAME_RULES.md)와 [NUMBER_TILE_GAME_RULES.md](./NUMBER_TILE_GAME_RULES.md)는 각각 `HANGUL_TILE`, `NUMBER_TILE`의 별도 canonical rule이다.

## 2. Game identity

- **PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED:** 중립 내부 ID 후보는 `GEM_CARD`다.
- **PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED:** 공개 작업명은 문서 편의를 위해 **보석 카드 게임**을 사용하되 release name으로 확정하지 않는다.
- **PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED:** 제품은 공유 시장에서 카드를 확보하고 자원을 순환시키며 각자 영구 생산 효과와 점수를 쌓는 독립적인 턴제 engine-building game이다.
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

## 5. Proposed original mechanics overview

다음은 decision table의 **A 권장안**을 한데 모은 비규범적 초안이다. 어떤 항목도 승인 전 `CONFIRMED`가 아니다.

| 영역 | `PROPOSED ORIGINAL BASELINE (A)` |
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

이 묶음은 상용 제품의 data table을 재현하기 위한 것이 아니다. 특히 3×3 market, 45-card original dataset, collect/wild 방식, reserve 2장/no reward, hand limit 9, target 18과 no-tie-break를 함께 독립 baseline으로 제안한다.

## 6. Decision procedure and status legend

- 사용자는 각 ID에 `A`, `B`, `C` 중 하나를 선택한다. `ALL:A` 같은 일괄 응답은 **현재 표의 A안에만** 적용된다.
- 조건부 항목은 선행 결정을 따른다. 예를 들어 `GC-003=C`로 wild를 제거하면 wild 수량·획득·지불 부분은 `N/A`로 다시 정리해야 한다.
- 선택 뒤 whole-rules consistency와 IP/product audit을 다시 실행한다. 충돌은 임의로 메우지 않고 새 사용자 결정으로 돌린다.
- `PROPOSED ORIGINAL BASELINE`: 독립적인 첫 구현을 위한 권장 초안.
- `USER_DECISION_REQUIRED`: 구현에 사용할 수 없는 미확정 상태.
- `CONFIRMED`: 사용자 승인과 재감사를 마친 규칙에만 사용할 상태.

## 7. Full decision table

모든 행의 현재 상태는 `USER_DECISION_REQUIRED`다. A가 권장 original baseline이다.

| ID | Rule | A — recommended original baseline | B | C | Status | Implementation impact | IP/design impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `GC-001` | Player count | 2~4명 | 2~5명 | 3~4명 | `USER_DECISION_REQUIRED` | Room capacity, start validation, supply/balance test 범위 | 일반 mechanic; exact balance는 인원별 독립 검증 필요 |
| `GC-002` | Basic resource count/types | 5종; working IDs `DAWN/TIDE/GROVE/EMBER/ECHO`, UI color는 별도 | 4종 `DAWN/TIDE/GROVE/EMBER` | 6종, A에 working ID `MIST` 추가 | `USER_DECISION_REQUIRED` | Cost vector, supply, projection, collect UI 전체 차원 결정 | 이름·icon·색 배합은 original naming/visual review 대상 |
| `GC-003` | Wild resource existence/acquisition | Held wild `PRISM` 1종 있음; collect에서 basic 선택 대신 획득 | Held wild 1종 있음; reserve reward로만 획득 | wild 없음 | `USER_DECISION_REQUIRED` | Cost solver, supply conservation, collect/reserve schema 분기 | generic wild concept만 사용; icon/name은 original-only |
| `GC-004` | Resource supply counts | 인원과 무관하게 basic 각 7, wild 5 | 2인 basic 각 5/wild 3, 3인 6/4, 4인 7/5, 5인 8/6 | 인원과 무관하게 basic 각 6, wild 4 | `USER_DECISION_REQUIRED` | Setup, availability, conservation, balance fixture | published token table 복제 금지; 수치는 독립 playtest 필요 |
| `GC-005` | Market tiers/categories | 3 tier (`TIER_1..3` internal) | 2 tier | 4 tier | `USER_DECISION_REQUIRED` | Deck/state/refill 구조와 balance dataset 수 | tier naming·visual hierarchy를 독자적으로 디자인 |
| `GC-006` | Face-up cards per tier | tier별 3장 | tier별 4장 | tier별 2장 | `USER_DECISION_REQUIRED` | Market slot count, snapshot size, responsive layout | exact commercial layout/trade dress를 피하도록 3-slot baseline 권장 |
| `GC-007` | Collect action | 서로 다른 available basic 최대 2개 또는 wild 1개 | 서로 다른 basic 최대 3개; wild 직접 획득 없음 | basic 한 종류 2개(행동 전 해당 supply ≥3) 또는 서로 다른 basic 2개 | `USER_DECISION_REQUIRED` | Selection validator, liveness, supply depletion와 UI complexity | collect pattern을 독립적인 제품 mechanic으로 명시 |
| `GC-008` | Player resource limit | 총 9; 결과가 넘는 action은 거절, return selection 없음 | 총 10; 초과분을 같은 action에서 선택 반환 | 제한 없음 | `USER_DECISION_REQUIRED` | A는 단순 validator, B는 atomic return payload/timeout 필요 | exact familiar limit 복제를 피하고 UX/balance 근거 기록 |
| `GC-009` | Permanent discount | Purchased card마다 표시 basic type discount +1; effective cost floor 0 | card마다 +1/+2 production value 가능 | permanent discount 없음 | `USER_DECISION_REQUIRED` | Player engine, cost calculation, public projection | bonus icon/layout과 value distribution은 original dataset 소유 |
| `GC-010` | Reserve enabled/source | 사용; face-up market card만 reserve | face-up 또는 hidden deck top reserve | reserve 없음 | `USER_DECISION_REQUIRED` | State/action/private projection와 refill path 결정 | hidden draw pattern을 자동 채택하지 않고 A로 차별화 |
| `GC-011` | Reserve capacity | Player당 2장 | 1장 | 3장 | `USER_DECISION_REQUIRED` | Capacity error, UI slots, end-state calculation | exact capacity는 independent balance decision |
| `GC-012` | Reserve privacy during PLAYING | 모든 reserved card identity/cost/effect public | face-up source는 public, hidden-deck source는 owner-only | 모든 reserved card owner-only, 상대는 count만 | `USER_DECISION_REQUIRED` | Viewer-specific schema 필요 정도가 달라짐; `GC-010`과 연동 | 카드 뒷면/secret UI는 original asset 필요 |
| `GC-013` | Reserve reward | 별도 resource reward 없음 | wild가 supply에 있으면 1개 지급 | 선택한 basic 1개를 supply에서 지급 | `USER_DECISION_REQUIRED` | Reserve atomic mutation과 holding limit interaction | familiar reward package 복제를 피하기 위해 A 권장 |
| `GC-014` | Purchase semantics | card 한 장 지정; server가 discount 후 basic token을 먼저 쓰고 wild로 부족분 충당 | Client payment plan을 제출하고 server가 검증 | 한 action에 affordable cards 최대 2장 bundle | `USER_DECISION_REQUIRED` | A는 deterministic minimal payload, B/C는 choice·fingerprint 확대 | payment UX와 card layout은 독립 표현 사용 |
| `GC-015` | Special card abilities | v1 없음; discount+points만 | 일부 card가 purchase 때 선택한 available basic 1개를 얻는 one-shot만 가짐 | 일부 card가 reserve capacity를 +1 하는 persistent ability만 가짐 | `USER_DECISION_REQUIRED` | Rule/state/action complexity와 card schema 크게 증가 | 고유 ability text/data는 original authoring·review 필수 |
| `GC-016` | Scoring sources | Purchased card points만 | card points + `GC-035=B` public objectives | card points + 종료 시 선택된 모든 basic type을 하나씩 보유한 set당 +1 | `USER_DECISION_REQUIRED` | Result calculator와 projection field 결정 | published score distributions/objectives 복제 금지 |
| `GC-017` | Target/end score | 18점 이상 | 15점 이상 | 22점 이상 | `USER_DECISION_REQUIRED` | End trigger와 balance/test duration 결정 | 숫자와 card point curve를 original dataset과 함께 검증 |
| `GC-018` | Round completion | Threshold/exhaustion trigger 후 현재 immutable round 끝까지 진행 | Trigger action 직후 즉시 종료 | Trigger 뒤 각 other eligible player에게 정확히 1회 추가 turn | `USER_DECISION_REQUIRED` | Pending-end state와 forfeit/turn-order edge 처리 | fair-round 동작을 우리 문장과 UI로 독립 표현 |
| `GC-019` | Tie-break/ranking | Non-forfeited 최고점 공동 winner, competition rank `1,1,3`; 별도 tie-break 없음 | 최고점 뒤 purchased card 수가 적은 순 | 최고점 뒤 남은 resource 수가 적은 순 | `USER_DECISION_REQUIRED` | Result/winner/rank shape와 deterministic display | familiar tie-break 조합 자동 복제 대신 A 권장 |
| `GC-020` | Turn timer | server-authoritative 45초 | 60초 | timer 없음 | `USER_DECISION_REQUIRED` | Turn scheduler/recovery capability optionality 결정 | 다른 게임 수치를 자동 복사하지 않고 45초 original baseline |
| `GC-021` | Timeout action (`GC-020=A/B`일 때; timer 없음이면 `N/A`) | 자원·card 획득 없이 turn advance | 현재 supply가 가장 많은 basic 1개 획득(동점은 `GC-002` 순서) 후 advance | 같은 turn 첫 timeout에 15초 한 번 연장, 다음 timeout은 no-action advance | `USER_DECISION_REQUIRED` | Scheduled mutation, RNG 여부, revision/idempotency race | A가 단순하고 hidden automatic choice 없음 |
| `GC-022` | Overall deadline | 없음 | 30분; 도달 즉시 `TIME_LIMIT`, current score를 `GC-019`로 ranking | 20분; 도달 즉시 `TIME_LIMIT`, current score를 `GC-019`로 ranking | `USER_DECISION_REQUIRED` | Game-deadline scheduler와 `TIME_LIMIT` result 필요 여부 | 다른 두 game 정책을 자동 상속하지 않음 |
| `GC-023` | Explicit PLAYING leave | 즉시 forfeit; resources/cards는 result용 동결, supply로 반환하지 않음 | 즉시 forfeit하며 held resources만 supply로 반환 | `PLAYER_EXIT`로 전체 game 즉시 종료; leaving actor는 forfeited, remaining non-forfeited를 current score와 `GC-019`로 ranking | `USER_DECISION_REQUIRED` | Conservation, next turn, result와 session atomicity | Game-specific product policy이며 기존 게임 복사 금지 |
| `GC-024` | Offline timeout/forfeit (`GC-020=A/B`일 때; timer 없음이면 `N/A`) | 자신의 연속 offline timeout 3번째 action 적용 뒤 forfeit; resume 시 reset | 2번째 뒤 forfeit | automatic offline forfeit 없음 | `USER_DECISION_REQUIRED` | Streak state, presence-restored action과 privacy 필요 | P9 보류 정책을 세 번째 game 근거로 검증하는 핵심 결정 |
| `GC-025` | Last-player behavior | non-forfeited eligible 1명 순간 즉시 `LAST_PLAYER_STANDING` 단독 winner | 1명이어도 score/market/no-progress end trigger까지 solo 계속; 마지막 player도 forfeit하면 `ALL_PLAYERS_FORFEITED`, winner 없이 current scores를 `GC-019` 순서로 기록 | 즉시 `ABANDONED`, winner 없이 current scores만 기록 | `USER_DECISION_REQUIRED` | Terminal precedence와 all-forfeit reachable 여부 결정 | 기존 game finish set을 자동 복제하지 않음 |
| `GC-026` | Stalemate/deck exhaustion | 모든 deck+market empty면 fair-round end trigger; 그 전 legal collect/purchase/reserve가 전부 없을 때만 `gem:yield`, eligible 전원 연속 yield면 `NO_PROGRESS` | Market exhaustion만 종료, yield/no-progress 없음 | Active player에게 legal action이 하나도 없으면 즉시 종료 | `USER_DECISION_REQUIRED` | A는 bounded legal-action checker, no-progress tracker와 conditional command 필요 | 별도 solver/상용 stalemate 문구 복제 없이 독립 liveness policy |
| `GC-027` | Resource visibility during PLAYING | Shared supply와 모든 player의 type별 exact holdings public | 본인은 exact, 상대는 total count; shared supply는 type별 available 여부만 공개 | 본인만 exact, 상대 holding은 비공개; shared supply는 type별 available 여부만 공개 | `USER_DECISION_REQUIRED` | Viewer-specific projection/privacy tests 결정 | Public supply/history로 간접 추론 가능한 범위를 privacy claim에 반영 |
| `GC-028` | Reserved-card privacy at FINISHED | PLAYING의 `GC-012` 정책을 그대로 유지 | FINISHED에서 모든 reserve identity 공개 | FINISHED에서도 모두 owner-only, 상대는 count만 | `USER_DECISION_REQUIRED` | FINISHED projection과 result audit fields 결정 | `GC-012`는 PLAYING, 본 항목은 FINISHED reveal policy로 중복 아님 |
| `GC-029` | Command event strategy | `gem:collect`, `gem:purchase`, `gem:reserve`; `GC-026=A`면 `gem:yield` 추가 | 하나의 `gem:command` + closed Gem action union | platform-wide generic `game:command` | `USER_DECISION_REQUIRED` | Shared event maps, validators, router/ack typing | A가 game identity를 명확히 하고 generic bus 고정을 피함 |
| `GC-030` | Mutation identity | `gameRevision` + immutable `turnId` + `requestId`/idempotency | `gameRevision` + requestId만 | Room revision + action nonce | `USER_DECISION_REQUIRED` | Stale/race/replay contract와 persistence fingerprint 결정 | Product-neutral safety; numeric wire representation은 별도 protocol gate |
| `GC-031` | Start readiness | Host only, `GC-001`에서 선택한 범위의 registered players 모두 CONNECTED | Host only, offline participant 제외 후 선택된 최소 인원 이상이면 시작 | 선택된 인원 모두 투표하면 자동 시작 | `USER_DECISION_REQUIRED` | Platform start router와 presence precondition 결정 | A는 현 platform UX reuse지만 Gem policy로 별도 승인 필요 |
| `GC-032` | First player/turn order | Server가 start 때 한 번 shuffle, immutable order | join order | Host가 첫 player를 선택 후 cyclic order | `USER_DECISION_REQUIRED` | RNG consumption, fairness와 recovery state 결정 | A는 P9B shuffle primitive 사용 가능 후보일 뿐 의무 아님 |
| `GC-033` | Market refill timing | Purchase/reserve 성공 안에서 같은 tier slot 즉시 refill | Turn 종료 때 빈 slot batch refill | 다음 round 시작 때 refill | `USER_DECISION_REQUIRED` | Atomicity, snapshot transient state, end trigger timing | Refill animation/layout은 rule과 분리하고 독자 표현 |
| `GC-034` | Deck exhaustion per tier | 해당 tier slot은 empty로 유지; 다른 tier에서 대체하지 않음 | 같은 tier의 남은 face-up cards를 왼쪽부터 압축 | 인접 tier deck이 slot을 대체 | `USER_DECISION_REQUIRED` | Market shape와 validators, final exhaustion 계산 | A가 tier 의미와 transparent state를 가장 단순하게 보존 |
| `GC-035` | Objective system | v1 없음 | 공개 shared objectives | player-private missions | `USER_DECISION_REQUIRED` | State, score, privacy, data authoring 규모가 크게 달라짐 | 기존 제품의 objective/bonus 체계를 복제하지 않기 위해 A 권장 |
| `GC-036` | Exact public naming policy | 내부 `GEM_CARD`, 공개 작업명 “보석 카드 게임”; release 전 독립 title clearance/review 필수 | original 후보 “빛 조각 공방”을 별도 review 후 사용 | P11까지 public name 없이 codename만 사용 | `USER_DECISION_REQUIRED` | Catalog copy, analytics, storage migration naming 범위 결정 | 상표 사용 가능성을 단정하지 않으며 logo/title original-only |
| `GC-037` | Original deck size/data | tier별 15장, 총 45장; cost/bonus/points table을 처음부터 작성해 별도 승인 | tier별 12장, 총 36장 | tier별 18장, 총 54장 | `USER_DECISION_REQUIRED` | Setup/refill/end/balance fixture와 실제 P11 domain data의 필수 blocker | Published deck/card table을 복제하지 않고 provenance 기록 필수 |
| `GC-038` | Rules/data versioning | 별도 immutable `rulesVersion`과 `cardSetVersion`을 start state에 snapshot | 단일 ruleset version에 card data 포함 | version field 없이 deploy version만 사용 | `USER_DECISION_REQUIRED` | Persistence/replay/migration과 test fixture 재현성 결정 | Original dataset provenance와 release audit에는 A가 가장 명확 |

## 8. Setup

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-001`, `004`~`006`, `031`~`034`, `037`, `038`):**

1. Host가 2~4명의 모든 registered player가 CONNECTED인 Lobby에서 `game:start`를 요청한다.
2. 서버가 각 tier의 original card deck을 독립적으로 shuffle하고 immutable player turn order를 한 번 shuffle한다.
3. Basic resource 5종은 각 7개, wild는 5개로 shared supply를 만든다.
4. 각 player는 resource/card 없이 시작한다.
5. 각 tier deck에서 3장을 공개 market slot에 둔다. Deck top/order는 공개하지 않는다.
6. `rulesVersion`과 `cardSetVersion` 후보를 game state에 고정한다.

2/3/4인 supply를 같은 수치로 둘지, 인원별로 조정할지는 승인 전 미확정이다. Server shuffle에 P9B frozen Fisher–Yates가 의미상 적합할 가능성이 있지만 P10에서 runtime reuse를 확정하지 않는다.

## 9. Resources

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-002`, `004`, `008`, `027`):**

- Basic resource working IDs는 `DAWN`, `TIDE`, `GROVE`, `EMBER`, `ECHO`다. 이는 공개 release 명칭이나 icon이 아니다.
- UI의 hue, texture, symbol과 domain identifier를 분리한다. 색각에만 의존하지 않는다.
- Player holding과 shared supply 사이에서만 token이 이동한다. 성공한 purchase에서 지불한 basic/wild resource는 supply로 돌아간다.
- Player resource 총량 limit 후보는 9다. 초과분 선택 반환을 요구하지 않고, limit을 넘기는 collect/reward action 전체를 reject한다.
- Forfeit resource를 supply로 돌리지 않고 final result까지 동결하는 A안 때문에 conservation은 `supply + active/frozen player holdings = initial supply`로 유지된다.

## 10. Wild resource

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-003`, `007`, `013`, `014`):**

- `PRISM`은 card cost에 직접 등장하지 않는 fungible wild working type이다.
- Collect action에서 basic 최대 2개를 받는 대신 supply의 `PRISM` 한 개를 선택할 수 있다.
- Reserve는 wild를 보상으로 주지 않는다.
- Purchase 시 server는 permanent discount를 먼저 적용하고 해당 basic holding을 가능한 만큼 소비한 뒤 남은 총 부족분만큼 `PRISM`을 소비한다.
- Client가 wild assignment를 주장해도 서버는 canonical cost/engine/holding에서 지불을 다시 계산한다.

`GC-003=C`이면 이 절의 wild state, supply, projection과 error는 모두 제거 후보가 되며 빈 optional field를 남기지 않는다.

## 11. Market and decks

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-005`, `006`, `033`, `034`, `037`):**

- 3개 tier는 각자 15-card deck과 face-up 3-slot market을 가진다.
- Card가 purchase 또는 reserve되면 같은 atomic action 안에서 같은 tier deck top으로 빈 slot을 refill한다.
- 그 tier deck이 empty면 slot은 명시적으로 empty로 남고 다른 tier card로 채우지 않는다.
- Public projection은 slot별 face-up card 또는 empty, tier별 remaining deck count만 공개한다.
- Deck order, next card와 shuffle state는 private server state다.
- 모든 tier deck과 모든 market slot이 empty가 되는 action은 market-exhaustion end trigger 후보를 설정한다.

Exact 45-card cost/bonus/point distribution은 아직 존재하지 않는다. `GC-037=A`는 size와 original-authoring 정책만 선택하며 개별 row를 자동 승인하지 않는다. P11A가 이 constraint 아래 처음부터 dataset을 만들 수 있지만, P11B/public enablement 전에는 `cardSetVersion`, schema, balance와 provenance review를 통과해야 한다.

## 12. Cards

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-009`, `014`~`016`, `037`):**

최소 concrete card 후보는 다음 정보를 가진다.

```text
GemCard {
  cardId: unique opaque identity
  tier: TIER_1 | TIER_2 | TIER_3
  cost: exact basic-resource vector
  productionType: one basic resource type
  points: non-negative integer
}
```

- 각 card는 game 내에서 고유한 `cardId`를 갖고 deck, market, 한 player의 reserve 또는 purchased collection 중 정확히 한 곳에 존재한다.
- Purchased card identity, printed cost, production type과 points는 public 후보다.
- v1 A안에는 별도 card name, flavor text, character, special ability가 없다.
- GenericCard를 platform package에 만들지 않고 `GEM_CARD` domain이 자기 card data와 validation을 소유한다.

## 13. Collect action

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-007`, `008`):**

Active player는 다음 중 하나를 요청한다.

1. Supply가 양수인 서로 다른 basic type을 1~2개 선택해 각 1개를 받는다.
2. 또는 supply의 `PRISM` 1개를 받는다.

두 방식은 한 action에서 섞지 않는다. 선택 type 중 하나라도 unavailable이거나 결과 holding이 limit 9를 넘으면 전체 command를 reject한다. Server는 requested type과 canonical supply를 검증하며 client가 보내는 supply count를 믿지 않는다. Successful collect는 resource를 원자적으로 이동시키고 turn을 즉시 끝낸다.

비교 대상 B는 서로 다른 basic 최대 3개, C는 한 종류 2개를 포함한다. 구현 난이도, depletion 속도, 선택 UI와 balance가 다르므로 사용자가 선택해야 한다.

## 14. Purchase action

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-009`, `014`, `016`, `033`):**

1. Active player는 public market 또는 자기 reserve의 `cardId` 한 개만 지정한다.
2. Server는 해당 card가 요청 source에 canonical하게 존재하고 actor에게 접근 가능한지 확인한다.
3. 각 basic type별 `effectiveCost = max(0, printedCost - permanentDiscount)`를 계산한다.
4. 각 type에서 actor의 matching basic resource를 가능한 만큼 먼저 소비한다.
5. 남은 모든 부족분 합계만큼 wild를 소비한다. 부족하면 command 전체를 거절한다.
6. 지불 resource를 supply로 반환하고 card를 purchased collection에 추가한다.
7. Market source였다면 같은 tier slot을 refill한다. Reserved source였다면 reserve slot만 비운다.
8. Score/end trigger를 계산하고 하나의 canonical commit으로 turn을 끝낸다.

Client cost preview와 animation은 편의를 위한 것이며 authority가 아니다. 여러 card bundle purchase나 client-chosen payment allocation은 A안에 없다.

## 15. Reserve action

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-010`~`013`, `028`, `033`):**

- Active player는 face-up market `cardId` 한 장을 지정한다.
- Reserve count가 2 미만일 때만 가능하다.
- Card를 actor reserve로 옮기고 원래 market slot은 같은 tier에서 즉시 refill한다.
- Reserved card detail은 모든 player에게 public이며 별도 wildcard/basic reward가 없다.
- Reserve 자체는 points나 discount를 주지 않는다. 이후 purchase된 순간부터 card 효과와 points가 적용된다.
- Deck top blind reserve는 A안에 없다.

`GC-012`는 **PLAYING 중 reserve visibility**, `GC-028`은 **FINISHED 전환 때 reveal/retention**을 결정한다. 두 항목은 같은 질문을 중복하지 않는다.

## 16. Permanent production/discount

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-009`):**

- Purchased card 한 장은 자기 `productionType`의 permanent discount를 1 증가시킨다.
- Discount는 소모되지 않고 future purchase마다 다시 적용된다.
- Type별 discount가 printed cost보다 커도 effective cost는 0 아래로 내려가지 않는다.
- Wild holding이나 reserve card는 permanent discount를 만들지 않는다.
- Player engine은 purchased cards에서 다시 계산 가능해야 하며 client가 합계를 권위 값으로 보내지 않는다.

## 17. Turn and round model

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-018`, `029`, `030`, `032`):**

- Server가 start 때 한 번 shuffle한 player order를 immutable하게 보존한다. Forfeited player는 순서에서 삭제하지 않고 active rotation에서 건너뛴다.
- 한 turn의 successful canonical action은 최대 하나다: `COLLECT`, `PURCHASE`, `RESERVE`, 또는 `GC-026=A`일 때 조건부 `YIELD`.
- Rejected action은 turn, state, `gameRevision`과 no-progress tracker를 바꾸지 않으므로 deadline 전에 수정해 재시도할 수 있다.
- Successful action/timeout/eligible yield는 한 번만 revision을 증가시키고 새 immutable turn identity를 만든다는 후보가 `GC-030=A`다.
- Fair-round 종료 후보는 immutable order의 round boundary를 사용한다. Trigger가 발생한 round에서 아직 행동하지 않은 non-forfeited player에게 turn을 주고 마지막 eligible position 뒤 finish한다.

Page-local UI에서 resource를 선택하는 임시 state가 필요할 수 있으나 이는 server TurnDraft나 platform `GenericTurnDraft`가 아니다.

## 18. Timer and timeout

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-020`~`022`):**

- Turn deadline은 server Clock 기준 45초다.
- Command는 transport가 캡처한 authoritative receive time과 canonical deadline으로 판정한다. Client countdown은 display뿐이다.
- Timeout은 card/resource를 자동 선택하지 않고 no-action canonical turn을 commit한 뒤 다음 eligible player로 이동한다.
- Timeout 시 legal main action이 하나라도 있었다면 no-progress tracker를 reset한다. Legal action이 하나도 없었다면 `YIELD`와 같은 no-progress 기록으로 셀 수 있다는 A안이다.
- Stale/duplicate timeout callback과 player command race에서는 Room lane 안에서 정확히 하나만 commit한다.
- Overall game deadline은 두지 않는다.

`GC-020=C`이면 turn deadline/scheduler/timeout command 자체를 state에 남기지 않는다. Timer가 optional이라는 플랫폼 원칙을 지킨다.

## 19. Disconnect, reconnect and forfeit

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-023`~`025`):**

- Network disconnect는 즉시 forfeit가 아니며 platform reconnect/session/presence와 current turn timer가 계속 동작한다.
- Player가 OFFLINE인 자기 turn에서 세 번 연속 timeout되면 세 번째 timeout action을 먼저 적용한 뒤 forfeit한다.
- 성공한 resume은 offline-timeout streak를 0으로 reset한다. Connected timeout은 streak에 넣지 않는다.
- PLAYING explicit leave는 즉시 forfeit다. 보유 resource, purchased/reserved cards와 score는 final result를 위해 동결하며 supply/deck/market으로 반환하지 않는다.
- Current player가 forfeit하고 game이 계속되면 다음 eligible player의 fresh turn을 만든다. Non-current forfeit는 current turn identity를 유지한다.
- Non-forfeited eligible player가 정확히 한 명이 되는 순간 pending final round나 no-progress보다 먼저 `LAST_PLAYER_STANDING`으로 종료한다.

이 정책은 기존 두 게임의 offline policy를 공통 abstraction으로 확정하지 않는다. `GC-024` 사용자 선택은 P9의 `WAIT_FOR_GEM_CARD` 판단을 재검토할 세 번째 concrete evidence일 뿐이다.

## 20. End conditions and terminal precedence

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-017`, `018`, `022`, `025`, `026`):**

Finish reason 후보는 다음과 같다.

- `SCORE_THRESHOLD`: successful purchase 뒤 player score가 18 이상이 되어 fair final round가 완료됨.
- `MARKET_EXHAUSTED`: 모든 tier deck과 face-up market이 empty가 되어 fair final round가 완료됨.
- `NO_PROGRESS`: 아직 market card가 남았지만 모든 eligible player가 한 번씩 연속 verified `YIELD`를 commit함.
- `LAST_PLAYER_STANDING`: non-forfeited eligible player가 한 명만 남음.

A안의 우선순위 후보:

1. 같은 mutation이 `LAST_PLAYER_STANDING`을 만들면 즉시 종료한다.
2. Purchase가 threshold와 market exhaustion을 동시에 만들면 pending reason은 `SCORE_THRESHOLD`로 기록한다.
3. 이미 pending fair-round trigger가 있으면 이후 더 낮은 우선순위 trigger로 교체하지 않는다.
4. Pending trigger의 round boundary에 도달하면 final score를 계산한다.
5. `YIELD` cycle은 successful collect/purchase/reserve, 또는 legal action이 있던 timeout에서 reset한다. Eligible set 변경 시 forfeited player 기록을 제거하고 한 명이면 1번을 먼저 적용한다.

`ALL_PLAYERS_FORFEITED`는 A안에서 reachable하지 않는다. 두 명 이상일 때 첫 forfeit가 한 명을 남기는 순간 terminal이므로 마지막 player의 post-terminal forfeit를 처리하지 않기 때문이다. `TIME_LIMIT`도 overall deadline A안이 없으므로 후보 set에 없다.

`GC-022=B/C`를 선택하면 server Clock이 `gameDeadlineAt` 이상인 순간 `TIME_LIMIT`가 turn timeout이나 늦은 player action보다 먼저 적용되고, deadline보다 먼저 수신된 command만 시간 조건을 통과하는 제안을 함께 선택한 것으로 본다. Result는 그 직전 canonical score와 `GC-019`를 사용한다. 이 conditional branch도 사용자 승인 전에는 확정 규칙이 아니다.

## 21. Scoring and ranking

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-016`~`019`, `025`):**

- Player score는 purchased card의 printed points 합이다.
- `SCORE_THRESHOLD`, `MARKET_EXHAUSTED`, `NO_PROGRESS`에서는 non-forfeited player를 score 내림차순으로 정렬한다.
- 같은 score는 공동 rank와 공동 winner를 허용하고 추가 tie-break를 적용하지 않는다. Competition ranking `1,1,3` 후보를 사용하되 이것을 platform Result로 일반화하지 않는다.
- Forfeited player는 result entry와 자기 final score를 유지하지만 winner가 될 수 없고 모든 non-forfeited player 뒤에 배치한다. Forfeited group 안에서는 score 내림차순 공동 rank 후보를 적용한다.
- `LAST_PLAYER_STANDING`은 유일한 non-forfeited player를 winner/rank 1로 둔다. Score transfer는 하지 않고 모든 player의 score는 자기 purchased-card points 그대로다.
- Purchased card count, resource count와 reserve count는 A안에서 tie-break가 아니다.

Exact result field와 rank representation은 rules finalization 뒤 protocol gate에서 결정하며 Hangul/Number Result를 재사용하지 않는다.

## 22. Objective and special-ability policy

**PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED (`GC-015`, `035`):** v1에는 public/private objective, character power, one-shot/ongoing special ability를 넣지 않는다. Card는 cost, one permanent discount와 points만 가진다.

이 선택은 market/resource/purchase라는 다른 state shape만으로도 세 번째 platform stress-test가 충분하고, original text/data authoring과 balance/privacy 복잡도를 억제하기 위한 것이다. 추후 추가할 때는 새 rules/card-set version과 별도 IP/data review를 요구한다.

## 23. Privacy matrix

다음은 `GC-012=A`, `GC-027=A`, `GC-028=A`일 때의 **PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED**다. A안은 player resource를 전략적 public information으로 삼아 exact shared supply로부터 어차피 가능한 간접 추론과 projection contract가 충돌하지 않게 한다.

| Data | Owner | Other players | Unbound/public observer | Server only |
| --- | --- | --- | --- | --- |
| Face-up market cards | exact | exact | Room membership 없이는 없음 | deck relation |
| Tier deck | remaining count | remaining count | 없음 | exact card IDs/order/RNG |
| Shared resource supply | type별 exact count | type별 exact count | 없음 | canonical conservation data |
| Player resource holdings | type별 exact | type별 exact | 없음 | canonical exact all players |
| Wild holding | exact public holding에 포함 | exact public holding에 포함 | 없음 | canonical exact |
| Purchased cards/discount/score | exact public | exact public | 없음 | derived validation data |
| Reserved cards in PLAYING | exact public | exact public | 없음 | source/refill transition |
| Reserved cards in FINISHED | PLAYING policy 유지 | PLAYING policy 유지 | 없음 | canonical frozen state |
| Offline-timeout streak | 없음 | 없음 | 없음 | exact |
| Pending end/no-progress tracker | 필요 최소 public status만 | 필요 최소 public status만 | 없음 | exact identities/history |
| Session/storage/idempotency/scheduler | 없음 | 없음 | 없음 | exact internals |

DOM, browser log, error detail과 telemetry도 wire privacy boundary를 우회하지 않는다. Unknown/reserved `cardId` probe는 해당 card 존재·owner·deck position을 구분할 수 없는 safe game-specific error로 normalize한다.

## 24. Server authority and atomic mutation

모든 선택지에서 다음 platform invariant는 유지한다.

- Client는 desired action과 필요한 opaque identity만 제안한다. Resource supply, cost, discount, score, turn end와 refill 결과는 서버가 canonical state에서 계산한다.
- Purchase는 availability, actor ownership, cost/discount, basic/wild payment, token return, card movement, market refill, score/end trigger, next turn과 revision/idempotency를 한 UoW에서 commit한다.
- Reserve는 capacity, market availability, optional reward/limit, card movement, refill와 next turn을 같은 commit에 넣는다.
- Collect는 selection, supply, holding limit와 resource conservation을 commit 전에 전부 검증한다.
- Invalid/stale/expired/duplicate-conflict/unauthorized command는 partial resource/card movement나 accepted replay record를 남기지 않는다.
- Same Room의 command, timeout, leave/forfeit는 동일 serialization lane에서 경쟁한다.
- `cardId`, player ID와 revision은 opaque/canonical identity이며 display name이나 array index로 authority를 정하지 않는다.

## 25. Conceptual state and projection

아래는 decision을 빠뜨리지 않기 위한 설명용 read model이다. TypeScript contract가 아니며 field 이름·존재 모두 `USER_DECISION_REQUIRED`다.

```text
GemCardGameStateCandidate
  gameId / gameRevision candidate
  rulesVersion / cardSetVersion candidate
  decks (private ordered card IDs)
  market (public tier slots)
  resourceSupply
  players
    exact holdings
    purchased cards
    reserved cards
    forfeited / offline-timeout streak
  turn / optional deadline
  pending end / no-progress tracker
  terminal Gem-specific result
```

`PlatformSnapshotV2`를 future에 확장한다면 LOBBY에는 canonical `room.gameType`과 `game = null`, PLAYING에는 public market/supply/player summary/turn 및 privacy 선택에 따른 optional viewer-private holdings, FINISHED에는 final public state와 Gem-specific result가 필요하다. A안은 resource/reserve가 public이므로 player-specific game detail이 필수라는 전제를 만들지 않는다. P10에서는 snapshot union이나 runtime schema를 수정하지 않는다.

## 26. Conditional valid examples

다음은 **A안이 모두 선택됐을 때만** 유효성을 설명하는 비규범적 예다.

### 26.1 Collect

- `DAWN`과 `TIDE` supply가 각각 남아 있고 actor total holding이 7이면 두 type을 각 1개 받아 9개가 되는 collect는 성공 후보다.
- Basic 대신 `PRISM` 한 개만 받는 collect도 supply와 limit을 만족하면 성공 후 turn을 끝낸다.

### 26.2 Purchase with discount and wild

Card cost가 `DAWN 4 + TIDE 3`, actor discount가 `DAWN 1 + TIDE 1`, holding이 `DAWN 2 + TIDE 1 + PRISM 2`라면 effective deficits는 `DAWN 3 + TIDE 2`다. Server는 basic `DAWN 2 + TIDE 1`을 먼저 쓰고 남은 2를 `PRISM 2`로 지불해 purchase할 수 있다.

### 26.3 Reserve/refill

Actor reserve가 1장일 때 face-up `card-27`을 reserve하면 capacity 2를 넘지 않는다. 해당 market slot은 같은 tier deck top으로 즉시 refill하고, deck이 empty라면 empty slot로 남는다. Reserve reward는 없다.

### 26.4 Fair final round

Immutable order가 A→B→C→D이고 B의 purchase가 score 18을 만들면 `SCORE_THRESHOLD`가 pending된다. 그 round에 아직 행동하지 않은 C와 D가 한 번씩 행동한 뒤 result를 계산한다. D가 trigger했다면 그 action 직후 round boundary이므로 finish한다.

### 26.5 Shared winner

Final non-forfeited scores가 A=21, B=21, C=17이면 A와 B가 공동 rank 1/winner이고 C는 rank 3 후보다. Card 수나 resource 수로 동점을 깨지 않는다.

## 27. Conditional invalid examples

다음도 A안 선택을 전제로 한다.

- 같은 collect에서 `DAWN` 두 개를 요청하거나 basic 둘과 `PRISM`을 함께 요청하면 `GC-007=A` 위반이다.
- Holding 8인 player가 basic 두 개를 요청해 결과가 10이 되면 부분적으로 하나만 주지 않고 전체 reject한다.
- Reserve가 이미 2장인데 새 card를 reserve하거나 deck top blind reserve를 요청하면 reject한다.
- Opponent reserve의 card를 자기 reserved source purchase로 참조하면 존재/owner를 구분하지 않는 safe error로 reject한다.
- Client가 보낸 discount 합계, score, supply count 또는 next card를 믿어 purchase/refill하지 않는다.
- Market card를 제거한 뒤 payment가 부족함을 발견하고 card만 사라진 상태를 commit하지 않는다.
- Deck order, offline streak 또는 accepted request record를 snapshot/DOM/log에 노출하지 않는다. Resource detail은 `GC-027`에서 선택한 공개 범위를 정확히 따른다.
- Legal collect/purchase/reserve가 있는데 `gem:yield`로 turn을 끝내 no-progress cycle을 진행할 수 없다.

## 28. Edge cases and precedence

모두 **PROPOSED ORIGINAL BASELINE / USER_DECISION_REQUIRED**이며 final audit 대상이다.

1. 같은 market card를 두 player가 거의 동시에 요청하면 Room lane에서 먼저 유효하게 commit된 command만 성공하고 다음 command는 stale/unavailable로 state 변화 없이 실패한다.
2. Refill할 deck이 empty면 slot은 empty다. Market array를 압축하거나 다른 tier card를 이동하지 않는다.
3. Purchase와 reserve가 마지막 shared market card를 제거하면 refill 뒤 전체 deck/market emptiness를 평가한다.
4. Threshold와 market exhaustion이 같은 purchase에서 발생하면 `SCORE_THRESHOLD` pending reason이 우선한다.
5. Final round 중 다른 player가 더 높은 score에 도달할 수 있으며 final boundary에서 전체 score를 비교한다.
6. Final round 중 forfeit로 한 명만 남으면 `LAST_PLAYER_STANDING`이 즉시 우선한다.
7. Forfeited player의 frozen resources/cards는 supply/market으로 반환하지 않으며 winner eligibility만 잃는다.
8. All players offline이더라도 presence만으로 끝나지 않는다. Timer/retention과 confirmed platform policy가 각각 동작한다.
9. Legal-action checker는 canonical market, supply, holdings, discounts, reserve capacity와 resource limit을 사용하며 hidden deck top의 face를 보지 않는다.
10. Duplicate accepted request는 resource/card movement를 반복하지 않고 기존 semantics대로 replay한다.

## 29. Resource and card conservation

P11A에서 어떤 A/B/C를 선택하더라도 다음 game-specific invariant 후보를 final 규칙에 명시해야 한다.

```text
각 resource type:
initial supply
= current shared supply
+ all active/frozen player holdings

각 cardId:
exactly one of
deck | market slot | one player reserve | one player purchased collection
```

Discard/exile zone은 proposed v1에 없다. Card movement와 resource payment/refund는 partial commit 없이 atomic해야 한다. Forfeit 때 반환 여부가 `GC-023` 선택에 따라 달라지므로 conservation equation도 함께 확정한다.

## 30. Planned rule test matrix

Runtime test를 P10에서 작성하지 않는다. P11A gate가 열릴 경우 최소 다음 table-driven domain test가 필요하다.

- 2/3/4 player setup, supply/card totals, deck shuffle determinism과 unique `cardId`
- tier별 market fill/refill, exact card conservation, empty deck/slot과 total market exhaustion
- Collect A/B/C boundary, unavailable supply, duplicate type, wild exclusivity와 holding limit
- Type별 permanent discount, floor-zero effective cost, basic-first/wild payment와 insufficient resources
- Market/reserved purchase authorization, reserve capacity/privacy/reward와 immediate refill
- One-action-per-turn, revision/turn/request replay, stale/rejected atomic no-op
- 45/60/no-timer 선택별 deadline edge, duplicate callback, command/timeout/leave race
- Offline streak/resume, explicit leave, active/non-active forfeit와 last-player precedence
- Threshold, fair round, simultaneous trigger priority, market exhaustion, verified yield/no-progress
- Shared winners, forfeited ordering, no secondary tie-break와 last-player result
- Viewer별 resource/reserve projection, deck privacy와 unauthorized card probe normalization
- Original card dataset schema/range/distribution validation와 rules/card-set version snapshot

## 31. Platform reuse and P9 abstraction stress test

| Classification | Candidate | P10 finding |
| --- | --- | --- |
| `REUSE_AS_IS` | Room/session/presence/Host/reconnect/invitation | Gem rule을 Tile/Rack에 맞추지 않고 사용 가능 |
| `REUSE_AS_IS` | capabilities, Snapshot V2 shell, Room lane, UoW/CAS, idempotency, retention, Socket.IO mechanism | Concrete Gem validator/projector/action은 별도 필요 |
| `REUSE_AS_IS` | identity-only GameRegistry, Home catalog mechanism | 실제 P11/P12 완료 뒤 exact entry/item만 추가 후보 |
| `PROVEN_SMALL_PRIMITIVE` | GameRevision successor | `GC-030=A`면 concrete Gem revision에서도 의미 검증 후보 |
| `PROVEN_SMALL_PRIMITIVE` | Frozen Fisher–Yates | `GC-032=A`와 shuffled decks에 opt-in 후보 |
| `PROVEN_SMALL_PRIMITIVE` | Web async single-flight | Direct command UI의 duplicate action guard 후보 |
| `NOT_ASSUMED` | Gameplay supersession comparator | Proposed direct actions에는 persistent TurnDraft가 없으므로 필요하지 않을 수 있음 |
| `OPTIONAL` | Turn scheduler | `GC-020=A/B`일 때만 필요; C면 capability 자체가 없음 |
| `GAME_SPECIFIC` | Card/deck/market/resource/purchase/reserve/end/result | Concrete Gem state/rules로 유지 |

Stress-test 결론:

- `GenericRack`, `GenericTile`, `GenericBoard`, `GenericMeld`, `GenericJoker`, `GenericDraw/Pass`는 적용 대상이 없다.
- Direct one-action command에는 persistent local TurnDraft가 불필요할 가능성이 높다. Collect selection modal 같은 transient UI를 GenericTurnDraft로 승격하지 않는다.
- Overall deadline과 Turn scheduler는 결정에 따라 optional이다.
- Result와 ranking은 Gem-specific semantics이며 기존 두 game 형식을 강제하지 않는다.
- Lifecycle/codec registry, start shell, generic executor, ranking/renderer abstraction, offline timeout policy와 stored envelope는 P10 규칙만으로 구현하지 않는다. 실제 third implementation을 본 뒤 별도 승인한다.

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
| Objective system | 고유 보너스/조건 조합 모방 | v1 A안은 제거; 추가 시 original design review |
| Marketing screenshots | 공식 board/card visual 노출 | 자체 build와 자체 asset만 촬영 |

## 33. Asset, data and text policy

- P10에서는 asset을 다운로드하거나 생성하지 않는다.
- Future asset manifest는 source, author, license, modification 여부와 allowed use를 추적해야 한다.
- Card art와 UI icon은 자체 제작, 적법한 commissioned/licensed work 또는 compatible public-domain source만 허용한다.
- Exact cost/point/deck table은 P11 전에 original design artifact로 작성하고 독립성·balance·provenance를 검토한다.
- AI-generated asset을 쓰더라도 service terms와 입력 reference provenance를 검토하고 특정 작품/브랜드의 모방을 지시하지 않는다.
- Rule text, tutorial, tooltips와 marketing copy는 이 프로젝트가 독립적으로 작성한다.

## 34. First-pass consistency audit

All-A proposed bundle을 문서 수준에서 함께 대입한 결과 현재 확인된 직접 contradiction은 없다.

- Player/supply/start: 2~4명, 고정 supply와 all-connected start는 함께 실행 가능하다.
- Wild: `PRISM`은 collect alternative로만 들어오고 reserve reward는 없으며 purchase 부족분만 대체하므로 acquisition/payment path가 닫혀 있다.
- Resource limit: Collect 결과가 9를 넘으면 partial return 없이 reject하므로 timeout/return sub-action이 필요 없다.
- Reserve/privacy: Face-up reserve만 허용하고 PLAYING/FINISHED 모두 public이므로 hidden-card branch가 없다.
- Timer/offline: 45초 timeout no-action이 canonical turn을 끝내며 offline 3회째에는 그 action을 먼저 적용한 뒤 forfeit한다. Overall deadline과의 race는 A안에 없다.
- Liveness/end: Legal action이 없을 때만 yield를 허용하고 full eligible cycle로 `NO_PROGRESS`를 만들며, market exhaustion과 threshold는 fair-round trigger, 한 명만 남으면 immediate terminal이다.
- Ranking: 일반 terminal은 non-forfeited score ranking, last standing은 단독 winner이며 forfeited player는 winner 후보에서 제외된다.
- Privacy: Exact supply와 exact holdings를 함께 public으로 두어 2-player arithmetic inference를 private 정보라고 잘못 주장하지 않는다.

다만 A/B/C를 혼합 선택하면 다음 dependency를 반드시 재감사해야 한다. 이것들은 현재 All-A contradiction이 아니라 **선택 조합 blocker 후보**다.

1. `GC-003`/`007`/`013`: wild가 존재하면 적어도 하나의 canonical acquisition path가 필요하고, wild 없음이면 supply/payment/reward field도 제거해야 한다.
2. `GC-010`~`013`/`028`: reserve 없음이면 capacity, reward와 reserve privacy는 `N/A`; hidden-deck reserve를 택하면 PLAYING/FINISHED reveal policy를 함께 결정해야 한다.
3. `GC-020`/`021`/`024`: timer 없음이면 timeout action과 offline-timeout forfeit는 `N/A`이며, 별도 offline 자동-forfeit를 추측해 추가하지 않는다.
4. `GC-022`: deadline B/C면 `TIME_LIMIT`과 scheduler/race/result branch를 protocol에 추가해야 한다.
5. `GC-016`/`035`: objective score를 택하면 objective system을 동시에 선택하고 original objective dataset을 정의해야 한다.
6. `GC-018`/`023`/`025`/`026`: `PLAYER_EXIT`, solo continuation/zero eligible 또는 immediate no-action finish를 택하면 fair-round/no-progress precedence와 result reason을 해당 옵션대로 다시 정리해야 한다.
7. `GC-027`: resource secrecy B/C를 택하면 supply projection과 observable action history로 가능한 간접 추론 범위를 product copy에서 과장하지 않아야 한다.

## 35. Implementation blockers

현재 blocker는 다음과 같다.

1. `GC-001`~`GC-038` 모두 `USER_DECISION_REQUIRED`다.
2. Conditional dependency를 선택 결과에 맞춰 정리해야 한다: wild, reserve privacy/reward, timer/timeout, deadline, no-progress/yield, result.
3. `GC-037`의 deck size/original-authoring 정책은 미결정이며 exact card rows는 아직 없다. Full dataset은 P11A에서 작성할 수 있지만 P11B/public enablement 전 review가 필요하다.
4. Public release name, visual language와 asset provenance는 확정되지 않았다.
5. Rules selections 뒤 terminal precedence, liveness, resource/card conservation와 privacy consistency audit를 다시 해야 한다.
6. Command payload, Snapshot V2 branch, capability, public errors와 server-action contract는 별도 protocol gate와 일치해야 한다.

이 blocker가 남아 있는 동안 `GEM_CARD`를 `GameType`, GameRegistry, catalog, capability 또는 protocol union에 추가하지 않는다.

## 36. Implementation gate

P10 first-pass 판정은 **`AWAITING_RULE_DECISIONS`**다. 다음 조건을 모두 만족해야만 `P10 COMPLETE / P11A READY`로 바꿀 수 있다.

- `GC-001`~`GC-038` 전부 사용자 선택 및 `CONFIRMED`
- 선택 결과의 consistency/liveness/terminal precedence audit blocker 없음
- `GC-037` deck size/original-authoring 정책과 `GC-038` version 전략 승인; full dataset은 P11A에서 새로 작성하고 P11B/public enablement 전 provenance review
- Public naming/terminology/asset policy 승인과 release 전 review 항목 기록
- Privacy matrix, unauthorized access normalization, resource/card conservation 확정
- Protocol gate의 command/projection/capability/error/server-action dependencies와 완전 일치
- Existing `HANGUL_TILE`/`NUMBER_TILE` runtime·wire·UI 변경 없음

현재 다음 작업은 runtime P11A가 아니라 **P10 GEM_CARD rule decisions**다.

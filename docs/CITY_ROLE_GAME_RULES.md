# CITY_ROLE — P14B 승인 규칙

> `city-rules-v1` / `city-roles-v1` · 2026-09-08
> **P14B COMPLETE / DOMAIN READY**
> CITY-001–070 / E01–E03 / exact60-card dataset 모두 CONFIRMED. CLASSIC_REFERENCE_VERIFIED 유지. Runtime 구현은 시작하지 않았다.

## 1. 문서 권한과 승인 범위

[Decision gate](./CITY_ROLE_DECISION_GATE.md)의 사용자 선택은 **001C / 004B / 018B / 019B / 070B, 그 외 A**다. 일괄 A 요약과 달리 사용자가 마지막에 다시 명시한 004B를 적용한다. [P14A draft](./CITY_ROLE_GAME_RULES_DRAFT.md)는 당시의 기록이며, 현재 승인과 검토 결과는 이 문서 및 [P14B consistency audit](./CITY_ROLE_P14B_CONSISTENCY_AUDIT.md)를 따른다.

추가 승인된 경계는 다음과 같다.

- **E01:** 효과를 만든 player가 forfeit하면, 그 player가 만든 미해결 CR-01/CR-02 효과를 모두 취소한다.
- **E02:** 현재 action window 종료와 종료조건 확인을 먼저 처리한다. 이미 terminal이면 중단하고, 아니면 forfeit를 처리한 뒤 다음 역할 또는 다음 round를 준비한다.
- **E03:** CR-03의 자기 손패 교체에 0장을 지정한 요청은 reject한다. 능력 사용 횟수와 gameRevision은 소비하거나 변경하지 않는다.

`CITY_ROLE` / `비밀 도시 게임`은 승인된 내부 식별자와 임시 공개명이다. 친구용 온라인 플레이, Classic에 가까운 핵심 구조, 자체 role/card 이름·문구·아트·UI·데이터 표현을 사용한다. 참고 작품의 숫자나 효과로 사용자 선택을 덮어쓰지 않는다. 기존 HANGUL_TILE / NUMBER_TILE / GEM_CARD, release tag와 runtime은 변경하지 않는다.

## 2. 시작 조건과 physical state

- 2–6명, Lobby에서 Host만 start를 요청한다. 등록된 참가자가 모두 CONNECTED여야 하는 기존 시작 경계를 유지한다. Host에게 역할 조작·대리 선택·타인 손패 열람 권한은 없다.
- Server가 seatOrder를 한 번 shuffle하고 첫 seat를 최초 leader로 정한다. SeatOrder는 게임 동안 유지하며, round draft는 leader부터 eligible player의 seat를 순환한다.
- Player마다 gold 2와 손패 4장으로 시작한다. Gold는 public exact이며 gameplay cap은 없고, bank는 추상적으로 충분하다. Gold·hand·city는 역할마다 나누지 않고 지속 식별자인 player에 속한다.
- [Original cardset](./CITY_ROLE_CARDSET_V1.md)은 physical 설계 슬롯 60개, template 30종 × 각 2장, category 5종 × 각 12장이다. Cost=VP, 정수 1–6, 특수 건물 능력은 없다. 이 exact 분포는 static audit와 CITY-037A에 따른 사용자 최종 승인을 완료했다.
- Physical cardId는 opaque한 고유 식별자이고, templateId는 같은 건물 종류를 나타낸다. 문서의 CCS 슬롯과 행 순서는 wire ID나 deck 순서가 아니다.
- 손패와 도시 크기에 별도 cap은 없다. 한 city에 같은 template을 두 번 건설할 수 없지만, cost/category가 같은 다른 template은 건설할 수 있다.

## 3. 인원별 role draft — 확정 산술

8개 role 중 총 planned picks `M`을 계산한다. Round setup 당시 eligible player가 2/3명이면 각 2개 role, 4–6명이면 각 1개 role이다. Hidden 제거는 1개, public 제거는 `max(0,8−M−2)`개이며, 마지막 unselected role도 hidden이다.

| Eligible players | Roles/player | M | Hidden 제거 | Public 제거 | 최종 unselected | 선택 순서 (A=leader) |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2 | 2 | 4 | 1 | 2 | 1 | A B A B |
| 3 | 2 | 6 | 1 | 0 | 1 | A B C A B C |
| 4 | 1 | 4 | 1 | 2 | 1 | A B C D |
| 5 | 1 | 5 | 1 | 1 | 1 | A B C D E |
| 6 | 1 | 6 | 1 | 0 | 1 | A B C D E F |

모든 행에서 `selected + hiddenRemoved + publicRemoved + unselected = 8`이다. 현재 선택 actor만 available role의 exact list를 받아 1개를 선택한다. Host나 다른 player는 대신 선택할 수 없다. 선택 사이에 추가 discard는 없다(새 2인 draft 예외는 별도 승인 명세 참조). **2026-09-09 사용자 정정: CR-04 길잡이는 공개 제거에 포함하지 않는다. 비공개 제거는 가능하다.** 최초 비공개 1장을 확정한 뒤, 나머지 shuffle 순서에서 CR-04를 건너뛰고 필요한 수만큼 공개 제거한다. 역할 누락·중복이나 제거 장수 변화는 없다. 다음 round setup부터 적용하며 이미 저장된 현재 round의 제거/배정은 소급 변경하지 않는다.

도중에 leave하면 해당 player의 미선택 pick을 건너뛰고, 이미 선택한 role은 hidden tombstone으로 남겨 재공급하지 않는다. 처음 정한 quota와 제거 수를 재계산하지 않으므로 최종 unselected는 표보다 늘어날 수 있다. 다음 round는 새 eligible 인원으로 quota를 정한다. 예를 들어 4명 중 1명이 떠나면 현재 round의 계획은 유지하고, 다음 round부터 남은 3명은 각 2개 role을 선택한다.

Leader가 도중에 떠나도 기존 pick queue를 되돌리지 않는다. Leader만 다음 eligible seat로 이전하며, 다음 round는 갱신된 leader부터 시작한다. CR-04가 정상 reveal되면 그 owner가 새 leader가 되고, 미선택 또는 disabled라면 현재 leader를 유지한다.

## 4. Role / phase state machine

Room phase는 `LOBBY → PLAYING → FINISHED`다. CITY의 대기 subphase는 `ROLE_SELECTION`과 `ROLE_ACTION`이다. ROUND_SETUP, role cursor 순회, ROUND_END는 사용자 입력이 필요하지 않으면 범위가 정해진 atomic 내부 전이로 처리하며, 각각 별도 timer를 만들지 않는다.

```text
ROUND_SETUP → ROLE_SELECTION (pick마다 45초)
  → ROLE_RESOLUTION (role order 1..8)
    → 정상 role의 ROLE_ACTION (90초)
       → 시작 효과 → 기본 획득 → optional 능력/건설 → 종료
       ↔ pending draw choice (동일 deadline)
    → 다음 role
  → ROUND_END (허용된 disabled owner 공개, marks clear, 종료 판정)
  → 다음 round 또는 FINISHED
```

정상 role은 owner와 함께 reveal된다. 미보유·disabled·forfeited role은 owner를 알리지 않고 건너뛰며, disabled owner만 정상 round end에 공개한다. 즉시 terminal이 되었다는 이유로 round-end 공개를 추가하지 않는다.

Current role / resolutionOrder와 PlayerId를 혼동하지 않는다. 같은 player가 2개 role을 가지면 독립된 action window가 2개 있고, gold·hand·city를 공유한다.

## 5. 8개 역할의 승인 능력

Role ID와 표시명은 P14A에서 제시하고 승인받은 자체 working label이다. 공식 카드 이름이나 문구를 옮긴 표현이 아니다. 아래는 승인된 효과를 자체 문구로 정의한 것이다.

| ID / order / 임시명 | 역할 시작 시 필수 효과 | Optional 능력 / 한도 | 검증 / 유지 범위 |
| --- | --- | --- | --- |
| CR-01 / 1 / 가림꾼 | 없음 | 자기보다 order가 높은 role 1개를 mark하여 해당 role turn 전체를 건너뛴다 | Role turn당 1회. Owner의 존재 여부로 입력을 reject하지 않는다. 자기가 소유한 다른 role이면 효과는 no-op이다(064A) |
| CR-02 / 2 / 징수꾼 | 없음 | 높은 order의 role 1개를 mark한다. 그 role의 정상 reveal 직후, 시작 수입 전에 owner의 gold 전부를 효과를 만든 player에게 이전한다 | Role turn당 1회. 자기 소유·absent·disabled target은 no-op이다. Hidden mark 상태로 입력을 reject하지 않는다 |
| CR-03 / 3 / 교환꾼 | 없음 | 다른 eligible player와 손패 전체를 교환하거나, 자기 손패에서 선택한 카드를 discard한 뒤 같은 수만큼 draw한다. 둘 중 1회만 사용한다 | City·gold·role은 교환하지 않는다. 자기 손패 교체는 1장 이상을 지정해야 한다. 0장 요청은 능력 횟수와 revision 변화 없이 reject한다(E03) |
| CR-04 / 4 / 길잡이 | Leader를 획득하고, 시작 시 CIVIC 건물당 gold 1을 받는다 | 없음 | Disabled이면 시작 효과가 없다. 미보유·disabled role이 leader를 바꾸지 않는다 |
| CR-05 / 5 / 수호꾼 | 시작 시 CULTURE 건물당 gold 1을 받는다. 이번 round에 정상 reveal된 뒤부터 round end까지 자신의 city를 보호한다 | 없음 | Forfeited·disabled이면 보호하지 않는다. 이 role이 active일 때만 보호하는 것이 아니다 |
| CR-06 / 6 / 장터지기 | 시작 시 TRADE 건물당 gold 1을 받고, 기본 획득 완료 후 gold 1을 추가로 받는다 | 없음 | Gold 선택과 draw 선택 모두 추가 1을 받는다. 시작 효과와 획득 후 효과는 각각 한 번만 적용한다 |
| CR-07 / 7 / 설계꾼 | 시작 시 카드 최대 2장을 즉시 손패에 추가한다 | 이 role turn의 건설 한도는 3개다 | 기본 한도 1을 3으로 대체하며, 3을 더하는 것이 아니다. Bonus draw는 choose 없이 처리하고 부족하면 가능한 장수만 받는다 |
| CR-08 / 8 / 해체꾼 | 시작 시 GUARD 건물당 gold 1을 받는다 | 다른 eligible player의 public city 건물 1개를 `max(0, printedCost−1)`의 비용으로 파괴한다 | Role turn당 1회. 자기 city·forfeited city·건물 8개 이상인 city·정상 CR-05 보호 city는 대상이 될 수 없다. 카드는 discard로 이동하고 VP는 감소한다 |

### 효과 순서와 mark

시작 순서는 **자기 소유 role에 대한 mark의 no-op 확인 → disable 판정 → 정상 reveal → gold 이전 mark → leader/category 수입/bonus draw → 기본 획득 → 획득 bonus → optional 능력/건설**이다.

- CR-01의 자기 소유 target을 먼저 skip한 뒤 no-op을 확인하면 064A에 어긋난다. 자기의 다른 role은 정상 turn을 가진다. Mark 입력 성공은 hidden ownership을 확인해 주는 결과가 아니다.
- Category 수입은 역할 시작 시점의 city로 계산한다. 이번 turn에 건설한 뒤 중복 또는 추가 청구하지 않는다. CR-06의 추가 gold 1만 기본 획득 완료 시 적용한다.
- Optional 능력은 기본 획득 후, 건설 전·사이·후에 한 번만 사용할 수 있다. Pending choice 중에는 다른 능력·건설·endTurn을 완료할 수 없다.
- 070B의 mark target은 효과를 사용한 actor만 보며, 다른 player에게는 효과 해석 시 허용된 결과만 공개한다. 입력 검증으로 hidden ownership이나 disable 정보를 탐색하게 하지 않는다.
- **E01 CONFIRMED:** 효과를 만든 player가 forfeit하면 그 player의 미해결 CR-01 봉쇄 mark와 CR-02 gold 이전 mark를 모두 취소한다. 이후 target role을 해석할 때 취소된 mark를 적용하지 않는다. 이미 commit된 결과를 소급해서 되돌리는 규칙은 아니다.
- 예: CR-02 owner가 CR-07을 mark한 뒤 forfeit하면, CR-07의 정상 reveal 시 gold를 forfeited player에게 이전하지 않는다. CR-01의 미해결 mark도 같은 취소 정책을 따른다.

### CR-03의 discard-first 처리

042A는 선택한 자기 손패를 **먼저 discard**한 뒤 같은 수만큼 draw하도록 정한다. 031A의 discard reshuffle에서 이 카드를 제외하라는 지시는 없으므로 deck이 부족하면 같은 카드가 돌아올 수 있다. 이를 막기 위한 새로운 격리 영역은 만들지 않는다. 유효한 N장 선택이라면 추가된 discard를 포함하여 최소 N장의 공급이 있으므로, 공급 부족에 따른 reject는 정상 상태에서는 일반적으로 도달하지 않는 방어 조건이다.

기존 deck을 먼저 소비하고, 부족한 만큼 discard를 shuffle하여 이어 뽑는다. 매 draw마다 deck과 discard 전체를 함께 섞지는 않는다. 선택 카드의 중복·비소유·부존재는 fail-closed로 처리한다. 다른 player와의 손패 교환은 private atomic swap이며, 제3자에게는 hand count 외의 손패 정보를 보내지 않는다.

**E03 CONFIRMED:** 자기 손패 교체에서 0장을 지정하면 reject한다. 카드 이동, 능력 사용 횟수 소비, gameRevision 증가는 없다. 이는 자기 손패 교체의 빈 카드 목록에 대한 결정이며, 다른 eligible player와의 손패 전체 교환 규칙을 변경하지 않는다.

## 6. 기본 획득 / pending choice / 건설

정상 role turn에는 gold 2를 받거나 최대 2장의 카드를 보고 1장을 보유하는 기본 획득을 정확히 한 번 수행한다. 다른 게임의 획득량이나 cap을 가져오지 않는다. Draw할 카드가 0장이면 해당 선택을 reject하고 gold를 선택할 수 있게 한다. 기존 deck에서 먼저 뽑고, 부족하면 discard를 reshuffle한다. 둘 다 비어 있으면 카드를 새로 생성하지 않는다.

Draw 요청으로 deck의 카드를 private candidate 영역으로 옮기는 시점이 canonical commit이다. Owner만 exact candidates와 draw 순서를 보고, choose를 통해 1장을 손패에 넣는다. 나머지는 draw 순서로 deck bottom에 반환한다. Client modal을 닫아도 pending은 사라지지 않고, retry/resume은 같은 후보와 기한을 반환한다.

Build는 자기 손패의 physical card, `gold ≥ printedCost`, 같은 template의 미건설, 남은 건설 한도를 검증한 뒤 한 번에 atomic commit한다. 카드를 city로 옮기고 gold를 bank에 반환하며, score preview와 threshold latch도 갱신한다. 기본 건설 한도는 1개, CR-07은 3개다. 승인된 역할 보너스 외의 추가 획득·금리·구매 할인·특수 건물 능력은 도입하지 않는다.

기본 획득이 미완료이거나 pending choice가 남아 있으면 endTurn을 완료할 수 없다. 기본 획득을 마쳤다면 optional 능력이나 건설을 하지 않고 종료해도 된다. 손패·도시·공개 category 정의와 hidden deck 순서의 공개 범위는 서로 구분한다.

## 7. 종료 / 점수 / 순위

처음으로 도시 건물 8개를 달성한 canonical build에서 firstCompletion과 round-end trigger를 기록한다. 도시 크기 cap이 아니므로 같은 round에 9개 이상을 건설할 수 있다. 같은 player의 두 번째 role을 포함하여 해당 round의 미해결 eligible role을 처리한 뒤 정상 round end에 종료하고, 최종 점수로 승자를 비교한다.

Non-forfeited player의 점수는 다음과 같다.

`sum(city printed VP) + completionBonus + diversityBonus`

- `completionBonus`: 최초 달성자는 4점, 그 외 최종 도시 건물이 8개 이상인 player는 2점, 나머지는 0점이다. 4점과 2점은 중복하지 않는다.
- `diversityBonus`: 최종 city에 category 5종이 모두 있으면 3점, 아니면 0점이다.
- 특수 건물·role 추가 VP·남은 gold/손패 VP·tie-break는 없다.
- Forfeited player는 frozen city VP만 받는다. Completion/diversity bonus는 0이며, 최초 달성 bonus를 다른 player에게 넘기지 않는다.

Eligible player는 점수 내림차순 competition ranking을 적용하고 최고 점수 동점자는 공동 winner로 정한다. Forfeited player는 그 뒤 별도 subgroup으로 두며 rank offset은 eligible 인원수다. 예를 들어 eligible 점수 25,25,19는 rank 1,1,3이고, forfeited 점수 20,20은 rank 4,4다. Forfeited player는 점수가 높아도 winner가 되지 않는다.

Eligible player가 정확히 1명 남으면 `LAST_PLAYER_STANDING`으로 즉시 종료하며 점수보다 우선한다. 0명이면 `NO_ELIGIBLE_PLAYERS`로 winner 없이 종료한다. 일반적인 도시 완성 종료는 protocol 초안에서 `CITY_COMPLETION_ROUND_END`라는 concrete reason으로 표현한다. Overall deadline·market exhaustion·no-progress 등 승인되지 않은 종료 사유를 추가하지 않는다.

최초 달성 latch는 도시 건물 수가 줄어도 유지한다. 다만 v1에서는 완성 city 파괴를 금지하므로 승인된 일반 효과로 완성 후 파괴에 의한 감소는 통상 발생하지 않는다. 최초 달성자가 forfeit해도 다른 eligible player가 2명 이상이면 round trigger는 남고, forfeited 최초 달성자는 bonus 자격을 잃는다. Terminal 이후 결과를 재계산하는 game action은 받지 않는다.

## 8. Timeout / leave 처리 순서

선택 deadline은 45초, role action deadline은 90초다. Server Clock과 receivedAt이 authority다. 중간 mutation·Guide·refresh·resume으로 동일 action window의 deadline을 갱신하지 않는다. Game overall deadline은 없다.

| 현재 상태 | Timeout의 확정 처리 | Explicit leave의 확정 처리 |
| --- | --- | --- |
| ROLE_SELECTION | Available role 중 server uniform random으로 1개를 선택한다 | 미선택 pick을 건너뛰고 선택된 role은 tombstone으로 남긴다 |
| ROLE_ACTION / 기본 획득 미완료 | 기본 gold 2를 받고 해당 획득 bonus를 적용한 뒤 optional 능력/건설을 생략하고 종료한다 | Gold를 반환하고 손패/pending 전부를 private discard로 옮기며 city는 frozen으로 유지한다 |
| ROLE_ACTION / pending | Draw 순서의 첫 카드를 보유하고 나머지를 bottom에 반환하며, 해당 bonus 적용 후 종료한다 | 모든 후보를 discard한다. Keep/default를 먼저 처리하지 않는다 |
| ROLE_ACTION / 기본 획득 완료 | 추가 획득 없이 optional 능력/건설을 생략하고 종료한다 | 같은 자산 청산과 forfeit를 처리한다 |

Offline streak는 pick/action timeout을 합산한다. 성공한 resume만 0으로 reset하며, connected timeout은 증가시키지도 reset하지도 않는다. Offline 세 번째 timeout은 현재 timeout 처리를 먼저 완료한 뒤 forfeit하고, 자산 청산은 023A와 동일하다(067A). 정상 timeout으로 이미 terminal이 되었다면 post-terminal forfeit를 하지 않는 기존 선택을 유지한다.

세 번째 timeout에서 pending이 있었다면 먼저 keep/bottom 처리가 일어나고, 그 뒤 forfeit 시 손패가 discard로 이동한다. Explicit leave에서 모든 후보가 discard로 가는 처리와의 차이를 없애지 않는다.

### E02 — 세 번째 timeout의 확정 경계

1. 현재 action window의 timeout 기본 처리와 종료를 완료하고, 종료조건을 확인한다.
2. 이미 terminal이면 중단한다. 이후 forfeit나 다음 역할/round 준비를 실행하지 않는다.
3. Terminal이 아니면 해당 player를 forfeit 처리한다. 승인된 자산 청산, 미해결 outgoing mark 취소(E01), 남은 역할/pick 및 leader 처리를 적용하고 eligible 인원에 따른 즉시 종료도 반영한다.
4. 계속 진행할 수 있을 때만 다음 role의 시작 효과 또는 다음 round setup을 수행한다.

따라서 다음 actor의 category 수입·bonus draw나 다음 round의 quota/RNG 준비를 forfeit보다 먼저 실행하지 않는다. 예를 들어 4인 round의 마지막 action에서 세 번째 offline timeout이 발생했고 아직 terminal이 아니라면, 먼저 해당 player를 forfeit한 뒤 남은 3명 기준으로 다음 round의 각 2개 role quota를 계산한다.

Leave와 timeout-forfeit의 session 제거 및 game mutation은 하나의 platform UoW로 처리하는 방향이다. Historical Room/game roster와 결과 계산용 frozen city는 보존한다. Accidental disconnect는 leave가 아니며 같은 session token으로 resume한다. Missing/wrong credential을 새 join이나 nickname 기반 seat takeover로 대체하지 않는다.

## 9. Privacy / projection 확정 방향

Public 정보는 nickname·presence·Host, gold exact, hand count, 건설된 city, 공개 점수 preview, leader, current chooser, 정상 reveal된 role/actor/deadline이다.

Self-only 정보는 exact hand/physical IDs, 자기 selected roles, current chooser의 available list, 자기 canonical pending candidates와 draw 순서, 자기의 미공개 mark target이다.

Server-only 정보는 deck 순서와 미래 카드 IDs, hidden removal/unselected, 타인의 미공개 role ownership, RNG·offline streak·storage·idempotency·scheduler 내부다. Credential은 전용 credential 경로에서만 취급하고 snapshot/broadcast에는 넣지 않는다.

| Phase | 모든 참가자에게 공개 | Viewer 한정 | 비공개 |
| --- | --- | --- | --- |
| LOBBY | Room metadata / 시작 조건 | 자기 인증 context | 시작 전 game secret을 생성하여 배포하지 않는다 |
| ROLE_SELECTION | Public removals / chooser / round / public economy·city | 자기 손패·selected roles, current chooser만 available list | 타인의 choices/roles, hidden removals |
| ROLE_ACTION | Revealed role/actor, public economy·city, pending 종류 | 자기 손패·남은 role, pending owner만 후보, 자기 mark | 미공개 role owner, 타인의 후보/mark, future deck |
| 정상 ROUND_END | 010A로 허용된 disabled owner, 이미 공개된 기록 | 남아 있는 자기 private 정보 | Hidden removal과 미선택 role을 일괄 공개하지 않는다 |
| FINISHED | Rankings/cities/bonuses/forfeit | 보존된 자기 private state만 | 미공개 history·타인 손패·deck은 종료 후에도 hidden이다 |

즉시 `LAST_PLAYER_STANDING` 종료는 정상 ROUND_END가 아니다. 새 hidden role history를 공개하는 이유로 삼지 않는다. 이미 공개된 정보를 잊게 할 수는 없지만 snapshot이 미공개 정보를 추가로 드러내지는 않는다. Exact concrete branch·ack·error·cardId 경계는 [protocol gate](./CITY_ROLE_PROTOCOL_GATE.md)를 따른다.

## 10. P14B final gate

70개 선택은 CONFIRMED다. 일반 경로, 2–6인 draft, 8개 role의 효과/수치, scoring과 privacy를 승인 선택에 따라 기록했다. **E01 outgoing mark source forfeit, E02 세 번째 timeout 경계, E03의 0장 자기 손패 교체 거절도 모두 추가 승인으로 확정했다.**

앞선 URL 접근 실패 후 사용자가 제공한 `wr01_citadels_classic_rules.pdf` 16페이지를 직접 읽고, [Classic 차이표](./CITY_ROLE_CLASSIC_COMPARISON.md)로 CITY-001–070과 E01–03을 대조했다. **CLASSIC_REFERENCE_VERIFIED**이며 기존 FFG2010 비교는 다른 판본의 과거 참고 이력으로만 남긴다. 2인 draft·역할 timing·leader·카드 행선지·동점·private target 등 차이는 현재 승인값을 유지하고 자동 수정하지 않았다. 이후 **exact60-card 후보도 사용자 최종 승인**으로 확정되어 남아 있던 content gate를 닫았다.

최종 rules/protocol/privacy/timeout/leave/cardset 일관성 감사에서 blocker를 발견하지 못했다. **P14B COMPLETE / DOMAIN READY**는 pure domain 구현을 명세에 따라 계획할 수 있다는 설계 gate 판정이지 구현·배포·IP clearance가 아니다. Runtime/domain/shared schema·새 event·renderer·scheduler는 구현하지 않았고 기존 세 게임과 release tag를 보존한다. 다음은 사용자 별도 요청 후 **P15A — CITY_ROLE pure domain implementation**뿐이며 이 단계에서 자동 시작하지 않는다.

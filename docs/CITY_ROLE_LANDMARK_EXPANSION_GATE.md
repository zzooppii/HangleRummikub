# CITY_ROLE Landmark Expansion — 명소 6종 특수 능력 decision gate

> 2026-09-09 · 기준 HEAD `126cdf3` · **LANDMARK-001–010 CONFIRMED / V2 IMPLEMENTED**
> 아래 §1–17은 승인 전 설계 이력이다. 당시 OPEN/미구현 표기는 과거 상태이며 현재 승인은 §18, canonical 규칙은 [rules v2](./CITY_ROLE_GAME_RULES_V2.md), 실행 결과는 [검증 기록](./CITY_ROLE_LANDMARK_V2_VERIFICATION.md)을 따른다.

## 1. 현재 기준과 변경하려는 정책

현재 [승인 규칙](./CITY_ROLE_GAME_RULES.md) §2/6/7 및 [cardset](./CITY_ROLE_CARDSET_V1.md) §1/3은 **모든 건물에 특수 능력 없음**을 명시한다. 이 문서는 그 정책의 LANDMARK 부분만 차기 버전에서 변경할 제안이다. 기존 CITY-035A를 포함한 v1 승인 이력, CITY-001–070/E01–03, v1 파일을 수정하거나 CONFIRMED를 취소하지 않는다. 교역/시정/문화/수비는 일반 건물로 유지한다.

HEAD와 origin/master는 `126cdf3`로 일치했고 시작 working tree는 clean이었다. 기존 release tag와 P16/Visual Polish 결과를 보존한다. Runtime/shared/Web/tests/dependency 변경, commit/push, 배포는 이번 요청에 포함하지 않는다.

### Exact inventory — 문서/runtime 대조 PASS

`apps/server/src/games/city-role/domain/cardset-v1.ts`의 실제 행과 Markdown §3 행을 별도 Node 계산으로 비교했다. 이름/category/cost/VP/copies 6개 행 모두 일치한다. Runtime의 `victoryPoints: cost`, `copies: 2` 매핑도 확인했다.

| Decision | templateId | displayName | category | Cost | VP | Physical copies |
| --- | --- | --- | --- | ---: | ---: | ---: |
| LANDMARK-001 | CB-LAN-01 | 빗물정원 | LANDMARK | 1 | 1 | 2 |
| LANDMARK-002 | CB-LAN-02 | 작은해시계 | LANDMARK | 2 | 2 | 2 |
| LANDMARK-003 | CB-LAN-03 | 돌물결마당 | LANDMARK | 2 | 2 | 2 |
| LANDMARK-004 | CB-LAN-04 | 바람계단 | LANDMARK | 4 | 4 | 2 |
| LANDMARK-005 | CB-LAN-05 | 달그림회랑 | LANDMARK | 4 | 4 | 2 |
| LANDMARK-006 | CB-LAN-06 | 일곱길기념뜰 | LANDMARK | 5 | 5 | 2 |

총 6 templates / 12 physical cards / printed VP 합 36. 비용 순서는 **1,2,2,4,4,5**다. **Cost 3·6 명소는 없다.** Cost 6인 수평의사당은 CIVIC이며 이 gate 대상이 아니다. 가격/VP/매수/이름/template ID를 재배분하지 않는다. 한 city의 동일 template 중복 금지는 유지하며 서로 다른 city에는 같은 template이 존재할 수 있다.

## 2. 후보를 읽는 공통 canonical contract

아래는 후보 비교에 필요한 **제안 전제**이며 승인된 v1 규칙으로 표시하지 않는다. 공통 결정 LANDMARK-007–010까지 함께 승인해야 구현 규칙이 된다.

- **활성 조건:** 해당 physical 건물이 자기 public city에 있고 owner가 non-forfeited일 때만 지속/미래 효과가 활성이다. Hand/pending/deck/discard에는 효과가 없다. 다른 player의 건물에 효과를 빌려주지 않는다.
- **단발 예산:** 아래의 ‘처음/1회/총 N회’는 `(gameId, playerId, templateId)` 기준이다. 두 번째 physical copy, 파괴 후 재건설, 손패 교환, resume, round 전환으로 초기화하지 않는다. 다른 player는 자기 예산을 가진다. Physical cardId는 계속 별도 보존한다.
- **Atomic build:** 인증/identity/획득 완료/pending 없음/소유/중복/건설 한도/지불액을 검증 → 지불·city 이동·건설 수 증가 → 자동 ON_BUILD 효과 → 기존 firstCompletion latch/후속 전이. 모두 같은 candidate/UoW 한 번이다. 실패는 금화·카드·효과 예산·RNG·revision 소비 없음. 재전송 ACK가 효과를 재실행하지 않는다.
- **Refund는 선불 면제가 아님:** 비용 전액을 먼저 낼 수 있어야 한다. Gold 0으로 cost1 환급 건물을 지을 수 없다. VP/CR-08 파괴 비용은 항상 printed cost/VP를 사용한다. 할인/환급으로 printed 값을 바꾸지 않는다.
- **Draw:** 기존 deck부터 소비, 부족하면 현재 discard만 server RNG로 shuffle하여 보충. 다른 손패/도시에서 회수하거나 새 카드를 만들지 않는다. 자동 bonus draw의 공급이 0이면 0장으로 끝나며 build 자체는 성공한다. 단발 ON_BUILD 기회는 0장이어도 소비하고 나중에 공급이 생겼다고 다시 지급하지 않는다.
- **획득 trigger:** ON_ACQUIRE는 자기 정상 ROLE_ACTION의 기본 획득 완료에만 반응한다. CR-04/05/06/08 category income, CR-07 entry draw, CR-02 이전, 환급, CR-03 교체는 별도 획득 trigger가 아니다. 골드 선택 timeout도 기존 기본 획득 처리이므로 적용하고 E02 이후 순서는 바꾸지 않는다.
- **종료:** END_GAME은 모든 기존 finish reason의 결과 산출에서 한 번만 평가한다. Forfeited는 frozen printed VP만, 명소 추가/대체 보너스는 0이다. LAST_PLAYER_STANDING/NO_ELIGIBLE_PLAYERS 승자 semantics와 공동순위는 유지한다. scorePreview는 현재처럼 printed building VP를 유지하고 예상 특수점수를 섞어 의미를 바꾸지 않는다.
- **방어 우선순위:** 기존 actor/role/대상/완성 city/CR-05 보호 검증을 먼저 한다. 기존 불법 파괴는 새 보호 사용 횟수·gold·CR-08 ability를 소비하지 않는다. 보호 효과가 완료 city나 CR-05를 무시하고 공격할 권리를 주지 않는다.
- **명소는 항상 LANDMARK:** 카테고리 수입 role을 추가하지 않는다. 다양성 한정 virtual category는 명시된 옵션에서만 사용하며 실제 category, income, VP, card identity를 바꾸지 않는다.
- 신규 timer, full role turn, hidden information 공개, generic script/effect engine은 어느 추천안에도 없다. 추천안은 자동 처리만 사용하고, 추가 능력 버튼이나 canonical pending 종류가 필요 없다.

Protocol 표기: **D = DOMAIN ONLY**(command 추가 없음; 결과/표시 계약 영향은 별도), **E = DOMAIN + EXISTING COMMAND**(기존 payload로 해석 가능), **N = NEW CONCRETE COMMAND/PENDING NEEDED**. D/E도 persistence와 projection/version 업데이트가 불필요하다는 뜻은 아니다.

## 3. LANDMARK-001 — 빗물정원 / cost1, VP1

| 옵션 | 짧은 UI 문구 | Exact effect / timing | Power·cost 적합성 / edge cases | 복잡도·protocol |
| --- | --- | --- | --- | --- |
| **A 추천** | 처음 지으면 금화 1개를 돌려받습니다. | ON_BUILD. 본인 최초 성공 건설에 gold +1, lifetime 1회. 전액 선지불. | 낮음: 보상 상한 1 gold. 즉시 순비용 0인 만큼 싼 1VP/완성용 카드가 강해질 위험은 있다. 건설 슬롯은 소비하고 cost1의 무료 CR-08 파괴에 그대로 노출된다. 재건설 환급 없음. | LOW / E `city:build` |
| B | 다음에 금화를 받을 때 1개 더 받습니다. | ON_ACQUIRE. 최초 건설로 1회 기회 활성; 이후 기본 gold2 완료에 +1. Draw 선택에는 보류. 건물이 없어지면 기회 소멸. | 낮음: A와 같은 최대 1 gold지만 지연·파괴 위험이 있다. 건설은 기본 획득 후라 소급 지급 없음. CR-06이면 기존 +1 뒤에 +1, 총4; 그 다음에는 정상3. | MEDIUM / E `city:takeIncome` + 기존 timeout |
| C | 종료 때 건물이 4개 이상이면 +1점. | END_GAME. 자기 최종 city에 이 건물이 있고 실제 buildingCount≥4이면 specialBonus1. | 낮음: printed1+bonus최대1. 즉시 경제 가속은 없으나 최종 득점 카드가 늘어난다. 파괴/forfeit이면0. Completion/diversity는 별도 정상 계산. | LOW / D |

추천 이유: 가장 작은 즉시 economy 효과로 한 문장에 끝나며 고비용 카드의 경제 budget3을 넘지 않는다. 순비용0 위험 때문에 반복 금화 효과는 허용하지 않는다. 001C를 선택하면 전체 END_GAME 효과 template 수 제한(최대2)도 다시 감사한다.

## 4. LANDMARK-002 — 작은해시계 / cost2, VP2

| 옵션 | 짧은 UI 문구 | Exact effect / timing | Power·cost 적합성 / edge cases | 복잡도·protocol |
| --- | --- | --- | --- | --- |
| **A 추천** | 처음 지으면 카드 1장을 받습니다. | ON_BUILD. 처음 성공 건설 후 기존 draw로 최대1장을 바로 자기 hand에 추가, lifetime1회. Choose 없음. | 낮음+: 1장 카드 흐름, 공짜 gold는 아님. Deck/discard0이면0장; budget은 소비. 뽑은 exact card는 owner만, 타인에게 hand count만. CR-07은 남은 기존 건설 budget으로 그 카드를 지을 수 있다. | LOW / E `city:build`(domain build에 entropy 전달 필요) |
| B | 다음 카드 획득은 3장을 보고 1장을 고릅니다. | 첫 이후 기본 `drawBuildingCards`만 최대3장→1장. 기존 private DRAW_BUILDING pending에 보관, 비선택분 draw 순서대로 bottom. 효과1회. | 낮음+: 순증가는 원래와 같은1장, 선택 폭만 +1. 공급1/2이면 그만큼만; 0장 reject는 budget 미소비. 유효 draw에서 budget 소비, pending resume 유지. Timeout 첫 카드, leave 모두 discard. | MEDIUM / E 기존 draw/choose, candidate max3 schema/UI 수정 필요 |
| C | 다음 금화 획득 때 카드도 1장 받습니다. | 최초 건설 이후 기본 gold2 완료 시 최대1장 자동 draw, lifetime1회. Draw 기본 획득을 고르면 기회 유지. | 낮음+: A와 같은 최대1장이나 다음 role까지 지연. CR-06 추가 gold1과 별개로 한 번 적용. 공급0도 기회 소비; 파괴되면 미사용 기회 소멸. | MEDIUM / E takeIncome + timeout + entropy |

추천 이유: 카드1장 획득은 gold1 환급보다 선택지 확장 budget을 주되, 반복 draw 엔진이나 추가 pending 없이 끝난다. 1카드와 1gold의 환산가치가 모든 hand 상황에서 같다고 가정하지 않는다.

## 5. LANDMARK-003 — 돌물결마당 / cost2, VP2

| 옵션 | 짧은 UI 문구 | Exact effect / timing | Power·cost 적합성 / edge cases | 복잡도·protocol |
| --- | --- | --- | --- | --- |
| A | 이 건물은 해체할 수 없습니다. | PASSIVE. 이 physical 건물만 CR-08 대상 부적격. 다른 건물은 보호하지 않음. | 낮은 가격에 영구 안전한 VP/완성 슬롯을 줘 과예산 위험. 공격은 reject, gold/능력 미소비. 상대는 다른 건물을 공격할 수 있지만 이 카드 자체에 대응은 없음. **비추천**. | LOW / E 기존 DESTROY_BUILDING |
| **B 추천** | 이 건물의 해체 비용이 금화 1개 늘어납니다. | PASSIVE / destroy 가격 계산. 이 건물만 `max(0,printedCost−1)+1` = **2 gold**. | 낮음+: 추가 방해 비용은 정확히1. 임시 저항이지 면역/전체도시 보호가 아님. 공격자 gold1이면 reject, gold2이면2 지불·정상 파괴; 실제 card는 discard. Printed VP2 유지. 재건설 시 passive는 재활성되지만 수입을 만들지 않는다. | LOW / E 기존 useRoleAbility/DESTROY_BUILDING |
| C | 처음 받는 해체 시도를 한 번 막습니다. | ON_DESTROY_ATTEMPT. 본인 최초 건설의 방패1회. 기본 파괴 적법성과 공격자의 원래 비용1 지불 가능성을 확인한 뒤 accepted action으로 CR-08 ability를 소비하고 방패만 제거. 실제 gold 지불0, 카드 이동0. 이후 정상 비용1로 파괴 가능. | 중간: 실제 공격 기회1회를 지워 cost2 대비 강할 수 있다. 방패는 public, 자동 발동·거절 선택 없음. 재건설/다른 copy로 충전 안 됨. CR-05/완성도시 검증 실패는 방패 미소비. | MEDIUM / E 기존 useRoleAbility, public shield state 필요 |

추천 이유: 면역·1회 공격 무효와 비교해 +1 가격 저항이 가장 예측 가능하고 낮은 cost에 맞는다. LANDMARK 전체 보호로 확대하지 않는다.

## 6. LANDMARK-004 — 바람계단 / cost4, VP4

‘일반 건물’은 CIVIC/CULTURE/TRADE/GUARD다. 할인 옵션의 actual paid cost는 항상 **1 이상**, printed cost≥2인 대상에만 적용한다. 자기 자신/다른 LANDMARK는 제외. 이미 지나간 건설을 환급하지 않는다.

| 옵션 | 짧은 UI 문구 | Exact effect / timing | Power·cost 적합성 / edge cases | 복잡도·protocol |
| --- | --- | --- | --- | --- |
| A | 처음 지으면 금화 3개를 돌려받습니다. | ON_BUILD. cost4 전액 선지불 후 +3, lifetime1회. | 중상이나 즉시 순비용1로4VP를 얻어 가격 의미가 약해짐. 재건설 환급은 없지만 저축→일괄 가속이 강하다. **비추천**. | LOW / E build |
| **B 추천** | 라운드마다 한 번 일반 건설 금화 1 할인 · 총 3회. | PASSIVE / build 지불 계산. 처음 건설로3 charges. 이후 각 round 첫 eligible 성공 일반건설을 자동 −1, round당1회·본인 game총3회. | 중상: 최대3gold를 여러 round에 나누어 회수, 최소3round의 생존/후속건설 필요. cost1은 미적용·미소비. 같은 role의 후속 CR-07 건설에도 적용 가능하지만 그 round에는1회뿐. Failed build는 charge/round marker 미소비. 파괴하면 미사용 charge 소멸, 재건설 충전 없음. | MEDIUM / E build, remainingUses/lastDiscountRound 필요 |
| C | 다음 일반 건설 비용을 금화 2 줄입니다. | 최초 건설 이후 첫 printed cost≥2 일반건설에 `paid=max(1,cost−2)`. 성공 시 lifetime1회 전부 소비. | 중간+: 빠른 최대2gold 지원. cost2면실제1gold만 할인해도 소비; 사용자가 건설 순서로 선택. CR-07에서도한번. 파괴하면 미사용 기회 소멸. | LOW / E build |

추천 이유: B는 001의 gold1보다 명확히 큰 **경제 상한3**을 제공하되 cost4 전액을 먼저 투자하고 카드 자체는 환급되지 않는다. 무제한 permanent −1, round당 여러 번, 0-cost build는 후보에서 제외했다. 능력의 실현 여부까지 모든 상황에서 001보다 낫다는 보장은 아니다(§10).

## 7. LANDMARK-005 — 달그림회랑 / cost4, VP4

| 옵션 | 짧은 UI 문구 | Exact effect / timing | Power·cost 적합성 / edge cases | 복잡도·protocol |
| --- | --- | --- | --- | --- |
| **A 추천** | 다양성 점수에서 빠진 분류 1개를 채웁니다. | END_GAME 한정 PASSIVE. 이 카드가 최종 city에 있으면 actual category set에 빠진 일반 category 최대1개가 있는 경우 기존 diversityBonus3을 충족시킨다. 실제4종이면3점, 실제≤3종이면0점, 이미5종이면기존3점만. | 중상: 최대3점을 ‘추가’ 지급하는 것이 아니라 기본3점 접근성을 높임. Category를 임의 영구 변경하지 않고 missing count만 검사하므로 picker 없음. LANDMARK 한 분류는 계속 실제로 존재. Income/006A에는 virtual 분류를 전달하지 않음. | LOW / D 결과 다양성 판정 |
| B | 종료 때 일반 건물 분류가 3종 이상이면 +2점. | END_GAME. Actual ordinary categories count≥3이면 specialBonus2. Printed LANDMARK는 계산에서 제외. | 중간: cap2, category 다양화 유도. 기본 diversity3과 동시 획득 가능하지만 능력 보상은2. A보다 낮은 유연성, scoring 전용에 가까움. | LOW / D |
| C | 지을 때 정한 분류로 다양성을 보완합니다. | ON_BUILD의 최초 건설에 ordinary category1개를 선택하는 canonical pending, 이후 END_GAME 다양성에서만 actual set에 그1개를 합집합. LANDMARK도 유지. | 중상: A와 같은 최대 기본3점이지만 선택 당시 미래 도시를 예측해야 한다. 신규 `city:chooseLandmarkCategory` 제안 필요. Owner-only pending선택, 확정 virtual category는public. Timeout은 현재 missing ordinary 중 catalog 순서 첫 값, 모두있으면CIVIC. No new deadline. Leave는pending취소/forfeit, 재건설 재선택없음. | MEDIUM / N 구체 pending+command |

추천 이유: A는 construction order/필요 hand의 유연성을 크게 높이며, 영구 category 변경이나 hidden server choice가 없다. **빠진 분류가2개 이상이면 실패**라는 조건을 Guide에 반드시 설명한다. 5종 건물을 실제로 모두 지은 사람에게 +6 diversity를 주는 효과가 아니다.

## 8. LANDMARK-006 — 일곱길기념뜰 / cost5, VP5

| 옵션 | 짧은 UI 문구 | Exact effect / timing | Power·cost 적합성 / edge cases | 복잡도·protocol |
| --- | --- | --- | --- | --- |
| **A 추천** | 종료 때 일반 건물 분류마다 +1점 · 최대 4점. | END_GAME. 자기 actual city의 distinct CIVIC/CULTURE/TRADE/GUARD 수 = specialBonus0..4. 건물 수가 아니라 분류 수이며 virtual category는 무시. | 높음: printed5+special최대4=9, 확실한 후반 전략 목표. Gold 환급/추가 행동 없이5를 투자. 네 일반 분류 건설과 생존 필요; 기존 CR-08로 이 카드 파괴 비용4. Completed city/CR-05는 기존 보호만 유지. | LOW / D, 결과 specialBonus 필드 필요 |
| B | 종료 때 일반 건물 점수가 12 이상이면 +3점. | END_GAME. Actual non-LANDMARK printed VP 합≥12이면 specialBonus3, 아니면0. | 중상: printed5+최대3=8, 고가 일반 건물 전략. 할인받아 지어도 printed VP로 계산; LANDMARK 자기점수 포함 금지. A보다 낮은 최고 보상과 분명한 threshold. | LOW / D |
| C | 종료 때 남은 금화 3개마다 +1점 · 최대 3점. | END_GAME. Public gold에 대해 `min(3,floor(gold/3))`. Gold를 소비하지 않음. | 중상: printed5+최대3=8, 저축 전략이나 gold9를 묶어두는 opportunity cost. CR-02에 대응 여지 있음. 무제한 gold→VP 변환 없음. 다른 카드에 일반 gold 점수 규칙을 확장하지 않음. | LOW / D |

추천 이유: A는 실제 네 일반 category를 함께 지을 유인을 주므로 ‘명소만 모으는 전략’을 억제한다. 최상위 cost5에 최대4의 가장 큰 능력 점수 상한을 배정하되, 자체 VP를 또 복제하거나 승리 조건을 단독 충족하지 않는다. Cost6 명소를 새로 만들지 않는다.

## 9. 추천 complete set과 hook 최소화

추천: **001A / 002A / 003B / 004B / 005A / 006A**.

| 계열 | 담당 | 재원/효과 상한 | 작동 지점 |
| --- | --- | --- | --- |
| Economy | 빗물정원 | player/template/game 금화1 | 성공 build의 자동 부수효과 |
| Card flow | 작은해시계 | 같은 기준 카드 최대1 | 성공 build의 자동 draw |
| Protection/interaction | 돌물결마당 | 자기 카드 해체 추가비용1 | 기존 파괴 가격 판정 |
| Construction | 바람계단 | 총3gold, round당1·paid≥1 | 기존 build 지불 판정 |
| Flexibility/category | 달그림회랑 | 기존 diversity3만 대체 충족 | 기존 결과 계산 |
| Scoring | 일곱길기념뜰 | 추가0..4점 | 기존 결과 계산 |

추천안은 **build / destroy / result** 세 기존 처리 지점만 확장한다. 새로운 role-entry/acquisition lifecycle을 만들지 않고, role action 수·timer·pending 종류를 늘리지 않는다. END_GAME 관련 template은 005/006 두 개이며, 추가 special points를 생성하는 것은006뿐이다. 카드 text의 자체 작성과 일반적인 mechanics 조합이며 외부 공식 카드 문구/이미지를 입력으로 사용하지 않았다. 법적 독창성/비침해 보증은 하지 않는다.

## 10. Cost → power 감사: 상한·기대와 전 상태 지배를 구분

- Cost1: printed1 + gold1 단발. Cost2: printed2 + card1 단발 또는 자기 건물에만 추가 파괴 비용1. Cost4: printed4 + 장기 gold3 절약 또는 조건부 diversity 접근성3. Cost5: printed5 + 특수점수 최대4.
- 같은 경제 축에서 004B의 최대 절약3은001A의환급1보다 크고, 종료효과 축에서006A추가4는005A로 얻을 수 있는 기본다양성 이득최대3보다 크다. 같은 가격 두 장은 순위가 아닌 다른 선택지다. Gold/card/VP를 임의로 같은 단위라 놓아 정밀 power score를 만들지 않는다.
- **한계:** 효과가 다른 전략 카드에서 ‘모든 상태에서 cost5가 cost2보다 유용’을 보장할 수 없다. 예를 들어 deck에서 필요한 마지막 카드1장을 얻는002A가 즉시 completion+4를 열 수도 있고, 종료 직전 새로 지은004B는 할인0으로 끝날 수 있다. 006A도 ordinary category0이면bonus0이다. 이를 은폐하고 절대 단조성 PASS라고 하지 않는다.
- 따라서 LANDMARK-010에서 **‘printed VP 포함 설계 상한/실현 조건/평균 playtest 기준의 양의 상관’**을 승인받도록 한다. 사용자가 전 상태 strict dominance를 원하면 현재 다양한 효과 세트를 그대로 승인할 수 없고 재설계해야 한다. 이번 판정은 decision gate ready일 뿐이다.
- 첫 balance 위험 순위: (1)001의 순비용0 completion 가속, (2)005+006과 기본diversity의 상관, (3)2/3인004 할인 회수속도, (4)6인002 공급 고갈. 실제 승률/평균시간을 측정하지 않았으며 추천을 실증 balance PASS로 포장하지 않는다.

### 경제·무한 반복 방지

시작 gold2, 기본 gold2 OR draw, CR-06 추가1, 네 role-category 수입은 그대로다. 추천 명소는 role-income category가 되지 않는다. Refund/discount를 CR-06 획득 bonus로 다시 세지 않는다.

001은 전액 지불 후 1회 환급한다. 004는 자기/다른 명소와 cost1을 제외하고, cost≥2인 일반 건물만 1할인하며 round당1/게임총3회다. **전체 추천 세트의 추가 금화 가치 상한은 player당 4gold**, 추가 카드는 최대1장이다. 6명이 각자 한 번씩 지으면 추가 draw는 최대6장이지 physical 2copies 때문에 총2장으로 제한되는 것은 아니다. 카드는 새로 생기지 않고 기존60장 zone 사이에서 이동한다. 파괴→재건설, 다른 copy 사용, CR-03 손패 이동으로 예산을 충전하지 않는다. 추상적인 gold 공급이 충분해도 명소로 인한 무제한 엔진은 없다.

## 11. 역할·파괴·다양성·점수 상호작용

- **CR-01/02:** secret target, 자기 role no-op, gold 이전 시점, E01 취소를 유지한다. 환급으로 남은 public gold에도 기존 CR-02가 적용되지만 명소가 target을 공개하지 않는다.
- **CR-03:** 손패 교환은 건설이 아니므로 보상 없음. 교환받은 template을 처음 지은 새 owner는 자기 예산만 사용한다. 0장 교체 거절/E03, discard-first 순서를 유지한다.
- **CR-04/05/06/08:** 실제 자기 category에만 기존 수입 적용. LANDMARK를 수입에 추가하지 않는다. CR-05 보호와 003B가 중첩되면 ‘더 비싼 합법 공격’이 아니라 애초에 불법 공격이다.
- **CR-07:** 최대 3건설 유지. 002로 뽑은 카드를 같은 차례에 지을 수 있지만 기존 gold/건설 예산이 필요하다. 004를 지은 뒤 같은 차례 일반 건설에 1할인 가능하나, 후속 두 건설을 모두 할인하지 않는다. 2/3인의 두 번째 role도 같은 round 할인 횟수를 공유한다.
- **CR-08:** 기본 가격은 `max(0,printedCost−1)`; 완성 city/CR-05/forfeit 제외가 우선이다. 추천 003B만 자기 파괴 비용이 1→2가 된다. 004 자체는 3, 005는 3, 006은 4로 유지한다. 실제 건설 지불액으로 파괴 가격을 계산하지 않는다.
- **다양성:** LANDMARK는 계속 실제 다섯째 분류다. 005A는 실제 4종일 때만 빠진 1종을 보완하며 실제 3종 도시는 통과하지 못한다. 006A는 실제 일반 분류만 세어 005의 virtual 분류로 추가점을 만들지 않는다.

| 005A+006A가 모두 남은 city의 실제 일반 분류 수 | 실제 총분류(LANDMARK 포함) | Diversity | 006 special | 합계(printed/completion 제외) |
| ---: | ---: | ---: | ---: | ---: |
| 0/1/2 | 1/2/3 | 0 | 0/1/2 | 0/1/2 |
| 3 | 4 | 3(005 보완) | 3 | 6 |
| 4 | 5 | 3(원래 충족) | 4 | 7 |

이미 5종이면 005의 추가 이득은 0이다. **기존 v1 대비 추천 세트의 점수 이득은 최대 6점**(실제 4종에서 3+3), 실제 5종에서는 4점이다. ‘006의 4점만 추가’라며 다양성 완화의 이득을 빼지 않는다. 고가 명소 두 장에 gold 9와 건설 슬롯 2개를 투자하고, 여러 일반 분류 건물을 추가로 지어야 한다. 정상 완성 보너스 +4/+2와도 중첩되므로 후속 실전 balance 측정이 필요하다. Forfeit 특수 보너스는 0, printed cost=VP는 유지한다.

## 12. 2/4/6인 pace와 deck pressure

평균 시간/round의 실측 자료가 없어 ‘속도 변화 없음’을 주장하지 않는다. 기존 8건물 trigger와 current round 완료, 45/90초, 선택적 건설, overall deadline 없음은 유지한다. 구조적 건설 예산은 2–3인 개인 round당 2(설계꾼 포함 4), 4–6인 1(설계꾼 3) 그대로다.

| 인원 | 초기 deal 뒤 deck | 위험 / 제어 |
| ---: | ---: | --- |
| 2 | 52 | 두 role로 card/gold 활용 기회가 많다. 004는 role당이 아닌 round당 1회로 제한한다. 단발 002도 후속 건설에 기여할 수 있다 |
| 4 | 44 | 004의 3회 전부 회수에는 최소 3round가 필요하다. 고가 006은 경제 가속 없이 후반 목표가 된다 |
| 6 | 36 | hand 축적과 bonus draw의 공급 압박이 가장 크다. 자동 draw 0장 허용, 재뽑기 없음, deck/discard만 재순환 |

기존 cardset의 ‘세 round gold 8 < 최소 8종 cost 10’ 증명을 할인/환급 추가 후 그대로 인용하지 않는다. 004를 포함하면 printed 도시 비용도 커지며 cost1은 할인되지 않아 상한 4gold가 항상 실현되는 것도 아니다. 실제 최단 경로는 승인 후 deterministic scenario/시뮬레이션에서 재검증한다. 건설 예산 유지가 평균 pace의 증명은 아니다. 003B도 자기 건물 하나에만 적용되므로 전체 도시를 공격 불가능하게 만들지 않는다.

후속 검증 계획(이번에는 미실행): 같은 seed·정책으로 v1/v2의 2/4/6인 종료 round, role turn 수, gold 선택률, 005/006 채택·승률, 파괴 시도, 공급 고갈, 첫 완성자 승률, 001 재건설 횟수를 비교한다. 단일 bot 정책이나 작은 표본을 사람 평균으로 일반화하지 않는다. 초기 경고선으로 median role turn 수가 v1 대비 20% 이상 변하거나 특정 명소가 여러 정책에서 거의 자동 선택되는 경우 재검토를 제안한다. 이는 관찰 기준이지 신규 게임 규칙이 아니다.

## 13. Protocol / persistence / privacy impact

### 실제 command와 source evidence

현재 event는 `city:selectRole`, `city:takeIncome`, `city:drawBuildingCards`, `city:chooseBuildingCard`, `city:useRoleAbility`, `city:build`, `city:endTurn`이다. 요청의 acquire/choose/useAbility는 개념 표현이며 그 이름의 event가 있다고 가정하지 않는다.

| 경계 | 현재 source | 승인 후 최소 변경 방향(지금은 미구현) |
| --- | --- | --- |
| 카드/규칙 | `apps/server/src/games/city-role/domain/cardset-v1.ts`, 같은 directory의 `role.ts` | 별도 v2 effect 정의와 버전 선택, v1 불변 |
| 효과/순환 | 같은 domain의 `rule-engine.ts`: build/draw/completeAcquisition/useAbility | build에 entropy 전달, 단발 draw/refund, 건설 할인·파괴 가격 |
| 점수 | 같은 domain의 `result-engine.ts` | v2 specialBonus와 다양성 판정, forfeit 제외, 결과 상세 |
| 저장 | 같은 domain의 `game-state.ts`, `state-validator.ts`; `compatibility/city-role-game-state-adapter.ts` | concrete budget/round marker의 clone/validation/coherence, 버전별 검사 |
| Application | `apps/server/src/games/city-role/application/city-role-command-service.ts`, `city-role-entropy.ts` | 기존 lane/UoW/CAS/requestId/entropy atomic commit 유지 |
| Wire | `packages/shared/src/protocol.ts`, `games/city-role/v2-projection-contracts.ts` | 추천 command payload는 동일. version literal, public usage, specialBonus 등 좁은 CITY 계약 확장 |
| Projection | `apps/server/src/games/city-role/compatibility/city-role-v2-game-projector.ts` | viewer whitelist 유지. 공개 effect catalog와 owner-only hand 구분 |
| Web | `apps/web/src/features/city-role/city-role-ui.ts`, `CityVisuals.tsx`, `city-role-guide.ts`, Playing/Finished | 버전별 문구·할인 가격·보너스 내역. ‘특수 능력 없음’은 v1에만 유지 |

추천안에 새 command/pending은 없지만 **wire 변경이 전혀 없다는 뜻은 아니다.** Strict version literal과 결과/public usage schema를 검토해야 하므로 domain만 바꾸면 완료라고 하지 않는다. D는 trigger command가 없다는 분류다. Generic `building:effect`, 임의 script payload, `city:useRoleAbility`에 건물 능력을 몰아넣는 방식은 금지한다.

### 필요한 concrete state — 개념만 제안

- Player/game별 최초 template 보상 기록(001/002), 004 최초 활성 기록·remainingUses 0..3·lastDiscountRound. Physical copy가 아닌 player/template 예산이 재건설 악용을 막는다.
- 기존 physical cardId/templateId를 유지한다. Passive 003과 derived 005/006 때문에 mutable category나 assignedRole을 저장하지 않는다.
- Destroy/forfeit 시 활성 효과와 미사용 기회를 없애되 과거 사용/활성 기록은 보존한다. Clone/restore 누락으로 보상이 재지급되지 않도록 round-trip 검증이 필요하다.
- 일반 획득 pending과 건설 pending을 구분한다. 002B는 기존 DRAW_BUILDING 최대 3후보/choose1, CR-06 보너스 한 번이다. 005C만 건설 후 category 선택 substate가 필요하다. 기본 획득은 이미 COMPLETE이므로 이 pending 완료가 CR-06을 다시 호출하면 안 된다.
- 005C의 확정 category는 passive 해석을 위한 선택 기록이다. 파괴 중 비활성이고 재건설 시 재선택 없이 그 기록을 사용한다. 미해결 category pending 중 forfeit하면 pending은 취소하고 frozen city에 능력을 적용하지 않는다.

### Visibility / reveal

| 정보 | SELF | OTHER | SERVER |
| --- | --- | --- | --- |
| 버전별 template 능력 catalog | 공개 | 공개 | 소유 |
| 손패 명소 exact 카드/효과 UI | 자기 카드만 | exact 없음, hand count만 | 소유 |
| 건설된 명소/자동 효과/남은 할인 횟수 | 공개 | 공개 | canonical |
| 공개 건설에 따른 과거 사용 기록 | 공개 | 공개 | 재실행 방지 저장 |
| 자동 draw 카드/기존 pending 후보 | owner exact | hand count/허용 pending 상태만 | exact 소유 |
| hidden roles/marks/removals/deck/RNG/credentials | 기존 privacy | 기존 privacy | 기존 비공개 경계 유지 |

Retry/resume은 같은 canonical state를 반환한다. Draw 재실행·budget reset·deadline 연장은 없다. E01/E02/E03를 유지한다. Expired command는 건설/효과를 실행하지 않고 default timeout은 optional build를 하지 않는다. Forfeited city의 그림은 보여도 능력은 비활성, 특수 보너스는 0이다.

## 14. Versioning recommendation

**city-rules-v2 + city-cardset-v2**, role 자체 정의는 바뀌지 않으므로 **city-roles-v1 유지**를 추천한다. 같은 가격/ID여도 template의 공개 규칙 내용이 달라지므로 cardset-v1을 조용히 덮어쓰지 않는다. Template은 `(cardSetVersion,templateId)`로 해석하고 physical ID는 기존 game 내 identity를 유지한다. 새 GameType은 만들지 않는다.

- v1 문서/스냅샷/저장 기록을 이름만 v2로 바꾸지 않는다. 기존 game은 start에서 pin한 버전으로 끝낸다.
- 구현 단계에서 신규 game 기본 버전 전환과 기존 v1 보존 경로를 명시한다. 지원하지 않는 저장 버전은 명확히 거절한다. 지금 병행 engine/registry를 구현하지 않는다.
- Snapshot V2 shell의 2와 CITY rules-v2는 다르다. Event/envelope protocolVersion은 가능하면 유지하되 CITY exact branch/version 호환성은 갱신해야 한다.
- 현재 capability는 GameType 수준이다. CITY_ROLE을 지원한다고 광고하는 구 Web이 rules-v2도 이해한다고 가정하지 않는다. 별도 구현 승인 gate에서 old-client fail-closed 안내/refresh 또는 좁은 version capability 방식을 확정해야 한다. 이번 문서는 호환성 구현 완료를 뜻하지 않는다.
- HANGUL/NUMBER/GEM/release tag 불변. v1 게임에 v2 카드 설명을 보여주거나 v2에 ‘모든 건물 특수 능력 없음’을 표시하면 안 된다.

## 15. UI / tutorial proposal

기존 그림/분류 badge/비용·VP 아래에 **특수 능력 · 짧은 한 줄**만 추가한다. Tooltip/Guide에는 최초 1회 범위, 지불 최소1, 남은 횟수/이번 round 사용, 파괴 시 소멸, 실제 분류 조건을 둔다. ‘처음 건설 보상 사용 완료’, ‘할인 2회 남음 / 이번 라운드 사용 완료’처럼 소진 상태도 설명한다.

v2 개념 문구: **“명소는 카드마다 고유한 능력이 있습니다. 다른 분류 건물에는 특수 능력이 없습니다.”** 명소를 손패로 받았다는 사실을 타인에게 toast하지 않는다. 능력 승인 전에는 현 Web 문구/그림을 바꾸지 않는다.

## 16. 사용자 decision table — 모두 OPEN

| ID | 질문 / template | A | B | C | 추천 / 이유 | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| LANDMARK-001 | 빗물정원 | 첫 건설 환급1 | 다음 gold 획득 +1 단발 | city4 이상 종료 +1 | A: 작은 즉시 경제 효과 | OPEN |
| LANDMARK-002 | 작은해시계 | 첫 건설 draw1 | 다음 draw3→1 단발 | 다음 gold 획득 시 draw1 | A: 새 pending 없는 카드 흐름 | OPEN |
| LANDMARK-003 | 돌물결마당 | 자기 해체 면역 | 자기 해체 비용 +1 | 해체 1회 무효 | B: 대응 가능한 저비용 저항 | OPEN |
| LANDMARK-004 | 바람계단 | 첫 건설 환급3 | 일반 건설 −1/round·총3회 | 다음 일반 건설 −2 단발 | B: 투자·상한·회수 기간 | OPEN |
| LANDMARK-005 | 달그림회랑 | 다양성 missing1 보완 | 일반3종이면 +2 | 건설 시 virtual 분류 선택 | A: picker 없이 구성 유연성 | OPEN |
| LANDMARK-006 | 일곱길기념뜰 | 일반 분류마다 +1,max4 | 일반 VP12 이상 +3 | gold3당 +1,max3 | A: 가장 큰 조건부 후반 보상 | OPEN |
| LANDMARK-007 | Version policy | rules-v2 + cardset-v2, roles-v1 유지; 기존 game pin 보존 | rules-v2만, effect를 별도 rules catalog로 관리 | 보류: 별도 expansion-version 구조 검토 | A: template 의미 변경 명시. B는 명확한 effect 버전 해석, C는 후속 설계 필요. Silent overwrite는 모든 안에서 금지 | OPEN |
| LANDMARK-008 | 효과 공개 | catalog 공개, hand owner만, 건설 후 효과/잔여 횟수와 공개 사용 이력 표시 | catalog/건설 효과는 공개, 잔여 횟수는 owner만 | 잔여 횟수는 공개, 과거 소진 이력은 서버만 저장 | A: 재건설까지 설명 가능한 공개 상호작용. B는 숨은 방패 분쟁, C는 공개 payload가 작지만 과거 사용 이유 설명이 약함. 모든 안에서 hand/secret 비공개 유지 | OPEN |
| LANDMARK-009 | Destroy/forfeit/재건설 | 활성·미사용 기회 소멸, 사용 이력 보존; 재충전 없음 | 파괴 중 일시 정지, 재건설 시 미사용 잔여만 복구; 새 충전 없음 | player/template 대신 physical card별 game 예산, 파괴 시 잔여 소멸·이력 보존 | A: 작은 lifecycle과 player별 power 상한. B는 휴면 state, C는 copy별 소진과 소유 변경 설명이 필요하고 player별 상한 재감사 필요. Forfeit는 모든 안에서 미사용 기회 소멸 | OPEN |
| LANDMARK-010 | Cost→power 기준 | 전체 VP+상한+실현 조건의 양의 관계, 실전 검증 후 조정 | 모든 상태에서 고비용이 저비용을 엄격히 지배 | 가격/VP 재분배부터 재설계 | A: 다양한 효과와 정직한 검증. B는 현재 후보 재설계, C는 별도 범위 승인 필요 | OPEN |

추천 응답: `LANDMARK-001 A, 002 A, 003 B, 004 B, 005 A, 006 A, 007 A, 008 A, 009 A, 010 A` 또는 `추천안 전체 승인`.

`ALL:A`는 003면역/004환급3까지 선택하므로 추천 전체와 다르다. 자동으로 B로 치환하지 않는다. 후보 혼합 후 END_GAME 관련 template 수(최대2 권장), power, hook, cleanup, pending 일관성을 다시 감사한다. 기존 CITY decision 번호는 덮어쓰지 않는다. 금지조건과 충돌하는 비교안은 위험 설명용이지 승인 없이 구현할 수 있는 우회안이 아니다.

## 17. 검증 기록 및 다음 승인 경계

산출물은 이 문서 하나다. 문서/runtime 6행 동등성, 12copies/36VP, 실제 event/version명, 보너스 중첩, privacy, 반복 소진을 감사했다. 기존 1,498 tests는 수정/삭제/skip하지 않았다. Root typecheck/test/build PASS, 현재 test count는 shared108 / Web354 / server1,036이다. 기존 561.01kB bundle의 >500kB 경고는 그대로다. 새 능력 테스트·시뮬레이션·browser playtest는 구현하지 않아 실행했다고 주장하지 않는다.

사용자 001–010 선택 → 조합 일관성/호환성 최종 승인 → 별도 구현 요청 순서다. **DOMAIN READY 또는 구현 COMPLETE로 판정하지 않는다.** Balance 가설과 OPEN decisions는 이 gate에서 승인받아야 할 산출물이다.

## 18. 사용자 최종 승인 및 구현

| Decision | 승인 | 상태 |
| --- | --- | --- |
| LANDMARK-001 | A — 최초 성공 건설 환급1 | CONFIRMED / IMPLEMENTED |
| LANDMARK-002 | A — 최초 성공 건설 자동 draw≤1 | CONFIRMED / IMPLEMENTED |
| LANDMARK-003 | B — 이 건물 해체 비용+1 | CONFIRMED / IMPLEMENTED |
| LANDMARK-004 | B — 일반 건설 자동−1, round1회/game3회 | CONFIRMED / IMPLEMENTED |
| LANDMARK-005 | A — 다양성 전용 가상 일반 category1 | CONFIRMED / IMPLEMENTED |
| LANDMARK-006 | A — 실제 일반 category당 종료+1,max4 | CONFIRMED / IMPLEMENTED |
| LANDMARK-007 | A — rules-v2/cardset-v2/roles-v1, 기존 v1 pin | CONFIRMED / IMPLEMENTED |
| LANDMARK-008 | A — 건설된 효과와 공개 사용 이력, 기존 secret 유지 | CONFIRMED / IMPLEMENTED |
| LANDMARK-009 | A — 파괴/기권 잔여 소멸, 이력 보존, 재충전 없음 | CONFIRMED / IMPLEMENTED |
| LANDMARK-010 | A — 전체 비용/VP/상한/실현 조건으로 평가 | CONFIRMED / IMPLEMENTED |

바람계단은 승인 B의 첫 적격 일반 건설에 자동 적용하며 명소/비용1 건설에는 사용되지 않는다. 가상 category는 실제 소유도 수입도 일곱길 점수도 아니다. 48개 deterministic 게임은 runaway 탐지의 제한적 증거이며 경쟁 밸런스 확정으로 확대 해석하지 않는다. Runtime 구현 및 테스트는 후속 사용자 요청으로 승인되었으며 Railway 배포는 승인 범위 밖이다.

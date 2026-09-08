# CITY_ROLE — Original building cardset v1

> P14B · 2026-09-08 · `city-cardset-v1` · **CARDSET_CONFIRMED / USER_APPROVED**
>
> 문서 단계 original dataset이다. Runtime TS/JSON/asset/카드 인스턴스는 생성하지 않는다. CITY-037A에 따라 작성한 아래 exact60장 후보를 사용자가 최종 승인했다. 30개 template 행·이름·수치·60개 슬롯은 변경하지 않았다. §7–8의 후보 감사 이력과 위험을 보존하며 최신 승인 근거는 §9다. Dataset 승인은 runtime 구현 완료나 release/IP clearance를 뜻하지 않는다.

## 1. Authority / 독립 설계 방식

- CITY-033A: printed cost = victoryPoints, 정수 1–6, physical cardId와 templateId를 분리한다.
- CITY-034A: `CIVIC / CULTURE / TRADE / GUARD / LANDMARK` 5 categories.
- CITY-035A: v1 special ability 없음. 아래 카드에는 수입·할인·보호·추가 점수 효과나 예외 문구가 없다.
- CITY-036A: deck에 같은 template의 physical copies는 있어도 한 city에는 같은 template을 두 번 건설할 수 없다.
- CITY-037A: 총60장, category별12장 original 설계와 exact 분포 audit.
- CITY-062A/063A: 독립적인 명칭·데이터 및 별도 `city-cardset-v1` version.

이 설계는 상용 카드 목록·cost/VP table을 열람하거나 복사하여 채우지 않았다. 프로젝트에서 승인한 수치 범위 안에서 **category별 6개의 독립 template, 각2 copies, 각 category의 printed cost/VP 합36**을 먼저 설정하고 서로 다른 비용 패턴을 만들었다. 그다음 자체 한국어 이름을 작성했다. Category별 평균을 같게 하는 것이 이번 static design의 단순한 typo/skew 점검 기준이며, 완벽한 실전 balance의 증명은 아니다.

공식 카드의 재명명표·번역표·원작 대비 카드 mapping은 만들지 않는다. 일반적인 건축 명사와 자체 조합을 사용한 아래 working names도 별도 product/name review 대상이다. 이 문서에서 특정 이름의 전 세계 유일성이나 법적 사용 허가를 주장하지 않는다. [IP/product gate](./CITY_ROLE_IP_PRODUCT_GATE.md)의 original expression/provenance/release review 경계를 유지한다.

## 2. Identity / 60장 명세를 읽는 법

- `templateId`: 같은 이름의 건물 종류를 식별한다. 동일 city 중복 검사는 display name 문자열 대신 이것을 기준으로 한다.
- `design copies`: 60개의 설계 슬롯을 빠짐없이 열거하기 위한 문서 ID다. **Deck 순서나 런타임 wire physical cardId가 아니다.**
- `CCS-001`과 `CCS-002`가 같은 template이라도 런타임에서는 서로 다른 opaque physical cardId를 갖게 해야 한다. 이 ID를 예측 가능한 설계 슬롯에서 공개적으로 유도하는 것은 허용하지 않는다.
- Category/cost/VP/template 정의는 공개 catalog가 될 수 있지만, 특정 physical copy가 어느 hand/deck 위치에 있는가는 별도 privacy 규칙을 따른다.
- Cost와 VP 두 열은 의도적으로 동일하다. Category는 theme/color와 분리된 domain ID다. Printed PRISM/resource cost, Joker, special building effect는 없다.

## 3. Original template table — 30 templates / 60 physical design slots

| Template ID | 자체 working name | Category | Cost | VP | Copies | Design copies |
| --- | --- | --- | ---: | ---: | ---: | --- |
| CB-CIV-01 | 비표보관소 | CIVIC | 1 | 1 | 2 | CCS-001, CCS-002 |
| CB-CIV-02 | 공론마당 | CIVIC | 2 | 2 | 2 | CCS-003, CCS-004 |
| CB-CIV-03 | 길안내소 | CIVIC | 2 | 2 | 2 | CCS-005, CCS-006 |
| CB-CIV-04 | 협의뜰 | CIVIC | 3 | 3 | 2 | CCS-007, CCS-008 |
| CB-CIV-05 | 우편회랑 | CIVIC | 4 | 4 | 2 | CCS-009, CCS-010 |
| CB-CIV-06 | 수평의사당 | CIVIC | 6 | 6 | 2 | CCS-011, CCS-012 |
| CB-CUL-01 | 종이공방 | CULTURE | 1 | 1 | 2 | CCS-013, CCS-014 |
| CB-CUL-02 | 낭독쉼터 | CULTURE | 1 | 1 | 2 | CCS-015, CCS-016 |
| CB-CUL-03 | 노래뜰 | CULTURE | 3 | 3 | 2 | CCS-017, CCS-018 |
| CB-CUL-04 | 기록정원 | CULTURE | 4 | 4 | 2 | CCS-019, CCS-020 |
| CB-CUL-05 | 별관측실 | CULTURE | 4 | 4 | 2 | CCS-021, CCS-022 |
| CB-CUL-06 | 이야기회랑 | CULTURE | 5 | 5 | 2 | CCS-023, CCS-024 |
| CB-TRA-01 | 저울마당 | TRADE | 1 | 1 | 2 | CCS-025, CCS-026 |
| CB-TRA-02 | 포장공방 | TRADE | 2 | 2 | 2 | CCS-027, CCS-028 |
| CB-TRA-03 | 교환안뜰 | TRADE | 2 | 2 | 2 | CCS-029, CCS-030 |
| CB-TRA-04 | 상인회랑 | TRADE | 3 | 3 | 2 | CCS-031, CCS-032 |
| CB-TRA-05 | 장부전당 | TRADE | 5 | 5 | 2 | CCS-033, CCS-034 |
| CB-TRA-06 | 운송집결소 | TRADE | 5 | 5 | 2 | CCS-035, CCS-036 |
| CB-GUA-01 | 등불초소 | GUARD | 1 | 1 | 2 | CCS-037, CCS-038 |
| CB-GUA-02 | 길목대기소 | GUARD | 2 | 2 | 2 | CCS-039, CCS-040 |
| CB-GUA-03 | 신호마당 | GUARD | 3 | 3 | 2 | CCS-041, CCS-042 |
| CB-GUA-04 | 순찰회랑 | GUARD | 3 | 3 | 2 | CCS-043, CCS-044 |
| CB-GUA-05 | 지도훈련소 | GUARD | 4 | 4 | 2 | CCS-045, CCS-046 |
| CB-GUA-06 | 방호전당 | GUARD | 5 | 5 | 2 | CCS-047, CCS-048 |
| CB-LAN-01 | 빗물정원 | LANDMARK | 1 | 1 | 2 | CCS-049, CCS-050 |
| CB-LAN-02 | 작은해시계 | LANDMARK | 2 | 2 | 2 | CCS-051, CCS-052 |
| CB-LAN-03 | 돌물결마당 | LANDMARK | 2 | 2 | 2 | CCS-053, CCS-054 |
| CB-LAN-04 | 바람계단 | LANDMARK | 4 | 4 | 2 | CCS-055, CCS-056 |
| CB-LAN-05 | 달그림회랑 | LANDMARK | 4 | 4 | 2 | CCS-057, CCS-058 |
| CB-LAN-06 | 일곱길기념뜰 | LANDMARK | 5 | 5 | 2 | CCS-059, CCS-060 |

동일 category/cost/VP인 **다른 template**은 의도적으로 존재한다. 예를 들어 CB-CIV-02와 CB-CIV-03은 각기 다른 건물이므로 같은 city에 함께 건설할 수 있다. CB-CIV-02의 두 physical copies를 같은 city에 건설하는 것은 CITY-036A에 의해 금지된다. 이를 cost vector 중복 금지나 category당1장 제한으로 잘못 일반화하지 않는다.

## 4. Static balance audit

### 4.1 Category별

| Category | Templates | Physical count | Template cost pattern | Min–max cost / VP | Average cost / VP | Total printed cost / VP |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| CIVIC | 6 | 12 | 1,2,2,3,4,6 | 1–6 | 3.00 | 36 |
| CULTURE | 6 | 12 | 1,1,3,4,4,5 | 1–5 | 3.00 | 36 |
| TRADE | 6 | 12 | 1,2,2,3,5,5 | 1–5 | 3.00 | 36 |
| GUARD | 6 | 12 | 1,2,3,3,4,5 | 1–5 | 3.00 | 36 |
| LANDMARK | 6 | 12 | 1,2,2,4,4,5 | 1–5 | 3.00 | 36 |
| **Total** | **30** | **60** | — | **1–6** | **3.00** | **180** |

### 4.2 Cost/VP frequency

| Printed cost = VP | Templates | Physical cards | VP contribution |
| ---: | ---: | ---: | ---: |
| 1 | 6 | 12 | 12 |
| 2 | 7 | 14 | 28 |
| 3 | 5 | 10 | 30 |
| 4 | 6 | 12 | 48 |
| 5 | 5 | 10 | 50 |
| 6 | 1 | 2 | 12 |
| **Total** | **30** | **60** | **180** |

- Zero-cost/zero-point cards: 0. Special-effect cards: 0.
- 1–2 cost cards: 26/60. Starting gold2만으로 구매 비용을 낼 수 있는 범위지만, 실제 hand와 template 중복/건설 budget이 최종 legality를 결정한다.
- 5–6 cost cards: 12/60. Category 중 CIVIC만 cost6을 가진 비대칭은 오류가 아니라 명시적 design choice다. 다른 category의 최고 비용을6으로 맞추기 위해 추가 카드를 만들지 않는다.
- 5 categories의 card count와 aggregate cost/VP는 같다. 그러나 네 category의 role income과 LANDMARK의 income 부재, role draft/공격, 비용의 temporal value 때문에 **category의 실전 기대값이 같다는 주장은 하지 않는다**.
- 모든 template은 두 copies. Template ID 중복 정의0, design slot 중복0, 미열거 slot0. 이름은 서로 다르며 규칙상 identity는 여전히 templateId다.

## 5. 2–6인 setup / 완성 threshold 산술

CITY-027A의 초기 player당4장으로 계산한다. 표의 deck 잔량은 role selection·draw·build가 시작되기 전이며, 실제 deal 순서/RNG는 final rules/protocol gate가 소유한다.

| Players | Initial hand cards total | Deck remaining | 8 buildings × players | 60장과 차이 |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 8 | 52 | 16 | 44 |
| 3 | 12 | 48 | 24 | 36 |
| 4 | 16 | 44 | 32 | 28 |
| 5 | 20 | 40 | 40 | 20 |
| 6 | 24 | 36 | 48 | 12 |

30개의 distinct templates는 city 완성 threshold8보다 많다. 각 template이 두 copies이므로, 최다6명이 각8개의 distinct template을 보유하는 **조합 자체도 가능**하다. 산술 확인용으로 표 순서 template을0–29로 두고 player p=0–5가 `(8p+k) mod30` (k=0–7)을 가지면, 각 city 내8종이 서로 다르고 전체48장 중 어느 template도 두 copies를 초과하지 않는다. 이는 가능성 증명용 계산이지 실제 deal policy나 미리 정한 deck order가 아니다.

이 계산은 모든 참가자가 게임 도중 반드시 도시를 완성한다는 보장이 아니다. Hidden hands·draw 선택·duplicate draw·공격·first completion round latch에 따라 실제 결과가 다르다. 자유 보유/no-hand-cap과 frozen forfeited cities 때문에 이용 가능한 deck/discard가 고갈될 수도 있다. CITY-031A에 따라 사용할 수 있는 discard만 reshuffle하고, 둘 다0이면 draw reject/gold 선택 경로를 유지한다. Frozen city 카드를 덱으로 되돌리거나 건설을 강제하거나 새 exhaustion finish reason을 추가하지 않는다.

## 6. Version / future implementation boundary

- Conceptual `cardSetVersion = city-cardset-v1`. Rules/role 버전은 CITY-063A대로 별도이며 이 문서가 그 수치나 능력을 변경하지 않는다.
- Game start는 나중에 승인된 dataset version과60개 unique physical instances를 pin해야 한다. 표의 행 순서나 design copy ID를 deck 순서로 공개해서는 안 된다.
- Conservation의 기본 zone 후보는 deck / private hand / canonical pendingChoice / public city / private discard다. Leave/timeout-forfeit 후 frozen city의 카드는 여전히 그 game의 physical instance다.
- Future tests: exact60/5×12, unique physical IDs, cost=VP/range, duplicate template build rejection, same-stat different-template build 허용, draw/choice/reshuffle/leave conservation, snapshot private-zone exclusion, persisted round-trip/version pinning.
- 현재 runtime asset/source/schema/test는 추가하지 않는다. 후속 balance tuning은 이 v1의 기존 숫자를 조용히 바꾸지 않고 별도 dataset version/승인으로 다룬다.

## 7. 후보 audit result / 당시 remaining gate (history)

표의30 rows를 별도 계산으로 읽어 count·category·cost histogram·180VP·initial-deal 잔량·6인8종 가능성 검사를 수행했다. Static arithmetic는 PASS다. 재개 감사에서도 원본30개 행의 이름·수치·template ID·60개 슬롯은 바꾸지 않았다. 전체 P14B 규칙·draft·role ability·timeout·privacy/IP consistency 검사가 통과했다는 의미는 아니다.

**CARDSET_APPROVED_CANDIDATE / USER_APPROVAL_PENDING**. 명시적 count/cost/identity 제약을 위반하거나 8건물 목표를 구조적으로 불가능하게 하는 cardset blocker는 이번 감사에서 발견하지 못했다. 아래 경제 비대칭·고갈·속도 위험은 숨기지 않고 사용자 검토와 향후 playtest 대상으로 제출한다. [Decision gate](./CITY_ROLE_DECISION_GATE.md), [P14B rules](./CITY_ROLE_GAME_RULES.md), [consistency audit](./CITY_ROLE_P14B_CONSISTENCY_AUDIT.md)의 별도 readiness/IP gate를 이 상태로 닫지 않는다.

## 8. 재개 audit — 승인 규칙과 경제적 의미

이 절은 기존30개 template·60개 physical design slots를 **변경하지 않고** CITY-001C/004B와 확정된 경제·역할·종료 규칙을 대조한 결과다. 70개 decision 또는 E01–E03의 승인을 변경하지 않는다. 아래는 수치의 함의와 검증 한계이지 새 규칙이다.

### 8.1 산술·identity 재검증

별도 Node 계산은 위 실제 Markdown 카드 행을 읽어 검사했다. 다른 복사본의 배열을 검증하고 표도 같다고 가정하지 않았다.

| 검사 | 결과 |
| --- | --- |
| Template 행 수 / 고유 ID / 고유 working name | 30 / 30 / 30 |
| Physical copy 합 / 고유 design slots | 60 / 60 |
| CCS-001…CCS-060 연속성 | 누락0 / 중복0 |
| 각 template 매수 | 모두2 |
| Category별 template / physical count | 모두6 / 12 |
| Cost=VP, 정수1–6 | 30행 모두 만족 |
| Category별 cost/VP 합 / 평균 | 모두36 / 3.00 |
| 전체 printed VP | 180 |
| Cost1/2/3/4/5/6 physical counts | 12 / 14 / 10 / 12 / 10 / 2 |
| 가장 저렴한 distinct8 templates의 cost 합 | 10 |
| 가장 비싼 distinct8 templates의 cost 합 | 39 |

10/39는 template 중복 금지 상태에서 데이터셋이 허용하는 8종 도시의 **printed cost 합 범위**다. 카드에 접근할 수 있는 hand/draw 경로, 상대와의 경쟁, 실제 구매 시점의 gold를 증명하지 않는다. VP도 같지만 completion/diversity bonus를 포함한 최종 점수 범위라고 표시하지 않는다.

### 8.2 네 수입 category와 LANDMARK의 비대칭

| Category | 연결된 승인 role 수입 | Cost1–2 physical cards | 감사 결과 |
| --- | --- | ---: | --- |
| CIVIC | CR-04 정상 시작 시 건물당 gold1 | 6/12 | Leader 효과는 role에 속하며 이 카드의 별도 능력이 아님 |
| CULTURE | CR-05 정상 시작 시 건물당 gold1 | 4/12 | Role의 보호 효과와 category 수입을 별개로 해석해야 함 |
| TRADE | CR-06 정상 시작 시 건물당 gold1 | 6/12 | 기본 획득 후 추가 gold1은 TRADE 카드 수와 무관한 role 효과 |
| GUARD | CR-08 정상 시작 시 건물당 gold1 | 4/12 | 파괴 효과는 role에 속함. GUARD 건물 자체에 방어/공격 효과 없음 |
| LANDMARK | 연결된 category 수입 없음 | 6/12 | 같은 cost/VP라도 반복 수입의 기회가 없으며, 자체 special ability도 없음 |

따라서 5종이 동일 매수·평균 비용이라는 이유로 경제 가치가 같다고 결론내리지 않는다. LANDMARK는 5종 diversity bonus를 얻는 데 필요하지만, 한 장으로 해당 category 조건을 만족한 뒤 추가 LANDMARK를 건설해도 diversity bonus가 매번 누적되지 않는다. 이후의 가치는 printed VP·다른 template 확보·현재 손패/가격/건설 상황에 있다. 동일 비용의 다른 category는 향후 대응 role을 얻었을 때 추가 수입 가능성이 있어 **LANDMARK가 상대적으로 덜 매력적일 위험**이 남는다. 다만 role 입수·봉쇄·종료까지 남은 round가 미정이므로 그 위험을 확정 승률 차이나 항상 열등한 선택이라고 부르지 않는다.

CULTURE/GUARD의 초기 gold2로 비용을 낼 수 있는 카드가 각4장이고 나머지 category는 각6장이라는 저비용 접근성 차이도 있다. CIVIC만 cost6 카드2장을 갖는다. 이는 감사로 드러난 명시적 비대칭이며, 이를 맞추기 위해 승인 없이 비용 조정·LANDMARK 수입·추가 bonus·특수 건물을 넣지 않는다.

### 8.3 2–6인 카드 순환·고갈 위험

초기 deal 뒤 draw 가능한 deck은 2/3/4/5/6인에서 각각52/48/44/40/36장이다. 최대 인원6명은 시작부터24장을 hand에 보유하여 이후 공급 여유가 가장 적다. 이 차이는 실제 playtest에서 따로 볼 필요가 있다.

- 기본 draw/choose는 공급이2장 이상이면2장을 잠시 pending에 두고1장을 hand에 남기므로 순감소는1장이다. 반환1장은 bottom에 가며 discard로 가지 않는다. 공급이1장이어도 얻는 카드는1장이다.
- CR-07의 bonus draw는 최대2장을 hand에 바로 추가한다. City 건설은 hand에서 city로의 이동이므로 deck을 보충하지 않는다.
- Hand cap이 없으므로 카드를 많이 보유하고 건설하지 않는 선택이 가능하다. Deck과 discard가 모두 비어도 다른 player의 hand나 frozen city에서 강제로 회수하지 않는다.
- CR-03의 손패 교환은 분배를 바꾸지만 총 hand 장수는 늘리지 않는다. 자기 카드 교체는 discard-first 후 같은 수 draw이므로 공급이 적으면 방금 버린 카드가 돌아올 수 있다. 이를 새로운 카드 유입이나 무조건 손패 개선으로 계산하지 않는다.
- 파괴·leave는 승인된 카드들을 discard로 보내 재순환 기회를 만들지만, 언제나 일어나거나 도시 완성을 보장하는 사건은 아니다. Frozen forfeited city는 순환 자원이 아니다.
- CITY-031A의 0장 draw reject/gold 대안은 **현재 턴을 진행할 수 있게 하는 규칙**이다. CITY-056A의 overall deadline 없음, 선택적 건설과 함께 보면 유한 시간 안의 게임 종료까지 보증하지 않는다. 무한한 합법적 무건설 경로나 장기 교착의 제품 위험을 카드 수60만으로 해결했다고 하지 않는다.

60장으로6개의8종 도시를 구성할 수 있다는 §5 산술은 전체 inventory가 목표를 물리적으로 배제하지 않는다는 뜻이다. 실제 게임에서는 첫 완성 round에 종료되므로 여섯 명 모두의 완성을 보장하거나, 그러한 전체 배치가 정상 플레이로 반드시 도달 가능하다고 주장하지 않는다.

### 8.4 8건물 속도 — budget 산술과 추정 분리

아래는 **도시0에서 시작하고, 참가 인원이 유지되며, 해당 role turn이 모두 정상 진행되고, 카드와 gold 제약을 무시한 construction budget만의 계산**이다. 완성 예상 round나 평균 게임 시간의 추정치가 아니다.

| 인원 | Player당 roles/round | CR-07 없는 개인 최대 건설/round | 이 경우 8개에 필요한 최소 round | 매 round CR-07 포함 시 개인 최대 건설/round | 이 경우 8개에 필요한 최소 round |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2–3 | 2 | 2 | 4 | 4 (=3+1) | 2 |
| 4–6 | 1 | 1 | 8 | 3 | 3 |

CR-07은 role set에 하나뿐이며 특정 player가 매 round 선택할 수 있다고 보장되지 않는다. 공개/비공개 제거, 다른 선택자, 봉쇄, hand/gold 부족, 파괴로 실제 속도는 느려질 수 있다. 2–3인에서는 player당 기본 획득과 건설 기회가 늘지만 같은 gold/hand/city를 공유하며, 4–6인과 round 수를 단순 비교하면 체감 길이를 잘못 예상할 수 있다. Leave로 다음 round의 quota가 바뀌면 위 고정 인원 계산도 다시 적용해야 한다.

Cost1 카드는12장이고 CR-08의 승인 비용은 `max(0,cost−1)`이므로, 보호받지 않는 해당 건물은 gold0으로 파괴할 수 있다. 저비용 건물로 빠르게8개를 채우려는 동기와 반복 방해에 취약한 점을 함께 관찰해야 한다. 이는 이미 승인된 직접 견제 규칙의 경제적 결과이며, 최소 파괴 비용·무료 파괴 횟수 제한·추가 보호를 새로 도입하지 않는다.

특히 **4–6인의 3round는 실제 달성 가능한 최단 round가 아니다**. Player당1role인 상태로3round에8건설 budget을 얻으려면 그 player가 세 번 모두 CR-07을 가져야 한다(3+3+1이면7). 이 경우 다른 category 수입/이전 role을 함께 가질 수 없고, 기본 획득을 세 번 전부 gold로 선택해도 시작2+획득6=총8 gold뿐이다. 서로 다른8templates의 최소 비용10보다 적다. 따라서 **인원이 유지되는 1role 모드에서 도시8건물 완성은 경제 제약까지 포함하면 적어도4round가 필요**하다. 이것도4round 성공 보장이나 평균 속도가 아니며, 더 일찍 가능한 last-player-standing 종료를 제한하는 규칙도 아니다. 이 예는 construction budget만의 하한과 실제 합법적 완성 속도를 구분해야 하는 이유다.

전체 평균 cost3×8=24는 비용 규모를 설명하는 단순 기준일 뿐, 선택한 합법8종 도시의 기대 cost나 예상 필요한 gold 획득 횟수는 아니다. 실제8종 비용은 앞서 계산한10–39 범위이고, 시작 gold2/hand4, gold OR draw 선택, category 수입, CR-07 bonus, gold 이전이 동시에 영향을 준다. 아직 gameplay simulation·사용자 playtest를 실시하지 않았으므로 “N분 안에 완성”, “인원별 균형 검증 완료” 같은 결론은 내리지 않는다.

### 8.5 Provenance / 복제 감사의 범위

이 cardset 작성 경로에서는 published building deck/cost/VP 분포나 카드 이름 목록을 입력·scrape·참고하여 채우지 않았다. 사용한 자료는 저장소의 승인 제약과 이 문서에 설명한 독립 산술 설계다. 30개 template 이름과 비용 분포의 작성 과정을 기록했고, 공식 카드와 대응시키는 mapping도 없다.

이 사실은 **작성 경로의 provenance 기록**이지, 전 세계의 모든 published deck와 전수 비교하여 우연한 이름·숫자·분포 유사성까지 없음을 증명한 결과가 아니다. 별도 규칙 reference 조사는 이 dataset의 개별 카드값을 채우는 자료로 사용하지 않는다. 원작과 유사한 mechanics, 공개 이름, 전체 표현, publisher policy에 대한 별도 IP/product 검토는 여전히 필요하며 cardset 산술 PASS가 법적 비침해나 release 허가를 의미하지 않는다.

### 8.6 사용자 최종 승인 전 cardset audit 판정 (history)

**CARDSET_APPROVED_CANDIDATE / USER_APPROVAL_PENDING**.

구조적 모순·count 오류·identity 누락·허용 범위 위반은 발견하지 못했다. LANDMARK 수입 부재, category별 저비용 접근성, 2역할/1역할의 속도 차이, hand 축적과 공급 고갈은 승인 규칙 안에서 생기는 구체적인 tuning/playtest 관찰점으로 남긴다. 현재 카드 row를 바꾸지 않고 exact60장 dataset의 최종 승인을 요청할 수 있는 상태이며, 사용자 승인이 없는데 `CARDSET_CONFIRMED`로 표시하지 않는다.

## 9. 사용자 exact60-card 최종 승인

사용자는 **CITY_ROLE_CARDSET_V1의 현재60장 후보를 최종 승인**하고, CLASSIC_REFERENCE_VERIFIED 및 CITY-001–070/E01–03을 유지한 채 P14B final consistency gate를 완료하도록 요청했다. 따라서 현재 상태는 **CARDSET_CONFIRMED / USER_APPROVED**다. §7–8.6의 USER_APPROVAL_PENDING은 이 승인 전 이력이며 현재 미해결 조건이 아니다.

승인된 범위는 §3의30개 template/60개 physical design slots 전체다. 각 category12장·36VP, 총180VP, cost1–6의 매수12/14/10/12/10/2, cost=VP 및 각 template2copies를 그대로 pin한다. 60장을 공식68장에 맞추거나 LANDMARK의 새 수입·특수능력·새 종료 규칙을 추가하지 않았다.

최종 재계산과 원본 카드 행 비교에서 변경·누락·중복·구조적 blocker가 없었다. 경제 비대칭, 고갈과 무한한 합법 진행 가능성, 인원별 pace는 §8의 알려진 검토 한계로 유지한다. 사용자 승인을 실전 balance 검증이나 법적 비침해 판정으로 확대하지 않는다. P14B 전체 판정과 후속 구현 경계는 [consistency audit](./CITY_ROLE_P14B_CONSISTENCY_AUDIT.md#12-p14b-final-gate--사용자-cardset-최종-승인-후)를 따른다.

# GEM_CARD Card Set V1

> 상태: `P10 CONFIRMED / ORIGINAL CARD DATA / P11 IMPLEMENTATION INPUT`
> `rulesVersion`: `gem-rules-v1` (conceptual canonical value; runtime representation은 P11에서 구현)
> `cardSetVersion`: `gem-cardset-v1` (conceptual canonical value; runtime representation은 P11에서 구현)
> 범위: `GEM_CARD` v1의 45-card canonical design dataset과 static audit
> 중요: **NOT LEGAL ADVICE — 이 문서는 법률 자문이나 권리 비침해 판단이 아니다.**

## 1. Dataset contract

이 문서는 사용자에게 확정된 `GC-001`~`GC-038` 규칙과 P10 card-set 제약을 만족하는 최초 `GEM_CARD` dataset을 정의한다. Runtime TypeScript, shared schema, persistence seed 또는 public asset은 P10 범위가 아니며 P11에서 이 표를 그대로 옮기기 전에 machine-readable validation을 추가한다.

Canonical constraints:

- 정확히 45장: `TIER_1`, `TIER_2`, `TIER_3` 각 15장
- 각 tier에서 production type `DAWN`, `TIDE`, `GROVE`, `EMBER`, `ECHO`가 정확히 3장씩
- Printed cost는 위 다섯 basic resource만 사용하며 `PRISM` printed cost는 항상 0
- `TIER_1`: total cost 3~5, points 0~1
- `TIER_2`: total cost 5~8, points 1~3
- `TIER_3`: total cost 8~11, points 3~5
- 같은 tier 안에서 `exact cost vector + productionType + points`가 같은 두 card는 없음
- 모든 card는 permanent production +1과 points 외 special ability, title, flavor text 또는 artwork를 갖지 않음
- Card identity는 중립적이고 opaque한 `GC-T{tier}-{sequence}` 형식이며 gameplay meaning을 ID 문자열에서 추론하지 않음

Cost vector의 열 순서는 항상 `DAWN`, `TIDE`, `GROVE`, `EMBER`, `ECHO`다. 숫자는 해당 basic resource의 printed cost다. `Total cost`는 다섯 열의 합이며 검토용 파생값이지 별도 canonical input이 아니다.

## 2. Original design provenance

이 dataset은 P10에서 확정된 범위·점수 제약과 다음 독자적인 cyclic-balance method에서 처음부터 작성했다. 특정 상용 제품의 card list, published deck table, token table, cost curve, scoring distribution 또는 asset을 검색·참조·전사·변형하지 않았다.

1. Resource order를 `DAWN → TIDE → GROVE → EMBER → ECHO → DAWN`으로 고정한다.
2. 각 tier에 original relative cost template 세 개와 point 값을 만든다.
3. 각 template을 production type 다섯 개에 대해 한 칸씩 순환 회전한다.
4. 그 결과 각 tier는 production별 세 장과 resource별 동일 printed demand를 갖는다.
5. 각 tier의 template 하나는 production self-cost 0, 나머지 두 개는 self-cost 양수로 설계해 self-cost 포함 여부를 다양화한다.

| Tier | Relative templates `[self, +1, +2, +3, +4]` | Points |
| --- | --- | --- |
| `TIER_1` | `[0,2,1,0,0]`, `[1,0,2,1,0]`, `[2,0,1,0,2]` | `0`, `0`, `1` |
| `TIER_2` | `[0,2,0,2,1]`, `[2,0,3,0,2]`, `[1,2,1,3,1]` | `1`, `2`, `3` |
| `TIER_3` | `[0,3,2,0,3]`, `[3,0,3,2,2]`, `[1,4,1,4,1]` | `3`, `4`, `5` |

이 provenance는 독립 설계 과정을 기록하지만 법률 clearance 또는 gameplay balance 완료를 뜻하지 않는다. Public release 전 [GEM_CARD_IP_PRODUCT_GATE.md](./GEM_CARD_IP_PRODUCT_GATE.md)의 provenance/data review와 실제 simulation·playtest가 필요하다.

## 3. TIER_1 — 15 cards

| Card ID | Production | DAWN | TIDE | GROVE | EMBER | ECHO | Total cost | Points |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `GC-T1-01` | `DAWN` | 0 | 2 | 1 | 0 | 0 | 3 | 0 |
| `GC-T1-02` | `DAWN` | 1 | 0 | 2 | 1 | 0 | 4 | 0 |
| `GC-T1-03` | `DAWN` | 2 | 0 | 1 | 0 | 2 | 5 | 1 |
| `GC-T1-04` | `TIDE` | 0 | 0 | 2 | 1 | 0 | 3 | 0 |
| `GC-T1-05` | `TIDE` | 0 | 1 | 0 | 2 | 1 | 4 | 0 |
| `GC-T1-06` | `TIDE` | 2 | 2 | 0 | 1 | 0 | 5 | 1 |
| `GC-T1-07` | `GROVE` | 0 | 0 | 0 | 2 | 1 | 3 | 0 |
| `GC-T1-08` | `GROVE` | 1 | 0 | 1 | 0 | 2 | 4 | 0 |
| `GC-T1-09` | `GROVE` | 0 | 2 | 2 | 0 | 1 | 5 | 1 |
| `GC-T1-10` | `EMBER` | 1 | 0 | 0 | 0 | 2 | 3 | 0 |
| `GC-T1-11` | `EMBER` | 2 | 1 | 0 | 1 | 0 | 4 | 0 |
| `GC-T1-12` | `EMBER` | 1 | 0 | 2 | 2 | 0 | 5 | 1 |
| `GC-T1-13` | `ECHO` | 2 | 1 | 0 | 0 | 0 | 3 | 0 |
| `GC-T1-14` | `ECHO` | 0 | 2 | 1 | 0 | 1 | 4 | 0 |
| `GC-T1-15` | `ECHO` | 0 | 1 | 0 | 2 | 2 | 5 | 1 |

## 4. TIER_2 — 15 cards

| Card ID | Production | DAWN | TIDE | GROVE | EMBER | ECHO | Total cost | Points |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `GC-T2-01` | `DAWN` | 0 | 2 | 0 | 2 | 1 | 5 | 1 |
| `GC-T2-02` | `DAWN` | 2 | 0 | 3 | 0 | 2 | 7 | 2 |
| `GC-T2-03` | `DAWN` | 1 | 2 | 1 | 3 | 1 | 8 | 3 |
| `GC-T2-04` | `TIDE` | 1 | 0 | 2 | 0 | 2 | 5 | 1 |
| `GC-T2-05` | `TIDE` | 2 | 2 | 0 | 3 | 0 | 7 | 2 |
| `GC-T2-06` | `TIDE` | 1 | 1 | 2 | 1 | 3 | 8 | 3 |
| `GC-T2-07` | `GROVE` | 2 | 1 | 0 | 2 | 0 | 5 | 1 |
| `GC-T2-08` | `GROVE` | 0 | 2 | 2 | 0 | 3 | 7 | 2 |
| `GC-T2-09` | `GROVE` | 3 | 1 | 1 | 2 | 1 | 8 | 3 |
| `GC-T2-10` | `EMBER` | 0 | 2 | 1 | 0 | 2 | 5 | 1 |
| `GC-T2-11` | `EMBER` | 3 | 0 | 2 | 2 | 0 | 7 | 2 |
| `GC-T2-12` | `EMBER` | 1 | 3 | 1 | 1 | 2 | 8 | 3 |
| `GC-T2-13` | `ECHO` | 2 | 0 | 2 | 1 | 0 | 5 | 1 |
| `GC-T2-14` | `ECHO` | 0 | 3 | 0 | 2 | 2 | 7 | 2 |
| `GC-T2-15` | `ECHO` | 2 | 1 | 3 | 1 | 1 | 8 | 3 |

## 5. TIER_3 — 15 cards

| Card ID | Production | DAWN | TIDE | GROVE | EMBER | ECHO | Total cost | Points |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `GC-T3-01` | `DAWN` | 0 | 3 | 2 | 0 | 3 | 8 | 3 |
| `GC-T3-02` | `DAWN` | 3 | 0 | 3 | 2 | 2 | 10 | 4 |
| `GC-T3-03` | `DAWN` | 1 | 4 | 1 | 4 | 1 | 11 | 5 |
| `GC-T3-04` | `TIDE` | 3 | 0 | 3 | 2 | 0 | 8 | 3 |
| `GC-T3-05` | `TIDE` | 2 | 3 | 0 | 3 | 2 | 10 | 4 |
| `GC-T3-06` | `TIDE` | 1 | 1 | 4 | 1 | 4 | 11 | 5 |
| `GC-T3-07` | `GROVE` | 0 | 3 | 0 | 3 | 2 | 8 | 3 |
| `GC-T3-08` | `GROVE` | 2 | 2 | 3 | 0 | 3 | 10 | 4 |
| `GC-T3-09` | `GROVE` | 4 | 1 | 1 | 4 | 1 | 11 | 5 |
| `GC-T3-10` | `EMBER` | 2 | 0 | 3 | 0 | 3 | 8 | 3 |
| `GC-T3-11` | `EMBER` | 3 | 2 | 2 | 3 | 0 | 10 | 4 |
| `GC-T3-12` | `EMBER` | 1 | 4 | 1 | 1 | 4 | 11 | 5 |
| `GC-T3-13` | `ECHO` | 3 | 2 | 0 | 3 | 0 | 8 | 3 |
| `GC-T3-14` | `ECHO` | 0 | 3 | 2 | 2 | 3 | 10 | 4 |
| `GC-T3-15` | `ECHO` | 4 | 1 | 4 | 1 | 1 | 11 | 5 |

## 6. Static audit — tier ranges and averages

| Tier | Cards | Total-cost min | Total-cost average | Total-cost max | Points min | Points average | Points max | Tier VP | Self-cost > 0 | Self-cost = 0 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `TIER_1` | 15 | 3 | 4.00 | 5 | 0 | 0.33 | 1 | 5 | 10 | 5 |
| `TIER_2` | 15 | 5 | 6.67 | 8 | 1 | 2.00 | 3 | 30 | 10 | 5 |
| `TIER_3` | 15 | 8 | 9.67 | 11 | 3 | 4.00 | 5 | 60 | 10 | 5 |
| **All** | **45** | **3** | **6.78** | **11** | **0** | **2.11** | **5** | **95** | **30** | **15** |

`All` average total cost는 `305 / 45 = 6.777...`, average points는 `95 / 45 = 2.111...`를 소수 둘째 자리로 반올림했다.

## 7. Static audit — resource demand and production

각 `Demand`는 해당 범위의 모든 printed costs 합이고, `Production`은 그 resource를 permanent production type으로 제공하는 card 수다.

| Scope | DAWN demand | TIDE demand | GROVE demand | EMBER demand | ECHO demand | Demand total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `TIER_1` | 12 | 12 | 12 | 12 | 12 | 60 |
| `TIER_2` | 20 | 20 | 20 | 20 | 20 | 100 |
| `TIER_3` | 29 | 29 | 29 | 29 | 29 | 145 |
| **All** | **61** | **61** | **61** | **61** | **61** | **305** |

| Scope | DAWN production | TIDE production | GROVE production | EMBER production | ECHO production | Production total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `TIER_1` | 3 | 3 | 3 | 3 | 3 | 15 |
| `TIER_2` | 3 | 3 | 3 | 3 | 3 | 15 |
| `TIER_3` | 3 | 3 | 3 | 3 | 3 | 15 |
| **All** | **9** | **9** | **9** | **9** | **9** | **45** |

`PRISM` printed demand는 모든 tier와 전체에서 **0**이다. `PRISM`은 confirmed rules에 따라 held wild resource일 뿐 card cost dimension이 아니다.

## 8. Static audit — point distribution

| Scope | 0-point | 1-point | 2-point | 3-point | 4-point | 5-point | Total cards | Total VP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `TIER_1` | 10 | 5 | 0 | 0 | 0 | 0 | 15 | 5 |
| `TIER_2` | 0 | 5 | 5 | 5 | 0 | 0 | 15 | 30 |
| `TIER_3` | 0 | 0 | 0 | 5 | 5 | 5 | 15 | 60 |
| **All** | **10** | **10** | **5** | **10** | **5** | **5** | **45** | **95** |

Target 18에 대해 전체 deck은 95 VP를 제공한다. 이는 4명의 target 합계 72보다 크고, 한 player가 `5 + 5 + 5 + 3 = 18`처럼 threshold에 도달할 수 있는 point 조합도 존재한다. 이 검사는 dataset이 점수 총량 때문에 target 도달을 구조적으로 막지 않는다는 static sufficiency만 뜻한다. 실제 획득 가능성, game length와 승률 balance는 P11 simulation과 playtest로 검증한다.

## 9. Static audit — identity, uniqueness and shape

| Check | Result |
| --- | --- |
| Card rows | 45 / 45 |
| Unique card IDs | 45 / 45 |
| Cards per tier | 15 / 15 / 15 |
| Production count per resource per tier | 모두 정확히 3 |
| Duplicate `cost vector + production + points` within a tier | 0 |
| Printed-cost dimensions | 다섯 basic resources only |
| Printed `PRISM` cost | 0 on every card |
| Tier cost/point bounds | 45 / 45 valid |
| Self-cost diversity | 각 tier 10장 포함, 5장 미포함 |
| Resource printed-demand balance | 각 tier와 전체에서 다섯 resource exact equal |
| Special abilities/card names/flavor/art | 없음 |

## 10. Balance boundary and P11 gate

이 static audit은 arithmetic, shape, uniqueness와 symmetry를 검증한다. 다음은 아직 검증하지 않았으며 public release 전에 별도 evidence가 필요하다.

- 2/3/4인 실제 game length와 target-18 도달 turn 분포
- collect 최대 2개, supply basic 각 7/`PRISM` 5와 cost curve의 상호작용
- permanent discount가 tier progression과 resource scarcity에 미치는 영향
- market 3-slot, reserve 2장과 deck exhaustion 빈도
- Production self-cost 포함/미포함 카드의 상대 가치
- First-player advantage와 fair-round 결과 분포
- Card별 purchase rate, dead-card rate와 resource별 effective demand

P11A는 이 문서를 immutable seed input으로 옮기면서 동일 제약을 검사하는 domain test를 작성해야 한다. P11B/public enablement 전에는 `gem-rules-v1`, `gem-cardset-v1`, card rows와 provenance를 함께 검증해야 한다. Balance 조정이 필요하면 기존 `gem-cardset-v1`을 조용히 바꾸지 않고 새 version과 변경 근거를 기록한다.

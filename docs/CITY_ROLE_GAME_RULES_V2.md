# CITY_ROLE — Landmark 승인 규칙 v2

`city-rules-v2` / `city-cardset-v2` / `city-roles-v1` · 사용자 최종 승인

2026-09-09 추가 승인: 새 게임의 `city-draft-v2` 2인 비공개 선택·버리기 규칙은 [별도 승인 명세](./CITY_ROLE_SECRET_DRAFT_AND_FEEDBACK.md)를 따른다. 이 변경은 아래 명소 능력을 바꾸지 않으며 draft 버전이 없는 기존 저장판에는 적용하지 않는다.

2026-09-09 공개 제거 정정: **CR-04 길잡이는 공개 버림 불가, 비공개 버림은 가능**하다. 모든 이후 round setup에 적용하며 현재 저장된 round는 변경하지 않는다. 공개 제거 장수·인원별 선택 방식·역할 능력·명소 버전·wire 형식은 유지한다. 과거 문서의 ‘CR-04 공개 제거 가능’ 결정보다 이번 사용자 승인이 우선한다.

## 적용 범위와 버전

[v1 규칙](./CITY_ROLE_GAME_RULES.md)은 역사적 버전으로 유지한다. 이 문서의 명소 변경을 제외한 CITY-001–070/E01–03, 2–6인 역할 배정, 45/90초, 8건물 round-end latch, 완성 4/2점, 공동순위, forfeited 처리, privacy, reconnect는 그대로다. 교역/시정/문화/수비에는 특수 능력이 없다. LANDMARK category income role도 없다.

새 server start는 v2를 명시하여 생성한다. 저장된 v1은 끝까지 v1이다. 순수 domain factory의 생략 기본값은 기존 v1 호출/fixture 호환용이며 production start는 생략하지 않는다. 저장 데이터의 version string만 바꾸거나 빠진 이력을 자동 생성하지 않는다. v2는 정확히 대응하는 cardset과 플레이어별 history가 필요하고, v1은 해당 필드를 거절한다. Roles는 계속 v1이다.

## 확정 효과

| ID | 명소 / printed cost=VP | 능력 |
| --- | --- | --- |
| LANDMARK-001 A | CB-LAN-01 빗물정원 / 1 | 자기 최초 성공 건설 직후 금화 1 환급. 전액 선지불 필요 |
| LANDMARK-002 A | CB-LAN-02 작은해시계 / 2 | 자기 최초 성공 건설 직후 카드 최대 1장 자동 획득 |
| LANDMARK-003 B | CB-LAN-03 돌물결마당 / 2 | 이 건물에 대한 합법적 CR-08 해체 비용 +1, 따라서 금화 2 |
| LANDMARK-004 B | CB-LAN-04 바람계단 / 4 | 각 round 첫 적격 일반 건설에 자동 금화 1 할인. round당 1, game 전체 최대 3회 |
| LANDMARK-005 A | CB-LAN-05 달그림회랑 / 4 | 종료 다양성 판정에만 빠진 일반 category 최대 1종 보완 |
| LANDMARK-006 A | CB-LAN-06 일곱길기념뜰 / 5 | 종료 시 실제 일반 category 종류마다 +1점, 최대 +4 |

## Atomic build / 카드 순환

기존 인증·revision·deadline·actor·획득·pending·physical ownership·중복 template·건설 한도 검증 후 할인된 금액을 낼 수 있는지 확인한다. 지불, hand→city, 명소 효과, 건설 budget, firstCompletion은 하나의 candidate/commit이다. 실패와 duplicate request replay는 효과·gold·card·history·RNG·revision을 다시 소비하지 않는다. 환급으로 최초 지불 자격을 얻을 수 없다.

작은해시계는 기존 deck top부터 최대 1장을 받는다. Deck이 비고 discard가 있으면 기존 server entropy로 정확한 discard만 shuffle한다. 둘 다 비면 0장으로 성공하고 일회 기회는 소비한다. Choice/pending/deadline을 추가하지 않는다. 자동 draw exact 카드는 자기 hand에만 공개되고, 타인은 hand count만 본다. 실제 cardId와 60장 zone conservation을 유지한다.

## Lifetime / 파괴 / 재건설

예산은 `(gameId, playerId, templateId)` 단위다. 다른 physical copy를 지어도 초기화하지 않는다. Garden/sundial 최초 건설 이력은 파괴·재건설·손패 교환·새 round·resume 이후에도 유지한다. 다른 player는 자기 예산을 갖는다.

Staircase 최초 건설에만 remaining=3으로 초기화한다. 일반 건물의 printed cost≥2이고 실제 city에 staircase가 있으며 이번 round에 미사용이면 자동 적용한다. Printed cost1 또는 LANDMARK에는 적용도 소비도 없다. 실제 지불 최소1. CR-07이 staircase를 먼저 지은 뒤 일반 건물을 지으면 그 round의 첫 적격 건설에 적용되지만 나머지 건설에는 미적용이다.

파괴/forfeit하면 staircase remaining을 0으로 만들고 initialized/spent/lastDiscountRound는 유지한다. 재건설로 충전되지 않는다. Garden/sundial 이미 받은 보상은 소급 회수하지 않는다. Stone passive와 종료 시점의 moon/seventh 효과는 건물이 실제 city에 있고 owner가 non-forfeited인 동안만 적용한다. 파괴된 scoring building을 다시 지으면 실제 보유 조건은 다시 만족할 수 있지만 단발 보상을 만들지는 않는다.

## 해체와 기존 역할

CR-08의 actor/능력/대상, completed city(8개 이상), CR-05 protection을 먼저 유지한다. 적법한 돌물결마당만 `max(0,printedCost−1)+1`로 계산한다. 비용 부족이나 보호 대상 요청은 gold·ability·history·revision을 소비하지 않는다. 명소 전체 면역이나 다른 도시 보호를 추가하지 않는다.

## 종료 점수

`printed buildingVP + completionBonus + diversityBonus + landmarkBonus`.

- Diversity는 기본 +3을 한 번만 준다. 실제 5분류면 +3. 달그림회랑이 있고 실제 일반 분류가 3종이면 빠진 1종을 보완하여 +3. 실제 일반 분류가 2종 이하면 보완해도 실패한다.
- 일반 category는 CIVIC/CULTURE/TRADE/GUARD다. Virtual category는 선택하거나 저장하지 않으며, category income/실제 building/다른 명소 계산에 사용하지 않는다.
- 일곱길기념뜰의 `landmarkBonus`는 실제 일반 category 수 0..4다. 같은 category 건물 여러 장을 세지 않는다.
- 달그림회랑+일곱길기념뜰+일반 3종: 다양성3+명소3=6. 일반4종: 다양성3+명소4=7. 기본 다양성은 중복 지급하지 않는다.
- Forfeited는 frozen printed VP만: completion/diversity/landmark bonus 모두 0. 기존 순위/승자 우선순위는 유지한다.
- Public scorePreview는 계속 printed VP다. 특수점수는 종료 결과의 별도 landmarkBonus로 표시한다.

## 저장과 공개 계약

V2 `landmarkHistory[]`: playerId, gardenUsed, sundialUsed, staircaseInitialized, staircaseRemaining, staircaseSpent, lastDiscountRound. Canonical roster 순서, remaining+spent≤3, 미초기화 예산0, spent/lastRound 일치, lastRound≤현재round, 파괴/forfeit 잔여0을 검증한다. Clone/adapter는 detached frozen 이력을 보존한다.

이력은 공개된 건설의 이력이므로 참가자에게 공개한다. Deck, discard 순서, RNG, 다른 hand/role/mark, credentials, offline streak는 추가 공개하지 않는다. Card inventory와 공개 card shape는 같고, rules/cardset 버전이 능력 해석을 구분한다.

기존 7개 concrete CITY events와 protocolVersion, Snapshot V2 shell은 유지한다. CITY projection branch만 v1/v2 version correlation + public history + v2 결과 landmarkBonus를 확장한다. 기존 배포 Web은 v2 literal/schema를 지원하지 않으므로 디코드 실패 시 행동할 수 없으며 refresh가 필요하다. 같은 GameType 광고가 rules-v2 이해를 증명한다는 가정은 하지 않는다. 서버/웹 동시 배포 필요; 이번 작업에서는 Railway 배포하지 않는다.

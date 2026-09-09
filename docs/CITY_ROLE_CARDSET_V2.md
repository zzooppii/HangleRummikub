# CITY_ROLE cardset v2

`city-cardset-v2`는 [v1 inventory](./CITY_ROLE_CARDSET_V1.md)의 §3에 있는 30 templates / 60 physical cards, 이름, ID, 비용, VP, 매수를 그대로 유지한다. 의미 변경은 아래 LANDMARK 능력 여섯 개뿐이다. [v2 규칙](./CITY_ROLE_GAME_RULES_V2.md)이 효과 authority다. v1 catalog/저장 기록에 이 의미를 소급 적용하지 않는다.

| Template | 이름 | Category | Cost | VP | Copies | v2 능력 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| CB-LAN-01 | 빗물정원 | LANDMARK | 1 | 1 | 2 | 최초 건설 환급1 |
| CB-LAN-02 | 작은해시계 | LANDMARK | 2 | 2 | 2 | 최초 건설 자동 draw≤1 |
| CB-LAN-03 | 돌물결마당 | LANDMARK | 2 | 2 | 2 | 자기 해체 비용+1 |
| CB-LAN-04 | 바람계단 | LANDMARK | 4 | 4 | 2 | 일반 건설−1/round, lifetime3 |
| CB-LAN-05 | 달그림회랑 | LANDMARK | 4 | 4 | 2 | 다양성 전용 일반 category1 보완 |
| CB-LAN-06 | 일곱길기념뜰 | LANDMARK | 5 | 5 | 2 | 실제 일반 category마다 종료+1,max4 |

Category마다12장, printedVP36; 전체60장/180VP. Cost=VP, cost1..6의 매수12/14/10/12/10/2 유지. General48장에는 능력이 없다. Duplicate template city 제한, opaque physical ID와 deck/hand/pending/city/discard conservation은 동일하다. Runtime base inventory는 `cardset-v1.ts`의 불변 물리 데이터셋을 재사용하고, v2 해석은 `landmarks-v2.ts` 및 version-gated rule/result engine이 소유한다. 데이터 중복 복사나 v1 row 수정은 하지 않는다.

이름/문구/아이콘/그림은 기존 자체 제작 provenance를 유지하며 새 외부 asset, 공식 카드 문구 또는 published deck 복사는 없다.

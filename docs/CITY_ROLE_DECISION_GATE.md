# CITY_ROLE — P14A 사용자 decision gate

> 2026-09-08 · P14A COMPLETE · **CITY-001–070 선택 모두 CONFIRMED**
> **P14B COMPLETE / DOMAIN READY**. 70개 선택과 E01–03을 보존하고 Classic 원문 대조·exact60-card 사용자 승인·final consistency gate를 완료했다. Runtime 구현은 별도 단계다.

## 1. 읽는 방법 / 승인 경계

2026-09-09 후속 사용자 승인: CITY-007의 공개 제거 예외를 정정하여 **CR-04 길잡이를 공개 버림 후보에서 제외**한다. 비공개 제거는 가능하며, 다음 round setup부터 적용한다. 아래 P14A 선택 이력은 보존하되 이 사항의 현재 규칙은 [승인 규칙 §3](./CITY_ROLE_GAME_RULES.md)을 따른다.

P14A checkpoint는 `d5923c9`, runtime 기준은 `8f8da13`이다. 기존 세 게임과 release tag `three-game-platform-v1 → db0e6c6`는 변경하지 않는다. 아래 Option/추천/이유는 P14A 선택지 history이고 **마지막 열은 이번 사용자 확정값**이다. Classic 원문과 같은 규칙이라는 주장이 아니라 승인된 우리 규칙이다. 공식 자료의 확인 범위와 판본 차이는 [IP/product gate](./CITY_ROLE_IP_PRODUCT_GATE.md)를 따른다.

- 사용자 확정: **001=C, 004=B, 018=B, 019=B, 070=B, 나머지 A**. 70개 모두 누락 없이 선택했다.
- 사용자 일괄 요약의 `002–017 A`와 별도로 반복한 `004=B`, 마지막 강조의 “2~3인 각2roles”를 대조했다. 더 구체적으로 명시한 **004B**를 기록하며 A로 바꾸지 않는다.
- 추천 열의 미승인/후보 표현은 P14A history다. 현재 승인 상태는 마지막 열을 따른다. 개별 option에 없는 세부 의미는 [P14B consistency audit](./CITY_ROLE_P14B_CONSISTENCY_AUDIT.md)에서 분리한다.
- `ALL:A`는 모든 행의 A를 선택한다는 응답 형식이다. `ALL:A; CITY-001=B; CITY-004=B`처럼 예외를 줄 수 있다. D/직접 지정이나 “추후 별도 승인” 선택지는 필요한 세부 값이 채워지기 전 OPEN이다.
- `ALL:A`가 일관성까지 보증하지 않는다. 조건부 행은 적용 여부를 P14B에서 명시하고, 충돌하면 임의 override 없이 사용자에게 돌려준다. N/A도 사용자 선택에 따른 명시적 판정이지 삭제가 아니다.
- §2의 핵심 선택과 §3–6 선택은 모두 확정됐다. 단 exact edge semantics, protocol, dataset의 후속 audit가 남으면 DOMAIN READY로 표시하지 않는다.
- 기존 인증·Host 권한·single-primary·서버 권위·opaque physical card identity·private projection 원칙은 약화할 수 있는 선택지가 아니다. Host는 Lobby 시작만 요청하며 secret choice, RNG, 상대 정보를 조작/열람할 권한을 갖지 않는다.

## 2. 핵심 BLOCKER decisions

| ID | 질문 | Option A | Option B | Option C / D | 추천 / 이유 | Architecture impact | 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CITY-001 | 지원 인원? | 2–4 | 3–6 | C: 2–6 / D: 직접 지정 | **B**: 다인 추론을 우선하고 2인 전용 규칙 부담을 줄임 | 현재 Room/Web/V2 4인 상한의 game별 확장 필요; 기존 H/N/G 상한은 보존 | C / CONFIRMED |
| CITY-002 | 참고 게임과의 거리? | Classic 스타일에 매우 가까운 구조; 수치는 아래 명시 선택으로 결정 | 비밀 역할/도시 건설만 유지하고 일부 구조 변경 | C: 완전 독립 변형 | **A**: 사용자 관심에 가깝되 판본 전체를 자동 수입하지 않음 | A도 원작과 차이표 필요; B/C면 역할·덱 재검토 | A / CONFIRMED |
| CITY-003 | 핵심 턴 loop? | 매 라운드 비밀 draft→역할 순서→기본 획득→능력/건설→종료 | 능력/획득/건설 순서 자유, 획득은 턴 중 정확히 한 번 | C: 획득+건설을 한 atomic 최종 제안으로 제출 | **A**: 서버의 남은 행동/선택 상태가 명료 | staged action과 pendingChoice 모델; C는 다른 UX 계약 | A / CONFIRMED |
| CITY-004 | 인원당 한 라운드 역할 수? | 모든 인원에서 1개 | 2/3인은 2개, 4–6인은 1개 | C: 2인은 제외, 나머지는 1개 | **B**: 소인원에서도 여러 역할을 해석; 공식 소인원 절차 자체를 복제하는 선택은 아님 | 한 player가 여러 role turn을 가질 수 있음; 선택 pass 2회 | B / CONFIRMED |
| CITY-005 | 역할 set 크기/구성? | 고정 8역할, §4의 CR-01–08 능력 후보 | 고정 6역할로 축소; 제외할 2개 별도 지정 | C: 라운드별 가변 roster; 후보/추첨 규칙 별도 승인 | **A**: bounded 순서와 6명까지 선택 여유 | K=역할 수; B는 6명×1 + 제거와 충돌 가능 | A / CONFIRMED |
| CITY-006 | Secret draft 방식? | leader부터 seat 순서로 1개씩; 다역할이면 같은 순서 추가 pass; 선택 간 별도 discard 없음 | 각자 동시 비밀 희망 제출 후 충돌 시 재선택 | C: 각 pick 뒤 별도 비밀 discard를 포함하는 절차를 추가 설계 | **A**: 순차 권한·deadline 하나, 충돌 resolution 없음 | B/C는 별도 pending/충돌·제거 산술 blocker | A / CONFIRMED |
| CITY-007 | 라운드 role 제거/잔여? | K역할, 총 pick M: hidden 1, public max(0,K−M−2), 최종 unselected도 hidden; K≥M+1 필수 | 시작 제거 없음, 선택 후 잔여만 hidden | C: 인원별 public/hidden 제거 수 직접 표로 지정 | **A**: hidden 여유를 두되 제안 산술을 명시 | 공개 제거 먼저 알려지고 나머지 choice는 actor 전용; 균등 server RNG | A / CONFIRMED |
| CITY-008 | 최초 leader/seat order? | server가 seat order 한 번 shuffle, 첫 seat가 leader | registration order에서 server random leader | C: 등록 순서의 첫 player가 leader | **A**: Host 임의 선택 방지 | seatOrder는 participant 순서이며 role resolution과 별개 | A / CONFIRMED |
| CITY-009 | 다음 round leader? | CR-04가 정상 reveal되면 소유자; 미소유/disable이면 incumbent; forfeited leader는 다음 eligible seat | 매 round 다음 eligible seat로 순환 | C: 직전 최저 점수 player, tie는 seat 순 | **A**: 역할 선택에 다음 round 우선권의 의미 | leader는 Host 아님; CR-04 없는 roster면 B/C 재선택 필요 | A / CONFIRMED |
| CITY-010 | Reveal/미보유/disabled role? | order 오름차순 호출; 정상 역할은 actor와 함께 reveal, 미보유/disabled는 동일한 비소유자 공개 skip; disabled 소유는 round end에만 공개 | disabled도 호출 때 owner 공개 후 skip | C: selection 종료 즉시 모든 역할/owner 공개 | **A**: 은닉과 실제 actor 공개의 경계 분명 | empty vs disabled oracle 방지; role reveal/history projection | A / CONFIRMED |
| CITY-011 | Interference 강도? | 역할 봉쇄/자원 이전/파괴까지 허용하는 direct 상호작용 | 봉쇄는 능력만 무효, 자원 이전 상한2, 파괴 대신 1턴 수입 방해 | C: 상대 직접 피해 없음, 경제/건설 중심 | **A**: 사용자 참고 방향; 취향에 따라 B 권장 가능 | 040/041/047–049와 반드시 함께 감사 | A / CONFIRMED |
| CITY-012 | 은닉 상태의 능력 target? | roleId만 지목, 소유자 존재 여부로 입력 reject하지 않음 | public playerId만 지목 | C: 능력마다 role/player를 별도 지정 | **A**: 추론 플레이 및 secret ownership 보호 | role-target와 공개 city target을 구분; 후자는 047 | A / CONFIRMED |
| CITY-013 | 기본 건설 한도/필수성? | 자기 role turn마다 최대1, 선택적 | 최대2, 선택적 | C: round 전체 최대1, 선택적 | **A**: 명료한 budget; extra build는 046만 | multi-role일 때 turn budget과 round budget 구분 | A / CONFIRMED |
| CITY-014 | 완성 threshold? | public 건물 8개 | 7개 | C: 인원별 값 직접 지정 | **A**: 충분한 도시 발전을 보는 시작 제안; playtest 필요 | CITY 전용 finish 조건; 다른 게임 18점/랙과 무관 | A / CONFIRMED |
| CITY-015 | 종료 시점/파괴 후 취소? | 최초 threshold commit에 latch, current round 끝까지; 이후 감소해도 latch/first achiever 유지 | threshold 즉시 종료 | C: round end에 현재 threshold 충족자가 있어야 종료 | **A**: 남은 role 행동 보장, 명확한 trigger history | A는 firstCompletion player/round 기록, C는 반복·보너스 재정의 | A / CONFIRMED |
| CITY-016 | 보너스 점수 패키지? | 최종 도시 VP + 최초 달성자4 + 그 외 최종 threshold 도시2 + 모든 category 보유3; completion 보너스는 중복 안 됨 | 도시 VP만, 보너스 없음 | C: first/complete/diversity 수치 직접 지정 | **A**: 건설 속도/다양성의 동기를 명시; 수치 미승인 | first 권리 latch vs 나머지 최종상태; 특수 VP는 035 | A / CONFIRMED |
| CITY-017 | 동점/ranking? | 점수 내림차순 공동승리·competition rank | 점수→잔여 gold→seat order로 단독순위 | C: 점수→건물 수, 끝까지 동점이면 공유 | **A**: 추측한 tie-break 없이 설명 가능 | forfeited subgroup은 065; GenericResult 금지 | A / CONFIRMED |
| CITY-018 | 매 role pick 제한? | 30초 | 45초 | C: 60초 | **B**: 첫 플레이에 역할 읽을 시간 | selection deadline은 각 pick 시작 server Clock | B / CONFIRMED |
| CITY-019 | 각 role action 제한? | 60초 | 90초 | C: 120초 | **B**: 건설/능력/대상 판단 시간 | 중간 command/guide/refresh로 deadline 연장하지 않음 | B / CONFIRMED |
| CITY-020 | Selection timeout? | available role 중 server uniform random 선택 | stable role order 첫 available 선택 | C: 해당 pick 상실, role 없이 다음 pick / D: 즉시 game forfeit | **A**: 강제선택 편향 줄임; RNG/order server-only | auto-choice도 1회 canonical commit; 007/004/024와 감사 | A / CONFIRMED |
| CITY-021 | Action timeout? | 미획득이면 기본 gold 받고, pending은055로 완료, optional 능력/건설 생략 후 종료 | 미획득 수입 없이, pending은055로 완료 후 종료 | C: 즉시 forfeit; 055의 keep를 먼저 하지 않고067 자산 청산 적용 | **A**: 진행이 멈추지 않고 필수 acquisition 결정 가능 | timeout은 CITY 정책; 기존 N/G no-action 복사 아님 | A / CONFIRMED |
| CITY-022 | Offline timeout streak? | pick/action 합산 3연속; 연결된 timeout은 증가·리셋 없음; 성공 resume만0 | pick/action 각각 3연속; 성공 resume가 둘 다0 | C: auto-choice/advance만, timeout forfeit 없음 | **A**: 하나의 게임 전용 tracker; 3회차 정상 timeout 처리 후 forfeit | callback 순간 authoritative presence, connected 상태와 역할 자격 분리 | A / CONFIRMED |
| CITY-023 | PLAYING leave 자산? | 즉시 forfeit; gold 은행 반환, 손패/미선택 후보는 비공개 discard, city는 frozen | 즉시 forfeit; gold/hand/city 전부 frozen | C: round 종료 때 forfeit하고 그때 A 처리 | **A**: 남은 deck/currency 순환; 데이터는 공개하지 않음 | Room/session removal + game plan atomic UoW; raw disconnect와 구분 | A / CONFIRMED |
| CITY-024 | Leave의 role/pick/leader? | 미선택 pick skip, 이미 선택한 role은 round 끝까지 hidden tombstone·재공급 안 함; leader는 다음 eligible | 이미 선택한 role을 pool에 반환하되 누구 것인지 숨김 | C: selection 전체 재시작 (이미 본 정보 지울 수 없음) | **A**: 알게 된 정보로 다시 draft하는 exploit 방지 | actor 이전/timeout cancel, 처음 정한 제거 수 mid-round 재계산 안 함 | A / CONFIRMED |
| CITY-025 | Eligible player 1/0명? | 1명 즉시 last-survivor winner, 0명 no-winner 종료; round-end보다 우선 | 항상 round 끝에 최종 점수 | C: 1명도 no-winner 중단 | **A**: stall 없는 명시적 terminal edge | 최소 시작 인원 미달이어도 2명 남으면 플레이 계속; 0/1 처리 선행 | A / CONFIRMED |

## 3. Economy / building content decisions

| ID | 질문 | Option A | Option B | Option C | 추천 / 이유 | Architecture impact | 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CITY-026 | Working identity/title? | CITY_ROLE / 비밀 도시 게임 | CITY_ROLE / 도시의 역할 | 별도 neutral ID/title 제안 | **A**: 독립 임시명; trademark clearance 의미 아님 | 지금은 문서만; public label과 stable ID 분리 | A / CONFIRMED |
| CITY-027 | 초기 gold/손패? | gold2, 카드4 | gold3, 카드3 | 두 수치 직접 지정 | **A**: 기본 acquisition과 함께 평가할 초안 | deal 순서/RNG, hand private; 초기 content 생성은 미승인 | A / CONFIRMED |
| CITY-028 | Gold visibility/cap/bank? | exact public, gameplay cap 없음, 무한 추상 bank | exact self-only/상대 비공개, cap 없음, 무한 bank | public exact, player cap20, 무한 bank | **A**: 공격/지불 이해 쉬움 | 안전 정수 validation은 별개; bank 실제 token 개수 모델 불필요 | A / CONFIRMED |
| CITY-029 | 기본 획득? | gold2 OR draw/choose, role turn당 정확히1회 | gold3 OR draw/choose | 매번 gold1 + 카드1 | **A**: 선택의 trade-off 명료 | 003/021/030/046과 budget 일치 | A / CONFIRMED |
| CITY-030 | Draw/choose 수량·남은 카드? | 최대2장 보고1장 보유, 나머지 비공개 deck bottom | 최대3장 보고1장 보유, 나머지 비공개 discard | 1장 즉시 hand로, choose 없음 | **A**: 작은 private pending choice | 부족하면 가능한 만큼; 0장 path031; 반환 순서는055 | A / CONFIRMED |
| CITY-031 | Deck 소진? | draw 필요 시 discard server shuffle 재사용; 둘 다0이면 draw reject, gold 선택 가능 | reshuffle 없음;0장일 때 draw reject | 0장 draw는 gold2로 자동 대체 | **A**: 유한 physical cards 보존; 보이지 않는 순서 | preflight legal draw 여부/atomic RNG; deck empty 단독 terminal 아님 | A / CONFIRMED |
| CITY-032 | 손패 한도? | gameplay limit 없음 | max7; acquisition 완료 전 초과분 선택 discard | max10; 초과 acquisition 전체 reject | **A**: forced discard substate를 추가하지 않음 | B면 055에 forced discard timeout 필요; finite deck가 상한 | A / CONFIRMED |
| CITY-033 | Building cost/VP/identity? | printed cost=VP, cost1–6; physical cardId와 templateId 분리 | cost/VP 독립; 각각 범위 별도 승인 | 기본 cost=VP, 일부 자체 예외 카드 | **A**: score/readability 단순 | 같은 template physical copies는 다른 cardId; special bonus035 | A / CONFIRMED |
| CITY-034 | Category 체계? | 5종: CIVIC/CULTURE/TRADE/GUARD/LANDMARK 임시ID | 4종, LANDMARK 제외 | 종류/이름 직접 지정 | **A**: 4 income category + 별도 landmark 후보 | UI색/그림과 domain ID 분리, diversity016와연결 | A / CONFIRMED |
| CITY-035 | Special building? | v1은 능력 없음, category와 cost/VP만 | original special set 최대5종, 효과별 별도 사용자 승인 | 모든 building에 특수효과 | **A**: role 복잡성을 먼저 검증 | B/C는 P14B에서 정확한 timing/target/stack/VP row 승인 전 blocker | A / CONFIRMED |
| CITY-036 | Template 중복 건설? | deck copies 허용, 한 city 안 같은 template 중복 금지 | city 안 최대2 copies | template 중복 제한 없음 | **A**: physical copy와 gameplay 이름 구별 | 카드 title 문자열 아닌 templateId로 legality | A / CONFIRMED |
| CITY-037 | Original deck 설계 권한/규모? | block decisions 확정 후 Codex가 60장 original deck 초안 작성: 5category×12, exact분포 별도 audit 승인 | 80장:5×16, 같은 독립 설계/승인 절차 | 사용자가 자체 dataset 제공 | **A**: 이번에는 카드 row를 만들지 않음 | 034B면 category×count 다시 승인; 공식 deck table 복사 금지 | A / CONFIRMED |
| CITY-038 | City size 최대? | 별도 cap 없음; threshold는 finish trigger일 뿐 | threshold 개수까지만 건설 | threshold+2 cap | **A**: pending round/extra build 일관성 | 013/014/015/046 경계 테스트 필요 | A / CONFIRMED |

## 4. 역할 능력과 timing — 모두 candidate

고정8종 A를 고른 경우만 적용한다. `CR-01`…`CR-08`은 문서용 stable 후보이지 공식 character 이름의 production 복제가 아니다. 능력의 정확한 처리 순서/targets/비용/수치는 아래 선택으로 확정해야 한다. 011B/C를 선택하면 공격 행의 A가 자동 적용되지 않는다.

| ID | 질문 | Option A | Option B | Option C | 추천 / 이유 | Architecture impact | 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CITY-039 | 공통 능력 timing/횟수? | 각 능력 once/role turn; optional은 획득 후 건설 전·후 가능, 필수 시작효과는 별도; pending 중 다른 행동 불가 | 모든 optional 능력은 획득 후 건설 전에만 | 역할별 자유 timing 별도 승인 | **A**: 작은 turn budget; 기존 mark의 mandatory resolution/leader/시작bonus는 role entry에서 처리 | 능력별 event table 필요, 임의 callback metadata framework 불필요 | A / CONFIRMED |
| CITY-040 | CR-01 ‘가림꾼’ 봉쇄? | 자기보다 높은 role 하나를 mark, 해당 role turn 전체 skip | 능력만 무효, 기본 획득/건설 허용 | 상대 피해 없이 카드1 추가 | **A**: role 기반 예측; 011A 조건 | mark는 owner 비존재에도 valid; skip reveal010, round 범위 | A / CONFIRMED |
| CITY-041 | CR-02 ‘징수꾼’ 자원 이전? | 높은 role 하나 mark, 정상 reveal 직후·시작 수입 전 그 owner gold 전부 이전 | 동일 trigger 최대2 이전 | 자기 gold1 증가 | **A**: direct 상호작용 선택 시만 | 피해자 gold source는 그 순간; 자기 소유/absent/disabled면 no-op. 비밀 봉쇄 여부로 입력을 reject하지 않음 | A / CONFIRMED |
| CITY-042 | CR-03 ‘교환꾼’ 카드 manipulation? | 다른 eligible player와 손패 전체 교환 OR 자기 임의 카드 discard 후 같은 수 draw; 둘 중1회 | 자기 카드 교환만 최대2장 | 능력 없음 | **A**: 손패 선택 게임의 상호작용 | swap는 private atomic, own exchange는 공급 부족하면 전체 reject; pendingchoice아님 | A / CONFIRMED |
| CITY-043 | CR-04 ‘길잡이’ leader/bonus? | 정상 reveal 시 leader 획득 + CIVIC 건물당 gold1 | leader만 | CIVIC당 gold1만, leader는009B | **A**: 우선권이 role에 연결 | mandatory 시작효과; 건설 전 city를 읽어 지급 | A / CONFIRMED |
| CITY-044 | CR-05 ‘수호꾼’ protection? | 정상 reveal 시 CULTURE당 gold1; 이 역할을 가진 player의 city 파괴 금지(역할이 봉쇄되면 보호 없음) | category 수입만 | 보호만 | **A**: direct 파괴와 counterplay | 파괴 role보다 앞서 reveal되므로 비밀보호 oracle 피함; 047 timing연결 | A / CONFIRMED |
| CITY-045 | CR-06 ‘장터지기’ income? | 정상 reveal 시 TRADE당 gold1 + 기본 획득 완료 뒤 gold1 | TRADE당 gold1만 | 기본 획득 gold 보상만 +1 | **A**: category와 action 결과를 구별 | mandatory 획득후효과 once, draw선택도 +1; timeout021와연결 | A / CONFIRMED |
| CITY-046 | CR-07 ‘설계꾼’ extra build? | 정상 reveal 때 카드 최대2장 즉시 추가; 그 role turn 최대3개 건설 | 추가카드1, 최대2건설 | 추가카드 없이 최대3건설 | **A**: multi-build turn을 명시 | bonus draw는 choose 없음, 덱부족은031로가능한만큼; 013대체(가산아님) | A / CONFIRMED |
| CITY-047 | CR-08 ‘해체꾼’ interference? | GUARD당 gold1 시작수입; optional 다른 eligible city 건물1개, printed cost−1(최소0) 지급해 제거 | GUARD수입; 파괴 없이 상대 gold 최대1 이전 | GUARD수입만 | **A**: direct 상호작용 선택 시만 | 공개 physical cardId 대상, once/role turn; target법은048 | A / CONFIRMED |
| CITY-048 | 파괴 보호/대상? | 현재 threshold 이상 city와 이번 round 정상 reveal된 non-forfeited CR-05 owner를 round 끝까지 보호; 자신의 city/forfeited city 금지 | CR-05만 같은 기간 보호, 완성city도 가능 | 완성city만 보호, CR-05 보호 없음 | **A**: 종료·보호 규칙을 예측 가능하게 | 014/015와 current count vs latched completion 구별; 현재 activeRole일 때만의 보호가 아님 | A / CONFIRMED |
| CITY-049 | 파괴 후 card/score? | 비공개 discard, 공개 city와 VP 즉시 감소; 이미 공개된 카드였다는 지식은 지우지 못함 | 공개 discard, 동일 VP 감소 | game에서 영구 제거 | **A**: deck 재순환 가능 | 031/015/016와 audit; public history와 hidden draw ID 연결 금지 | A / CONFIRMED |

## 5. 정보 / phase / 자동 진행

| ID | 질문 | Option A | Option B | Option C | 추천 / 이유 | Architecture impact | 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CITY-050 | Selected role 공개 시점? | self만 exact, 정상 호출/reveal 후 해당 역할 owner public | selection 완료 때 일괄 공개 | round 끝까지 owner 숨김 | **A**: hidden draft + 공개 action이 일관 | C는 activeActor 공개와 충돌, 별도 익명행동 모델 없으면 blocker | A / CONFIRMED |
| CITY-051 | Role choices/removals 정보? | current chooser만 남은 exact list; public removals는 모두; hidden removals는 아무 client에도 없음 | 모든 player에게 remaining list 공개 | 모든 player에게 모든 removed role 공개 | **A**: choice list 차이가 이전 pick ownership oracle가 되지 않도록 viewer범위 제한 | chooser가 자신의 받은 list에서 추론하는 정보는 의도된 지식 | A / CONFIRMED |
| CITY-052 | Hand/draw 후보 privacy? | self hand exact/others count, pending 후보 exact는 actor만 | others hand count도 비공개 | 손패 모두 공개 | **A**: 도시 공개·손패 비공개 구별 | discarded IDs/deckorder hidden, pending candidate count 공개는055 | A / CONFIRMED |
| CITY-053 | 진행 점수 표시? | public city VP/current public bonuses의 preview, final아님 | 최종 점수만 표시 | 즉시 전체 확정 점수 공개(비밀 bonus 없을 때만) | **A**: 현재 도시 읽기, secret score 노출 방지 | no hidden ability/history로 점수 미리 계산해 leak | A / CONFIRMED |
| CITY-054 | FINISHED secret 공개? | 결과/도시/bonuses만; 손패·미공개 역할 history·hidden removal/deck 계속 hidden | 결과 + 마지막 round role owners만 모두 공개, 손패/deck hidden | 전체 role history와 손패 공개, deck/credential은 hidden | **A**: 최소 disclosure | all0 결과는 private 화면 owner없음; retention동안같은view정책 | A / CONFIRMED |
| CITY-055 | Canonical pending choice timeout/순서? | 후보의 server draw 순서 첫 카드 keep, 나머지는030 행선지로 draw순서 반환; forced discard 필요 시 hand획득순서 마지막부터 | 후보 중 cost최고 keep, tie는draw순서; forced discard는cost최저부터 | timeout이면 전부 discard하고 선택 보상 없음 | **A**: UI에도 자동선택 규칙 안내, 무작위 재추첨 없음 | candidate IDs는 owner만; 다른 player에 pending 종류/actor만, 후보 count/exact 숨김 | A / CONFIRMED |
| CITY-056 | Overall deadline / stall? | overall 없음; 각 pick/action timeout으로 진행, 선택가능성/빈deck 안전처리 | 60분 후 current round 종료 | 20 rounds 후 종료 | **A**: 현재 관심은 phase 진행; 자연 게임 유한성 보장 주장은 안 함 | A는 무한 선택적 build/반복파괴 가능 known risk; B/C면 reason/scoring 추가 승인 | A / CONFIRMED |
| CITY-057 | 같은 browser resume 정책? | 기존 token으로 같은 자리/private pending 복원, 기존 deadline 유지, streak022만 reset | A + 남은 시간 최소10초 재보장 | phase 진행은복원하되 pending 선택 포기/재draw | **A**: reconnect가 시간/정보 exploit이 되지 않음 | B/C는 보안·fairness 재검토, 기존 플랫폼시간정책무단변경금지 | A / CONFIRMED |
| CITY-058 | Snapshot / command 방향? | V2-only + exact CITY subphase branch + concrete city:* | V2-only + 역할별 별도 event 이름 | V1도 지원하는 별도 schema 설계 | **A**: legacyH를 건드리지 않는 최소 방향 | generic game:command는 어느 선택에도 없음 | A / CONFIRMED |
| CITY-059 | Mutation identity? | requestId + gameId/gameRevision + current decision/action token; roundNumber는 설명 정보 | A + roundId/phaseRevision 각각 별도 | revision만, action token 없음 | **A**: 오래된 pick/choice와 ABA 방지, 불필요한 ID계층 없음 | exact token runtime이름/TurnId재사용가능성은 P14B audit | A / CONFIRMED |
| CITY-060 | Multi-step / local state? | reveal/draw는 canonical pendingChoice; client는 highlight/confirm만 | 모든 choice를 한 atomic packet으로 계획(미래 카드는볼수없음) | 역할 기능을 줄여 multi-step을 모두 없앰 | **A**: private draw 후 선택은 서버 상태여야 함 | B는 draw-and-choose와 양립 불가; GenericTurnDraft 금지 | A / CONFIRMED |

## 6. Product / content / remaining rule edges

| ID | 질문 | Option A | Option B | Option C | 추천 / 이유 | Architecture impact | 상태 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CITY-061 | Tutorial/Guide 범위? | first-time tutorial + 다시열기 Guide + phase guidance | Guide와 phase guidance만 | phase guidance만 | **A**: secret draft/역할 전환의 첫플레이 부담 | CITY구체content, server timer pause없음; 기존GEMframework확대안함 | A / CONFIRMED |
| CITY-062 | Original content 제작 방식? | 확정 mechanics 바탕 자체 명칭/문구/아트/UI/덱, 추후 출처 audit | gameplay 변형까지 먼저 설계 후 자체 content | 사용자가 권리 확인된 자체 assets/content 제공 | **A**: 개인친구용 목적에도 표현·데이터 독립성 유지 | 002와별개; 어느선택도공식title/art/prose/UI복제허용아님 | A / CONFIRMED |
| CITY-063 | Version pinning? | city-rules-v1 / city-cardset-v1 / city-roles-v1 개별 conceptual version | 하나의 city-content-v1로 통합 | 실제버전전략 P14B에서별도결정 | **A**: role/deck/rules 변경추적 | runtime representation 미설계, active game version pin 필요 | A / CONFIRMED |
| CITY-064 | Role mark/효과 lifetime·다역할 충돌? | round 단위 mark, round끝clear; skip은 그 role만; self-target 금지 대신 자기소유 표적은 reveal때 no-op; 같은 player의 다른 정상role turn은 유지 | 봉쇄/자원mark를 player의 round전체로확장 | 다역할을지원하지않아충돌제거 | **A**: role actor와 persistent player 분리 | 선택때 hiddenownership검증금지; 자기 **현재 role** target은 order조건으로reject | A / CONFIRMED |
| CITY-065 | Forfeit 점수/효과 대상? | 전원 result포함; eligible 먼저, forfeited 뒤 별도 competition점수; forfeited는completion/diversity bonus0·최종frozen도시VP만; 능력 target에서제외 | forfeited rank없고 표시만 | forfeit를일반점수순위에동일포함 | **A**: winner와탈퇴자명확; 도시보존023연결 | subgroup rank offset은 eligible 인원수, LPS winner는점수보다우선 | A / CONFIRMED |
| CITY-066 | Gold 이전/mandatory effect 처리 순서? | role 호출→disable확인→정상reveal→marked 이전→leader/시작수입·bonusdraw→기본획득→후속bonus→optional/build→end | 정상reveal→시작수입→이전→기본획득→나머지 | 효과별 우선순위표를별도로설계 | **A**: steal이현재턴수입을가져가는지명확 | 한번의entry transition 원자처리, disabled는시작효과도없음 | A / CONFIRMED |
| CITY-067 | Timeout-forfeit 자산 청산? | explicit leave023과 동일하게 처리 | gold/hand/city 전부 frozen, 남은 pending 후보도 별도 frozen zone | gold만 반환, hand/pending/city frozen | **A**: 두 원인이 같은 청산을 쓰는지 명시적으로 승인받음 | 022의 3회차 정상 timeout 처리가 먼저; 021C의 즉시forfeit는 pending default 생략 | A / CONFIRMED |
| CITY-068 | 정확한 reference 판본? | 공식 Classic rulebook을 P14B에서 재열람하고 자체 변경점 비교 | 현재 revised 판본을 선택해 다시 조사·차이표 작성 | 특정 edition 재현을 목표로 하지 않고 이 자체 후보만 검토 | **A**: 002A와 의미 일치; 현재 전문 열람 완료 아님 | A/B는 필요한 primary source 확인 전 edition fidelity 확정 금지 | A / CONFIRMED |
| CITY-069 | 다역할 quota 산정 시점? | 매 round setup의 eligible 인원으로004 적용; 이번 round quota는 고정 | 시작 인원 기준 quota를 게임 끝까지 유지 | 탈퇴 즉시 현재 round quota까지 재계산 | **A**: 다음 round의 실제 참가자 수에 적응 | 4→3명은 다음 round 각2role, 진행 중 leave는 남은 pick만 skip; C는024A와 충돌 | A / CONFIRMED |
| CITY-070 | Role mark의 target 공개? | 사용 직후 target roleId 공개, owner는 공개하지 않음 | 사용 actor만 자기 target을 보고 타인은 효과 resolution 때 허용된 결과만 확인 | target role이 호출될 때 mark roleId 공개 | **B**: 은닉 추론을 유지하며 입력 reject로 mark가 새지 않게 함 | 040/041 입력은 hidden mark/ownership과 독립, 공개 범위는010/050과 함께 감사 | B / CONFIRMED |

## 7. P14B consistency checklist (승인 후에만)

1. **인원/역할 산술:** K=8일 때 A 제거공식은 M=3이면 hidden1/public3/unselected1, M=4면1/2/1, M=5면1/1/1, M=6이면1/0/1이다. 2/3인 다역할 B는 각각 M4/M6. `selected + publicRemoved + hiddenRemoved + unselected = K`가 유지되어야 한다. 동시에소유/중복pick 금지. §2 추천 조합 001B/004B/005A/006A/007A는 산술상 가능하지만 **공식 Classic 소인원 절차와 동일하다고 주장하지 않는다**.
2. 005B(K6) + M6 +007A(hidden1)는 불가능하다. 006B 동시선택 충돌해결, 006C discard 시점·수량, 007C 제거표는 추가 승인 없이 최종화하지 않는다.
3. 009A는 CR-04 필요, 011B/C는 040/041/047/048과 충돌 점검. 보호 role의 정상/disabled 판정은66에서순서고정. 같은player여러role일때mark가player전체를막지않음.
4. 003/029/039/066의 필수 획득·보너스는 중복실행되지 않아야 한다. DRAW가0장인경우031, pending후timeout055, forfeit청산023이 충돌하지 않아야 한다.
5. 032B forced discard가있으면 timeout자동선택 및손패교환 overflow까지명세. 036 template중복과042 hand교환은다른문제; hiddencard존재확인은외부오류로누설하지않음.
6. 014–017/038/048/065: current count vs completion latch, first-completer 이후forfeit, 0/1eligible, 다역할마지막round, extra build후threshold넘김을 예제로검증. 015A +016A는 first권리를유지하되065Aforfeit보너스박탈이우선.
7. 050A/010A +054A: disabled소유는roundend이미공개가된것만유지; 미선택/제거와미공개history는종료한다고새로공개하지않음. 050C +publiccurrentActor는그대로양립불가.
8. 022A: resumed→0; connected timeout은증가도리셋도없음; 3회째는자동timeout전이를먼저적용하고forfeit. 그전terminal이됐으면post-terminalforfeit없음. disconnect자체는drafteligibility변경아님.
9. 023/024: 선택중leave는그player의남은pick제거, tombstone미반환; action중leave는pending먼저청산후역할skip; leaderfallback; 0/1종료선행. Active session/접속 자격은 제거되지만 Room/game의 historical participant roster와 terminal 계산용 frozen record는 보존하는 방향이다. 현재 PLAYING leave도 Room.players를 삭제하지 않는다.
10. 055 deterministic default는유저선택제한시간을대신할뿐새후보재추첨이아님. retry/replay/refresh는동일private pending/시간을반환. 최소1개의timedactor또는terminal/다음round자동전이가있어야함.
11. 056A는server waiting stall을방지하지만 무한한합법턴연속의게임종료까지보장하지않음. 별도round/time/no-progress추가가필요하면사용자승인, 다른game의YIELD가져오기금지.
12. 037 dataset설계는BLOCKER및035를먼저확정한뒤수행한다. 최소/최대인원초기deal, 비용지불가능성, category분포, VP/threshold가능성, duplicate/finitecard보존을감사한다. 현재 60장선택만으로개별row승인완료아님.
13. 067의 timeout-forfeit 자산 정책은023과 같을지 별도 선택이다. 069A의 quota 재계산은 **다음 round setup**에서만 한다. 068의 판본 확인 실패를 기억 기반 보충으로 해결하지 않는다. 070B의 private mark는041 target 입력의 허용/거부로 노출하지 않고 disabled 효과는 no-op한다.

## 8. Handoff — P14A history / P14B current selection

P14A의 추천 응답 예는 `ALL:A; CITY-001=B; CITY-004=B; CITY-018=B; CITY-019=B; CITY-070=B`였다. 사용자는 인원을 **001C(2–6인)**로 확정했고 나머지 위 예외는 유지했다. 2인 draft도 P14B arithmetic에 포함한다.

이후 **P14B — CITY_ROLE final rules / protocol / IP consistency gate**에서 추가 E01–03, 2–6인 draft/8role/scoring/privacy/timeout/leave와 protocol 방향을 감사했다. CLASSIC_REFERENCE_VERIFIED를 유지하며, 사용자가 CITY_ROLE_CARDSET_V1의 exact60장 후보도 최종 승인했다. [Final audit](./CITY_ROLE_P14B_CONSISTENCY_AUDIT.md#12-p14b-final-gate--사용자-cardset-최종-승인-후) 결과는 **P14B COMPLETE / DOMAIN READY**다. 기존70행의 옵션·선택값은 바꾸지 않았다. Runtime domain/schema/asset 구현·legal/release clearance와는 구별하며, 다음은 사용자 별도 요청 후 P15A pure domain 단계다.

# CITY_ROLE — 첨부 Citadels Classic 원문 대조

> P14B · 2026-09-08 · **CLASSIC_REFERENCE_VERIFIED / CONFIRMED CITY RULES UNCHANGED**
> 이 문서는 차이 감사다. Classic으로 규칙을 교체하거나 기존 결정을 재승인·OPEN 처리하는 문서가 아니다.
> **후속 최종 상태:** 사용자 exact60-card 승인 후 P14B COMPLETE / DOMAIN READY. 아래 비교 당시의 deck 승인 대기 이력은 §6의 현재 상태와 구분한다.

## 1. 기준 문서와 확인 범위

사용자가 공식 기준으로 지정한 첨부 `wr01_citadels_classic_rules.pdf`를 사용했다. 표지의 **Citadels Classic**, p16의 **©2016 Windrider Games**, 총16페이지를 확인했다. PDF 전문을 추출하고 16페이지 모두 렌더링하여 본문·표·각주·예시·역할 설명을 직접 대조했다. 아래 페이지는 PDF의 1-based 페이지이며 인쇄된 페이지 번호와 같다.

- 첨부 SHA-256: `278c36693cac249f766015e0e37c4a9647a181a80899027ad93cb8fc5e5af94e`.
- 파일 크기: 5,027,181 bytes. 원본 파일은 수정하지 않았으며 저장소나 production asset에 복제하지 않았다.
- 이전 URL의502/TLS 실패는 당시의 이력이다. 이번 첨부 열람으로 **CITY-068A의 exact reference 접근/대조 gate는 해소**했다. 접근 가능했던 FFG2010은 이번 비교 기준이 아니다.
- 전체 published district별 cost/quantity/card text 목록은 이16페이지에 없다. 삽화의 일부 카드를 전체 deck table로 간주하거나 기억으로 빠진 데이터를 채우지 않았다.
- 비교 대상은 [70 CONFIRMED decisions](./CITY_ROLE_DECISION_GATE.md), [현재 CITY 규칙](./CITY_ROLE_GAME_RULES.md), E01–03 및 [60-card 후보](./CITY_ROLE_CARDSET_V1.md)다. 기존 승인 선택은 001C/004B/018B/019B/070B, 나머지A 그대로다.

**사용자 결정 필요 여부의 의미:** 아래의 `없음 — 승인 유지`는 기존 CONFIRMED 선택을 유지하는 데 다시 승인을 요구하지 않는다는 뜻이다. Classic과 동일하게 바꾸고 싶다면 해당 CITY 선택에 대한 **새 명시적 변경 승인**이 필요하다. 이 비교가 그 승인을 대신하지 않는다. 원문에 없는 항목은 `미명시`라고 쓰며 Classic이 반대 동작을 규정했다고 추정하지 않는다.

## 2. 실제 mechanics / content 차이

| 현재 CITY 규칙 | Classic 공식 규칙 | 차이 | 사용자 결정 필요 여부 |
| --- | --- | --- | --- |
| **001C:** 2–6인 | 기본4–7인, 2/3인 별도 규칙(p4,12–13) | CITY는7인 및 그 마지막 pick 예외를 지원하지 않음 | 없음 — 승인 유지 |
| **008A:** server seat shuffle, 첫 seat가 최초 leader | 최연장자가 최초 crown을 갖고 현재 좌석에서 왼쪽으로 draft(p4,6) | 연령·실제 좌석 대신 server가 최초 순서/leader 결정 | 없음 — 승인 유지 |
| **006/007A, 2인:** hidden1/public2, A B A B 각1pick, 마지막1hidden. 선택 중 추가 discard 없음 | hidden1 후 A가1개선택. 이후 B/A/B는 남은 후보에서 keep1개와 hidden discard1개를 선택(p12) | 같은4개 role 소유지만 공개 정보·선택 후보·상대에게 넘길 role을 버리는 권한이 다름. CITY 공개2 vs Classic 공개0 | 없음 — 승인 유지. 소인원 절차를 동일하다고 표시하지 않음 |
| **007A:** CR-04도 public removal 가능 | King은 public removal 금지; 나오면 다른 role로 교체하고 King을 다시 섞음(p6) | CITY에는 leader role 공개제거 예외 없음. 양쪽 hidden removal 가능성과는 별개 | 없음 — 승인 유지 |
| **009/043A:** CR-04 정상 reveal의 entry에서 즉시 leader 획득 | King은 정상 자기 turn 중 어느 시점에 반드시 crown을 가져옴(p15) | 반드시 얻는다는 점은 같지만 획득 시점을 entry로 고정 | 없음 — 승인 유지 |
| **009/043A:** CR-04 disabled이면 incumbent leader 유지 | King이 killed여도 round end에 역할을 reveal하고 crown을 가져옴(p15) | CITY는 disabled leader의 round-end 상속을 하지 않음 | 없음 — 승인 유지 |
| **010A:** disabled owner는 정상 round end에 공개 | killed role은 호출 때 reveal하지 않고 turn skip(p14). King만 round-end reveal/crown 예외 명시(p15) | 일반 disabled owner 일괄 round-end 공개는 PDF에 명시되지 않음. King 공개만으로 전체 역할 공개 규칙을 추론하지 않음 | 없음 — 승인 유지; 원문 미명시를 동작 반대라고 단정하지 않음 |
| **003/039A:** optional 능력은 기본 획득 후만, 건설 전·사이·후 가능 | 별도 시점이 없으면 자기 turn 중 언제든, 능력당1회(p7,14) | CITY는 획득 전 optional 능력 사용을 허용하지 않음. 예: hand swap 후 기본 draw 대신, 기본 획득 후 swap | 없음 — 승인 유지 |
| **043/044/045/047/066A:** CR-04/05/06/08의 category 수입은 entry에 필수 지급 | 네 category 수입도 optional, turn 중 시점 선택. 건설 후 수입을 택해 새 건물을 포함할 수 있음(p14–15) | CITY는 자동·시작 city 기준. 이번 turn에 지은 건물을 income 계산에 넣을 수 없음 | 없음 — 승인 유지 |
| **045/066A:** CR-06 추가gold1은 기본 획득 완료 후 필수 | Merchant 추가gold1은 기본 획득 종류와 무관. 별도 시점 지정 없이 optional 능력 원칙 적용(p14–15) | CITY는 획득후 자동 지급. 이 PDF를 구판의 획득후 제한과 혼동하지 않음 | 없음 — 승인 유지 |
| **046/066A:** CR-07 최대2장 bonus draw는 entry에 필수 | Architect 추가2장은 기본 획득 종류와 무관. 별도 시점 지정 없이 optional 원칙 적용(p14–15) | CITY는 기본 획득보다 먼저 자동 draw; 공급부족 시 최대수량도 명시 | 없음 — 승인 유지 |
| **070B:** CR-01/02 target은 actor만 알고, 나머지는 resolution의 허용된 결과만 확인 | Assassin/Thief는 target character 이름을 불러 지목(p14) | CITY는 공개 지목이 아니라 private mark. 무효 target의 추가 공개도 없음 | 없음 — 승인 유지 |
| **041A:** 높은 role이면 disabled target 입력도 받고 나중에 no-op | Thief는 Assassin과 killed character를 지목할 수 없음(p14) | Assassin 배제는 높은order 제약으로 공통이지만, killed target은 CITY에서 입력거부하지 않음. 비밀 mark oracle 방지 | 없음 — 승인 유지 |
| **042A:** 자기 교환 카드를 private discard에 넣고 draw. 031A에 따라 discard reshuffle 가능 | Magician 자기 교환 카드는 deck bottom에 넣고 같은 수 draw(p14) | 카드 순환 zone/재등장 시점이 다름. CITY는 고갈 시 방금 버린 카드도 reshuffle에 포함 | 없음 — 승인 유지 |
| **048A:** CR-08은 자기 city 파괴 금지 | Warlord는 자기 city 건물도 파괴 가능(p15) | 대상 범위 축소. 비용−1/완성city 보호는 별도 공통 규칙 | 없음 — 승인 유지 |
| **049A:** 파괴 카드는 private discard; 031A의 고갈 재순환 대상 | 파괴 카드는 뒷면으로 deck bottom(p8예시,15) | 물리적 행선지·다음 draw 순서가 다름 | 없음 — 승인 유지 |
| **014A:** 모든 지원 인원에서8건물 완성 | 기본4–7인은7(p2,10), 2/3인은8(p12). **Classic Variant** 선택 시4–7인도8(p13) | CITY는 기본4–6인7과 다르지만, 공식8건물 선택변형 및2/3인 규칙과 일치 | 없음 — 승인8유지. “Classic은 반드시7”이라고 하지 않음 |
| **017A:** 최고점 공동승리·competition rank, tie-break 없음 | 동점은 마지막 round에서 reveal한 character의 가장 높은 rank를 가진 player 승리(p10) | CITY는 revealed-role tie-break를 적용하지 않음. gold tie-break는 이 PDF 규칙이 아님 | 없음 — 승인 유지 |
| **033–037A:** original60장, 30templates×2, 5category×12, cost=VP1–6, 자체 이름·분포 | 68district cards(p3),5types와 unique effects(p10). 전체 매수/비용별 상세표는 PDF에 없음 | 수량·template/category 분포는 자체 설계. 공식 전체 cost/quantity 분포를 비교완료 또는 복제라고 주장할 근거 없음 | 비교 당시 별도 승인 필요. **이후 exact60장 사용자 최종 승인 완료**(§6) |
| **034/035/016A:** 자체5categories, LANDMARK 포함 모두 ability 없음, 특수VP 없음 | 5types 중 unique district마다 효과, 일부 추가점수/규칙 예외(p10–11) | LANDMARK가 공식 unique 효과를 갖는 것은 아님. 같은5종이라도 경제·다양성/득점 효과는 다름 | 없음 — 능력없는v1 승인 유지. 특수건물 추가하지 않음 |
| **026/062A:** CITY_ROLE/비밀 도시 게임, CR-01–08 자체명·카드/문구/UI/asset 자체 제작 | Citadels Classic과 공식8characters, district 이름·문구·아트·컴포넌트(p1–16) | 독립 제품 표현. 아래 역할 대응은 비교용이며 production 명칭/asset 채택이 아님 | 없음 — 자체 제작 유지; 향후 공개 IP/product review는 별도 |

### 2.1 인원별 draft 산술 대조

`H/P/U`는 초기 hidden/public 제거/마지막 unselected다. Classic 2인의 추가3discard는 H와 별도 열로 구분한다. A는 최초 leader다.

| 인원 | CITY pick 순서 / H·P·U | Classic pick 순서 / H·P·U | 정확한 차이 |
| ---: | --- | --- | --- |
| 2 | A B A B / 1·2·1 / 추가discard0 | A B A B / 1·0·0 / B,A,B 각 hidden discard1 | CITY `4+1+2+1=8`; Classic `4+1+3=8`. 첫 available도 CITY5 vs Classic7 |
| 3 | A B C A B C / 1·0·1 | 동일(p13) | 인원별 산술 동일; 최초leader와 역할능력 차이는 §2 참조 |
| 4 | A B C D / 1·2·1 | 같은 수량(p6) | Classic의 public King 제외 조건만 CITY에 없음 |
| 5 | A B C D E / 1·1·1 | 같은 수량(p6) | Classic의 public King 제외 조건만 CITY에 없음 |
| 6 | A B C D E F / 1·0·1 | 동일(p6) | Public removal0이므로 King public 제외 차이도 이 인원에서는 비활성 |

PDF p6은 public 제거 후 hidden 제거 순서를 명시한다. CITY는 승인된 균등 RNG/role partition과 공개 범위를 정하지만 별도의 단계별 RNG 호출 순서를 canonical rule로 고정하지 않는다. 이 차이를 이유로 새 RNG 절차나 King 예외를 도입하지 않는다.

### 2.2 8-role 비교 coverage

공식 이름은 오직 출처 대조용이다. 모든 CITY role은 CR-ID와 자체 표시명을 유지한다.

| CITY role | PDF 비교 역할 / 페이지 | 같은 핵심 | 차이/명시 부족 |
| --- | --- | --- | --- |
| CR-01 가림꾼 | Assassin /14 | 다른 role turn 전체 skip, 호출시 owner 숨김 | 사용시점·private target·self-owned no-op·roundend 공개 정책 |
| CR-02 징수꾼 | Thief /14 | 정상 reveal 때 현재gold 전부 이전 | 사용시점·private target·killed role 요청 허용 후no-op·self-owned/no-owner 경계 |
| CR-03 교환꾼 | Magician /14 | 전체hand swap OR 자기 일부 교환, 한번 | 획득후만, discard zone, E03의0장 요청 거절 |
| CR-04 길잡이 | King /15 | 다음 draft 우선권, 대응category당1gold | Leader entry 고정, disabled 상속없음, income 필수entry, public removal 허용 |
| CR-05 수호꾼 | Bishop /15 | 대응category당1gold, killed면 보호없음 | Income 필수entry. CITY는 정상reveal 뒤roundend까지·non-forfeited 범위를 정확히 고정 |
| CR-06 장터지기 | Merchant /15 | 대응category당1gold, 획득 종류 무관 extra1 | Income entry 및 extra1 획득후 필수 |
| CR-07 설계꾼 | Architect /15 | Extra2cards, 해당role 최대3건설 | Draw entry 필수, 부족하면최대2; 역할별 budget은 동일 |
| CR-08 해체꾼 | Warlord /15 | 대응category당1gold, 건물1개 cost−1 파괴, 완성city/보호role 보호 | Income entry, 획득후만 파괴, 자기city금지, 파괴discard |

**2/3인 보호 범위의 원문 해석:** p12는 역할 능력이 각자 자기 turn에만 적용된다고 일반적으로 설명하고, p15 Bishop은 이번 round 동안 자기 city 보호라고 명시한다. CITY-048A는 이 일반문구/역할별문구의 적용범위를 자기 구현에 떠넘기지 않고 정상 reveal 이후 round end까지로 이미 확정했다. 원문보다 강한 “모든 보호가 자기 activeRole 동안만”이라는 규칙을 새로 만들지 않는다. Official FAQ로 해당 일반문구의 모든 edge를 따로 확인한 것은 아니다.

## 3. Classic에 exact 규정이 없는 CITY 경계

다음은 차이 범위에 포함하되 “원작은 반대로 처리한다”는 의미가 아니다. 이 PDF는 오프라인 rulebook이며 transport/API·탈퇴·timeout 명세가 아니다.

| 현재 CITY 규칙 | Classic 공식 규칙 | 차이 | 사용자 결정 필요 여부 |
| --- | --- | --- | --- |
| **031/030/046A:** discard reshuffle; 부분공급 draw;0장 draw reject/gold선택; bonus는최대2 | 기본2→1 및 bonus2를 명시(p7,15). 부족·reshuffle의 exact 절차 미명시 | CITY만 고갈/부분공급/오류/재순환 경계를 규정 | 없음 — 승인 유지 |
| **064A:** 자기 다른 role에 mark하면 입력성공·효과no-op; roundend clear | 다른 character 지목,2/3인 각2역할(p12,14). 자기소유 다른역할 no-op 절차 미명시 | CITY의 self/role lifetime 정책을 공식 결론이라고 하지 않음 | 없음 — 승인 유지 |
| **012/040/041A:** hidden owner 존재 여부와 독립된 입력허용; absent/disabled 결과no-op | 실제 owner가 reveal하지 않으면 다음호출(p7); 존재여부검증API는 없음 | 정보탐색을 막는 online validation. killed target의 명시금지는 §2의 실제차이 | 없음 — 승인 유지 |
| **E03:** 자기교환0장 reject, 능력/revision/RNG 소비0 | 자기 손패 임의 수량 교환, 빈hand 전체swap 허용(p14). 0장 request/budget 처리 미명시 | “임의 수량”을 서버0장요청 성공/소비 보장으로 확대하지 않음 | 없음 — 추가 승인 유지 |
| **018B/019B:** pick45초/action90초, server deadline | 해당초수·timer 없음 | Online window 시간과 서버권위는 CITY정책 | 없음 — 승인 유지 |
| **020/021/055A:** random autopick, 미획득gold, pending첫카드keep, optional생략 | Timeout/default 행동 미명시 | CITY전용 진행보장; 미선택 유저 대신 임의건설하지 않음 | 없음 — 승인 유지 |
| **022/057A:** offline합산3회, resume만0, 같은deadline/credential | Presence/session/reconnect 미명시 | 다른 게임의 정책을 가져온 것이 아니라 CITY승인 정책 | 없음 — 승인 유지 |
| **023/024/067/069A:** forfeit 청산, city frozen, role tombstone, 현재quota고정/다음round eligible 재산정 | 탈퇴/forfeit 중round나인원변경 미명시 | Gold/hand/role 보존/반환과 private 청산은 online확장 | 없음 — 승인 유지 |
| **E01:** sourceforfeit 시 미해결 CR-01/02 모두취소 | Sourceforfeit와 mark취소 미명시 | 이미 해결된결과 소급취소없이 미해결만 취소 | 없음 — 추가 승인 유지 |
| **E02:** 현재window완료/terminal확인→forfeit→다음entry/round | Timeout/terminal/forfeit 우선순위 미명시 | Terminal뒤변경금지·quota산정시점 명시 | 없음 — 추가 승인 유지 |
| **025/065/015A:**1명LPS/0명no-winner, forfeitbonus0·별도rank, first권리/trigger보존 | 정상도시완성과score만 설명(p10);forfeit/result미명시 | CITYonline종료·순위확장, 강제로 score승리를적용하지않음 | 없음 — 승인 유지 |
| **050–055/060A:** exact hand/roles/choices는viewer별; pending종류만상대공개, finished도새secret미공개 | 비밀손패/선택·공개gold/count·정상reveal(p4,6–7), 종료후전체secret공개규정없음 | 대체로같은정보핵심을 digital whitelist로강화. 자동전체공개를하지않음 | 없음 — 승인 유지 |
| **053/058/059/063A:** scorepreview, V2/concreteevents/actionId, versionpin | 카드/금화/왕관을 이용한실물진행; protocol/version미명시 | 표시/동기화/재시도/저장계약은CITY플랫폼소유 | 없음 — 승인 유지 |
| **061A:** tutorial+Guide+phase안내, timerpause없음 | Rulebook/referencecards(p3);digital onboarding미명시 | 자체Web UX 요구. Step수를원문으로정하지않음 | 없음 — 승인 유지 |
| **056A:** overall없음, 무한합법round 가능성을knownrisk로명시 | Round완성종료만설명(p10);wall-clock/max-round미명시 | 원문에없는overall/max-round/no-progress를추가하지않음 | 없음 — 승인 유지 |

## 4. 일치 항목과 70개 결정 coverage

| CITY IDs | 직접 확인한 공통 핵심 / 차이 연결 |
| --- | --- |
| 001–010 | 8roles·순차secret draft·ascending resolution·round loop(p4,6–7,12–16)는공통. 인원/최초leader/2인draft/King제거·상속/reveal차이는§2 |
| 011–017 | Role-target봉쇄/자원이전/파괴(p14–15),기본최대1·중복이름금지(p7),roundend종료·4/2/3bonus(p10)공통. 8threshold변형/동점/private target차이는§2 |
| 018–025 | Online timer/timeout/leave/eligible조건은§3. 공식최소인원/소인원지원(p4,12)을midgameforfeit규칙으로자동확장하지않음 |
| 026–038 | Startgold2/hand4(p4),gold/count공개·unlimitedgold/nohandcap(p6),gold2ORdraw2keep1bottom(p7),printedcost=VP(p2,10),samename금지(p7),threshold초과허용(p10)공통. 자체60장/특수효과없음·고갈차이§2–3 |
| 039–049 | 8role별효과coverage는§2.2. 보호·max3build·cost−1의핵심과,optional/timing·행선지·selfcity차이를각각분리 |
| 050–060 | Secret choice/selfhand/publiccity(p4,6–7)공통. Finishedprivacy/pending/서버동기화는§3. Overall종료장치추가없음 |
| 061–070 | 자체제품/버전·다역할/mark·forfeit·quota·private target은§2–3. 068A첨부16페이지확인완료. E01–03도§3에서별도대조 |

Classic 2/3인도 gold와city는player마다하나이며 role마다별도turn을갖는다(p12). CR-07의3건설한도가같은player의다른role에이어지지않는CITY정책도해당예시와일치한다. CR-05 보호는일반능력예산과구분한위주석을따른다. 도시가완성되면그round끝까지행동하고completedcity는파괴할수없다는핵심(p10,15)을유지하므로, CITY의completionlatch/8건물보호도서로충돌하지않는다.

## 5. 대조 직후 P14B consistency gate — deck 승인 전 (history)

1. **Reference:** 첨부전문/표/각주직접확인완료. `CLASSIC_REFERENCE_VERIFIED`이며 구판2010의tie-break/timing을현판으로보고하지않는다.
2. **Approval:** 70CONFIRMED와E01–03 변경0. “Classic에가깝게”는세부CITY승인을덮어쓰는exact복제명령이아니다. 차이는목록화했으며자동수정없음.
3. **Rules/protocol/privacy/timeout/leave:** 현재CITY내부일관성을따로대조한다. Publicrole-target를도입하거나discard를bottom으로바꾸어문제를해결하지않는다. 기존E01/E02/E03와viewer별pending/actionId/동일deadline을유지한다.
4. **Deck:** exact60장후보는`CARDSET_APPROVED_CANDIDATE / USER_APPROVAL_PENDING`. 60장/5종/180VP감사와고갈·경제비대칭위험을유지한다. 이번PDF의68장/unique효과를가져와덱을재설계하지않는다.
5. **Remaining gate:** 사용자exact60-card최종승인이남아있다. 비교만으로DOMAIN READY가되지않는다. 사용자가Classic에맞춘특정변경을요청하면해당변경을별도승인하고영향받는deck/protocol/privacy를다시감사한다.
6. **No implementation/checkpoint:** Runtime/GameType/schema/P15A구현0,commit/push/tag변경0. 현재검토는문서단계이고별도release/IP권리검토완료를뜻하지않는다.

당시 상태: **P14B GATE PENDING / CARDSET APPROVAL PENDING — CLASSIC REFERENCE VERIFIED**. 원문 접근 실패는 해소했지만 deck 승인 전이어서 DOMAIN READY로 표시하지 않았다.

## 6. 사용자 deck 최종 승인 후 closure

사용자가 현재 CITY_ROLE_CARDSET_V1의 exact60장 후보를 최종 승인했다. **CARDSET_CONFIRMED / USER_APPROVED**, **CLASSIC_REFERENCE_VERIFIED** 및 기존 CITY-001–070/E01–03을 유지한다. 위 Classic 비교 내용과 CITY 규칙은 변경하지 않았다.

[P14B final audit](./CITY_ROLE_P14B_CONSISTENCY_AUDIT.md#12-p14b-final-gate--사용자-cardset-최종-승인-후)에서 내부 모순이나 미해결 blocker를 발견하지 못했으므로 **P14B COMPLETE / DOMAIN READY**로 판정한다. 이 후속 승인은 원작과 모든 mechanics가 동일하다는 선언이나 release/IP clearance가 아니다. Runtime 구현 없이 docs checkpoint만 진행하고, P15A는 다음 사용자 요청 전 시작하지 않는다.

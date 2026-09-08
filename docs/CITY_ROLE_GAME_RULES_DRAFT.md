# CITY_ROLE — 비밀 도시 게임 rules draft

> P14A · 2026-09-08 · **DECISION GATE READY / RULES OPEN / NOT DOMAIN READY**
> 모든 CITY rule은 제안이다. 사용자 승인 없이 code/schema/card data/asset을 생성하지 않는다.

> **P14B 현재 상태: P14B COMPLETE / DOMAIN READY.** 위 상태와 본문 추천은 P14A 당시 history다. 이후 CITY-001–070은 모두 CONFIRMED(001C/004B/018B/019B/070B, 그 외 A)되었고 E01–03·exact60-card 사용자 승인·Classic 직접 대조도 완료했다. 현재 규칙은 [P14B rules](./CITY_ROLE_GAME_RULES.md), final gate는 [consistency audit](./CITY_ROLE_P14B_CONSISTENCY_AUDIT.md)를 따른다. 기존 draft를 최종 규칙으로 구현하지 않으며 P15A는 아직 시작하지 않았다.

## 1. Baseline / 문서 authority

- 시작: `8f8da13342269aef33c87bd5b1a1a76a953c3bde` — `refactor: extract proven platform helpers`.
- `master === origin/master`, clean. Local/remote release tag `three-game-platform-v1`은 `db0e6c638835dc8164236fc3841f4f3a88db6054`다.
- P12 verified release, P13 analysis와 P13B 세 승인 helper를 보존한다.
- 시작 검증: typecheck/build PASS, **1225/1225 PASS (shared91 / Web283 / server851)**, fail/skip/cancel/todo0.
- 이번 문서가 제안하는 네 번째 게임은 아직 runtime에 없다. HANGUL_TILE / NUMBER_TILE / GEM_CARD 규칙과 동작은 변경하지 않는다.

관련 문서:

- [Decision gate — CITY-001–070](./CITY_ROLE_DECISION_GATE.md): 유일한 사용자 선택표. 전부 OPEN.
- [Architecture stress analysis](./CITY_ROLE_ARCHITECTURE_ANALYSIS.md): 현재 source와 향후 concrete integration의 차이.
- [IP / product gate](./CITY_ROLE_IP_PRODUCT_GATE.md): 확인된 reference의 범위, 자체 표현/데이터와 review 요구.

현재 repository의 docs에서 Citadels 규칙 source는 발견하지 못했다. 공식 publisher 자료는 genre/판본·소인원 예외의 존재를 확인하는 제한된 reference다. Classic PDF 전체 열람은 실패했으므로 원작의 세부 표·능력·수치를 검증된 사실로 옮기지 않았다. **아래는 자체 작성한 후보 규칙의 조합**이며 공식 Classic 규칙의 완전한 재현을 주장하지 않는다.

## 2. Working concept / 추천 조합의 읽는 법

문서용 ID는 `CITY_ROLE`, public working title은 **비밀 도시 게임** 후보(CITY-026). 친구들끼리 온라인으로 비밀 역할을 고르고 공개 도시를 발전시키며, 상대의 역할을 추론하는 라운드 게임을 검토한다. 기존 룸의 Host와 게임 안 leader는 다르다.

읽기 쉬운 예시는 **ALL:A, 단 CITY-001/004/018/019/070=B** 조합을 조건부로 사용한다. 이것은 “기본 확정 규칙”이 아니라 추천을 연결한 design walkthrough다. 사용자가 다른 옵션을 택하면 관련 문단/행렬/전이를 P14B에서 다시 감사한다. 특히 CITY-002A(가까운 mechanics)도 모든 원작 수치/소인원 절차를 자동 채택하는 뜻이 아니다.

이 조합은 3–6인, 3인일 때 player당 2역할/4–6인은 1역할, 8개 고정 role, 순차 secret draft, pick45초/role turn90초를 제안한다. 2인 지원 여부는 별도 player-count 선택에 따른다. 현재 플랫폼 4인 상한을 이미 해소했다고 주장하지 않는다.

## 3. Core loop와 최소 phase model

```text
Room LOBBY
  └─ Host start (허용 인원 / 모두 CONNECTED / credentials 검증)
       ↓ Room PLAYING
     ROUND SETUP [자동]
       ↓
     ROLE_SELECTION [선택 actor 1명 / pick deadline]
       └─ pick/auto-pick 반복 → ROLE RESOLUTION [자동 cursor]
            ├─ unowned / disabled / forfeited role → 승인된 skip/reveal
            └─ 정상 role → ROLE_ACTION [role owner / action deadline]
                 ├─ 시작 효과 → 기본 획득
                 ├─ draw 선택 시 canonical pendingChoice → choose
                 ├─ optional ability / build → endTurn
                 └─ 다음 role resolution
       ↓ 모든 role 처리
     ROUND END [자동: marks clear / end latch 검사 / next leader]
       ├─ next ROUND SETUP
       └─ Room FINISHED
```

ROLE_SETUP/ROLE_RESOLUTION/ROUND_END는 논리 단계다. 별도 사용자 입력이 없다면 새로운 timed/durable phase 세 개를 만들지 않고 bounded atomic 전이로 구현할 수 있다는 **설계 제안**이다. Durable CITY PLAYING subphase는 `ROLE_SELECTION`과 `ROLE_ACTION`으로 시작하고 후자에 `pendingChoice`를 둘 수 있다. 선택/능력 timing이 바뀌면 P14B에서 조정한다(CITY-003/006/039/060/066).

### 최소 canonical 정보 후보

| 정보 | 의미 / identity |
| --- | --- |
| gameId / gameRevision / pinned rules·roles·cardset version | 하나의 game 인스턴스와 승인된 규칙/content |
| participant roster / seatOrder / leaderPlayerId | persistent player들, 최초 seat 순서, 이번/다음 draft의 출발점 |
| roundNumber / subphase | phase 진행 설명; 별도 opaque roundId가 무조건 필요하진 않음 |
| roleSelectionState | available / publicRemoved / hiddenRemoved / selected / leave tombstone partition, pick cursor |
| roleResolutionCursor / activeRole | role의 정해진 호출 순서; player 순서와 독립 |
| activePlayer / actionableWindow | 현재 명령 actor 및 deadline; 새 pick/role turn마다 새 identity |
| turn action budgets | acquisition 완료 여부, build 수, once ability 사용, role marks |
| pendingChoice | owner, exact candidates, cardinality, default rule, current deadline/token |
| deck/discard/hand/cities/gold | physical card conservation, public/private state의 원본 |
| endTriggered / firstCompletion / result | 종료 trigger와 승인된 scoring evidence |

한 player가 두 역할을 가져도 PlayerId는 하나다. SocketId나 roleId를 PlayerId 대신 쓰지 않는다. Role이 없거나 forfeited여도 game participant record를 삭제하여 terminal 결과를 잃지 않는다.

## 4. Secret role selection / reveal / leader

관련: CITY-004–010/020/024/050/051/064.

추천 순차안에서는 server가 initial seatOrder를 shuffle하고 첫 player를 leader로 둔다. 매 round leader부터 circular eligible seat 순서로 한 번씩 고르며, 2역할 모드면 같은 순서의 두 번째 pass가 있다. 각 pick은 아직 available인 role 하나를 소비한다. 선택은 actor만 요청 가능하고 Host가 대리 선택하거나 secret 제거를 지정하지 못한다.

K roles, M planned picks에서 hidden1 + public max(0,K−M−2)를 server RNG로 제거한다. K≥M+1이어야 한다. 최종 미선택 role도 hidden이다. Public 제거는 모든 참가자에게 공개하지만 hidden 제거 exact IDs는 어떤 player에게도 보내지 않는다. 모든 제거 category에 CR-04가 포함될 수 있는 이 초안에서는 leader-role 미선택 시 incumbent을 유지한다. 이는 특정 판본의 예외 규칙을 복제한 것이 아니라 명시한 제안이다.

선택 중 player가 떠나면 추천안은 remaining pick을 건너뛰고 선택된 역할을 재공급하지 않는다. 그 role은 secret tombstone으로 남아 resolution에서 건너뛴다. mid-round M/제거 수를 다시 계산하거나 다른 player를 다시 고르게 하지 않는다. 다음 round는 CITY-069A에 따라 당시 eligible 수로 계획한다. 따라서 4명에서 3명이 되면 다음 round부터 각2roles인 제안이며, 시작 인원 기준으로 고정하려면069B를 선택해야 한다.

Role 호출은 resolutionOrder 오름차순이다. 정상 role은 actor와 함께 공개되고 turn이 열린다. 미소유/봉쇄/forfeited role의 공개 skip은 ownership을 불필요하게 구별하지 않는다. 봉쇄 소유 공개는 CITY-010A의 round end에서만 한다. CR-04가 정상 reveal되면 next leader가 바뀌고, 그 player가 떠나면 다음 eligible seat가 fallback이다. Role ID/owner relation은 selected role privacy를 지키는 범위에서만 공개한다.

## 5. Role set 후보 / timing

아래 display names도 임시 자체 용어다. Official artwork/character prose를 넣지 않는다. `abilityCategory`는 설명용 분류이며 giant runtime ability framework를 설계한 것이 아니다.

| 후보 ID/order | 임시명 | 분류 | 정확한 선택 authority |
| --- | --- | --- | --- |
| CR-01 / 1 | 가림꾼 | role 봉쇄 또는 완화/경제 대안 | CITY-040 |
| CR-02 / 2 | 징수꾼 | role 지목 후 gold 이전 또는 대안 | CITY-041 |
| CR-03 / 3 | 교환꾼 | hand 교환/자체 교체 | CITY-042 |
| CR-04 / 4 | 길잡이 | leader / CIVIC income | CITY-043 |
| CR-05 / 5 | 수호꾼 | protection / CULTURE income | CITY-044 |
| CR-06 / 6 | 장터지기 | TRADE income / acquisition bonus | CITY-045 |
| CR-07 / 7 | 설계꾼 | extra draw / extra construction | CITY-046 |
| CR-08 / 8 | 해체꾼 | GUARD income / public city interference | CITY-047–049 |

추천 timing: role 호출→disable 여부→정상 reveal→기존 mark의 gold 이전→leader/시작 category income·bonus draw→필수 기본 acquisition→acquisition bonus→optional ability/build→endTurn(CITY-066A). 시작 수입은 시작 시점 도시에서 계산하며 이번 turn에 건설했다고 다시 지급하지 않는다.

각 optional ability는 role turn당 once이고 사용 안 해도 된다. Pending choice 중에는 다른 능력/건설/EndTurn을 완료할 수 없다. Role mark는 round 끝에 지운다. 같은 player가 다른 정상 role turn을 가지면 그 turn은 계속 진행된다. 자기 소유 hidden role을 겨냥했다는 사실로 command를 reject하지 않고, 승인된 resolution에서 no-op한다. 현재 role 자체는 “높은 order만 target” 조건으로 제외된다. 능력 없는/미보유/disabled/떠난 role에 대한 효과의 결과는 rule gate가 정의하며 소유자를 확인하는 별도 API는 만들지 않는다.

## 6. Economy / hand / building / public city

CITY-027–038의 추천안: gold2/손패4로 시작, gold는 public exact이고 bank는 추상적으로 충분하다. Role turn당 gold2 또는 최대2장 보고1장 선택 중 하나를 고른다. 선택을 위해 본 카드는 server pending 영역으로 이동하고, keep하지 않은 것은 draw 순서로 deck bottom에 간다. 동일 pending을 취소하여 재추첨하지 못한다. Deck이 부족하면 discard를 server shuffle하여 재사용하고, 아무 카드도 없으면 draw는 reject되어 gold를 선택할 수 있다. 카드 pool 소진을 새 finish reason으로 자동 도입하지 않는다.

Hand exact는 self-only, 상대는 count만, hand cap은 없는 안을 추천한다. 건설된 city와 카드 definition은 public이다. Building은 최소 `cardId`(physical), `templateId`, 자체 name, category, printed cost, VP를 가지는 후보이며 cost=VP/1–6, category5종, 특수 building 능력 없음이 추천이다. `unique` bool의 의미를 추정하지 않고 동일 city 내 template duplicate 제한으로 설명한다. Physical copies의 식별자는 서로 다르다.

기본 최대1건설/role turn, 선택적. CR-07의 최대3은 기본1에 3을 더하는 것이 아니라 한도를 대체한다. 자기 hand 카드만 현재 gold로 전액 지불하여 public city에 옮긴다. 비용 지불과 카드 이동·score/finish 반영은 atomic하다. 지불 gold는 bank로 돌아간다. 미승인 discount/거래/대출/경매/반응 interrupt를 추가하지 않는다.

Deck60장, 5category×12라는 선택은 **향후 original dataset 초안 작성 권한** 후보이며 60개 row의 확정이 아니다. 범주/비용/점수/physical duplicate 분포와 목표 threshold의 실현 가능성을 P14B에서 검토해야 한다. 이번에는 공식 deck table을 참고해 데이터셋을 채우지 않는다.

파괴를 승인하면 public physical building 하나와 printed cost 기반 비용을 검증한다. 추천안은 현재 완성 city/정상 CR-05 owner/자기 city/forfeited city를 보호한다. 제거 card는 비공개 discard에 가며 현재 도시 VP는 즉시 감소하지만, 이전에 공개됐던 identity를 player의 기억에서 지운다고 가정하지 않는다.

## 7. Finish / scoring / rank draft

관련: CITY-014–017/025/038/048/053/065.

추천 threshold8은 city cap이 아니다. 처음 threshold를 달성한 canonical build에 `endTriggered`와 최초 달성자를 기록하고 current role-resolution round를 마친다. 이는 GEM의 seat-order fair-round를 복사한 것이 아니다. 같은 player가 이번 round에 아직 해석되지 않은 두 번째 role을 가졌다면 그 정상 role도 처리 대상이다. Forfeited/disabled/미소유 role은 승인된 skip 규칙을 따른다.

최종 score 후보는 도시 VP + 완료 보너스 + category 다양성이다. A안의 최초 달성 보너스4와 다른 완성도시2는 중복하지 않고, category5종을 모두 보유하면3을 더한다. 최초 달성 후 city가 줄어도 trigger/최초 권리는 유지하는 안이며, forfeit는 CITY-065A에 의해 completion/diversity 자격을 잃는다. B/C의 다른 scoring을 선택하면 이 수치가 자동 유지되지 않는다.

Eligible players는 score 내림차순, 동점 공동승리/competition ranking(예 20,20,17→1,1,3)을 추천한다. Forfeited는 그 뒤 frozen-city VP만으로 별도 competition subgroup이며 rank offset은 eligible 인원수다. 모든 시작 참가자는 result에 포함한다.

추천 terminal 우선순위: eligible0→no-winner, eligible1→last survivor, 그 외→round-end trigger. Last survivor는 score보다 우선한다. 0명 경로는 1명 terminal 전에 모두 없어진 상태를 안전하게 해석하는 예외이며 terminal 후 leave로 기존 result를 재작성하지 않는다. Finish reason 후보 이름은 `CITY_COMPLETION_ROUND_END`, `LAST_PLAYER_STANDING`, `NO_ELIGIBLE_PLAYERS` 정도이며 아직 schema/최종집합은 미승인이다. overall/round cap이나 즉시종료 옵션을 택하면 P14B에서 reason을 재정리한다.

## 8. Timers / pending choice / timeout / leave

| 항목 | 추천 경로의 의미 | 결정 |
| --- | --- | --- |
| Selection | 매 pick45초, 서버 deadline; 자동선택은 available에서 uniform RNG | 018B /020A |
| Role action | 90초, 수입/능력/건설을 해도 동일 deadline 유지 | 019B |
| Draw pending | 별도 추가시간 없이 해당 role action deadline 사용 | 019/055/060 |
| Action timeout | 기본 수입 미선택이면 gold, pending이면 정해진 default, optional 능력/건설 생략 후 end | 021A |
| Pending default | 최초 draw 순서 첫 카드 keep, 나머지 결정된 행선지; 선택 가능1장이면 그1장 | 055A |
| Offline streak | pick와role action timeout 합산3; resume0; connected timeout은 증가/리셋 없음 | 022A |
| Third strike | timeout 전이 먼저, terminal이 아니면 forfeit; 새 post-terminal action 없음 | 022/025 |
| Explicit leave | 즉시forfeit/자산청산/role tombstone/actor전환+Room/session 처리 atomic | 023A/024A |
| Overall | 없음; phase wait은 deadline으로 풀되 자발적무건설게임이반드시끝난다고주장안함 | 056A |

Start/selection/role/action/choice identity를 구분하고 callback은 현재 game/revision/action/deadline/actor와 일치할 때만 적용한다. Mutation으로 revision이 바뀌면 동일 deadline을 새 revision identity로 schedule/inspect하는 경로가 필요하다. 이전 callback은 no-op이며 overdue recovery가 current deadline을 다시 찾을 수 있어야 한다.

Draw pending의 후보들은 이미 deck에서 분리된 canonical physical cards다. Refresh/resume/retry는 이를 그대로 보여준다. Optional modal을 닫아도 후보와 deadline이 없어지지 않는다. Pending이 남은 EndTurn은 reject하며 timeout/leave의 처리만 지정된 청산 경로를 사용한다. Disconnected 상태는 즉시forfeit나 새로운join이 아니고 아직eligible이면timeoutdefault가적용된다.

Explicit leave 추천안은 gold 반환, 손패와 pending 후보 비공개 discard, 도시 frozen, 남은 role turn/pick 제외다. Timeout-forfeit도 같은 청산을 사용하는지 **CITY-067**로 별도 묻는다. 추천067A는 같은 정책이지만 022의 3회차 정상 timeout 전이가 먼저다. 021C의 즉시forfeit를 고르면 pending keep/반환을 먼저 하지 않고067 청산을 적용한다. 다른 게임의 leave/timeout 차이를 암묵적으로 복사하지 않는다. Leader가 떠나면 다음 eligible seat로 옮기고 남은 pick을 제거하며, 기존 role은 재공급하지 않는다. 남은 참가자가2명인 경우 시작인원3 미달만으로 강제종료하지 않는다.

## 9. Phase-specific privacy matrix — 추천안 조건부

아래 행렬은 **CITY-010A/028A/050A/051A/052A/053A/054A/055A/070B 선택 시의 제안**이다. 다른 옵션이면 수정해야 한다. SERVER ONLY 열의 ‘예’는 모든 player projection에 없는 항목을 뜻한다. 서버는 모든 canonical state를 소유한다. SELF는 그 정보의 주인이고 OTHER는 다른 인증된 참가자이며 Host도 OTHER다. Spectator/cross-device recovery는 이번 제안 범위에 없다.

### 9.1 LOBBY

| 정보 | SELF | OTHER PARTICIPANT | SERVER ONLY |
| --- | --- | --- | --- |
| nickname / connection / Host | 공개 | 공개 | 아니오 |
| gold / hand / city / score / selected role | 아직 game state 없음 | 없음 | 생성 전 |
| rules/roles/cardset 설명 | 공개 후보 정의 | 공개 후보 정의 | future deck instances는 아직 제공 안 함 |
| sessionToken / hash / primary binding | 전용 credential 경로의 자기 opaque token만 | 없음 | hash/binding은 예; snapshot에는 token도 없음 |

### 9.2 ROLE_SELECTION

| 정보 | SELF | OTHER PARTICIPANT | SERVER ONLY |
| --- | --- | --- | --- |
| nickname / connection | 공개 | 공개 | 아니오 |
| gold | exact | exact | 아니오 (028A) |
| hand count | exact count | count only | 아니오 (052A) |
| hand exact / physical IDs | own exact | 없음 | 타인 exact는 전달 금지 |
| built buildings / public score preview | exact / preview | exact / preview | hidden bonus를preview에혼입금지 |
| own selected role(s) | exact | 없음 | canonical ownership 전체는 서버만 |
| role available list | **현재 chooser일 때만** exact | 없음 | chooser외에는 예 |
| removed public roles | exact | exact | 아니오 |
| removed hidden / final unselected roles | 없음 | 없음 | 예 |
| current role | selection중 null; 자기선택은private필드 | null | 다른selectedrole미공개 |
| current actor / leader / selection deadline | chooser/leader/deadline public | 동일 | 아니오; 고른 role은포함안함 |
| pending future deck / RNG / offline streak | 없음 | 없음 | 예 |

Available list는 이전 chooser에게 이미 보여준 과거 지식을 삭제할 수는 없지만 현재 list를 계속 push하지 않는다. 다른 player의 `selectedRole:null` 같은 모양만 보고 선택 완료 여부/역할을 추측하게 되는지 P14B에서 점검한다. Public chooser 진행 자체로 pick 완료를 알 수 있는 정보와 exact 역할을 구분한다.

### 9.3 ROLE_ACTION / pendingChoice

| 정보 | SELF | OTHER PARTICIPANT | SERVER ONLY |
| --- | --- | --- | --- |
| nickname / connection / gold / hand count | 공개 | 공개 | 아니오 |
| own exact hand | exact | 없음 | 타인에게는없음 |
| built buildings / score preview | 공개 | 공개 | 비밀정보기반미확정점수제외 |
| 정상 revealed role / owner | 공개 | 공개 | 아니오 |
| 아직 reveal되지 않은 자기 role | exact | 없음 | 타인 ownership은예 |
| disabled role owner | 자기 것만 exact | round end전없음 (010A) | 조기소유공개금지 |
| remaining available / hidden removals | 없음 | 없음 | 예 |
| public removed roles | 공개 | 공개 | 아니오 |
| current role / current actor / deadline | 정상 turn은공개 | 동일 | skip은비소유자공개상태만 |
| pending choice 종류 / owner | 공개 | 공개 | 아니오 |
| pending exact candidates / draw order / candidate count | owner만 exact | 없음 | 다른viewer에게예 |
| unrevealed role-target ownership / stored marks | 자기능력으로안내용허용범위만 | 조기결과없음 | hiddeneffect원본은서버 |
| future deck/next draw, RNG, streak, storage/idempotency/scheduler | 없음 | 없음 | 예 |

Client에게 role catalog(정의)를 줄 수 있다는 사실은 live secret ownership/available set을 공개해도 된다는 의미가 아니다. Own pending을 반환하는 ack도 player/request scope가 같을 때만 replay한다. Unsupported/forged/private card ID를 넣었을 때 error 차이로 existence를 누설하지 않는다. Role target은 “그 role을 누가 갖고 있는가”를 validation query로 사용하지 않는다.

### 9.4 ROUND_END / FINISHED

| 정보 | SELF | OTHER PARTICIPANT | SERVER ONLY |
| --- | --- | --- | --- |
| 이미 공개된 역할/city/action 사실 | 기존 공개 유지 | 동일 | 기억을삭제했다고가정안함 |
| disabled role owner | 해당 round end 승인공개 (010A) | 동일 | 아니오; 모든미선택역할공개아님 |
| final rankings / city / bonuses / forfeit | 공개 | 공개 | 아니오 |
| own retained private hand/role | 자기것만 (남아있으면) | 없음 | 떠난player의손패재공개안함 |
| unrevealed role history / hidden removals / deck order | 없음 | 없음 | 예 (054A) |
| credentials / storage / idempotency / scheduler | snapshot없음 | 없음 | 예; 자기token은별도credential경로 |

FINISHED 공개 범위는 사용자의 명시적 선택으로만 넓힌다. 단순 score UI/로그/debug convenience를 위해 손패나 과거 secret role들을 전원 공개하지 않는다.

## 10. Snapshot / command / interaction direction

`PlatformSnapshotV2`의 CITY concrete branch 안에서 `subphase`별 private/state correlation을 정의하는 방향이다. Room shell의 phase는 기존3종으로 유지한다. Number/GEM/Hangul 필드를 합치거나 fake Rack, generic PlayerPrivateState, generic GameState를 만들지 않는다.

설명용 shape (runtime schema 아님):

```text
LOBBY: game = null
PLAYING / ROLE_SELECTION:
  public(round, leader, chooser, deadline, publicRemoved, publicCities/economy)
  self(hand, ownSelectedRoles, choices IF current chooser)
PLAYING / ROLE_ACTION:
  public(round, roleCursor/revealedRole, actor, deadline, publicCities/economy)
  self(hand, ownUnrevealedRoles, pendingChoice IF owner)
FINISHED:
  public(CITY result breakdown, publicCities)
  self(only retained private facts permitted by CITY-054)
```

Command 후보는 기존 `game:start`와 `city:selectRole`, `city:takeIncome`, `city:drawBuildingCards`, `city:chooseBuildingCard`, `city:useRoleAbility`, `city:build`, `city:endTurn`이다. CITY events는 문서 후보이며 현재 Socket.IO에는 추가하지 않았다.

Income과 draw를 CITY 전용 acquisition command의 closed branch로 합칠 여지는 있다. 하지만 private draw 결과를 본 뒤 선택하는 행동은 canonical multi-step이 필요하다. `game:command`나 generic executor는 사용하지 않는다. RequestId/gameId/gameRevision/current action token으로 scope를 검증하는 안이며, roundId/phaseRevision/selectionId를 모두 미리 만들지 않는다(CITY-058–060).

## 11. Web / mobile / tutorial structural concept

- Desktop: 위쪽 round/호출 역할/actor/time, 중앙 public cities, 옆/아래 own hand/gold/role. Public과 private의 경계가 시각적으로도 분명해야 한다.
- Secret selection: current chooser만 선택 가능한 역할 UI를 받고 대기자는 phase 진행과 공개 정보만 본다. Host용 peek나 대리 picker는 없다.
- Mobile: hand/role 글자와 target 선택을 tap 중심으로 하고 city 상세는 단계적으로 표시한다. 향후390/320 viewport, keyboard/focus, 스크롤 가능한 pending modal을 검증한다. Number의 drag/Table/compact tiles를 이식하지 않는다.
- Tutorial/Guide: 목표→secret draft→role turn→획득→건설→간섭/종료의 자체 설명 후보다. Step 수는 미정이고 GEM의6steps를 필수 계약으로 삼지 않는다. 재오픈/phase guidance를 추천한다. Guide는 server timer를 pause하지 않는다.
- Client transient는 highlight/target/confirmation이다. Server가 결정한 hand/role/private draw를 local-only draft나 localStorage의 authority로 복원하지 않는다.

## 12. P14B examples / consistency tests to require later

지금 tests를 구현하지 않는다. 사용자 선택 후 최소 다음을 확정 예제로 작성한다.

1. 3인×2roles/6인×1role partition, 동일 player의2turn, 공개/비공개 제거와 마지막 미선택.
2. Role 선택 중 leave→tombstone→next chooser, leader 부재 fallback,0/1eligible terminal 우선.
3. Secret role target이 absent/disabled/self-owned여도 ownership oracle가 되지 않는 ack/공개 timing.
4. Draw2 후보를 보고 disconnect→동일 후보/기한 resume→choose replay에도 추가 취득 없음.
5. Draw pending timeout/leave, deck/discard 부족,032B라면 hand overflow 자동 discard 순서.
6. Threshold 건설 후 다른 정상 role 행동, 파괴/forfeit 후 latch/bonus, 복수 role round end.
7. Action 중 revision이 바뀌어도 deadline 일정, old callback no-op, current overdue choice 처리.
8. 모든 viewer/subphase privacy, forged/private ID, wrong token/current-primary, V1/미지원 CITY 입장 거부.

## 13. P14A exit / non-goals

P14A는 구현 가능성을 판단하기 위한 **미결정 사항을 갖춘 gate**다. 완성된 규칙/DTO/카드 데이터를 선언하지 않는다. 전체70decision에 질문·선택지·추천 이유·architecture impact를 기록하고 적용되는 OPEN/모순은 P14B에서 해소한다.

Production source/test/schema/dependency/기존 rule docs/asset 변경0. Railway deploy와 tag 이동도 없다. P13 보류 codec/lifecycle/renderer registry나 generic result/turn/state를 구현하지 않는다. 다음은 사용자 decisions 후의 **P14B — CITY_ROLE final rules / protocol / IP consistency gate** 하나다.

### Final source/document gate

- 시작과 문서 작성 후 root `npm run typecheck`, `npm test`, `npm run build` 모두 PASS.
- 최종 **1225/1225 PASS — shared91 / Web283 / server851**, fail/cancel/skip/todo0. Test source 추가·삭제·skip 없음.
- `git diff --check` PASS. 70개 decision ID의 연속성/중복 부재, 전부 OPEN, 문서·source 상대 경로 존재를 확인했다.
- 네 CITY 문서와 roadmap 상태만 변경했다. `apps/server`, `apps/web`, `packages/shared`, package manifest/lockfile diff0.
- 독립 교차 검토로 gold 이전 timing, round 보호 기간, timeout-forfeit 청산, role quota 산정 시점, private mark validation 경계를 명확히 했다. 이는 **옵션 설명의 정합성** 검토이지 사용자 rule 승인이나 playtest 완료가 아니다.
- 판정: **P14A COMPLETE / DECISION GATE READY**. 모든 CITY decisions OPEN; DOMAIN READY/구현/배포 gate는 통과한 것이 아니다.

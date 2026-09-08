# CITY_ROLE — P14B final rules / protocol / IP consistency audit

> 2026-09-08 · **70 DECISIONS CONFIRMED / RULE EDGES RESOLVED**
> **P14B COMPLETE / DOMAIN READY**
> `CLASSIC_REFERENCE_VERIFIED` / `CARDSET_CONFIRMED / USER_APPROVED`
> Docs-only. 기존70개와 E01–03 및 exact60-card 최종 승인을 보존했다. 최종 판정은 §12이며 P15A 구현은 시작하지 않았다.

## 1. Baseline / authority

- 시작 HEAD: `d5923c92f111ccb6666e8f3b28ff0a96339d0c1a` — `docs: define city role game planning gate`.
- 시작 working tree는 clean이며 `master === origin/master`다. Runtime 기준은 P13B `8f8da13`이며, 기존 3종은 HANGUL_TILE / NUMBER_TILE / GEM_CARD다.
- Release tag `three-game-platform-v1 → db0e6c638835dc8164236fc3841f4f3a88db6054` 유지. Tag/release/Railway 변경 없음.
- 시작 typecheck/test/build PASS, **1225 = shared 91 / Web 283 / server 851**. 삭제/skip은 없다.
- 선택: **CITY-001C / CITY-004B / CITY-018B / CITY-019B / CITY-070B, 나머지 A**. 70행 전부 CONFIRMED다. 일괄 `002–017 A`와 충돌하는 004는 개별 선택과 마지막에 명시한 “2/3인 각 2 roles”에 따라 B를 적용한다.
- 이후 사용자 추가 답변으로 E01/E02/E03도 확정했다. 기존 CITY ID를 재번호화하거나 승인된 규칙을 다른 게임의 관습으로 바꾸지 않았다.

문서 authority: [70 choices](./CITY_ROLE_DECISION_GATE.md) → [승인 규칙](./CITY_ROLE_GAME_RULES.md) → [protocol](./CITY_ROLE_PROTOCOL_GATE.md). [P14A draft](./CITY_ROLE_GAME_RULES_DRAFT.md)는 history다. [Cardset](./CITY_ROLE_CARDSET_V1.md)과 [IP/product gate §7](./CITY_ROLE_IP_PRODUCT_GATE.md#7-p14b-confirmed-product-policy--reference-audit)는 별도 content/reference 상태를 가진다.

## 2. 요청된 열 가지 감사 결과

| 항목 | 결과 | 근거 / 남은 경계 |
| --- | --- | --- |
| 70 decisions consistency | PASS, 선택 70/70 CONFIRMED | 아래 coverage 및 E01–03에 대한 사용자 추가 확정 |
| 2/3/4/5/6인 draft 산술 | PASS | §4의 round setup quota와 도중 leave 시 tombstone 처리 |
| 8개 role의 exact ability | 승인된 정상/예외 경로 정리 완료 | Rules §5의 횟수·timing·hidden target과 E01/E03 반영 |
| Original 60-card deck | USER APPROVED + STATIC AUDIT PASS | 30 templates × 2, category 5종 × 12장. Exact 분포 최종 승인 기록은 §12 |
| Exact scoring | PASS | City VP + 중복하지 않는 completion 4/2점 + diversity 3점. Forfeit bonus는 0, 공동 순위 적용 |
| Timeout/leave precedence | PASS | E02 확정. 정상 terminal 이후 forfeit는 없으며, 다음 window의 entry는 청산 뒤에 처리 |
| Phase/private projection | 문서 contract 정리 완료 | Rules §9 / Protocol §6. Chooser/private pending/mark는 viewer별로 다름 |
| Command/protocol | 문서 contract 정리 완료 | V2-only, concrete event 7개, actionId. Runtime schema는 없음 |
| Player-cap extension | Source impact 확인 완료 | §7의 CITY-only 2–6인. 기존 3종의 2–4인 및 V1 유지 |
| IP/product consistency | 독립제작 정책 감사 / 첨부 Classic 원문 대조 완료 | §8.2와 별도 차이표. 기존70+추가3개 승인 유지; legal/release clearance는 아님 |

## 3. 전체 decision coverage

범위의 모든 ID를 실제 행·선택지와 대조했다. “A”를 일괄 붙여 conditional requirement를 무시하지 않았다.

| IDs | 함께 감사한 invariant / 판정 |
| --- | --- |
| 001–010 | 2–6인, 다역할·8개 role roster, 순차 draft, 제거, leader, reveal. 모든 인원의 산술이 가능하며, 선택 사이 추가 discard나 CR-04 제거 예외를 새로 만들지 않음 |
| 011–017 | Role-target direct interference, 기본 건설 1개, threshold 8개와 round latch, 4/2/3점 bonus, 공동 순위. 별도 규칙 충돌 없음 |
| 018–025 | Pick 45초/action 90초, random auto-pick, 기본 gold timeout, pending default, streak 3회, 청산/tombstone, eligible 1/0명 terminal. E01/E02로 미명시 순서를 해결 |
| 026–038 | 자체 임시명, gold 2/hand 4, public gold와 cap 없음, gold OR draw, 2→1 선택과 나머지 bottom, discard reshuffle, hand cap 없음, cost=VP, category 5종, 특수 능력 없음, template 중복 금지, deck 60장, city cap 없음 |
| 039–049 | 기본 획득 후 optional 능력 1회, 필수 category bonus 4종, 정상 reveal 후 보호, CR-07 최대 3건설, 파괴 비용 cost−1·대상 보호·discard. E01/E03 반영 |
| 050–060 | 자기 role/choice/hand/pending, score preview, FINISHED secret 보호, deterministic default, overall deadline 없음, 같은 token으로 resume, V2/action identity/canonical pending |
| 061–070 | CITY tutorial/Guide, 자체 콘텐츠와 version 3종, role별 mark, forfeit 점수, entry 순서, 공통 청산, Classic reference, round quota/private mark. 068A 첨부 원문 직접 대조 완료; 규칙 자동 변경 없음 |

선택하지 않은 분기는 구현 requirement가 아니다. 특히 032A(hand cap 없음)를 선택했으므로 032B forced discard는 **비활성**이며, 055A의 forced-discard fallback도 이 v1에서 호출할 경로가 없다. B/C 대안 능력·동시 draft·time limit·특수 building을 남은 TODO라는 이유로 추가하지 않는다.

## 4. Draft arithmetic / leave examples

| Players | Roles each | Picks M | Hidden removed | Public removed | Unselected | Queue |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2 | 2 | 4 | 1 | 2 | 1 | A B A B |
| 3 | 2 | 6 | 1 | 0 | 1 | A B C A B C |
| 4 | 1 | 4 | 1 | 2 | 1 | A B C D |
| 5 | 1 | 5 | 1 | 1 | 1 | A B C D E |
| 6 | 1 | 6 | 1 | 0 | 1 | A B C D E F |

모든 행에서 `M+hidden+public+unselected=8`이다. Queue는 shuffled seatOrder의 leader부터 eligible player를 순환하며, 같은 role을 중복 선택하지 않는다. 이는 승인된 006A/007A의 산술이지 공식 Classic 소인원 절차의 복제가 아니다.

- 3인 선택 중 B가 첫 role을 고른 뒤 leave: 이미 선택한 role은 재공급하지 않는 hidden tombstone으로 남고, B의 두 번째 pick은 건너뛴다. 현재 quota/제거 수는 유지하며, unselected가 1개 더 늘어날 수 있다.
- 4→3인 leave: 현재 round의 player당 1개 role 계획은 유지하고, 다음 round부터 각 2개 role을 선택한다.
- Leader가 이미 pick한 뒤 leave: leader만 다음 eligible player로 이전하며, 현재 queue는 재시작하지 않는다.
- 남은 eligible player가 1명이면 LPS로 종료하고 새로운 1인 draft를 만들지 않는다. 0명이면 winner 없이 terminal이 된다.

## 5. 추가 경계 — 사용자 답변으로 해결

### P14B-E01 — CONFIRMED: source forfeit cancels unresolved marks

문제: CR-02 source가 gold를 은행에 반환하고 leave한 뒤 기존 mark가 해석되면, forfeited player에게 gold가 다시 생길 수 있었다. CITY-023/064/065만으로는 outgoing source의 lifetime을 정할 수 없었다.

사용자 확정: **미해결 CR-01/CR-02 방해 효과를 모두 취소한다.** Explicit leave와 timeout-forfeit의 같은 청산 경로에 적용한다. 이미 완료된 skip/이전 결과를 소급해서 되돌리지는 않는다. 예를 들어 CR-02 source가 leave하면, 나중에 CR-07이 정상 reveal되어도 gold를 이전하지 않는다. CR-01 source가 leave하면 아직 호출하지 않은 target은 다른 조건이 없는 한 정상 역할로 처리한다. 입력 시 존재·소유·disable 검증으로 비밀을 노출하지 않는 규칙은 유지한다.

### P14B-E02 — CONFIRMED: current window → terminal → forfeit → next window

사용자가 확정한 순서는 다음과 같다.

1. **현재 window의 정상 timeout**: random pick 또는 미획득 gold/pending default/획득 bonus를 처리하고 현재 window를 종료한다.
2. 현재 처리로 발생하는 terminal 조건을 확인한다. 이미 terminal이면 추가 forfeit/game mutation을 하지 않는다.
3. Terminal이 아니고 offline 3회차이면 forfeit, gold/hand/pending 청산, 미해결 mark 취소, leader fallback을 처리한다. Eligible 인원 1/0명에 따른 terminal을 다시 확인한다.
4. 아직 PLAYING일 때만 다음 role의 mandatory entry 또는 다음 round setup과 quota 산정, 새 window/deadline 생성을 처리한다.

예를 들어 4인 round의 마지막 role에서 3회차 timeout이 발생했고 round latch가 없다면, 먼저 forfeit하여 3명이 된 뒤 새 round에서 각 2개 role을 선택한다. CR-07의 entry bonus draw도 청산 후 deck/discard 상태에서 실행한다. 이미 round completion으로 terminal이 되었다면 결과 확정 후 해당 player를 추가 탈락시키지 않는다.

현재 round에서 skip/종료 판정에 필요한 role cursor 순회와 **다음 actor의 entry 보상·새 round draft 생성**은 구분한다. 후자를 forfeit보다 먼저 실행하지 않는다.

### P14B-E03 — CONFIRMED: zero-card self exchange rejects

CR-03의 자기 카드 교체는 최소 1개의 unique owned physical card를 요구한다. **0장 요청은 reject하며, 능력 사용/gameRevision/RNG 소비는 없다.** 다른 player와의 전체 손패 교환은 별도 variant이므로, 한쪽 손패가 0장이라는 이유만으로 금지하지 않는다.

042A+031A에 따라 선택 카드를 먼저 discard하고 draw하므로, deck 소진 시 방금 버린 카드를 다시 뽑을 수 있다. 별도 quarantine 영역이나 재추첨 금지를 추가하지 않는다. 부존재·중복·상대 카드는 fail-closed로 처리한다. 유효한 N장을 먼저 discard하므로 정상 공급은 N장 이상이며, 기존 “공급 부족 reject”는 통상 도달하지 않는 방어 조건이다.

## 6. Scoring / privacy / timeout consistency examples

| 교차점 | 승인 규칙으로부터의 결과 |
| --- | --- |
| First completer | 최종 city VP 24, 최초 8건물 달성, category 5종이면 24+4+3=31점. Completion 4점과 2점을 동시에 주지 않음 |
| Later completer | 최종 city VP 26, 건물 8개 이상, category 5종이면 26+2+3=31점. 위 player와 공동 1위 |
| First completer forfeit | Frozen city VP만 받고 4/3점 bonus는 없음. 최초 달성 권리를 다른 player에게 이전하지 않으며, 남은 eligible player가 2명 이상인 한 round latch 유지 |
| Threshold + extra build | CR-07은 8개 달성 후에도 같은 role의 budget 안에서 9/10개까지 건설 가능. 다른 역할도 round 끝까지 실행 |
| Protected city | 현재 건물 8개 이상인 city는 파괴 불가. 정상 CR-05 owner 보호는 round 끝까지 유지되므로, v1의 정상 파괴로 완성 후 건물 수가 감소하는 것은 통상 불가 |
| Self-target 두 역할 | CR-01/02가 자기가 가진 다른 role을 mark해도 입력은 성공하고, 효과 해석은 no-op. 다른 role turn을 유지하며 skip 판정보다 self-no-op을 먼저 적용 |
| Pending timeout vs leave | Timeout은 첫 카드 keep/나머지 bottom을 처리한 뒤 3회차이면 kept hand를 청산. Explicit leave는 모든 후보를 discard하는 것부터 처리하며, 두 경로를 강제로 통일하지 않음 |
| Connected timeout/resume | Connected timeout은 streak를 증가시키거나 reset하지 않음. 인증된 resume만 0으로 reset하며 deadline은 유지 |
| Role privacy | 정상 reveal에만 owner 공개. 미보유/disabled skip은 owner 미공개이며, disabled owner는 정상 round end에만 공개 |
| Immediate terminal | LPS는 정상 round end가 아니므로 새 secret history를 공개하지 않음. 완료 후에도 타인 hand/deck은 미공개 |
| No overall | Timer는 현재 window의 진행을 보장하지만 합법적으로 무한한 round가 이어질 가능성까지 제거하지 않음. 새 timeout/round cap/no-progress는 추가하지 않음 |

## 7. Platform stress / integration conclusion

[Protocol §2](./CITY_ROLE_PROTOCOL_GATE.md#2-현재-source에서-확인한-integration-seams)는 현재 파일/symbol별 변경 영향을 기록한다. 다음은 **미래 구현 방향**이지 이번 source 변경이 아니다.

| 경계 | 판정 | 이유 / 최소 확장 |
| --- | --- | --- |
| Room/session/Host/current-primary/lane/UoW/CAS/idempotency | READY | 공통 mechanism을 그대로 사용. 능력/leader는 Host 권한이 아님 |
| Player cap | MINOR EXTENSION | Server MAX_ROOM_PLAYERS의 4인, shared V2 roster의 4인, Web game-start/Lobby의 4인 제한을 CITY만 6인으로 확장. 기존 3종/V1 상한 유지 |
| Phase/actor/round | NEW GAME-SPECIFIC CONCRETE SUPPORT | 고정된 2–6인 roster와 role order 1–8, 개별 pick/actionId를 분리 |
| Snapshot/privacy | NEW GAME-SPECIFIC CONCRETE SUPPORT | V2 CITY의 exact subphase와 인증된 viewer별 hand/roles/pending/marks |
| Scheduler | MINOR EXTENSION | 동시 timer는 1개지만 selection/action을 구분. 중간 commit 시 동일 action·동일 deadline·새 revision의 descriptor 필요 |
| Persistence | NEW GAME-SPECIFIC CONCRETE SUPPORT | Concrete CITY adapter에서 8-role partition, 60-card zones, roster/pending/leader/result coherence 검증 |
| Lifecycle/codec registry | POTENTIAL PLATFORM ABSTRACTION EVIDENCE | Phase-aware inspection에 부담이 생겼지만 registry 추출 근거가 완성되거나 승인된 것은 아님. 이번 구현 0 |
| Reconnect | READY + concrete projection | 기존 token/자리/presence authority를 재사용하고 private pending과 원래 deadline을 복원 |
| Web/result/tutorial | NEW GAME-SPECIFIC CONCRETE SUPPORT | Secret selection·내 손패·공개 city·역할 Guide. 가짜 Rack/GenericTurnDraft는 없음 |

Action identity는 requestId/gameId/gameRevision/actionId만 사용하는 방향이며, roundNumber는 설명/규칙 값이다. Concrete event는 `city:selectRole`, `city:takeIncome`, `city:drawBuildingCards`, `city:chooseBuildingCard`, `city:useRoleAbility`, `city:build`, `city:endTurn`의 7개다. 공개 state와 비공개 pending 변경은 모두 canonical commit이며, replay 시 다시 추첨하지 않는다. Generic game:command, phase framework, lifecycle/codec/renderer registry는 만들지 않는다.

## 8. Original content / exact reference gate

### 8.1 자체 60-card design

30 templates × 2 = 60장, 각 category는 12장/36 VP, 전체 180 VP, 평균 cost는 3.00이다. Cost 1/2/3/4/5/6의 physical 빈도는 12/14/10/12/10/2다. 2–6인에게 초기 카드를 각 4장 지급한 후 deck은 52/48/44/40/36장이다. 6명이 각각 8개의 서로 다른 template을 보유할 수 있도록 physical cards를 배분할 수 있는지도 검사했다. 이 산술이 완벽한 밸런스나 모든 게임의 종료를 보장하는 것은 아니다.

공식 published deck/cost/point 분포를 참조하지 않은 독립 설계다. 재개 감사에서 장수·경제·고갈·완성 속도·작성 경로를 검토했고, 현재 제약과 모순되는 덱 blocker는 발견하지 못했다. 이후 사용자가 이 exact60장 후보를 최종 승인하여 **CARDSET_CONFIRMED / USER_APPROVED**다. 이는 특정 published deck과 모든 수치가 다름을 전수 비교해 증명하거나 실전 balance를 보장했다는 뜻이 아니다. 자세한 근거와 한계는 [cardset의 추가 감사 및 최종 승인](./CITY_ROLE_CARDSET_V1.md)을 따른다. 설계 권한, 기술적 감사 통과, 사용자 결과 승인을 구분한다.

### 8.2 CITY-068A exact Classic reference

**이전 시도 이력:** 지정 URL의502/HTTPS 인증서 만료로 전문 접근에 실패했고, FFG2010을 다른 판본의 보조 자료로만 사용했다. TLS 검증을 끄거나 snippet/기억으로 보충하지 않았다. 당시 `CLASSIC_REFERENCE_VERIFICATION_PENDING` 판정의 근거는 [IP gate §7.2/7.4](./CITY_ROLE_IP_PRODUCT_GATE.md#7-p14b-confirmed-product-policy--reference-audit)에 보존한다.

**현재: CLASSIC_REFERENCE_VERIFIED.** 사용자가 공식 기준으로 제공한 `wr01_citadels_classic_rules.pdf` 16페이지(©2016 Windrider)를 전문 추출 및 페이지 렌더로 모두 직접 확인했다. SHA-256 `278c36693cac249f766015e0e37c4a9647a181a80899027ad93cb8fc5e5af94e`. [전체 차이표](./CITY_ROLE_CLASSIC_COMPARISON.md)에 현재 CITY / 공식 규칙 / 차이 / 사용자 결정 필요 여부를 기록했다. 원문 미명시와 명시적 차이를 구별하며, 70개 CONFIRMED와 E01–03은 수정하지 않는다.

특히 8건물은 기본4–7인7과 다르지만 PDF의 Classic Variant8 및2/3인8과 일치한다. 이 판본의 동점은 마지막 round의 최고 revealed role이며 gold가 아니다. 능력은 예외 외 optional/시점 자유이고, 파괴는 end-turn 전용이 아니다. FFG2010의 별도 timing/tie-break를 첨부 판본의 사실로 옮기지 않았다. 자체60장의 exact distribution 승인은 별도 gate다.

## 9. 최초 문서 작성 후 verification / handoff (history)

- 시작 root typecheck/test/build PASS: 1225/1225(shared 91 / Web 283 / server 851), 삭제/skip 0.
- 문서 작성 후 root typecheck/test/build/diff-check 모두 PASS. 최종 **1225/1225(shared 91 / Web 283 / server 851)**이며 fail/skip/cancel/todo는 모두 0이다.
- 신규 runtime test는 없다. Node 기반 문서 정적 감사에서 70개 decision, local link 68개, template 30종·physical slot 60개·총 180 VP, 모든 지원 인원의 draft 산술을 확인했고 모두 PASS했다. 이는 문서 검증이며 runtime 규칙 테스트를 구현했다는 뜻이 아니다.
- Production `apps/server`, `apps/web`, `packages/shared`, test, dependency, 기존 3게임 규칙 변경 0. 새 GameType/capability/event 등록과 asset 배포도 0.
- 이번 turn은 P14B 설계/감사이며 새 구현이나 Railway 작업을 시작하지 않는다. Commit/push/tag 변경은 없다.

첨부 제공 전 판정 이력: **P14B GATE PENDING / CARDSET APPROVAL + CLASSIC REFERENCE PENDING**. 당시에는 사용자 deck 최종 승인과 지정 Classic 대조가 모두 남아 있었다. 첨부 대조 결과는 §11, deck 승인 후 최종 판정은 §12를 따른다.

## 10. P14B 재개 감사 — 기존 승인/expected changes 보존 (history)

사용자는 기존 70 CONFIRMED와 추가 확정 3개, 현재 9개 P14B 문서를 expected changes로 승인하고 P14B를 재개하도록 요청했다. P14A를 다시 실행하거나 decisions를 OPEN으로 되돌리지 않는다.

- HEAD `d5923c9`, master/origin 일치. 수정된 tracked 문서5개 + 신규 문서4개가 전부이며 staged file0, 예상 밖 파일0이다. Reset/revert/stash/삭제/commit/push를 수행하지 않는다.
- CITY-001C/004B/018B/019B/070B, 나머지 A의 70행을 실제 Markdown에서 재검사했다. 전부 CONFIRMED이며 선택값 변경0.
- Rules/Protocol/Audit를 독립 교차 검토했다. E01 미해결 source mark 취소, E02 현재 window 종료·terminal 확인→forfeit→다음 entry/setup, E03 자기 교환0장 reject/no ability·revision 소비가 모두 일치한다.
- 2개 role의 별도 actionId/budget 및 공유 player 자산, self-mark no-op, CR-05 보호 범위, CR-07 최대3건설, completion4/2점 배타성과 diversity3점, forfeited bonus0 및 LPS 우선순위를 다시 대조했다. 추가 규칙 모순을 발견하지 못했다.
- Pending choice는 actor 전용이며 replay/resume에서 같은 후보·actionId·deadline을 유지한다. Intermediate commit 이후 최신 revision descriptor 재등록, stale callback no-op, recovery에 대한 문서도 일치한다. 승인된 privacy/timeout/leave 정책을 새로 바꾸지 않았다.
- 덱은 기술적으로 승인 가능한 후보이며 **사용자 승인 완료가 아니다**. LANDMARK의 category income 부재, 저비용 건물과 무료 파괴, 무제한 hand에 의한 고갈, 두 role/한 role 진행 속도 차이를 별도 balance 위험으로 기록한다. 수치 조정이나 새 종료 규칙으로 해결하지 않는다.
- Runtime/shared/schema/GameType/integration/P15A/domain 구현은 시작하지 않는다. 기존 H/N/G source/test/dependency와 release tag 변경0.
- 재개 후 root `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`를 다시 실행하여 모두 PASS했다. **1225/1225 = shared91 / Web283 / server851**, fail/skip/cancel/todo0, test 추가·삭제0이다. §9의 이전 기록을 재검증했으며 CITY domain 테스트를 구현한 것은 아니다.
- 실제 카드표 재계산으로 60장·5종 각12장/36VP·총180VP·비용 빈도12/14/10/12/10/2·8종 도시 비용10–39를 확인했다. Decision gate 파일의 재개 전후 SHA-256도 같아 70개 선택지/승인 상태가 변하지 않았음을 확인했다.

## 11. 첨부 Classic 대조 후 consistency 재검토 — deck 승인 전 (history)

- 사용자의 새 요청에 따라 공식 기준 PDF를 직접 확인하고 [차이표](./CITY_ROLE_CLASSIC_COMPARISON.md)를 먼저 작성했다. 기존9개 expected P14B 문서에 이 비교 문서1개만 추가했다. 예상 밖 변경이나 runtime 변경은 없다.
- 2인 draft, King 공개제거/disabled 상속, 능력의 선택성·timing, 교환/파괴 카드 행선지, 자기city 파괴, private target, tie-break, 자체 덱/특수건물은 원문과 다르다. 기존 사용자가 선택한 CITY semantics를 바꾸지 않았으며, 원작 fidelity와 CITY 내부 consistency를 같은 판정으로 취급하지 않았다.
- 원문 미명시인 timeout/leave/forfeit/자기role no-op/빈 요청/고갈/reconnect/디지털 privacy는 CITY의 기존 승인 정책을 유지한다. E01–03, 두 role의 별도 budget, phase-correlated pending/actionId, 동일 deadline, public/private projection, 4→3인 다음 round quota를 교차 감사하여 **새 내부 모순을 발견하지 못했다**.
- Classic의 전체68장 card-by-card 목록은 이 PDF에 없다. 이를 근거로60장 dataset의 전수 유사성 검증이나 법적 비침해를 주장하지 않는다. 독립 작성된60-card 후보의 수치·이름·배분은 그대로이며, deck 고갈/역할 income 비대칭/8건물 진행 속도 위험도 그대로 기록한다.
- 기존70행과 E01–03을 재승인하거나 OPEN으로 되돌리지 않는다. Reference 검증은 완료했지만, CITY-037A의 **새 exact60-card 최종 승인**은 아직 사용자에게 남아 있다.
- 첨부 대조 문서 반영 후 root typecheck/test/build/diff-check 모두 PASS. **1225/1225 = shared91 / Web283 / server851**, fail/skip/cancel/todo0. 새 runtime 테스트는 추가하지 않았다.
- 실제 Markdown 재계산: decision70/70 CONFIRMED, draft 산술5행, template30/physical60, category별12장/36VP, 총180VP 및 local file links77개 PASS. Decision gate와 cardset 파일의 첨부 대조 전후 SHA-256이 각각 동일해 승인값·카드행 무변경도 확인했다. Production/tests/dependency diff0, staged0, HEAD/master/origin 및 release tag target 유지.

당시 판정: **P14B GATE PENDING / CARDSET APPROVAL PENDING — CLASSIC REFERENCE VERIFIED**. 당시에는 deck 승인 전이므로 `P14B COMPLETE / DOMAIN READY`를 선언하거나 commit/push하지 않았다. 후속 최종 승인 및 현재 판정은 아래 §12다.

## 12. P14B final gate — 사용자 cardset 최종 승인 후

사용자는 CITY_ROLE_CARDSET_V1의 **현재60장 후보를 최종 승인**했다. CLASSIC_REFERENCE_VERIFIED 및 CITY-001–070/E01–03을 보존한 채 final gate를 완료하고, blocker가 없으면 docs checkpoint/일반 push를 수행하도록 요청했다. 이 승인은 P15A 구현을 지금 시작하라는 지시가 아니다.

### 12.1 마지막 consistency 판정

| Gate | 최종 결과 / 보존 근거 |
| --- | --- |
| 승인 범위 | CITY-001C/004B/018B/019B/070B, 나머지A의70행 모두 CONFIRMED. 추가 E01–03 그대로. 새 rule/decision 없음 |
| 인원/8-role draft | 2/3인 각2roles,4–6인 각1role. 5개 인원 행의8-role partition·pick queue·tombstone·다음round quota 일치 |
| 8-role 능력 | Timing/once budget/자기role no-op/CR-05 round보호/CR-07 최대3건설/CR-08대상·비용·discard를 Rules와Protocol에서 동일하게 유지 |
| Deck | CARDSET_CONFIRMED / USER_APPROVED. Template30×2=60,각category12장/36VP,총180VP,cost=VP1–6,매수12/14/10/12/10/2. 카드행 변경0 |
| Scoring/terminal | 8건물 latch→roundend,completion4/2점 배타적·diversity3점·공동순위·forfeitbonus0. LPS/0명 우선 및 post-terminal mutation 금지 일치 |
| Timeout/leave | 45초 pick/90초 action,같은deadline,offline3회. E01 미해결source mark취소,E02 현재window/terminal→forfeit→다음entry,E03 자기교환0장reject/no consumption 일치 |
| Privacy/pending/reconnect | 현재chooser만available,자기hand/roles/pending/mark,정상roundend공개와즉시terminal비공개 구분. Replay/resume 재추첨·deadline연장 없음 |
| Protocol/scheduler/persistence | V2-only/concrete7events/actionId,중간revision에동일deadline최신descriptor. ConcreteCITYadapter/6인 확장 영향은 설계만. 기존3종wire/roster제한 변경0 |
| Classic reference | CLASSIC_REFERENCE_VERIFIED 유지. 첨부16페이지/hash와차이표 보존. 원문차이를사용자결정으로자동수정하지않음 |
| IP/product | 자체명칭·문구·60-card provenance 정책 일치. 공식asset/data 복제없음. 공개release 전별도검토는 유지하며이번판정을법적clearance로확대하지않음 |

마지막 독립 교차 감사와 문서 산술 재검사에서 **미해결 rules/protocol/privacy/timeout/leave/cardset blocker를 발견하지 못했다**. LANDMARK 수입 부재, 저비용 파괴, 2역할/1역할 pace, hand축적·고갈·무한합법진행 가능성은 이미 기록한 playtest/제품 한계이며 새 mechanic으로 해결하지 않는다.

### 12.2 범위 / checkpoint / 다음 단계

- Closure 시작 HEAD는 `d5923c92f111ccb6666e8f3b28ff0a96339d0c1a`, `master === origin/master`. 기존 P14B dirty 문서10개만 expected changes로 확인했다. 사용자 변경을 reset/revert/stash하거나 규칙을 재OPEN하지 않았다.
- 현재 작업은 해당 문서10개의 approval/readiness 상태 동기화와 final audit뿐이다. Runtime source/tests/dependency/production asset 변경0. GameType/integration/registry/domain 구현0.
- Release tag `three-game-platform-v1 → db0e6c638835dc8164236fc3841f4f3a88db6054` 보존. Railway deploy나 tag 이동은 하지 않는다.
- 최종 quality gate와 diff review 통과 후 `docs: finalize city role game design` 문서 checkpoint를 일반 push한다. Force/rebase/history rewrite는 하지 않는다.

### 12.3 최종 자동 검증

- 승인 상태 반영 후 root `npm run typecheck`, `npm test`, `npm run build`, `git diff --check` 모두 PASS.
- **1225/1225 = shared91 / Web283 / server851**. Fail/skip/cancel/todo 모두0, 기존 테스트 삭제·변경·추가0. 이는 기존3게임 regression이며 CITY domain 구현 테스트는 아니다.
- 실제 Markdown 검증: CONFIRMED70행, card templates30/physical slots60,5categories×12/36VP,전체180VP,cost매수12/14/10/12/10/2,인원별draft5행,local file links81개 PASS. 신규 문서의 EOF/공백도 검사했다.
- Closure 전후 SHA-256 비교로 **70개 decision 행**, **카드30개 행**, **Rules §3–9** 무변경을 확인했다. P14A 원본의70개 Option/추천/impact 열도 유지했으며 마지막 선택 상태만 기존 승인에 따라 CONFIRMED다.
- `git status` whitelist 검사는 expected P14B 문서10개만 통과했다. Apps/server·Web·shared·tests·package manifest/lockfile diff0. 원격 master는 closure 시작과 같은 `d5923c9`, 원격 release tag는 `db0e6c6`임을 checkpoint 전 읽기 전용으로 확인했다.

**P14B COMPLETE / DOMAIN READY.** 이는 승인된 규칙·dataset·계약으로 pure domain 구현을 진행할 수 있는 설계 준비 판정이며, runtime 또는 public release가 완료됐다는 뜻이 아니다. 다음 작업은 사용자 별도 요청 후 **P15A — CITY_ROLE pure domain implementation** 하나다. 이번 작업에서는 시작하지 않는다.

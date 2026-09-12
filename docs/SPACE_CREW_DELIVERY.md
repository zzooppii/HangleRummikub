# SPACE_CREW 단계별 개발 기록

2026-09-12 사용자 승인. 브랜치 `codex/space-crew-planet-nine`. [규칙](SPACE_CREW_GAME_RULES.md)과 [아키텍처](SPACE_CREW_ARCHITECTURE.md)를 따른다.

## 필수 게이트

각 단계는 root `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`, 변경 검토, commit/push 후 다음 단계로 이동한다. 실패·warning·미검증 항목을 기록한다. 미래 단계의 완료를 선행 선언하지 않는다. 공개 배포와 개발 브랜치 push는 별도다.

| 단계 | 작업 | 상태 |
| --- | --- | --- |
| P0 Rules Audit | 공식 규칙·50미션·토큰·구조 신호·5인·privacy·저장 범위 | PASS |
| P1 Trick-taking Domain | 40장·3–5인 배분·사령관·follow suit·trump·보존 | PASS |
| P2 Task/Mission primitives | 교신·task assignment·batch order·구조 신호·예외 primitive | PASS |
| P3 Missions 1–10 | 조건/성공/실패/설정 테스트 | PASS |
| P4 Missions 11–25 | 조건/성공/실패/설정 테스트 | PASS |
| P5 Missions 26–50 | 조건/성공/실패/5인 특칙 테스트 | PASS |
| P6 Server/Shared | 인증·직렬화·private projection·campaign persistence·플랫폼 연결 | NOT_STARTED |
| P7 Web | PC/mobile·Game Guide·독립 삽화·카드 조작·효과음 | NOT_STARTED |
| P8 E2E/Campaign | 실제3–5인·50미션 매핑·retry·reconnect·restart campaign·회귀 | NOT_STARTED |

## 결정 기록

- 공식 한국어 자료를 확보하지 못한 부분은 영문 공식 규칙을 읽고 자체 한국어 설명으로 구현한다.
- 2026-09-12 사용자 허용: High 서브에이전트의 규칙/복잡한 검토, Medium 서브에이전트의 분리된 구현/검증. 주 작업은 통합과 순차 게이트를 담당한다.
- 2026-09-12 사용자 결정: 미션 진행·시도·구조 신호 이력을 영구 저장하고 새 방에서 캠페인 이어 하기. 진행 중 방·손패·세션의 서버 재시작 복원은 요구하지 않는다.
- 2-player variant planned. Deep Sea 별도 후속. 자유 채팅/음성·전략 추천·강제 턴 타이머 없음.

## 검증 이력

2026-09-13 P0 감사 checkpoint. 공식 영문 설명서의 기본 규칙·토큰 그래픽은 확인했으나 공식판임을 확인할 수 있는 전체 Logbook 검증이 남아 있다. 50개 미션 후보 표는 작성했고, 미확정 행을 구현 데이터로 승격하지 않았다. **P0 게이트 미통과, P1 미착수.** 이 checkpoint의 commit/push는 감사 기록 보존이며 phase 통과를 뜻하지 않는다.

- root `npm run typecheck`: PASS.
- root `npm test`: 첫 제한 환경 실행은 server392개가 local listen `EPERM`으로 실패했다. 로컬 포트 허용 후 root 전체 재실행은 shared127 + web649 + server1864 = **2640 PASS**, fail/cancelled/skip0.
- root `npm run build`: PASS. 기존 웹 단일 JS chunk의500kB 초과 경고 유지(1,460.75kB, gzip410.32kB). 이 문서 작업은 runtime bundle을 변경하지 않았다.
- 문서5개의 local links와 미션1–50 행 중복/누락 검사, `git diff --cached --check`: PASS. commit/push 식별자는 Git 이력과 원격 `codex/space-crew-planet-nine` 브랜치로 확인한다.
- PDF 시각 확인에서 `Invalid Font Weight` 경고가 있었지만 토큰과 글자는 판독 가능했다. 원작 PDF/삽화는 저장소에 추가하지 않았다.

2026-09-13 사용자 추가 자료 후 감사 계속. 전체50미션이 든 `The_Crew_v_1.0.pdf`를 대조했고, 한국어 실물 업무일지 인쇄면4–21 전체에서50미션의 수량·기호·본문을 대조 완료했다. 추가 전체 Logbook 업로드 요청은 종료한다. 11번 지명자의 통신 금지, 33/41번 사령관 지명 제외, 12번 공개 교신 카드의 무작위 교환 제외를 기록했다. 46번은 구조 신호 이전에 최초 배분 기준으로 담당자를 고정하는 구현 해석을 사용자에게 질문했으며, 답변 전 확정하지 않는다.

P1 카드/트릭의 파일 경계·보존·원자성·3인 소진 테스트 설계와 실제 미션에서 관찰된 반복 조건을 아키텍처 문서에 추가했다. **설계만 진행했으며 P1 구현은 아직 시작하지 않았다.**

- root `npm run typecheck`: PASS.
- root `npm test`: 로컬 포트 사용을 허용한 전체 실행, shared127 + web649 + server1864 = **2640 PASS**, fail/cancelled/skip0.
- root `npm run build`: PASS. 기존 500kB chunk 경고 유지(1,460.75kB, gzip410.32kB).
- 미션1–50의 V-K 행 중복/누락·로컬 문서 링크·`git diff --check`: PASS. P0는46의 결정 대기이며 이 감사 checkpoint의 commit/push를 단계 통과로 계산하지 않는다.

### P0 최종 게이트

2026-09-13 개발 계속 요청에 따라46의 최초 배분 기준 담당자 고정 해석을 채택했다. 별도 명시적 규칙 답변을 받았다고 기록하지 않는다. 50개 미션의 출판면 대조, 교신 예외, 종료 정책, 캠페인 저장 범위 및 P1 검증 설계가 완료됐다. 최종 root 검증 및 commit/push 후 P1에 진입한다.

최종 검증: root typecheck PASS, test 2640 PASS(fail/cancel/skip0), build PASS(기존500kB chunk 경고 유지), 문서 링크 및 diff-check PASS. P0 통과; 해당 커밋 push 후 P1 구현을 시작한다.

### P1 코어 엔진

40장 생성·엄격한 inventory 검증·주입 난수 셔플·3–5인 배분, 최초 사령관, follow suit/로켓 우선, 승자와 다음 선두, 원자적 제출,3인13트릭 종료를 server-only 도메인으로 구현했다. create/parse는 참조를 분리하고 command는 actor/revision/소유권/합법 제출을 검증한다. 현재 트릭의 선도색 위반 및 조작된 최초 사령관 상태를 거절한다. 명시적인 플레이어별 공개 DTO·플랫폼 연결은 P6에서 구현한다.

- 전용28 tests PASS: cards11, trick14, simulation3(3·4·5인 각각12개 seed).
- root typecheck PASS; test shared127 + web649 + server1892 = **2668 PASS**, fail/cancel/skip0; build PASS(기존500kB chunk 경고 유지).
- 독립 코드 검토 보완2건 반영, diff-check PASS. 새 dependency 없음. commit/push 후 P2 진행.

### P2 목표·교신·조건 도메인

기본/특수 목표 배분, 순서 토큰의 같은 트릭 일괄 판정, 5인 목표 이전, 교신 제약과 공개 수명, 구조 신호 투표·동시 교환·재시도 이력, 관찰된 미션 조건 8종을 구현했다. 교신·구조 신호 진행 중 카드 제출을 막는 통합 경계와 미션별 종료 정책은 P3 이후 mission wrapper에서 연결한다.

- 전용59 tests PASS: communication13, distress8, primitives15, tasks23.
- root typecheck PASS; test shared127 + web649 + server1951 = **2727 PASS**, fail/cancel/skip0; build PASS(기존500kB chunk 경고 유지).
- 독립 검토에서 이력 위조 검증·조기 실패·배분 revision 하한을 보완했다. diff-check PASS. 새 dependency 없음. commit/push 후 P3 진행.

### P3 미션1–10

미션 번호별 확정 정의와 전체 revision을 가진 미션 실행 계층을 연결했다. 목표 선택·교신·구조 신호·지명 단계, 미션5 전량 진행, 미션9 및 목표 미션의 조기 종료, 실패 트릭을 보존하는 협동 결과를 검증했다. 조작된 상태와 terminal 이후 진행을 거절하며 하위 모듈 revision은 서버만 결정한다.

- 전용28 tests PASS: definitions8, mission6, integration9, validation5. 통합 테스트는 미션1–10 × 3/4/5인 × 2개 seed의60시도를 포함한다.
- root typecheck PASS; test shared127 + web649 + server1979 = **2755 PASS**, fail/cancel/skip0; build PASS(기존500kB chunk 경고 유지).
- 독립 규칙/실행 계층 검토 및 diff-check PASS. commit/push 후 P4 진행. 플랫폼 연결·실제 브라우저 검증은 아직 P6 이후 작업이다.

### P4 미션11–25

교신 금지 지명·교신 재개 시점, 로켓별 승리,9 승리 금지와 목표 복합 판정, 비공개 일괄 지정/순차 배분, 토큰 교환,5인 목표 양도를 연결했다. 미션12는 공개 교신 카드를 보호한 동시 무작위 교환과 서버 전용 교환 기록을 추가했다. 난수 오류는 PLAY 전체를 거절하며 종료 후 재추첨하지 않는다.

- P3/P4 전용49 tests PASS(이 단계21개 추가). 미션11–25 × 3/4/5인45개 시뮬레이션 및 별도 교환5개 검증 포함.
- root typecheck PASS; test shared127 + web649 + server2001 = **2777 PASS**, fail/cancel/skip0; build PASS(기존500kB chunk 경고 유지). 검증 당시 별도 LIAR 작업의 새 테스트1개가 포함되어 있으며 해당 파일들은 Space Crew 커밋 범위에서 제외했다.
- 독립 규칙/교환/실행 계층 검토 및 diff-check PASS. commit/push 후 P5 진행.

### P5 미션26–50

50개 미션 정의와 실제 관찰된 조건 조합을 모두 연결했다. 후반 승수·로켓 순서·Ω 최종 트릭,33/41의 YES/NO와 사령관 제외,40 토큰 이동,전체 금색 양도,46 최초 담당자 고정,50 역할 선호와 공동 동의를 구현했다. 구조 신호 후46 담당자 유지·3인 분홍 잔여 실패·50 중간 담당자별 최소 승수 없음까지 수작업 전체 게임으로 검증했다.

- 미션 계층 전용72 tests PASS(이 단계23개 추가). 미션26–50 × 3/4/5인75시도; 전체 구간 합계180시뮬레이션. P1–P5 Space Crew 전용 테스트 총159개.
- root typecheck PASS; test shared127 + web649 + server2024 = **2800 PASS**, fail/cancel/skip0; build PASS(기존500kB chunk 경고 유지).
- 독립 검토의50 선호 단계 revision 위조 검증을 보완했고 추가 finding 없음. diff-check PASS. commit/push 후 P6 진행. 현재 완료 범위는50미션 도메인이며, 방·브라우저·영구 저장 연결은 P6 이후다.

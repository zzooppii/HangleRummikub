# 라스베이거스 구현

규칙은 [VEGAS_GAME_RULES.md](./VEGAS_GAME_RULES.md). 기존 Room/Session/직렬화/UoW 경계를 유지한다.

- shared games/vegas: strict DTO, ROLL/PLACE action, 개인별 projection, 공개 카지노 지급 계산.
- server games/vegas: 순수 domain, 주입 Clock/RandomSource, application 원자 commit, 별도 adapter/projector/lifecycle. vegas:act는 인증 binding의 actor만 사용한다. 실패는 상태와 revision 유지, 동일 requestId 재시도는 동일 영수증.
- 같은 턴 굴리기도 revision 변경 후 deadline을 다시 예약하되 시간은 유지하여 오래된 callback 무효화와 overdue recovery를 함께 보장한다.
- web features/vegas: 독립 React 화면, 서버 확정과 선택 미리보기 구분, 게임/턴/revision 변경 시 draft 폐기. 실제 돈 합계와 더미는 서버의 viewer projection만 노출한다.
- 생성된 자체 boulevard 일러스트를 홈·대기실·헤더·카지노 창에 사용. 주사위는 CSS 점과 두께, 지폐는 액면별 자체 그래픽. 외부 자산 및 dependency 추가 없음.
- Web Audio로 주사위 굴림/배치/선택/동률/지폐/차례/종료를 합성. 사용자 제스처로 시작하고 음량·음소거 저장. 신규 revision에서만 이벤트 재생하며 처음 접속 시 과거 소리 재생 없음.
- 반응형 카지노 3/2/1열, 모바일 하단 조작, 색+문양+이름, reduced-motion 지원.

## 검증 결과 — 2026-09-11

- Root `npm run typecheck`: PASS.
- Root `npm test`: shared 126 + web 633 + server 1,742 = **2,501 PASS**, fail/skip 없음. UI 보정 후 전체 재검증 통과.
- Root `npm run build`: PASS. 기존 전체 게임 단일 JS 번들의 Vite 500 kB 초과 경고는 유지된다(현재 약 1.30 MB, gzip 약 366 KB). 이번 작업에서 dependency/lockfile 변경이나 무관한 코드 분할을 추가하지 않았다.
- `git diff --check`, 신규 문서 링크 검사: PASS.
- 최초 sandbox 실행은 Socket.IO loopback의 `listen EPERM`으로 실패했다. 로컬 소켓을 허용한 전체 실행으로 재검증해 모두 통과했다. 최초 브라우저 QA의 정적 웹 제공 옵션 누락도 미리보기 실행 설정을 수정해 해결했다.
- 신규 domain 6 / 실제 socket 7 / web 4 테스트. 2/3/4/5인 × 12 seeds로 수동/자동 진행 모두 4라운드까지 완주하며 매 행동의 54장 지폐·플레이어별 8개 주사위 보존 확인.
- 핵심 사례: 모든 동률 그룹 제외, 한 사람당 한 지폐, 남는 지폐 반환, 액면별 보존, 한번만 굴리기, 같은 눈 전체 배치, 재전송 단일 commit, 수동/timeout 경쟁, 오래된 callback 무효화, 29,999/30,000ms 경계, viewer 바인딩과 상대 잔액 미전송, 최종 지폐 수 tie-break/공동 승리, 재접속·재시작·명시적 퇴장·게임 교체.
- 실제 Chrome의 독립 2인 세션: UI 방 생성/참가/시작 → 굴리기 → 새로고침 후 같은 눈과 deadline 복원 → 선택 미리보기 → 배치 → 라운드 자동 정산. AudioContext running 및 소리 미리듣기, 음소거/음량 저장과 새로고침 복원 확인. 브라우저 page error/HTTP 실패 없음.
- 실제 Chrome의 독립 5인 세션: PC 1440px, 모바일 390px/320px에서 가로 넘침 없음. 모바일 대표 주사위+개수 조작부 219px, 선택 카지노 자동 스크롤, 밝은 제목 대비 확인. 실제 벽시계 30초 후 자동 배치와 다음 참가자 전환 확인.
- 실제 휴대전화 하드웨어와 스피커 청취 평가는 수행하지 않았다. 공개 배포는 하지 않았으며, 서버 재시작 후 지속 복구·확장 규칙은 후속 미확정 범위다.

## 파일과 아트

- `packages/shared/src/games/vegas/`: action 및 projection 계약.
- `apps/server/src/games/vegas/`: domain/application/adapter/projector/lifecycle.
- `apps/web/src/features/vegas/`: 게임 화면, CSS, preview, clock, sound.
- 공통 game type/catalog, router, persistence, Socket.IO, snapshot decoder, Home 및 App에 VEGAS 연결.
- [생성 일러스트](../apps/web/public/images/vegas/boulevard.webp): 내장 image_gen으로 생성한 원본을 WebP로 재인코딩해 약 308 KB. [최종 프롬프트와 제작 기록](../image/vegas/README.md).


# 구룡투 구현 경계

[규칙과 온라인 정책](./GURYONGTU_GAME_RULES.md)을 따른다. 기존 Room/Session/직렬화 구조를 유지한다.

- shared `games/guryongtu`: strict DTO와 projection. `guryongtu:act`는 gameId, expectedGameRevision, turnId, opaque tileId를 받는다. `guryongtu:nextRound`는 roundId와 revision을 검증한다.
- server domain: PLAYING(ATTACK/DEFEND), ROUND_RESULT, FINISHED. 서버가 모든 18개 타일과 사용 내역을 소유한다. 순수 함수가 candidate를 만들고 숫자 비교·보존·승수·공격자 전이를 검증한다.
- application: 인증 actor와 방 종류·phase·revision·차례를 확인한다. room lane에서 mutation과 성공 영수증을 UoW로 한 번만 commit한다. 모르는 타일과 상대 타일은 같은 외부 오류다. 첫 공격자와 ID는 기존 RandomSource/IdGenerator를 사용한다.
- projection: 상대 타일의 ID·숫자는 어떤 phase에서도 전송하지 않는다. 공개 정보는 홀짝 개수, 제출 홀짝, 승수, 대결 결과다. 자기 hand·submitted·used만 privateState로 전달한다.
- web: 별도 React 화면, local selection과 확정 버튼. 서버 응답 유실은 같은 requestId로 재확인하며 stale scope 응답은 새 선택을 지우지 않는다. 서버가 다음 차례로 전환하고 연출은 표시만 보조한다.
- lifecycle: 제한시간 없음(activeTurn:null). 단절은 재접속 대기, 명시적 leave는 취소, 종료 후 기존 retention/host succession/room game selection 적용. 과거 게임 command는 새 gameId에서 거절한다.

## 검증

- Root `npm run typecheck`, `npm test`, `npm run build`, `git diff --check` 통과. 전체 실행은 shared 124 / web 604 / server 1,638, 총 2,366개 통과했다. 이후 이전 대결 결과에 번호를 붙이는 UI 수정과 회귀 테스트를 추가하여 web 605개를 재실행하고 root build를 다시 통과했다. 현재 테스트 구성은 총 2,367개이며 실패·skip 없음.
- Domain: 숫자 81조합, 1–9 예외, 타일 보존·재사용 거절·원자성, 무승부 공격자 유지, 동률 재경기, 조기 확정, 2승 종료, cancel 중 제출 비밀 유지.
- 실제 Socket.IO: 1/2/3인 admission, 구버전 capability 거절, 상대 ID와 없는 ID의 동일 오류, 잘못된 actor·payload, 중복·충돌·stale 요청, 비밀 제출 후 resume와 이전 primary 거절, 동시 다음 판 확인, full match, 60초 후 종료 방장 승계, 같은 방 재시작과 과거 gameId 거절. 공통 게임 교체 회귀에도 GURYONGTU를 포함했다.
- Web: 대기실·플레이·취소 화면 SSR, 9개 접근 가능한 타일 버튼, 연결 단절 시 비활성화, actor/scope 기반 선택, strict DTO·viewer identity, 이전 대결과 다음 대결 문구 구분을 테스트했다.
- 로컬 미리보기는 기존 프로세스와 충돌하지 않는 `127.0.0.1:5179`(server 3019)에서 시작하고 HTTP 200을 확인했다. 브라우저 클릭·스크린샷·실기기 시각 검수는 수행하지 않았다.
- 기존 Vite 500 kB 초과 경고 유지: 전체 게임 JS 약 1,107 kB(gzip 약 311 kB). 의존성·lockfile·배포 설정 변경 없음. 공개 배포하지 않았다.
- 초기 검증에서 기존 16개 게임 목록 기대값과 새 테스트의 타입·ID 부분문자열 비교 문제가 발견되어 수정한 뒤 재검증했다. 비밀 ID 검사는 JSON 문자열의 완전한 ID 값으로 비교한다.

## 변경 위치

- `packages/shared/src/games/guryongtu/{actions,contracts}.ts`, game type·protocol·realtime·V2 snapshot 등록.
- `apps/server/src/games/guryongtu/`: domain, application service/lifecycle/host succession, storage adapter와 개인별 projector.
- `apps/web/src/features/guryongtu/{GuryongtuScreen.tsx,guryongtu.css,ui.ts}`: 흑백 타일과 녹색 대결장, 모바일 5열 손패, 결과/기록/재시작 화면.
- 기존 composition root, room persistence/routers/lifecycle, Socket.IO, web snapshot decoder·realtime client·app routing·게임 목록 연결.
- 도메인·통합·웹 테스트와 [규칙 문서](./GURYONGTU_GAME_RULES.md). 향후 미확정 범위는 규칙 문서의 TO_BE_CONFIRMED를 따른다.

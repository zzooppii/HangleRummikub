# 카르카손 구현 경계

[규칙과 온라인 정책](./CARCASSONNE_GAME_RULES.md)을 기존 Room/Session/직렬화/UoW 플랫폼에 연결한다.

- Shared: 공개 타일 카탈로그, 90도 회전·연결 그래프·배치 가능성, strict action/projection DTO. 서버 내부 덱·저장 state는 노출하지 않는다.
- Domain: 타일 72장 보존, 미플 7개 보존, feature 연결·완성·최다 점유·농부의 도시 중복 제거·최종 정산. 입력 state를 수정하지 않고 candidate를 반환한다. 시간·난수·ID는 주입한다.
- Application: actor/current-primary/room/game/turn/revision/deadline 검증, 방 직렬화, idempotency와 전체 candidate 단일 commit. timeout은 같은 lane과 기존 scheduler/overdue recovery를 사용한다.
- Projection: 보드와 현재 타일 및 점수는 공개한다. 덱은 count만 전송한다. 카드형 게임과 달리 이번 타일은 공동 정보다.
- Web: 독립 React 화면. 지도 pan/zoom/전체 보기, 합법 위치, 90도 회전, 영역별 미플 선택, 공개 feature 강조, 확정 전 preview, 결과 내역, 재접속과 응답 유실 재확인. 룰 엔진은 컴포넌트 밖에 둔다.
- Art: 자체 생성 성곽·전원 일러스트를 홈/대기실에 사용한다. 실제 타일은 카탈로그와 같은 region 정의에서 자체 SVG 지형·성벽·도로·미플을 그린다.
- Sound: Web Audio의 목재 타격·현·종 계열 자체 합성음, 선택/회전/미플/서버 배치/정산/내 차례/종료/마감 구분. 음소거·볼륨, reduced motion, 터치/키보드 지원.

## 주요 파일

- [공개 카탈로그](../packages/shared/src/games/carcassonne/catalog.ts), [연결 그래프](../packages/shared/src/games/carcassonne/geometry.ts), [공개 계약](../packages/shared/src/games/carcassonne/contracts.ts)
- [서버 규칙 엔진](../apps/server/src/games/carcassonne/domain/game.ts), [명령·타이머 처리](../apps/server/src/games/carcassonne/application/service.ts)
- [플레이 화면](../apps/web/src/features/carcassonne/CarcassonneScreen.tsx), [지도](../apps/web/src/features/carcassonne/CarcassonneBoard.tsx), [아트·사운드 제작 기록](../image/carcassonne/README.md)

## 연결 표현

도시·도로의 포트는 북/동/남/서 = 0/1/2/3이다. 들판은 각 변을 둘로 나눈 8개 포트를 사용한다. 북서쪽 북변부터 시계 방향으로 0–7이며 반대편 연결은 좌우가 뒤집힌다. 회전 시 도시·도로는 1포트, 들판은 2포트씩 이동한다. 도시는 같은 타일의 분리된 영역이 바깥에서 다시 연결될 수 있으므로 영역 노드 수와 고유 타일 수를 구분한다.

## 검증 — 2026-09-11

- root `npm run typecheck`: 통과.
- root `npm test`: **2,482개 통과**, 실패·skip 없음(shared 126, web 629, server 1,727).
- root `npm run build`: 통과. 기존 통합 JS 번들의 500 kB 초과 경고는 남아 있다(현재 1,271.54 kB, gzip 359.34 kB). 게임 외 번들 구조 개편은 하지 않았다.
- `git diff --check`: 통과. 새 dependency 및 lockfile 변경 없음.
- 카르카손 도메인 14개: 공식 수량·회전·모든 접면, 도시 연결/분리·동률·방패·동일 타일 중복 방지, 도로 고리·교차로, 들판 분리·도시 중복 제거, 수도원 8방향, 배치 전 점유 검사, 원자성·보존·프라이버시, 배치 불가 재추첨, 시간 초과, 2–5인 각각 3개 seed의 완주.
- 실제 Socket.IO 9개: 2–5인 시작과 정원, 위조/오래된 명령, 공개 projection 일치, 재전송과 경쟁, 새 primary로 재접속, 서버 마감, 자동 턴, 완주·방장 승계·재시작·나가기 취소.
- Web 5개: 화면/DTO/미리보기/점유/볼륨 및 sound cue 중복 방지. 소리가 지원되지 않는 환경에서도 게임은 유지된다.
- 실제 브라우저: 데스크톱 1365×900, 모바일 390×844 및 320×740 확인. 모바일 가로 넘침 없음, 미플 목록 터치 높이 44px. 타일 회전→위치→미플→확정, 영역 강조, 지도 전체 보기·확대, 음소거 저장과 새로고침 복원을 확인했다.
- 별도 로컬 서버에서 브라우저 1명과 임시 Socket.IO 플레이어 4명으로 72장 게임을 완료했다. 결과 33/14/16/23/25점과 상세 정산 및 새로고침 후 72장 복원 확인. 브라우저 console error/warn 없음. 임시 플레이어는 테스트 도구이며 제품의 AI 상대 기능이 아니다.

공개 배포는 진행하지 않았다. 강·수도원장·기타 확장과 제한 시간 선택 등 후속 범위는 [규칙 문서](./CARCASSONNE_GAME_RULES.md)의 `TO_BE_CONFIRMED`에 남긴다.

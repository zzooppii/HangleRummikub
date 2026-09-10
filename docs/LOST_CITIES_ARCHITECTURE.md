# 로스트시티 구현 경계

[규칙과 온라인 정책](./LOST_CITIES_GAME_RULES.md)을 따른다. 기존 Room/session/Socket.IO/직렬화/UoW 경계를 유지하고 LOST_CITIES 구체 분기를 추가한다.

- shared games/lost-cities: opaque card ID, 카드·한 턴 행동·개인별 projection과 strict runtime schema.
- server games/lost-cities/domain: 60장 보존, 투자·숫자 배치, 원자적 후보 상태, 점수와 3라운드 매치. 시간·난수·ID는 입력으로 받는다.
- application: 인증 actor, room/game phase·revision, turn/round identity 검증. 행동/퇴장/라운드 전환을 방 단위로 직렬화하고 성공 상태와 idempotency 영수증을 함께 commit. 비인가 카드와 존재하지 않는 ID는 같은 외부 오류.
- compatibility: concrete 저장 adapter와 per-viewer whitelist projector. activeTurn deadline은 null이며 이전 게임 타이머는 사용하지 않는다.
- web features/lost-cities: 일러스트 카드, 다섯 탐험 열, 중앙 버림 더미, 하단 손패와 로컬 선택. 서버 응답 전 실제 보드를 변경하지 않는다. 응답 유실은 같은 requestId로 재확인한다.
- 내부 phase는 PLAYING/ROUND_RESULT/FINISHED. ROUND_RESULT 동안 room은 PLAYING. 매치 gameId를 유지하며 새 라운드에는 새 roundId·카드 ID, 매 턴 새 turnId를 사용한다.
- 공용 목록·인원·capability·start/lifecycle/projector·decoder/renderer의 필요한 연결만 추가한다. 기존 게임 일반화와 새 dependency는 없다.

## 시각 자료

내장 imagegen으로 생성한 자체 다섯 탐험 atlas를 apps/web/public/images/lost-cities/expeditions.png에 저장한다. 숫자·프레임·투자 표식은 HTML/CSS로 렌더링한다. 프롬프트는 해당 폴더 README에 기록한다.

## 검증

2026-09-11 로컬 구현 검증:

- root `npm run typecheck`: 통과.
- root `npm test`: shared 121 + web 570 + server 1,520 = 2,211개 통과. skip/실패 0개. 최초 제한 환경에서는 loopback listen이 EPERM으로 차단되어, 로컬 네트워크 사용이 허용된 실행으로 전체 재검증했다.
- root `npm run build`: 통과. Vite의 500 kB 초과 chunk 경고는 남아 있다. 현재 web JS 947.83 kB, gzip 268.29 kB. 전체 게임 번들 분할은 이번 변경 범위에 포함하지 않았다.
- `git diff --check`: 통과. 규칙·구현 문서와 로컬 파일 링크를 확인했다.
- 새 도메인 테스트: 60장 구성·보존, 투자/오름차순, 점수·8장 보너스, 잘못된 행동의 원본 보존, 버림 더미, 마지막 덱 카드, 공동 승리, 취소, 저장 상태 검증. 20개 시드로 각 3라운드 매치를 실행하면서 매 턴 보존과 비공개 projection을 검사한다.
- 새 Socket.IO 테스트: 2인 제한, capability, 인증/턴/카드 소유권, 원자적 실패, 같은 요청 재시도·경쟁 명령, 재접속과 이전 연결의 권한 차단, 132턴 3라운드 완료, 양측 확인·동일 방 재시작, 명시적 퇴장.
- 새 web 테스트: 대기실·플레이·라운드 결과·최종 결과 렌더링, 카드 선택·행동 미리보기, 정렬·배치 가능 여부, strict 계약 검사.
- 두 독립 브라우저로 방 생성·참가·시작, 투자/숫자 놓기, 버리기·덱 가져오기·공용 카드 가져오기, 실시간 턴 동기화를 확인했다. 새로고침 후 같은 손패 8장과 덱 잔량·턴이 복구됐다. 390 px와 320 px viewport에서 가로 넘침 없이 보드 5열과 손패가 표시됐다.

실물 휴대폰 테스트와 공개 배포는 수행하지 않았다. 서버 재시작 후 복구, 확장판·AI·관전·타이머는 [후속 미확정 범위](./LOST_CITIES_GAME_RULES.md#to_be_confirmed--후속-범위)다.

## 주요 변경 파일

- [공유 행동 계약](../packages/shared/src/games/lost-cities/actions.ts), [개인별 화면 계약](../packages/shared/src/games/lost-cities/contracts.ts)
- [게임 규칙 엔진](../apps/server/src/games/lost-cities/domain/game.ts), [서버 명령 처리](../apps/server/src/games/lost-cities/application/service.ts), [개인별 projection](../apps/server/src/games/lost-cities/compatibility/projector.ts)
- [게임 화면](../apps/web/src/features/lost-cities/LostCitiesScreen.tsx), [스타일](../apps/web/src/features/lost-cities/lost-cities.css), [일러스트 출처·프롬프트](../apps/web/public/images/lost-cities/README.md)
- 공용 게임 목록, Room 저장/시작/퇴장/재접속, Socket.IO와 web renderer에 LOST_CITIES 구체 분기를 연결했다.

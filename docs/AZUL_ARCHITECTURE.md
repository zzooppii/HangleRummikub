# 아줄 구현과 화면 검증

2026-09-11. 사용자가 승인한 [기본판 규칙과 온라인 정책](./AZUL_GAME_RULES.md)을 기존 Room/Session 플랫폼에 연결한다.

## 서버와 계약

- `packages/shared/src/games/azul`: 5색 타일, source/color/destination, 플레이어 보드, 최근 라운드 정산과 최종 결과. 모든 네트워크 입력은 strict runtime schema로 검증한다.
- `azul:act`: requestId, gameId, expectedGameRevision, turnId와 선택 payload. actor는 Socket.IO 인증 binding에서만 얻는다. 클라이언트는 수량·점수·타일 이동 결과를 제출하지 않는다.
- `apps/server/src/games/azul/domain`: 타일 100개를 opaque tileId로 구분한다. 주머니, 버림 더미, 공장, 가운데, 준비 줄, 벽, 바닥 전체에서 중복·누락·색별 수량을 검증한다. 선 표식은 일반 타일과 분리한다. 도메인은 주입된 난수만 사용한다.
- `application`: 같은 방 직렬화 → actor/phase/identity/revision/규칙 검증 → 전체 candidate → RoomUnitOfWork 원자적 commit. 중복 성공 요청은 재적용하지 않고 기존 영수증을 반환한다. 실패한 명령은 기존 state/revision을 보존한다.
- `compatibility`: 구체적인 AzulRoomRecord와 adapter/projector. 서버 내부 state를 그대로 broadcast하지 않는다. 모든 보드는 공개하고, 주머니/버림 더미는 총 개수만 전송한다. 각 타일 ID와 다음 추첨은 비공개다.
- 게임 phase는 PLAYING/FINISHED. 라운드 정산과 다음 배분은 마지막 유효 행동 안에서 자동 처리하고 `lastRound`를 보관한다. UI 애니메이션 완료 확인을 기다리지 않는다.
- 각 턴은 서버 Clock 기준 30초다. `turnStartedAt`/`deadlineAt`을 공개하고 adapter의 activeTurn에 등록하여 공통 overdue 복구 경로에서도 처리한다. 종료 시 deadline은 null이다. 연결이 끊겨도 타이머는 계속 흐르며 명시적 퇴장은 무승부가 아닌 CANCELLED로 종료한다. 공통 Room 게임 교체/재시작과 60초 종료 후 방장 승계를 연결한다.

## UI

- `apps/web/src/features/azul`: 독립 React 화면과 순수 preview 함수. 서버 projection과 미확정 선택을 구분하며 차례 identity가 달라지면 선택을 폐기한다.
- 짙은 청록 테이블, 아이보리 개인 보드, 유약 하이라이트와 두께 그림자가 있는 5종 자체 SVG 도자기 타일, 원형 공장 받침.
- 생성한 포르투갈 정원 아트는 대기실/게임 헤더/홈 게임 카드에 사용한다. 제작 경로·프롬프트는 [아트 기록](../image/azul/README.md).
- 공장 하나의 같은 색 전체를 선택하고 준비 줄 또는 바닥을 선택한 뒤 확정한다. 초과 타일·추가 감점·선 표식·완성될 벽 위치를 함께 표시한다. 금지 줄의 이유는 접근성 이름 및 펼침 안내로 제공한다.
- 상대의 점수·축소 벽·각 준비 줄의 색과 수량을 볼 수 있으며 보드를 펼칠 수 있다. 상대 보드에는 행동 버튼이 없다.
- 모바일에서 타일을 선택하면 내 보드로 이동하고 다시 고르기는 공용 타일로 돌아간다. 하단 확정 버튼은 sticky이며 UI는 가로 스크롤 없이 재배치된다.
- 서버 정산 후 새 벽 타일의 이동과 점수 내역 강조를 표시한다. `prefers-reduced-motion`에서 이동과 애니메이션을 줄인다. 색과 문양을 함께 사용하며 touch/keyboard로 조작할 수 있다.
- 응답 유실이면 같은 requestId의 결과 확인을 제공한다. 확정 거절과 연결 오류를 구분한다.

## 최초 구현 검증 결과

- Root `npm run typecheck`: PASS.
- Root `npm test`: shared 124 / web 597 / server 1,622, 합계 **2,343 PASS**, 실패·skip 없음.
- Root `npm run build`: PASS. 기존 전체 게임 단일 번들의 Vite 500 kB 초과 경고는 남아 있다(JS 약 1,077 kB, gzip 303 kB). 이 작업에 dependency 또는 코드 분할 구조를 추가하지 않았다.
- `git diff --check`: PASS.
- 신규 아줄 테스트: domain 10 / 실제 Socket.IO 7 / web UI·DTO 4. 2/3/4인 각각 6개 seed로 게임 종료까지 진행하며 100개 타일 보존을 매 행동마다 확인했다.
- 경계 사례: 같은 색 전체 가져오기, 넘침, 선 표식 우선 배치와 바닥 포화, 잘못된 actor/source/row, 가로·세로 연결, 위→아래 정산, 미완성 줄 보존, 0점 하한, 주머니 재충전, 가운데를 사용하지 않은 라운드 선 유지, 종료 보너스와 공동 승리.
- 소켓: 1/5인 거절, 2/3/4인 시작, private bag 미전송, 입력 injection, stale/duplicate/concurrent 명령, primary 연결 교체, capability 거절, 자동 정산·게임 종료, 방장 승계·재시작·명시적 퇴장.
- 브라우저: 독립 origin 세션(localhost/127.0.0.1) 두 개에서 방 생성 → 초대 참가 → 준비 확인 없는 시작 → 코발트 3개 중 준비 줄 2개/바닥 1개 → 가운데 백자와 선 표식 획득 → 첫 라운드 정산과 2라운드 자동 배분을 확인했다.
- 반응형: desktop 1365×1000, mobile 390×844와 320×740 viewport에서 실제 화면을 확인했다. 모바일 가로 넘침 없음과 새로고침 후 같은 개인 보드·선 표식·차례 복원을 확인했다. 실제 모바일 하드웨어 검증은 별도다.
- 최초 sandbox 소켓 테스트의 loopback EPERM은 로컬 소켓 권한이 허용된 실행으로 재검증하여 모두 통과했다.

이 기록은 로컬 구현/검증이다. public 배포는 수행하지 않았다. 기존 작업 중이던 스플렌더 변경은 보존했다. 회색 보드/확장판/AI/관전/서버 재시작 복구는 후속 미확정 항목이다.

## 30초 타이머·소리·차례 강조 (2026-09-11)

- 사용자 승인: 각 턴 30초, 만료 시 자동 선택·배치 후 다음 차례. 서버가 공개 타일과 해당 플레이어 보드만 보고 넘침 최소 → 배치 수 최대 → 낮은 준비 줄/공장/색 순으로 결정한다. 기본판의 타일 보존·정산 규칙은 그대로 적용한다.
- 만료 경계 `now >= deadlineAt`의 수동 명령은 TURN_EXPIRED. timeout은 gameId/revision/turnId/deadlineAt 전체를 검증하고 같은 room 직렬화와 원자적 commit을 사용한다. 초기 시작·정상 입력·자동 입력마다 새 타이머를 예약하고 오래된 callback은 무시한다. 재접속으로 시간을 늘리지 않는다.
- `sound.ts`: 4개 공명 성분과 짧은 stereo 잔향을 합성하는 Web Audio 효과음. 선택/미리보기/서버 배치/차례 시작/라운드/종료/5초 안내를 구분한다. 실제 배치음은 새 서버 revision에서만 재생하며 새로고침/중복 snapshot에서 과거 배치를 재생하지 않는다. 사용자 제스처로 오디오를 열고, 음량·음소거를 저장하며 장치 오류는 게임 진행에 영향을 주지 않는다. 외부 오디오 dependency/다운로드 없음.
- 내 차례는 금색 안내판, 큰 한글 안내, 원형 남은 시간, 개인 보드 테두리와 sticky 조작부로 표시한다. 5초 이하는 경고색과 한 번의 부드러운 알림을 사용하며 reduced-motion을 따른다. 클라이언트 countdown은 serverTime과 monotonic elapsed time을 이용한 표시용 추정이다.

### 후속 검증

- Root typecheck/test/build 및 `git diff --check` 통과. 기존 Vite 500 kB 초과 번들 경고는 남아 있다. 전체 shared 124 + web 611 + server 1,659 = **2,394 PASS**, fail/skip 없음. 함께 진행 중인 클루 등 다른 게임의 테스트도 포함한 현재 작업 트리 기준이다.
- 신규 검증: 29,999ms 정상 입력/30,000ms 거절, 조기·오래된·중복 timeout 무시, 수동 입력과 timeout 경쟁 시 단일 commit, 재접속 deadline 유지, 종료 시 active deadline 제거, 2/3/4인 전원 자동 진행으로 매치 완주와 타일 보존, 차례 안내/음량 컨트롤 접근성, 중복 snapshot 음향 재생 방지.
- 실제 독립 브라우저 두 세션에서 30초 경과 → 자동 배치 → 상대 차례 전환, 수동 선택/배치와 다음 타이머, 소리 미리듣기 버튼과 음소거 저장/새로고침 복원을 확인했다. 390px/320px 모바일 viewport에서 가로 넘침 없이 안내·타이머·sticky 버튼을 확인했다.
- Public 배포와 추가 commit은 수행하지 않았다.

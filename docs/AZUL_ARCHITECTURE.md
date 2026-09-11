# 아줄 구현과 화면 검증

2026-09-11. 사용자가 승인한 [기본판 규칙과 온라인 정책](./AZUL_GAME_RULES.md)을 기존 Room/Session 플랫폼에 연결한다.

## 서버와 계약

- `packages/shared/src/games/azul`: 5색 타일, source/color/destination, 플레이어 보드, 최근 라운드 정산과 최종 결과. 모든 네트워크 입력은 strict runtime schema로 검증한다.
- `azul:act`: requestId, gameId, expectedGameRevision, turnId와 선택 payload. actor는 Socket.IO 인증 binding에서만 얻는다. 클라이언트는 수량·점수·타일 이동 결과를 제출하지 않는다.
- `apps/server/src/games/azul/domain`: 타일 100개를 opaque tileId로 구분한다. 주머니, 버림 더미, 공장, 가운데, 준비 줄, 벽, 바닥 전체에서 중복·누락·색별 수량을 검증한다. 선 표식은 일반 타일과 분리한다. 도메인은 주입된 난수만 사용한다.
- `application`: 같은 방 직렬화 → actor/phase/identity/revision/규칙 검증 → 전체 candidate → RoomUnitOfWork 원자적 commit. 중복 성공 요청은 재적용하지 않고 기존 영수증을 반환한다. 실패한 명령은 기존 state/revision을 보존한다.
- `compatibility`: 구체적인 AzulRoomRecord와 adapter/projector. 서버 내부 state를 그대로 broadcast하지 않는다. 모든 보드는 공개하고, 주머니/버림 더미는 총 개수만 전송한다. 각 타일 ID와 다음 추첨은 비공개다.
- 게임 phase는 PLAYING/FINISHED. 라운드 정산과 다음 배분은 마지막 유효 행동 안에서 자동 처리하고 `lastRound`를 보관한다. UI 애니메이션 완료 확인을 기다리지 않는다.
- 시간 제한이 없으므로 activeTurn deadline은 null. 연결 끊김은 게임에 영향을 주지 않으며 명시적 퇴장은 무승부가 아닌 CANCELLED로 종료한다. 공통 Room 게임 교체/재시작과 60초 종료 후 방장 승계를 연결한다.

## UI

- `apps/web/src/features/azul`: 독립 React 화면과 순수 preview 함수. 서버 projection과 미확정 선택을 구분하며 차례 identity가 달라지면 선택을 폐기한다.
- 짙은 청록 테이블, 아이보리 개인 보드, 유약 하이라이트와 두께 그림자가 있는 5종 자체 SVG 도자기 타일, 원형 공장 받침.
- 생성한 포르투갈 정원 아트는 대기실/게임 헤더/홈 게임 카드에 사용한다. 제작 경로·프롬프트는 [아트 기록](../image/azul/README.md).
- 공장 하나의 같은 색 전체를 선택하고 준비 줄 또는 바닥을 선택한 뒤 확정한다. 초과 타일·추가 감점·선 표식·완성될 벽 위치를 함께 표시한다. 금지 줄의 이유는 접근성 이름 및 펼침 안내로 제공한다.
- 상대의 점수·축소 벽·각 준비 줄의 색과 수량을 볼 수 있으며 보드를 펼칠 수 있다. 상대 보드에는 행동 버튼이 없다.
- 모바일에서 타일을 선택하면 내 보드로 이동하고 다시 고르기는 공용 타일로 돌아간다. 하단 확정 버튼은 sticky이며 UI는 가로 스크롤 없이 재배치된다.
- 서버 정산 후 새 벽 타일의 이동과 점수 내역 강조를 표시한다. `prefers-reduced-motion`에서 이동과 애니메이션을 줄인다. 색과 문양을 함께 사용하며 touch/keyboard로 조작할 수 있다.
- 응답 유실이면 같은 requestId의 결과 확인을 제공한다. 확정 거절과 연결 오류를 구분한다.

## 검증 결과

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

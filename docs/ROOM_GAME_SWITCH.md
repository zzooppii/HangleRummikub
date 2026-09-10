# 같은 방에서 게임 교체

2026-09-10 사용자 승인에 따른 공통 방 기능. 기존 문서의 방 생애 전체에 대한 immutable gameType 정책을 이 문서로 대체한다. 게임 한 판의 종류는 고정하며, 방의 선택 게임은 LOBBY 또는 FINISHED에서만 교체한다.

- `room:selectGame`: 현재 primary 방장, 참가 자격, room revision, 이전 gameId/game revision을 검증한다. 방 단위 직렬화와 UoW로 게임 제거 및 LOBBY 전환을 한 번만 commit한다. 같은 종류를 선택해도 FINISHED에서 새 대기실로 돌아올 수 있다.
- RoomId, roomCode, 생성 시각, 남아 있는 참가자의 playerId/nickname/joinOrder, 방장, 세션은 보존한다. 명시적으로 퇴장한 참가자는 복원하지 않는다. 기존 게임별 설정은 기본값으로 초기화한다.
- 교체 후 `readyPlayerIds`를 비운다. `room:ready`는 자신의 준비 여부만 변경하고 room revision을 증가시킨다. V2 참가자의 선택적 `isReady`가 준비 필요 여부 및 상태를 표현한다. 기존 최초 생성 대기실의 시작 동작은 유지한다.
- 교체된 방에서는 모든 참가자가 준비·접속해야 시작할 수 있다. 지원 인원보다 많은 기존 참가자를 강퇴하지 않고 대기실에 보존하되 시작은 막는다. 관전은 제공하지 않는다.
- 현재 접속 중인 클라이언트가 대상 게임의 V2 계약 및 `supportsRoomPreparation: true` handshake capability를 지원하는지 확인한다. 구버전 참가자가 있으면 새로고침 안내와 함께 교체를 거절한다. 오프라인 참가자는 재접속 시 현재 게임 capability를 다시 검증한다.
- 일반 REPLACE의 gameType 불변 조건은 유지하고 전용 RESET_GAME mutation만 교체를 허용한다. PLAYING 교체는 저장 경계에서도 거절한다.
- 새 시작은 기존 start service로 새 gameId/turn identity를 생성한다. 과거 game/timer/retention callback은 기존 identity 및 revision 검사로 무효화한다. 재전송된 성공 요청은 새 게임을 다시 지우거나 타이머를 취소하지 않는다.
- 클라이언트는 gameId 또는 gameType 변경을 room revision으로 정렬한다. 늦게 도착한 이전 게임 snapshot은 무시하고 동일 revision의 모순은 동기화를 요청한다.
- 게임 결과 이력, 누적 점수, 진행 중 강제 종료, 서버 재시작 후 방 복구는 이번 범위 밖이다.

## 변경 위치와 검증

- 공유 계약: `packages/shared/src/room-game-selection.ts`, V2 참가자 준비 상태와 대기실 인원 범위.
- 서버: `RoomGameSelectionService`, 전용 `RESET_GAME` UoW, 공통 시작 준비 확인, Socket.IO capability/admission, 퇴장 명단 보존과 방장 승계.
- 클라이언트: `RoomGameControls`, 공통 방 명령, 모든 게임의 gameId/roomRevision 정렬과 이전 게임 편집 상태 정리, 종료 화면의 대기실 이동.
- 게임별 실제 규칙·승패·시간 초과 정책은 유지한다. 그림 릴레이는 퇴장만으로 바로 끝나지 않으므로 실제 deadline/reveal 흐름으로 종료 후 교체를 검증했다.
- Root `npm test`: shared 121, web 529, server 1,449, 총 **2,099 PASS**. 로컬 소켓을 허용한 실행 기준이다. 초기 sandbox 실행의 loopback EPERM은 권한이 허용된 실행으로 재검증했다.
- Root `npm run typecheck`, `npm run build`, `git diff --check`: PASS. 빌드에는 단일 JS 번들 891 kB에 대한 Vite 500 kB 초과 경고가 남아 있다.
- 브라우저: 한글 방 생성 → 스플렌더 선택 → 기존 코드로 다른 참가자 입장 → 두 참가자 준비 → 새 게임 시작 → 새로고침 재접속 → 종료 → 숫자 타일 대기실 전환. 방 코드와 남은 참가자 유지 및 퇴장자 제거 확인.
- 미포함: 공개 배포, 게임 진행 중 교체, 관전자, 누적 점수, 결과 이력 저장.

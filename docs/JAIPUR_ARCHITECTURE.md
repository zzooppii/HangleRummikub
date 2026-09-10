# 자이푸르 구현 경계

2026-09-10. [규칙과 온라인 정책](./JAIPUR_GAME_RULES.md)을 따른다.

- shared: 카드/행동/개인별 projection 및 strict runtime schema. `jaipur:act`는 gameId, game revision, turnId를 받고 TAKE_GOOD/TAKE_CAMELS/EXCHANGE/SELL을 처리한다. `jaipur:nextRound`는 roundId와 game revision을 검증한다.
- server domain: 주입된 덱·보너스 순서로 배분하고 상태를 복제하여 행동·정산·라운드 전환을 판정한다. 매 라운드 카드 55장에 새 opaque ID를 부여한다. 모든 카드 zone의 중복·소유·상품별 구성, 상품/보너스 토큰 multiset과 손패 7장을 검증한다.
- application: room 직렬 실행, actor authorization, revision, 현재 차례를 확인하고 RoomUnitOfWork로 candidate와 성공 영수증을 한 번만 commit한다. 존재하지 않는 카드와 상대 비공개 카드는 같은 외부 오류를 반환한다. 시간·무작위·ID는 기존 port를 사용한다.
- compatibility: 구체적인 JaipurRoomRecord/adapter/projector를 기존 플랫폼에 연결한다. 제한시간이 없으므로 lifecycle의 activeTurn은 null이며 이전 게임의 timer는 적용하지 않는다.
- web: 게임별 React 화면과 로컬 선택 draft. 공개 카드/토큰과 자기 privateState만 렌더링하고 서버 응답 전에는 판을 변경하지 않는다. 확정 거절과 응답 유실을 구분하며 유실 시 같은 requestId를 재확인한다.

게임 내부 phase는 PLAYING, ROUND_RESULT, FINISHED다. ROOM은 ROUND_RESULT 중에도 PLAYING을 유지한다. gameId와 game revision은 매치 전체 범위이며 라운드가 바뀔 때 새 roundId/turnId를 사용한다. 결과 확인 명령은 차례 명령이 아니므로 양쪽 플레이어가 보낼 수 있다. 대기실 room:ready는 사용하지 않는다.

인원 메타데이터는 shared `GAME_PLAYER_LIMITS`에서 관리하며 자이푸르는 2–2다. 3명 이상인 방의 게임 교체는 참가자를 보존하되 시작을 거절한다. 모든 게임을 3명으로 시작하던 공통 테스트는 자이푸르에서 2인 fixture를 사용한다.

최신 `f8dd4bf`는 사용자 요청으로 준비 확인을 시작 조건에서 제거했다. 이전 검토의 준비 취소 경쟁 조건은 현 정책에 해당하지 않으므로 준비 검사를 되살리는 수정은 하지 않는다.

## 로컬 검증 (2026-09-10~11)

- root `npm run typecheck`, `npm test`, `npm run build`, `git diff --check` 통과. 전체 테스트 2,189개(shared 121, web 564, server 1,504), 실패·skip 없음.
- 도메인 검증: 20가지 결정적 초기 배치로 매치를 끝까지 진행하며 카드와 토큰 보존, 라운드 종료, 인장 2개 승리를 확인했다. 시장용 낙타 3장은 먼저 제외하고 나머지 52장만 섞는 경로를 실제 시작 서비스에서 검증한다.
- 실제 Socket.IO 검증: 2인 제한, 서버 입력 검증, 비공개 projection, 중복·동시·오래된 명령, 재접속과 기존 연결 해제, 두 사람의 라운드 확인, 방장 승계, 취소와 같은 방 재시작. 기존 10개 게임과 자이푸르 사이의 전환도 검증했다.
- production 빌드를 로컬에서 실행하고 별도 Chrome 프로필 2개로 생성·참가·시작, 상품 1장 획득, 낙타 전체 가져오기, 다이아몬드 판매(1장 거절/2장 14점), 새로고침 복원을 확인했다. 390×844 모바일에서는 금 2장과 낙타 2마리 교환, 손패 7장, 하단 확정 조작과 카드 배치를 확인했다.
- 빌드의 500 kB 초과 chunk 경고는 남아 있다(전체 게임을 포함한 JS 약 924 kB, gzip 약 263 kB). 게임별 코드 분할은 별도 개선 범위다. 새 dependency는 추가하지 않았다.

이번 기록은 로컬 구현과 검증이며 public 배포 완료를 의미하지 않는다. 선택 가능한 턴 제한, AI, 관전은 후속 미확정 항목이며 이번 구현에는 포함하지 않는다.

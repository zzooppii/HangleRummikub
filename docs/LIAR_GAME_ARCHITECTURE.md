# 라이어게임 — 구현 경계

사용자 승인에 따라 `LIAR_GAME`을 concrete game으로 추가한다. [규칙](LIAR_GAME_RULES.md), [공통 방](ROOM_GAME_SWITCH.md), [상위 아키텍처](ARCHITECTURE.md)를 따른다.

- Shared: 설정, 단계, 명령, strict 개인별 projection. 서버 상태·제시어 목록은 공유하지 않는다.
- Domain: 입력 상태를 수정하지 않는 역할/설명/토론/투표/재투표/추측/결과 전이. 서버에서 주입한 시간·순서·라이어·제시어·단계 ID를 사용한다.
- Application: current-primary actor, 방 membership, 판/단계 식별자, 서버 마감, 본인 제출 상태 검증. 방 lane 및 UoW 안에서 상태와 멱등 receipt를 원자적으로 commit한다. 동시 투표·채팅은 다른 참가자의 gameRevision 변경으로 거부하지 않는다.
- Compatibility: detached strict 저장 상태 검사, 플레이어별 whitelist projection. 시민만 자기 제시어를 받고 라이어 projection에는 정답/별칭/내부 식별자가 없다. 중간 표는 자기 표만 공개한다.
- Platform: 기존 room/session/retention/scheduler/overdue sweeper와 concrete router를 연결한다. 새 범용 게임 엔진·dependency는 없다. 종료 방장 승계는 기존 늑대의 밤 패턴을 독립 적용한다.
- Web: 단계별 입력, 가려진 개인 카드, 참가자 설명 카드, 토론, 비밀 투표, 추측, 결과. 기존 연결 복원·초대·게임 교체 흐름을 사용한다. 로컬 입력은 서버 권위 상태를 대체하지 않는다.
- 저장은 기존 in-memory 단일 프로세스다. 끊긴 브라우저는 복원하지만 서버 프로세스 재시작 복구는 제공하지 않는다.

## 검증

Domain/contract/Socket.IO/Web와 root typecheck/test/build 및 모바일 화면 검증을 완료했다. 상세 결과는 아래 최종 로컬 검증 기록을 따른다.

## 계약과 상태 전이

`liar:configure`는 방장 및 `expectedRoomRevision`을 검사한다. `liar:clue`, `liar:say`, `liar:vote`, `liar:guess`는 `gameId`와 `phaseId`를 검사한다. 설명은 현재 차례와 미제출 여부, 투표는 미제출 여부와 후보/자기 투표 금지, 추측은 라이어 본인과 GUESS 단계, 채팅은 개인 발언 간격까지 서버에서 검사한다. 같은 requestId 재전송은 기존 receipt를 반환하며 내용 충돌은 거부한다. 웹 ACK timeout 재시도도 동일 requestId를 사용한다.

`REVEAL → CLUE(참가자별) → DISCUSSION → VOTE → [REVOTE] → [GUESS] → FINISHED`. 설명 제출과 전원 투표는 단계를 즉시 진행한다. 다음 단계마다 새 phaseId를 만들고 이전 타이머는 취소한다. 취소 실패나 뒤늦은 callback은 판/단계/deadline identity 검증으로 무효화한다. 스케줄러 등록 실패는 성공한 commit을 되돌리지 않으며 overdue sweeper가 복구한다.

기존 10인 방에서 게임을 교체하면 LIAR 대기실 projection은 전원을 보존한다. 플레이 시작은 4–8인으로 제한한다. 재경기는 전용 명령을 추가하지 않고 공통 `room:selectGame`을 사용한다.

## 주요 파일

- `packages/shared/src/games/liar-game/{contracts,v2-projection-contracts}.ts`
- `apps/server/src/games/liar-game/domain/{game,prompts}.ts`
- `apps/server/src/games/liar-game/application/{service,lifecycle,host-succession}.ts`
- `apps/server/src/games/liar-game/compatibility/{adapter,projector}.ts`
- `apps/web/src/features/liar-game/{LiarGameScreen.tsx,liar-game.css}`
- `packages/shared/src/liar-game.test.ts`, `apps/server/src/liar-game.{domain,integration}.test.ts`, `apps/web/src/lib/liar-game-ui.test.ts`

공통 게임 목록/스냅샷 union, persistence, 시작/시간/이탈 router, composition/transport, 웹 decoder/controller/room view와 해당 계약 테스트도 additive하게 연결한다.

## 브라우저 검증 범위

로컬 production build와 독립 Socket.IO 참가자 3명을 사용해 Home 선택 → 방 생성 → 설정 → 시작 → 개인 카드 → 설명 제출 → 토론 메시지 → 투표 확정 → 마지막 추측 대기 → 결과 → 같은 방 대기실 복귀를 확인했다. 새로고침 후 설명·채팅·단계 복원을 확인하고, 역할 카드가 다시 가려지는 것을 확인했다. 라이어 입력 화면은 Web 렌더 테스트, 실제 추측 판정은 독립 소켓 클라이언트로 검증했다.

1280px 대기실/결과, 390/320px 진행 화면을 시각 확인했다. 320px에서 가로 넘침이 없고, 390px에서 게임 버튼 높이가 최소 44px임을 확인했다. 모바일 정보 카드가 공통 disabled opacity로 흐려지던 부분은 LIAR 카드에 한해 보완했다. 단계 ID가 변경되면 표시용 시계 기준을 갱신하고, 새 gameId가 시작되면 스크롤을 맨 위로 돌려 개인 카드부터 확인할 수 있게 한다. 서버 시계는 저장소 밖 로컬 QA harness에서 고정하고 실제 domain timeout 경로를 호출해 대기를 단축했다. 실시간 마감 경계와 중복 callback은 Socket.IO 테스트로 별도 검증한다. 실제 휴대폰 및 운영 배포는 이번 검증에 포함하지 않는다.

## 최종 로컬 검증 결과 — 2026-09-11

- Root `npm run typecheck`: PASS.
- Root `npm test`: **2,277 PASS** (shared 124 / Web 583 / server 1,570), 실패·skip·취소 없음.
- Root `npm run build`: PASS. JS 1,011.43 kB / gzip 285.98 kB. 기존 Vite 500 kB 초과 chunk 경고는 유지한다. 이번 작업에서 dependency나 번들 설정은 변경하지 않았다.
- `git diff --check`와 새 문서의 상대 링크: PASS. package manifest/lockfile 변경 없음.
- 최종 bundle에서 390px 새 판 시작 `scrollY = 0`, 카드 opacity = 1, 버튼 높이 최소 44px, 가로 넘침 없음을 재확인했다. 초기 역할 확인 타이머 15초와 개인 카드가 첫 화면에 보인다. 브라우저 warn/error 로그는 비어 있었다.
- 첫 소켓 실행은 sandbox loopback EPERM으로 막혔으나 로컬 소켓 실행 권한으로 재검증했다. 초기 전체 검증에서 게임 개수(13→14)와 새 게임 최소 인원(4명)을 기존 테스트 fixture에 반영하지 않은 실패를 수정한 뒤 위 최종 root 검증을 통과했다. 기존 게임의 assertion을 제거하거나 skip하지 않았다.
- 공개 배포는 수행하지 않았다. 음성, 누적 점수, 추가 역할·모드와 서버 재시작 복구는 후속 범위다.

# 늑대의 밤 — 구현과 검증

## 변경 범위

`WOLF_NIGHT`를 일곱 번째 concrete GameType으로 추가한다. 기존 여섯 게임의 규칙·설정·프레임워크와 dependency는 변경하지 않는다.

- `packages/shared/src/games/wolf-night/`: 12종 역할, 16장 기본판 수량 상한, 구성·행동·개인별 projection 계약.
- `apps/server/src/games/wolf-night/domain/game.ts`: 초기 역할/현재 카드 분리, 도플갱어 복사 의미, 행동 순서, 카드 보존, 비밀 투표, 사냥꾼 연쇄, 팀별 결과. Clock과 shuffle 결과·타이머 토큰은 application에서 주입한다.
- `application/service.ts`: 방 lane, current-primary actor, membership, phase/game identity, CAS, 원자적 idempotency receipt, timer/overdue recovery.
- `compatibility/`: detached strict state validation 및 viewer whitelist. 서버 card ID, 배분 순서, 현재 역할, 타인의 개인 기록·미공개 투표는 진행 중 projection에서 제외한다. 공개 deck은 정렬한 역할 수량 정보다.
- `application/lifecycle.ts`, `host-succession.ts`: 명시적 이탈 시 판 취소, 결과 보존, 종료 방장 승계. 재접속은 기존 credential/primary connection 정책을 사용한다.
- `apps/web/src/features/wolf-night/`: 독자적인 SVG 늑대/마을, 역할 구성, 단계 타이머, 목표 선택, 개인 기록, 토론 채팅, 비밀 투표, 결과와 재경기. 원본 보드게임 이미지나 음원을 가져오지 않는다.
- 기존 shared union, 서버 persistence/projector/start/scheduler/lifecycle/transport와 Web catalog/decoder/controller에 명시적인 분기를 추가했다. 새 범용 game engine이나 dependency는 없다.

## Command와 비공개 경계

`wolf:configure`는 Host와 roomRevision을 검사한다. `wolf:rematch`는 Host, roomRevision, gameId/gameRevision을 검사한다. `wolf:act`는 gameId/phaseId 및 개인 actionRevision을 검사하므로 도플갱어의 두 단계 행동이 중복되지 않는다. `wolf:vote`, `wolf:say`는 gameId/phaseId 및 개인 투표/발언 상태를 검사한다. 동시 참가자의 투표나 대화가 서로의 명령을 stale하게 만들지 않는다.

밤 단계는 공개 카드 구성으로 결정한 고정 시간 동안 유지된다. 중앙에 있는 역할도 동일하게 호출하므로 역할이 실제 참가자에게 배분됐는지를 진행 시간으로 공개하지 않는다. 재접속은 같은 카드·관찰 이력·투표를 유지한다. 역할 카드 앞면 관찰은 그 시점의 정보이며 바뀐 현재 카드로 덮어쓰지 않는다.

투표 대상은 본인에게만 공개하며 전원 제출 또는 마감 시 결과를 동시에 공개한다. 토론 채팅은 명시적인 공개 정보로 한정한다. React는 메시지를 text node로 렌더링한다. 잘못된 명령은 gameRevision이나 카드 상태를 바꾸지 않는다. commit 후 timer 등록·취소 실패는 고정 진단문과 기존 overdue 복구 경로로 처리하며 이미 성공한 명령을 실패로 바꾸지 않는다.

## 진행 정책

[게임 규칙](./WOLF_NIGHT_GAME_RULES.md)의 기본판 규칙과 온라인 자동 처리 정책을 구분한다. 서버 권위형 경계는 [ARCHITECTURE.md](./ARCHITECTURE.md)를 유지한다. in-memory 저장소이므로 서버 프로세스 재시작 복구는 제공하지 않는다.

## 검증 기록

새 도메인 테스트는 도플갱어의 모든 복사 역할, 순서별 관찰과 교환, 늑대·하수인·프리메이슨 정보, 주정뱅이 비공개 교환, 불면증 확인, 동률/무탈락/사냥꾼 연쇄/무두장이 승리, 입력 불변성과 저장 상태 손상을 포함한다.

Socket.IO 통합 검증은 3/6/10인 게임, 11번째 참가 거부, Host/primary/capability 권한, 중복 request/conflict, 시간 경계, 동시 비밀 투표, 개인별 정보, 재접속, 토론 제한, 이탈 취소, 재경기와 종료 Host 승계를 포함한다. Shared 테스트는 기존 contract test entry에서 불러와 root test에 포함한다.

### 최종 로컬 결과 (2026-09-10)

- Root `typecheck`: PASS.
- Root `test`: **1,831 PASS** (shared 116 / Web 451 / server 1,264), 실패·skip 없음.
- Root `build`: PASS. Vite 단일 JS chunk 약 707KB로 500KB 초과 경고가 남는다. 설정을 완화하거나 경고를 숨기지 않았다.
- `git diff --check`: PASS. dependency/lockfile 변경 없음.
- 실제 in-app browser + 독립 Socket.IO 테스트 참가자 2명으로 Home 선택 → 방 생성 → 도플갱어 포함 6장 저장 → 시작 → 역할 확인/동료 기록 → refresh 복원 → 비밀 투표 선택·확정 → 결과 → 같은 방 Lobby 복귀를 확인했다. 단계 대기 단축은 저장소 외부 로컬 검증 harness의 주입 Clock/timeout을 사용했다. 실시간 일반 deadline 경계는 별도 통합 테스트로 확인했다.
- 1280px 대기실/플레이/결과를 시각 확인하고, 390/320px에서 DOM 가로 넘침 없음과 버튼 높이 ≥44px를 확인했다. 390px 대기실 시각 확인에서 제목 대비와 문구 줄바꿈을 보완했다. 캡처한 browser warn/error log는 비어 있었다.
- 원본 제공 영상의 추가 규칙은 확인되지 않았으며 확장판 역할은 범위 밖이다. 운영 배포는 수행하지 않았다.

### 사용자 제공 규칙 반영 (2026-09-10)

3–5인 자동 구성은 사용자 제공 초보자 조합으로 맞추고, 표시 명칭을 예언가로 통일했다. 게임 방법에 준비·밤 순서·투표·팀별 승리 조건과 온라인 진행 차이를 명시했다. 승패 로직, 선택 능력 생략과 최다 1표 이하 무탈락 예외는 유지했다.

- Root `typecheck`, `test`, `build`: PASS. 전체 테스트 1,834개(shared 118 / Web 451 / server 1,265), 실패·skip 없음.
- `git diff --check`: PASS.
- 빌드 JS 709.98KB, gzip 202.83KB. 기존 500KB 번들 경고 유지; 사용자 요청에 따라 최적화는 보류했다.
- 이번 안내문 변경은 타입 검사와 빌드로 검증했으며 브라우저 시각 검증을 다시 실행하지 않았다.

### 사용자 체크리스트 검증 (2026-09-10)

[항목별 검증과 현재 제한](./WOLF_NIGHT_CHECKLIST.md)을 기록했다. 도메인 5개 및 Socket.IO 통합 1개 테스트를 추가했다. 복합 교환의 카드 ID 보존·관찰·결과, 4인 1표 순환, 예언가 선택의 배타성, 중앙 프리메이슨, 하수인 패배 조건, 도플갱어 두 단계 사이 재접속과 중복 실행 차단을 보강했다. 게임 로직 변경은 없다.

- Root `typecheck`, `test`, `build`: PASS. 1,840개(shared 118 / Web 451 / server 1,271), 실패·skip 없음.
- `git diff --check`: PASS. 기존 번들 경고 유지(JS 709.98KB, gzip 202.83KB).
- 미확정 UI 대상 선택의 새로고침 복원과 전체 밤 이동 이력 표시는 미구현이다. 실제 서버 응답 및 연결 복구 테스트를 실행했으며 이번에는 브라우저 수동 점검을 실행하지 않았다.

### 일반 밤 단계 시간 단축

사용자 요청에 따라 일반 밤 단계(도플갱어-불면증환자 마지막 확인 포함)를 25초에서 10초로 줄였다. 최초 역할 확인 15초, 도플갱어 복사 45초, 토론 설정과 투표 45초는 유지한다. 모든 역할을 포함한 한 판을 진행하면서 단계별 시간을 검증하는 도메인 테스트와 Web 시간 fixture를 갱신했다.

늑대 도메인 테스트 36개 및 Socket.IO 통합 테스트는 통과했다. 서버 테스트 TypeScript 컴파일과 `git diff --check`도 통과했다. Root typecheck/test/build는 별도 작업 중인 `packages/shared/src/games/sneaky-lunch/v2-projection-contracts.ts`의 `placementOrder` optional 타입 TS2379 오류로 shared 빌드 단계에서 실패했다. 해당 게임의 변경은 수정하지 않았다.

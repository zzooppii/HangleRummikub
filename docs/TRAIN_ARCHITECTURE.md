# TRAIN 아키텍처

2026-09-12. 규칙은 [TRAIN_GAME_RULES.md](TRAIN_GAME_RULES.md), 기존 플랫폼 경계는 [ARCHITECTURE.md](ARCHITECTURE.md)를 따른다. 새 dependency 없이 기존 React/Socket.IO/Valibot/TypeScript 구조에 추가한다.

## 책임과 계약

- `packages/shared/src/games/train`: 고정 지도·목적지 카탈로그, opaque 카드 ID, strict command 및 플레이어별 projection DTO. 전체 덱/비공개 서버 상태는 포함하지 않는다.
- `apps/server/src/games/train/domain/game.ts`: 주입된 난수·시간·ID로 초기화 및 순수 candidate 전이. 카드 110장/목적지 30장의 유일성·보존, 색별 구성, 점유 노선·기차·점수, 단계와 종료 결과를 검증한다. 연결은 그래프 탐색, 최장 노선은 사용한 edge의 BigInt mask를 기억하는 정확한 탐색이다. 도시 재방문은 허용하고 edge 재사용은 금지한다.
- `application/service.ts`: 인증된 현재 primary player, gameId/turnId/revision, requestId fingerprint를 검증한다. 기존 room executor와 unit of work로 중복/경합을 직렬화하고 검증된 candidate만 commit한다. Socket.IO handler는 이를 호출한다.
- `compatibility/adapter.ts`, `projector.ts`: 내부 상태 저장/검사, 본인 손패와 목적지만 전달. 상대에게는 개수·기차·노선 점수만 전달하며 종료 시 정산 목적지를 공개한다.
- 기존 start/leave/presence/retention/snapshot 라우터와 composition root에 TRAIN을 등록한다. 지속 playerId와 임시 socketId, sessionToken 정책을 그대로 유지한다.

## 단계와 복구

`SETUP → TURN → DRAW_SECOND → TURN` 또는 `TURN → CHOOSE_TICKETS → TURN`.
노선 점유와 첫 공개 기관차는 TURN에서 다음 TURN으로 전이한다. 모든 실제 획득과 목적지 제시는 즉시 서버 commit이다. 실패한 입력은 상태/게임 revision을 바꾸지 않는다. 서버 타이머는 없으며 접속 단절은 현재 단계를 유지한다. 명시적 나가기는 CANCELLED, 기차 종료 조건 또는 전원 행동 불가 시 FINISHED가 된다. 종료 후 방장 승계·같은 방 재시작/게임 변경은 기존 플랫폼을 따른다. in-memory 저장이므로 서버 프로세스 재시작 복구는 지원하지 않는다.

## 화면과 소리

- `TrainBoard.tsx`: SVG로 36개 도시·100개 노선·309개 칸과 점유 기차를 그린다. 정적 지도 좌표/노선 데이터는 판정 데이터와 같으며 곡률/복선 간격은 렌더링 책임이다. 클릭/키보드/목록 선택, 확대·축소·드래그·핀치, 목적지 도시 강조를 제공한다.
- `TrainScreen.tsx`: 공개 시장, 색별 손패, 목적지 선택/반환 순서, 지불 카드 조합 확인, 마지막 순환, 종료 정산. scope 변경 시 선택/재시도 상태를 정리하며 응답 불명확 시 같은 requestId로 재시도한다. UI의 가능한 행동 계산은 안내용이고 최종 판정은 서버가 한다.
- `sound.ts`: Web Audio로 카드·기차 배치·완료·차례·결과 효과음을 합성한다. 사용자 제스처 후 활성화하며 음소거/음량을 로컬 저장한다. 처음 받은 스냅샷은 과거 소리를 재생하지 않는다.
- 원본 여행 일러스트와 9종 열차 카드 atlas는 [이미지 제작 기록](../apps/web/public/images/train/README.md)을 참고한다. 보드·목적지 장식·기차 말은 SVG/CSS로 그린다. 색 외에 기호·문구를 제공하며 reduced-motion을 따른다.

## 검증

`train.domain.test.ts`: 구성·보존·행동·복선·최장 노선·마지막 차례·2–5인 완주.
`train.integration.test.ts`: 실제 socket 인증·동시성·중복·비공개 정보·재접속·취소·게임 변경.
`train-ui.test.ts`: 지불 선택·노선 열림·두 번째 뽑기 제한·지도 기하/화면 정적 렌더링.
루트 `typecheck`, `test`, `build`, `git diff --check`와 실제 브라우저 2인 조작/모바일 배치를 확인한다.

2026-09-12 검증 결과: 루트 typecheck/test/build 성공. 전체 회귀 테스트 shared 126, web 640, server 1780 모두 통과한 뒤 추가한 음향 fallback·socket 완주/재시작을 포함해 TRAIN focused web 4 + server 18도 통과했다. desktop 두 브라우저의 목적지 선택·노선 점유·두 장 뽑기·중간 새로고침 복구와 390px 모바일 배치/확대/음소거 유지 확인. 최종 JPEG 빌드 로드 확인. 자동 효과음 cue 검증을 수행했으나 실제 스피커 음색 청취는 별도 확인 대상이다. Vite의 기존 500kB 초과 chunk 경고는 유지된다. 공개 배포는 수행하지 않았다.

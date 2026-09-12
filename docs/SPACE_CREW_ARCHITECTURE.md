# SPACE_CREW 구현 설계

2026-09-12. 상태: P0 진행 중. [게임 규칙](SPACE_CREW_GAME_RULES.md), [단계 기록](SPACE_CREW_DELIVERY.md)을 따른다. 아래는 설계이며 아직 구현 완료를 뜻하지 않는다.

## 구조와 통합

기존 React·Socket.IO·Valibot·TypeScript strict와 서버 권위형 구조를 유지한다. 새 공통 게임 framework, 임의 DSL, dependency는 도입하지 않는다.

- server `games/space-crew/domain`: 불변 candidate 기반 카드 진행·교신·목표·증명된 미션 primitive·구체 예외 handler. ID/난수/시간은 입력 또는 기존 port로 주입한다. 화면·socket·저장 방식에 의존하지 않는다.
- shared `games/space-crew`: 직렬화 가능한 공개 계약, strict runtime schema, 미션 요약. 비공개 전체 상태·RNG·credential hash는 server 전용이다.
- application: 현재 인증 actor, room/game/attempt/turn identity, scoped revision, request fingerprint를 검증한다. 기존 room lane에서 직렬화하며 성공 candidate와 receipt를 함께 commit한다. 실패는 live state/revision을 보존한다.
- projector: whitelist로 본인 손패·공개 목표·공개 교신·현재/직전 트릭·공동 결과를 만든다. 상대 패는 개수만. 특별 미션의 비공개 목표와 교환 대기 카드는 별도 private 범위다. 전체 이력은 server-only.
- adapter/lifecycle: 구체 Room union과 clone/validation에 연결한다. gameplay `activeTurn:null`, timeout 자동 행동 없음. 기존 admission/presence/retention/session 정책을 유지한다.
- web `features/space-crew`: canonical snapshot에 따른 구체 renderer. 로컬 선택은 draft이며 서버 응답 전 공개 패로 이동시키지 않는다. 응답 유실은 같은 request ID로 확인한다.

통합 지점: shared game-type/protocol/realtime/platform snapshot/export, server composition/start router/snapshot projector/player lifecycle/persistence/transport와 untimed routing, web catalog/Home/App/lobby client/decoder/saved-game/leave. 기존 게임의 행동을 변경하지 않는다.

## 미션 데이터와 판정

공식 Logbook 1–50을 먼저 분류하고 실제 반복되는 조건만 primitive로 만든다. 개수·순서·색/숫자·획득자·트릭 조건·교신 제한과 setup 질문/선택을 구분한다. 미션별 concrete handler를 허용한다. 성공 조건과 조기 실패 조건은 별도 검증한다. 트릭에서 동시에 완료된 여러 목표는 제출 순서가 아닌 한 batch로 판정한다.

게임 내부 단계는 목표 선택·특수 설정·구조 신호·교신 가능한 트릭 사이·트릭 제출·결과로 명시한다. 세부 discriminated union은 P1/P2 결과를 기반으로 확정하고 미검증 미션을 일반형에 억지로 넣지 않는다.

## 캠페인 영구 저장

사용자 확정 범위는 서버 재시작 후 **캠페인을 새 방에서 이어 하기**다. 기존 ephemeral room/session 전체를 영구화하지 않는다.

- `SpaceCrewCampaignRepository` port와 게임 전용 atomic-file adapter를 사용한다. Node built-in 파일 API로 구현하며 외부 DB dependency는 필요하지 않다.
- checkpoint: schema/rules version, opaque campaign ID, revision, mode/current mission/completed missions, 시도 ID·횟수·상태·결과, 구조 신호 활성/사용 이력, 선택적 metadata, authorized recovery hash, durable command receipts.
- 전체 트릭 기록은 현재 서버 실행 중 검증용으로 보관하며 영구 checkpoint에는 포함하지 않는다. 기존 방/session 정리로 캠페인 진행·시도·구조 신호 기록을 삭제하지 않는다.
- 새 방에 연결할 때 복구 자격과 현재 campaign revision을 검증한다. 같은 캠페인을 여러 방에서 동시에 수정하지 못하도록 game-specific lease/직렬화가 필요하다.
- 중요한 시도 시작·구조 신호·결과·다음 미션 전환은 durable checkpoint와 receipt가 안전하게 저장된 이후 성공을 응답한다. 파일 저장 실패를 숨기거나 메모리만 성공 처리하지 않는다. 저장 후 프로세스가 종료돼도 replay가 이중 시도를 만들지 않아야 한다.
- 임시 파일→flush→atomic rename과 디렉터리 flush, 제한된 파일 권한, 저장 schema 검증을 적용한다. 비밀 값·파일 경로를 public error에 넣지 않는다.
- local 파일 경로와 배포 영구 volume 경로는 configuration 경계다. 재배포에도 보존하려면 실제 persistent volume이 필요하다. ephemeral filesystem에서 영구 저장이 보장된다고 표시하지 않는다. 기존 배포에 대한 변경은 구현 완료와 구분한다.
- 종료된 미션의 결과 이력은 남기되 서버 재시작 후 진행 중 손패/옛 session resume는 제공하지 않는다. 중단된 시도는 중단으로 표시하고 새 방에서 새 셔플로 재시도한다.

## 화면·일러스트·상호작용·소리

독립적인 우주 탐사/조종석 디자인. 어두운 우주 배경, 임무 제어판, 승무원 자리, 중앙 트릭, 읽기 쉬운 목표 카드와 대장/교신 표시를 사용한다. 원작 카드 그림·로고·외관을 복제하지 않는다. 장식은 정보보다 앞서지 않는다.

Playing card는 색·기호·숫자/로켓·legal 표시·교신 표시를 함께 제공한다. PC는 테이블 중심, 390/320px은 손패와 행동이 읽히도록 재배치한다. 터치 선택→확정, 키보드와 focus, reduced-motion, 교신 단계 표시, 짧은 성공/실패 이유, Game Guide를 필수로 포함한다.

Web Audio의 자체 카드·교신·획득·임무 성공/실패 소리를 상황 전이에 연결한다. 사용자 gesture 이후 활성화, mute/volume 저장, 최초 snapshot/중복 응답/재접속에서 과거 효과음 재생 금지. 음향 실패는 게임을 막지 않는다. 일러스트 생성·자산 출처·최종 prompt는 P7에서 기록한다.

## 검증

순수 domain 조건/보존 테스트, shared strict/privacy 테스트, 실제 socket actor/revision/중복/경합/reconnect, campaign 저장 실패/restart/replay 테스트, 실제 3–5인 browser 및 PC/390/320px E2E를 단계별로 수행한다. 모든 phase에서 root typecheck/test/build/diff-check 후 commit/push한다. 테스트 core 행동을 mock으로 우회하지 않는다. 서버 테스트는 기존 root `src/*.test.ts` glob에 포함시킨다.

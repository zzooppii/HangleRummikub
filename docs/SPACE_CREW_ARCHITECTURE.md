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

감사에서 반복이 확인된 조건의 구현 경계는 다음과 같다. 임의 문자열 식을 실행하는 DSL은 만들지 않는다. 미션 정의를 확정할 때 아래 조건과 종료 정책을 함께 연결한다.

| 반복 조건 | 관찰한 미션 | 판정 시점 |
| --- | --- | --- |
| 목표 카드 획득 및 절대/상대/마지막 순서 | 목표 카드가 있는 미션 | 완료 트릭 전체를 한 batch로 판정 |
| 특정 승리 카드 숫자/종류 | 9,13,16,17,26,44 | 트릭 승자 확정 시 검사; 44는 로켓 순서 상태 유지 |
| 지명자의 승수/허용 트릭 | 5,33,41,50 | 위반 즉시 실패, 필요한 마지막 트릭까지 성공 보류. 33/41의 로켓 승리는 집계에서 빼지 않고 별도 금지 조건으로 실패 |
| 승수 균형 | 29,34 | 매 트릭 후 최대·최소 승수 차 검사 |
| 특정 색상 수집 | 46 | 해당 색의 모든 획득자 검사, 3인 잔여 카드도 종료 시 검사 |
| 교신 조건 | Z, D2/D3, 11 | 공개 직전 actor·시점·카드 자격 검사 |

12의 무작위 카드 이동, 23의 두 토큰 교환, 40의 토큰 이동은 구체 setup/전이 handler로 둔다. 34의 사령관 첫·마지막 승리, 48의 마지막 트릭 Ω는 반복 조건에 붙이는 구체 조건이다. `TASK_BEFORE`와 `TASK_AFTER`처럼 같은 상대 순서를 중복 표현하는 primitive를 미리 만들지 않는다. 공통 조건이어도 33/41의 사령관 제외 자격과 5/11의 지명 자격은 합치지 않는다.

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

### P1 검증 설계 (구현 전)

카드 생성·배분은 `domain/cards.ts`, 제출·트릭 진행은 `domain/trick.ts`, 직접 실행하는 회귀 검증은 server `src/space-crew.domain.test.ts`에 둔다. P1에서는 미션 성공을 판정하지 않는다. 모든 트릭 소진은 카드 진행의 종료이며 협동 SUCCESS와 다르다. 플랫폼 등록·공개 DTO·화면 연결은 P6/P7의 작업이다.

기존 `ports/system.ts`의 `RandomSource`와 `domain/frozen-fisher-yates.ts`를 재사용한다. 카드 ID는 주입된 생성 함수에서 받고 application에서 기존 ID 생성기에 연결한다. 카드 면으로 ID를 만들지 않는다. 강제 턴 시간이 없으므로 순수 트릭 함수에는 Clock이나 scheduler를 주입하지 않는다.

| 검증 영역 | 필수 사례 |
| --- | --- |
| 카드와 배분 | 정확히 40개 면·고유 ID, 중복/누락 거절, 3/4/5인 배분, 잘못된 인원·중복 자리 거절, 입력 불변 |
| 결정성 | 같은 난수열의 같은 배분, 범위 밖 난수 거절. 확률적 분포를 통과 조건으로 삼지 않음 |
| 선두와 순환 | 로켓4가 각 좌석에 있는 경우, 모든 시작 자리에서 순환, 인당 한 장, 마지막 제출 전 미완료 |
| 합법 제출 | 선도색이 있을 때 다른 색/로켓 거절, 선도색이 없을 때 모두 허용, 로켓 선도도 동일하게 적용, 더 낮은 카드 허용 |
| 승자 | 다른 색9보다 선도색1 우선, 로켓1이 일반색9에 승리, 복수 로켓 최고 승리, 승자가 다음 선두 |
| 실패 원자성 | 잘못된 actor·이미 낸 카드·타인 카드·없는 ID 거절 후 입력 상태/revision 불변. 타인/없는 ID의 외부 오류 동일 |
| 성공과 보존 | 성공 시 한 장만 이동, 카드 소유·위치 zone 간 중복 없음, 매 제출 후 전체 40장 보존. 이력·표시용 참조는 보존 집계에서 제외 |
| 끝까지 진행 | 3인13/4인10/5인8트릭, 3인 잔여 한 장 유지, 14번째 부분 트릭 금지, 소진을 미션 성공으로 오인하지 않음 |

승자 기대값은 작은 수작업 사례로 정한다. 구현의 승자 함수를 다시 호출해 테스트의 정답을 만들지 않는다. 아직 위 테스트를 작성하거나 실행한 상태가 아니다.

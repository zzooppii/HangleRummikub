# SPACE_CREW 구현 설계

2026-09-12. 상태: P0–P6 통과, P7 대기. [게임 규칙](SPACE_CREW_GAME_RULES.md), [단계 기록](SPACE_CREW_DELIVERY.md)을 따른다. 아래는 설계이며 아직 구현 완료를 뜻하지 않는다.

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

### P6 연결 계약

`spaceCrew:start`는 방장이 새 캠페인·연습 미션·기존 캠페인 복구를 선택하는 전용 명령이다. 일반 `game:start`로 미션 1을 먼저 생성하지 않는다. 시작 응답도 viewer-specific state snapshot이며, 복구 비밀은 응답·broadcast·로그에 포함하지 않는다. 브라우저가 Web Crypto로 32바이트 비밀을 생성하고 요청 전에 저장하며, 서버는 검증용 해시만 보관한다. 캠페인 ID는 비밀과 다른 domain-separated hash로 생성한다. 생성 규약은 `crew_` + `SHA-256("space-crew-campaign-id-v1\0" + recoveryToken)`의 hex 앞 40자다. 브라우저도 같은 규약으로 ID와 비밀을 요청 전에 함께 보관해 시작 응답이 유실돼도 새 방 복구에 사용할 수 있게 한다.

`spaceCrew:act / retry / next / practiceMission`은 `gameId`, `attemptId`, `expectedGameRevision`으로 대상 시도를 묶는다. 다음 시도에도 같은 game ID와 증가하는 game revision을 유지하고 attempt ID만 새로 만든다. 도메인의 mission revision과 transport game revision은 별개다. 재도전은 같은 참가자와 방을 유지한 채 손패·목표를 다시 섞는다. 연습 모드의 미션 재선택은 별도 run을 만들고 이전 run의 시도·구조 신호 이력을 남긴다.

서버 기본 저장 위치는 실행 디렉터리의 `data/space-crew-campaigns`다. `SPACE_CREW_CAMPAIGN_DIR` 또는 runtime의 `spaceCrewCampaignDirectory`로 영구 볼륨 경로를 지정할 수 있다. 테스트·다른 저장 구현에는 `spaceCrewCampaignRepository` port를 주입한다. 파일 adapter는 **단일 서버 프로세스 writer** 전제다. 같은 프로세스의 같은 경로 adapter들은 캠페인 직렬화 lane을 공유하며, 여러 서버 프로세스가 동시에 같은 디렉터리를 쓰는 배포는 지원하지 않는다.

방·세션 in-memory UOW와 캠페인 파일은 하나의 원자적 저장소가 아니다. 시도/구조 신호/결과 변경은 캠페인 저장 후 방을 반영하며, 저장 결과가 불확실한 요청은 같은 ID·같은 후보 손패를 유지하고 durable receipt로 재확인한다. 저장 재시도에서 새 셔플이나 이중 시도를 만들지 않는다. 이탈·정리에서는 `pendingInterruption`을 먼저 저장하고 lease를 유지한 뒤 방 commit의 성공 여부에 따라 중단 확정 또는 예약 취소를 한다. 예약 취소는 기존 완료 이력을 되돌리지 않는다. 방 commit 후 중단 확정 저장이 일시 실패하면 durable intent와 유지보수 재시도로 마무리한다. 서버 재시작 후 복구는 이전 ACTIVE 시도를 ABORTED로 보존한 뒤 새 시도를 생성한다.

공개 projection은 자기 손패, 다른 사람의 장수, 현재 트릭과 직전 완료 트릭, 공개된 목표와 교신, 미션 설정 응답, 캠페인 요약만 포함한다. 서버 전체 트릭 이력·미션 12 교환 영수증·비공개 목표·다른 사람의 구조 신호 선택 카드·RNG를 포함하지 않는다. 이미 사용한 교신 카드는 손에서 나가면 표시에서 제거하고 사용된 토큰 상태만 남긴다. 현재 시도의 전체 완료 트릭은 서버 검증용 상태에 유지되므로 재접속이 이를 초기화하지 않는다.

## 화면·일러스트·상호작용·소리

독립적인 우주 탐사/조종석 디자인. 어두운 우주 배경, 임무 제어판, 승무원 자리, 중앙 트릭, 읽기 쉬운 목표 카드와 사령관/교신 표시를 사용한다. 원작 카드 그림·로고·외관을 복제하지 않는다. 장식은 정보보다 앞서지 않는다.

Playing card는 색·기호·숫자/로켓·legal 표시·교신 표시를 함께 제공한다. PC는 테이블 중심, 390/320px은 손패와 행동이 읽히도록 재배치한다. 터치 선택→확정, 키보드와 focus, reduced-motion, 교신 단계 표시, 짧은 성공/실패 이유, Game Guide를 필수로 포함한다.

Web Audio의 자체 카드·교신·획득·임무 성공/실패 소리를 상황 전이에 연결한다. 사용자 gesture 이후 활성화, mute/volume 저장, 최초 snapshot/중복 응답/재접속에서 과거 효과음 재생 금지. 음향 실패는 게임을 막지 않는다. 일러스트 생성·자산 출처·최종 prompt는 P7에서 기록한다.

## 검증

순수 domain 조건/보존 테스트, shared strict/privacy 테스트, 실제 socket actor/revision/중복/경합/reconnect, campaign 저장 실패/restart/replay 테스트, 실제 3–5인 browser 및 PC/390/320px E2E를 단계별로 수행한다. 모든 phase에서 root typecheck/test/build/diff-check 후 commit/push한다. 테스트 core 행동을 mock으로 우회하지 않는다. 서버 테스트는 기존 root `src/*.test.ts` glob에 포함시킨다.

### P1 구현과 검증

카드 생성·배분은 `domain/cards.ts`, 제출·트릭 진행은 `domain/trick.ts`, 직접 실행하는 회귀 검증은 server `src/space-crew.cards.test.ts`, `src/space-crew.trick.test.ts`, `src/space-crew.simulation.test.ts`에 둔다. P1에서는 미션 성공을 판정하지 않는다. 모든 트릭 소진은 카드 진행의 종료이며 협동 SUCCESS와 다르다. 플랫폼 등록·공개 DTO·화면 연결은 P6/P7의 작업이다.

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

승자 기대값은 작은 수작업 사례로 정한다. 구현의 승자 함수를 다시 호출해 테스트의 정답을 만들지 않는다. 위 경계를 cards/trick 도메인과 전용 테스트로 구현했다. 3·4·5인 각각12개 셔플을 끝까지 진행하는 시뮬레이션에서도 별도 승자 계산과 매 제출40장 보존을 확인한다.

P1 상태는 `BETWEEN_TRICKS / IN_TRICK / EXHAUSTED`로 구분하며 미션 SUCCESS를 뜻하지 않는다. 서버 내부 parser는40개 카드 위치, 현재 선도색 준수, 좌석 순환, 완료 트릭의 승자와 다음 선두,3인 잔여 한 장을 검증한다. 초기 로켓4 소유 검증은 첫 카드 제출 전까지만 적용해 미션12의 이후 교환과 양립한다. 카드 제출 command는 strict shape와 expectedRevision을 검증하고, 없는/타인/이미 사용한 카드 참조는 동일한 INVALID_CARD로 반환한다.

## P2 모듈 계약

- `tasks.ts`:36개 독립 목표 면을 주입받아 최대10개를 선택하고, 기본 선택/사령관 결정/사령관 배분의 공개 범위와 응답 단계를 구분한다. 목표 state 자체의 revision을 검증한다. 목표 ID는 손패 instance ID가 아니다. 양도 전 배분 소유자를 별도 기록해5인 양도 후에도 원래 배분을 검증하되 현재 소유자의 균형을 강제하지 않는다.
- `communication.ts`: 교신 당시 관계를 보관한다. Singleton은 ONLY, dead zone은 null mark이며 중간 카드 자격을 완화하지 않는다. 공개 카드를 제출한 뒤 projection에는 사용 여부만 남기고 예전 카드 면은 제거한다.
- `distress.ts`: 제안→전원 동의→각자의 비공개 카드 선택→동시 교환. 반대는 교환 생략으로 처리하고 첫 교신/제출 전까지만 재논의할 수 있다. 교환 완료 후 추가 교환은 불가하다. LEFT는 다음 시계방향 자리, RIGHT는 그 반대다. 활성/교환/생략 이력은 카드 ID 없이 저장한다. 새 시도는 기존 활성 이력만 이어받고 투표·카드 선택을 초기화한다.
- `mission-primitives.ts`: 실제50미션에서 확인한8개 조건을 판정한다. SATISFIED는 현재 조건 충족이며 미션 SUCCESS를 자동 의미하지 않는다. 전량 진행 미션의 종료는 별도 정책이다. 공개된 색상1 카드가 모두 소진되어 목표 승리 횟수가 불가능해진 경우에는 숨은 손패를 조회하지 않고 실패한다.

교신/구조 신호는 카드 state revision을 증가시킨다. P3 이후 미션 wrapper가 모듈들을 연결하고 전체 명령의 revision을 소유한다. 목표가 READY가 아니거나 구조 신호가 VOTING/SELECTING인 동안에는 카드 제출·교신을 호출하지 않는다. `assignmentComplete` 같은 context는 서버가 계산하며 client command의 필드로 받지 않는다. 목표 batch에는 P1에서 검증한 완료 트릭만 전달한다. P6에서는 외부 전체 revision 검증·receipt와 이 후보 변경을 같은 room lane에서 commit한다.

## P3 통합 경계

`missions.ts`는 통과한 구간의 미션 번호로만 고정된 규칙을 반환한다. 요청에 임의 목표 수·통신 예외·성공 조건을 실어 규칙을 덮어쓸 수 없다. 목표 덱은 playing card와 별도 ID 생성·36면 검증·주입 난수 셔플을 거친다.

`mission.ts`가 카드·목표·교신·구조 신호와 미션 특수 설정을 하나의 candidate로 묶는다. 외부 도메인 명령의 revision은 전체 미션 기준이며 하위 모듈 revision을 클라이언트가 선택하지 않는다. 재접속용 canonical 상태를 읽을 때 좌석·사령관·정의·설정·판정 이력의 일치 여부도 검증한다. 클라이언트 공개 projection은 별도로 P6에서 제공한다.

미션5는 제한된 상태 응답 후 사령관이 0트릭 대상자를 지명한다. 본인도 선택할 수 있지만 필요한 응답 단계를 생략할 수 없다. 지명자의 첫 승리는 즉시 FAILURE, 성공은 마지막 트릭까지 보류한다. 미션9는 일반색1이 승리한 트릭에서 즉시 SUCCESS다. 목표 미션에서는 한 트릭에 든 목표를 함께 검증한 후 모두 완료되면 SUCCESS다. 합법적으로 낸 마지막 카드가 목표 실패를 확정해도 카드 제출 자체를 되돌리지 않고 완성된 트릭과 협동 FAILURE를 함께 반영한다.

## P4 특수 전이 경계

미션12의 자동 교환은 첫 완료 트릭의 목표·조건 판정 뒤, 계속 진행하는 경우 해당 PLAY candidate 안에서 실행한다. 각자의 같은 시점 손패에서 공개 중인 교신 카드를 제외하고 한 장씩 뽑아 다음 시계방향 좌석으로 동시에 전달한다. 로켓도 후보이며 사령관·다음 선두·교신 표식은 유지한다. 주입 난수가 없거나 범위 밖이면 고정된 INVALID_RANDOM 오류로 해당 PLAY 전체를 거절한다. 외부 난수원의 소비까지 되돌린다고 보장하지 않는다.

교환의 moves/protectedCardIds는 서버 전용 이력이다. 재접속 상태 검증에서 이 기록과 카드 위치를 대조하며 재추첨하지 않는다. 공개 DTO에는 교환 목록·남의 카드 ID를 넣지 않는다. 첫 트릭에서 실패하면 교환과 난수 호출을 생략한다.

미션11은 별도 상태 응답 없이 사령관이 교신 금지 대상을 정한다. 미션13은 로켓4종이 각각 승리해야 하며 같은 트릭에 낮은 로켓이 소비되면 실패한다. 미션16은9로 이기지 않고 전량 진행해야 한다. 미션17도 매 트릭9 승리 금지를 검사하지만 목표2개 달성 시 즉시 종료한다.

미션20의 숨은 목표 일괄 지정과24의 순차 공개 배분은 P2 task 모드를 그대로 연결한다. 미션23의 합법 토큰 편집은 최초 구성에서 정확히 두 위치를 교환한 경우로 한정한다. 미션25의5인 양도는 현재 소유 목표1장만 전체1회 이전하며 토큰이 따라간다. 이 편집과 양도를 다른 미션에 임의 허용하지 않는다.

## P5 후반 설정과 종료

`mission-special.ts`는 실제로 다른 질문·지명·공동 결정 절차를 분리한다. 미션33/41은 YES/NO 응답 뒤 사령관 외 대상자를 지명한다. 응답이 YES인 사람에게만 자격을 제한하지 않는다. 지정된 트릭 승수 조건과 로켓 승리 금지는 별개로 모두 검사한다.

미션46은 최초 분홍9 소유자와 왼쪽 담당자를 생성 시 기록한다. 구조 신호가 이동시킨 이후에도 담당자를 다시 계산하지 않는다. 교환 이전에는 원래 소유자를 카드 위치로 검증하고 언제나 좌석 관계를 검증한다. 구조 신호의 폐기된 비공개 선택 목록을 재구성하지 않는다. 분홍9가3인 잔여 카드로 남으면9장 수집을 달성하지 못했으므로 실패한다.

미션50의 온라인 공동 결정은 다음 자체 절차로 구현한다. 이는 출판 규칙의 의미를 웹 명령에 옮긴 것이며 원문에 있는 세부 UI라고 표시하지 않는다. 사령관부터 각자 첫4/중간/마지막 중 선호를 말하고, 누구든 서로 다른 첫4 담당자와 마지막 담당자를 제안할 수 있다. 제안자의 동의를 포함해 전원이 동의하면 시작한다. 반대하면 제안·동의만 초기화하고 선호를 유지한다. 역할 선호는 실제 배정 자격을 강제하지 않으며 각 중간 담당자의 최소 승수도 추가하지 않는다. 전역 revision과 별도 특수 설정 revision으로 이전 제안에 대한 승인 재사용과 revision 감소를 막는다.

미션29/34는 매 트릭의 승수 차를 검사한다.34의 사령관 첫·마지막 승리,44의 로켓1→4 순서,48의 Ω 마지막 트릭 달성은 각각 구체 조건으로 연결한다. 모든 미션은 게임 결과와 공개 실패 이유를 만들며 개인 승자를 만들지 않는다.

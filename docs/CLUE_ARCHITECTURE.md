# 클루 아키텍처

2026-09-11 사용자 요청으로 기존 보드게임 플랫폼에 `CLUE`를 추가했다. 규칙은 [CLUE_GAME_RULES.md](./CLUE_GAME_RULES.md)의 `clue-classic-manor-v1`, 지도는 `clue-manor-v1`을 따른다. 3–6명이 각자 브라우저로 참여한다.

## 모듈과 서버 경계

- `packages/shared/src/games/clue`: 직렬화 가능한 카드·명령·projection 계약, 런타임 검증, 공개 지도와 경로 계산. 정답·전체 손패를 소유하는 서버 상태는 포함하지 않는다.
- `apps/server/src/games/clue/domain/game.ts`: 카드 생성·배분, 봉투, 이동·비밀통로, 소환, 순서대로 반박, 비밀 증거, 최종 지목과 종료를 판정한다. `Clock`에서 받은 시각, `RandomSource`, opaque ID를 주입받고 후보 상태를 검증한다.
- `application/service.ts`: 기존 room mutation 직렬화, actor/current-primary 인증, gameId/revision/transitionId, requestId 멱등성, 원자적 UoW commit을 사용한다. 불법 카드 ID는 존재 여부와 관계없이 같은 규칙 오류를 반환한다.
- `compatibility/projector.ts`: 공개 말·도구 위치와 기록을 선택적으로 구성하고, 본인 손패와 증거 전달의 당사자에게만 카드 정보를 보낸다. 잘못 지목한 사람에게는 본인 `caseFile`만 추가한다. 종료 후에는 정답과 전체 손패를 공개한다.
- `compatibility/adapter.ts`: 구체 `ClueRoomRecord`를 기존 저장소, Room lifecycle과 연결한다. 타이머가 없는 게임이므로 `activeTurn`은 없다.
- `application/lifecycle.ts`, `host-succession.ts`: 명시적 나가기는 판을 중단한다. 연결 끊김은 게임을 진행시키지 않으며 같은 세션으로 복구한다. 종료 후 60초 이상 방장이 연결되지 않으면 기존 정책 경계에서 방장을 승계한다.

게임은 독립적인 concrete module이다. 공통 room 생성/참가/교체/재시작, session identity, presence version, retention, v2 projection과 event capability에 추가했다. 다른 게임의 domain으로 분기시키거나 일반 타일 게임의 턴 스케줄러에 넣지 않는다.

## 상태 전이

`TURN_START → MOVE → SUGGEST 또는 END_TURN → TURN_START`가 기본 흐름이다. 방에 도착하거나 소환 자격을 사용하면 추리할 수 있다. 비밀통로는 주사위를 대신하며 `TURN_START → SUGGEST`로 이동한다.

추리 시 서버가 다음 사람부터 손패를 검사한다. 첫 일치 카드 보유자가 있으면 `RESPOND`에서 그 사람만 일치 카드 한 장을 제출할 수 있다. 다른 사람의 추가 행동은 허용하지 않는다. 일치 카드가 없는 사람은 서버가 자동으로 통과시킨다. 반박이 없거나 카드가 제출되면 `END_TURN`으로 이동한다. 같은 증거를 다시 보여줘도 중복 저장하지 않으며 최신 suggestion ID로 갱신해 새 공개 화면을 띄운다.

최종 지목은 자기 차례의 반박 대기 외 단계에서 가능하다. 정답이면 `SOLVED`, 오답이면 본인을 제외하고 다음 차례로 넘어간다. 전원 오답이면 `ALL_ELIMINATED`, 명시적 이탈이면 `CANCELLED`로 종료한다. 실패한 사람도 반박에는 계속 참여한다. 마지막 한 사람에게 자동 승리를 주지 않는다.

매번 후보 상태의 카드 21장 보존, 카드 ID·종류 유일성, 손패 수, 말 위치, 반박자와 증거 소유자를 검사한다. 성공한 행동마다 gameRevision과 transitionId를 갱신한다. 실패는 live state를 변경하지 않는다.

## 화면과 일러스트

`apps/web/src/features/clue`에 전용 React 화면, CSS, 카드 아트와 화면 제어 함수를 둔다. 저택 외관, 아홉 개 방, 여섯 인물, 여섯 도구는 built-in ImageGen으로 생성한 원본 일러스트다. WebP 네 파일로 제공하며 프롬프트와 제작 기록은 [이미지 README](../apps/web/public/images/clue/README.md)에 있다. 새 dependency는 추가하지 않았다.

데스크톱은 저택 보드와 행동/수첩을 나란히 배치한다. 모바일은 현재 행동을 먼저 제시하고 보드·수첩·기록 탭을 사용한다. 지도 확대, 가능한 경로 강조, 목적지 목록, 선택 후 이동 확인을 제공한다. 인물·도구·장소는 일러스트 카드로 고르고 비밀 증거는 개인 dialog로 확인한다. 키보드 focus와 reduced-motion을 지원한다.

추리 수첩의 본인 카드·직접 확인한 증거는 자동 사실로 표시한다. 사용자 추정 기호와 메모는 gameId/playerId별 브라우저 localStorage에 저장하고 외부 입력을 검증한다. 브라우저 저장 실패는 화면에 알린다. 자동 사실을 수동 메모로 덮어쓰지 않는다. 미확인 응답은 같은 requestId로 재확인하며 재접속과 revision 변경 시 오래된 선택/요청을 버린다.

## 검증 범위

- `apps/server/src/clue.domain.test.ts`: 3–6인, 100개 seeded 배분, 카드 보존, 길·벽·출입문, 비밀통로, 소환, 원자성, 반박 순서, 잘못된 ID, 반복 증거, 최종 지목, 탈락 후 반박, 종료와 저장 상태 검증.
- `apps/server/src/clue.integration.test.ts`: 실제 Socket.IO client로 admission, capabilities, private projection, 잘못된 actor/revision, 동시·중복 명령, 실제 이동·반박, primary 교체, 재접속, 승리·방장 승계·재시작, 이탈·게임 교체를 검증한다.
- `apps/web/src/lib/clue-ui.test.ts`: v2 계약과 renderer, 일러스트, 행동 자격, 노트 분리, 비공개 정보 및 위조 입력 거부를 검증한다.
- 실제 브라우저에서 3인 게임 시작, 주사위·이동·추리·선택적 반박과 개인 증거 공개, 수첩 자동 기록, 새로고침 후 메모 복구를 확인한다. 작은 화면은 390px/320px 내장 frame으로 확인한다. 실제 휴대전화의 터치 체감 검사는 별도다.

최종 검증: root `typecheck`, `test`, `build`, `git diff --check` 통과. 전체 테스트는 공용 124개, 웹 609개, 서버 1,654개로 총 2,387개 통과했다. 빌드에는 기존 통합 프런트엔드의 500KB 초과 chunk 경고가 남아 있다. 같은 저장소에서 진행된 아줄 타이머 변경은 보존했다. 브라우저에서 오답 지목 후 개인 봉투, 정답 지목 후 승리, 같은 방 재시작, 작은 화면의 하단 이동 확정과 지도 내부 스크롤도 확인했다. 내장 브라우저의 일부 자동화 연결 문제가 있었으나 새 탭과 네이티브 확인창 조작으로 복구했다.

## 남은 범위

오리지널 지도를 사용하는 온라인 클래식 버전이며 상용판별 지도·추가 카드는 구현하지 않았다. 2인 변형, AI 상대, 음성 채팅, 턴 제한은 이번 범위에 포함하지 않는다. 서버 상태는 기존 플랫폼과 같이 단일 프로세스 in-memory이므로 프로세스 재시작 시 복구되지 않는다. 수동 메모는 다른 기기에 동기화되지 않는다. 배포는 별도 작업이다.

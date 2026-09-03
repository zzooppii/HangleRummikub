# Codex 작업 지침

이 파일은 저장소 전체에 적용된다. 앞으로 이 프로젝트를 다루는 Codex는 아래 원칙을 반드시 따른다.

## 1. 작업 범위와 우선순위

- 사용자가 요청한 단계와 파일만 변경한다.
- 요청하지 않은 기능, 화면, API, 설정, dependency를 임의로 추가하지 않는다.
- 현재 작업에 필요하지 않은 대규모 리팩터링, 디렉터리 재구성, 이름 변경을 하지 않는다.
- 범위를 넓혀야만 완료할 수 있다면 먼저 이유와 영향을 설명하고 사용자의 승인을 받는다.
- 현재 scope 밖의 아이디어나 TODO는 구현하지 않는다. 필요한 경우 적절한 설계 문서의 미확정 항목 또는 roadmap에 기록한다.
- `docs/GAME_RULES.md`의 `TO_BE_CONFIRMED` 항목을 일반적인 루미큐브 관습이나 추측으로 확정하거나 코드에 고정하지 않는다.

## 2. 작업 시작 전 확인

- 루트의 `AGENTS.md`와 관련 설계 문서를 먼저 읽는다.
- 변경 대상과 관련된 코드, 타입, 테스트, 설정, package script를 확인한다.
- `git status`로 기존 변경 사항을 확인하고 사용자의 변경을 덮어쓰거나 되돌리지 않는다.
- 요구사항과 현재 구현이 충돌하면 임의로 해석하지 말고 그 차이를 보고한다.

## 3. 아키텍처 불변 조건

- 서버 권위형(server-authoritative) 구조를 유지한다. 클라이언트 입력과 클라이언트가 계산한 상태는 신뢰하지 않는다.
- 서버는 room, player, tile, rack, board, turn, timer, game phase, winner의 canonical state를 소유한다.
- `Player`와 `Socket.IO socket connection`을 동일시하지 않는다. 지속 식별자인 `playerId`와 일시 식별자인 `socketId`를 분리한다.
- 재접속 자격 증명인 `sessionToken`은 room code와 분리하고 URL, 로그, broadcast payload에 노출하지 않는다.
- 모든 실제 타일 인스턴스에는 고유한 `tileId`를 사용한다. 표시 문자가 같아도 같은 타일로 취급하지 않는다.
- 비공개 Tile을 추측할 수 없도록 wire `tileId`는 opaque하게 만들고, unauthorized Tile 참조의 외부 오류로 존재 여부를 누설하지 않는다.
- 모든 상태 변경 command에서 해당 command에 적용되는 인증 actor, room/game phase와 scoped revision을 서버가 검증한다. turn command에는 추가로 turn ownership, server deadline, tile existence·ownership·conservation을 검증한다.
- 턴 시간 판정에는 서버의 `Clock`만 사용한다. 클라이언트 시간은 표시 보조 정보일 뿐 판정 근거가 아니다.
- Submit은 live state를 먼저 수정하지 않는다. candidate state 전체를 검증한 뒤 성공 시 한 번만 commit하고, 실패 시 기존 state와 `gameRevision`을 그대로 유지한다.
- 같은 room의 Submit, draw, timeout 등 경쟁하는 mutation은 직렬화한다.
- `GAME_RULES.md`가 공개를 명시적으로 확정하지 않은 rack/bag 정보는 플레이어별 projection으로 제한하며 전체 room broadcast에 포함하지 않는다.
- 복잡한 게임 규칙, 한글 조합, 사전 판정, 상태 전이는 React UI 컴포넌트나 Socket.IO handler 안에 넣지 않는다. 순수 domain/application 계층으로 분리한다.

## 4. 경계와 공유 계약

- 직렬화 가능한 공용 DTO, event payload, enum, error code는 `packages/shared`에 우선 둔다.
- 서버 내부 entity, repository 구현, token hash/저장 record, 전체 비공개 state는 `packages/shared`에 노출하지 않는다. 명시적인 credential command DTO는 opaque `sessionToken` field의 contract만 정의할 수 있다.
- 공유 TypeScript 타입이 있어도 런타임 입력 검증을 생략하지 않는다.
- Socket.IO handler는 transport 변환과 인증 context 연결만 담당하고 게임 판정을 application/domain service에 위임한다.
- 저장소, 사전, 시간, 난수, ID 생성, turn scheduler는 교체 가능한 interface/port 뒤에 둔다.
- MVP의 in-memory 구현 세부사항이 domain logic에 새지 않도록 한다.

## 5. TypeScript와 코드 품질

- TypeScript `strict` 모드를 유지하고 오류를 숨기기 위해 설정을 완화하지 않는다.
- `any`를 남용하거나 편의를 위해 새로 도입하지 않는다. 외부 입력은 `unknown`에서 시작해 검증하고 좁힌다.
- 근거 없는 type assertion, `@ts-ignore`, `@ts-nocheck`, 빈 catch를 사용하지 않는다.
- 상태와 event는 명확한 discriminated union 및 명시적인 identifier 타입을 우선한다.
- domain 함수는 가능한 한 deterministic하고 side effect가 없게 작성한다.
- 시간과 무작위성에 직접 의존하지 말고 주입 가능한 `Clock`과 `RandomSource`를 사용한다.
- 실패는 구조화된 error로 표현하되 내부 정보나 secret을 클라이언트에 노출하지 않는다.

## 6. 변경과 dependency 원칙

- 한 작업에서 꼭 필요하지 않은 dependency를 추가하지 않는다.
- dependency 추가가 필요하면 기존 도구로 해결할 수 없는 이유, 사용 위치, 유지 비용을 확인한다.
- lockfile과 package manifest는 실제 dependency 변경이 있을 때만 함께 갱신한다.
- secret, API key, session token, 실제 credential, 로컬 환경 파일을 commit하지 않는다.
- 예시 환경 파일에는 안전한 placeholder만 사용한다.

## 7. 테스트와 완료 검증

- 변경 규모에 맞는 테스트를 작성하거나 갱신한다. 특히 domain 규칙과 server validation은 UI 없이 테스트 가능해야 한다.
- 버그 수정 시 가능하면 먼저 실패를 재현하는 테스트를 추가한다.
- 테스트를 통과시키려고 assertion을 삭제하거나, test를 skip하거나, mock으로 핵심 동작을 우회하거나, 검증 대상을 약화하지 않는다.
- 완료 전에 저장소에 정의된 root 기준 `typecheck`, `test`, `build`를 모두 실행한다.
- 일부 command가 없거나 현재 단계에서 실행할 수 없다면 임의로 대체 성공 처리하지 말고, 실행하지 못한 이유를 완료 보고에 적는다.
- 실패한 검증, flaky test, warning을 숨기지 않는다. 실패 원인과 작업 영향 범위를 그대로 보고한다.
- 문서만 변경한 작업에서도 파일 범위, 링크, 용어 일관성, `git diff --check`를 확인한다.

## 8. 문서 동기화와 완료 보고

- 계약, 상태 전이, event, 규칙 결정이 바뀌면 관련 설계 문서와 테스트를 함께 갱신한다.
- 규칙을 확정할 때는 `docs/GAME_RULES.md`에서 해당 항목을 `TO_BE_CONFIRMED`에서 `CONFIRMED`로 옮기고 결정 근거를 기록한 뒤 구현한다.
- `docs/ARCHITECTURE.md`의 경계를 바꾸는 구현은 문서와 불일치한 채로 남기지 않는다.
- 완료 보고에는 변경 파일, 핵심 결정, 남은 미확정 사항, 실행한 검증과 결과를 간결하게 포함한다.

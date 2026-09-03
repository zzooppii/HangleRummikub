# 한글 루미큐브 프로젝트 명세

## 1. 문서 상태

- 문서 버전: `0.6-phase-10-board-rule-engine`
- 대상: 첫 번째 playable MVP
- 구현 상태: Roadmap Phase 6의 browser Room/Lobby 흐름과 Phase 7의 gameplay 규칙 gate에 이어, Phase 8의 server-only 순수 Hangul·Unicode composition module, Phase 9의 versioned deterministic `TestDictionaryProvider`, Phase 10의 server-only Board·Tile validation model과 순수 RuleEngine까지 구현되었다. canonical GameState, full Tile aggregate/RulesConfig, 게임 시작과 gameplay mutation·transport/UI는 아직 없다.
- 규칙 기준: 확정된 내용과 미확정 내용은 [GAME_RULES.md](./GAME_RULES.md)를 따른다.
- 기술 구조 기준: [ARCHITECTURE.md](./ARCHITECTURE.md)를 따른다.

이 문서는 제품 범위와 성공 조건을 정의한다. 미확정 게임 규칙을 일반적인 루미큐브 규칙으로 보완하지 않는다.

## 2. 제품 개요

한글 자모 타일을 조합해 낱말을 만드는 2~4인용 실시간 멀티플레이 웹 보드게임을 만든다. 사용자는 회원가입 없이 닉네임으로 방을 만들거나 참가하고, PC와 모바일 브라우저에서 같은 게임 상태를 보며 플레이한다.

게임의 canonical state는 서버가 소유한다. 클라이언트는 받은 상태를 렌더링하고 현재 턴 동안 로컬 `TurnDraft`를 편집할 수 있지만, Submit 전에는 실제 게임 상태를 바꾸지 않는다. 서버가 제출된 전체 결과를 검증해 성공한 경우에만 원자적으로 반영한다.

## 3. 목표

- 별도 계정 없이 짧은 진입 흐름을 제공한다.
- `roomCode`와 초대 URL로 2~4명이 인터넷을 통해 같은 방에 모인다.
- 서버 권위형 설계로 타일 위조, 타인 타일 사용, 잘못된 턴 실행, 부분 반영을 막는다.
- 새로고침이나 일시적인 네트워크 단절 후 같은 플레이어로 복귀할 수 있다.
- 한글 조합 및 사전 정책을 transport/UI와 분리해 규칙을 안전하게 발전시킨다.
- 첫 MVP는 단일 Node.js 프로세스와 메모리 저장소로 단순하게 운영한다.
- 이후 Redis/PostgreSQL과 다중 인스턴스를 도입할 수 있도록 저장소와 domain의 결합도를 낮춘다.
- Railway에서 Express와 빌드된 React를 하나의 public origin으로 서비스할 수 있게 한다.

### 3.1 확정 기술 스택

| 영역 | 선택 |
| --- | --- |
| 언어 | TypeScript `strict` |
| Web | React + Vite |
| Server | Node.js + Express + Socket.IO |
| Monorepo | npm workspaces |
| Workspace | `apps/web`, `apps/server`, `packages/shared` |
| MVP state | DB 없이 server process memory |
| 첫 배포 | Railway의 단일 Node.js service |
| Production serving | Express가 빌드된 React 정적 파일을 제공하는 single public origin |

## 4. 비목표

첫 MVP에는 다음을 포함하지 않는다.

- 회원가입, 비밀번호, 소셜 로그인, 계정 복구
- 공개 방 목록, 자동 매칭, 랭킹
- 관전자, 봇, 게임 채팅
- 전적, replay, 영구 저장
- 운영용 외부 단어 사전 API 연동
- Redis/PostgreSQL 실제 연동
- 여러 server replica를 이용한 수평 확장
- 서버 재시작이나 재배포 이후 room/game 복구
- 네이티브 모바일 앱
- [GAME_RULES.md](./GAME_RULES.md)에서 아직 미확정인 세부 규칙의 임의 구현

비목표는 향후 가능성을 부정하지 않으며, 현재 MVP scope를 통제하기 위한 것이다.

## 5. 핵심 용어

| 용어 | 의미 |
| --- | --- |
| `Room` | 플레이어가 모이고 하나의 게임을 진행하는 서버 관리 단위 |
| `roomCode` | `ABCDEFGHJKMNPQRSTUVWXYZ23456789` alphabet을 사용하는 canonical uppercase 6자리 Room locator. 인증 정보가 아니다. |
| `Host` | `hostPlayerId`로 지정된 플레이어 역할. 특정 socket이 아니다. |
| `Player` | `playerId`로 식별되는 room 안의 지속적인 참가자 |
| `Connection` | `socketId`로 식별되는 일시적인 Socket.IO 연결 |
| `bootstrap credential` | Room/Player binding 전에 server가 직접 발급하는 5분 TTL의 `UNBOUND` session credential. create/join commit에서 room-scoped session으로 한 번만 승격된다. |
| `sessionToken` | 재접속 시 Player 소유권을 증명하는 high-entropy opaque 비밀값. bound session은 Room의 in-memory lifetime을 따르며 별도 absolute expiry가 없다. |
| `PhysicalTileDefinition` | physical type, source bag, quantity와 허용 `assignedSymbol`을 구분하는 versioned inventory 정의. exact table은 GAME_RULES C-22에 있다. |
| `Tile` | 고유 opaque `tileId`, immutable physical type과 source bag을 가진 실제 타일 인스턴스. identity에 회전이나 현재 symbol을 encode하지 않는다. |
| `assignedSymbol` | draft/Board placement에서 physical Tile이 현재 뜻하는 자모. server가 해당 physical definition 또는 Joker one-position universe에 대해 검증한다. |
| `Board` | stable `groupId`를 가진 WordGroup들의 ordered collection. 2D crossword가 아니다. |
| `WordGroup` | ordered Tile placement, syllable segmentation과 필요한 Joker assignment로 하나의 최종 낱말을 표현하는 단위 |
| `RulesConfig` | game:start 시 snapshot되어 한 Game 동안 바뀌지 않는 rules/dictionary/inventory version과 수치 정책 |
| `Canonical state` | 서버가 소유하고 판정에 사용하는 유일한 권위 상태 |
| `TurnDraft` | 클라이언트가 canonical state를 기준으로 임시 편집하는 비권위 상태 |
| `roomRevision` / `gameRevision` / `presenceVersion` | Room metadata, gameplay state, transient presence의 순서를 각각 나타내는 scoped version |

닉네임은 trim 후 NFC normalization하며 1~12 Unicode code point의 Letter, Number, `_`만 허용하는 표시용 문자열이다. 같은 Room의 normalized nickname은 중복될 수 없으며 identity나 인증 수단이 아니다. 같은 문자 타일도 서로 다른 `tileId`를 갖는다.

## 6. 사용자 흐름

### 6.1 방 만들기

1. 클라이언트는 Room mutation 전에 server-issued bootstrap credential을 직접 받아 보관한다.
2. 사용자가 닉네임을 입력하고 방 만들기를 요청한다.
3. 서버가 입력을 검증하고 충돌하지 않는 짧은 `roomCode`를 원자적으로 예약한다.
4. 서버가 Room, Host Player, bootstrap credential의 room-scoped session binding, idempotency 결과를 하나의 unit-of-work로 만든다.
5. 클라이언트는 `roomCode`, 초대 URL, 자신의 `playerId`와 최신 snapshot을 받는다.
6. 초대 URL은 canonical `/room/{ROOM_CODE}` 형태이며 `roomCode`만 포함하고 `sessionToken`은 포함하지 않는다.

### 6.2 방 참가

1. 사용자가 `roomCode`를 직접 입력하거나 `/room/{ROOM_CODE}` 초대 URL을 연다. 유효한 직접 URL에서는 room code를 다시 입력하지 않는다.
2. 클라이언트는 server-issued bootstrap credential을 확보하고 사용자는 닉네임을 입력한다.
3. 서버는 Room 존재 여부, 상태, 정원, 입력 형식과 bootstrap session을 검증한다.
4. 참가가 허용되면 새 Player, session binding, idempotency 결과를 원자적으로 commit하고 개인별 Room snapshot을 반환한다.
5. MVP scope 결정으로 신규 Player 참가는 `LOBBY`에서만 허용한다. 기존 Player의 재접속은 신규 참가가 아니며, 향후 중도 참가를 원하면 별도 규칙 결정이 필요하다.

### 6.3 게임 시작

1. Host가 시작을 요청한다.
2. 서버는 요청 socket에 연결된 Player가 Host인지, Room이 `LOBBY`인지, 플레이어 수가 2~4명인지 다시 검증한다.
3. 서버는 Player 목록을 한 번 shuffle해 immutable turnOrder를 만들고 첫 Player를 정한다.
4. `hangul-tile-inventory-v1`의 physical instance를 source bag별로 shuffle하고 consonant bag에서 7회, vowel bag에서 7회씩 배분한다. bag 소속 Joker는 해당 7회 중 하나로 센다.
5. 서버는 immutable `RulesConfig`, 60초 turn deadline과 시작 시각부터 25분인 Game deadline을 snapshot하고 `PLAYING`으로 원자적으로 전이한다.

### 6.4 턴 실행

1. 모든 클라이언트는 자신에게 허용된 canonical projection을 받는다.
2. 현재 턴 Player만 자신의 브라우저에서 `TurnDraft`를 편집한다.
3. 편집은 서버 상태나 다른 클라이언트에 즉시 영향을 주지 않는다.
4. Player는 기준 `gameRevision`, `turnId`, `requestId`와 proposed board 전체를 Submit한다.
5. 서버는 인증, 상태, 턴, 시간, `gameRevision`, 타일 보존·소유권 및 확정된 게임 규칙을 검증한다.
6. 성공 시 candidate state를 한 번에 commit하고 새 projection을 전송한다.
7. 실패 시 canonical state를 변경하거나 turn을 종료하지 않고 구조화된 거절 사유와 동기화에 필요한 정보를 반환한다. deadline 전에는 draft를 수정해 다시 Submit할 수 있다.

### 6.5 재접속

1. 일시 단절은 Player 탈퇴와 구분한다. 연결이 사라져도 Player, rack, turn state를 즉시 삭제하지 않는다.
2. 브라우저는 같은 tab의 `sessionStorage`에 보관한 room-scoped `sessionToken`으로 기존 Player에 대한 resume을 요청한다.
3. 서버는 token을 검증해 새 socket을 Player에 bind하고 새 `connectionGeneration`을 발급한다. `single-primary` 정책에 따라 새 resume이 성공한 뒤 이전 socket은 Room/gameplay command 권한을 잃는다.
4. 서버는 다른 플레이어의 private state를 제외한 최신 개인별 snapshot을 보낸다.
5. 이전 generation의 늦은 disconnect는 새 primary를 offline으로 바꾸지 않는다.
6. 재접속 보장은 같은 서버 프로세스와 해당 Room이 메모리에 남아 있는 동안에만 적용된다. tab/browser session을 완전히 종료한 뒤의 복구는 MVP에서 보장하지 않는다.
7. web client는 transport 재연결만으로 session이 복원되었다고 간주하지 않고 저장된 bound credential로 `session:resume`을 실행해 최신 full snapshot을 받는다.

## 7. 기능 요구사항

### 7.1 Room과 Lobby

| ID | 요구사항 |
| --- | --- |
| `FR-ROOM-001` | 사용자는 회원가입 없이 [GAME_RULES.md](./GAME_RULES.md)의 `C-09`를 만족하는 닉네임으로 Room을 생성할 수 있어야 한다. 같은 Room의 normalized nickname 충돌은 `NICKNAME_TAKEN`으로 거절한다. |
| `FR-ROOM-002` | 생성 시 [GAME_RULES.md](./GAME_RULES.md)의 `C-10`을 만족하는 uppercase 6자리 `roomCode`와 canonical `/room/{ROOM_CODE}` 초대 URL을 제공해야 한다. URL에는 credential을 포함하지 않는다. |
| `FR-ROOM-003` | `roomCode` 후보 충돌 시 원자적 예약에 실패한 후보를 사용하지 않고 최대 10개 후보까지 시도해야 한다. 10개가 모두 충돌하면 partial state 없이 `ROOM_CODE_EXHAUSTED`로 거절한다. |
| `FR-ROOM-004` | 사용자는 `roomCode` 또는 초대 URL을 통해 Room에 참가할 수 있어야 한다. |
| `FR-ROOM-005` | Room 정원은 최대 4명이며, Game은 2~4명이 있을 때만 시작할 수 있다. 5번째 신규 참가는 서버가 거절한다. |
| `FR-ROOM-006` | MVP scope에서 신규 참가는 `LOBBY`로 제한한다. Room이 보존된 동안 `PLAYING`/`FINISHED`의 기존 Player resume은 신규 참가와 구분한다. |
| `FR-ROOM-007` | Host만 게임 시작 command를 보낼 권한이 있다. 서버가 권한을 판정한다. |
| `FR-ROOM-008` | Host identity는 connection과 독립적이다. LOBBY Host explicit leave 시 CONNECTED Player 중 최저 `joinOrder`에게 즉시 승계하고, disconnect 시 60초 resume grace 뒤 같은 기준으로 승계한다. 대상이 없으면 identity를 유지하며 retention policy를 기다린다. |
| `FR-ROOM-009` | 명시적 leave와 비의도적 disconnect를 구분한다. PLAYING explicit leave는 forfeit이며 disconnect는 즉시 forfeit가 아니다. Lobby 비-Host leave의 제거 세부사항은 별도 policy로 남긴다. |

### 7.2 Game

| ID | 요구사항 |
| --- | --- |
| `FR-GAME-001` | 서버는 `LOBBY`, `PLAYING`, `FINISHED` 상태와 허용 전이를 관리해야 한다. |
| `FR-GAME-002` | 서버는 분리된 consonant/vowel bag, rack, ordered WordGroup Board, immutable shuffled turnOrder, active Player, 60초 turn deadline, 25분 Game deadline, initial meld/forfeit/stalemate 상태와 result를 관리해야 한다. |
| `FR-GAME-003` | 모든 physical Tile 인스턴스에는 고유 opaque `tileId`와 immutable physical type이 있어야 한다. placement의 `assignedSymbol`과 display rotation은 identity에서 분리하고, server는 GAME_RULES C-22/C-23의 allowedSymbols와 syllable role을 검증해야 한다. |
| `FR-GAME-004` | canonical inventory는 GAME_RULES C-22의 `hangul-tile-inventory-v1`이다. ordinary consonant 94, ordinary vowel 60, bag별 Joker 1개씩 총 2개로 전체 156개이며 시작 rack은 각 bag에서 7회씩 draw한다. 해당 bag Joker는 7개 안에 포함한다. |
| `FR-GAME-005` | Player가 보내는 gameplay mutation은 현재 턴 Player만 요청할 수 있다. 검증된 server timeout command는 별도 actor로 처리한다. |
| `FR-GAME-006` | 턴은 server Clock 기준 60초다. `receivedAt < deadlineAt`만 시간 조건을 통과하며 클라이언트 카운트다운은 표시용이다. |
| `FR-GAME-007` | 낱말 판정은 Game에 고정된 `dictionaryVersion`의 `DictionaryProvider`가 NFC 완성형 Hangul word를 검증한다. MVP provider는 GAME_RULES C-16의 승인된 30단어 `test-dictionary-v1` fixture이며 장애 시 state 불변의 recoverable failure로 처리하고 deadline을 연장하지 않는다. |
| `FR-GAME-008` | 서버만 rack-empty, 25분 cap, stalemate 또는 active non-forfeit Player 1명 종료를 판정하고 `FINISHED`, score와 ranking을 계산한다. |
| `FR-GAME-009` | initial meld는 자신의 rack Tile만 최소 6개 사용하고 각 WordGroup이 최소 2음절이어야 한다. 완료 뒤 normal turn에서는 기존 Board를 재조합할 수 있지만 자신의 rack Tile을 최소 1개 사용하고 모든 기존 Tile을 보존해야 한다. |
| `FR-GAME-010` | 일반 draw는 Player가 bag 종류만 선택하고 서버가 Tile 1개를 선택한다. timeout은 Board 불변 상태에서 최대 3개의 server-random penalty Tile을 지급한다. |
| `FR-GAME-011` | OFFLINE 상태에서 자기 turn timeout이 연속 2회인 Player와 PLAYING explicit leave Player는 forfeit하며 active rotation에서 제외하되 rack/result metadata를 보존한다. |
| `FR-GAME-012` | dedicated 쌍자음은 physical Tile 하나, 허용된 복합모음과 겹받침은 서로 다른 physical Tile 두 개를 소비한다. Joker 하나는 ordinary physical Tile 한 자리만 대체하고 two-position composition 전체를 대체하지 않는다. |

### 7.3 Draft와 Submit

| ID | 요구사항 |
| --- | --- |
| `FR-SUBMIT-001` | `TurnDraft`는 active Player의 client-only 상태다. invalid intermediate layout과 undo/reset을 허용하고 다른 Player에게 broadcast하지 않으며 새 `gameRevision`과 자동 merge하지 않는다. |
| `FR-SUBMIT-002` | Submit payload는 stable groupId, ordered physical tileId placement와 `assignedSymbol`, explicit choseong/jungseong/jongseong segmentation, one-position Joker assignment를 가진 proposed WordGroup collection 전체 및 동시성 identifier만 전달한다. canonical rack/bag/score/active Player를 클라이언트 값으로 덮어쓰지 않는다. |
| `FR-SUBMIT-003` | 서버는 payload schema와 크기, 인증된 actor, phase, `turnId`, deadline, `gameRevision`을 검증해야 한다. |
| `FR-SUBMIT-004` | 서버는 모든 `tileId`의 존재와 유일성, 전체 tile conservation, 기존 board Tile의 규칙상 허용된 이동, 새 Tile의 active Player rack 소유권을 검증해야 한다. |
| `FR-SUBMIT-005` | 서버는 확정된 initial meld, 재조합, 한글 조합, joker, 사전 규칙을 검증해야 한다. |
| `FR-SUBMIT-006` | 모든 검증이 끝나기 전에 live state를 수정하면 안 된다. 성공 시 한 번만 commit하고 실패 시 기존 state와 `gameRevision`을 유지한다. |
| `FR-SUBMIT-007` | 재전송된 같은 `requestId`가 mutation을 중복 적용하지 않도록 idempotency를 제공해야 한다. |
| `FR-SUBMIT-008` | stale `gameRevision`, 잘못된 turn, timeout, 위조 tile, invalid word 등은 안정적인 error code로 거절해야 한다. |
| `FR-SUBMIT-009` | 서로 다른 physical Tile을 사용하는 독립적인 유효 WordGroup은 같은 NFC 완성 낱말을 가질 수 있다. composed word uniqueness는 강제하지 않지만 groupId와 tileId uniqueness는 각각 유지해야 한다. |
| `FR-SUBMIT-010` | 기존 Board Joker의 logical placement 또는 assignment가 바뀌면 recovered Joker로 판정한다. 각 recovered Joker에는 canonical old symbol과 같은 final assignedSymbol을 가진 서로 다른 newly-used actor-rack ordinary Tile 하나가 필요하고, recovered Joker tileId도 final Board에 정확히 한 번 남아야 한다. |

### 7.4 Connection과 동기화

| ID | 요구사항 |
| --- | --- |
| `FR-CONN-001` | `playerId`, `sessionToken`, `socketId`를 서로 다른 개념으로 관리해야 한다. |
| `FR-CONN-002` | server-issued bootstrap credential은 5분 TTL이며 create/join의 원자적 commit에서 정확히 한 room-scoped persistent Player session으로 promotion해야 한다. |
| `FR-CONN-003` | 올바른 session으로 resume하면 `single-primary` 정책에 따라 새 socket과 `connectionGeneration`을 기존 Player에 bind하고 최신 개인별 snapshot을 보내야 한다. 이전 socket은 권한을 잃는다. |
| `FR-CONN-004` | 잘못되거나 만료된 token으로 다른 Player의 자리를 탈취할 수 없어야 한다. |
| `FR-CONN-005` | client가 delta/advisory event의 version gap을 감지하거나 resume한 경우 full snapshot 재동기화를 요청할 수 있어야 한다. Full snapshot은 중간 version 없이 직접 적용할 수 있어야 한다. |
| `FR-CONN-006` | Socket.IO delivery를 exactly-once로 가정하지 않고 중복·지연·재연결을 견뎌야 한다. |
| `FR-CONN-007` | 서버는 player-specific visibility를 강제한다. 상대 rack은 개수만, bag은 종류별 잔여 개수만 공개하고 상세/순서/future draw는 감춘다. raw `sessionToken`은 bootstrap/rotation의 직접 응답 외 snapshot이나 일반 event에 포함하지 않는다. |
| `FR-CONN-008` | create/join 전 web client는 bootstrap credential, `requestId`, command kind와 normalized input을 `sessionStorage`의 pending operation으로 보관한다. acknowledgement가 유실되면 같은 logical command를 동일 credential·`requestId`·payload로 재시도하며 새 Room이나 ghost Player를 만들면 안 된다. |
| `FR-CONN-009` | bound credential은 MVP web의 `sessionStorage`에 저장하며 Room이 server memory에 존재하고 explicit leave/Room cleanup이 일어나지 않은 동안 유효하다. 별도 absolute expiry와 tab/browser session 종료 뒤 복구는 보장하지 않는다. |
| `FR-CONN-010` | 이전 `connectionGeneration`의 늦은 disconnect는 더 새 primary socket의 presence를 offline으로 바꾸면 안 된다. |

## 8. 정보 공개 정책

서버 내부 `GameState` 전체를 그대로 broadcast하지 않는다. 서버는 인증된 Player마다 projection을 만들고 [GAME_RULES.md](./GAME_RULES.md)의 C-20 공개 범위를 적용한다.

### 공개 가능한 정보

- `roomId`, Room 상태와 normalized `roomCode`
- 각 Player의 `playerId`, normalized nickname, Host 여부와 `CONNECTED | OFFLINE` connection status
- server projection이 제공한 Player 목록의 표시 순서
- Board 전체, activePlayerId, immutable turnOrder와 서버 turn deadline
- 각 Player의 remaining rack Tile 개수와 initial meld 완료 여부
- consonant/vowel bag별 remaining count
- Game phase와 `FINISHED` result/ranking

### 본인 projection에 추가로 포함할 정보

- 자신의 rack Tile 상세와 forfeit 여부
- 자신의 session 상태처럼 비밀이 아닌 metadata. raw `sessionToken`은 snapshot이 아니라 최초 발급 또는 명시적 rotation의 직접 응답에서만 전달한다.
- 자신의 command에 대한 상세 거절 정보 중 공개할 필요가 없는 내용

### 클라이언트에 공개하지 않을 정보

- 다른 Player의 rack Tile 상세
- tile bag의 순서·상세와 future draw Tile
- server random state
- 모든 raw `sessionToken`, token hash와 bootstrap credential
- `socketId`, `connectionGeneration`, server-only `storageRevision`
- 내부 repository 정보, server-only validation metadata와 내부 stack trace

Exact physical definition과 `assignedSymbol` 정보는 기존 player-specific 공개 경계를 자동 확대하지 않는다. 상대 rack 상세, bag 순서와 future draw는 계속 비공개다.

## 9. 비기능 요구사항

### 9.1 정확성과 동시성

- Room별 mutation은 순서가 명확해야 하며 Submit과 timeout 경쟁도 같은 직렬화 경계에서 처리한다.
- 성공한 canonical commit마다 영향을 받은 `roomRevision` 또는 `gameRevision`을 단조 증가시킨다. Connection presence는 별도 `presenceVersion`을 사용해 TurnDraft를 stale로 만들지 않는다.
- 거절된 command는 canonical state를 부분 변경하지 않는다.
- 오래된 timer와 중복 command는 안전한 no-op 또는 이전 결과 재응답이어야 한다.

### 9.2 보안과 신뢰 경계

- 모든 client payload는 런타임에서 형식, 길이, 개수, 허용 값을 검증한다.
- actor는 payload의 `playerId`가 아니라 검증된 session-to-socket binding에서 얻는다.
- nickname은 trim 후 NFC normalization과 `C-09`의 code point/문자 검증을 적용한다.
- `roomCode` 입력은 trim 후 uppercase로 정규화하고 `C-10`의 6자리 ASCII alphabet을 검증한다. code는 locator일 뿐 secret이나 인증 수단으로 사용하지 않는다.
- `sessionToken`은 고엔트로피 opaque value로 발급하고 URL, analytics, 일반 로그에 기록하지 않는다.
- wire `tileId`는 opaque하고 쉽게 열거할 수 없게 하며, 허용되지 않은 Tile 참조의 오류 차이로 private Tile 존재 여부를 노출하지 않는다.
- room create/join/resume과 잘못된 command에 rate/size limit을 적용할 수 있는 경계를 둔다. 정확한 제한값은 운영 측정 후 정한다.
- secret/API key는 환경 변수로 주입하며 저장소에 commit하지 않는다.

### 9.3 타입과 유지보수성

- 모든 workspace는 TypeScript `strict`를 유지한다.
- 공용 transport contract는 `packages/shared`를 우선 사용한다.
- React UI, Socket.IO transport, domain rules, persistence 구현을 분리한다.
- `RoomRepository`, `SessionRepository`, `DictionaryProvider`, `Clock`, `RandomSource`, ID/code/token generator, scheduler를 테스트 가능한 경계로 둔다.
- 규칙은 version 또는 snapshot으로 Game에 연결해 진행 중인 게임의 의미가 중간에 바뀌지 않게 한다.

### 9.4 UX

- PC pointer와 모바일 touch 환경에서 핵심 lobby 및 board 조작이 가능해야 한다.
- 연결 중, 재접속 중, offline, Submit 처리 중, Submit 거절 상태를 구분해 표시한다.
- 거절된 Submit 후에는 서버 state와 로컬 draft의 관계를 명확히 보여 주고 안전하게 reset할 수 있어야 한다.
- 서버 deadline을 기준으로 보정되는 카운트다운을 표시하되, 화면의 0초가 판정 권한을 갖지 않는다.

### 9.5 관측 가능성

- room/game 상태 전이, command 결과, reconnect, validation error를 구조화해 기록할 수 있어야 한다.
- 로그에는 token, token hash, 다른 Player의 rack, bag 순서, 불필요한 전체 payload를 남기지 않는다.
- command 추적에는 secret이 아닌 `requestId`, `roomId`, `gameId`, `turnId`를 사용한다.

### 9.6 배포와 운영

- production에서는 하나의 Node.js HTTP server에 Express와 Socket.IO를 연결한다.
- Express는 빌드된 React asset과 SPA fallback을 동일 origin에서 제공한다.
- Railway의 환경 기반 `PORT`와 reverse proxy/WebSocket 환경을 지원한다.
- 메모리 MVP는 정확성을 위해 server replica 하나만 사용한다.
- 프로세스 장애, restart, redeploy 시 모든 in-memory Room과 session이 사라질 수 있음을 사용자와 운영 문서에 명확히 알린다.
- 비어 있거나 종료된 Room의 메모리를 정리하는 retention 정책이 필요하다. 정확한 TTL은 미확정이다.

아직 미확정인 성능 한계, Room retention TTL과 rate limit은 측정과 규칙 결정 없이 임의로 고정하지 않는다. 확정된 bootstrap TTL 5분, turn 60초, Host grace 60초와 Game cap 25분은 예외다.

## 10. MVP 완료 시나리오

세부 게임 규칙이 먼저 확정되었다는 전제에서 다음 시나리오가 자동 또는 반복 가능한 수동 테스트로 확인되어야 한다.

1. Player A가 닉네임으로 Room을 만들고 초대 URL을 얻는다.
2. Player B~D가 code 또는 URL로 참가하며, 5번째 신규 Player는 서버에서 거절된다.
3. 비Host의 시작 요청은 거절되고 canonical state가 바뀌지 않는다.
4. Host의 유효한 시작 요청으로 모든 client가 동일한 `PLAYING` game과 turn을 본다.
5. 각 client는 확정된 공개 policy에 맞는 projection만 받고, 허용되지 않은 다른 Player rack/bag 정보는 보지 못한다.
6. 현재 턴 Player의 유효한 Submit은 정확히 한 번 commit되고 모든 client가 새 `gameRevision`을 받는다.
7. 타인의 tile, 존재하지 않는 tile, 중복 tile, stale `gameRevision`, 잘못된 turn, invalid word를 포함한 Submit은 모두 거절되며 state가 불변이다.
8. 같은 `requestId`가 재전송되어도 tile draw 또는 board commit이 중복 적용되지 않는다.
9. create/join acknowledgement 유실 뒤 같은 bootstrap request를 재시도해도 Room/Player가 중복 생성되지 않는다.
10. 새로고침 후 올바른 session으로 같은 Player와 rack에 복귀한다.
11. disconnect된 Player의 identity와 tile ownership이 socket 종료만으로 사라지지 않는다.
12. Submit과 server timeout이 경합해도 둘 중 하나의 합법적인 결과만 commit된다.
13. 확정된 종료 조건이 충족되면 서버만 `FINISHED`와 결과를 만들고 모든 client가 같은 결과를 본다.
14. desktop과 mobile viewport에서 생성, 참가, draft 편집, Submit, reconnect 흐름을 완료할 수 있다.
15. Railway production 환경에서 React route와 Socket.IO가 같은 public origin으로 동작한다.

## 11. MVP 제약과 알려진 한계

- 동일 프로세스 안의 메모리 상태만 사용하므로 서버 restart 복구는 지원하지 않는다.
- single replica만 지원한다. 공유 저장소 없이 replica를 늘리면 Room state와 connection routing이 갈라질 수 있다.
- 테스트용 `DictionaryProvider`는 게임 메커니즘 검증용이며 실제 한국어 사전 완전성을 보장하지 않는다.
- Phase 8 composer는 주어진 `assignedSymbol`과 syllable segmentation의 현대 한글 조합만 판정하고 Phase 9 provider는 NFC word의 고정 fixture membership만 판정한다. Phase 10 RuleEngine은 전달받은 readonly Board와 Tile descriptor에 대한 구조, assignment, ownership/conservation, initial meld/rearrangement, Joker, composition과 dictionary validation만 수행한다. canonical GameState mutation, actor/turn/deadline/revision 판정, rack commit과 gameplay transport/UI는 아직 구현되지 않았다.
- production dictionary dataset/license, Lobby 비-Host leave, Room retention, start 시 OFFLINE 참가자 조건과 운영 한도는 아직 미확정이다.

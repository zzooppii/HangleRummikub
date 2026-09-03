# 구현 Roadmap

## 1. 목적

큰 기능을 검증 가능한 작은 단계로 나눈다. 각 단계는 앞 단계의 contract만 사용하며, 뒤 단계의 기능을 미리 끼워 넣지 않는다. `TO_BE_CONFIRMED` 규칙을 임시값으로 구현해 다음 단계로 넘어가지 않는다.

## 2. 모든 단계의 공통 Definition of Done

각 단계는 아래 조건을 공통으로 만족해야 완료다.

- 해당 단계에서 요청한 scope만 구현했다.
- 관련 `AGENTS.md`와 설계 문서를 읽고 구현과 동기화했다.
- TypeScript `strict`를 유지하고 새 `any`, 무근거 assertion, type suppression을 남기지 않았다.
- client 입력 경계에는 필요한 runtime validation이 있다.
- 새 dependency는 해당 단계에 반드시 필요한 최소 집합이며 추가 이유가 명확하다.
- 적용 가능한 unit/integration/E2E test를 추가하고 통과시켰다.
- Phase 1 이후에는 root의 `typecheck`, `test`, `build`가 모두 성공했다.
- Phase 0처럼 검증 명령이 아직 없거나 실행 불가능한 단계에서는 성공으로 가장하지 않고 그 이유와 대체한 문서 검증을 보고했다.
- 실패한 test나 warning을 숨기거나 test를 skip/약화하지 않았다.
- visibility policy상 private인 rack/bag 정보, session token, secret이 허용되지 않은 log나 public payload에 노출되지 않는다.
- scope 밖 후속 작업은 구현하지 않고 관련 문서에 기록했다.

## 3. 단계별 계획

### Phase 0. 설계 기준선

목표: 구현 전에 제품 범위, architecture, 규칙 상태, 작업 원칙을 합의 가능한 문서로 만든다.

범위:

- `AGENTS.md`
- `docs/PROJECT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/GAME_RULES.md`
- `docs/ROADMAP.md`

Definition of Done:

- 위 다섯 문서가 한국어로 존재한다.
- server-authoritative, `Player ≠ Connection`, unique `tileId`, atomic Submit, reconnect 구조가 문서 전체에서 일치한다.
- 게임 규칙이 `CONFIRMED`와 `TO_BE_CONFIRMED`로 분리되어 있다.
- 메모리 MVP의 single-process/single-replica 및 restart 유실 한계가 명시되어 있다.
- 실제 package, dependency, React/Vite/Express 코드는 생성하지 않았다.
- Markdown 링크, 용어, 변경 파일 범위, `git diff --check`를 검증했다.

### Phase 1. Monorepo와 품질 gate 골격

목표: 게임 기능 없이 npm workspaces와 TypeScript 실행 기반만 만든다.

범위:

- root npm workspaces
- `apps/web`, `apps/server`, `packages/shared` package 골격
- React + Vite와 Node.js + Express + Socket.IO의 최소 bootstrap
- 공용 TypeScript strict 설정
- root `typecheck`, `test`, `build` script
- 최소 smoke test와 lint/format 정책은 실제 필요를 확인해 선택

Definition of Done:

- root에서 workspace install과 scripts가 일관되게 동작한다.
- web 개발 화면과 server health endpoint가 각각 최소 bootstrap 수준으로 실행된다.
- 모든 workspace가 `strict` typecheck를 통과한다.
- production build artifact의 위치가 명확하다.
- Room, Tile, 게임 규칙, 임시 mock gameplay는 아직 구현하지 않았다.
- root `typecheck`, `test`, `build`가 clean checkout에서 성공한다.

### Phase 2. Shared protocol foundation과 선행 policy gate

목표: client와 server가 사용할 최소 wire contract와 식별자를 정의하고, 이 contract에 직접 영향을 주는 Lobby/session policy를 구현 전에 확정한다.

범위:

- `roomId`, `roomCode`, `playerId`, `gameId`, `turnId`, `tileId`, `requestId` 개념
- `roomRevision`, `gameRevision`, `presenceVersion`의 분리
- command/ack/snapshot envelope
- `session:bootstrap`과 pre-auth idempotency contract
- `protocolVersion`과 incompatible client 처리
- `LOBBY | PLAYING | FINISHED`
- public/private projection DTO의 분리
- 안정적인 error code의 최소 집합
- network payload runtime validation 전략
- `TBC-10`/`TBC-13` 중 duplicate connection, token/session 수명, nickname, room code, Lobby 공개 정보에 관한 선행 결정

Definition of Done:

- shared package는 browser-safe하고 Express/Socket.IO server 구현에 의존하지 않는다.
- private field와 token/hash가 public DTO에 존재하지 않는다.
- private Tile을 열거할 수 없는 opaque `tileId`와 외부 `INVALID_TILE_ACCESS` contract가 있다.
- discriminated union의 exhaustive handling이 가능하다.
- 유효/무효 payload contract test가 있다.
- web과 server가 같은 serialized contract를 import해 typecheck한다.
- 이번 단계에 필요한 `TBC-10`/`TBC-13` 항목이 normative rule과 예시를 갖고 `CONFIRMED`로 이동했다.
- 미확정 tile 수, timer 값, 점수 규칙을 상수로 넣지 않았다.

### Phase 3. Server port와 In-memory 기반

목표: domain/application이 저장 기술과 system side effect에서 분리될 기반을 만든다.

범위:

- `RoomRepository`, `SessionRepository` contract
- `RoomUnitOfWork` for command별 code/Room/Game/Player/session/idempotency atomic changes
- wire에 노출하지 않는 aggregate `storageRevision`과 lost-update CAS
- `Clock`, `RandomSource`, ID/code/token generator
- `DictionaryProvider`와 `TurnScheduler` contract shell
- in-memory Room/session adapter
- Room별 mutation serialization과 scoped-version CAS 기반

Definition of Done:

- repository contract test가 create-if-absent, code collision, lookup, delete, stale scoped revision 거절을 검증한다.
- injected failure test에서 create/join/cleanup이 code reservation, Room, Player, session을 partial state로 남기지 않는다.
- session repository가 raw token 대신 안전한 verification data를 저장한다.
- Room state에 socket object와 timer handle이 들어가지 않는다.
- fake `Clock`, deterministic random, deterministic ID를 test에서 주입할 수 있다.
- 동시 mutation test에서 해당 scope의 version 하나만 commit된다.
- room-only write와 game-only write가 경쟁해도 `storageRevision` 또는 safe partial update가 상대 field를 덮어쓰지 않는다.
- accepted mutation의 state와 idempotency result가 같은 atomic unit에 저장된다.
- Redis/PostgreSQL package를 추가하지 않았다.

### Phase 4. Room과 Session application core

목표: transport 없이 Room create/join과 지속 Player identity를 완성한다.

범위:

- nickname/code runtime validation
- Room 생성과 최대 10개 후보의 bounded code collision retry
- 최대 4명 정원과 `LOBBY` 참가
- Host Player 지정
- room-scoped session 발급·검증
- bootstrap credential promotion과 pre-auth idempotency
- explicit leave와 disconnect의 command/event 구분을 위한 contract

Definition of Done:

- Room 생성자가 Host Player가 되고 session을 받는다.
- collision 난 code를 반환하지 않으며 10개 후보가 모두 충돌하면 partial state 없이 `ROOM_CODE_EXHAUSTED`로 거절한다.
- nickname과 room code 검증이 Phase 2에서 확정한 `TBC-13` policy와 일치한다.
- 4명 Room의 5번째 동시 join 중 어느 요청도 정원을 넘기지 못한다.
- `PLAYING` 이후 신규 join은 거절하되 resume과 혼동하지 않는다.
- nickname이나 room code만으로 기존 Player를 가장할 수 없다.
- Host identity가 `socketId` 없이 저장된다.
- use case가 Express/Socket.IO 없이 unit test된다.
- create/join commit 뒤 ack 유실과 같은 request retry가 새 Room, ghost Player, 정원 중복 소비를 만들지 않는다.
- 같은 bootstrap token의 서로 다른 create/join request가 경쟁해도 `UNBOUND → BOUND` promotion은 한 번만 성공하며, client는 전송 전 token/request ID를 함께 보존한다.

### Phase 5. Socket.IO 연결과 재접속

목표: ephemeral socket을 persistent Player session에 안전하게 bind한다.

범위:

- typed Socket.IO command/ack adapter
- `session:bootstrap`, `room:create`, `room:join`, `session:resume`, `state:sync`
- connection registry와 presence
- scoped-version player-specific full snapshot
- duplicate connection 정책 확정 및 구현
- server process 유실 시 명확한 session failure

Definition of Done:

- socket handler가 payload의 `playerId`를 actor로 신뢰하지 않는다.
- create/join 후 발급된 token으로 새 socket이 동일 Player에 resume한다.
- 새로고침 뒤 같은 Player identity와 최신 허용 state를 받는다.
- 잘못된 token, 다른 Room token, 만료 token이 거절된다.
- disconnect만으로 Player가 Room에서 사라지지 않는다.
- duplicate tab 동작이 문서와 test에서 하나의 정책으로 일치한다.
- browser credential 저장, token 수명, duplicate connection이 Phase 2에서 확정한 `TBC-10` policy와 일치한다.
- single-primary 선택 시 교체된 이전 socket의 늦은 disconnect가 새 `connectionGeneration`을 offline으로 바꾸지 않고, multi-socket 선택 시 다른 active binding이 있으면 grace policy를 시작하지 않는다.
- token이 URL, broadcast, 일반 log에 포함되지 않는다.

### Phase 6. Lobby web flow

목표: PC/모바일에서 Room 생성·참가·대기·resume을 사용할 수 있게 한다.

범위:

- nickname 입력과 Room 생성
- room code 입력 및 invitation URL 참가
- 확정된 공개 범위에 따른 Lobby Player/Host/presence 상태 표시
- invitation URL 복사
- 연결·재연결·Room 없음·정원 초과 오류 UX

Definition of Done:

- desktop과 mobile viewport에서 create/join/invite flow가 완료된다.
- 직접 URL 진입과 room code 입력이 같은 Room으로 연결된다.
- UI의 Host 표시는 server projection을 따른다.
- stale session과 server restart 유실을 사용자에게 이해 가능한 상태로 표시한다.
- 게임 board나 fake gameplay를 아직 추가하지 않았다.

### Phase 7. MVP gameplay 규칙 확정 gate — COMPLETE

목표: game engine을 작성하기 전에 필요한 미확정 규칙을 결정한다.

상태:

- **Phase 7A complete (2026-09-03):** 공식 baseline과 digital-specific policy를 source type별로 구분해 확정했다.
- **Phase 7B complete (2026-09-03):** 공식 PDF, 공식 제품 페이지와 공식 판매 채널의 원본 구성표를 대조해 exact Tile inventory와 symbol representation을 확정했다.
- **Phase 7 overall complete:** inventory 합계 156, rotation family, Joker bag/one-position replacement, compound 자모와 Phase 8 composition semantics가 gate를 통과했다.

#### Phase 7A. MVP gameplay 규칙 확정 — COMPLETE

완료 범위:

- 공식 2~4인 목표, 시작 consonant 7 + vowel 7, 전체 94/60/Joker 2 합계
- server-random immutable turnOrder와 ordered WordGroup Board
- 최소 2음절, initial meld, rearrangement와 Joker gameplay 방향
- 일반 draw, invalid Submit, 60초 timeout과 penalty
- NFC Hangul lookup, versioned test dictionary policy와 fixture 후보
- 25분 Game cap, 종료·점수·stalemate
- PLAYING disconnect/leave forfeit와 LOBBY Host 승계
- gameplay public/private visibility와 RulesConfig snapshot 항목
- `OFFICIAL_BASE_RULE`, `DIGITAL_MVP_POLICY`, `IMPLEMENTATION_INVARIANT` 분리

Phase 7A Definition of Done:

- [GAME_RULES.md](./GAME_RULES.md)의 각 confirmed 항목에 normative rule, source type, 정상 예, 거절·edge case와 server validation implication이 있다.
- official rule과 digital adaptation을 같은 근거인 것처럼 표현하지 않았다.
- Phase 7A에서 확정한 Board, timing, forfeit, visibility와 RulesConfig 방향을 architecture/spec에 동기화했다.
- gameplay code, shared gameplay contract, Tile type과 dependency를 추가하지 않았다.

#### Phase 7B. Official Tile inventory와 symbol representation — COMPLETE

완료 범위:

- 공식 physical family별 exact quantity를 GAME_RULES C-22의 단일 canonical table로 기록
- ordinary consonant 94, ordinary vowel 60, Joker 2, total 156 산술 및 공식 표 교차 검산
- `ㄱ/ㄴ`, `ㅏ/ㅓ/ㅗ/ㅜ`, `ㅑ/ㅕ/ㅛ/ㅠ`, `ㅣ/ㅡ` rotation family 확정
- physical Tile identity와 placement `assignedSymbol` 분리
- dedicated 쌍자음, two-position 복합모음·겹받침과 explicit syllable role 확정
- Joker one-position replacement universe와 consonant/vowel bag별 1개 소속 확정
- 각 bag 7회 initial draw와 affiliated Joker 포함 의미 확정
- canonical inventory version `hangul-tile-inventory-v1` 지정

Phase 7 전체 Definition of Done:

- Phase 7A 범위의 규칙이 source type을 가진 normative 문장과 허용·거절·edge case로 정리되었다.
- Phase 7B exact Tile inventory, symbol representation, Joker universe와 inventory version이 공식 근거와 전체 합계 교차 검산을 통과했다.
- Phase 9 fixture 후보가 문서화되어 있으며 실제 fixture/version 승인은 Phase 9에서 수행한다고 구분했다.
- Phase 7A가 확정한 timeout·disconnect·Host 이탈·Game result와 public/private visibility가 architecture에 반영되었다.
- 남은 TBC는 영향을 받는 구현 Phase보다 먼저 결정하도록 명시했다.
- 미확정 규칙을 임시 default로 대신하지 않았다.

Phase 7 gate가 Phase 8의 exact composition input semantics를 제공했으며, Phase 7B 자체에서는 gameplay code를 선행 구현하지 않았다.

### Phase 8. 순수 Hangul·Unicode 조합 — COMPLETE

목표: UI와 network 없이 확정된 자모 sequence를 정규화하고 한글 낱말 표현으로 조합한다.

범위:

- 확정된 Tile/자모 representation
- Unicode normalization
- 음절 경계와 Hangul composition
- 허용/거절 결과를 나타내는 구조화된 domain error

Definition of Done:

- composition module은 React, Express, Socket.IO, repository를 import하지 않는다.
- 같은 input과 rules version에 항상 같은 결과를 낸다.
- 확정된 정상, 거절, 경계, 복합 자모, normalization 예시가 table-driven unit test로 존재한다.
- display용 변환과 validation용 canonical form의 관계가 문서와 test에서 일치한다.
- 외부 dictionary 조회나 board mutation을 이 단계에 넣지 않았다.

구현 결과 (2026-09-03):

- `apps/server/src/domain/hangul/composition.ts`에 `composeSyllable`, `composeWord`와 readonly composition input/output contract를 구현했다.
- Compatibility Jamo를 명시적 Unicode L/V/T index로 mapping하며, 7개 복합모음과 11개 겹받침을 exact ordered two-component sequence로 해석한다.
- 빈 word, role별 invalid composition과 word 내부 중복 `tileId`를 discriminated `HangulCompositionResult`로 반환한다.
- table-driven unit test가 choseong 19종, jungseong 21종, single jongseong 16종, cluster 11종, invalid 조합, NFC와 determinism을 검증한다.
- 이 구현은 `hangul-tile-inventory-v1`과 C-23의 고정된 composition semantics를 따른다. future rules version 선택은 caller가 명시적으로 분리해야 하며 같은 version을 의미 변경에 재사용하지 않는다.
- physical type/allowed symbol, Game ownership·conservation, Joker Tile identity 및 one-position assignment 적합성, 최소 낱말 길이와 사전 판정은 후속 RuleEngine/Dictionary 단계의 책임으로 유지했다.

### Phase 9. Test DictionaryProvider — COMPLETE

목표: 외부 API 없이 versioned 테스트 단어 목록으로 deterministic한 낱말 판정을 제공한다.

범위:

- `DictionaryProvider` contract의 실제 MVP adapter
- 승인된 test word fixture와 version
- Hangul canonical form과 dictionary lookup 경계
- provider error/timeout contract

Definition of Done:

- 승인된 허용·거절 단어 fixture가 재현 가능하게 test된다.
- provider 결과가 같은 rules/dictionary version에서 deterministic하다.
- core caller는 concrete test-list 구현이나 외부 API 세부사항에 의존하지 않는다.
- provider failure가 확정된 policy의 구조화된 결과로 변환된다.
- network call과 운영용 외부 사전 dependency를 추가하지 않았다.

구현 결과 (2026-09-03):

- server-only `DictionaryProvider`는 readonly `dictionaryVersion`과 async `lookup(word)`를 제공한다. 결과는 `ALLOWED`, `NOT_ALLOWED`, `UNAVAILABLE`이며 provider 장애는 `ERROR`와 `TIMEOUT`으로 구분한다.
- GAME_RULES C-16의 30개 후보 전체를 변경 없이 `test-dictionary-v1` readonly fixture로 승인하고 `TestDictionaryProvider`에 구현했다.
- lookup은 NFC normalization만 수행하며 trim, whitespace 제거, 자모 조합과 최소 2음절 규칙을 담당하지 않는다.
- fixture integrity, 전체 허용 단어, fixture miss, NFC/NFD, no-trim, determinism, unavailable contract와 Phase 8 composer 경계를 unit test로 검증했다.
- network, production dictionary, 새 dependency, shared DTO와 Phase 10 RuleEngine은 추가하지 않았다.

### Phase 10. Board와 순수 RuleEngine — COMPLETE

목표: UI와 network 없이 최종 proposed board 전체의 게임 규칙 유효성을 판정하는 deterministic engine을 만든다.

범위:

- 확정된 board representation과 전체 board validation
- initial meld/rearrangement/Joker 규칙
- Hangul composition과 `DictionaryProvider` 조합
- 구조화된 domain error

Definition of Done:

- engine은 React, Express, Socket.IO, repository를 import하지 않는다.
- 같은 input과 rules version에 항상 같은 결과를 낸다.
- 허용/거절/initial meld/Joker/재조합 edge case가 table-driven unit test로 존재한다.
- proposed board 전체가 검증된다.
- client-side 편의를 위한 validator가 있어도 server engine이 최종 authority다.

구현 결과 (2026-09-03):

- `apps/server/src/domain/game/board.ts`에 ordered `Board`/`WordGroup`, Phase 8 syllable/component 연결, ordinary/Joker `TileDescriptor`를 server-only validation model로 구현했다.
- `validateProposedBoard`는 canonical/proposed Board, readonly Tile lookup과 actor rack tileId, initial meld 상태, 최소 rule policy와 `DictionaryProvider`를 받아 구조화된 `BoardValidationResult`를 반환한다.
- groupId/tileId uniqueness, known Tile과 physical assignment, canonical Tile conservation, actor rack ownership을 Hangul composition과 dictionary lookup보다 먼저 검증한다.
- initial meld의 기존 Board 보존과 physical Tile 6개 임계값, normal rearrangement의 actor rack Tile 최소 1개 사용, 모든 final group의 최소 2음절을 검증한다. 여러 WordGroup의 initial meld Tile 수는 합산하며, 유효한 2음절 group 두 개는 최소 8 physical Tile을 사용하지만 임계값은 6개다.
- 같은 composed word를 서로 다른 physical Tile로 만든 여러 WordGroup은 허용한다.
- 기존 Joker는 logical placement와 assignment 변화로 recovery를 판정하고, canonical old symbol별 newly-used ordinary Tile을 일대일 multiset으로 matching하며 recovered Joker의 final Board 즉시 재사용을 conservation으로 확인한다.
- Phase 8 `composeWord`와 Phase 9 async `DictionaryProvider.lookup`을 연결하고 composition, fixture miss, provider `ERROR | TIMEOUT`을 구분된 domain error로 반환한다.
- 입력을 mutate하거나 GameState, rack, turn, revision을 commit하지 않는다. actor 인증, deadline/CAS, game:start, gameplay Socket.IO와 UI는 Phase 10에 추가하지 않았다.

### Phase 11. Game start와 권한별 상태 동기화 — COMPLETE

목표: 서버가 Game을 만들고 Tile을 배분해 첫 turn을 시작한다.

범위:

- `game:start` authorization과 state transition
- Host start control과 server-authoritative 거절 UX
- versioned `RulesConfig` snapshot
- unique `tileId` 생성, shuffle, deal
- bag/racks/board/turn canonical state
- public/private projection
- `state:snapshot`과 `turn:started`

Definition of Done:

- non-Host, 인원 부족/초과, wrong phase, duplicate start가 모두 거절된다.
- non-Host UI 제약과 무관하게 server가 start 권한을 검증한다.
- 같은 symbol Tile도 모두 고유 `tileId`를 갖는다.
- tile conservation이 start 직후 성립한다.
- 각 Player는 확정된 visibility policy에 맞는 projection만 받는다.
- projection test가 policy상 private인 rack/bag 정보와 token 유출을 탐지한다.
- fixed random을 사용한 배분 test가 재현 가능하다.
- start 성공이 `LOBBY → PLAYING`과 필요한 `roomRevision`/`gameRevision` 증가를 한 번만 commit한다.

구현 결과 (2026-09-03):

- `hangul-tile-inventory-v1`의 단일 runtime definition으로 ordinary consonant 94, ordinary vowel 60과 bag별 Joker 1개씩 총 156개의 unique physical Tile instance를 생성한다.
- immutable `RulesConfig`와 canonical `GameState`가 2/3/4인 bag shuffle·7/7 deal, empty Board, Player별 initial meld false, server-random turnOrder, `turnNumber = 1`인 첫 Turn과 60초/25분 deadline을 생성한다.
- `GameStartService`는 Room별 serialized boundary 안에서 current Host, 2~4인, 최신 `roomRevision`과 `PlayerPresenceReader` 기준 전원 CONNECTED를 검증한다. Ready 상태는 도입하지 않았다.
- start success는 `LOBBY → PLAYING`, Room/Game revision, server-only storage revision과 non-secret accepted idempotency result를 하나의 `RoomUnitOfWork` CAS로 commit한다. captured current-primary authorization은 live state swap 직전 다시 검사해 in-flight socket replacement를 막고, retry는 Game을 재생성·재배분하지 않는다.
- shared contract에 strict `game:start`, PLAYING snapshot union, private rack/public rack count와 `turn:started` advisory event를 추가했고 Socket.IO transport가 current-primary actor를 application service에 연결한다.
- 각 Player snapshot은 public Board/turn/order/bag count와 자기 rack 상세만 포함한다. 다른 rack Tile, bag order, full tiles map, credential, connection/storage/idempotency 내부값은 보내지 않는다.
- Lobby Host web control은 인원과 전원 presence를 UX에서 보조 확인하며, 성공 뒤 server snapshot 기반 최소 PLAYING 상태만 보여준다. TurnDraft·board interaction과 countdown은 추가하지 않았다.
- PLAYING의 `session:resume`과 `state:sync`는 같은 gameId, rack, turnOrder와 first Turn을 projection해 Tile 재생성·재배분 없이 복구한다.

### Phase 12. Client TurnDraft — COMPLETE

목표: 현재 턴 Player가 canonical state를 손상시키지 않고 board를 편집한다.

범위:

- board/rack rendering
- pointer와 touch 기반 Tile 배치·이동
- 확정된 board model에 따른 배치 단위 편집
- undo 또는 최소 reset
- 기준 `gameRevision`/`turnId` 추적
- non-active Player read-only view

Definition of Done:

- draft 편집만으로 network mutation이나 다른 client 변화가 발생하지 않는다.
- reset하면 최신 canonical snapshot과 자신의 rack으로 돌아간다.
- non-active Player는 Submit 가능한 draft를 만들 수 없다.
- server에서 새 `gameRevision`을 받았을 때 stale draft를 안전하게 처리하며 presence-only 변화에는 유지한다.
- disconnect/새로고침 시 미제출 draft 처리 방식이 확정된 policy와 일치하며 자동 Submit하거나 canonical state로 승격하지 않는다.
- mobile/desktop 핵심 조작에 keyboard 또는 접근 가능한 대체 control을 제공한다.
- UI 컴포넌트에 authoritative RuleEngine을 복제하지 않는다.

구현 결과 (2026-09-03):

- authoritative snapshot과 분리된 browser-only TurnDraft가 base gameId/gameRevision/turnId, editable WordGroup·syllable slots, available self rack과 최대 50단계 immutable undo history를 관리한다.
- active Player는 initial meld 상태에 따라 새 group만 편집하거나 canonical Board working copy를 재배치한다. non-active Player와 `session:replaced` tab은 read-only이며 상대 rack 상세는 받거나 표시하지 않는다.
- ordinary rotation Tile과 Joker의 one-position symbol picker, physical Tile 두 개를 사용하는 compound jungseong/final cluster slot, rack→Board·Board→Board move와 self-rack Tile return을 제공하고 draft tileId uniqueness를 유지한다.
- desktop drag와 pointer/touch click 기반 tap-to-place, Enter/Space keyboard 조작이 같은 local reducer action을 사용하며 WordGroup/syllable 추가·빈 구조 삭제, undo/reset을 제공한다.
- 같은 game/revision/turn의 duplicate 또는 presence-only snapshot과 페이지가 살아 있는 일시적 disconnect에는 draft를 유지한다. 다른 game, 더 새 gameRevision, 다른 turn, non-active 전환에는 reset하고 full refresh와 `session:replaced`에는 폐기한다.
- public Board placement projection은 Board 위 Tile의 kind/physicalType/current assignedSymbol/allowedSymbols만 추가하며 rack owner, bag order와 전체 Tile map은 계속 감춘다.
- 새 dependency 없이 구현했고 draft Board/history를 storage에 저장하지 않으며 모든 editor action은 Socket.IO gameplay event를 emit하거나 server canonical GameState를 변경하지 않는다. `turn:submit`, `turn:draw`, `turn:pass`와 해당 control은 추가하지 않았다.

### Phase 13. 원자적 Submit pipeline — COMPLETE

목표: 전체 proposed board를 검증해 성공 또는 무변경 실패를 보장한다.

범위:

- `turn:submit` command
- transport가 기록한 server-received timestamp, `requestId`, `expectedGameRevision`, `turnId`
- Room별 serialization
- candidate state
- state/turn/deadline/`gameRevision`/tile/ownership/conservation/rule/dictionary validation
- CAS commit과 player-specific snapshot
- idempotency result

Definition of Done:

- 유효한 Submit만 정확히 한 `gameRevision`을 commit한다.
- invalid phase, non-active actor, expired turn, stale `gameRevision`이 state를 바꾸지 않는다.
- 존재하지 않는 Tile, 중복 Tile, 다른 rack Tile, 규칙에 어긋난 board Tile 누락·회수가 모두 거절된다.
- invalid Hangul/word/initial meld/Joker/rearrangement가 state를 바꾸지 않는다.
- 실패 전후 canonical state deep equality와 같은 `gameRevision`을 test한다.
- 같은 request retry가 이중 commit되지 않고, 같은 ID의 다른 payload는 거절된다.
- accepted idempotency record가 state와 같은 atomic unit에 commit된다.
- 종료를 만드는 Submit은 `gameRevision`, `roomRevision`, `storageRevision`과 result를 같은 unit에 commit한다.
- commit 전에 realtime success event가 발행되지 않는다.
- commit 뒤 ack/publish 실패를 주입해도 command를 실패로 잘못 되돌려 말하지 않고 retry/`state:sync`가 committed state를 회복한다.

구현 결과 (2026-09-03):

- shared contract에 strict `turn:submit`과 browser-safe `ProposedBoard`를 추가했다. transport safety 한도는 WordGroup 156개, group당 syllable 156개, Board 전체 Tile reference 156개이며 role별 component cardinality와 bounded groupId/assignedSymbol을 runtime validation한다.
- `TurnSubmitService`는 authenticated Room/Player scope의 Room mutation lane에서 idempotency를 먼저 분류하고, current-primary actor, PLAYING phase, active Player, turnId, captured `receivedAt < deadlineAt`, expected gameRevision을 검사한 뒤 Phase 10 RuleEngine을 실행한다. async validation 뒤 최신 authority와 aggregate를 다시 확인한다.
- accepted Submit은 proposed Board, actor rack의 newly-used Tile 제거, initial meld flag와 다음 Turn 또는 rack-empty result를 격리된 candidate로 만든다. UoW CAS가 state, storage/game revisions와 accepted idempotency result를 한 번에 교체하며 failure injection과 rejection은 live state를 바꾸지 않는다.
- non-terminal Submit은 roomRevision을 유지하고 game/storage revision을 1씩 증가시키며 validation 완료 뒤 fresh Clock으로 다음 turnId, turnNumber, startedAt과 60초 deadline을 만든다. rack-empty Submit은 다음 Turn 없이 Room을 FINISHED로 전이하고 Room/Game/storage revision과 winner/score/finishedAt을 같은 commit에 포함한다.
- Socket.IO transport는 command 도착 즉시 `receivedAt`을 캡처하고 current-primary binding에서 actor를 도출한다. commit 후에만 Player별 PLAYING/FINISHED snapshot과 `turn:started` 또는 `game:finished` advisory를 전달하며, delivery failure는 commit을 rollback하지 않는다.
- web TurnDraft는 slot의 tileId/assignedSymbol만 proposed Board로 직렬화하고 active dirty draft에만 Submit control을 연다. 같은 page의 acknowledgement-loss retry는 동일 requestId/payload를 메모리에서 재사용하고 refresh 뒤 자동 재전송하지 않는다. 수정 가능한 rule rejection은 draft를 유지하고 authority/stale 계열 오류는 sync/reset한다.
- 다른 Player rack, bag order, tilesById, storage revision, connection/token/idempotency 내부값은 Submit ack, advisory와 FINISHED projection에 노출하지 않는다. FINISHED 화면은 rack-empty winner와 Player별 score만 표시하고 rematch를 제공하지 않는다.
- Phase 14 범위인 draw, no-draw turn end, timeout scheduler/penalty와 Submit-timeout 실제 경합은 추가하지 않았다.

### Phase 14. Draw, no-draw turn end와 server timer — COMPLETE

목표: 확정된 turn 종료 행동과 deadline을 서버 authority로 실행한다.

범위:

- CONSONANT/VOWEL을 고르는 `turn:draw`
- 두 bag이 모두 empty일 때만 허용하는 no-draw turn end
- 일반 PASS command 부재와 empty-bag rejection
- server `Clock` 기반 deadline
- `TurnScheduler` timeout command
- schedule retry와 overdue-turn sweeper
- stale timer no-op
- Submit/draw/timeout 경쟁
- client countdown 표시

Definition of Done:

- draw Tile은 server가 bag에서 선택하며 client가 지정할 수 없다.
- 선택한 bag만 비었을 때 상태 불변으로 거절하고, 두 bag이 모두 비었을 때만 no-draw turn end를 허용한다.
- duplicate draw command가 Tile을 두 번 가져오지 않는다.
- fake clock으로 deadline 직전/정확한 경계/직후를 재현한다.
- timeout callback은 current `gameId`/`turnId`/`gameRevision`/deadline을 다시 검증한다.
- 개별 timer 등록 실패·유실을 주입해도 retry/sweeper가 overdue turn command를 at-least-once 생성한다.
- Submit과 timeout이 경합해도 하나의 합법적 결과만 commit된다.
- reconnect해도 client 표시가 server deadline으로 다시 보정된다.
- timeout 결과가 확정된 GAME_RULES와 일치한다.

구현 결과 (2026-09-03):

- shared contract에 strict `turn:draw`, strict-empty `turn:pass`, `BAG_EMPTY`와 `PASS_NOT_ALLOWED`를 추가했다. 두 command는 requestId, expected gameRevision과 turnId만 concurrency authority로 받고 Draw는 bag kind만 추가로 받는다.
- `TurnDrawService`와 `TurnPassService`는 current-primary actor, PLAYING/current Turn, handler-entry `receivedAt < deadlineAt`, revision과 bag 조건을 같은 Room mutation lane에서 검증한다. accepted state와 idempotency result를 한 UoW로 commit해 game/storage revision만 1씩 올리고 즉시 다음 Turn을 만든다.
- internal `TurnTimeoutService`는 socket presence와 무관하게 current game/turn/revision/deadline 및 server Clock을 다시 확인한다. Board/meld를 보존한 채 canonical bags에서 최대 3 Tile penalty를 지급하고 한 번만 다음 Turn으로 진행하며 stale/duplicate callback은 no-op이다.
- `game:start`, non-terminal Submit, Draw, Pass와 Timeout이 공유 next-Turn helper와 post-commit scheduler registration을 사용한다. rack-empty terminal Submit은 schedule하지 않는다. scheduler 등록은 bounded 2회 시도하고 실패해도 canonical success를 rollback하지 않는다.
- Node timer 기반 `InProcessTurnScheduler`와 detached `ActiveTurnReader` 기반 1,000ms `OverdueTurnSweeper`를 composition root lifecycle에서 명시적으로 시작·종료한다. early/lost/duplicate timer와 shutdown race를 테스트하며 sweeper가 registration failure를 복구한다.
- Socket.IO는 Draw/Pass handler entry에서 receivedAt을 캡처하고 binding에서 actor를 도출하며, timeout은 public client command 없이 내부에서만 실행한다. commit 뒤 Player별 snapshot과 advisory `turn:started`를 fan-out한다.
- web은 active Player 전용 consonant/vowel Draw, both-empty Pass, dirty-draft 확인과 page-memory Submit/Draw/Pass 공용 single-flight를 제공한다. countdown은 snapshot serverTime offset과 deadlineAt으로만 표시하며 client에서 Turn을 변경하지 않는다.
- Draw/Timeout 뒤 actor만 새 rack Tile 상세를 받고 다른 Player는 rack count만 본다. Phase 14는 25분 Game 종료, stalemate FINISHED, offline timeout streak/forfeit, Host succession과 cleanup을 구현하지 않았다.

### Phase 15. Disconnect, Host 이탈 policy, Room cleanup — COMPLETE

목표: 연결 변화가 identity나 canonical game을 손상시키지 않게 한다.

범위:

- Lobby/Playing disconnect policy
- reconnect grace와 만료
- current Player disconnect action
- Host disconnect/leave policy
- explicit leave
- all-offline/finished Room retention cleanup

Definition of Done:

- disconnect 직후 Player, rack, turn ownership이 임의 삭제되지 않는다.
- grace 전 resume이 같은 Player와 state로 복구된다.
- grace 만료 결과가 phase별 확정 규칙과 일치한다.
- 확정된 Host 이탈 정책의 결과가 deterministic하며, 승계를 택한 경우 동시에 두 Host를 만들지 않는다.
- 오래된 grace/cleanup timer는 current state를 재검증하고 no-op할 수 있다.
- cleanup이 active Room을 삭제하지 않는다.
- exact TTL과 결과가 fake clock test에 있다.

완료 범위:

- 모든 Lobby Player의 current-primary disconnect에 generation-safe 60초 grace를 등록한다. grace 전 resume은 같은 playerId/joinOrder/Host를 유지하고, 만료 시 Player/session을 원자적으로 제거한다.
- Lobby Host explicit leave 또는 grace 만료는 남은 CONNECTED Player 중 최저 `joinOrder`를 successor로 선택한다. 모두 OFFLINE이면 Lobby를 일시적으로 hostless로 보존하고 다음 eligible resume에서 canonical Host를 선출한다.
- PLAYING disconnect는 Player/rack/turn/timer와 game/room revision을 보존한다. OFFLINE인 자기 Turn timeout streak는 server-only로 관리하며 두 번째 timeout의 최대 3 Tile penalty, forfeit와 다음 Turn을 한 commit으로 반영한다.
- immutable original turnOrder는 유지하면서 다음 Turn 선택에서 forfeited Player를 건너뛴다. explicit PLAYING leave는 penalty 없이 forfeit하고 current actor일 때만 fresh next Turn을 만든다. FINISHED leave는 session/connection만 종료한다.
- `room:leave`는 current-primary binding, nullable expected game revision과 Room/Player-scoped idempotency를 검증한다. transport terminal retry cache도 Room/Player scope로 격리하며 accepted socket을 Room channel에서 제거한다.
- `InProcessRoomPolicyScheduler`는 Lobby grace, PLAYING all-offline 30분과 FINISHED fixed 30분 retention을 composition root lifecycle에서 관리한다. generation/presence/game/deadline을 재검증하고 오래되거나 역순인 callback을 no-op 처리한다.
- cleanup은 Room/code index, Room sessions와 Room idempotency를 copy-on-write atomic boundary에서 제거한 뒤 connection registry, policy/Turn timer를 정리한다. secret-free `room:closed`는 불변 roomId와 roomCode를 함께 전달한다.
- public gameplay projection은 `forfeited`만 공개하고 offline streak, policy generation/timer, storage revision과 다른 Player rack 상세는 노출하지 않는다. web은 Lobby/Playing/Finished leave UX, Playing confirmation, forfeit 표시와 Room closed/stale-session 정리를 제공한다.
- Phase 15는 25분 종료, stalemate 종료와 active non-forfeit Player 한 명에 따른 FINISHED/result 계산을 구현하지 않았다.

### Phase 16. 종료와 결과

목표: 확정된 조건에서만 Game을 종료하고 모든 Player에게 같은 결과를 제공한다.

범위:

- 확정된 victory/end condition과 해당되는 stalemate/forfeit 조건
- score 또는 remaining-rack 계산이 확정된 경우의 계산
- `PLAYING → FINISHED`
- finished projection과 gameplay command 거절

Definition of Done:

- 각 종료 사유에 positive/negative unit test가 있다.
- 마지막 accepted command와 result가 같은 atomic commit에 포함된다.
- 모든 client가 같은 server-computed result, reason, final version vector를 받는다.
- `FINISHED` 이후 Submit/draw/no-draw turn end가 명확한 error로 거절된다.
- rematch가 scope 밖이면 UI/API에 임의로 추가하지 않았다.

### Phase 17. 통합 E2E와 안정화

목표: 실제 2~4 browser 흐름, 보안 경계, 모바일 UX를 release 수준으로 검증한다.

범위:

- multi-client E2E
- refresh/network interruption
- malformed/oversized/unauthorized payload
- scoped version gap과 duplicate delivery
- mobile/touch 및 기본 accessibility
- structured logs와 user-facing error
- dependency/security 검토

Definition of Done:

- 2·3·4인 핵심 game flow가 각각 완료된다.
- 5번째 join, non-Host start, forged Player/tile, stale Submit, duplicate request가 거절된다.
- unauthorized Tile probe가 오류 차이로 private Tile의 존재 여부를 드러내지 않는다.
- 재접속과 invalid session의 UX가 검증된다.
- visibility policy상 private인 rack/bag 정보와 token이 허용되지 않은 network payload와 log에 노출되지 않는 test가 있다.
- 주요 브라우저와 목표 mobile viewport의 smoke test 결과가 기록된다.
- known limitation과 미확정 후속 항목이 문서에 반영된다.

### Phase 18. Railway single-origin 배포

목표: 하나의 Railway service에서 web과 realtime server를 production 방식으로 제공한다.

범위:

- web production build 정적 제공
- Express API, Socket.IO, SPA fallback route 순서
- Railway `PORT`/`0.0.0.0`
- health/readiness
- production environment와 secret 처리
- single replica 설정 및 memory-loss 안내
- 배포 smoke test

Definition of Done:

- public URL 하나에서 React navigation, HTTP endpoint, Socket.IO 연결이 동작한다.
- direct SPA route refresh가 정상이며 `/socket.io`와 API가 fallback에 가로막히지 않는다.
- HTTPS proxy 뒤 WebSocket upgrade 또는 허용한 fallback transport가 동작한다.
- service는 Railway의 동적 `PORT`에 bind한다.
- client bundle에 server secret이 없다.
- replica가 1개임과 restart/redeploy 시 Room 유실이 운영 문서에 명시되어 있다.
- 실제 배포가 끝난 뒤 새 Room으로 create → join → start → reconnect 핵심 smoke flow가 통과한다. 메모리 MVP는 배포 중 기존 Room 복구를 보장하지 않는다.
- root `typecheck`, `test`, `build`와 production start 검증이 성공한다.

## 4. Phase 사이의 금지된 지름길

- Phase 1에서 임시 게임 규칙이나 mock Room 기능을 제품 코드로 넣지 않는다.
- Phase 2 shared type을 이유로 server 전체 private entity를 client에 공유하지 않는다.
- Phase 5에서 `socketId`를 `playerId`로 사용하지 않는다.
- gameplay 구현은 GAME_RULES C-22/C-23의 canonical inventory 및 symbol representation과 달라지면 안 된다. inventory 구성 변경은 새 inventory/rules version, 문서와 test 갱신 없이 기존 `hangul-tile-inventory-v1`에 덮어쓰지 않는다.
- Phase 12 client validator를 Phase 13 server validator의 대체물로 사용하지 않는다.
- Phase 13에서 live state를 먼저 mutate한 뒤 error 시 수동 복원하지 않는다.
- Phase 14 timeout callback이 current turn 재검증 없이 state를 바꾸지 않는다.
- Phase 18 이전이라도 memory MVP를 여러 replica로 운영하지 않는다.
- Redis/PostgreSQL, external dictionary, chat, account 등 뒤 scope를 “나중에 필요할 것”이라는 이유로 선행 구현하지 않는다.

## 5. 향후 확장 후보

아래는 MVP 이후 별도 승인과 설계가 필요한 후보이며 현재 roadmap 단계의 자동 scope가 아니다.

- Redis 기반 shared state, presence, idempotency, scheduler
- Socket.IO multi-node adapter와 Room command 분산 직렬화
- PostgreSQL 내구성, history, outbox
- 실제 versioned Korean dictionary
- account, matchmaking, ranking, replay
- spectator, chat, moderation
- rematch와 Room 장기 보존

각 후보는 실제 제품 요구가 생겼을 때 별도 roadmap과 Definition of Done을 작성한다.

# Multi-game Platform Migration Roadmap

> 상태: P0·P1·P2 COMPLETE, P3A COMPLETE / P3B READY (P3A 최종 quality gate와 checkpoint push 조건부)
> 작성일: 2026-09-05
> 기준선: `hangul-game-v1` / `abbfbb9`  
> 원칙: 각 Phase는 앞 Phase의 Definition of Done을 만족한 뒤 별도 작업으로 시작한다.

제품 범위는 [MULTI_GAME_PLATFORM_SPEC.md](./MULTI_GAME_PLATFORM_SPEC.md), current/target architecture는 [MULTI_GAME_ARCHITECTURE.md](./MULTI_GAME_ARCHITECTURE.md)를 따른다. P1의 exact compatibility inventory와 migration handoff는 [MULTI_GAME_P1_CHARACTERIZATION.md](./MULTI_GAME_P1_CHARACTERIZATION.md)에 있다.

## 1. 공통 실행 원칙

모든 Phase에 다음 규칙을 적용한다.

- 시작 전에 `AGENTS.md`, 관련 설계 문서, 변경 대상 code/test/package script를 읽고 `git status`를 확인한다.
- 기존 dirty change를 덮어쓰거나 되돌리지 않는다.
- 현재 production 한글 게임의 public URL, invitation route, command semantics, state privacy를 의도 없이 바꾸지 않는다.
- server-authoritative state, runtime validation, session token 비공개, player/socket identity 분리, server Clock, candidate validation 후 atomic commit, Room mutation serialization을 유지한다.
- `docs/GAME_RULES.md`의 미확정 규칙을 추측해 구현하지 않는다.
- 필요한 dependency가 명시적으로 승인되지 않은 한 추가하지 않는다.
- 기존 573 tests를 삭제·skip하거나 assertion을 약화하지 않는다.
- 구조 이동이 필요한 Phase에서도 behavior test를 먼저 추가하고 import path만 조정한다.
- 완료 전 root의 `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`를 실행한다.
- contract, lifecycle, event, rules가 바뀌면 관련 문서와 test를 같은 Phase에서 갱신한다.
- 범위 밖 발견 사항은 구현하지 않고 해당 문서의 open decision/후속 Phase에 기록한다.

production 기준선 573 tests는 shared 55, web 87, server 431로 구성됐다. 이후 추가된 test를 포함한 수는 이유 없이 감소하면 해당 Phase는 완료가 아니다.

P2 checkpoint 기준선은 shared 59, web 91, server 447로 총 597 tests다. P3A는 이 597개를 삭제·skip하지 않고 새 boundary test와 함께 보존한다.

## 2. Phase 개요

문자 suffix가 붙은 항목도 각각 별도의 실행·검증 Phase다. P3, P5, P7, P9, P11은 묶음 이름일 뿐 한 번의 Codex 작업으로 실행하지 않는다.

| Phase | 이름 | 한 줄 목표 |
| --- | --- | --- |
| P0 | Current-state analysis and transition design | 현재 구조를 분류하고 production을 보존하는 target boundary와 migration 순서를 문서화한다. |
| P1 | Platform/game boundary preparation | wire와 behavior를 바꾸지 않고 결합 지점의 characterization 및 narrow seam 준비를 한다. |
| P2 | Immutable gameType and minimal registry | v1 create로 생성되는 Room을 `HANGUL_TILE`로 동일하게 동작시키는 내부 gameType과 single-entry identity registry를 도입한다. |
| P3A | Hangul state/projection/persistence seam | 한글 state의 clone·lifecycle·projection을 narrow module seam 뒤에 둔다. |
| P3B | Hangul start and command routing seam | 기존 start와 `turn:*`를 wire 변경 없이 Hangul module로 위임한다. |
| P3C | Hangul lifecycle server-action seam | leave/presence/deadline을 optional Hangul server action 경계로 분리한다. |
| P3D | Hangul physical module move | seam이 검증된 파일만 이동하고 import 방향을 정리한다. |
| P4 | Hangul production regression gate | 기능 추가 없이 기존 production vertical slice의 완전 회귀를 통과시킨다. |
| P5A | Versioned platform snapshot contract | authoritative gameType을 가진 v2/dual-version snapshot envelope를 정의한다. |
| P5B | Web game decoding and routing | snapshot-driven web registry, route, session storage migration을 연결한다. |
| P5C | Game catalog and create selection | Home catalog와 HANGUL_TILE create 선택을 공개한다. |
| P6 | Number Tile rules gate | 구현 전에 NUMBER_TILE 규칙·state·privacy·command를 확정한다. |
| P7A | Number Tile domain implementation | 확정된 규칙으로 독립 state와 RuleEngine을 구현한다. |
| P7B | Number Tile server/shared integration | command, projection, persistence, registry를 platform 경계에 연결한다. |
| P7C | Number Tile web implementation | server projection만 소비하는 독립 game renderer를 구현한다. |
| P8 | Number Tile E2E gate | 두 game의 Room/session/reconnect/routing/privacy/command 격리를 end-to-end로 검증한다. |
| P9A | Two-game abstraction analysis | 실제 두 구현만 비교해 공통·game-specific 경계를 다시 판정한다. |
| P9B | Approved abstraction adjustments | P9A에서 승인된 작은 contract 조정만 구현한다. |
| P10 | Gem/Card rules and IP gate | 구현 전에 GEM_CARD 규칙·state·naming·asset boundary를 확정한다. |
| P11A | Gem/Card domain implementation | Tile/Rack 전제 없이 카드·resource domain을 구현한다. |
| P11B | Gem/Card server/shared integration | command, projection, persistence, registry를 platform 경계에 연결한다. |
| P11C | Gem/Card web implementation | 독립 card/resource renderer를 구현한다. |
| P12 | Multi-game E2E and deployment | 세 game의 isolation, compatibility, production rollout과 rollback을 검증한다. |

## 3. P0 — Current-state analysis and transition design

### 목표

현재 코드를 `PLATFORM_CORE`, `HANGUL_GAME`, `CROSS_GAME_CANDIDATE`, `COUPLED/UNCERTAIN`으로 분류하고 구현 없는 전환 설계를 만든다.

### Scope

- mandatory document와 repository 전체 구조 분석
- shared/server/web의 실제 coupling 기록
- platform/game lifecycle, module/registry, command, projection, persistence, scheduler, web target 설계
- P0~P12 roadmap 및 각 Phase별 Codex 실행 명령 작성
- 세 개의 multi-game 문서와 기존 architecture/roadmap의 최소 링크

### 금지사항

- application source, runtime type, event, UI, Room model 변경
- file/directory 이동과 import 변경
- gameType, interface, registry의 실제 구현
- dependency/package/lockfile 변경
- NUMBER_TILE/GEM_CARD 구현

### Definition of Done

- 세 P0 문서가 실제 file-level 근거와 target dependency 방향을 포함한다.
- production checkpoint와 `hangul-game-v1` tag가 확인된다.
- source 및 dependency diff가 없다.
- 모든 baseline quality gate가 통과한다.

### Required tests

- 기존 573 tests 전체
- root typecheck/build
- `git diff --check`
- 문서 링크와 용어 일관성 수동 검토

### Codex 실행 명령

```text
Multi-game Platform P0를 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 적용하고 AGENTS.md와 README, PROJECT_SPEC, ARCHITECTURE, GAME_RULES, ROADMAP을 먼저 읽어 git/tag 및 typecheck·573 tests·build 기준선을 확인하라. application code는 전혀 수정하지 말고 shared/server/web의 실제 의존을 PLATFORM_CORE, HANGUL_GAME, CROSS_GAME_CANDIDATE, COUPLED/UNCERTAIN으로 분류한 뒤 docs/MULTI_GAME_PLATFORM_SPEC.md, docs/MULTI_GAME_ARCHITECTURE.md, docs/MULTI_GAME_MIGRATION_ROADMAP.md를 작성하라. 기존 ARCHITECTURE/ROADMAP에는 필요한 문서 링크만 최소 추가하고, 마지막에 typecheck, test, build, git diff --check를 다시 실행해 production 한글 동작 보존 여부를 보고하라.
```

## 4. P1 — Platform/game boundary preparation

> 완료: 2026-09-04. Legacy Hangul v1 wire/snapshot/privacy/persistence/projector/service/scheduler/web 경계를 characterization했고, production behavior를 바꾸지 않은 App renderer decision seam만 추출했다. 기존 573 tests를 유지하며 characterization 9개를 추가했다.

### 목표

public behavior와 wire shape를 동결한 채 이후 추출이 깨뜨리기 쉬운 경계를 test와 작은 내부 seam으로 명시한다.

### Scope

- RoomRecord phase/game invariant, snapshot v1 shape, game start, leave/forfeit, presence restore, deadline recovery의 characterization test
- App의 현재 phase/validator route 선택과 Hangul validator 실패 시 Lobby fallback을 characterization하고, 후속 gameType dispatch를 넣을 수 있는 순수 decision seam 준비
- platform/game import dependency 목록과 금지 방향을 문서 또는 architecture test로 고정
- 현재 shared root export와 strict v1 validator compatibility 고정
- idempotency record의 Room association 및 cleanup 계약 분석 보강

### 금지사항

- 공개 command/event/snapshot 변경
- gameType/registry 구현
- directory 대규모 이동
- 한글 규칙 또는 UI 변경
- generic Tile/Turn/result/scheduler 추가

### Definition of Done

- 이후 P2/P3가 보존해야 하는 v1 동작이 자동 test로 재현된다.
- `App.tsx`의 renderer decision과 server projector 경계가 작은 단위로 test 가능하다.
- 기존 request ID 재사용, single-flight, stale revision, privacy invariant가 명시된다.
- production output과 public route/event는 바뀌지 않는다.

### Required tests

- 기존 573 tests 전부
- 기존 server integration의 create→join→start→turn→finish와 leave/presence/deadline 경쟁을 재사용하고, projector privacy/shape, Room phase invariant, transport routing의 부족한 경계만 추가
- 새 shared characterization: strict v1 command/snapshot/event shape와 root export
- 기존 web route/retry/snapshot ordering을 재사용하고 현재 renderer fallback decision만 추가; unknown game fail-closed 동작 자체는 P5에서 추가
- root typecheck/build/diff-check

### Codex 실행 명령

```text
Multi-game Platform P1만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P0 세 문서를 기준으로 public URL·Socket.IO event·StateSnapshot v1·한글 규칙·UI를 바꾸지 말고, RoomRecord/persistence/projector/transport/App/useLobbyApp의 결합을 추출하기 전에 필요한 characterization tests와 최소 내부 seam만 추가하라. gameType, GameModule, Registry, 새 게임, directory 대이동은 구현하지 마라. 기존 573 tests를 유지하고 신규 경계 test, typecheck, test, build, git diff --check 결과와 P2 준비 여부를 보고하라.
```

## 5. P2 — Immutable gameType and minimal registry

> 완료: 2026-09-05. P2는 identity와 availability 경계만 추가했으며 public v1 wire/snapshot/web behavior는 유지했다. **P2 COMPLETE / P3A READY** 표기는 root의 최종 typecheck, 전체 test, build, `git diff --check`가 모두 통과한 checkpoint를 전제로 한다.

### 목표

사용자-visible 동작은 그대로 두고 기존 v1 create로 생성되는 Room에 authoritative immutable `HANGUL_TILE` identity와 single-entry registry를 도입한다.

### Scope

- `HANGUL_TILE` 하나만 지원하는 neutral `GameType` contract와 runtime validation
- Room create 시 immutable gameType 저장; field가 없는 기존 v1 create는 server 내부에서 `HANGUL_TILE` default로 해석
- exact lookup, duplicate registration fail-fast, unknown type fail-closed인 최소 server registry
- composition root에 `{ gameType: "HANGUL_TILE" }` identity-only legacy registration 하나를 등록하고 필수 default 누락·중복을 startup에서 fail-fast
- create는 legacy default registration, start는 canonical Room registration을 state 변경 전에 확인
- Room persistence clone/phase 동작을 유지하며 unsupported create와 lifetime gameType 변경을 원자적으로 거부
- process-memory 저장소 특성상 durable old-Room migration 없이 수행하는 내부-only migration
- protocol v1, snapshot v1, Socket.IO event, URL, web을 변경하지 않음

### 금지사항

- catalog UI와 NUMBER/GEM placeholder module
- existing `turn:*` event rename
- StateSnapshot v2 공개
- concrete Hangul state 추출 또는 규칙 변경
- unknown stored type의 implicit Hangul fallback
- `GameModule`, state envelope, command dispatch capability 구현

### Definition of Done

- 기존 v1 create로 생성된 새 Room이 authoritative `HANGUL_TILE`을 가진다.
- 생성 뒤 gameType 변경이 모든 mutation path에서 거부된다.
- registry에는 identity-only legacy registration 하나만 있고 unknown/missing/duplicate가 fail-closed 또는 fail-fast한다.
- composition root와 create/start 경로가 registration availability를 확인하며 실패 시 canonical state를 변경하지 않는다.
- 기존 public response, URL, gameplay가 P1 characterization과 동일하다.
- `GameModule`이나 state/command/projection capability는 아직 존재하지 않는다.

### Required tests

- omitted v1 create → `HANGUL_TILE`
- immutable type 및 wrong/unknown type rejection
- duplicate/missing registration startup failure
- create replay/resume/reconnect 후 type 보존
- persistence copy/UoW rollback에서 type 보존
- production 기준선 573 + P1/P2 tests, typecheck/build/diff-check

### Codex 실행 명령

```text
Multi-game Platform P2만 구현하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P0/P1 characterization을 준수하고, Room 생성 시 고정되는 neutral GameType에는 실제 지원 값 HANGUL_TILE 하나만 두며 `{ gameType }` identity-only legacy registration 하나를 가진 최소 registry를 내부에 추가하라. 기존 v1 room:create schema는 바꾸지 않고 server가 누락된 값을 HANGUL_TILE로 해석하게 하며 canonical Room 값만 신뢰하라. composition startup과 create/start 경로에서 registration availability를 확인하고 Room lifetime gameType 변경을 persistence에서 원자적으로 거부하라. GameModule, state envelope, catalog, protocol v2, event rename, Hangul state 이동, NUMBER_TILE/GEM_CARD는 금지한다. immutable/unknown/missing/duplicate/replay/resume test와 전체 typecheck/test/build/diff-check를 통과시켜라.
```

## 6. P3 — Existing Hangul module extraction

P3는 한 번에 실행하지 않는다. 아래 P3A~P3D를 각각 독립 작업으로 수행하고, 각 stop gate가 통과한 뒤 다음으로 진행한다.

### 6.1 P3A — Hangul state/projection/persistence seam

> 구현 완료(조건부): 2026-09-05. 별도 Legacy Hangul state adapter와 Legacy Hangul v1 projector를 실제 caller에 주입했고 identity-only registry와 concrete typed `RoomRecord.game`은 유지했다. **P3A COMPLETE / P3B READY** 표기는 root typecheck, 전체 test, build, `git diff --check`, checkpoint commit 및 일반 `origin/master` push가 모두 성공한 경우에만 유효하다.

#### 목표

한글 state의 clone, lifecycle inspection, player projection을 narrow module seam 뒤에 두고 platform persistence/projector가 concrete board·rack·result를 직접 해석하지 않게 한다.

#### Scope

- typed `GameState`의 clone·canonical validation과 phase/recovery에 필요한 좁은 `RUNNING | FINISHED` read model을 별도 Legacy Hangul state adapter가 소유
- in-memory persistence의 copy/rollback/Room phase 검증을 injected adapter에 위임하되 CAS, gameType immutability와 atomic commit은 그대로 유지
- outer projector를 Room identity·presence·revision·server-time shell과 Legacy Hangul v1 game projection으로 분리
- canonical `gameType`이 `HANGUL_TILE`이 아닌 persistence/projector 입력은 silent fallback 없이 fail-closed
- `RoomRecord.game: GameState | null`과 P2 identity-only `GameRegistry`를 유지하고 state envelope/registry capability는 추가하지 않음
- active turn/game deadline/finished retention reader는 adapter inspection만 소비하며 기존 port와 scheduler behavior를 유지; 이 turn/deadline-shaped capability의 일반화 여부는 P3C로 보류

#### 금지사항

- start/Submit/Draw/Pass handler routing 변경
- leave/presence/deadline policy 변경
- public snapshot/event/URL/UI 변경
- 물리 directory 이동과 새 game 구현
- lifecycle/result 공통 shape의 영구 확정

#### Definition of Done

- persistence의 clone/phase-validation path와 outer projector가 Hangul Tile/Board/rack/bag/result 구조를 직접 해석하지 않는다.
- clone, rollback, CAS, gameType immutability, recovery reader behavior와 player-private projection이 기존과 동일하다.
- v1 strict snapshot validator와 wire schema가 그대로 통과한다.
- state adapter의 lifecycle surface는 실제 phase/recovery caller가 사용한 game/revision/turn/deadline/finished identity만 가진다. timeout action과 result 계산은 포함하지 않는다.
- identity registry에는 state/projector/command/scheduler capability를 추가하지 않는다.
- P1/P2 regression, 전체 quality gate, checkpoint commit과 일반 push가 성공한다.

#### Required tests

- active/finished state adapter clone·validation·nested isolation
- persistence copy-on-write/UoW rollback/phase invariant와 corrupt gameType fail-closed
- player별 rack privacy와 Board/rack conservation projection
- Playing/Finished v1 snapshot structural compatibility
- projector unsupported/corrupt gameType fail-closed
- 기존 deadline/retention recovery 및 representative Hangul lifecycle regression
- 기존 597 tests와 신규 boundary tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P3A만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 typed in-memory GameState의 clone/validation과 Room phase용 최소 lifecycle inspection을 별도 Legacy Hangul state adapter로 옮기며 outer snapshot projector를 Room shell과 Legacy Hangul v1 projection으로 분리하라. 실제 caller에 collaborator를 주입하고 unsupported gameType은 fallback 없이 거절하되 P2 identity registry를 capability registry로 확장하거나 RoomRecord.game을 envelope/unknown/JSON으로 바꾸지 마라. 기존 v1 snapshot wire schema, UoW/CAS/rollback, recovery behavior와 private rack projection을 그대로 보존하라. command routing, leave/presence/deadline action, directory 이동, 공통 lifecycle 확정, 새 게임은 건드리지 말고 전체 typecheck/test/build/diff-check와 checkpoint commit/push를 통과시켜라.
```

#### 남은 결합과 다음 stop gate

- P3B: `GameStartService`, Submit/Draw/Pass service 및 Socket.IO fixed command/advisory routing
- P3C: leave/forfeit, presence streak reset, turn/game deadline action과 현재 turn/deadline-shaped recovery port의 optional capability, finished retention/result 처리
- P3D: Hangul domain/shared source의 물리 directory와 import ownership. concrete `RoomRecord.game`의 장기 envelope/union 결정은 실제 second-game 요구 전에는 확정하지 않는다.

### 6.2 P3B — Hangul start and command routing seam

#### 목표

기존 game start와 `turn:submit/draw/pass`를 public wire 변경 없이 registry의 `HANGUL_TILE` command 경계로 위임한다.

#### Scope

- initial-state factory와 start eligibility의 game-owned 부분 분리
- platform transport의 auth, canonical gameType, phase, revision, idempotency, Room lane 처리 유지
- 기존 `turn:*` validators/handlers를 닫힌 Hangul command union adapter에 연결
- async Dictionary/RuleEngine 결과와 candidate atomic commit 보존
- command 성공 뒤 projection/broadcast orchestration 유지

#### 금지사항

- event rename 또는 generic unchecked `game:command`
- Room leave, reconnect policy, timeout scheduler 변경
- 한글 rule/inventory/score/UI 변경
- file tree 대이동과 NUMBER_TILE 구현

#### Definition of Done

- platform transport는 game command payload 내부를 해석하지 않고 Hangul adapter에 위임한다.
- registry는 canonical Room gameType으로 exact facade를 선택한다.
- 기존 start와 Submit/Draw/Pass ack, error, revision, idempotency 동작이 같다.
- 실패 command는 state와 gameRevision을 그대로 유지한다.

#### Required tests

- start authorization/readiness/idempotency
- submit/draw/pass success·failure·replay·stale revision
- async dictionary rejection과 atomic rollback
- wrong canonical gameType fail-closed
- existing Socket.IO v1 compatibility, 전체 tests/typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P3B만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 기존 game:start의 module-owned initialization과 turn:submit/draw/pass를 P2 registry의 exact HANGUL_TILE command adapter로 위임하되 Socket.IO event, payload, ack/error, UI, rule semantics는 바꾸지 마라. transport는 actor/Room/gameType/phase/revision/idempotency/serialization을 연결하고 candidate state 검증은 Hangul module, 동일 Room UoW의 atomic commit은 platform application이 소유하게 하라. leave/presence/deadline, directory 이동, generic game:command와 새 게임은 제외하고 전체 typecheck/test/build/diff-check를 통과시켜라.
```

### 6.3 P3C — Hangul lifecycle server-action seam

#### 목표

Room leave, presence 복구, timeout/game deadline 같은 platform-originated 사건의 한글 규칙 부분을 optional module server action 경계로 분리한다.

#### Scope

- running `room:leave`의 membership/session 처리와 Hangul forfeit/next-turn/result 처리 분리
- platform record와 Hangul state 변경을 하나의 candidate로 조립하고 동일 Room UoW/CAS에서 원자적으로 commit
- reconnect/presence restore의 offline timeout streak reset을 Hangul action으로 위임
- existing turn timeout와 game deadline callback을 canonical Room lane 안에서 module action으로 전달
- stale game instance/revision/deadline 재검증과 exactly-once observable commit 유지
- 기존 TurnScheduler/GameDeadlineScheduler를 Hangul adapter 뒤에서 그대로 사용

#### 금지사항

- 모든 module에 timer/turn/presence hook 강제
- generic scheduled-action mechanism 구현
- timeout/forfeit/result 규칙 변경
- public event/UI 변경, 물리 directory 이동, 새 game 구현

#### Definition of Done

- platform leave/presence/scheduler code가 Hangul offline streak, stalemate, turn, result를 직접 변경하지 않는다.
- leave/session/game 전이는 별도 partial commit 없이 동일 Room UoW에서 함께 성공하거나 함께 rollback된다.
- module leave capability가 없거나 action이 reject되면 player/session만 먼저 삭제되는 partial state가 없다.
- no-op/stale callback과 concurrent command가 기존 serialization·revision 규칙을 지킨다.
- timer가 없는 future module을 막는 필수 interface가 없다.
- Room cleanup/retention behavior가 같다.

#### Required tests

- leave/forfeit/Host succession과 session cleanup
- disconnect grace/resume/offline streak
- submit/draw/timeout/deadline races와 stale callbacks
- finish/retention/recovery/idempotency cleanup
- existing transport/web regression, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P3C만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 running room:leave, presence restore, turn timeout, game deadline에서 platform-owned Room/session/scheduler 처리와 HANGUL_TILE의 forfeit/offline streak/stalemate/next-turn/result 규칙을 optional server-action adapter로 분리하라. leave의 platform record와 game state를 하나의 candidate로 조립해 동일 Room UoW/CAS에서 함께 commit 또는 rollback하고 module capability 부재/reject 시 partial session/player 삭제를 금지하라. 기존 scheduler/wire를 유지하며 callback마다 canonical gameType/instance/scoped revision/deadline을 Room lane에서 재검증하고 generic scheduler·필수 timer hook·규칙/UI 변경·directory 이동·새 게임 없이 전체 typecheck/test/build/diff-check를 통과시켜라.
```

### 6.4 P3D — Hangul physical module move

#### 목표

P3A~P3C에서 경계가 검증된 한글 파일만 `games/hangul-tile` 소유로 이동하고 platform import 방향을 정리한다.

#### Scope

- server의 `domain/game`, `domain/hangul`, Hangul application/Dictionary 파일을 `apps/server/src/games/hangul-tile/` 아래로 단계적 이동
- shared Hangul command/projection/validation을 `packages/shared/src/games/hangul-tile/` 아래로 단계적 이동
- shared root barrel과 v1 compatibility export 유지
- server/web composition root 또는 game registry만 concrete module을 조립
- path-sensitive tests의 import/read path만 수정
- architecture dependency inventory 갱신

#### 금지사항

- behavior/refactor/rename을 파일 이동과 함께 수행
- global CSS 재구성
- package rename 또는 dependency/export surface의 불필요한 breaking change
- NUMBER_TILE/GEM_CARD 폴더를 빈 placeholder로 생성

#### Definition of Done

- platform directory/package가 concrete Hangul module을 import하지 않는다.
- concrete module을 아는 곳은 registry/composition과 v1 compatibility composition으로 제한된다.
- 기존 root consumer가 compatibility export를 통해 계속 compile한다.
- test 개수와 assertion이 감소하지 않고 observable behavior가 같다.

#### Required tests

- import/dependency boundary check
- shared legacy root exports compile test
- path-sensitive web release UI test의 동일 assertion
- 기존 전체 domain/application/transport/web tests
- typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P3D만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 P3A~P3C에서 검증된 server Hangul 파일은 apps/server/src/games/hangul-tile/, shared contract는 packages/shared/src/games/hangul-tile/ 아래로만 작은 단위로 이동해 import를 조정하라. 동작, type 이름, rule, event, snapshot, UI, CSS는 바꾸지 말며 shared root/v1 compatibility export를 유지하라. platform의 concrete Hangul import를 boundary check로 금지하고 path-sensitive test는 assertion을 유지한 채 경로만 갱신하라. 빈 future game 폴더를 만들지 말고 전체 typecheck/test/build/diff-check를 통과시켜라.
```

## 7. P4 — Hangul production regression gate

### 목표

새 기능 없이 추출된 `HANGUL_TILE`이 기준 checkpoint의 production vertical slice와 동등함을 입증한다.

### Scope

- clean production-like build와 server start
- 두 브라우저 이상 create/join/start/turn/result manual 또는 automated smoke
- invitation, Host, reconnect, presence, session replacement, timeout, forfeit, cleanup 확인
- telemetry/log에 token/private rack이 노출되지 않는지 확인
- Railway deploy/rollback runbook과 known in-memory limitation 재확인
- 필요 시 regression bug만 수정

### 금지사항

- catalog 또는 gameType public UX 추가
- NUMBER_TILE/GEM_CARD 착수
- regression과 무관한 refactor
- deployment 성공을 기능 test 대신 사용

### Definition of Done

- 기준 한글 journey와 lifecycle edge case가 모두 통과한다.
- 공개 URL과 invitation behavior가 유지된다.
- build artifact와 runtime smoke가 통과한다.
- 배포 여부와 무관하게 rollback point가 명확하다.

### Required tests

- 기존 573 + P1~P3D tests
- Socket.IO end-to-end happy/error/reconnect/timeout/forfeit paths
- web route/session restore smoke
- production-like health/static/SPA fallback test
- typecheck/build/diff-check

### Codex 실행 명령

```text
Multi-game Platform P4 회귀 gate만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 새 기능이나 architecture 확장을 하지 말며 hangul-game-v1의 create/join/invitation/Host/start/Submit/Draw/Pass/timeout/reconnect/presence/forfeit/result/cleanup 동작과 private projection을 현재 추출 구조에서 검증하라. 전체 자동 tests와 production-like build/runtime smoke를 실행하고 발견된 regression만 최소 수정하라. public URL·protocol·UI는 유지하고 typecheck/test/build/diff-check 통과 근거, 알려진 process-memory 제약, rollback checkpoint를 보고하라.
```

## 8. P5 — Game catalog and create-room selection

P5도 public protocol, web state migration, Home UX를 한 변경에 묶지 않는다. P5A~P5C를 각각 배포 가능한 stop gate로 수행한다.

### 8.1 P5A — Versioned platform snapshot contract

#### 목표

authoritative Room gameType과 game-specific projection을 표현하는 versioned shared/server contract를 추가한다.

#### Scope

- v2 또는 명시적인 v1/v2 dual-version 전략
- P5B 이전에는 v2 path를 additive/latent 또는 명시적 negotiation으로만 제공하고 current web의 default emitted snapshot은 v1 유지
- `PlatformSnapshot + gameType-discriminated GameProjection`
- common player identity/presence와 Hangul progress/result 분리
- Room gameType과 projection discriminator 일치 검증
- current v1 projection adapter와 old-client incompatibility 처리 정책
- outer platform error와 Hangul failure composition

#### 금지사항

- Home catalog 또는 web renderer 전환
- strict v1 schema에 field를 몰래 추가
- NUMBER_TILE/GEM_CARD dummy projection
- 기존 `turn:*` event rename

#### Definition of Done

- v2/dual-version schema와 runtime validation이 명시적이다.
- v1 client/old tab 처리와 rollback 전략이 문서·test로 고정된다.
- P5A 단독 배포 시 현재 web이 받는 default protocol/wire가 v1이며 global protocol switch가 일어나지 않는다.
- private Hangul projection invariant가 새 envelope에서도 유지된다.
- same Room의 gameType mutation과 discriminator mismatch가 fail-closed한다.

#### Required tests

- current web에 대한 v1 default-wire compatibility와 negotiated/latent v2 opt-in; incompatible response는 실제 version mismatch client에만 사용
- platform/game projection positive and mismatch/unknown negative cases
- player identity와 private rack separation
- no secret/credential in snapshot
- 기존 전체 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P5A만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P4 회귀 기준을 지키고, authoritative Room gameType을 담는 versioned PlatformSnapshot + game-specific projection envelope와 runtime validator를 shared/server에 추가하라. v1 strict contract에는 field를 몰래 추가하지 말고 v2는 additive/latent 또는 명시적 negotiation으로 제공해 P5A 단독 배포 시 current web에 나가는 default wire를 v1로 유지하라. HANGUL_TILE projection만 실제 조합하고 호환/rollback을 test로 고정하며 catalog, web route 전환, future dummy projection, global protocol switch, event rename 없이 전체 typecheck/test/build/diff-check를 통과시켜라.
```

### 8.2 P5B — Web game decoding and routing

#### 목표

web이 authoritative snapshot의 gameType으로 정확한 decoder/renderer를 고르고 session/retry 상태를 안전하게 migration한다.

#### Scope

- HANGUL_TILE 하나를 등록한 web game registry
- phase + gameType 기반 App route와 unsupported/incompatible screen
- `use-lobby-app`의 platform controller와 Hangul game controller 경계
- realtime outer snapshot decode 후 exact game decoder 위임
- 새 client의 명시적인 v2 opt-in/negotiation과 old v1 client의 기존 response 유지
- browser storage dual-read/migration과 snapshot 대조
- join/resume/refresh 및 pending command reset/retry 보존

#### 금지사항

- local URL/query/cache 값을 gameType 권위로 사용
- unknown/non-Hangul snapshot의 Lobby/Hangul fallback
- Home catalog/create contract 변경
- CSS 대규모 재구성, 새 game renderer

#### Definition of Done

- join/resume/refresh는 오직 server snapshot type으로 renderer를 선택한다.
- unsupported type/version은 command를 차단하는 명시적 화면으로 간다.
- current HANGUL_TILE DOM, draft, retry, revision ordering이 유지된다.
- 기존 storage session은 승인된 migration 정책으로 처리된다.
- 새 web이 v2를 명시적으로 선택한 뒤에만 v2 snapshot을 받고, old v1 client의 기존 path는 유지된다.

#### Required tests

- Hangul dispatch, mismatch/unknown type fail-closed
- non-Hangul-shaped PLAYING이 Lobby로 fallback하지 않음
- invitation/local selection 무시와 snapshot authority
- storage dual-read, resume, pending command cleanup/retry
- v2 opt-in/negotiation과 old v1 default response 병행
- 기존 web/server/shared 전체 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P5B만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P5A contract를 기준으로 HANGUL_TILE 하나만 등록한 web registry, authoritative phase+gameType route, unsupported/incompatible fail-closed 화면, realtime decoder, session-storage migration을 구현하라. P5A의 negotiation으로 새 client만 v2를 명시적으로 opt-in하고 old v1 client의 default response를 유지하며 무계획 global switch를 금지하라. /room/{ROOM_CODE}, current Hangul DOM/TurnDraft, 동일-ID retry·revision ordering을 보존하고 URL·cache를 권위로 쓰지 말며 Home catalog와 새 game UI 없이 전체 typecheck/test/build/diff-check를 통과시켜라.
```

### 8.3 P5C — Game catalog and create selection

#### 목표

Home에 game catalog와 explicit create selection을 추가하되 `HANGUL_TILE`만 enabled로 공개한다.

#### Scope

- server-owned 또는 validated catalog DTO/policy
- Home의 게임 선택 → 방 만들기 흐름
- create v2 gameType과 pending create의 동일 requestId/type retry
- invitation direct entry의 generic UI
- create ack snapshot으로 최종 renderer/type 확인
- NUMBER_TILE/GEM_CARD의 disabled/coming-later 표현은 구현을 암시하지 않는 metadata만 사용

#### 금지사항

- disabled game의 Room 생성 또는 dummy module
- client catalog metadata를 start/player-count 권위로 사용
- invitation URL에 gameType/session credential 추가
- 기존 storage key의 무계획 폐기

#### Definition of Done

- 선택 → create → common Lobby → Hangul renderer 흐름이 동작한다.
- `/room/{ROOM_CODE}`는 그대로이며 invitation join은 선택을 요구하지 않는다.
- create retry는 동일 gameType/requestId를 보존하고 ack snapshot과 불일치는 거부한다.
- 미구현 game은 접근 가능하지 않고 catalog가 accessible하다.

#### Required tests

- catalog enabled/disabled and accessibility
- explicit Hangul create와 same-ID retry
- create request vs authoritative ack mismatch
- invitation URL에 game authority/credential 없음
- legacy/default create compatibility 정책
- 기존 전체 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P5C만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P5A/P5B를 전제로 Home game catalog, explicit create gameType, pending-create 동일 requestId/type retry를 구현하라. HANGUL_TILE만 enabled로 하고 NUMBER_TILE/GEM_CARD는 실행 불가능한 metadata로만 표시하라. /room/{ROOM_CODE}와 generic invitation join을 유지하며 create 후에도 server ack snapshot을 권위로 사용하고 URL/client metadata에 권한을 주지 마라. accessibility·compatibility·전체 typecheck/test/build/diff-check를 통과시켜라.
```

## 9. P6 — Number Tile rules gate

### 목표

`NUMBER_TILE` 코드를 작성하기 전에 독립된 규칙, 상태, command, privacy, timeout/result 결정을 확정한다.

### Scope

- neutral public naming과 rules version
- tile inventory, duplicate identity, Joker 규칙
- rack, board/group legality, initial meld, rearrangement
- draw/pass/turn/timer와 disconnect/forfeit 정책
- finish/result/ranking/score
- player count와 catalog availability 조건
- authoritative command DTO와 player projection 초안
- `TO_BE_CONFIRMED`를 명시한 rules decision log
- 새 규칙은 `docs/NUMBER_TILE_GAME_RULES.md`에만 기록하고 기존 `docs/GAME_RULES.md`는 Hangul canonical 문서로 유지
- 확정된 command set을 근거로 namespaced event와 closed `game:command`를 비교해 protocol/version/compatibility 결정을 기록하고 사용자 승인 gate로 표시; 기존 Hangul v1 `turn:*` adapter 유지

### 금지사항

- 일반적인 숫자 타일 게임 관습을 근거 없이 확정
- 기존 Hangul RuleEngine/Board/TurnDraft 복사 후 이름만 변경
- 실제 implementation, UI, public enablement
- 상용 브랜드·official asset 사용 전제
- 기존 `docs/GAME_RULES.md`에 NUMBER_TILE 규칙 혼합(필요한 경우 링크만 허용)

### Definition of Done

- 구현에 필요한 모든 규칙이 confirmed 또는 명시적 blocker로 분류된다.
- state/command/projection privacy와 conservation invariant가 예제로 검증된다.
- Hangul과 같아 보이는 개념도 독립 rule 근거와 ownership을 가진다.
- 미확정 핵심 규칙이 있으면 P7은 시작하지 않는다.
- NUMBER_TILE command routing/version decision이 기록되고 사용자 승인을 얻지 못하면 P7B를 시작하지 않는다.

### Required tests

- 코드 변경이 없다면 기존 전체 tests와 docs link/diff-check
- 규칙 예시의 table-driven test plan
- inventory/conservation, legal group, Joker, initial meld, rearrangement, result edge-case test matrix

### Codex 실행 명령

```text
Multi-game Platform P6 NUMBER_TILE rules gate만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 구현 코드는 작성하지 말며, neutral naming 아래 inventory, unique tile identity, Joker, rack/board group, initial meld, rearrangement, draw/pass/turn/optional timer, disconnect/forfeit, finish/score/ranking, player count, command/projection privacy를 docs/NUMBER_TILE_GAME_RULES.md에 근거와 함께 기록하라. 확정 command set으로 namespaced event와 closed game:command를 비교해 protocol/version/compatibility decision 및 사용자 승인 gate를 기록하고 기존 Hangul v1 turn:* adapter 유지를 명시하라. 기존 docs/GAME_RULES.md에는 링크 외 NUMBER_TILE 규칙을 섞지 말고 미확정 항목은 blocker로 남겨 P7 test matrix와 전체 문서 검증 결과를 제출하라.
```

## 10. P7 — Number Tile implementation

P7은 domain, server/shared integration, web 구현을 각각 독립 stop gate로 나눈다. P7A~P7C 중 하나라도 미완료면 production catalog에서 `NUMBER_TILE`을 enable하지 않는다.

### 10.1 P7A — Number Tile domain implementation

#### 목표

P6에서 confirmed된 규칙만으로 framework-independent NUMBER_TILE state와 RuleEngine을 구현한다.

#### Scope

- 독립 inventory, unique tile instance, board/group/rack state
- deterministic initial state와 legal-action/result 판정
- 주입된 ID/random 및 P6에서 timer가 confirmed된 경우에만 Clock/deadline rule
- Joker, initial meld, rearrangement, conservation invariant
- module-owned structured domain failure

#### 금지사항

- shared wire, server repository/transport, React UI 연결
- P6 `TO_BE_CONFIRMED` 구현
- Hangul Board/RuleEngine type 변환 또는 GenericTile 추출
- system clock/random 직접 사용

#### Definition of Done

- P6 rule matrix가 UI/Socket 없이 deterministic하게 통과한다.
- candidate failure가 original state를 변경하지 않는다.
- Hangul domain import 없이 독립적으로 compile한다.
- timer 미채택 규칙이면 deadline capability가 전혀 필요하지 않다.

#### Required tests

- inventory uniqueness/conservation
- group/Joker/initial meld/rearrangement legal and illegal cases
- finish/score/ranking/tie cases
- deterministic ID/random 및 조건부 deadline boundary
- 기존 Hangul 전체 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P7A만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 docs/NUMBER_TILE_GAME_RULES.md의 CONFIRMED 항목만 사용해 framework-independent NUMBER_TILE state, inventory, RuleEngine, result를 구현하라. Hangul Board/RuleEngine을 import하거나 GenericTile을 만들지 말고 ID/random을 주입하며 timer가 P6에서 확정된 경우에만 Clock/deadline을 사용하라. shared wire, persistence, transport, web, catalog는 건드리지 말고 table-driven domain tests와 전체 typecheck/test/build/diff-check를 통과시켜라.
```

### 10.2 P7B — Number Tile server/shared integration

#### 목표

NUMBER_TILE의 닫힌 command/projection contract와 server application을 registry/persistence/realtime 경계에 연결한다.

#### Scope

- shared command, failure, player-specific projection runtime schemas
- P6에서 사용자가 승인한 NUMBER_TILE routing/version decision만 구현하고 기존 Hangul v1 `turn:*` compatibility adapter 유지
- module state codec/lifecycle/projector registration
- server auth, canonical gameType, scoped revision, idempotency, Room serialization
- candidate validation 후 atomic commit과 private projection
- P6에서 필요한 경우에만 optional scheduled server action
- catalog engine registration은 disabled/controlled 상태 유지

#### 금지사항

- React renderer와 production enablement
- open `{command: string, payload: any}`
- Hangul command/state/projection 재사용
- client-calculated board/result 신뢰

#### Definition of Done

- valid command만 exact NUMBER_TILE module로 dispatch된다.
- wrong actor/type/revision와 unauthorized tile reference가 정보 누설 없이 reject된다.
- failure는 state/revision을 유지하고 replay/serialization이 안전하다.
- HANGUL_TILE v1/v2 behavior가 변하지 않는다.
- P6 routing/version decision과 다른 구현을 임의 선택하지 않으며 승인 기록이 없으면 `BLOCKED`다.

#### Required tests

- command/runtime-schema positive and negative cases
- atomicity, idempotency, same-Room concurrency
- codec/clone/lifecycle과 gameType mismatch; scheduled action이 있으면 recovery, 없으면 recovery capability 부재
- player projection secrecy
- 조건부 scheduler stale/deadline cases
- 기존 Hangul/NUMBER domain 전체 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P7B만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P7A를 기준으로 NUMBER_TILE의 닫힌 shared command/failure/projection schema, state codec/lifecycle/projector, server application을 canonical registry와 Room UoW에 연결하라. P6에서 사용자가 승인한 routing/version decision만 구현하고 승인 기록이 없으면 BLOCKED로 보고하며 기존 Hangul v1 turn:* adapter를 유지하고 unchecked envelope를 금지하라. actor/scoped revision/idempotency/serialization/privacy/atomic commit을 지키고 timer가 확정된 경우에만 scheduled action/recovery를 연결하며 React와 production enablement 없이 전체 typecheck/test/build/diff-check를 통과시켜라.
```

### 10.3 P7C — Number Tile web implementation

#### 목표

authoritative NUMBER_TILE projection만 소비하는 독립 web renderer와 local draft interaction을 구현한다.

#### Scope

- web registry의 NUMBER_TILE decoder/renderer 등록
- game-specific board/rack/Joker editor와 result UI
- local draft와 authoritative revision reconciliation
- reconnect/resume/same-ID retry 및 pending command cleanup
- keyboard/touch/responsive/accessibility behavior
- controlled test route/feature flag에서만 접근

#### 금지사항

- client에서 legal move, score, canonical inventory 확정
- Hangul TurnDraft/editor를 type-cast하여 재사용
- shared/server rule 변경
- P8 E2E 전 production enablement

#### Definition of Done

- server projection과 ack만 authoritative state를 변경한다.
- reconnect/stale snapshot/game instance change가 local draft를 안전하게 reconcile한다.
- Hangul renderer와 style/route behavior가 회귀하지 않는다.
- catalog는 production에서 disabled 상태다.

#### Required tests

- projection decoder/renderer routing
- local draft serialization과 authoritative reset
- reconnect/retry/stale revision/error UX
- accessibility/responsive/release UI checks
- 기존 Hangul 및 전체 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P7C만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P7B projection/command를 사용해 독립 NUMBER_TILE web decoder, renderer, local draft/editor, result UI를 구현하라. server snapshot/ack만 authority로 삼고 Hangul TurnDraft를 type-cast해 재사용하지 말며 reconnect, same-ID retry, stale revision, game instance change를 안전하게 reconcile하라. controlled test flag 외 production catalog는 disabled로 유지하고 accessibility와 전체 typecheck/test/build/diff-check를 통과시켜라.
```

## 11. P8 — Number Tile E2E gate

### 목표

`HANGUL_TILE`과 `NUMBER_TILE`이 같은 platform에서 서로 간섭 없이 전체 lifecycle을 수행함을 검증한다.

### Scope

- 두 game 각각 catalog create, invitation join, Lobby, start, gameplay, finish
- refresh/resume/reconnect/session replacement/presence
- host leave와 player leave/forfeit, 그리고 해당 game rules에서 timer가 confirmed된 경우의 timeout이 각 module 규칙대로 동작
- concurrent Room mutation과 idempotency replay
- 같은 process의 서로 다른 game Room isolation
- unsupported/wrong game command rejection
- production enablement 전 smoke와 operational notes

### 금지사항

- GEM_CARD 착수
- test 통과를 위한 rule 완화
- E2E 중 발견한 architecture 문제를 큰 refactor로 동시에 해결
- 한 game error를 다른 game fallback으로 처리

### Definition of Done

- 두 game의 happy/error/reconnect/finish path가 automated E2E로 통과한다.
- snapshot renderer와 command router가 canonical Room gameType만 사용한다.
- private state와 broadcast가 Room/game/player 경계를 넘지 않는다.
- Hangul production behavior가 그대로다.

### Required tests

- game별 complete E2E journey
- cross-game command, snapshot, idempotency 및 사용 중인 경우의 scheduler isolation
- multi-client reconnect and stale revision races
- unsupported type/version UI와 server rejection
- 전체 unit/integration/E2E, typecheck/build/diff-check

### Codex 실행 명령

```text
Multi-game Platform P8 E2E gate만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 HANGUL_TILE과 NUMBER_TILE 각각에 대해 catalog create부터 invitation join, Lobby, start, gameplay, leave, finish, refresh/resume/reconnect/session replacement까지 자동 E2E를 추가하라. timeout은 해당 game rules에서 timer가 confirmed된 경우에만 검증하고, 같은 process의 두 game Room·command·projection·idempotency·scheduler 격리를 확인하라. wrong-game command와 private leakage를 fail-closed하게 검증하며 regression만 최소 수정하고 GEM_CARD/범용 refactor 없이 전체 typecheck/test/build/diff-check와 production enablement 판단을 보고하라.
```

## 12. P9 — Two-game abstraction review

P9A에서 분석과 승인안을 만들고, 별도 P9B에서 승인된 작은 변경만 구현한다.

### 12.1 P9A — Two-game abstraction analysis

#### 목표

두 실제 module을 비교해 검증된 공통성과 우연한 유사성을 문서로 판정한다.

#### Scope

- GameModule/registry/command/projection/persistence/scheduler surface 사용 실태 조사
- duplicate orchestration의 의미·불변 조건 비교
- unused, Hangul-shaped, NUMBER-shaped abstraction 목록
- revision/result/player policy와 codec/recovery capability 재검토
- Tile 없는 GEM_CARD state/action thought experiment
- 유지/축소/승격/제거 제안과 migration 영향 문서화
- decision ID와 사용자 승인 상태를 가진 결과를 `docs/MULTI_GAME_ABSTRACTION_REVIEW.md`에 기록

#### 금지사항

- interface나 source 실제 변경
- GEM_CARD 구현
- 줄 수 감소만을 근거로 한 DRY 추출
- public protocol 또는 production behavior 변경

#### Definition of Done

- 모든 existing platform member에 두 game 근거 또는 축소 제안이 있다.
- 한 game만 쓰는 capability가 명확히 표시된다.
- GEM_CARD 예시는 game-specific Tile/Rack contract 없이 Room core를 통과한다.
- P9B에 들어갈 승인 단위가 독립적으로 검증 가능하게 나뉜다.
- 각 decision ID가 `PROPOSED | APPROVED | REJECTED`로 표시되고 Codex가 사용자 승인을 추정하지 않는다.

#### Required tests

- source 변경이 없으면 전체 two-game suite 재실행
- current registry/module conformance 및 dependency boundary 결과 수집
- optional scheduler/no-timer와 result/projection isolation 근거 확인
- docs link/terminology와 diff-check

#### Codex 실행 명령

```text
Multi-game Platform P9A 분석만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 HANGUL_TILE과 NUMBER_TILE의 실제 state/command/projection/persistence/scheduler 호출을 비교해 각 platform member를 유지·축소·module 환원·승격 후보로 분류하라. source/interface/public protocol은 수정하지 말고 Tile 없는 GEM_CARD thought experiment로 경계를 검증하라. decision ID, 근거, risk, PROPOSED/APPROVED/REJECTED 사용자 승인 상태와 독립적인 P9B 변경안을 docs/MULTI_GAME_ABSTRACTION_REVIEW.md에 기록하고 전체 two-game test와 문서 검증 결과를 제출하라.
```

### 12.2 P9B — Approved abstraction adjustments

#### 목표

P9A에서 근거와 승인을 얻은 작은 contract adjustment만 순차 구현한다.

#### Scope

- unused 또는 한 game 편향 member 제거/optional화/module 환원
- 두 game에서 의미가 같은 orchestration만 platform으로 승격
- codec, projection, recovery, revision/result type의 승인된 최소 조정
- compatibility adapter와 관련 문서/test 동기화
- 한 변경 단위마다 full regression stop gate
- `docs/MULTI_GAME_ABSTRACTION_REVIEW.md`에서 사용자가 `APPROVED`로 확정한 decision ID만 입력으로 사용

#### 금지사항

- P9A에 없거나 승인되지 않은 refactor
- GenericTile/Rack/Board/Joker/turn timer 승격
- GEM_CARD 구현과 public protocol 변경
- 여러 독립 adjustment의 검증 없는 일괄 적용
- 승인된 decision ID가 없는데 임의로 구현 진행; 이 경우 P9B는 `BLOCKED`

#### Definition of Done

- 모든 변경이 두 game의 실제 사용 근거를 가진다.
- platform은 concrete Hangul/Number type을 import하지 않는다.
- no-timer/non-Tile future module을 막는 필수 member가 없다.
- 두 game observable behavior와 wire compatibility가 유지된다.
- 완료 보고가 구현한 decision ID와 사용자 승인 근거를 열거한다.

#### Required tests

- 두 module conformance와 dependency boundary
- optional capability/no-timer cases
- result/projection/codec isolation
- complete Hangul/Number E2E after each adjustment
- typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P9B만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 docs/MULTI_GAME_ABSTRACTION_REVIEW.md에서 사용자가 APPROVED로 확정한 decision ID만 하나씩 구현하라. 승인된 ID가 없으면 추정하지 말고 BLOCKED로 보고하라. 두 game에서 의미가 같은 부분만 platform으로 승격하고 한 game 전용 member는 optional화하거나 module로 되돌리며 GenericTile/Rack/turn timer와 GEM_CARD/public protocol은 제외하라. 각 adjustment 뒤 두 게임 전체 회귀와 dependency/typecheck/test/build/diff-check를 통과시키고 구현 ID와 승인 근거를 보고하라.
```

## 13. P10 — Gem/Card rules and IP gate

### 목표

Tile/Rack과 다른 `GEM_CARD`의 rules, state, command, privacy, neutral naming/asset 경계를 구현 전에 확정한다.

### Scope

- neutral public/internal naming과 rules version
- card market/deck, resource/token supply, purchase, reserve, score 구조
- hidden/public information과 player-specific projection
- turn/action ordering, refill, limits, finish/tie rules
- player count, reconnect/leave/forfeit, optional timer 정책
- command DTO/result schema 초안
- original or properly licensed asset strategy와 별도 legal review 필요 항목
- 새 규칙은 `docs/GEM_CARD_GAME_RULES.md`에만 기록하고 기존 `docs/GAME_RULES.md`는 Hangul canonical 문서로 유지

### 금지사항

- 특정 상용 게임 rulebook/brand/logo/art를 사용할 수 있다고 가정
- 확정되지 않은 규칙의 구현
- GEM_CARD를 Tile/Rack/Board interface에 맞춤
- P9B에서 승인된 boundary를 단지 편의를 위해 확장
- 기존 `docs/GAME_RULES.md`에 GEM_CARD 규칙 혼합(필요한 경우 링크만 허용)

### Definition of Done

- 구현 필수 규칙과 privacy/conservation invariant가 confirmed 또는 blocker다.
- 공개 naming/asset source가 neutral하고 추적 가능하다.
- market/resource/reserve projection이 secret leakage 없이 정의된다.
- 핵심 blocker가 있으면 P11을 시작하지 않는다.

### Required tests

- 코드 미변경 시 기존 전체 tests와 docs/diff-check
- market refill, resource conservation, purchase/reserve, limits, finish/tie table-driven plan
- privacy and unauthorized card/resource reference matrix
- no-timer 또는 optional-timer lifecycle cases

### Codex 실행 명령

```text
Multi-game Platform P10 GEM_CARD rules/IP gate만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 구현 없이 neutral naming 아래 card market/deck, resources/tokens, purchase, reserve, refill, limits, turn ordering, finish/tie, player count, reconnect/leave, optional timer, private projection을 docs/GEM_CARD_GAME_RULES.md에 기록하라. 기존 docs/GAME_RULES.md에는 링크 외 GEM_CARD 규칙을 섞지 말고, 상용 브랜드·logo·official art 사용 가능성을 가정하지 않으며 original/licensed asset 경계와 별도 검토 항목을 남겨라. Tile/Rack/Board에 맞추지 말고 미확정 규칙은 blocker로 표시해 P11 test matrix와 gate 판정을 제출하라.
```

## 14. P11 — Gem/Card implementation

P11은 domain, server/shared integration, web 구현을 각각 독립 stop gate로 수행한다. P11A~P11C가 모두 끝나기 전에는 production catalog에서 enable하지 않는다.

### 14.1 P11A — Gem/Card domain implementation

#### 목표

P10에서 confirmed된 카드·resource 규칙만으로 Tile/Rack 전제 없는 deterministic domain을 구현한다.

#### Scope

- card deck/market, resource/token supply, player holdings/reserve state
- purchase, reserve, refill, limit, finish/tie RuleEngine
- 주입된 ID/random과 confirmed된 경우만 optional Clock
- resource/card conservation과 private state invariant
- module-owned structured failures

#### 금지사항

- shared wire/server persistence/React UI 연결
- GenericTile/GenericRack/WordGroup adapter
- P10 미확정 규칙과 상용 asset
- client-computed score/resource 의존

#### Definition of Done

- P10 rule matrix가 framework 없이 deterministic하게 통과한다.
- failure가 state를 변경하지 않고 conservation invariant가 항상 유지된다.
- Hangul/Number game type을 import하지 않는다.
- timer를 채택하지 않았다면 deadline capability가 없다.

#### Required tests

- market refill/deck exhaustion
- resource/token conservation과 purchase/reserve limits
- finish/tie/score cases
- hidden reserve/deck invariant
- optional/no-timer behavior
- 기존 두 game 전체 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P11A만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 docs/GEM_CARD_GAME_RULES.md의 CONFIRMED 항목만 사용해 Tile/Rack 없는 card market/deck/resources/player holdings/reserve state와 purchase/reserve/refill/finish RuleEngine을 구현하라. ID/random을 주입하고 timer가 확정된 경우에만 Clock을 사용하며 GenericTile/WordGroup, shared wire, persistence, React, catalog는 제외하라. conservation/privacy/result table-driven tests와 세 game 전체 typecheck/test/build/diff-check를 통과시켜라.
```

### 14.2 P11B — Gem/Card server/shared integration

#### 목표

GEM_CARD command/projection/state codec을 canonical registry와 Room application 경계에 연결한다.

#### Scope

- closed shared command/failure/player projection runtime schema
- state codec, lifecycle inspector, projector registration
- canonical gameType, actor, scoped revision, idempotency, Room serialization
- candidate validation 후 atomic commit과 private projection
- rules에서 필요한 경우만 optional server action/recovery
- registry 등록과 catalog disabled/controlled 상태

#### 금지사항

- React renderer와 production enablement
- generic Tile/Rack conversion 또는 open command payload
- client-owned resource/score/state 신뢰
- Hangul/Number protocol·rules 변경

#### Definition of Done

- exact GEM_CARD module만 validated command를 처리한다.
- wrong actor/type/revision와 unauthorized resource/card reference가 안전하게 reject된다.
- failure는 state/revision을 유지하고 concurrent purchase/reserve가 직렬화된다.
- player별 projection이 deck/reserve privacy policy를 지킨다.

#### Required tests

- runtime command/projection schemas
- atomicity/idempotency/concurrent purchase-reserve
- codec/clone/lifecycle; scheduled action이 있으면 recovery, 없으면 recovery capability 부재
- private projection and existence-nondisclosure
- optional/no-timer application path
- 기존 두 game 전체 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P11B만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P11A를 기준으로 GEM_CARD의 닫힌 shared command/failure/projection schema, state codec/lifecycle/projector, server application을 canonical gameType registry와 Room UoW에 연결하라. resource/card conservation, actor/scoped revision, idempotency, serialization, private projection, atomic commit을 서버에서 검증하고 필요한 경우에만 optional server action을 사용하라. React와 production enablement는 제외하고 세 게임 전체 typecheck/test/build/diff-check를 통과시켜라.
```

### 14.3 P11C — Gem/Card web implementation

#### 목표

authoritative GEM_CARD projection만 소비하는 독립 card/resource renderer를 구현한다.

#### Scope

- web registry의 GEM_CARD decoder/renderer
- market/resource/purchase/reserve/result interaction
- approved neutral/original/licensed asset만 사용
- local selection과 server ack/snapshot reconciliation
- reconnect/resume/retry/error UX
- keyboard/touch/responsive/accessibility behavior

#### 금지사항

- Tile/Rack UI adapter와 client-side canonical rule/score 계산
- unapproved brand/logo/official art
- server/shared rule 변경
- P12 E2E 전 production enablement

#### Definition of Done

- renderer가 server projection과 ack만 authority로 사용한다.
- hidden deck/reserve data를 DOM/log에 노출하지 않는다.
- reconnect와 stale snapshot에서 local interaction이 안전하게 reset/reconcile된다.
- Hangul/Number renderer가 회귀하지 않고 catalog는 controlled 상태다.

#### Required tests

- decoder/renderer routing and private DOM checks
- purchase/reserve retry/reconnect/stale revision UX
- result rendering과 accessibility/responsive checks
- asset provenance/build verification
- 기존 두 game 및 전체 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P11C만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P11B projection/command를 사용해 독립 GEM_CARD web decoder, market/resource/purchase/reserve/result renderer를 구현하라. server snapshot/ack만 authority로 삼고 hidden deck/reserve를 DOM/log에 노출하지 말며 승인된 neutral/original/licensed asset만 사용하라. reconnect/retry/stale revision과 accessibility를 검증하고 P12 전 production catalog는 controlled 상태로 유지한 채 세 게임 전체 typecheck/test/build/diff-check를 통과시켜라.
```

## 15. P12 — Multi-game E2E and deployment

### 목표

세 game이 한 production platform에서 안전하게 선택·실행·복구·종료되며 rollback 가능한지를 검증하고 배포한다.

### Scope

- catalog와 각 create/join/invitation path
- 세 game의 full gameplay/finish E2E
- simultaneous mixed-game Rooms, reconnect, session replacement, presence, leave/cleanup
- command/projection/idempotency와 실제 사용하는 game의 scheduler/recovery cross-game isolation
- unsupported version/type와 old client migration
- Railway single service/1 replica production rollout, smoke, observability, rollback
- current process-memory loss와 production dictionary 제약을 명시

### 금지사항

- 이 Phase에서 durable persistence/multi-replica를 함께 구현
- test failure를 알려진 문제로 숨기고 deploy
- active Room compatibility를 고려하지 않은 무계획 deploy
- 미검증 game/asset enablement

### Definition of Done

- 세 game E2E와 기존 Hangul regression이 모두 통과한다.
- mixed-game load에서 Room/private state/event가 격리된다.
- deploy 전 code/release rollback checkpoint와 version compatibility가 문서화된다. 이는 process-memory active Room data의 backup/recovery를 의미하지 않는다.
- public smoke에서 catalog, invitation, 각 enabled game이 동작한다.
- known limitations가 README/운영 문서와 일치한다.

### Required tests

- 전체 unit/integration/E2E suite
- three-game matrix: create/join/start/actions/finish/reconnect/leave
- cross-game wrong command and projection leakage tests
- idempotency concurrency; scheduled action을 쓰는 game만 scheduler/recovery, 쓰지 않는 module은 capability 부재 확인
- production build, health/static/SPA smoke
- post-deploy manual smoke와 rollback rehearsal
- typecheck/build/diff-check

### Codex 실행 명령

```text
Multi-game Platform P12 배포 gate만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 HANGUL_TILE, NUMBER_TILE, GEM_CARD의 catalog/create/invitation/Lobby/gameplay/finish/reconnect/leave/cleanup 전체 E2E와 mixed-game Room isolation, wrong-command rejection, private projection, idempotency를 검증하라. scheduled action을 쓰는 game만 scheduler/recovery race를 검증하고 미사용 module은 capability 부재를 확인하라. durable persistence/multi-replica 없이 현재 Railway와 dictionary 제약을 문서화하고 모든 gate 뒤 code/release rollback checkpoint를 확보하되 process-memory active Room backup으로 표현하지 말며 승인된 game/asset만 배포·smoke하라.
```

## 16. Phase 간 의사결정 규칙

- Phase가 `BLOCKED`이면 다음 Phase를 시작하지 않는다.
- rules gate(P6, P10)의 핵심 `TO_BE_CONFIRMED`는 구현 Phase(P7A, P11A)로 넘기지 않는다.
- P3에서 module surface가 부족하더라도 NUMBER_TILE 요구를 추측해 확장하지 않는다.
- P9A/P9B는 실제 두 game 근거가 있는 유일한 abstraction 승격 gate다.
- GEM_CARD가 current interface에 맞지 않으면 game을 왜곡하지 않고 P9B contract를 더 작게 만드는 별도 변경을 제안한다.
- protocol version 변경, storage migration, production enablement는 각각 해당 Phase의 명시적 DoD와 rollback 계획이 있어야 한다.
- 매 Phase 완료 보고에는 변경 파일, 핵심 결정, 미확정 사항, test 수와 결과, production compatibility 영향을 포함한다.

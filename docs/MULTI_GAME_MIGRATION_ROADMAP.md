# Multi-game Platform Migration Roadmap

> 상태: P12 COMPLETE / THREE-GAME PLATFORM V1 VERIFIED / P13 COMPLETE / P13B COMPLETE
> 작성일: 2026-09-07
> 기준선: `hangul-game-v1` / `abbfbb9`  
> 원칙: 각 Phase는 앞 Phase의 Definition of Done을 만족한 뒤 별도 작업으로 시작한다.

제품 범위는 [MULTI_GAME_PLATFORM_SPEC.md](./MULTI_GAME_PLATFORM_SPEC.md), current/target architecture는 [MULTI_GAME_ARCHITECTURE.md](./MULTI_GAME_ARCHITECTURE.md)를 따른다. P1의 exact compatibility inventory와 migration handoff는 [MULTI_GAME_P1_CHARACTERIZATION.md](./MULTI_GAME_P1_CHARACTERIZATION.md)에 있다. P9A의 two-game evidence, score와 승인 대기 decision은 [MULTI_GAME_P9A_ABSTRACTION_ANALYSIS.md](./MULTI_GAME_P9A_ABSTRACTION_ANALYSIS.md)에 있다.

## P13 current review status (2026-09-08)

[THREE_GAME_POST_RELEASE_ABSTRACTION_REVIEW.md](./THREE_GAME_POST_RELEASE_ABSTRACTION_REVIEW.md)에서 세 게임의 실제 mechanism/policy를 재분류했고 P13 자체는 analysis-only로 완료했다. `three-game-platform-v1` local/remote tag는 verified runtime `db0e6c6`에 유지된다. 아래 P12의 tag 미생성/P13 미시작 표현은 당시 history다. 이후 별도 사용자 승인으로 P13-001 public participant mapper, P13-002 caller-owned feedback RequestId mark, P13-003 MM:SS formatter만 **APPROVED / IMPLEMENTED**다. P13B gate는 1225 tests(91/283/851) 연속2회 및 typecheck/build/targeted/P12/production-serving PASS다. 구현 기록은 review §13을 따른다. 나머지 후보와 네 번째 게임은 미구현이며 P13B는 Railway 배포를 요구하지 않는다.

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

P2 checkpoint 기준선은 shared 59, web 91, server 447로 총 597 tests다. P3A checkpoint `a215eaa`는 이 tests를 삭제·skip하지 않고 신규 boundary 6개를 더해 shared 59, web 91, server 453으로 총 603 tests를 통과했다. P3B checkpoint `bc4a62a`는 기존 603개와 신규 command-routing 9개를 포함해 총 612 tests를 통과했다. P3C checkpoint `d21eaad`는 신규 server-action regression 16개를 더해 shared 59, web 91, server 478로 총 628 tests를 통과했다. P3D checkpoint `cedda1a`는 import-boundary regression 3개를 더해 shared 59, web 91, server 481로 총 631 tests를 통과했다. P4 checkpoint `60eb77e`는 새 case 수를 늘리지 않고 production A/B smoke의 behavioral assertions를 강화하며 이 631-test 기준선을 두 번 검증했다. P5A checkpoint `05cac94`는 shared contract 6개와 server mapper/wire-isolation 8개를 더해 shared 65, web 91, server 489로 총 645 tests를 기준선으로 만들었다. P5B checkpoint `e9211bc`는 negotiation/wire contract 4개, Web decode·routing·storage regression 14개, server negotiation·selector·mixed-version regression 14개를 더해 shared 69, web 105, server 503으로 총 677 tests를 통과했다. P5C는 additive create contract, requested-type resolution/atomicity, Web catalog/selection/retry와 mixed legacy/V2 create/join 회귀 8개를 더해 shared 69, web 108, server 508로 총 685 tests를 통과했다. P7B checkpoint `d9329d1`은 P7A domain과 server/shared integration 회귀를 포함해 shared 75, web 109, server 694, 총 878 tests다. P7C는 Web capability/catalog/Number renderer와 local draft·active-control·responsive 회귀 31개를 더해 shared 75, web 140, server 694, 총 909 tests를 기준선으로 만든다. P8 source/local gate는 raw two-game protocol, production-serving과 import/draft boundary 회귀 7개를 더해 shared 75, Web 142, server 699, 총 916 tests를 두 번 연속 통과했다. P9B는 approved primitive unit regression 14개를 추가해 shared 75, Web 151, server 704, 총 930 tests를 통과했다. P11A는 production-inert GEM pure-domain regression 76개를 추가해 shared 75, Web 151, server 780, 총 1006 tests를 기준선으로 만든다.

## 2. Phase 개요

문자 suffix가 붙은 항목도 각각 별도의 실행·검증 Phase다. P3, P5, P7, P9, P11은 묶음 이름일 뿐 한 번의 Codex 작업으로 실행하지 않는다.

| Phase | 이름 | 한 줄 목표 |
| --- | --- | --- |
| P0 | Current-state analysis and transition design | 현재 구조를 분류하고 production을 보존하는 target boundary와 migration 순서를 문서화한다. |
| P1 | Platform/game boundary preparation | wire와 behavior를 바꾸지 않고 결합 지점의 characterization 및 narrow seam 준비를 한다. |
| P2 | Immutable gameType and minimal registry | v1 create로 생성되는 Room을 `HANGUL_TILE`로 동일하게 동작시키는 내부 gameType과 single-entry identity registry를 도입한다. |
| P3A | Hangul state/projection/persistence seam | 한글 state의 clone·lifecycle·projection을 narrow module seam 뒤에 둔다. |
| P3B | Hangul start and command routing seam | 기존 start와 `turn:*`를 wire 변경 없이 Hangul module로 위임한다. |
| P3C | Hangul lifecycle server-action seam | leave/presence decision과 timeout/game-deadline dispatch를 좁은 Hangul server-action 경계로 분리한다. |
| P3D | Hangul physical module move | seam이 검증된 파일만 이동하고 import 방향을 정리한다. |
| P4 | Hangul production regression gate | 기능 추가 없이 기존 production vertical slice의 완전 회귀를 통과시킨다. |
| P5A | Versioned platform snapshot contract | authoritative gameType을 가진 v2/dual-version snapshot envelope를 정의한다. |
| P5B | Snapshot v2 negotiation and Web routing | connection별 V1/V2 협상, decoding, canonical gameType routing을 연결한다. |
| P5C | Game catalog and create selection | Home catalog와 HANGUL_TILE create 선택을 공개한다. |
| P6 | Number Tile rules gate | 구현 전 NUMBER_TILE 규칙·state·privacy·command를 `number-tile-rules-v1`로 확정한다. |
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
| P13 | Three-game post-release abstraction review | 실제 세 게임 source로 재분류하고 작은 extraction 후보만 제안한다. Runtime 변경 없음. |
| P13B | Approved post-release abstractions | COMPLETE — 별도로 승인된 P13-001/002/003만 구현·검증. 다른 후보 미구현. |

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

> 완료: 2026-09-05, checkpoint `a215eaa`. 별도 Legacy Hangul state adapter와 Legacy Hangul v1 projector를 실제 caller에 주입했고 identity-only registry와 concrete typed `RoomRecord.game`은 유지했다. Root typecheck, 603 tests, build, `git diff --check`, checkpoint commit과 일반 `origin/master` push를 통과했다.

#### 목표

한글 state의 clone, lifecycle inspection, player projection을 narrow module seam 뒤에 두고 platform persistence/projector가 concrete board·rack·result를 직접 해석하지 않게 한다.

#### Scope

- typed `GameState`의 clone·canonical validation과 phase/recovery에 필요한 좁은 `RUNNING | FINISHED` read model을 별도 Legacy Hangul state adapter가 소유
- in-memory persistence의 copy/rollback/Room phase 검증을 injected adapter에 위임하되 CAS, gameType immutability와 atomic commit은 그대로 유지
- outer projector를 Room identity·presence·revision·server-time shell과 Legacy Hangul v1 game projection으로 분리
- canonical `gameType`이 `HANGUL_TILE`이 아닌 persistence/projector 입력은 silent fallback 없이 fail-closed
- `RoomRecord.game: GameState | null`과 P2 identity-only `GameRegistry`를 유지하고 state envelope/registry capability는 추가하지 않음
- active turn/game deadline/finished retention reader는 adapter inspection만 소비하며 기존 port와 scheduler behavior를 유지; P3C는 callback routing만 분리했고 turn/deadline-shaped recovery port의 일반화는 실제 second-game/P9 review로 보류

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
- 기존 597 tests와 신규 boundary 6개를 포함한 총 603 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P3A만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 typed in-memory GameState의 clone/validation과 Room phase용 최소 lifecycle inspection을 별도 Legacy Hangul state adapter로 옮기며 outer snapshot projector를 Room shell과 Legacy Hangul v1 projection으로 분리하라. 실제 caller에 collaborator를 주입하고 unsupported gameType은 fallback 없이 거절하되 P2 identity registry를 capability registry로 확장하거나 RoomRecord.game을 envelope/unknown/JSON으로 바꾸지 마라. 기존 v1 snapshot wire schema, UoW/CAS/rollback, recovery behavior와 private rack projection을 그대로 보존하라. command routing, leave/presence/deadline action, directory 이동, 공통 lifecycle 확정, 새 게임은 건드리지 말고 전체 typecheck/test/build/diff-check와 checkpoint commit/push를 통과시켜라.
```

#### 남은 결합과 다음 stop gate

- P3C: leave/forfeit와 presence streak decision, timeout/game-deadline callback dispatch를 좁은 boundary로 분리한다. 구현 결과 recovery port는 그대로 두고 retention/cleanup은 platform 책임으로 유지했다.
- P3D: Hangul domain/shared source의 물리 directory와 import ownership. concrete `RoomRecord.game`의 장기 envelope/union 결정은 실제 second-game 요구 전에는 확정하지 않는다.

### 6.2 P3B — Hangul start and command routing seam

> 완료: 2026-09-05, checkpoint `bc4a62a`. 별도 immutable `LegacyHangulV1CommandRouter`가 canonical Room의 exact `HANGUL_TILE` capability로 기존 start/Submit/Draw/Pass service를 연결했다. 기존 603 tests와 신규 9 tests를 포함한 총 612 tests, root typecheck, build, production-serving regression, `git diff --check`, checkpoint commit과 일반 `origin/master` push를 통과했다.

#### 목표

기존 game start와 `turn:submit/draw/pass`를 public wire 변경 없이 canonical `RoomRecord.gameType` 기반 Legacy Hangul command 경계로 위임한다.

#### Scope

- `start`, `submit`, `draw`, `pass` 네 method와 exact `gameType`만 가진 frozen Legacy Hangul v1 capability를 별도 command router에 주입
- router가 `RoomRepository.findById`로 canonical Room을 읽고 stored `gameType === HANGUL_TILE`인 경우에만 exact 기존 service를 한 번 호출
- missing/incomplete capability는 constructor에서 fail-fast하고, bound method copy와 frozen router로 caller의 handler replacement를 차단
- missing Room은 기존 `ROOM_NOT_FOUND`, unsupported/corrupt gameType은 새 public code 없이 `INTERNAL_ERROR`로 fail-closed하며 delegate/mutation을 시작하지 않음
- Socket.IO transport는 기존 strict v1 validation, current binding과 authorization lease 조립, handler-entry `receivedAt` capture, ack/error mapping, snapshot fan-out과 advisory ordering을 유지
- 기존 `GameStartService`, `TurnSubmitService`, `TurnDrawService`, `TurnPassService`가 phase/revision, request ID/idempotency, Room lane/UoW/CAS, Hangul rule과 post-commit scheduling을 계속 소유
- P2 `GameRegistry`는 `{ gameType }` identity/availability lookup으로 유지하고 command capability를 추가하지 않음
- 기존 service input/result와 async Dictionary/RuleEngine, candidate atomic commit, P3A projector/privacy를 변경 없이 보존

#### 금지사항

- event rename 또는 generic unchecked `game:command`
- Room leave, reconnect policy, timeout scheduler 변경
- 한글 rule/inventory/score/UI 변경
- GameStartService의 initialization/readiness/idempotency/UoW 분해 또는 재작성
- transport나 router에서 phase/revision/idempotency/game rule 중복 검증
- GameRegistry를 giant capability registry로 확장
- file tree 대이동과 NUMBER_TILE 구현

#### Definition of Done

- platform transport runtime은 네 concrete command service field 대신 하나의 Legacy Hangul v1 command router를 호출한다.
- transport는 기존 v1 payload를 validate/map하되 Hangul Board/bag/pass/result rule은 판단하지 않는다.
- router는 canonical Room gameType으로 exact frozen capability를 선택하며 client/event/URL에서 game type을 추론하지 않는다.
- missing capability는 startup/construction에서 실패하고 unsupported/corrupt type은 service 호출과 canonical mutation 전에 실패한다.
- Submit/Draw/Pass의 `receivedAt`은 transport에서 한 번 capture한 exact 값으로 router와 service까지 전달된다.
- 기존 start와 Submit/Draw/Pass ack, error, revision, idempotency 동작이 같다.
- 실패 command는 Room/game/storage revision과 idempotency state를 그대로 유지하고 advisory를 만들지 않는다.
- snapshot fan-out 및 `turn:started`/`game:finished` ordering은 기존 transport/P3A projection 경로에 남는다.
- P2 identity registry와 P3A state/projector seam은 변경 없이 유지된다.

#### Required tests

- router의 start/submit/draw/pass exact single delegation, input/result identity와 `receivedAt` 보존
- wrong canonical gameType과 missing Room의 zero-delegate fail-closed 및 canonical state 불변
- missing/incomplete capability fail-fast와 copied/frozen capability isolation
- Socket.IO AST routing characterization을 direct service path에서 router path로 갱신하고 기존 platform mapping과 receivedAt capture를 계속 고정
- 기존 start authorization/readiness/idempotency 및 submit/draw/pass success·failure·replay·stale revision
- async dictionary rejection, atomic rollback, revision과 player-private snapshot
- existing Socket.IO v1 integration, production serving, P1 wire, P2 registry, P3A state/projector 회귀
- 기존 603 tests와 신규 9 tests, 전체 typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P3B만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 별도 immutable LegacyHangulV1CommandRouter가 canonical Room.gameType의 exact HANGUL_TILE capability로 기존 GameStartService와 TurnSubmit/Draw/PassService를 한 번씩 호출하게 하라. P2 GameRegistry는 identity-only로 유지하고 missing/incomplete capability는 construction에서 fail-fast하며 unknown type은 delegate와 mutation 전에 fail-closed하라. transport의 strict v1 validation, current binding/auth lease, handler-entry receivedAt, ack/error, snapshot fan-out과 advisory ordering을 보존하고 기존 services의 phase/revision/idempotency/Room lane/UoW/rule/scheduling 책임을 재작성하거나 중복하지 마라. leave/presence/timeout/deadline, directory 이동, generic game:command와 새 게임은 제외하고 전체 typecheck/test/build/diff-check 및 checkpoint commit/push를 통과시켜라.
```

#### 남은 결합과 다음 stop gate

- P3C: `RoomLeaveService`/`RoomPresencePolicyService`의 Hangul player-lifecycle decision, timeout/deadline callback의 concrete service dispatch와 transport의 leave active-turn advisory peek를 좁은 compatibility boundary로 분리한다. recovery reader와 retention mechanism 자체는 일반화하지 않는다.
- P3D: Hangul domain/shared source의 물리 directory 및 import ownership

### 6.3 P3C — Hangul lifecycle server-action seam

> 완료: 2026-09-06, checkpoint `d21eaad`. P3B checkpoint `bc4a62a` 위에서 frozen player-lifecycle action과 immutable scheduled server-action router를 연결했고 root typecheck, 628 tests, build, production-serving regression, `git diff --check`, checkpoint commit과 일반 `origin/master` push를 통과했다.

#### 목표

Room leave, presence 복구, timeout/game deadline 같은 platform-originated 사건의 한글 규칙 부분을 optional module server action 경계로 분리한다.

#### Scope

- frozen `LegacyHangulPlayerLifecycleActionRouting`의 `applyPlayingLeave`가 PLAYING forfeit/stalemate/next-turn/result candidate와 advisory만 만들고, `RoomLeaveService`가 authorization/idempotency/session mutation/UoW와 post-commit effect를 계속 소유
- 같은 lifecycle action의 `planPresenceRestored`가 offline timeout streak reset plan만 만들고, `RoomPresencePolicyService`가 session/presence lease, Room lane, storage commit, Lobby grace와 retention을 계속 소유
- immutable `LegacyHangulServerActionRouter`가 `handleTurnTimeout`/`handleGameDeadline`만 제공하고 callback마다 canonical `RoomRecord.gameType`을 exact `HANGUL_TILE` capability와 대조한 뒤 기존 service에 scheduled identity를 그대로 전달
- missing/incomplete scheduled capability는 construction에서 fail-fast하고, missing Room은 기존 no-op, unsupported/corrupt type 또는 lookup failure는 delegate/UoW 전에 internal failure
- 기존 timeout/deadline service가 Room lane/UoW, stale instance/revision/deadline, at-least-once idempotency, penalty/forfeit/TIME_LIMIT/result와 post-commit scheduling을 계속 소유
- composition runtime은 concrete timeout/deadline service 대신 scheduled router와 applied-event subscription facade를 transport에 노출하고, leave handler는 committed `gameAdvisory`를 사용
- P2 `GameRegistry`는 `{ gameType }` identity/availability lookup으로 유지하고 lifecycle/scheduled capability를 registration에 추가하지 않음
- Turn/Game scheduler와 overdue sweeper/recovery reader, `RoomPolicyScheduler`, Lobby grace, PLAYING all-offline 및 fixed FINISHED retention/cleanup mechanism은 변경하지 않음

#### 금지사항

- 모든 module에 timer/turn/presence hook 강제
- generic scheduled-action mechanism 구현
- timeout/forfeit/result 규칙 변경
- public event/UI 변경, 물리 directory 이동, 새 game 구현

#### Definition of Done

- platform leave/presence code가 Hangul offline streak, stalemate, next turn과 result를 직접 계산하지 않는다.
- leave/session/game 전이는 별도 partial commit 없이 동일 Room UoW에서 함께 성공하거나 함께 rollback된다.
- unsupported/corrupt canonical gameType이면 lifecycle delegate와 UoW 전에 fail-closed하여 player/session만 먼저 삭제되는 partial state가 없다.
- scheduler/sweeper callback은 canonical gameType을 확인하는 immutable router를 거치며 missing/incomplete capability는 construction에서 실패한다.
- no-op/stale callback과 concurrent command가 기존 serialization·revision 규칙을 지킨다.
- timer가 없는 future module을 막는 필수 interface가 없다.
- resume streak reset은 storage-only mutation이며 다음 offline timeout을 다시 첫 streak로 처리한다.
- scheduler/recovery algorithm과 Room cleanup/retention behavior가 같다.
- `GameRegistry`는 identity-only이며 generic scheduler/result나 giant `GameModule`이 없다.

#### Required tests

- leave/forfeit/Host succession과 session cleanup
- lifecycle action의 current/non-current/already-forfeited/terminal leave, presence reset과 wrong gameType 거절
- corrupt PLAYING gameType에서 leave/presence delegate와 UoW zero-call 및 canonical Room/session/revision 불변
- disconnect grace/resume/offline streak; streak 1 resume 후 다음 routed real timeout이 다시 streak 1·미forfeit인지 확인
- scheduled router의 exact input/result delegation, missing Room no-op, unsupported type/lookup failure fail-closed, missing capability fail-fast와 immutable handler copy
- submit/draw/timeout/deadline/leave races와 duplicate/stale callbacks
- finish/retention/recovery/idempotency cleanup
- Socket.IO/runtime router·subscription facade와 기존 snapshot/advisory ordering characterization
- P3B checkpoint의 612 tests, P1 wire/P2 registry/P3A privacy/P3B command routing, production-serving regression, root typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P3C만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 running room:leave, presence restore, turn timeout, game deadline에서 platform-owned Room/session/scheduler 처리와 HANGUL_TILE의 forfeit/offline streak/stalemate/next-turn/result 규칙을 optional server-action adapter로 분리하라. leave의 platform record와 game state를 하나의 candidate로 조립해 동일 Room UoW/CAS에서 함께 commit 또는 rollback하고 module capability 부재/reject 시 partial session/player 삭제를 금지하라. 기존 scheduler/wire를 유지하며 callback마다 canonical gameType/instance/scoped revision/deadline을 Room lane에서 재검증하고 generic scheduler·필수 timer hook·규칙/UI 변경·directory 이동·새 게임 없이 전체 typecheck/test/build/diff-check를 통과시켜라.
```

#### 구현 결과와 남은 stop gate

- 구현된 boundary는 `LegacyHangulPlayerLifecycleActionRouting`과 `LegacyHangulServerActionRouter` 두 개다. P3B command router나 P2 identity registry를 giant facade로 확장하지 않았다.
- retention은 Room lifecycle 정책으로 남는다. FINISHED는 canonical `finishedAt + 30m`, PLAYING all-offline은 presence lease/version 기반 30분 window를 유지하며 Hangul action은 Room delete나 timer 등록을 소유하지 않는다.
- recovery reader와 overdue sweeper의 Turn/Game deadline-shaped metadata 및 process-memory 범위는 바뀌지 않았다. P3C는 callback dispatch만 분리했고 restart recovery나 generic scheduled descriptor는 추가하지 않았다.
- P3D: 검증된 Hangul source의 물리 경로와 platform import ownership만 정리한다. typed `RoomRecord.game`, recovery port와 public v1 contract의 범용화는 하지 않는다.
- P4: P3D 뒤 기능 추가 없이 P3C의 628-test checkpoint와 P3D import-boundary regression, production-like serving 및 full Hangul lifecycle을 다시 검증한다.

### 6.4 P3D — Hangul physical module move

> 완료: 2026-09-06, checkpoint `cedda1a`. P3C checkpoint `d21eaad`와 628-test 기준선 위에서 verified Hangul server domain/dictionary/P3A~P3C seam과 shared Hangul command/projection internals를 `games/hangul-tile` namespace로 이동했다. 신규 boundary regression을 포함한 root quality gate, 총 631 tests, clean build-output 검사, checkpoint commit과 일반 `origin/master` push를 통과했다. **P3D COMPLETE / P4 READY**.

#### 목표

P3A~P3C에서 경계가 검증된 한글 파일만 `games/hangul-tile` 소유로 이동하고 platform import 방향을 정리한다.

#### Scope

- server의 verified `domain/game`, `domain/hangul`, Dictionary contract/provider와 P3A~P3C Legacy seam을 `apps/server/src/games/hangul-tile/` 아래로 이동
- shared ProposedBoard/Draw bag contract와 Hangul v1 game projection validator를 `packages/shared/src/games/hangul-tile/` 아래로 이동
- shared root barrel과 v1 compatibility export 유지
- mixed application service와 persistence/projector는 현재 검증된 direct consumer로 명시하고 새 consumer를 boundary test로 차단
- composition root가 concrete module registration/capability를 명시적으로 조립하고 GameRegistry는 platform 위치 유지
- path-sensitive tests의 import/read path만 수정
- architecture dependency inventory 갱신

#### 금지사항

- behavior/refactor/rename을 파일 이동과 함께 수행
- global CSS 재구성
- package rename 또는 dependency/export surface의 불필요한 breaking change
- NUMBER_TILE/GEM_CARD 폴더를 빈 placeholder로 생성

#### Definition of Done

- Hangul domain이 platform application/transport/persistence/infrastructure를 역참조하지 않는다.
- module 밖 concrete import는 P3D에서 확인한 mixed application/persistence/projector/composition allowlist를 넘지 않는다.
- old production implementation path와 duplicate/stale implementation이 남지 않는다.
- 기존 root consumer가 compatibility export를 통해 계속 compile한다.
- test 개수와 assertion이 감소하지 않고 observable behavior가 같다.

#### Required tests

- import/dependency boundary check
- shared legacy root exports compile test
- path-sensitive web release UI test의 동일 assertion
- 기존 전체 domain/application/transport/web tests
- typecheck/build/diff-check

#### 구현 결과와 다음 stop gate

- server canonical namespace는 `games/hangul-tile/{domain,compatibility,infrastructure}`다. old `domain/game`과 `domain/hangul`에는 package test glob을 유지하기 위한 test file만 남고 server-internal shim은 없다.
- `DictionaryProvider` 선언만 mixed `ports/system.ts`에서 module domain으로 분리했다. ID/random과 Turn/Game scheduler port는 이동하지 않았다.
- mixed start/submit/draw/pass/timeout/deadline/finish/turn service는 Room lane, auth, idempotency, UoW, scheduling과 Hangul decision이 함께 있어 기존 application 위치를 유지한다.
- shared root `protocol.ts`와 `projections.ts`는 flat v1 composition과 같은 public symbol re-export를 유지한다. `realtime.ts`, `validation.ts`, `index.ts`, package exports와 모든 server/web root import는 바뀌지 않았다.
- import-boundary test는 old canonical path, domain 역방향 dependency와 allowlist 밖 direct consumer를 거절한다. clean temporary outDir build도 old duplicate JavaScript가 없음을 검증한다.
- P4는 새 architecture나 game을 추가하지 않고 extracted Hangul vertical slice 전체를 production-like 환경에서 다시 검증한다.
- exact 이동 inventory와 남은 coupling은 [MULTI_GAME_P3D_MODULE_EXTRACTION.md](./MULTI_GAME_P3D_MODULE_EXTRACTION.md)에 기록한다.

#### Codex 실행 명령

```text
Multi-game Platform P3D만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 P3A~P3C에서 검증된 server Hangul 파일은 apps/server/src/games/hangul-tile/, shared contract는 packages/shared/src/games/hangul-tile/ 아래로만 작은 단위로 이동해 import를 조정하라. 동작, type 이름, rule, event, snapshot, UI, CSS는 바꾸지 말며 shared root/v1 compatibility export를 유지하라. platform의 concrete Hangul import를 boundary check로 금지하고 path-sensitive test는 assertion을 유지한 채 경로만 갱신하라. 빈 future game 폴더를 만들지 말고 전체 typecheck/test/build/diff-check를 통과시켜라.
```

## 7. P4 — Hangul production regression gate

> 검증 완료(조건부): 2026-09-06. `hangul-game-v1` 및 P1 contract를 기준으로 631-test vertical slice, 실제 production dist A/B smoke, public Railway behavior와 module/security boundary를 재검증했다. **P4 COMPLETE / P5A READY** 표기는 최종 root gate 2회, checkpoint commit/일반 push와 post-push public smoke가 모두 성공한 경우에만 유효하다. 상세 evidence는 [MULTI_GAME_P4_REGRESSION_GATE.md](./MULTI_GAME_P4_REGRESSION_GATE.md)에 있다.

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

> 완료: 2026-09-06. 기존 `StateSnapshot` v1과 production realtime/Web path를 그대로 둔 채 strict `PlatformSnapshotV2`와 pure transitional v1→v2 mapper를 추가했다. `snapshotVersion: 2`는 `protocolVersion = 1`과 분리되고 실제 projection은 `HANGUL_TILE` 하나만 지원한다. 총 645 tests와 root quality/serving/wire-isolation gate를 통과한 checkpoint를 전제로 **P5A COMPLETE / P5B READY**다.

#### 목표

authoritative Room gameType과 game-specific projection을 표현하는 versioned shared/server contract를 추가한다.

#### Scope

- `snapshotVersion: 2`를 가진 strict `PlatformSnapshotV2Schema`; 기존 realtime `protocolVersion = 1`과 의미 분리
- P5B 이전에는 V2 path를 additive/latent로만 제공하고 current web의 emitted snapshot은 v1 유지
- Room identity/phase/player identity·presence와 canonical `gameType`을 가진 platform shell
- `gameRevision`, Hangul Board/bag/turn/result, player progress/private rack을 가진 `HANGUL_TILE` projection
- LOBBY/null, PLAYING/active, FINISHED/terminal phase coherence와 Room/projection discriminator 일치 검증
- validated/privacy-safe current v1 projection을 재배치하는 pure transitional mapper
- source-level wire isolation으로 mapper의 production consumer가 없고 Web이 v1만 쓰는 상태 고정

#### 금지사항

- Home catalog 또는 web renderer 전환
- strict v1 schema에 field를 몰래 추가
- NUMBER_TILE/GEM_CARD dummy projection
- 기존 `turn:*` event rename

#### Definition of Done

- V2 schema와 runtime validation이 명시적이며 V1/V2는 서로의 schema로 parse되지 않는다.
- v1 client/old tab은 변경 없는 production path를 사용하고 P5A rollback은 latent V2 파일만 제거하면 된다.
- P5A 단독 배포 시 current Web이 받는 default protocol/wire가 v1이며 global protocol switch가 일어나지 않는다.
- A/B 및 FINISHED private Hangul projection invariant와 v1→v2 semantic parity가 유지된다.
- invalid phase/type/player/private state와 Room/projection discriminator mismatch가 fail-closed한다.
- negotiation, Web decoder/routing과 incompatible UX는 P5B 전에는 존재하지 않는다.

#### Required tests

- current Web에 대한 v1 default-wire compatibility와 latent V2 mapper production 미연결
- V2 LOBBY/PLAYING/FINISHED, strict version/phase/type/player/private-state negative cases
- platform player identity와 Hangul player progress/private rack separation
- A/B privacy와 v1→v2 semantic parity, no secret/credential in output
- production-serving과 기존 전체 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P5A만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P4 회귀 기준을 지키고, authoritative Room gameType을 담는 versioned PlatformSnapshot + game-specific projection envelope와 runtime validator를 shared/server에 추가하라. v1 strict contract에는 field를 몰래 추가하지 말고 v2는 additive/latent 또는 명시적 negotiation으로 제공해 P5A 단독 배포 시 current web에 나가는 default wire를 v1로 유지하라. HANGUL_TILE projection만 실제 조합하고 호환/rollback을 test로 고정하며 catalog, web route 전환, future dummy projection, global protocol switch, event rename 없이 전체 typecheck/test/build/diff-check를 통과시켜라.
```

### 8.2 P5B — Snapshot v2 negotiation and Web routing

> 완료: 2026-09-06. Socket handshake의 optional capability로 snapshot 표현을 connection별 협상하고, capability가 없는 legacy client에는 exact V1을 유지한다. Current Web은 `[2, 1]`을 광고하고 V2 canonical `gameType`을 먼저 확인한 뒤 현재 Hangul UI로 적응한다. Shared 69, Web 105, server 503으로 총 677 tests와 root typecheck/build/serving gate를 통과했으며 **P5B COMPLETE / P5C READY**다.

#### 목표

web이 authoritative snapshot의 gameType으로 정확한 decoder/renderer를 고르고 session/retry 상태를 안전하게 migration한다.

#### Scope

- V1 legacy rule과 exact `HANGUL_TILE` V2 route를 가진 작은 decoder/renderer decision boundary
- phase + gameType 기반 App route와 unsupported/incompatible screen
- `use-lobby-app`의 platform controller와 Hangul game controller 경계
- realtime outer snapshot decode 후 exact game decoder 위임
- handshake `[2, 1]` opt-in, server highest-common selection과 old no-capability client의 V1 유지
- socket별 V1/V2 delivery와 같은 Room의 mixed-version fan-out
- browser credential/storage shape 무변경 및 capability 비영속화
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
- 기존 storage session은 shape 변경 없이 그대로 사용되고 negotiation은 reconnect마다 다시 수행된다.
- 새 web이 v2를 명시적으로 선택한 뒤에만 v2 snapshot을 받고, old v1 client의 기존 path는 유지된다.

#### Required tests

- Hangul dispatch, mismatch/unknown type fail-closed
- non-Hangul-shaped PLAYING이 Lobby로 fallback하지 않음
- invitation/local selection 무시와 snapshot authority
- storage 비영속화, resume, pending command cleanup/retry
- v2 opt-in/negotiation과 old v1 default response 병행
- same Room mixed V1/V2 semantic/revision/privacy parity와 state sync
- 기존 web/server/shared 전체 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P5B만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P5A contract를 기준으로 HANGUL_TILE 하나만 등록한 web registry, authoritative phase+gameType route, unsupported/incompatible fail-closed 화면, realtime decoder, session-storage migration을 구현하라. P5B에서 새 client의 명시적 v2 opt-in/negotiation을 구현하고 old v1 client의 default response를 유지하며 무계획 global switch를 금지하라. /room/{ROOM_CODE}, current Hangul DOM/TurnDraft, 동일-ID retry·revision ordering을 보존하고 URL·cache를 권위로 쓰지 말며 Home catalog와 새 game UI 없이 전체 typecheck/test/build/diff-check를 통과시켜라.
```

### 8.3 P5C — Game catalog and create selection

> 완료: 2026-09-06. Web-owned static catalog에 실제 지원되는 `HANGUL_TILE` 한 항목만 공개하고, 같은 `room:create`/`protocolVersion = 1` payload에 optional `gameType`을 additive하게 연결했다. Legacy omission, canonical Room authority, V1/V2 negotiation과 invitation URL은 유지했으며 **P5C COMPLETE / P6 READY**다.

#### 목표

Home에 game catalog와 explicit create selection을 추가하되 실제 지원되는 `HANGUL_TILE` 한 항목만 공개한다.

#### Scope

- UI copy와 최소 product metadata를 소유하는 static Web catalog
- catalog의 유일한 `HANGUL_TILE` item과 semantic/keyboard-accessible 선택 → 방 만들기 흐름
- 기존 `room:create` payload의 optional `gameType`; omitted legacy input은 compatibility default, current Web은 explicit `HANGUL_TILE`
- resolved effective type의 strict validation, identity-only `GameRegistry` 확인과 canonical `RoomRecord.gameType` 저장
- normalized nickname과 effective gameType을 포함하는 create idempotency fingerprint
- pending create의 동일 requestId/effective type retry; selection preference와 bound credential은 비영속
- invitation direct entry의 generic join UI와 create ack/server snapshot 기반 renderer/type 확인
- V1/V2 mixed client create/join/start/Draw/resume 및 production-serving 회귀

#### 금지사항

- `NUMBER_TILE`, `GEM_CARD`, `UNKNOWN` catalog/schema/registry placeholder와 disabled/준비 중 card
- server catalog DTO, `/games`, `game:catalog` 또는 catalog snapshot endpoint
- `room:create:v2`, global `protocolVersion` 증가 또는 create ack 확장
- client catalog metadata를 start/player-count 권위로 사용
- invitation URL에 gameType/session credential 추가
- join/turn command에 gameType 추가
- existing storage key 변경, dependency 추가와 registry metadata 확장

#### Definition of Done

- 선택 → create → common Lobby → Hangul renderer 흐름이 동작한다.
- `/room/{ROOM_CODE}`는 그대로이며 invitation join은 선택을 요구하지 않는다.
- new Web은 explicit `HANGUL_TILE`, legacy client는 omitted payload로 같은 canonical Room type을 만든다.
- create retry는 동일 effective gameType/requestId를 보존하고 canonical ack snapshot과 불일치는 거부한다.
- invalid/unsupported type과 missing registration은 Room/Player/session/idempotency mutation 전에 fail-closed한다.
- V1 snapshot에는 gameType/version field가 추가되지 않고 V2는 canonical `room.gameType`을 전달한다.
- Home selection은 native semantics, selected state, focus-visible, 48px touch target과 390/320px layout을 만족한다.
- 미구현 game은 source/catalog에 존재하지 않고 GameRegistry는 identity-only다.

#### Required tests

- shared optional-create matrix: omitted/explicit Hangul success, unsupported/malformed/extra reject, event/version 및 V1 snapshot 불변
- server requested-type resolver, exact registry lookup, canonical persistence, effective fingerprint replay/conflict와 invalid atomicity
- Web one-item catalog, selected-state/accessibility/responsive, explicit pending create retry와 omitted legacy pending-create read
- `room:join`/invitation URL/local selection 비권위와 V2 canonical renderer routing
- V2 explicit create + V1 join, V1 omitted create + V2 join, start/Draw/resume와 per-viewer privacy
- production-serving, 기존 전체 tests, typecheck/build/diff-check와 source/wire audit

#### Codex 실행 명령

```text
Multi-game Platform P5C만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P5A/P5B를 전제로 Web-owned static game catalog, explicit create gameType, pending-create 동일 requestId/effective-type retry를 구현하라. Catalog에는 HANGUL_TILE 한 항목만 두고 NUMBER_TILE/GEM_CARD placeholder나 disabled card를 추가하지 마라. 기존 room:create와 protocolVersion 1을 유지한 optional payload field로 old omitted client를 지원하며, resolved type을 registry로 확인한 뒤 canonical Room에 원자적으로 저장하라. Join에는 gameType을 요구하지 말고 /room/{ROOM_CODE}와 generic invitation flow를 유지하며 Room 진입 뒤에는 server snapshot만 권위로 사용하라. accessibility·responsive·mixed V1/V2·production-serving·전체 typecheck/test/build/diff-check와 source audit를 통과시켜라.
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
- authoritative command DTO와 player projection direction
- `NT-001`~`NT-044` stable rules decision log
- 새 규칙은 `docs/NUMBER_TILE_GAME_RULES.md`에만 기록하고 기존 `docs/GAME_RULES.md`는 Hangul canonical 문서로 유지
- Namespaced event와 closed `game:command`를 비교해 protocol/version/compatibility 결정을 기록하고 사용자 승인으로 확정; 기존 Hangul v1 `turn:*` adapter 유지

### 금지사항

- 일반적인 숫자 타일 게임 관습을 근거 없이 확정
- 기존 Hangul RuleEngine/Board/TurnDraft 복사 후 이름만 변경
- 실제 implementation, UI, public enablement
- 상용 브랜드·official asset 사용 전제
- 기존 `docs/GAME_RULES.md`에 NUMBER_TILE 규칙 혼합(필요한 경우 링크만 허용)

### Definition of Done

- 구현에 필요한 모든 규칙이 confirmed되고 blocker가 없다.
- state/command/projection privacy와 conservation invariant가 예제로 검증된다.
- Hangul과 같아 보이는 개념도 독립 rule 근거와 ownership을 가진다.
- `NT-001`~`NT-044`와 consistency clarification이 canonical ruleset에 기록된다.
- NUMBER_TILE command routing/version/capability/advisory decision이 확정된다.

### Required tests

- 코드 변경이 없다면 기존 전체 tests와 docs link/diff-check
- 규칙 예시의 table-driven test plan
- inventory/conservation, legal group, Joker, initial meld, rearrangement, result edge-case test matrix

### Codex 실행 명령

```text
Multi-game Platform P6 NUMBER_TILE rules gate만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 구현 코드는 작성하지 말며, neutral naming 아래 inventory, unique tile identity, Joker, rack/board group, initial meld, rearrangement, draw/pass/turn/optional timer, disconnect/forfeit, finish/score/ranking, player count, command/projection privacy를 docs/NUMBER_TILE_GAME_RULES.md에 근거와 함께 기록하라. 확정 command set으로 namespaced event와 closed game:command를 비교해 protocol/version/compatibility decision 및 사용자 승인 gate를 기록하고 기존 Hangul v1 turn:* adapter 유지를 명시하라. 기존 docs/GAME_RULES.md에는 링크 외 NUMBER_TILE 규칙을 섞지 말고 미확정 항목은 blocker로 남겨 P7 test matrix와 전체 문서 검증 결과를 제출하라.
```

### P6 완료 기록 (2026-09-06)

- [NUMBER_TILE_GAME_RULES.md](./NUMBER_TILE_GAME_RULES.md)의 A안 전체와 blocker clarification A/A/A를 승인해 `NT-001`~`NT-044`를 `CONFIRMED`로 만들고 `number-tile-rules-v1`을 기록했다.
- [NUMBER_TILE_PROTOCOL_GATE.md](./NUMBER_TILE_PROTOCOL_GATE.md)에 existing platform command reuse, strict protocol v1 `number:*`, atomic whole-table submit, V2-only projection/privacy, revision/idempotency, no Number advisory와 exact client game capability를 확정했다.
- current implementation을 조사한 결과 `RoomRecord.game`, in-memory state adapter, start/command/server-action paths, PlatformSnapshot V2와 Web decoder/renderer가 각각 Hangul compatibility에 결합되어 있어 registration 하나만 추가하는 rollout은 불가능함을 명시했다.
- `supportedSnapshotVersions`만으로는 Number-capable client를 판별할 수 없으므로 create/join/resume mutation 전 `selectedSnapshotVersion === 2`와 exact `supportedGameTypes`의 `NUMBER_TILE` 포함을 함께 요구하도록 확정했다.
- Number finish reason은 `RACK_EMPTY`, `STALEMATE`, `LAST_PLAYER_STANDING`이며 `ALL_PLAYERS_FORFEITED`와 `TIME_LIMIT`은 없다. P6 당시 Joker recovery는 stable meld identity 없이 exact replacement와 same-Submit final Table reuse로 결정했으나, 이 부분은 이후 actual-play Joker semantics correction으로 superseded됐다.
- STALEMATE는 eligible/non-forfeited full no-play cycle로 판정하고 forfeited result entries는 non-forfeited 뒤에서 별도 competition ranking하며 모두 `score = -penalty`를 사용한다.
- `NUMBER_TILE`은 `GameType`, registry, catalog, shared protocol/schema 또는 production에 추가하지 않았다. `docs/GAME_RULES.md`, runtime source와 dependency도 변경하지 않았다.
- 기존 P5C 685-test 기준선을 유지해야 하며 docs-only 작업이라 Number runtime test는 추가하지 않는다.

P6 consistency audit에 blocker가 없으므로 P6는 `COMPLETE`, P7A는 `READY`다. P7B는 P7A 완료 뒤, P7C는 P7B 완료 뒤 시작한다.

## 10. P7 — Number Tile implementation

P7은 domain, server/shared integration, web 구현을 각각 독립 stop gate로 나눈다. P7A~P7C 중 하나라도 미완료면 production catalog에서 `NUMBER_TILE`을 enable하지 않는다.

### 10.1 P7A — Number Tile domain implementation (`COMPLETE`)

#### 목표

P6에서 confirmed된 규칙만으로 framework-independent NUMBER_TILE state와 RuleEngine을 구현한다.

#### Scope

- 독립 inventory, unique tile instance, Table/Meld/rack state
- deterministic initial state와 legal-action/result 판정
- 주입된 ID/random/Clock과 확정된 90초 turn deadline rule
- Joker, initial meld, rearrangement, conservation invariant
- module-owned structured domain failure

#### 금지사항

- shared wire, server repository/transport, React UI 연결
- `number-tile-rules-v1`에 없는 규칙 추측·추가
- Hangul Board/RuleEngine type 변환 또는 GenericTile 추출
- system clock/random 직접 사용

#### Definition of Done

- P6 rule matrix가 UI/Socket 없이 deterministic하게 통과한다.
- candidate failure가 original state를 변경하지 않는다.
- Hangul domain import 없이 독립적으로 compile한다.
- 90초 turn deadline은 포함하고 overall game deadline capability는 만들지 않는다.

#### Required tests

- inventory uniqueness/conservation
- group/Joker/initial meld/rearrangement legal and illegal cases
- finish/score/ranking/tie cases
- deterministic ID/random/Clock 및 90초 deadline boundary
- 기존 Hangul 전체 tests, typecheck/build/diff-check

#### 완료 기록 (2026-09-06)

- `apps/server/src/games/number-tile/domain/`에 physical Tile/inventory, Table/Meld, Submit RuleEngine, draw, no-play/forfeit/finish, Number result와 initial GameState를 독립 구현했다.
- Injected ID/random/Clock으로 exact 106 inventory, 2~4명 rack 14장, revision 0, immutable shuffled turn order와 90초 Turn을 만들며 overall game deadline capability는 만들지 않았다.
- Initial meld 30, unchanged existing Table, normal split/merge/rearrangement, physical conservation, rack contribution과 당시 stable meld ID 없는 exact Joker recovery를 pure validation으로 고정했다. Exact-recovery behavior는 이후 correction으로 대체됐으며 이 문장은 P7A checkpoint의 historical record다.
- Number result reason은 `RACK_EMPTY`, `STALEMATE`, `LAST_PLAYER_STANDING`만 존재하며 single-winner result와 STALEMATE competition ranking을 별도 shape로 유지했다.
- Number-targeted 99 tests가 inventory/setup와 deterministic shuffle/exact 90초 deadline boundary, GROUP/RUN/Joker, initial/normal Submit, draw/pass/no-play/forfeit, timeout-action ordering, finish/result, runtime mutation safety와 static/dynamic import purity/inertness를 검증한다. 기존 685 tests와 함께 총 784 tests를 삭제·skip 없이 유지한다.
- Shared wire, `GameType`, Registry, catalog, PlatformSnapshot, Socket.IO, Web와 composition root는 변경하지 않았으므로 production은 계속 `HANGUL_TILE` only다.
- 상세 domain model과 P7B integration seam은 [NUMBER_TILE_DOMAIN_DESIGN.md](./NUMBER_TILE_DOMAIN_DESIGN.md)에 기록했다.

P7A는 `COMPLETE`, P7B는 `READY`다. P7B 완료 전에는 `NUMBER_TILE`을 runtime registration, Room create, projection 또는 public catalog에 연결하지 않는다.

#### Codex 실행 명령

```text
Multi-game Platform P7A만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 docs/NUMBER_TILE_GAME_RULES.md의 `number-tile-rules-v1`만 사용해 framework-independent NUMBER_TILE state, inventory, RuleEngine, result를 구현하라. Hangul Board/RuleEngine을 import하거나 GenericTile을 만들지 말고 ID/random/Clock을 주입해 90초 turn deadline을 구현하되 overall game deadline capability는 만들지 마라. shared wire, persistence, transport, web, catalog는 건드리지 말고 table-driven domain tests와 전체 typecheck/test/build/diff-check를 통과시켜라.
```

### 10.2 P7B — Number Tile server/shared integration (`COMPLETE`)

#### 목표

NUMBER_TILE의 닫힌 command/projection contract와 server application을 registry/persistence/realtime 경계에 연결한다.

#### Scope

- shared command, failure, player-specific projection runtime schemas
- 확정된 protocol v1 `number:submit`/`number:draw`/`number:pass`만 구현하고 기존 Hangul v1 `turn:*` compatibility adapter 유지
- module state codec/lifecycle/projector registration
- server auth, canonical gameType, scoped revision, idempotency, Room serialization
- candidate validation 후 atomic commit과 private projection
- 90초 Turn timeout server action/recovery; overall Game deadline capability 없음
- production identity Registry와 server create path에 Number를 연결하되 current Web catalog/capability는 `HANGUL_TILE` only로 유지

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
- `number-tile-rules-v1`의 routing/version/capability/advisory 결정을 임의로 바꾸지 않는다.

#### Required tests

- command/runtime-schema positive and negative cases
- atomicity, idempotency, same-Room concurrency
- codec/clone/lifecycle과 gameType mismatch; Turn timeout recovery 및 Game deadline capability 부재
- player projection secrecy
- Turn scheduler stale/duplicate/deadline race cases
- 기존 Hangul/NUMBER domain 전체 tests, typecheck/build/diff-check

#### 완료 기록 (2026-09-06)

- Shared `GameType`과 identity-only Registry는 exact `HANGUL_TILE | NUMBER_TILE` 두 값/registration만 지원한다. `GEM_CARD`와 future placeholder는 없다.
- Canonical Room은 gameType과 concrete state가 상관된 exact Hangul/Number union이고, in-memory persistence는 각 module의 clone/validation/lifecycle adapter를 사용한다. Game type mutation과 cross-game state mismatch는 atomic fail-closed다.
- Independent `supportedGameTypes` handshake capability를 추가했다. Omission은 Hangul-only이며 Number create/join/resume은 advertised Number와 selected snapshot V2를 membership/session/presence mutation 전에 모두 요구한다.
- Existing `game:start`는 canonical Room type으로 Hangul/Number start path를 정확히 하나 선택한다. Protocol v1 strict `number:submit`/`number:draw`/`number:pass`는 Room lane, current actor, receivedAt, revision, request ID/idempotency와 UoW 원칙을 따른다.
- Number start는 2~4명 rack 14장과 pool 78/64/50장, revision 0, shuffled immutable order와 90초 Turn을 만든다. Number overall game deadline은 없다.
- Number timeout, offline streak/resume reset, explicit leave/forfeit와 terminal result를 Number-owned service/action으로 연결하고 common Turn scheduler/recovery 및 platform retention을 재사용했다.
- `PlatformSnapshotV2`는 Hangul/Number 각각의 LOBBY/PLAYING/FINISHED strict branch를 지원한다. Number pool은 count만, 상대 rack은 count만 공개하고 FINISHED privacy도 유지하며 V1/down-conversion과 Number advisory는 없다.
- Current Web source는 Number capability, catalog item, decoder/renderer/editor를 추가하지 않았다. Number Web gameplay는 P7C로 남긴다.
- P7A 기준 784 tests를 유지하고 P7B 신규 94 tests를 더해 shared 75, web 109, server 694, 총 878 tests를 통과했다. Production-serving 5/5와 실제 build의 local raw A/B Number create/join/start/Draw/privacy/resume smoke도 통과했다.
- 상세 architecture와 contract는 [NUMBER_TILE_SERVER_INTEGRATION.md](./NUMBER_TILE_SERVER_INTEGRATION.md)에 기록했다.

P7B checkpoint에서 server prerequisite는 `COMPLETE`였고 당시 P7C는 `READY`였다. 이후 P7C가 Web bundle의 exact two-game catalog와 renderer를 완료했으며 public deployment는 P8 전 사용자 배포 확인 대상이다.

#### Codex 실행 명령

```text
Multi-game Platform P7B만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P7A를 기준으로 NUMBER_TILE의 닫힌 shared command/failure/projection schema, state codec/lifecycle/projector, server application을 canonical registry와 Room UoW에 연결하라. `number-tile-rules-v1`의 protocol v1 `number:*`, V2-only projection, selected snapshot V2 + exact supportedGameTypes admission과 no-advisory 결정을 그대로 구현하고 기존 Hangul v1 turn:* adapter를 유지하며 unchecked envelope를 금지하라. actor/scoped revision/idempotency/serialization/privacy/atomic commit과 90초 Turn timeout scheduling/recovery를 지키되 overall Game deadline capability는 만들지 말고 React와 production enablement 없이 전체 typecheck/test/build/diff-check를 통과시켜라.
```

### 10.3 P7C — Number Tile web implementation (`COMPLETE`)

#### 목표

authoritative NUMBER_TILE projection만 소비하는 독립 web renderer와 local draft interaction을 구현한다.

#### Scope

- web registry의 NUMBER_TILE decoder/renderer 등록
- game-specific board/rack/Joker editor와 result UI
- local draft와 authoritative revision reconciliation
- reconnect/resume/same-ID retry 및 pending command cleanup
- keyboard/touch/responsive/accessibility behavior
- Home catalog의 실제 `NUMBER_TILE` create와 canonical V2 route

#### 금지사항

- client에서 legal move, score, canonical inventory 확정
- Hangul TurnDraft/editor를 type-cast하여 재사용
- shared/server rule 변경
- P7C checkpoint에서 Railway 직접 deploy

#### Definition of Done

- server projection과 ack만 authoritative state를 변경한다.
- reconnect/stale snapshot/game instance change가 local draft를 안전하게 reconcile한다.
- Hangul renderer와 style/route behavior가 회귀하지 않는다.
- source bundle catalog에는 exact Hangul/Number 두 game만 있고 public deployment는 사용자 작업 전까지 pending이다.

#### Required tests

- projection decoder/renderer routing
- local draft serialization과 authoritative reset
- reconnect/retry/stale revision/error UX
- accessibility/responsive/release UI checks
- 기존 Hangul 및 전체 tests, typecheck/build/diff-check

#### P7C 완료 결과

- Current Web handshake는 snapshot `[2,1]`과 game `[HANGUL_TILE, NUMBER_TILE]` capability를 exact하게 광고한다.
- Home은 구현된 두 game을 같은 hierarchy로 제공하며 `GEM_CARD` placeholder가 없다. Create만 selected game을 보내고 join/URL/renderer authority는 바뀌지 않았다.
- Number V2 LOBBY/PLAYING/FINISHED를 direct strict branch로 decode하며 Number를 Hangul V1 shape로 변환하지 않는다.
- `apps/web/src/features/number-tile/`의 독립 TurnDraft/editor는 GROUP/RUN, physical `tileId`, initial lock, rearrangement, rack return, Undo/Reset과 최대 50 history를 소유한다. 당시 Joker assignment state는 이후 meld-derived role로 제거됐다.
- Exact `number:submit/draw/pass` client와 same-ID retry, stale/reset/sync, reconnect draft lifecycle을 연결했다. Number advisory와 `number:start`는 없다.
- PLAYING/FINISHED privacy, 90초 display countdown, keyboard/touch controls와 390/320 responsive behavior를 검증한다.
- Server/shared/domain rules와 dependency는 변경하지 않았고 자세한 구조는 [NUMBER_TILE_WEB_IMPLEMENTATION.md](./NUMBER_TILE_WEB_IMPLEMENTATION.md)에 기록했다.

P7C는 `COMPLETE`, P8은 `READY`다. P7C checkpoint는 Railway를 배포하지 않으므로 public two-game verification은 사용자 수동 배포 뒤 수행한다.

#### Codex 실행 명령

```text
Multi-game Platform P7C만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P7B projection/command를 사용해 독립 NUMBER_TILE web decoder, renderer, local draft/editor, result UI를 구현하라. server snapshot/ack만 authority로 삼고 Hangul TurnDraft를 type-cast해 재사용하지 말며 reconnect, same-ID retry, stale revision, game instance change를 안전하게 reconcile하라. Home에는 실제 구현된 Hangul/Number 두 game만 제공하고 accessibility, local browser smoke와 전체 typecheck/test/build/diff-check를 통과시키되 Railway는 배포하지 마라.
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

### 2026-09-07 final gate 결과

- P7C의 909 tests를 보존하고 shared 75, Web 142, server 699, 총 916 tests를 통과했다.
- Deterministic raw protocol로 Number exact-29 reject, exact-30 GROUP/RUN commit과 당시 Joker exact replacement/same-Submit reuse를 확인했다. 이 Joker assertion은 historical P8 evidence이며 current final-state semantics regression으로 superseded됐다.
- 같은 runtime의 Hangul V1 Room과 Number V2 Room에서 양방향 wrong command, cross-shaped payload, parallel Draw/replay, privacy, 60초/90초 Turn recovery와 Hangul-only overall deadline을 확인했다.
- Fresh production server와 실제 browser A/B에서 두 card, 양 game create/join/start/Draw/resume, Number invalid-submit draft UX, privacy와 390×844/320×568 responsive gate를 확인했다.
- Production source, public wire, rule와 dependency 변경은 없다. 자세한 증거는 [MULTI_GAME_P8_TWO_GAME_E2E_GATE.md](./MULTI_GAME_P8_TWO_GAME_E2E_GATE.md)를 따른다.
- 사용자가 Railway Dashboard에서 `deafc39`가 master의 Active/Successful deployment이며 1 Replica라고 확인했다.
- 해당 public deployment에서 exact Web capability `[2,1]` + `[HANGUL_TILE, NUMBER_TILE]`, Home 두 card, Hangul/Number A/B create·join·start·Draw·resume, Legacy V1, Number V2/game type, viewer privacy, wrong-client/cross-game rejection, 390×844·320×568 responsive와 clean browser console을 검증했다.
- P8 최종 판정은 `COMPLETE / PUBLIC TWO-GAME VERIFIED`다. P9A analysis-only Phase도 완료됐고, 사용자가 `P9A-001`~`004`만 승인해 P9B implementation을 해당 범위로 제한했다.

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
- decision ID와 사용자 승인 상태를 가진 결과를 `docs/MULTI_GAME_P9A_ABSTRACTION_ANALYSIS.md`에 기록

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
- 각 decision ID가 `PROPOSED / USER_DECISION_REQUIRED`로 표시되고 Codex가 사용자 승인을 추정하지 않는다.

#### Required tests

- source 변경이 없으면 전체 two-game suite 재실행
- current registry/module conformance 및 dependency boundary 결과 수집
- optional scheduler/no-timer와 result/projection isolation 근거 확인
- docs link/terminology와 diff-check

#### Codex 실행 명령

```text
Multi-game Platform P9A 분석만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 HANGUL_TILE과 NUMBER_TILE의 실제 state/command/projection/persistence/scheduler 호출을 비교해 각 platform member를 유지·축소·module 환원·승격 후보로 분류하라. source/interface/public protocol은 수정하지 말고 Tile 없는 GEM_CARD thought experiment로 경계를 검증하라. decision ID, 근거, risk와 `PROPOSED / USER_DECISION_REQUIRED` 상태를 독립적인 P9B 변경안과 함께 docs/MULTI_GAME_P9A_ABSTRACTION_ANALYSIS.md에 기록하고 전체 two-game test와 문서 검증 결과를 제출하라.
```

#### 2026-09-07 analysis 결과

- Room/session/presence/capability admission, Room lane, UoW/CAS, idempotency, fan-out, retention/cleanup과 optional scheduler mechanism을 `PROVEN_PLATFORM_CORE`로 재검증했다.
- exact Room union과 identity-only Registry는 유지한다. Common adapter registry, start/command executor, ranking, renderer registry와 direct Hangul V2 migration은 `GEM_CARD` 또는 별도 gate까지 보류한다.
- Tile/Rack/Board/Table/Meld/Joker/TurnDraft/Result와 Draw/Pass/timeout semantics는 game-specific 또는 accidental similarity로 판정했다.
- giant `GameModule` 대신 narrow typed collaborators를 composition root에서 조립하는 방향을 유지한다.
- strict `EXTRACT_NOW`는 `P9A-001` GameRevision successor, `P9A-002` frozen Fisher–Yates, `P9A-003` Web single-flight, `P9A-004` gameplay supersession comparator 네 개뿐이다.
- 네 decision은 모두 사용자 `APPROVED` 후 P9B에서 `IMPLEMENTED`됐다. P9A는 `COMPLETE`이며 P9B 최종 판정은 full quality gate와 checkpoint/push 뒤 확정한다.

### 12.2 P9B — Approved abstraction adjustments

#### 목표

P9A에서 근거와 승인을 얻은 작은 contract adjustment만 순차 구현한다.

#### Scope

- unused 또는 한 game 편향 member 제거/optional화/module 환원
- 두 game에서 의미가 같은 orchestration만 platform으로 승격
- codec, projection, recovery, revision/result type의 승인된 최소 조정
- compatibility adapter와 관련 문서/test 동기화
- 한 변경 단위마다 full regression stop gate
- `docs/MULTI_GAME_P9A_ABSTRACTION_ANALYSIS.md`에서 사용자가 `APPROVED`로 확정한 decision ID만 입력으로 사용

#### 금지사항

- P9A에 없거나 승인되지 않은 refactor
- GenericTile/Rack/Board/Joker/turn timer 승격
- GEM_CARD 구현과 public protocol 변경
- 여러 독립 adjustment의 검증 없는 일괄 적용
- 승인된 decision ID가 없는데 임의로 구현 진행; 이 경우 P9B는 `BLOCKED`

#### Definition of Done

- 모든 변경이 두 game의 실제 사용 근거를 가진다.
- 승인된 local adjustment가 새 concrete cross-game import나 type erasure를 만들지 않는다.
- no-timer/non-Tile future module을 막는 필수 member가 없다.
- 두 game observable behavior와 wire compatibility가 유지된다.
- 완료 보고가 구현한 decision ID와 사용자 승인 근거를 열거한다.

#### Required tests

- 두 module conformance와 dependency boundary
- optional capability/no-timer cases
- result/projection/codec isolation
- complete Hangul/Number E2E after each adjustment
- typecheck/build/diff-check

#### 승인 및 implementation 결과

사용자는 `P9A-001`~`P9A-004`만 승인했다. 구현은 다음 네 small primitive에 한정한다.

- `apps/server/src/domain/game-revision.ts`: `nextGameRevision`
- `apps/server/src/domain/frozen-fisher-yates.ts`: `shuffleFrozen`
- `apps/web/src/lib/async-single-flight.ts`: `runAsyncSingleFlight`
- `apps/web/src/lib/gameplay-identity.ts`: `isSameGameplayIdentity`

Revision helper는 두 game의 canonical commit call site만 사용하고 다른 revision을 다루지 않는다. Shuffle은 기존 RNG call order/count와 frozen detached output을 보존하고 Number wrapper가 기존 invalid-index error를 번역한다. 네 Web wrapper는 동일 Promise single-flight 의미를 유지한다. Gameplay identity comparator는 Hangul/Number draft reconciliation에만 적용하며 pending-command ack supersession helper는 command model을 바꾸지 않도록 concrete로 남긴다.

Exact Room union, identity-only Registry, concrete services/domain/Result/TurnDraft와 `WAIT_FOR_GEM_CARD` 항목은 그대로다. 상세 implementation record는 [MULTI_GAME_P9B_SMALL_ABSTRACTIONS.md](./MULTI_GAME_P9B_SMALL_ABSTRACTIONS.md)를 따른다. Root typecheck, shared 75 + Web 151 + server 704 = 930 tests, build, production-serving 6/6과 diff-check를 통과했으므로 **P9B COMPLETE / P10 READY**다.

#### Codex 실행 명령

```text
Multi-game Platform P9B만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 docs/MULTI_GAME_P9A_ABSTRACTION_ANALYSIS.md에서 사용자가 APPROVED로 확정한 decision ID만 하나씩 구현하라. 승인된 ID가 없으면 추정하지 말고 BLOCKED로 보고하라. 두 game에서 의미가 같은 작은 primitive만 승격하고 GenericTile/Rack/turn timer, giant GameModule, GEM_CARD와 public protocol은 제외하라. 각 adjustment 뒤 두 게임 전체 회귀와 dependency/typecheck/test/build/diff-check를 통과시키고 구현 ID와 승인 근거를 보고하라.
```

## 13. P10 — Gem/Card rules and IP gate

### 목표

Tile/Rack과 다른 `GEM_CARD`의 rules, state, command, privacy, neutral naming/asset 경계를 구현 전에 확정한다.

### Final 상태 (2026-09-07)

- 사용자는 [GEM_CARD_GAME_RULES.md](./GEM_CARD_GAME_RULES.md)의 stable `GC-001`~`GC-038`에서 모든 A안을 승인하되 explicit PLAYING leave인 `GC-023`만 B로 확정했다.
- [GEM_CARD_CARDSET_V1.md](./GEM_CARD_CARDSET_V1.md)에 tier별 15장, production type별 tier당 3장을 갖는 original `gem-cardset-v1` 45장과 static balance audit을 기록했다.
- [GEM_CARD_PROTOCOL_GATE.md](./GEM_CARD_PROTOCOL_GATE.md)는 `game:start`, additive `gem:collect`/`purchase`/`reserve`/`yield`, V2-only capability/projection, revision/idempotency와 45초 scheduled turn을 confirmed conceptual contract로 고정했다.
- [GEM_CARD_IP_PRODUCT_GATE.md](./GEM_CARD_IP_PRODUCT_GATE.md)는 `NOT LEGAL ADVICE`, neutral naming, original/licensed asset, independent rule text/data와 public release checklist를 유지한다.
- Rules consistency와 IP/product development audit에는 blocker가 없어 **P10 COMPLETE / P11A READY**다. Public title/asset release review는 별도 gate다.
- Current runtime `GameType`, Registry, Room union, V2 schema, Socket events, Web capability/catalog에는 계속 `GEM_CARD`가 없다.

### Scope

- neutral public/internal naming과 rules version
- card market/deck, resource/token supply, purchase, reserve, score 구조
- public market/supply/player holdings/reserves와 private deck/order projection
- turn/action ordering, refill, limits, finish/tie rules
- player count, reconnect/leave/forfeit, 45초 turn timer와 no-overall-deadline 정책
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
- 45초 no-action timeout, offline third-timeout forfeit, YIELD/no-progress와 overall-deadline 부재

### Codex 실행 명령

```text
Multi-game Platform P10 GEM_CARD rules/IP gate만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙을 지키고 구현 없이 neutral naming 아래 card market/deck, resources/tokens, purchase, reserve, refill, limits, turn ordering, finish/tie, player count, reconnect/leave, timer와 public/private projection을 docs/GEM_CARD_GAME_RULES.md에 기록하라. 기존 docs/GAME_RULES.md에는 링크 외 GEM_CARD 규칙을 섞지 말고, 상용 브랜드·logo·official art 사용 가능성을 가정하지 않으며 original/licensed asset 경계와 별도 검토 항목을 남겨라. Tile/Rack/Board에 맞추지 말고 결정 전 규칙은 blocker로 표시해 P11 test matrix와 gate 판정을 제출하라.
```

## 14. P11 — Gem/Card implementation

P11은 domain, server/shared integration, web 구현을 각각 독립 stop gate로 수행한다. P10~P11C source gate를 완료했다. 사용자의 P11C 요청에 따라 source Web catalog/capability에는 세 게임을 노출하지만, public deployment/release 완료는 P12 gate 전까지 주장하지 않는다.

### 14.1 P11A — Gem/Card domain implementation

#### 목표

P10에서 confirmed된 카드·resource 규칙만으로 Tile/Rack 전제 없는 deterministic domain을 구현한다.

#### Scope

- original `gem-cardset-v1` typed seed, card deck/market, resource supply, player holdings/reserve state
- collect, purchase, reserve, refill, limit, YIELD/no-progress, fair-round/finish/ranking RuleEngine
- 주입된 ID/random/Clock과 confirmed 45초 turn deadline; overall game deadline 없음
- resource/card conservation, public holdings/reserves와 private deck-order invariant
- module-owned structured failures

#### 금지사항

- shared wire/server persistence/React UI 연결
- GenericTile/GenericRack/WordGroup adapter
- P10 confirmed 범위 밖의 규칙과 상용 asset/data
- client-computed score/resource 의존

#### Definition of Done

- P10 rule matrix가 framework 없이 deterministic하게 통과한다.
- failure가 state를 변경하지 않고 conservation invariant가 항상 유지된다.
- Hangul/Number game type을 import하지 않는다.
- 45초 turn/timeout semantics를 검증하며 overall game deadline capability는 없다.

#### 완료 상태

`apps/server/src/games/gem-card/domain/`에 exact resource/card/player/market/GameState와 `gem-cardset-v1`, collect/purchase/reserve, legal-action/YIELD/no-progress, explicit/offline forfeit, timeout, fair-round/market exhaustion, four-reason result를 구현했다. Setup은 P11B가 authority 있게 섞고 생성한 deck/order/ID/time을 받으며 domain 자체는 RNG, Clock, scheduler를 import하지 않는다. Import boundary는 Hangul/Number/platform runtime 의존과 production wiring을 모두 금지한다. 신규 76 cases를 포함한 shared 75 + Web 151 + server 780 = 총 1006 tests가 exact cardset/conservation, action legality, 45초 timeout, forfeit 차이, fair-round/result와 source boundary를 검증한다. Persisted whole-state codec/coherence와 Room/UoW/scheduler 연결은 P11B 책임이다. 상세 contract는 [GEM_CARD_DOMAIN_DESIGN.md](./GEM_CARD_DOMAIN_DESIGN.md)를 따른다. **P11A COMPLETE / P11B READY**.

#### NUMBER_TILE Joker semantics follow-up

현재 판정은 **SOURCE COMPLETE / MANUAL BROWSER VERIFICATION PENDING**이다. Root typecheck, 1045/1045 tests, build, production-serving 6/6과 diff-check를 통과했다. Codex의 Chrome 직접 연결 제한은 사용자 결정에 따라 source checkpoint blocker가 아니다. 배포는 `DEPLOYMENT_PENDING_USER_ACTION`이며, 사용자가 Railway 최신 commit 수동 배포 후 두 Chrome 창으로 검증할 때까지 **GEM_CARD P11B NOT STARTED**를 유지한다. 기존 Number browser tab은 refresh하고 새 Room에서 검증한다.

P11B 시작 전 actual Number play에서 확인된 Joker interaction/rule 문제를 focused correction으로 처리한다. Bare physical Joker placement, GROUP의 colorless existential validation, RUN의 ordered-position role derivation, previous-role-independent rearrangement와 final Table exact-once conservation을 적용한다. Old exact-replacement recovery와 arbitrary GROUP color assignment는 제거한다. Number command/V2 branch만 좁게 변경하고 protocol/event/snapshot version 이름, Hangul rules/wire와 GEM_CARD P11A domain은 유지한다. 이미 old strict Number schema를 로드한 open client는 refresh해야 하며 fake color compatibility는 제공하지 않는다. 상세는 [NUMBER_TILE_JOKER_SEMANTICS_FIX.md](./NUMBER_TILE_JOKER_SEMANTICS_FIX.md)를 따른다. 이 focused change 자체는 P11B를 시작하지 않는다.

#### Required tests

- market refill, reserved-aware deck/market exhaustion과 `gem-cardset-v1` static constraints
- resource conservation과 collect/purchase/reserve/holding limits
- fair-round, YIELD/no-progress, finish/tie/score cases
- public reserve/holdings와 hidden deck-order invariant
- 45초 timeout, offline third-timeout forfeit와 no-overall-deadline behavior
- 기존 두 game 전체 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P11A만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙, docs/GEM_CARD_GAME_RULES.md의 CONFIRMED 항목과 docs/GEM_CARD_CARDSET_V1.md의 canonical rows만 사용해 Tile/Rack 없는 card market/deck/resources/player holdings/reserve state와 collect/purchase/reserve/refill/YIELD/fair-round/finish RuleEngine을 구현하라. ID/random/Clock을 주입하고 45초 turn timeout을 구현하되 overall game deadline은 만들지 않으며 GenericTile/WordGroup, shared wire, persistence, React, catalog는 제외하라. cardset validation, conservation/privacy/result table-driven tests와 세 game 전체 typecheck/test/build/diff-check를 통과시켜라.
```

### 14.2 P11B — Gem/Card server/shared integration

#### 목표

GEM_CARD command/projection/state codec을 canonical registry와 Room application 경계에 연결한다.

#### Scope

- closed shared command/failure/player projection runtime schema
- state codec, lifecycle inspector, projector registration
- canonical gameType, actor, scoped revision, idempotency, Room serialization
- candidate validation 후 atomic commit과 confirmed public/private projection
- 45초 turn timeout server action/recovery; overall game deadline 없음
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
- projection이 public holdings/reserves와 private deck/order policy를 지킨다.

#### Required tests

- runtime command/projection schemas
- atomicity/idempotency/concurrent purchase-reserve
- codec/clone/lifecycle, 45초 scheduled-turn recovery와 game-deadline capability 부재
- public holdings/reserves, private deck/order와 existence-nondisclosure
- timeout/YIELD/offline-forfeit/leave resource-return application path
- 기존 두 game 전체 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P11B만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P11A를 기준으로 GEM_CARD의 닫힌 shared command/failure/projection schema, state codec/lifecycle/projector, server application을 canonical gameType registry와 Room UoW에 연결하라. resource/card conservation, actor/scoped revision, idempotency, serialization, public holdings/reserves, private deck/order와 atomic commit을 서버에서 검증하고 45초 scheduled-turn action/recovery를 연결하되 overall game deadline은 만들지 마라. React와 production enablement는 제외하고 세 게임 전체 typecheck/test/build/diff-check를 통과시켜라.
```

#### P11B completion checkpoint

Started at `9e124e4` with 1045 passing tests. The exact third Room union, identity-only registration, four GEM commands, V2-only capability admission, rack-free projection, immutable clone/coherence, 45-second timeout/recovery and platform retention are implemented. The P11A domain and recent Number Joker correction are unchanged. Details and final validation are in [GEM_CARD_SERVER_INTEGRATION.md](./GEM_CARD_SERVER_INTEGRATION.md).

P11B is source integration only: current Web advertises/creates only Hangul + Number; no GEM card, renderer, generic framework or Railway change. `DEPLOYMENT_NOT_REQUIRED_FOR_P11B`. P11C is the next separate task, not implemented here. Number manual browser verification is not reclassified as completed.

### 14.3 P11C — Gem/Card web implementation

> Completed from `cc20977` / 1083 tests: **SOURCE COMPLETE / MANUAL PUBLIC VERIFICATION PENDING**. Final 1114 tests (85 shared / 211 Web / 818 server), typecheck/build and production-serving 6/6 PASS. Local built-client three-game smoke and in-app A/B GEM gameplay/390/320 inspection passed; public release and Railway remain P12. Implementation, the local Leave-dialog automation limitation and exact manual scope: [GEM_CARD_WEB_IMPLEMENTATION.md](./GEM_CARD_WEB_IMPLEMENTATION.md).

#### 목표

authoritative GEM_CARD projection만 소비하는 독립 card/resource renderer를 구현한다.

#### Scope

- concrete GEM_CARD decoder/Playing/Finished route (renderer registry 추가 없음)
- market/resource/purchase/reserve/result interaction
- approved neutral/original/licensed asset만 사용
- local selection과 server ack/snapshot reconciliation
- reconnect/resume/retry/error UX
- keyboard/touch/responsive/accessibility behavior

#### 금지사항

- Tile/Rack UI adapter와 client-side canonical rule/score 계산
- unapproved brand/logo/official art
- server/shared rule 변경
- P12 E2E/product review 전 public release 완료 주장 또는 임의 Railway 배포

#### Definition of Done

- renderer가 server projection과 ack만 authority로 사용한다.
- exact public holdings/reserves만 렌더링하고 hidden deck IDs/order와 server internals를 DOM/log에 노출하지 않는다.
- reconnect와 stale snapshot에서 local interaction이 안전하게 reset/reconcile된다.
- Hangul/Number renderer가 회귀하지 않고 catalog는 controlled 상태다.

#### Required tests

- decoder/renderer routing, public holdings/reserves와 hidden-deck DOM checks
- purchase/reserve retry/reconnect/stale revision UX
- result rendering과 accessibility/responsive checks
- asset provenance/build verification
- 기존 두 game 및 전체 tests, typecheck/build/diff-check

#### Codex 실행 명령

```text
Multi-game Platform P11C만 수행하라. docs/MULTI_GAME_MIGRATION_ROADMAP.md의 공통 실행 원칙과 P11B projection/command를 사용해 독립 GEM_CARD web decoder, market/resource/purchase/reserve/result renderer를 구현하라. server snapshot/ack만 authority로 삼고 confirmed public holdings/reserves를 정확히 표시하되 hidden deck IDs/order와 server internals를 DOM/log에 노출하지 말며 승인된 neutral/original/licensed asset만 사용하라. reconnect/retry/stale revision과 accessibility를 검증하고 P12 전 production catalog는 controlled 상태로 유지한 채 세 게임 전체 typecheck/test/build/diff-check를 통과시켜라.
```

## 15. P12 — Multi-game E2E and deployment

### Current execution status — 2026-09-08

**P12 SOURCE GATE PASS / RAILWAY DEPLOYMENT PENDING USER ACTION**. Baseline `55d20ec` 1,183 tests에서 raw three-game regression 19개를 추가하여 1,202 PASS(shared91/Web265/server846), typecheck/build/diff-check 및 production-serving 6/6을 통과했다. 실제 local production-build에서 세 게임 A/B setup/actions/resume, Number desktop drag/mobile tap/forced disconnect/Home resume, GEM tutorial/Guide/basic-first market 및 reserved purchase를 확인했다. Production source/rules/dependency 변경 없음.

위 단락은 최초 source gate 기록이다. 이후 Number focus-layout fix `db0e6c6`에서 1,215 tests가 통과했고, 사용자가 배포한 해당 Active commit/1 Replica를 Dashboard에서 직접 확인했다. 첫 public 확인 당시의 browser automation blocker는 §9에 보존한다. 이번 closure에서 GEM actual browser UI/tutorial/Guide 및 Number desktop을 포함한 남은 public functional/responsive 검증을 완료하여 **P12 COMPLETE / THREE-GAME PLATFORM V1 VERIFIED**로 판정한다. 실제 handshake frame은 `MANUAL HANDSHAKE FRAME UNOBSERVED`이며 exact deployed bundle + 기존 raw capability 검증 + 실제 두 Chrome GEM admission/gameplay로 functional capability를 독립 확인했다. 검증된 runtime은 `db0e6c6`; 이후 checkpoint는 docs-only이고 physical-device 체감 검토는 수동 한계로 유지한다. **RUNTIME_TAG_READY: `three-game-platform-v1`, target = `db0e6c6`**이나 tag를 생성/이동하지 않았다. 이전 NOT STARTED/deployment pending 문구는 historical checkpoint이며 P13은 아직 시작하지 않는다. 정확한 근거/한계는 [THREE_GAME_PLATFORM_RELEASE_GATE.md §10](./THREE_GAME_PLATFORM_RELEASE_GATE.md#10-public-browser-verification-closure)를 따른다.

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
- Rules gate의 unresolved decision은 구현 Phase로 넘기지 않는다. P6는 모두 확정됐고 P10은 향후 같은 gate를 따라야 한다.
- P3에서 module surface가 부족하더라도 NUMBER_TILE 요구를 추측해 확장하지 않는다.
- P9A/P9B는 실제 두 game 근거가 있는 유일한 abstraction 승격 gate다.
- GEM_CARD가 current interface에 맞지 않으면 game을 왜곡하지 않고 P9B contract를 더 작게 만드는 별도 변경을 제안한다.
- protocol version 변경, storage migration, production enablement는 각각 해당 Phase의 명시적 DoD와 rollback 계획이 있어야 한다.
- 매 Phase 완료 보고에는 변경 파일, 핵심 결정, 미확정 사항, test 수와 결과, production compatibility 영향을 포함한다.

## 17. NUMBER_TILE unordered RUN focused follow-up

`ff1a792`의 GEM P11C SOURCE COMPLETE를 보존하고 P12는 시작하지 않는다. 실제 `O7,J,O9,O6` bug는 same-color physical set의 unique consecutive solution을 canonical ascending RUN으로 만드는 Number-only correction으로 처리했다. Genuine numeric ambiguity만 valid ordered intent 또는 숫자 선택으로 해소하며 GROUP colorless Joker와 previous-role-independent conservation은 유지한다. 위 historical Joker checkpoint의 raw-position-first RUN 설명은 이번 규칙으로 superseded된다.

Typecheck, 총 1,135 tests (shared 91 / Web 217 / server 827), build, production-serving 6/6과 diff-check를 통과했다. **SOURCE COMPLETE / MANUAL RAILWAY VERIFICATION PENDING**으로 public 배포와 구분한다. 이번 작업은 배포나 Railway 설정 변경을 수행하지 않는다. 상세는 [NUMBER_TILE_UNORDERED_RUN_FIX.md](./NUMBER_TILE_UNORDERED_RUN_FIX.md)를 따른다. 다음 사용자 요청 후보는 **NUMBER_TILE BOARD UI OVERHAUL — board-centric real-game interaction** 하나다.

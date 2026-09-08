# P13 — Three-game platform post-release abstraction review

> 날짜: 2026-09-08
>
> 상태: P13 analysis complete; extraction은 사용자 승인 전 미구현
>
> 범위: source evidence, classification, recommendation, migration proposal만

## 1. Release baseline와 검토 범위

- 시작 master: `9c3c0e1c2e7470a6dc32f65c34dbb50a7ac83d43` — `docs: complete three-game production verification`.
- 검증된 production runtime: `db0e6c638835dc8164236fc3841f4f3a88db6054`.
- `three-game-platform-v1` local/remote target은 위 runtime commit과 같다. 이 작업에서 tag를 생성·이동하지 않는다.
- P12: **COMPLETE / THREE-GAME PLATFORM V1 VERIFIED**. 이후 master의 verification commits는 docs-only이며 runtime source diff가 없다.
- 시작 gate: clean `master === origin/master`, typecheck/build PASS, **1,215/1,215 PASS** — shared91/Web276/server848; fail/cancel/skip/todo0.
- P13은 Railway/public smoke를 재수행하거나 배포하지 않는다. P12의 public evidence와 명시된 handshake-frame 관측 한계는 [release gate](./THREE_GAME_PLATFORM_RELEASE_GATE.md)에 그대로 보존한다.

판정은 현재 세 implementation을 기준으로 한다. H = Hangul, N = Number, G = GEM. 아래 source 경로는 repository-relative이며 line/symbol은 시작 HEAD 기준이다. `S` = `apps/server/src`, `W` = `apps/web/src`, `C` = `packages/shared/src`. 링크된 과거 문서의 당시 two-game 가정은 현재 규칙의 authority가 아니다.

읽은 역사: [P9A](./MULTI_GAME_P9A_ABSTRACTION_ANALYSIS.md), [P9B](./MULTI_GAME_P9B_SMALL_ABSTRACTIONS.md), [architecture](./MULTI_GAME_ARCHITECTURE.md), [roadmap](./MULTI_GAME_MIGRATION_ROADMAP.md), P12 release 기록. Source 검토는 core/storage/scheduler, integration/projection, Web의 독립 검토를 대조했다. Production, tests, rules, schemas, manifests와 assets는 수정하지 않는다.

## 2. 결론 요약

세 번째 게임은 giant GameModule의 필요성이 아니라 **공통 mechanism + exact concrete game branches**의 유효성을 증명했다. GEM은 Rack/TurnDraft 없이 같은 Room/session/UoW/transport를 사용한다. Offline timeout은 세 번째에 forfeit하고, resource/card result와 fair-round를 소유한다. 두 tile game의 유사성을 platform rule로 승격했다면 이 경계가 깨졌을 것이다.

추천 extraction은 §7의 **세 개 작은 opt-in 함수**뿐이다. 모두 미승인·미구현이며 release 또는 네 번째 게임의 선행 필수 조건이 아니다.

1. P13-001: public Room participant whitelist projection — 가장 우선.
2. P13-002: caller-owned feedback RequestId seen-set 연산 — 낮은 위험의 중복 제거.
3. P13-003: display-only MM:SS formatting — 낮은 우선순위; 이것만을 위해 큰 migration을 만들지 않는다.

Registry, start executor, lifecycle envelope, renderer/HUD/audio/result framework는 추천하지 않는다. Fourth-game을 시작하거나 추측한 규칙으로 현재 contract를 넓히지 않는다.

## 3. P9A/P9B 재평가

### 3.1 승인된 네 primitive의 실제 사용

| Primitive / 정의 | H | N | G | 현재 판정 |
| --- | --- | --- | --- | --- |
| `S/domain/game-revision.ts:8` `nextGameRevision(GameRevision)` | application submit/draw/pass/timeout/finish/deadline와 lifecycle actions | Number submit/draw/pass/timeout/turn-transition/lifecycle | `games/gem-card/application/gem-card-transition.ts:20` | `PROVEN_CROSS_GAME_PRIMITIVE`; 모두 start0, canonical success +1, rejects/replay/presence는 caller가 증가시키지 않음 |
| `S/domain/frozen-fisher-yates.ts:10` `shuffleFrozen(values, random)` | `hangul-tile/domain/game-state.ts:14,195` alias, 두 bag와 turn order | `number-tile/domain/game-state.ts:169` wrapper, inventory와 order | `gem-card-start-service.ts:167,171` order와 세 tier decks | 같은 copy/descending swap/`nextInt(n..2)`/freeze, n−1 calls. Inventory·RNG 소비 순서는 caller-owned |
| `W/lib/async-single-flight.ts:6` | `turn-submit.ts:124`, `turn-actions.ts:104` | `number-tile-actions.ts:154` | `app/use-lobby-app.ts:1338` | 동일 pending Promise, identity-checked cleanup; payload/retry/error/ack 정책은 받지 않음. `room-leave.ts:72`도 사용 |
| `W/lib/gameplay-identity.ts:14` | `lib/turn-draft.ts:908` | `number-tile-turn-draft.ts:765` | **직접 사용하지 않음**; Playing screen effect:95–97로 selection reset | `gameId/gameRevision/turnId`만 비교하는 opt-in primitive. GEM에 가짜 TurnDraft나 mandatory comparator를 강제하지 않음 |

GameRevision helper는 browser-safe shared **타입**을 쓰지만 구현 위치는 server다. Runtime numeric wire는 그대로다. Number shuffle wrapper의 invalid-index error 번역은 concrete 유지다. GEM은 pure domain에서 platform RNG를 import하도록 바뀐 것이 아니라 application start에서 shuffle한다.

네 helper에 gameType branch, rule-specific config, generic state, persistence/UoW/retry framework가 유입된 증거는 없다. Single-flight의 synchronous throw는 기존대로 동기 전파되고 lock은 남지 않는다. Promise rejection·정리와 accepted-command 판정은 별개다. GEM selection reset을 comparator에 맞춰 재작성할 필요도 없다.

### 3.2 WAIT_FOR_GEM_CARD 해소표

| P9A/P9B 보류 항목 | 세 게임 evidence | P13 단일 분류 / 결정 |
| --- | --- | --- |
| codec/lifecycle registry, participant inspection | 세 typed adapters의 API는 닮았지만 exact input/state correlation 필요; persistence가 `turnOrder` participant coherence를 읽음 | `WAIT_FOR_FOURTH_GAME`; registry 도입 대신 현재 concrete adapter 유지, 실제 durable-storage/다른 lifecycle 요구 때 재검토 |
| stored game envelope | H/N/G exact union으로 세 게임 integration 성공 | `WAIT_FOR_FOURTH_GAME`; `RoomRecord<unknown>`로 치환하지 않음 |
| start orchestration shell | H snapshot presence vs N/G lease, G pre-RNG authorization, H overall deadline | `WAIT_FOR_FOURTH_GAME`; 현재 실행 순서 통일 금지 |
| generic command executor | G Collect/Purchase/Reserve/Yield는 H/N Submit/Draw/Pass와 payload·전이가 다름 | `ACCIDENTAL_SIMILARITY`; generic `game:command` 방향 기각 |
| offline timeout policy | H/N second strike, G third strike; timeout consequence 다름 | `KEEP_GAME_SPECIFIC`; 이제 차이가 실제로 증명됨 |
| ranking domain abstraction | H lexicographic key, N penalty subgroup/부분 rank, G descending VP/fair-round | `KEEP_GAME_SPECIFIC` |
| projector/renderer registry | H V1 bridge, N native table, G rack-free market; controller props/phase guards 다름 | `WAIT_FOR_FOURTH_GAME`; identity switch 제거만으로 이득 부족 |
| mandatory lifecycle/Turn | 세 게임이 timed sequential turn을 사용한다는 관측뿐 | `WAIT_FOR_FOURTH_GAME`; 미래 simultaneous/round game contract로 확정하지 않음 |
| use-lobby-app decomposition | central integration 파일은 커졌으나 concrete late-ack/retry owner 차이 존재 | `WAIT_FOR_FOURTH_GAME`; generic controller 제안 아님 |
| schema assembly factory | exact strict 3×3 branches, GEM만 rack-free | `WAIT_FOR_FOURTH_GAME`; schema type erasure 위험 대비 이득 부족 |
| direct Hangul V2 path | 아직 V1→V2 bridge 사용 | `POST_RELEASE_POLISH`; 별도 privacy/wire migration gate가 필요한 debt, small extraction과 분리 |
| rack-free outer V2 | GEM Playing/Finished에 rack validation을 적용하지 않도록 P11B에서 해결 | `PROVEN_PLATFORM_CORE`; game-private correlation의 소유 위치 정리는 별도 debt |
| obsolete legacy router facets | shared start/scheduled router가 실제 entry, legacy start/timeout facet은 별도 잔존 | `POST_RELEASE_POLISH`; 이번에 삭제하지 않음 |

## 4. Three-game mechanism/policy evidence

| 축 | HANGUL_TILE | NUMBER_TILE | GEM_CARD | 결론 |
| --- | --- | --- | --- | --- |
| Domain | WordGroup/한글 조합/사전, 두 bag | physical Table, GROUP/RUN, colorless Joker | card/resources/market/fairRound, Rack 없음 | concrete |
| Turn | 60초 + overall25분 | 90초, overall 없음 | 45초, overall 없음 | callback mechanism만 core |
| Timeout | 최대3장 penalty, 두 bag/overall precedence | 1장 draw 또는 empty-pool no-play | no-action advance / verified yield 판정 | concrete |
| Offline forfeiture | 연속2회 timeout | 연속2회 timeout | 연속3회 timeout | 공통 strike policy 불가 |
| Leave | H forfeit/finish/advisory | N conservation/next-turn/last survivor | explicit leave resource return, cards frozen | Room/session removal은 core, consequence는 concrete |
| Gameplay events | `turn:submit/draw/pass` | `number:submit/draw/pass` | `gem:collect/purchase/reserve/yield` | exact commands |
| Private/public | self Rack, opponent count; bag content private | self Rack, opponent count; pool content private | holdings/purchased/reserved public, future deck private | per-viewer mechanism 공통, fields는 concrete |
| Result | 5 reasons, rack/penalty와 rank | 3 reasons, STALEMATE rank / other playerResults | 4 reasons, VP ranks, public engine | generic Result 불가 |
| Web local state | Board TurnDraft | Table editor/active meld/drag/tap/undo | collect/card selection, single-step action | GenericTurnDraft 불가 |

Source: `S/games/hangul-tile/domain/game-state.ts`, `S/games/number-tile/domain/game-state.ts`, `S/games/gem-card/domain/game-state.ts`, 각 game의 result-engine, application timeout/player-lifecycle files; `W/features/game`, `number-tile`, `gem-card`의 Playing/Finished files. Historical P9A에서 예상했던 GEM private reserved hand는 현재 제품 규칙이 아니다. 실제 GEM reserved cards는 public이다.

## 5. 분류 inventory

각 행은 정확히 하나의 classification이다. 이미 공용인 mechanism과 그 안에서 선택하는 game policy는 다른 분석 단위다.

| 단위 | Classification | 근거 / 다음 결정 |
| --- | --- | --- |
| RoomId/code, PlayerId, Host, immutable gameType | `PROVEN_PLATFORM_CORE` | `C/identifiers.ts`, `S/model/persistence.ts:39–76`, `room-session-service.ts:258` |
| token verification, credential-bound membership, single-primary | `PROVEN_PLATFORM_CORE` | `session-resume-service.ts:67`, connection registry, Socket.IO current-binding guard |
| PresenceVersion / roomRevision / storage CAS separation | `PROVEN_PLATFORM_CORE` | presence port, RoomRecord, UoW; gameRevision와 혼용하지 않음 |
| Same-browser automatic/manual/Home resume | `PROVEN_PLATFORM_CORE` | `W/lib/saved-game.ts`, `session-storage.ts`, `features/platform/ReconnectBoundary.tsx`, use-lobby-app |
| Snapshot version와 game capability 협상/입장 | `PROVEN_PLATFORM_CORE` | `C/snapshot-negotiation.ts`, `S/application/room-admission-policy.ts`, `transport/game-type-capability.ts` |
| Room mutation lane, UoW, CAS, idempotency mechanism | `PROVEN_PLATFORM_CORE` | RoomMutationSerialExecutor, RoomUnitOfWork ports, in-memory persistence commit |
| Retention/cleanup/resource cancellation | `PROVEN_PLATFORM_CORE` | `application/room-retention-service.ts`, `infrastructure/room-lifecycle-resources.ts` |
| Socket.IO/WSS/ack correlation/per-viewer fan-out | `PROVEN_PLATFORM_CORE` | `transport/socket-io.ts:722`, `W/lib/realtime-client.ts` |
| Scheduled identity/cancel/stale callback/sweep mechanism | `PROVEN_PLATFORM_CORE` | `ports/system.ts`, `application/scheduled-turn-router.ts`, overdue sweepers |
| Identity-only GameRegistry | `PROVEN_PLATFORM_CORE` | `S/games/game-registry.ts:7,29` frozen registration, unknown/duplicate fail-closed |
| Web static catalog / canonical route / common Lobby shell | `PROVEN_PLATFORM_CORE` | game-catalog, snapshot decoder/view, `App.tsx`, `LobbyScreen.tsx` |
| Four P9B primitives | `PROVEN_CROSS_GAME_PRIMITIVE` | §3; opt-in, no new generic policy |
| Canonical state → scheduled identity mapper | `PROVEN_CROSS_GAME_PRIMITIVE` | `S/application/turn-transition.ts:67`의 기존 `toScheduledTurnDeadline`; 세 concrete playing states에서 동일 tuple 생성 |
| Offset/countdown arithmetic | `PROVEN_CROSS_GAME_PRIMITIVE` | `W/lib/turn-countdown.ts:8,15`, all three Playing callers |
| New-self-turn identity predicate | `PROVEN_CROSS_GAME_PRIMITIVE` | N sound:27, G sound:19; tiny identical predicate, **not recommended for separate extraction now** |
| P13-001 public participant map | `EXTRACT_NOW_CANDIDATE` | §7.1; two physical map copies serving three games |
| P13-002 feedback seen-set operation | `EXTRACT_NOW_CANDIDATE` | §7.2; N/G, no Hangul consumer invented |
| P13-003 MM:SS string conversion | `EXTRACT_NOW_CANDIDATE` | §7.3; N/G opt-in, H seconds UI unchanged |
| Game state/rules/start setup/timeout/forfeit/ranking | `KEEP_GAME_SPECIFIC` | §4/§6; actual semantic divergence |
| Typed clone/validation/adapters and game projectors | `KEEP_GAME_SPECIFIC` | state/privacy knowledge cannot disappear in registry |
| Current exact Room union | `PROVEN_PLATFORM_CORE` | platform integration contract that preserves concrete discriminator correlation |
| H/N/G renderer, HUD composition, result content | `KEEP_GAME_SPECIFIC` | §8; visual policy and DTOs differ |
| Audio engine/cues/preferences/scope lifecycle | `KEEP_GAME_SPECIFIC` | N persistent gesture unlock vs G per-cue context, H no audio |
| Number mobile board/tap/HUD/tiles/Joker | `KEEP_GAME_SPECIFIC` | physical source provenance, focus geometry, wrap and touch semantics |
| GEM tutorial/Guide/content/payment hints | `KEEP_GAME_SPECIFIC` | six product-specific steps and ten guide sections |
| Generic Tile/Rack/Joker/Board/Card/Resource/private state | `ACCIDENTAL_SIMILARITY` | same names/collections do not imply same legality/privacy |
| Generic Submit/Pass/Yield/command executor | `ACCIDENTAL_SIMILARITY` | final-proposal, random draw and legal-action existence differ |
| Generic Result/TurnDraft/GameModule | `ACCIDENTAL_SIMILARITY` | inheritance would encode one game's rules as platform requirements |
| Typed lifecycle/codec/renderer registry, stored envelope | `WAIT_FOR_FOURTH_GAME` | §3/§6; wait for evidence, not automatic fourth-game approval |
| Start shell, shared countdown hook, generic RankList shell | `WAIT_FOR_FOURTH_GAME` | identical subexpressions insufficient; lifecycle/props differ |
| Wrong-game error specificity | `POST_RELEASE_POLISH` | no crash/mutation; §9, externally visible error contract decision |
| Start contract ownership, unused facets, stale comments | `POST_RELEASE_POLISH` | §9; not bundled into abstraction candidates |
| H direct V2 / rack-check ownership cleanup | `POST_RELEASE_POLISH` | current behavior valid; independent wire/privacy gate |

## 6. Server/platform review

### 6.1 Core: already shared, not another extraction

Room identity/code creation, Host assignment, membership and session token verification use one platform path for all games. `room-session-service.ts:314–324,396,645` checks requested/canonical game admission before mutation; join does not let a nickname confer a Playing seat. `session-resume-service.ts:118` checks capability and delegates existing authenticated presence restoration, not new-player creation.

Room/session mutation, explicit leave removal and accidental disconnect are distinct. Connection/current-primary generation and presence lease prevent stale socket work replacing a new primary. Game-specific resume streak-reset plans preserve gameRevision; platform resume may update storage/presence. These are not grounds for a generic timeout policy.

The common mutation lane serializes Room operations. `in-memory-persistence.ts:531–560,1103–1165` and `ports/room-unit-of-work.ts` own CAS/preconditions/atomic Room-session-idempotency commit. Fingerprint, receivedAt, validation precedence, action result and revision timing remain concrete command responsibilities. Server idempotency is **not** the Web feedback seen-set candidate.

All-offline PLAYING retention and FINISHED retention use existing platform retention/deadline-resource cleanup. Current recovery is in-memory overdue sweep/retry, not durable restart recovery. The 2–4 participant limit is a confirmed current product constraint, not proof that every future game has that capacity.

### 6.2 GameRegistry and exact Room union

`S/games/game-registry.ts` still registers only stable `gameType`. Capability negotiation is connection metadata and grants no command authority; game display names/help belong to Web. No additional proven metadata is needed in this registry today. Execution, state, result, projection, renderer and timeout policy would combine unrelated owners and import environments.

`S/model/persistence.ts:58–83` correlates exactly:

```text
HANGUL_TILE -> HangulRoomRecord    -> HangulGameState | null
NUMBER_TILE -> NumberTileRoomRecord -> NumberTileGameState | null
GEM_CARD -> GemCardRoomRecord       -> GemGameState | null
```

`RoomWriteCandidate` preserves that correlation distributively. Benefits: compiler narrowing and omitted-branch errors; no Number game paired with GEM type; concrete privacy projector input; typed clone/persistence validation. Adding a fourth member requires explicit registration/clone/dispatch/schema/renderer work; that finite integration checklist is not itself a defect. A generic `RoomRecord<unknown>` erases those safeguards without removing game-owned checks.

### 6.3 Persistence and lifecycle registry

`in-memory-persistence.ts:96–111` already holds three exact adapter dependencies and a correlated lifecycle union. `persistRoom` at213–255 selects concrete `cloneAndValidate`; `inspectRoomGame` at321–343 selects lifecycle inspection. `validateRoomGameCoherence` ties phase and participating players to canonical game `turnOrder`.

Adapters are `games/hangul-tile/compatibility/legacy-hangul-game-state-adapter.ts`, `games/number-tile/compatibility/number-tile-game-state-adapter.ts`, and `games/gem-card/compatibility/gem-card-game-state-adapter.ts`. They share clone/validation/lifecycle vocabulary, not deep-copy/state semantics. H validates Board/bags/result and overall deadline; N physical Table/pool/Joker/conservation/result; G card/resource conservation, market/fair-round/coherence. G must not inherit Rack validation. 현재 계약은 typed state의 `cloneAndValidate(TState): TState`이며, 저장된 unknown/JSON을 역직렬화하는 codec은 아니다. 따라서 실제 durable-storage 요구 없이 이를 codec registry라고 일반화하지 않는다.

**Retain exact union + concrete adapters.** A heterogeneous registry would still need correlated dispatch or assertions; storing codecs under erased `unknown` state is worse. Central `turnOrder` knowledge is acknowledged debt: if a future game has inactive participants, secret round actors or no single turn order, review the adapter participant-inspection boundary first. P13-001 only maps Room metadata and does not replace this persistence check.

### 6.4 Start

`GameStartRouter.start` (`S/application/game-start-router.ts:91`) dispatches by canonical type, not a client-supplied game field. H `game-start-service.ts`, N `number-tile-start-service.ts`, G `gem-card-start-service.ts` share lane, idempotency, Lobby/Host/connected checks, atomic candidate commit, then snapshot/scheduling delivery.

But H presence is read once (284–292) and commit guards actor authorization (338); N/G commit also requires the acquired presence lease (N204–219/268–270; G155–165/213). G rechecks authorization before RNG. H schedules both turn and overall deadline (218–237); N deals inventory through its domain factory; G shuffles order/decks and builds market. A shell would need policy/ordering callbacks. **No start execution shell now.** Common-looking StartGameInput/SuccessData owned in the Hangul concrete service is a separate relocation candidate (§9), not evidence for executing all starts generically.

### 6.5 Commands and server actions

`LegacyHangulV1CommandRouter`, `NumberTileCommandRouter`, `GemCardCommandRouter` preserve typed inputs, receivedAt and concrete result delegation. Top-level `transport/socket-io.ts` captures server receivedAt on entry, validates exact events, authenticates current binding/capability, then uses typed services; fan-out rechecks current binding. G's closed four-action service is GEM-specific, not a cross-game executor prototype.

`ScheduledTurnRouter` already exposes the narrow opt-in `ScheduledTurnDeadline -> APPLIED | NO_OP | FAILED` mechanism for all three games (`scheduled-turn-router.ts:9,81`). `PlayerLifecycleRouter` preserves concrete leave/presence-reset plans (`player-lifecycle-router.ts:32,95,109`); platform UoW combines game mutation with session/membership removal. H-only deadline routing remains separate. Adding a new server-action registry simply to remove these switches has no proven payoff. A giant lifecycle interface would wrongly mandate timeout/forfeit/deadline/turn semantics.

### 6.6 Scheduler and recovery

Shared `ScheduledTurnDeadline` safety identity is `{roomId, gameId, expectedGameRevision, turnId, deadlineAt}` (`ports/system.ts:53`); stale/duplicate callbacks, replacement/cancel, due-only sweep and best-effort rescheduling are mechanisms. Each concrete service still validates canonical identity and authorizes its timeout consequence under the Room lane.

| Policy | H | N | G |
| --- | --- | --- | --- |
| Turn / overall | 60s /25min | 90s /none | 45s /none |
| Timeout action | up to3 penalty tiles | 1 draw or no-play | no-action advance; legal-action check for verified yield |
| Offline consecutive limit | 2 | 2 | 3 |
| Resume | existing streak reset | existing streak reset | existing streak reset |
| Explicit leave vs timeout | H rules | N rules | explicit leave returns resources; third-timeout forfeit retains holdings |

Last-player-standing, no-progress/stalemate, overall precedence and fair-round are game policy. Same `Turn` field names do not prove a universal timer. No overall scheduler is introduced for N/G, and no durable recovery claim is made.

### 6.7 Snapshot, projection and privacy

`C/platform/platform-snapshot-v2.ts` defines an exact three-game × Lobby/Playing/Finished contract. Room/self/Host/unique-participant shell is common; gameType/phase correlates with the concrete projection. `privateRackMatchesSelfCount` (about104) is called only for H/N branches (288/324/425/461), not G (341/478). **P9A's rackless-game blocker is resolved.** Its helper's physical location in the platform file remains ownership debt, not a current requirement for GEM to expose fake Rack.

`S/application/platform-snapshot-v2-projector.ts:62` still routes H through V1 projection and mapper; N/G use native concrete projectors. Shared outer shell is already present. A whole projector registry would still have to respect differing phase validation and output types. The only recommended new extraction is the four-field Room participant map, not the whole snapshot.

- H projector: `games/hangul-tile/compatibility/legacy-hangul-v1-game-projector.ts`; own rack only, opponents count/progress, legacy wire retained.
- N projector: `games/number-tile/compatibility/number-tile-v2-game-projector.ts:104,135,169`; opponent count, self descriptors, pool count, public placed Table.
- G projector: `games/gem-card/compatibility/gem-card-v2-game-projector.ts:16–27`; explicit card/resource/market/count whitelist, public reserves/engine and no future deck IDs/order.
- Per-player delivery (`transport/socket-io.ts:722`) projects for self then checks the binding again. Game privacy policy never becomes a generic optional-fields `PlayerPrivateState`.

A fourth hidden-role game may need different private content and reveal timing. That is exactly why only Room identity/presence is shared and private/public game payload remains correlated and concrete.

## 7. EXTRACT_NOW_CANDIDATE — approval proposals, not implementation

Each proposal is independent. No generic state, callback bag, rule option or additional dependency is permitted. Existing names may remain thin wrappers where needed to preserve imports/tests. Additional behavior changes require separate approval.

### 7.1 P13-001 — public Room participant whitelist

**Files / actual duplicate sites**

- `apps/server/src/application/lobby-state-snapshot-projector.ts:63–70` — `basePlayers` for H V1 (also feeds H V2).
- `apps/server/src/application/platform-snapshot-v2-projector.ts:75–81` — `roomPlayers` for N/G V2.
- Proposed new owner: `apps/server/src/application/project-room-participants.ts` (does not exist yet).

**Identical invariant:** preserve player array order; build detached objects containing only playerId/nickname/isHost/connectionStatus; host equality determines isHost; null host yields all false; missing status defaults OFFLINE. Do not freeze previously mutable output, sort or mutate input.

**Proposed API:**

```ts
projectRoomParticipants(
  players: readonly Pick<PlayerRecord, "playerId" | "nickname">[],
  hostPlayerId: PlayerId | null,
  statuses: ReadonlyMap<PlayerId, ConnectionStatus>,
): PlatformPlayerViewV2[]
```

It is a server-local pure mapper of existing fields, not a GameProjector interface. The existing four-field V2 type is structurally also the legacy base-player shape; using it adds a small compile-time dependency on that shell type but must not add snapshotVersion/gameType to V1 wire. No new hierarchy is required.

**Removed duplication / benefit:** one whitelist/fallback definition replaces two physical map bodies serving all three games. This helps prevent accidental player-record spread or differing presence fallback; it does not merge game projection/privacy.

**Coupling boundary:** clock, presence read, viewer membership checks, phase/versions, schema parse and rack/engine fields remain in each caller. The V1→V2 mapper copies already-projected fields and is **not** a third call site to force through the new function.

**Risk:** LOW if the exact two bodies alone move. Risks include joinOrder leakage, order/fallback changes, moving fail-before-presence validation or changing clock timing. No IO inside the helper.

**Regression:** `application/lobby-state-snapshot-projector.test.ts` golden, missing presence193, rejection-before-read248/278 and privacy; `application/platform-snapshot-v2-projector.test.ts` N phases/H V2 Lobby bridge; `gem-card-integration.test.ts:402,455` G Playing/Finished; `platform-snapshot-v2-wire-isolation.test.ts`; P12 per-viewer/legacyV1 tests. Add pure tests for detached objects, order, null Host, absent presence, input unchanged and exact keys. All H V1/V2/N/G projections must remain exact.

### 7.2 P13-002 — feedback RequestId seen-set operation

**Files / actual duplicate sites**

- `apps/web/src/features/number-tile/number-tile-sound.ts:36` — `markNumberTileActionFeedback`; used by `app/use-lobby-app.ts:383` after accepted action.
- `apps/web/src/features/gem-card/gem-card-sound.ts:22,60` — `markGemFeedback`/audio hook.
- `apps/web/src/features/gem-card/gem-card-actions.ts:97–102` — inline has/add in `gemCardActionFeedback`; called by page controller at1371.
- Proposed new owner: `apps/web/src/lib/request-feedback.ts` (not implemented).

**Proposed API:** `markRequestFeedbackSeen(seen: Set<RequestId>, requestId: RequestId): boolean`.

**Identical invariant:** already present → false with no change; absent → add exactly that RequestId and return true. Synchronous and caller-owned mutable Set; no IO, clocks, commands, cue names or global storage. This is not a pure immutable function and is not server idempotency.

**Removed duplication / benefit:** one identical has/add decision for accepted visual/audio feedback prevents per-feature replay bookkeeping drift. Three actual code sites exist in N/G; H has no action audio path to migrate. Two games suffice for this narrowly proven primitive; no claim of three consumers is made.

**Coupling / risk:** LOW for the operation alone, higher if Set lifetime is moved. Preserve the **separate Sets** for Number accepted feedback, GEM accepted feedback and GEM rendered audio; never share/deduplicate their scopes together. `use-lobby-app.ts:406,452` resets, storage keys/session dedup, sound-enabled policy, success recognition, timing, message and cues remain caller-owned. A mute must not cause old accepted actions to replay on unmute.

**Regression:** `W/lib/number-tile-ux.test.ts:329`, `gem-card-ui.test.ts:202`, `gem-card-actions.test.ts:153`, `number-mobile-audio.test.ts` and reconnect/retry tests. Add first/replay/different IDs, independent Sets, clear/reuse and exact return-value tests; rejected command emits no success feedback; final-action cue and same-ID retry stay unchanged.

### 7.3 P13-003 — opt-in MM:SS formatter

**Files / actual duplicate sites**

- `apps/web/src/features/number-tile/number-tile-sound.ts:99` — `formatNumberTileCountdown`, Playing caller:195.
- `apps/web/src/features/gem-card/gem-card-ui.ts:124` — `formatGemCountdown`, Playing caller:139.
- Proposed owner: existing `apps/web/src/lib/turn-countdown.ts`, adding only `formatCountdownMmSs(remainingSeconds: number): string`.

**Identical invariant:** `max(0, floor(seconds))`; divide/modulo60; minimum two-character padding; minutes not capped at99. Same input gives same string. No deadline/tick/offset/readDate/aria/warning/game duration knowledge.

**Removed duplication / benefit:** one display quantization/rollover rule and correctly neutral ownership (currently Number formatter lives in sound file). Benefit is small; lowest priority, optional approval, no need to fill an abstraction quota.

**Coupling / risk:** LOW, ordinary number/string only. H's existing seconds text stays unchanged. Do not introduce finite-input validation or change existing NaN/Infinity behavior while extracting; caller countdown validity and authority remain separate.

**Regression:** `W/lib/number-tile-ux.test.ts:350`, `gem-card-ui.test.ts:152`, `turn-countdown.test.ts`; negative/0/fraction/59/60/90/>99-minute cases and unchanged UI strings. Do not extract/standardize the three countdown hooks as part of this ID.

### 7.4 Approval/migration gate

User selects specific P13 IDs before P13B. Each approved ID gets its own narrowly scoped diff, new characterization tests, affected H/N/G tests, root typecheck/test/build/diff-check and source-boundary audit. Tests must not be weakened. P13-001 additionally requires V1/V2 golden/privacy/P12 projection regression; P13-002 audio/retry/reconnect; P13-003 timer display/unchanged HUD. Revertability is a small independent code change, not permission to rewrite release history. This review does not authorize any migration, even these three.

## 8. Web review

### 8.1 Routing and Home metadata

`W/lib/snapshot-wire-decoder.ts:104` checks version/type then strict branch schema; `room-snapshot-view.ts:68` returns an exact typed view. `W/App.tsx` selects H/N/G Playing and Finished components explicitly. H V2 adapts to legacy view; N has a board draft; G passes market/resource callbacks and selection reset. A renderer Map cannot erase those differing props without wrappers/type erasure. Current exhaustive narrowing is safer than a generic renderer contract; no new registry recommended.

`features/game-catalog/game-catalog.ts:9` **already is** a frozen Web-only static catalog of three gameType/displayName/description entries. Do not propose recreating it. Player-count/start eligibility lives in current shared/start policies, not catalog entries; rule help belongs to game-owned content and Lobby presentation. `LobbyScreen.tsx:29,43` still has title/GEM-help wiring, a minor explicit presentation dependency. A fourth title may justify a simple display lookup, not server Registry ownership of React/help/assets. Supported game capabilities and catalog visibility are separate authorities.

### 8.2 Turn HUD/countdown

All three reuse `calculateServerClockOffset` and `calculateTurnCountdown` from `lib/turn-countdown.ts`. H Playing:37–56 and N Playing:50–64 have equivalent one-second tick effects with offset/deadlineAt/turnId dependencies. **G Playing:84–91 omits deadlineAt from effect dependencies.** A shared hook that adds it would harmonize existing lifecycle, not a proven identical extraction. Keep effects concrete for now; no claim that this is an observed bug.

H uses current-turn summary, two bags and seconds text. N uses one persistent mobile HUD, pool/rack stats, large MM:SS, ≤10 warning and sound control. G uses action instructions, MM:SS and fair-round status. Shared arithmetic/§7.3 formatting is enough; no common TurnHUD component, timer policy or audio behavior is required. Active player matching is cheap and not a reason to create a GenericTurn.

### 8.3 Audio

Actual source audit: H has no Playing/action audio path. N has TURN_START/SUBMIT_SUCCESS/DRAW_SUCCESS/PASS_SUCCESS, while G has TURN_START/COLLECT/PURCHASE/RESERVE/YIELD and Finished feedback reuse. Thus “all three have identical audio” would be false.

N `number-tile-sound.ts:108–166` supports WebKit fallback, a gesture-unlocked reused AudioContext and delayed close only to finish an already-started accepted Submit cue. G `gem-card-sound.ts:29–54` creates a context per cue and discards suspended autoplay; it uses a different sweep/envelope. Storage access wrappers, keys and teardown differ. There is no identical AudioContext unlock infrastructure to extract without behavior change. Optional preferences must remain independent of game authority/credentials.

The two new-self-turn predicates have the same `active===self && lastTurn!==turnId` expression, but caller session-replaced, sessionStorage scope and cue timing differ. Classify that expression as a proven tiny primitive, not a shared sound lifecycle; no separate extraction is recommended now. §7.2 only isolates the identical request mark operation, not persistent exact-once audio machinery or product sound design. Device loudness/autoplay remains an existing manual limitation, not proof that GEM sound always plays on every device.

### 8.4 Reconnect and single-flight

`W/lib/session-storage.ts`, `saved-game.ts`, `features/platform/ReconnectBoundary.tsx` and `app/use-lobby-app.ts` already own shared session recovery. `saved-game.ts:20` game metadata is display-only, `:73` prevents automatically reclaiming a replaced session on direct Room entry, `:88` is explicit Home resume selection. `App.tsx:192` applies recovery to all three routes. Same browser saved token, manual retry, refresh and Home saved-game entry do not create new players; wrong/missing token remains fail-closed. Server room/session/presence services remain authoritative. **No further reconnect abstraction needed.**

The same single-flight primitive is used by H/N wrappers, room leave and GEM direct page flow. Request DTO construction, exact retry IDs, stale synchronization and late-ack guards (G context generation at1328) remain concrete. A generic command executor would add callbacks without removing these differences. Existing Number mobile interaction/audio and GEM onboarding are unrelated to reconnect mechanism and stay intact.

### 8.5 Finished/ranking

H `features/game/FinishedScreen.tsx:59` always renders rankings with rack/penalty. N `NumberTileFinishedScreen.tsx:39,81` uses STALEMATE rankings but other reasons' playerResults without a guaranteed rank. G `GemCardFinishedScreen.tsx:28` shows rank/score plus public resources/permanent discounts/purchased/reserved cards and final market.

The common concepts nickname, self/winner highlight and forfeited badge do not yet yield a useful common RankList beyond slots and CSS. A mandatory rank/score-details row would misrepresent N, while a component with numerous optional slots gains little. Keep concrete views; a future **presentational-only** row may be reviewed with actual repeated DOM/a11y invariants. Do not extract result domain. H `result-engine.ts:74` lexicographic keys, N:269 penalty ascending/subgroups, G:46 score descending/subgroups are not one ranking policy merely because ties can produce1,1,3.

### 8.6 Tutorial/Guide and mobile

G `GemGameHelp.tsx:15,65` owns native dialog/focus restoration, first-visit Lobby entry and Playing opt-in; `gem-card-guide.ts` owns six tutorial steps, ten guide sections and product preference. No shared three-game modal/tutorial implementation currently exists to extract. Number onboarding is inline first-meld/board guidance and Hangul is its own editor help. A generic tutorial framework would be invented work; leave it game-specific. Guide does not pause server timers.

N `number-tile-board.css:119,130,150` and `number-tile-tap.ts` own persistent HUD, safe-area spacing, compact wrapping tiles and physical Table-source tap restrictions. `NumberTileTurnDraftEditor.tsx:651` mouse-only drag preserves mobile scrolling. These must not become platform mobile policy. Shared `styles.css:1932–1933` recovery notice already uses safe-area for all games; small CSS shell reuse exists without imposing Number's board layout on G/H. Future safe-area duplication alone does not justify a new mobile framework.

## 9. POST_RELEASE_POLISH / debt, not implementation

1. **Wrong-game structured INTERNAL_ERROR taxonomy:** P12 observed12 = H three actions × N/G + N three actions × H/G. H router rejects unsupported canonical type before service (`legacy-hangul-v1-command-router.ts:139/151/163,175`); N guards at101–111. No crash/state mutation/security breach was observed. G's8 foreign commands were rejected earlier by capability because those test clients advertised their Room game only (`p12-three-game-release.test.ts:32`, `socket-io.ts:1942`); all-game clients can reach G router's INTERNAL_ERROR too. Therefore12 is a measured matrix outcome, not a universal protocol invariant.
2. `transport/p12-three-game-release.test.ts:144,254–266` tests20 structured rejects and unchanged Room/revision/turn/deadline/scheduler/binding/presence/idempotency MISS; it does not pin all wrong-game codes. Classification is **A: error taxonomy polish**, with localized boundary error translation—not evidence of deeper dispatch architecture failure (C) or leaked private state (B). A clearer code requires separate wire/error-UX approval and regression, not router rewrite. Do not weaken fail-closed guards.
3. `game-start-service.ts:48–78` owns shared StartGameInput/SuccessData/authorization while N/G import the H service file. Relocating those **existing shared definitions**, not start execution or min/max policy, to a platform contract file is reasonable ownership polish. There is no duplicated schema definition to justify counting it as a new extraction primitive.
4. Unused legacy start facet and duplicate legacy timeout facet remain from earlier seams. Current composition uses `GameStartRouter`/`ScheduledTurnRouter` (composition-root:518/242); H-only overall deadline still uses legacy server router. Remove only under separate cleanup approval with reference tests, not “while nearby.”
5. `platform-snapshot-v2-mapper.ts:20` says not connected to production realtime; actual projector:62 calls it. Historical commentary needs correction in a future approved cleanup. No runtime change made here.
6. H direct V2 and relocating H/N rack-correlation helper ownership are separate migration debts. GEM's rack-free branch already works; do not report P9A's old blocker as unresolved production failure.

## 10. Explicitly rejected abstractions

- Giant GameModule/GenericGame/GameEngine/GameLifecycle with callback bags or optional mega config.
- GenericGameState, RoomRecord<unknown>, stored opaque envelope removing exact gameType correlation.
- GenericGameCommand / `game:command` / cross-game executor or command bus.
- GenericTile/Rack/Joker/Card/Resource/Board/Table/Meld; shared rule engine or draft/controller.
- GenericResult/ranking policy or optional private-state union mixing Rack and resource engine.
- Registry containing transport, execution, state, projector, React renderer, result and scheduler policy.
- Mandatory active Turn/deadline/advisory, shared offline strikes, overall deadlines for N/G.
- Unified AudioManager, HUD/mobile board framework, tutorial engine or countdown hook that changes caller semantics.

Similar names and short matching expressions are not sufficient. The approved four P9B helpers and three **proposed** P13 helpers remain bounded; none implies one of these frameworks.

## 11. Fourth-game stress points / readiness

A possible secret-role/round game is a stress hypothesis, not an approved title, specification or implementation. Do not infer player count, role selection order, hidden information shape, timers, reconnect/reveal rules or scoring from an external game.

| Boundary | Readiness | Evidence and next review question |
| --- | --- | --- |
| Room/code/Host | READY | three games share identity/membership; current2–4 bound must be revisited if actual approved rules differ |
| Session/single-primary | READY | credential-bound player, current socket generation and fail-closed takeover behavior |
| Reconnect | READY | same-browser persistence/manual/Home resume already platform-owned; no cross-device recovery promised |
| Snapshot | MINOR_DEBT | exact branches are safe; H bridge/rack helper ownership remains; new subphase/private payload needs concrete schema |
| Persistence | NEEDS_REVIEW | valid for current in-memory runtime; `turnOrder` participation and lifecycle assumptions need evidence for new round model; not durable |
| Scheduler | MINOR_DEBT | opt-in identity/cancel/retry ready; no-turn/simultaneous/round deadlines would require explicit review, not GenericTurn |
| Privacy | NEEDS_REVIEW | per-viewer delivery ready, but secret selection/reveal/round privacy and public-vs-private correlation require dedicated threat/tests |
| Web routing | MINOR_DEBT | explicit typed branches safe; finite wiring and central controller size remain visible costs |
| Result | NEEDS_REVIEW | project/render new concrete result; no assumption that penalty or public engine schema fits |

Specific stress questions: distinguish outer Room phase from game-owned subphase; secret selection visibility per viewer; atomic round transition; hidden choice lifetime across reconnect; participating roster vs current eligible actor set; simultaneous/no-turn scheduling if rules actually require it. Session/UoW/fan-out mechanisms can be reused without making today's sequential gameplay identity mandatory for every future action.

Known release limitations remain process-memory only, one Railway replica, redeploy loses active Rooms/Games/sessions, no durable DB/accounts, no cross-device recovery credential, Hangul test-dictionary-v1 (30 words), manual physical speaker/notch/device experience. This review is not an IP/rules gate for a fourth game.

## 12. Verification and handoff

- Scope: this new review plus minimal current-status links in architecture/roadmap. Historical P9A/P9B/P12/rules remain unchanged.
- Runtime source, shared schema/wire, tests, dependency manifests, assets and Railway config: **diff0**.
- Start: root typecheck PASS; full tests **1215/1215** (91/276/848), build PASS. A second summarized test run confirmed all workspace totals and zero fail/cancel/skip/todo; no environment workaround changed source.
- Final documentation gate: root `npm run typecheck` **PASS**; `npm test` **1215/1215 PASS** (shared91/Web276/server848; fail/cancel/skip/todo0); `npm run build` **PASS**; `git diff --check` **PASS**. 기존 P12 release/production-serving 및 세 게임 regression을 포함한 전체 suite를 유지했다. No new tests were needed; none were removed/skipped.
- Independent source-to-document review corrected the exact `expectedGameRevision` field name and separated GEM projection-test evidence from the Number projector suite. Relative document links and the docs-only changed-file scope were checked.
- P13B is **APPROVAL_REQUIRED**, not auto-started. User may approve any subset of P13-001/002/003 or none. POST_RELEASE_POLISH and all fourth-game design require separate scope.
- Checkpoint: this document's `docs: review three-game platform abstractions` commit, normal push only; exact identity is available in Git history. Release runtime/tag stays `db0e6c6`; this documentation checkpoint does not deploy or change gameplay.

**P13 analysis COMPLETE / P13B APPROVAL_REQUIRED.** Final checkpoint/push status is reported separately after Git verification. No abstraction implementation is authorized by this review.

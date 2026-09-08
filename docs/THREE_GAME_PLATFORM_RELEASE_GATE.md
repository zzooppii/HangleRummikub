# P12 — Three-game platform release gate

> 2026-09-08 · **P12 COMPLETE / THREE-GAME PLATFORM V1 VERIFIED**
> Phase A (source/local runtime)와 Phase B (public deployment)를 분리한다. 현재 최종 결과는 §10을 따른다. §§1–9의 pending/blocked 문구는 당시 checkpoint 기록으로 보존한다.

> **Current runtime release:** `db0e6c638835dc8164236fc3841f4f3a88db6054` — `fix: allow flexible number tile rearrangement`. `b949463`은 historical source checkpoint다. 사용자가 새 runtime을 배포했으며 §9에서 Active deployment identity와 1 Replica를 직접 확인했다.

## 1. Checkpoint and scope

- 시작: `55d20eca423941786776089c84f353e6e5abafa7` — `feat: compact number tiles on mobile`; clean `master === origin/master`.
- Baseline: **1,183 PASS** = shared 91 / Web 265 / server 827; typecheck/build/diff-check PASS.
- Release candidate: 이 문서와 `p12-three-game-release.test.ts`를 포함하는 `test: complete three-game platform release gate` checkpoint. 정확한 commit hash와 push 결과는 작업 완료 보고 및 Git history에서 확인한다.
- P12 변경은 regression test 1개 파일(19 tests)과 release/status 문서뿐이다. production source, shared wire, Web UI, rules, dependency, Railway 설정 변경 없음. 기존 test 삭제/skip 없음.
- 새 기능, 네 번째 게임, generic GameModule, auth/DB 재설계, production debug endpoint를 추가하지 않았다. release-blocking source regression은 발견되지 않았다.

## 2. Source / protocol / security matrix

| 항목 | 검증과 결과 |
| --- | --- |
| Inventory | GameType, identity-only GameRegistry, Home catalog는 정확히 HANGUL_TILE / NUMBER_TILE / GEM_CARD. 저장 Room은 exact HangulRoomRecord / NumberTileRoomRecord / GemCardRoomRecord union |
| Snapshot | Hangul은 legacy flat V1 및 V2; Number/GEM은 V2. current Web은 `[2,1]` + 세 supportedGameTypes를 실제 handshake에서 광고 |
| Admission | capability 생략 legacy Hangul, V1-only, wrong/unsupported game capability, canonical Room join/resume, join extra gameType rejection을 raw Socket.IO로 검증 |
| Routing | 3개 PLAYING Room 각각에 다른 게임의 모든 action을 전송(총 20 wrong-game cases). reject 전후 Room 전체, revision, scheduler 등록/cancel, deadline, binding/presence, idempotency가 불변 |
| Mutation | 정상 action +1, replay 추가 증가 0, payload 변경 재사용 reject. 거절한 requestId가 idempotency를 선점하지 않아 이후 정상 command에 사용 가능 |
| Session | nickname-only takeover 불가; wrong/missing credential fail-closed; same-player resume; old primary replacement; offline start reject; explicit leave credential 폐기 |
| Privacy | Hangul/Number own rack details + opponent rackCount only; bag/pool count only. GEM resources/reserves/purchased cards는 공개, deck IDs/order는 비공개. credential/storage/idempotency/scheduler internals projection 없음 |
| Boundaries | 기존 P3D/P8/game-specific Web boundary tests 유지; Hangul/Number/GEM concrete domain, controllers, projectors 보존; cross-game fallback/새 abstraction 없음 |

새 raw matrix는 mock game state가 아니라 실제 `createHttpServer`와 Socket.IO clients를 사용한다. Scheduler spy는 원래 구현을 실행하며 호출을 관찰한다. 2/3/4명 setup 9 tests, foreign action 3 tests, admission 3 tests, identity/lifecycle 3 tests, omitted-capability legacy V1 1 test로 구성된다.

## 3. Gameplay / lifecycle regression evidence

| 게임 | Setup / time | 검증한 concrete behavior |
| --- | --- | --- |
| Hangul | 2/3/4명 rack 14; bag 81/47, 74/40, 67/33; 60초 turn + 25분 game deadline | inventory/composition/RuleEngine, initial meld, Submit/Draw/Pass, offline timeout, leave, 5 finish reasons, private projection, V1/V2 |
| Number | 2/3/4명 rack 14; pool 78/64/50; 90초 turn; overall deadline 없음 | initial 30, GROUP/RUN, colorless GROUP Joker, unordered RUN unique inference (`O7,J,O9,O6`), numeric ambiguity, free Joker rearrangement, conservation/Joker-to-Rack reject, 3 finish reasons |
| GEM | 2/3/4명; 9 market slots; tier deck 12씩 남음; basics 7씩 / PRISM 5; 45초 turn; overall deadline 없음 | Collect cap9, deterministic basic-first purchase/PRISM shortage, permanent discounts, reserve max2/public/no reward/refill, verified YIELD, fair-round, exhaustion, NO_PROGRESS, 4 finish reasons |

GEM terminal reasons는 SCORE_THRESHOLD_ROUND_END / MARKET_EXHAUSTED_ROUND_END / NO_PROGRESS / LAST_PLAYER_STANDING이다. Exhaustion은 deck/market뿐 아니라 eligible reserved candidates 조건도 검사한다. Fair-round는 immutable turn cycle의 남은 eligible suffix를 처리한다. Explicit leave는 resource를 반환하지만 third offline timeout forfeit는 현재 canonical 규칙대로 holdings를 동결한다. LAST_PLAYER_STANDING precedence, forfeit 후 NO_PROGRESS legality 재검사, competition ranking을 기존 domain/integration tests로 검증했다. P12에서 rule 변경 없음.

Platform targeted regression은 room lane, storage CAS, detached clone, UoW rollback, idempotency co-commit, stale/duplicate callback, turn/deadline race, shutdown, retention/cleanup을 포함한다. PLAYING all-offline 30분과 FINISHED fixed finishedAt+30분, session/code cleanup을 유지한다.

**Recovery 한계:** 현재 runtime은 시작 시 모든 future timer를 eager 재등록하거나 process 재시작 후 Room을 durable 복원하지 않는다. 살아 있는/reused in-memory state의 놓친 deadline은 1초 overdue sweeper가 at-least-once safe하게 처리한다. 새 process의 memory는 비어 있다.

## 4. Actual local production-build browser smoke

실제 root build의 Web/server를 사용했다. Hangul은 `npm start`, Number/GEM은 같은 built server + `serveWeb:true`로 실행했다. 독립 A/B origin으로 credential storage를 분리했다. 브라우저는 Codex in-app browser이며 실제 Chrome/Safari/Firefox physical device 검증이라고 표현하지 않는다.

테스트용 외부 관찰기는 repo 밖에서 handshake/command **이름과 field names**, snapshot identity/count/revision만 기록했다. session token이나 private tile/deck contents를 기록하지 않았다. 별도 local TCP proxy는 네트워크를 끊는 용도뿐이며 game state/timer를 조작하지 않았다. production endpoint/hook 추가 없음.

### Hangul

- Home → create → direct invitation join → host start: 2명, rack 14/14, bags 81/47.
- 실제 active player consonant Draw: rack 15, bags 80/47, next turn.
- Refresh resume: 같은 Room/자리, player 2명, rack 15와 현재 turn 유지.
- 1280×720 / 390×844 / 320×568 화면 확인, document horizontal overflow 없음.
- 320px Hangul rack의 기존 내부 horizontal scrolling은 그대로다. Number wrap과 혼동하지 않는다.
- 실제 browser Hangul Submit/terminal play-through 대신 기존 domain/application/raw regression을 재실행했다.

### Number

- Create/join/start: V2 NUMBER_TILE, 2명, racks 14, pool78, 90초. Join payload에는 gameType 없음.
- 자연 패의 K11/K8/K9/K10을 클릭: first combination 생성, K8/K9/K10/K11 정렬, 38/30점. **실제 Submit 성공**, rack14→10, revision0→1.
- 상대 Draw: rack14→15, pool78→77, revision1→2.
- 실제 desktop drag: rack→board 새 조합, meld→meld, rack→meld, rack-origin tile→rack 및 Undo.
- 실제 320px tap: canonical K8 선택→Rack 반환 reject 안내; destination meld tap 이동; Undo; board 빈 곳 새 조합 split; tile destination으로 merge.
- 두 번째 실제 Submit: 기존 RUN + R3/B3/O3 GROUP commit, actor rack10→7, revision2→3.
- 강제 network OFF 26.538초 후 ON: 자동 resume. 같은 player set/game/turn/deadline, revision3, racks15/7, pool77, melds2 유지. presenceVersion만 2→6. offline 중 수동 재접속 버튼도 credential 기반 경로 유지.
- Refresh / tab close→동일 origin Home `진행 중인 게임`→다시 접속하기: 동일 player/Room/rack 복구, player 증가 없음. 이후 정상 90초 timeout의 penalty/revision 증가는 reconnect mutation과 구분했다.
- 390/320: persistent HUD와 timer 1개, Rack wrap, document/Rack horizontal overflow 없음; 320px Table tile 40×52. Desktop board/drag 유지.
- 자연 패 Joker는 이번 browser flow에 없었다. GROUP/unique unordered RUN/role-change/invalid Joker는 자동 regression으로 확인했으며 public에서 억지 패 생성은 하지 않는다.

### GEM

- 320px Lobby에서 optional 6-step tutorial 완료, skip 경로, Guide 10 sections, Escape/close focus 복원 확인. Guide 390px dialog도 viewport 내부.
- Create/direct join/start: market9, tier deck12씩, basics7/PRISM5, 45초, 2명.
- 자원 없는 카드 선택: `구매 불가`, 필요한/보유 PRISM, 부족 자원 안내 확인.
- 실제 Collect(기본1/2 및 PRISM1), face-up Reserve/refill, market Purchase 수행.
- Market purchase: DAWN2+TIDE1 basic-first payment; holdings 감소, ECHO discount+1, 같은 tier refill, revision4→5.
- Own reserved purchase: TIDE1+EMBER2+ECHO1+PRISM1 payment; reserved1→0, purchased0→1, score0→1, ECHO discount+1, 공급 반환, revision9→10.
- A refresh: exact player/game/turn/deadline/revision10/resources/cards/market/supply 유지.
- 1280×720, 390×844, 320×568 actual viewport 확인; document overflow 없음. 320px action buttons horizontal clipping 0. 화면의 다른 player resources/cards는 confirmed public policy대로 공개.
- YIELD/18-point terminal/fair-round/전체 exhaustion까지 자연 패 browser 장기 play-through는 하지 않았다. 자동 domain/application tests로 검증했다.

정상 Hangul/Number/GEM browser 흐름의 warn/error 로그는 비어 있었다. 의도적 Number proxy OFF에서 발생한 transport close/error 및 실패한 재시도는 장애 주입의 예상 결과이며 이를 정상 console zero와 섞지 않는다. 복구 후 reopened Number와 GEM 양쪽 warn/error 0. Physical audio 크기·OS autoplay·실기기 background 동작·screen reader를 직접 검증했다고 주장하지 않는다. Audio exact-once/ack rejection/presence behavior는 기존 자동 tests PASS.

모든 local test tabs/server/proxy는 종료했다. public Room은 생성하지 않았고 admin deletion/retention 변경도 없다.

## 5. Quality gate

| Gate | 결과 |
| --- | --- |
| Root typecheck | PASS |
| Root full tests | **두 번 연속 1,202 PASS** = shared91 / Web265 / server846; 신규19; 삭제/skip0 |
| Root build | shared dist / Web dist / server dist PASS |
| Production-serving | **6/6 PASS**: health/SPA/assets/missing asset/API/non-GET/same-origin Socket.IO/cross-origin rejection, protocol/privacy/resume, missing build fail-fast, graceful shutdown |
| Targeted new P12 raw matrix | 19/19 PASS |
| Targeted Web/session/three-game UX | 252/252 PASS (29 files) |
| Targeted platform/domain/lifecycle/persistence | 222/222 PASS (15 files) |
| git diff --check | PASS |
| npm audit --json | 2026-09-08 registry audit: **0 vulnerabilities** (all severities); package/lockfile unchanged |

Local-listener tests require the execution environment's network/listen permission. An initial sandbox EPERM was rerun with that permission and passed; no test expectation or production behavior was changed to bypass it.

## 6. Phase B — Railway gate remains pending

Public target: [Railway production](https://hanglerummikub-production.up.railway.app).

No Railway deployment/scale/config change was performed. A Git push is not evidence of deployment. The existing public tab/health response is not evidence that this release commit is running. **Latest deployed commit, deployment logs, current 1 Replica, public capabilities and three-game smoke are NOT VERIFIED in P12.** Historical P8 two-game/user confirmations do not establish the current release state.

Required user handoff:

1. Record the exact P12 checkpoint hash from the completion report. Before deployment, allow active games to finish: single-process in-memory redeploy loses active Rooms/Games/sessions.
2. Deploy Latest Commit; confirm Active deployment exact hash, successful build/start, master, **1 Replica**. Do not scale/change config as part of verification.
3. Refresh old tabs, use fresh test Rooms. Public `/health` must be 200 `{"ok":true}`, HTTPS/WSS must work, Home exactly three cards, current handshake `[2,1]` + HANGUL_TILE/NUMBER_TILE/GEM_CARD. No stale two-game bundle.
4. Independent A/B: each game create/direct join/start/action/resume. Hangul legacy V1 raw create/sync where available; Number Draw + board/mobile HUD; GEM Collect/Reserve/Purchase/tutorial/Guide. Verify H/N rack privacy and GEM future-deck privacy.
5. Public 390×844 and 320×568 simulation, console/schema/CORS/mixed-content/reconnect-loop check. Physical mobile: brief network loss, refresh, close/reopen→Home resume, manual reconnect, same identity/player count/deadline, other-browser credential rejection; Number tap/HUD/audio and GEM/Hangul reconnect.
6. Natural Number Joker opportunities: colorless R10/B10/J + K10/O10 expansion; unordered O7/J/O9/O6→O6/O7/J8/O9 without picker; free valid role-change Submit; missing/duplicate/Table-to-Rack/invalid Joker reject. Lack of a natural Joker is not a reason to add public debug state.
7. Close test Rooms through normal leave where practical; otherwise normal existing retention. No direct state deletion.

Release rollback is a prior Git/deployment **code** checkpoint (baseline `55d20ec` is retained), not an active Room backup. This P12 checkpoint changes no runtime, but any redeploy still restarts process memory. No rollback deployment rehearsal was performed on Railway.

Tag `three-game-platform-v1` is **not applicable yet**. Create/push only after exact release commit = origin/master = independently or USER_CONFIRMED deployed commit and public gates pass; never move an existing tag. P13 is not started.

## 7. Known limitations and verdict

- Single-process architecture; 1 Replica required (current Railway count unverified); no durable accounts/DB/state recovery; restart/deploy Room loss.
- Hangul remains `test-dictionary-v1` with 30 approved test words; no dictionary replacement.
- Automated + local browser PASS is not public production or actual mobile Safari/Firefox/audio verification.
- GEM original card data/assets remain unchanged; prior IP/product release-review policy remains, not a legal non-infringement conclusion.
- No source release blocker found. Physical-device/audio review and minor cosmetic preferences are separate; missing public deployment identity/replica/smoke prevents P12 COMPLETE.

**P12 SOURCE GATE PASS / RAILWAY DEPLOYMENT PENDING USER ACTION**.

## 8. Release-blocker follow-up — flexible Number rearrangement ordering

### Baseline and reproduction

- 시작 HEAD `b949463429bcc927e4b5d6a6de63749030d6d792`; clean master/origin 일치. Typecheck/build/diff-check와 **1,202/1,202** (shared91/Web265/server846) baseline PASS.
- 이후 실제 플레이에서 발견된 blocker: canonical `R2 R3 R4 R5`, rack `B2 K2`에서 `B2 → K2 → R2` 순서로 최종 `R3 R4 R5 / R2 B2 K2`를 만드는 조작이 실패했다. 최초 P12 테스트·자연 패 browser 결과는 위에 그대로 보존하며, 그 검증이 모든 hit-target 순서를 포괄했던 것으로 표현하지 않는다.
- 순수 TurnDraft에서는 A/B/C 세 순서가 수정 전부터 모두 성공했다. Destination eligibility, mobile intent, pointer drop, active meld, normalization을 조사한 결과 classification에 따른 move rejection은 없었다.
- 실제 390×844 production-mode 컴포넌트의 frozen BEFORE fixture에서 재현: B2/K2 destination은 90×70px이고 pointer-down focus로 `.number-meld-helper`가 펼쳐졌다. Flex packing이 이동하여 pointer-up 위치가 보드 빈 곳으로 해석됐고, R2가 목표 GROUP 대신 별도 세 번째 조합으로 갔다. **원인은 rule permission이 아니라 focus-dependent hit-target geometry**다.

### Minimal fix and preserved boundaries

- Production 변경은 `apps/web/src/features/number-tile/number-tile-board.css`의 도움말 표시 조건 하나다: `:focus-within` → explicit `.active`.
- 포커스가 클릭/드롭 처리 전에 목적지 layout을 바꾸지 않는다. 도움말은 기존 editor가 move/activation intent를 처리한 후 지정하는 active 조합에서 표시된다. Enter/Space/native button/focus-visible/ARIA status와 전체 조합 target을 보존한다.
- Empty/1/2-tile, incomplete/invalid intermediate draft는 기존처럼 편집 가능하다. Classification은 feedback/Submit preview이고 move permission이 아니다. 불필요한 draft/controller/domain rewrite 없음.
- Final Submit의 strict server RuleEngine, initial own-rack-only ≥30, physical IDs/conservation/contribution, forged/private ID reject, canonical Table/Joker-to-Rack 금지, stale/opponent/session lock, colorless GROUP Joker/unordered RUN/free Joker rearrangement 모두 유지한다.
- Server/shared production diff **0**; protocol/rules/GEM/Hangul/reconnect/audio/dependency 변경 **0**. Server 변경 파일은 regression test뿐이다.

### Regression and actual browser evidence

- 신규 **13 tests**: Web order/invariant tests10, focus-layout regression1, actual server Submit tests2. CSS regression은 수정 전 8/9(신규 case 실패), 수정 후 9/9 PASS. 기존 test 삭제/skip 없음.
- A `R2→B2→K2`, B `B2→K2→R2`, C `B2→R2→K2`가 동일한 normalized physical Table/payload를 생성한다. 1/2-tile/invalid destination, tap intent, drop operation, Undo/Reset, forged/private identity 및 stale/initial locks를 고정했다.
- 실제 server application fixture: 정상 final RUN/GROUP commit은 revision+1/next turn/scheduling; final B2/K2 2-tile GROUP은 INVALID_MELD이며 persisted Room와 scheduling unchanged.
- 실제 local browser **390×844의 동일 tap 좌표**에서 AFTER는 올바른 GROUP으로 이동. **320×568 Order B/C tap 및 Order A keyboard**, **1280×720 mouse drag R2→incomplete B2/K2 전체 조합** PASS. Document horizontal overflow 없음, AFTER browser warn/error 0.
- Drag 한 번이 history 한 번이며 Undo로 B2/K2 intermediate 상태 정확 복원, Reset으로 canonical RUN/Rack 복원. Intermediate 상태의 Submit 버튼은 계속 disabled.
- 격리 fixture는 실제 production-mode React Playing screen/hook/serializer/CSS를 bundle했다. 자연 패 Room이 아니라 정확한 regression 패를 제공하는 repo 밖 test harness다. UI Submit은 **변경 없는 built server RuleEngine**을 호출하여 A/B/C와 drag final Table을 승인했다. 이는 domain validation evidence이며 실제 Room/revision commit이라고 주장하지 않는다; 그 commit은 위 application tests가 검증한다. Production debug endpoint/fixture 배포 없음.
- 초기 임시 fixture의 공백 포함 nickname은 실제 schema에 거절되어 fixture에서만 수정했다. Application schema를 완화하지 않았다. Physical mobile/public Railway를 검증했다고 주장하지 않는다.

### Updated source/deployment gate

- Final typecheck/build/diff-check PASS; 전체 tests **연속 2회 1,215/1,215 PASS** = shared91 / Web276 / server848.
- Targeted Number Web74/74, Number application44/44, domain/meld/state-adapter/persistence74/74, 기존 P12 raw19/19, production-serving6/6 PASS. 기존 three-game/snapshot/cross-game/reconnect/Joker/GEM/Hangul legacy tests 유지.
- **UPDATED P12 RAILWAY DEPLOYMENT TARGET:** 이번 `fix: allow flexible number tile rearrangement` checkpoint를 포함하는 최신 `master`. 기존 `b949463` 배포는 이 blocker fix를 포함하지 않는다. 새 exact hash/push/origin 상태는 완료 보고에 기록한다.
- Railway 배포/설정 변경 및 public verification 없음. 사용자는 새 latest commit을 Deploy Latest Commit하고 Active exact hash/1 Replica를 확인한 뒤 P12 public verification을 진행한다. Redeploy 시 기존 in-memory Room/Game/session 손실, 기존 탭 refresh 필요성을 유지한다. Release tag/P13은 아직 진행하지 않는다.

**P12 SOURCE GATE PASS + NUMBER RELEASE BLOCKER FIXED / RAILWAY DEPLOYMENT PENDING USER ACTION**.

## 9. Public Railway verification — 2026-09-08

### Deployment evidence and scope

- Verified runtime: `db0e6c638835dc8164236fc3841f4f3a88db6054`, `fix: allow flexible number tile rearrangement`, GitHub `master`.
- **CODEX_VERIFIED** in Railway Dashboard Details: Active deployment `96774d76-4762-4e9a-8349-d351a376f514` links to the exact full GitHub commit above; `Deployment successful`; Number of replicas **1**. This is direct Dashboard evidence, not an inference from a healthy URL or the user's deploy action.
- URL: [public production](https://hanglerummikub-production.up.railway.app). No deployment, scaling, variables, configuration, runtime source, rules, dependency or public debug endpoint was changed by Codex.
- Deploy Logs showed `Starting Container` at 2026-09-08 15:22:31 GMT+9. The service remained Online during observation. Five independent health probes at 06:29:34–06:30:44 UTC returned **200 `{"ok":true}`**, with no observed raw transport failure. This bounded observation is not a long-term uptime guarantee.
- Public assets were byte-identical to the clean release build: `index-X9kvMjBj.js` (487521 bytes, SHA256 `8aad660dc1ec0d41fb9390c49c04d421cd5da22485533943876fcba81f3d288c`) and `index-BqbIy0-v.css` (58378 bytes, SHA256 `5ae0430ba2f6613488266d2778b212953b279a18945ba40dfca39dfa47ede4a5`).

### Public raw protocol, gameplay and security

An independent Socket.IO client used the real HTTPS/WSS endpoint and ordinary commands only: **three 2-player Rooms, 212 commands, 141 parsed broadcasts, 8,990 individual predicate/schema/privacy assertions**. These are smoke assertions, not 8,990 new repository tests. Test credentials stayed in memory and were not saved or logged.

| Game | Public results |
| --- | --- |
| Hangul legacy | Both capability fields omitted; create/join/start/Draw/resume remained flat V1 without snapshotVersion/gameType. Racks14/14, bags81/47, turn60s; consonant Draw → actor15, bags80/47, revision1 |
| Number | V2 NUMBER_TILE, racks14/14, pool78, turn90s; Draw → actor15/pool77/revision1; exact game/rack/turn/deadline restored on resume |
| GEM | V2 GEM_CARD, market9, each tier remaining deck12, basic supply7 each/PRISM5, turn45s. Natural Reserve + five Collects (basic and PRISM) + market and reserved Purchase reached revision8; refill/payment/ownership/discount/score checked, then exact resume |

- All three: same-player Lobby resume, single-primary replacement, old primary UNAUTHENTICATED, wrong/missing token and nickname-only admission rejected. Non-host and offline start rejected; join extra gameType rejected. H/N Draw replay adds no mutation; changed payload under a reused request ID rejected.
- All **20 foreign-game action cases** rejected without changing projected room/game/self/versions. Twelve existing Hangul/Number router guards return structured `INTERNAL_ERROR`; eight return capability errors. These expected wrong-game responses are not normal-flow runtime crashes. All **27 incompatible admission cases** also rejected.
- H/N: own physical rack details only, opponent rackCount only; bag/pool count only. GEM: exact public resources/reserves/purchased cards permitted; future deck IDs absent (36 initially, 34 after purchases), deck projection only tier/slots/count. No credential/storage/idempotency/scheduler/offline-streak data in snapshots.
- Six ordinary leave commands succeeded. All three raw games became FINISHED and former credentials failed resume. `roomClosed:false` reflects normal retention; Rooms were **not** administratively deleted. Public snapshot comparisons verify observable atomicity, not inspection of private canonical storage/scheduler internals.

### Public browser evidence collected

- Home in separate Chrome profiles and the in-app browser: exactly 한글 타일 게임 / 숫자 타일 게임 / 보석 카드 게임. No placeholder fourth game; invitation path remains `/room/{code}` without gameType.
- Chrome Hangul A/B: actual create/direct invitation join/host start, two players/racks14, bags81/47; B Draw → rack15/bags80/47; refresh resumes the same seat/rack with two players. 390/320 document widths stayed within viewport. Opponent UI shows counts only.
- Number in-app Web + independent raw B: actual create/start; natural R12/B12/K12 GROUP =36 initial points, **Submit succeeded** (rack14→11, revision0→1). B Draw → pool77/revision2; Web A Draw → rack12/pool76/revision3.
- At 320px, Web A placed K7/B6 into a two-tile incomplete destination, selected canonical R12, then tapped the **whole destination button**. R12 moved into the destination even though the resulting meld was invalid; Undo restored the previous two-tile state and Reset restored the canonical GROUP. Invalid final Submit remained disabled. This verifies public intermediate editing, not the exact R2/B2/K2 natural deal. That exact A/B/C case remains covered by §8 regression fixtures/tests.
- Number 390/320: fixed 80px turn HUD, one readable countdown, 40×52 public Table tiles, Rack wrapping with equal client/scroll width (339/339 at390, 269/269 at320), no document horizontal overflow. Board-centric layout, compact CSS, direct placement, whole-meld destination, sort controls and actions are deployed. The exact CSS asset equality also includes the `.active`-only helper fix, not the old `:focus-within` condition.
- Number refresh, tab close→Home `진행 중인 게임`→`다시 접속하기`: same two players, gameRevision3/turn4/deadline1788849465700, pool76, racks12/15 and one canonical meld retained. The independent companion observed only presence2→3→4→5→6, not a new player. Companion normal leave ended the game as LAST_PLAYER_STANDING.
- No natural Number Joker occurred in this browser deal. Colorless GROUP/unordered unique RUN/free role-change/conservation are preserved by the exact deployed bundle and the existing automated regressions; no public fixture/state manipulation was used to manufacture Joker cases.
- Normal Hangul app console had no app-origin errors/schema/reconnect warnings. Chrome's installed MetaMask content script emitted MaxListenersExceeded/ObjectMultiplex warnings; these are explicitly **not** reported as zero total browser warnings or hidden as application errors. Number in-app normal-flow warn/error log was empty.

### Remaining browser checks and limitations

- Native leave confirmation handling stalled the automation in Chrome and the in-app browser. Tab-scoped input timed out; no source code was changed to bypass a confirmation. The user was asked to dismiss/approve those test-only dialogs. Native Chrome inspection was also stopped when it would have read an unrelated private foreground window.
- Actual current-Web handshake frame inspection (rather than bundle/source inference), GEM tutorial/Guide/affordability/viewport UI checks, and final browser cleanup are still pending here. The raw client advertised the correct capabilities, but that is not itself proof of the browser's actual handshake. Update this subsection only after direct evidence.
- Physical phone sound loudness, notch/OS background behavior and user-device review remain manual. Keep process-memory-only, redeploy Room/Game/session loss, 1 Replica, no durable DB/accounts or cross-device recovery credential, and Hangul `test-dictionary-v1`/30 words limitations.
- No release tag created; existing `three-game-platform-v1` tag was absent. Do not claim TAG_READY or P12 COMPLETE until remaining functional verification is resolved.

### Current verdict

Final automated verification was repeated after the public-results documentation changes: root `npm run typecheck`, `npm test` (**1,215/1,215** = shared91/Web276/server848), `npm run build`, and `git diff --check` PASS. The independent same-runtime verification also passed P12 raw **19/19** and production-serving **6/6**. No new repository tests, deleted/skipped tests, runtime/rule/shared/wire/dependency changes. An initial sandbox-only localhost `listen EPERM` run failed and was rerun unchanged with the required local-listener permission; the final approved runs passed. A final additional public health probe returned 200 `{"ok":true}`.

**BLOCKED — incomplete browser verification, not an observed gameplay/server regression.** Deployment identity/1 Replica, raw three-game protocol/security/actions/resume and the browser evidence above are verified. Actual Web handshake inspection, remaining GEM UI/Guide/affordability/390/320 checks and Number desktop public inspection must continue after the test confirmation dialogs are cleared. Do not substitute raw checks or exact asset identity for those unperformed UI/network observations.

The six raw players and Number companion explicitly left. Browser Number is FINISHED; its own leave confirmation remains unresolved, so its remaining record uses normal retention. Chrome Hangul test clients also need their pending dialog/leave cleanup; no administrative deletion or retention change was attempted. No P13 or new feature work started. The public runtime target remains `db0e6c6`; this documentation-only status checkpoint does not require another runtime deployment.

## 10. Public browser verification closure

### Scope, identity and handshake evidence

- Closure baseline: `363df5a` (`docs: record three-game public verification status`), clean `master === origin/master`, 1,215 tests. This follow-up completes only the missing browser/UI checks; §9's already-passed public raw/Hangul/Number/security/deployment checks were not repeated wholesale.
- Verified deployed runtime remains **`db0e6c638835dc8164236fc3841f4f3a88db6054`**. Subsequent verification commits change documentation only; they are not claimed to be separately deployed. No runtime/shared/server/Web source, rules, tests, dependency, Railway config or deployment changed in this closure.
- **MANUAL HANDSHAKE FRAME UNOBSERVED:** available tab tooling exposes DOM/screenshots/console but no Socket.IO frame capture. Do not claim the browser auth frame was directly observed. Per the user's explicit closure criterion, functional capability is independently supported by all three pieces of evidence: (1) §9's exact deployed bundle/build equality and current client auth code advertising `supportedSnapshotVersions: [2,1]` plus `HANGUL_TILE`, `NUMBER_TILE`, `GEM_CARD`; (2) §9's public raw negotiation/admission matrix; (3) this closure's actual independent Chrome A/B GEM create/join/start and canonical gameplay through the deployed Web UI. GEM admission requires V2 and GEM support. No debug instrumentation or credential logging was added.

### Actual GEM browser UI and gameplay

- Two separate Chrome profiles, `P12GemA` / `P12GemB`, created/joined public Room `84CQG2` through Home and its direct invitation URL. Both showed the two-player GEM Lobby; Host used the existing Web start button. Neither participant was a raw client.
- Playing showed own/opponent turn, initial **00:45**, three tiers × three market slots, remaining decks12 each, public supply, own exact resources, player summary, score/target18 and **영구 할인**. Collect, card selection, Purchase, Reserve and conditional `행동 없이 턴 종료` (YIELD) controls were present. No fake Rack.
- First-time tutorial: all six actual steps—goal, resources, purchase, permanent discount, PRISM, reserve—were visited. Previous/Next and final Complete worked. B opened and skipped the tutorial; A reopened it from the Guide and also skipped. Completion/skip returned to the Lobby with `게임 방법 보기` still available.
- Guide reopened in both Lobby and Playing, with ten sections and the six-step tutorial re-entry. Playing's countdown continued **00:26 → 00:19** while the Guide was open; the guide explicitly states it does not pause the 45-second turn. Close restored the game-method button focus. No server timer/pause behavior was changed.
- Unaffordable card selection displayed **구매 불가 · 자원 부족**, the individual missing basics, required PRISM and held PRISM. Example with no holdings: EMBER2/ECHO1 cost → required PRISM3, held0, shortage3. Later DAWN1/GROVE2/EMBER1 with PRISM1 → required4/held1/shortage3. Purchase was disabled; it did not show an isolated misleading payable-PRISM estimate.
- User-facing cards, player engine and purchase calculation consistently used **영구 할인**, including `앞으로 해당 자원 비용 감소 · 소모되지 않음`; no return to a `생산 +1`-centered UI.
- **Actual browser actions succeeded:** B collected EMBER1+ECHO1; A reserved a face-up tier1 card (reserved0→1, no reward, same-tier refill); B collected EMBER1; A collected PRISM1; B selected and purchased the EMBER2/ECHO1, GROVE-discount card. Purchase preview changed to `구매 가능`; B holdings EMBER2/ECHO1→0/0, supply EMBER/ECHO→7/7, GROVE permanent discount0→1, purchased card count0→1, score stayed0 for this zero-point card, and the same tier1 slot refilled. Turn advanced to A with a fresh00:45. Tier1 deck was10 after the reserve and purchase refills.
- At320, an attempted resource click after the ordinary 45-second deadline was correctly disabled. On the next actual A turn, selecting TIDE and pressing Collect succeeded; holdings became TIDE1/PRISM1. This was normal server turn expiry, not a UI regression or a bypass.
- Console throughout GEM Lobby/Playing/tutorial/Guide/Collect/card-select/Purchase: **app-origin error/warning0**, including no React/schema/unexpected Socket.IO errors. Installed MetaMask `chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/…` emitted MaxListenersExceeded/ObjectMultiplex warnings in both Chrome profiles; these are recorded separately, not hidden or described as zero total browser warnings.

### Public responsive and Number desktop closure

| Game | 1280×720 | 390×844 | 320×568 |
| --- | --- | --- | --- |
| HANGUL_TILE | Existing local/browser gate §4 retained; no new public desktop claim | Existing public §9 PASS | Existing public §9 PASS |
| NUMBER_TILE | **Public PASS in this closure** | Existing public §9 PASS | Existing public §9 PASS |
| GEM_CARD | **Public PASS in this closure** | **Public PASS in this closure** | **Public PASS in this closure** |

- GEM desktop: market/action sidebar usable, all nine market cards present, compact player summary and scroll-reachable lower tiers; no document horizontal overflow (scrollWidth1265 ≤ viewport1280). Guide680px wide, within viewport.
- GEM390: readable two-column market flow, selectable cards, accessible Purchase/Reserve/resource actions; no clipped horizontal buttons or document overflow (375 ≤390). Guide337×780 at x19/y32 within844px; its internal scroll area had clientHeight686/scrollHeight2181 and actually scrolled to scrollTop1495.
- GEM320: readable single-column market cards (277px wide; card button font16px), usable resource grid and actual Collect, scroll-reachable actions, no horizontal button clipping or document overflow (305 ≤320). Guide267×544 within568px; tutorial Previous/Next/Skip controls remained within the viewport. Vertical scrolling is expected, not horizontal overflow.
- Number desktop used a fresh public Web Room `332A2S`, in-app browser A plus independent Chrome B. Start/one B Draw provided A's normal active turn. **1280×720** showed the central board, compact meld groups, rack tray, desktop Rack tiles **56×68** and Table tiles **48×60**, document width1265 ≤1280. No old giant meld cards.
- Actual mouse clicks placed R6/B6 into one incomplete local meld. Mouse drag moved B12 from Rack into board whitespace and created a second active meld. Undo removed exactly that drag-created meld; Reset restored empty canonical Table and all14 Rack tiles. No server Submit or rule change was needed for this visual closure; existing Submit/regression evidence remains in §§8–9. Number normal-flow in-app warn/error log was empty.

### Error taxonomy, cleanup and final release status

- The twelve §9 structured `INTERNAL_ERROR` responses were fail-closed **wrong-game error taxonomy**, not observed crashes/state corruption: Hangul's three turn actions against Number/GEM (6) and Number's three actions against Hangul/GEM (6) reject before service delegation. Existing P12 tests preserve Room/revision/timer/scheduler/binding/presence/idempotency. Error-code specificity is a post-release review candidate, not a release blocker; no error-code redesign performed.
- No confirmation bypass was installed. Fresh independent browser tabs resolved the earlier verification obstruction. A later GEM test leave confirm again stalled the tool; normal confirmation/explicit-tab-close was attempted, not replaced with `window.confirm` hacks. Number test tabs were explicitly closed and their temporary viewport reset. Any remaining GEM test tab/record is disposable and uses existing disconnect/timeout/retention; no production state was administratively deleted. This tooling/cleanup limitation does not invalidate the completed gameplay/UI observations.
- Known limitations from §9 remain: process-memory only; redeploy loses active Rooms/Games/sessions; exactly1 replica required; no durable DB/accounts/cross-device recovery credential; Hangul test dictionary30 words; physical speaker volume/notch/OS-device experience remains manual. These experiential checks are not functional blockers under the user's closure criteria.
- Final automated sanity after these documentation changes: root typecheck **PASS**, full tests **1,215/1,215 PASS** (shared91/Web276/server848; fail/cancel/skip/todo0), build **PASS**, `git diff --check` **PASS**. Build retained the exact §9 asset filenames. An initial sandbox-only localhost `listen EPERM` run was repeated unchanged with approved local-listener permission and passed. No tests were added, deleted or skipped.
- **RUNTIME_TAG_READY: `three-game-platform-v1`, target `db0e6c638835dc8164236fc3841f4f3a88db6054`.** The tag was checked absent and was not created/moved/pushed. A docs-only checkpoint ahead of the runtime does not require another Railway redeploy for this runtime tag. No Railway deployment was performed.

**P12 COMPLETE / THREE-GAME PLATFORM V1 VERIFIED.** All required functional/public browser gates are satisfied using the explicitly permitted handshake-evidence fallback; no production functional regression remains. P13 is the next review stage only and has not started.

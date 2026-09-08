# P12 — Three-game platform release gate

> 2026-09-08 · **P12 SOURCE GATE PASS / RAILWAY DEPLOYMENT PENDING USER ACTION**
> Phase A (source/local runtime)와 Phase B (latest public deployment)를 분리한다. 아직 `P12 COMPLETE` 또는 `THREE-GAME PLATFORM V1 VERIFIED`가 아니다.

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

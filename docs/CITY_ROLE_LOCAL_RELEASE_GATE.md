# CITY_ROLE — P16 local release source gate

## Scope, checkpoints and authority

2026-09-08 local verification. This is **P16 SOURCE/LOCAL GATE PASS**, not Railway/public verification or a new release tag.

| Checkpoint | Commit | Automated baseline |
| --- | --- | --- |
| P15A pure domain | `3be5f1a344fa0bd86b2cfcc9724455556928cb2e` | 1,328: shared91 / Web283 / server954 |
| P15B server/shared | `a5e91dd58d5142641b6a2160274871afdac97ddd` | 1,403: shared108 / Web285 / server1,010 |
| P15C Web | `16df1d6ea818f9f86f3bbc8b700acd2b1da0c6f2` | 1,465: shared108 / Web346 / server1,011 |
| P16 source/local gate | Commit containing this document, `test: complete city role local release gate` | 1,492: shared108 / Web348 / server1,036 |

The final P16 commit, not the earlier P15C HEAD, is the user-playtest source target. Its only production change from P15C is the selection-complete waiting copy described below. The final SHA is reported after commit; no self-referential SHA is embedded here. The historical `three-game-platform-v1` remains on `db0e6c638835dc8164236fc3841f4f3a88db6054`.

CITY-001–070, E01–03, CLASSIC_REFERENCE_VERIFIED, original60-card data, rules/roles/cardset versions and the P15A domain are unchanged. No fourth-phase follow-on, new mechanic, generic framework, dependency, debug endpoint, Railway setting or deployment is introduced.

## Player and full-game matrix

`apps/server/src/city-role-full-game.integration.test.ts` starts real application games using injected deterministic RNG, then runs legal commands to FINISHED through the actual mutation lane/UoW/CAS, concrete adapter, viewer projector and in-process scheduler. The bot reads actor projections; it does not replace state after setup. Optional abilities are covered separately rather than folded into its completion strategy.

| Players | Roles per player | Application coverage | Result |
| ---: | ---: | --- | --- |
| 2 | 2 | Start → 5 rounds → 82 accepted actions → 166 viewer checks | CITY_COMPLETION_ROUND_END; final cities7/8 |
| 3 | 2 | Six secret picks → six role actions → round2; all-role/lifecycle scenarios | PASS; pure-domain full-game regression also retained |
| 4 | 1 | Start → 9 rounds → 149 accepted actions → 600 viewer checks | CITY_COMPLETION_ROUND_END; cities8/7/8/8 |
| 5 | 1 | Five secret picks → five role actions → round2 | PASS; pure-domain full-game regression also retained |
| 6 | 1 | Start → 9 rounds → 213 accepted actions → 1,284 viewer checks | CITY_COMPLETION_ROUND_END; cities7/8/6/6/7/8 |

Every accepted full-game step checks60-card conservation, immutable seats, validated persisted round-trip, per-viewer privacy and exactly one scheduled window (zero after finish), with no overall deadline. Initial concurrent duplicate requests commit once; replay and stale terminal callbacks do not mutate state. Final VP, first4/other2 completion bonus,5-category3 bonus, competition ranks and shared winners are independently checked.

Maximum observed full-game serialized viewer sizes:2-player5,238B;4-player9,008B;6-player12,616B. These are bounded fixture sanity observations, not load/performance guarantees or new wire limits. Six-client raw snapshots also stay below a test-only25KB guard. No scheduler growth or browser rendering loop was observed.

## Roles, lifecycle and terminal results

`city-role-local-lifecycle.integration.test.ts` adds16 actual application/persistence/projection/scheduler cases. Boundary fixtures seed valid private state only inside isolated test persistence; the commands being checked use production services. No production browser state injection is used.

| Area | Evidence |
| --- | --- |
| CR01 | Actor-private disable mark, skipped role, disclosure only at approved round rollover; actual browser mark submission |
| CR02 | Private role target; normal-reveal gold transfer precedes CR04 category income; actual browser transfer |
| CR03 | E03 zero-card rejection leaves state/revision/entropy/deadline unchanged; existing swap/replacement regressions; actual browser whole-hand exchange |
| CR04/05/06/08 | Entry category income once, leadership/protection/additional acquisition income, role-local action budget; actual browser entry/controls |
| CR07 | Two private entry cards without pending choice, three-build budget, no opponent card leakage; browser display verified |
| CR08 destruction | Existing application/raw legality/cost/discard/privacy regressions; actual browser public building destruction accepted |
| E01 leave | Outgoing unresolved marks cancelled; gold/hand/pending cleanup, frozen city, private role tombstones, session removal and leader fallback |
| E02 | Current consequence/end → terminal check → offline-third forfeit if still playing → next entry/round;4→3 changes next-round quota to2 |
| Offline | Actual selection timeout1 → selection timeout2 → role-action timeout3, then forfeit; connected defaults and verified resume-reset regressions retained |
| Pending | Timeout keeps first/rest bottom; others see no candidates; explicit-leave cleanup and survivor-finished private pending conservation |
| Finish | Normal completion and LAST_PLAYER_STANDING through application; NO_ELIGIBLE_PLAYERS approved batch-domain terminal through concrete persistence/projector, no invented batch client command |

Terminal snapshots remove the active window; stale application actions/timeouts reject or no-op. Scoring-before-third-timeout-forfeit precedence and zero-winner terminal projection are explicit tests. Forty-five-second selection and90-second action deadlines are unchanged within a window, including choice/build/ability/retry/resume.

## Network privacy, security and isolation

`city-role-local-security.integration.test.ts` adds6 raw real Socket.IO tests. All seven CITY commands are sent to each H/N/G game (21 cases); all ten H/N/G commands are sent to CITY (10 cases). These31 requests are schema-valid wrong-game probes, not malformed-payload shortcuts. Each rejects without changing canonical/persisted state, revisions, deadlines, scheduler operations, presence, bindings or idempotency records. The earlier P12 three-game matrix remains intact.

Six actual connected viewers are checked across secret draft, pending draw and both interference marks. Own hand/roles/marks are exact, opponents' hands count-only, options chooser-only, pending cards owner-only. Hidden removal, unselected roles, future deck IDs/order, RNG, offline streak, credentials, storage and request internals are absent from frames. Real fan-out packets identify the correct viewer. Success ACKs remain minimal commit receipts, not stale private snapshots.

Wrong/missing token and nickname-only takeover fail closed. Primary replacement restores the same player and exact private choice/deadline with six seats, invalidates the old connection, and does not duplicate players. Existing capability/V1/unsupported-client and seventh-player rejection tests remain. CITY capacity6 does not expand the other games' capacity4.

## Actual local production browser evidence

The built application was served by the local production server at loopback4318, never Vite. Two Chrome profiles exercised the full P15C entry/action flow recorded in [Web implementation](./CITY_ROLE_WEB_IMPLEMENTATION.md). Six isolated loopback-port origins4319–4324 were byte-for-byte TCP relays into that same server, allowing six separate saved credentials. These are temporary test harness processes, not application endpoints or source changes. Public Railway tabs were not used.

- Actual Home4 → CITY create/join/Lobby/start,2-player two-role draft and6-player one-role draft; chooser-only roles and own-only hand display.
- Acquisition, pending choose, build, public city/score/gold updates, role-specific abilities, end turn and next round accepted through the deployed local Web controls. No optimistic canonical mutation or production state manipulation.
- Six-player reconnect in **ROLE_SELECTION**, **PENDING_CHOICE**, and **ROLE_ACTION**: refresh, close/reopen tab → Home saved-game entry → manual resume all restored the same seat, exact private role/hand/candidates and six participants. Observed countdown continued decreasing rather than resetting. Pending candidates remained identical across both tab resume and refresh.
- Seven tutorial steps, completion, Playing Guide reopen, internal scroll, Escape/focus restoration; selection/acquisition/construction/8-building/scoring guidance inspected. Help did not stop the server timer.
- Six-viewer console audit:0 uncaught app/React/schema/unexpected Socket.IO errors. Existing wallet-extension warnings were separated from application logs. Deliberate disconnect transport observations are not counted as application faults.

| Actual viewport | Local UI result |
| --- | --- |
|1280×720|Six public cities, role/private summary/action panels readable; no document horizontal overflow|
|1440×900|P15C desktop action/Guide inspection retained; no overflow|
|768×1024|Public cities/role choices usable; no horizontal overflow|
|390×844|Tap-first controls and persistent phase/timer readable; no overflow or clipped actions|
|320×568|Wrapping cards/cities, readable controls, no overflow; Guide fits296×544 and scrolls internally|

Visible controls measured at least44px in the four final P16 target viewports. Each player can distinguish public city information from their private role/hand and see whether it is their choice/action. User taste, physical speaker loudness, phone browser chrome/notch and real-device long-session experience remain manual, not claimed as automated results.

One extra, non-required browser leave-to-Finished visual attempt encountered a Chrome automation confirmation/CDP timeout. Other connected viewers and the server continued normally; no game-rule change, confirm override or browser security workaround was made. This extra visual attempt is **not claimed as PASS**. Leave/Finished behavior is verified by application/raw/projector and Web component tests; all required actual browser entry/action/reconnect/responsive flows above completed before this tool limitation.

## Small P16 usability correction

The six-player UI said “내 선택0개 남음” but still described a future selection turn after that player's only role was selected. `CityRolePlayingScreen.tsx` now displays “이번 라운드의 역할 선택을 마쳤습니다. 다른 참가자의 선택을 기다려주세요.” only when the existing derived remaining count is0. No command, privacy, timing or selection semantics changed. Two additive UI tests distinguish a completed6-player pick from a3-player participant still awaiting their second role. The updated built browser text was checked.

P16 production diff: one CITY Web wording branch. Server/shared production diff0; P15A domain/HNG-specific source/package manifests/lockfile diff0. Other P16 additions are three integration-test files, two tests in the existing CITY UI suite, and this document. No existing test is removed or skipped.

## Final verification and handoff

- Root `npm run typecheck`: PASS.
- Root `npm test`: **1,492/1,492 PASS twice consecutively**, shared108 / Web348 / server1,036; fail/skip/cancel/todo0. P16 adds27 tests (server25 / Web2); total growth from unattended baseline1,328 is164.
- Root `npm run build`: PASS; four-game entry chunk warning over500KB remains visible (about551KB,154KB gzip). No unrelated code-splitting change or warning suppression.
- Separate CITY application/domain/entropy/persistence/projector/socket/full-game/lifecycle/security plus serving/P12 raw: **210/210 PASS**. CITY Web, saved-session, release UI and Number/GEM interaction/audio targeted regression: **117/117 PASS**.
- Production-serving **7/7**, including actual built four-game SPA/CITY socket path; existing P12 raw release **19/19**: PASS.
- `git diff --check`: PASS. Phase checkpoints use normal master push only; release tag is unchanged.

Known platform limits remain: process-memory only; restart/redeploy loses rooms/games/sessions; one replica required; no durable accounts/DB or cross-device credential recovery; existing Hangul limited dictionary unchanged. Public/commercial IP review and original asset provenance policy remain separate gates.

**P15A COMPLETE · P15B COMPLETE · P15C COMPLETE · P16 SOURCE/LOCAL GATE PASS.**

**CITY_ROLE READY FOR USER PLAYTEST.** Railway **NOT DEPLOYED**; public CITY verification is pending the user's return. No user rule decision is outstanding, no new tag is created, and P17/fifth-game work is not started.

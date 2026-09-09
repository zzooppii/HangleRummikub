# CITY_ROLE Landmark v2 — implementation / local verification

## Baseline / scope

Starting HEAD `126cdf3 feat: redesign city role gameplay ui`. Initial tracked tree clean, master/origin equal; the untracked Landmark proposal was the expected preceding design artifact. Baseline **1498 PASS** (shared108/Web354/server1036), typecheck/build PASS. Only CITY implementation, CITY tests and CITY documentation changed. HANGUL/NUMBER/GEM source, dependencies, generic transport/event names, release tag and Railway deployment unchanged.

Approved decisions: [gate §18](./CITY_ROLE_LANDMARK_EXPANSION_GATE.md#18-사용자-최종-승인-및-구현). Canonical [rules v2](./CITY_ROLE_GAME_RULES_V2.md) and [cardset v2](./CITY_ROLE_CARDSET_V2.md) preserve the previous v1 history rather than reinterpret it silently.

## Implementation map

| Area | Files / responsibility |
| --- | --- |
| Domain | `domain/landmarks-v2.ts`: concrete history, discount, final scoring; `rule-engine.ts`: atomic build/reward, destroy cost/cleanup, forfeit cleanup; `game-state.ts`, `state-validator.ts`: strict version/history, clone, conservation |
| Result | `result-engine.ts`: v2 diversity and landmarkBonus; old v1 shape/behavior preserved |
| Start / persistence | `city-role-start-service.ts` explicitly starts v2; existing concrete adapter delegates to the updated clone/validator, no adapter rewrite |
| Projection | `city-role-v2-game-projector.ts` public whitelist; shared `v2-projection-contracts.ts` strict paired versions/history/result validation |
| Web | `city-landmarks.ts`, `city-role-ui.ts`, Playing/Finished/Help/Visuals and CITY-scoped CSS: ability text, paid cost, destruction estimate, public remaining/used state, v2-only Guide/Tutorial |
| Tests | `city-landmark-v2.test.ts`, `city-landmark-balance.test.ts`, CITY server integration/full-game, shared contract and Web UI tests |

No generic effect engine, new command or pending-choice kind. Server owns every effect and history. A new public CITY branch field does not imply visibility of private hands/roles/targets/deck. Old Web bundles require refresh for the new version; coordinate server/Web deployment later. Production defaults to v2 explicitly; old pure-factory fixtures retain v1 default and cannot gain v2 effects merely from the same templateId.

## Automated correctness

Normal/edge coverage includes full prepayment and failed build atomicity; first-build garden/sundial rewards; cross-copy rebuild anti-farm; empty deck/discard and reshuffle boundaries; entropy failure; physical card conservation; CR-08 extra cost/insufficient funds/CR-05/completed-city protection; staircase ordinary-only/minimum1/round1/lifetime3/CR-07/failed build; actual destroy→later role→rebuild without recharge; forfeit cleanup; 0–4 actual categories and forfeited scoring; moon/seventh synergy, competition ties and income exclusion; persistence clone/round-trip; strict v1/v2 mismatch rejection; concurrent/replayed server requests (one revision/reward); snapshot privacy; version-aware Web help/preview/reconnect display.

Final **1533/1533 PASS**: shared **110**, Web **358**, server **1065**; **35 additive tests**, baseline tests retained with no skips. Two consecutive final full runs passed. Root `npm run typecheck`, `npm run build`, `git diff --check` passed. Full suite includes reconnect, previous games, P12/P16 and production-serving regressions.

An additional full run exposed a legacy raw Socket test assumption under a natural shuffled garden draw: it expected only printed-cost subtraction, ignoring the approved refund (actual4 vs expected3). The test now independently accounts for v2 first-build refund and qualifying staircase discount; no production behavior or assertion strictness was weakened. Full gates were rerun after that test correction.

Build bundle **568.00kB / gzip159.90kB**, baseline **561.01kB / gzip157.81kB**: +6.99kB (+2.09kB gzip). Existing >500kB warning remains; no dependency or image package added.

## Deterministic balance smoke

`city-landmark-balance.test.ts`: seeds1701–1708, 2/4/6 players, each seed run against pinned v1 and v2: **48 completed games**. Same initial inventory; legal bot actions include basic acquisition, builds, bounded optional CR-08 attacks and role draft. Strategies mix cheap construction and Landmark priority; not human/optimal play and not a representative balance sample. Optional CR-01/02/03 strategy space is not explored. All games finished within 100 rounds/3000 commands, with conservation and budget checks; largest observed command count220.

Means per game unless specified:

| Players / version | End round | Winner score | Landmark builds | Activations 01/02/03/04/05/06 | Stair discounts | Diversity frequency¹ | Seventh bonus² |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| 2 / v1 | 4.750 | 28.250 | 2.000 | 0/0/0/0/0/0 | 0 | .438 | 0 |
| 2 / v2 | 4.750 | 30.000 | 2.000 | .250/.375/0/.750/.375/.250 | .750 | .500 | 4.000 |
| 4 / v1 | 8.250 | 25.250 | 4.250 | 0/0/0/0/0/0 | 0 | .344 | 0 |
| 4 / v2 | 7.375 | 24.000 | 4.625 | 1.250/1.125/0/.875/.250/.500 | .875 | .438 | 2.750 |
| 6 / v1 | 7.625 | 23.875 | 6.250 | 0/0/0/0/0/0 | 0 | .208 | 0 |
| 6 / v2 | 7.375 | 24.750 | 7.250 | 1.625/1.250/0/1.750/.500/.875 | 1.750 | .375 | 2.857 |

¹ Fraction of all players receiving diversity+3. ² Mean per finishing owner of CB-LAN-06 (not across every player).

01/02 count consumed first-build opportunities, 03 counts successful extra-cost destruction, 04 actual discounts, 05 diversity awards requiring the virtual category, 06 owners with positive special bonus. **03 was not exercised by the sampled bot games**; direct domain tests verify that interaction. No observed infinite loop/runaway, but this does not prove no optimal auto-win strategy. Garden's net-zero gold cost after prepayment, early staircase and moon/seventh synergy remain meaningful manual playtest watch points. No unapproved balancing adjustment was made.

## Actual local production browser smoke

Unmodified `npm start`, `http://127.0.0.1:4318`, two separate Chrome profiles; ordinary create/join/start and natural shuffled hands. No fixture, hidden state injection or debug endpoint.

- B naturally held 작은해시계; acquired gold2 (total4), selected and built through bottom dock: gold4→2, city0→1, hand4→4 (built card replaced by automatically drawn 등불초소). No new choice modal. A saw only B's public city and hand count.
- B refresh restored same player, built sundial, gold and exact own hand without a second reward. Public `최초 건설 보상 사용 완료` verified. While inspecting Guide, normal 90-second timeout advanced the role; Guide did not pause the server timer.
- A naturally held 일곱길기념뜰 and built it on CR-06: gold7→2, hand4→3, city0→1. End-game bonus is covered by automated domain/shared result tests, not claimed as browser-finished gameplay.
- V2 Guide showed all six effects, stone exception and final scoring; seven-step tutorial's revised Landmark step and completion worked. Other four Landmark activations were covered automatically, not falsely claimed as six naturally drawn browser encounters.

| Viewport | Evidence |
| --- | --- |
| 1280×720 | Illustrated city/hand, ability region and bottom dock readable; document scrollWidth1265 = clientWidth1265 (scrollbar excluded) |
| 390×844 | Compact ability cards, reachable dock; scrollWidth375 = clientWidth375 |
| 320×568 | Ability text and actions readable, no document overflow; scrollWidth305 = clientWidth305; Guide dialog width296 with internal vertical scroll and accessible controls |

Screenshots captured and visually inspected through browser tooling. App uncaught errors, React/schema warnings and unexpected Socket.IO errors: **0** during gameplay/refresh/Guide checks. Existing MetaMask extension `MaxListeners` / `ObjectMultiplex` warnings were separated from app diagnostics. After checks, automating test-room leave/confirm and subsequent tab cleanup timed out; no production code or `window.confirm` hack was used. This post-verification automation limitation is not reported as a successful leave UI test.

## Release boundary

**CITY_ROLE LANDMARK V2 COMPLETE** source/local scope after quality gates. Railway **NOT DEPLOYED**. No public runtime/tag identity claim for this change. User-controlled deployment and subsequent playtesting remain separate; no automatic next phase.

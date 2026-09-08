# CITY_ROLE — P15C Web gameplay

## Boundary and baseline

P15B checkpoint `a5e91dd58d5142641b6a2160274871afdac97ddd` was committed/pushed with clean master/origin and **1,403 tests** (shared108 / Web285 / server1,010). This phase activates the fourth concrete Web game only after that checkpoint. CITY-001–070, E01–03, original60-card data and the P15A/P15B canonical behavior are unchanged.

The browser advertises `[2,1]` and HANGUL_TILE / NUMBER_TILE / GEM_CARD / CITY_ROLE. Home adds **비밀 도시 게임**. CITY has its own strict V2 decode/routing and Playing/Finished screens, never a fake Rack, generic TurnDraft or generic renderer. CITY Lobby supports2–6; existing games remain2–4.

## Private state and commands

The screen uses only its viewer snapshot: own hand/selected roles/marks, chooser-only available roles and owner-only pending cards. Opponents have public gold, hand count, city and already-authorized role reveals. No DOM attribute or client preference stores hidden ownership, deck order, credentials or scheduler internals.

Seven closed CITY actions preserve gameId/actionId/gameRevision/requestId. UI selections are local intentions, not authoritative game state. Commands are detached for retry; a minimal commit receipt is followed by a fresh viewer snapshot. Revision growth alone is not treated as proof that a request succeeded. Lost ACK retries reuse the same request, including when its result moved the screen to Finished. Rejections do not create success feedback or optimistic gold/hand/build mutations.

Same-browser platform reconnect is reused without nickname takeover. Resume restores selection/role/pending/window/deadline from authority. Game navigation/session replacement clears stale local selections and blocks late ACKs; presence-only updates do not generate a new action identity.

## Gameplay presentation

- A round/role/actor HUD shows45-second selection or90-second role action, a large MM:SS countdown and restrained last10seconds warning. Time is display-only and Guide never pauses authority.
- Secret selection explains2/3-player two-role ownership and shows only allowed available choices. Public removal and revealed roles remain distinct from private selected roles.
- Public cities are separated from my hand/gold/roles. Gold2 or draw/choose is explicit; pending candidates must be resolved before further actions.
- Role-specific controls cover private higher-role targeting, whole-hand exchange, own-card replacement with at least1card, mandatory entry bonuses, up-to3builds and public eligible destruction targets. UI previews are advisory; server validation remains final.
- Physical card identity is preserved for selection, construction, pending choice and destruction. Duplicate-template restriction, gold shortage, build budget and first8-building/final-round guidance are visible.
- Finished uses CITY result components and competition ranking without revealing other private hands or hidden history.

## Learning, audio and accessibility

An original seven-step tutorial and reopenable Guide cover goals, rounds, secret roles, acquisition, building, abilities and scoring. Completion preference is separate from sessions. Native modal focus behavior, keyboard controls and internally scrolling mobile content are used; no official assets or copied rulebook wording.

CITY-only optional Web Audio cues distinguish my pick/my role, accepted construction and round completion. Preference/gesture unlock and exact-once identity tracking cannot affect gameplay. Muted, unavailable or restricted audio leaves visual status usable.

Responsive targets:1280×720,1440×900,768×1024,390×844,320×568. Mobile remains tap-first with44px controls and no forced horizontal document scroll. Existing Number HUD/tap/drag/audio, GEM Guide and Hangul UI are not redesigned.

## Verification

P15C source/local browser gate **COMPLETE** (2026-09-08). Final automated totals: **1,465 PASS** (shared108 / Web346 / server1,011), with62 new tests over P15B and no deletion/skip. Root typecheck, full test, build and diff-check pass. Relevant CITY Web tests: actions8 / guide8 / sound9 / UI30, plus6 routing/catalog/admission tests. Production-serving is7/7 including a new real-server four-game-capability CITY scenario; the existing P12 raw19/19 remains intact.

Actual built Web was served by the local production server, not Vite or injected state. Two independent Chrome profiles completed Home/create/join/start, two-role sequential selection, card acquisition/pending choice, refresh with identical pending cards, choice acceptance, construction, CR03 whole-hand exchange, CR04 leadership, CR05 protection, CR06 bonus, CR07 extra draw/build-budget presentation, CR02 secret mark/gold transfer, CR08 public destruction and next-round selection. A six-player room was created/joined/started using six isolated loopback-port origins relayed byte-for-byte to the **same** local process; no debug endpoint or canonical state mutation was used. Only the active chooser saw available role choices, each player owned one role, and CR01 private targeting was accepted from the actual screen. Original two-player refresh and new-round refresh preserved the existing seat, own hand and authoritative countdown.

| Viewport | Actual browser result |
| --- | --- |
|1280×720|Desktop role-action layout readable; no document horizontal overflow|
|1440×900|HUD/action/private summary/public cities usable; no overflow|
|768×1024|Three-column role choices fit; private/public sections readable|
|390×844|Tap-first role grid, sticky HUD, all visible buttons at least44px; no overflow|
|320×568|Cards and controls wrap; no overflow; Guide fits296×544 with444px internal scroll area and Escape/focus restoration|

Tutorial seven steps, completion and Playing Guide reopen were exercised. App console errors/React/schema/unexpected Socket.IO warnings:0. Existing wallet-extension content-script warnings are unrelated and were separately observed. Local extra IP/hostname navigation was unreliable, so six-origin testing used loopback TCP ports without modifying application code. Vite reports the now-four-game entry chunk over500kB (about551kB,154kB gzip); build passes, and no unrelated bundler refactor or warning suppression was introduced. Physical speaker loudness and final user preference review remain manual. No Railway deployment or release-tag movement occurred.

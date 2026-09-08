# CITY_ROLE illustrated visual / UX polish

## Scope and reference

- Starting checkpoint: `9354b46` (`test: complete city role local release gate`). Baseline: 1,492 tests (shared 108 / Web 348 / server 1,036).
- Primary visual reference: the user's illustrated mockup supplied on 2026-09-08, `ChatGPT Image 2026년 9월 8일 오후 09_52_29.png`. It informs hierarchy, parchment, illustrated cards, city areas and the bottom action dock, not gameplay rules or pixel-exact artwork.
- The previous CITY components and P16 tests establish existing functionality. No unprovided BEFORE screenshot is claimed as inspected.
- Presentation only: CITY decisions, E01–03, cardset, server/domain, shared/wire, privacy, persistence, reconnect and audio behavior are unchanged. No dependency, other-game screen or common CSS change. No Railway deployment.

## Information architecture

1. Compact skyline header with existing room, connection, help, sound and leave controls.
2. Parchment turn banner: round, current role/player, large MM:SS and a display-only 45/90-second progress indicator.
3. Private role medallions, role count and own gold/hand summary.
4. Visual acquisition choices, compact completed acquisition state, role ability choices and construction guidance; category guide alongside on desktop and collapsible on smaller screens.
5. Public city boards with current/self emphasis, public statistics, empty skyline and illustrated constructed cards. Five or more buildings use the denser grid.
6. Illustrated hand cards with physical-card selection, cost/VP and the existing affordability/legality preview.
7. Fixed bottom dock with own inventory, disabled reason, contextual construction and the primary **역할 차례 마치기** action. There is no second end-turn button in the body. It remains hidden outside the viewer's role action, disabled during incomplete acquisition/pending/locked states, and dispatches the existing command.

The existing seven tutorial steps and detailed guide retain their rules and focus behavior, with shared visual samples and a full role/category legend. The category disclosure uses native `details` state (desktop initially expanded, smaller breakpoints collapsed); the viewport listener is presentation-only and removed on unmount.

## Original art and truthful category language

`apps/web/src/features/city-role/CityVisuals.tsx` contains reusable, original vector artwork: five category scenes, eight distinct role glyphs, skyline, coin/card/build/hourglass/check icons. No official artwork, copied card image, external image URL, icon library, raster dependency or generated bitmap is used. Category artwork is deliberately shared by category rather than pretending to be 60 unique paintings. Card IDs, templates, names and values remain authoritative data.

| Category | Visual identity | Actual rule described |
| --- | --- | --- |
| 교역 / TRADE | Gold market awning and crates | 장터지기 starts with one gold per existing own TRADE building |
| 시정 / CIVIC | Blue civic dome and columns | 길잡이 starts with one gold per existing own CIVIC building |
| 문화 / CULTURE | Purple theater and curtains | 수호꾼 starts with one gold per existing own CULTURE building |
| 명소 / LANDMARK | Green fountain and garden | One of the five categories needed for diversity; no intrinsic ability or income |
| 수비 / GUARD | Red gate and towers | 해체꾼 starts with one gold per existing own GUARD building; the category does not protect buildings |

Authority: `CITY_ROLE_GAME_RULES.md` role table, entry income timing and scoring; `CITY_ROLE_CARDSET_V1.md` approved original deck. The mockup's implied CULTURE high-score advantage, LANDMARK extra ability and GUARD protection were not copied. All categories have the same average printed VP of 3, though cost distributions differ. General diversity guidance is +3 for five categories; forfeiture exclusions remain in the detailed guide and server rules. No special building abilities were introduced.

Role glyphs, in approved order: mask / coins / exchange arrows / compass / shield / market / blueprint / hammer. Approved role names remain 가림꾼, 징수꾼, 교환꾼, 길잡이, 수호꾼, 장터지기, 설계꾼, 해체꾼.

## Local browser verification

Two complementary production-mode checks were used; they must not be conflated:

- **Actual application and unchanged local server, port 4318:** two browser participants created/joined/started CITY, completed sequential two-role picks, acquired gold, selected a hand card, built through the new dock, exchanged hands with CR-03, and ended a role through the dock. Canonical city/gold/hand changes and next-role transition were observed. The 0-card replacement action remained disabled. A later draw/choose pending state survived browser refresh with the same player, same options and continuing deadline; the other player's UI did not expose these private choices. Selection and hand controls were ordinary UI operations, not injected server state.
- **Isolated temporary production-mode visual fixture, port 4319:** the actual CITY component and CSS rendered schema-validated snapshots for role selection, before/after acquisition, pending draw, CR-03 controls, five-card hand, empty city, four-building city and eight-building city. The eight-building coverage is a visual fixture, not a claim of naturally finishing eight buildings in the live room. This temporary harness has no production debug endpoint and is not part of the repository or shipped bundle.

| Viewport | Result |
| --- | --- |
| 1280×720 | Desktop action/category columns, illustrated role/hand/city cards, visible bottom dock; no document horizontal overflow |
| 768×1024 | Stacked action layout, readable role choices, collapsed category guide and reachable dock; no document horizontal overflow |
| 390×844 | Sticky turn HUD, collapsed categories, wrapped hand/cities, bottom-safe-area dock; no document horizontal overflow; visible buttons at least 44px high |
| 320×568 | Hand selection/build callback, readable cards, large end action and reachable content; no document horizontal overflow; visible buttons at least 44px high |

Screenshots were captured and visually inspected in the task for selection, acquisition, ability, cities and mobile states. At 320px the native guide measured 296×544 within the viewport, with its content internally scrollable; tutorial next/previous/skip and all seven steps through completion were exercised. Existing keyboard focus/native modal behavior remains. Color is always accompanied by icon/text. Reduced-motion disables card lift/transition. Physical phone safe-area and speaker perception remain user review items, not claimed as hardware-tested.

Actual application console: no uncaught app errors, React warnings or schema warnings observed. Browser extension warnings (MetaMask content script listener/orphan-stream warnings) were separately identified as extension-origin, not app failures. Temporary fixture setup errors were corrected before visual validation; they are not attributed to production.

## Regression and verification

- Six additive Web tests: dock-only placement; action/session/pending guards; five original category scenes and accurate hints; eight role identities; empty/four/eight public city cards; responsive/touch/safe-area/reduced-motion CSS scope.
- Existing end-turn assertions were updated only to account for the decorative SVG inside the button; disabled-state and text assertions remain. No test was deleted or skipped.
- Final total: **1,498/1,498 PASS** (shared 108 / Web 354 / server 1,036), zero skipped. Existing CITY privacy, reconnect, rules, tutorial, sound and P16 tests, plus H/N/G regressions, pass in the full gate.
- Root typecheck, full test, build and `git diff --check`: PASS. Existing and CITY production-serving tests also pass in a separate targeted run. The first sandboxed full test could not bind local loopback sockets (`listen EPERM`); rerunning with local-listen permission passed. No assertions or source were changed to bypass those failures.
- Existing >500kB Vite warning remains. Before: JS 551.08kB / gzip 153.58kB, CSS 70.58kB. After: JS 561.01kB / gzip 157.81kB, CSS 81.71kB / gzip 17.06kB. JS increased 9.93kB (1.8%). Small vector assets avoid large image packages; no code-splitting/refactor scope was added solely to remove the pre-existing warning.

## Release handling

Checkpoint message: `feat: redesign city role gameplay ui`. Normal push only. Historical `three-game-platform-v1` tag remains at `db0e6c638835dc8164236fc3841f4f3a88db6054`.

**Railway: NOT DEPLOYED.** This is local source/visual verification. The user reviews screenshots before deciding deployment. No subsequent phase is started automatically.

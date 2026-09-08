# NUMBER_TILE MOBILE UX POLISH

Status: **SOURCE COMPLETE / MANUAL MOBILE VERIFICATION PENDING**.
Deployment: **DEPLOYMENT_PENDING_USER_ACTION**. No Railway deployment/configuration change.

## Baseline and scope

- Baseline: `92ff6ce feat: improve gem card onboarding`; clean `master === origin/master`.
- Baseline gates: typecheck, build and **1157/1157** tests (shared 91 / Web 239 / server 827).
- Number Web interaction/presentation/audio only. GEM gameplay/onboarding/tutorial, Hangul, server/shared, rules, protocol, package manifests and lockfile are unchanged. P12 is not started.
- Existing board-centric layout, direct Rack placement, Pointer Events mouse drag, sorting, canonical draft operations and the 50-entry Undo limit remain the owners of their existing behavior.

## Persistent mobile turn HUD

The existing `NumberTilePlayingScreen` turn banner is fixed to the top at widths up to 600px. There is only one timer/turn banner; desktop retains its original in-flow HUD.

- Height and body top spacing share `--number-mobile-hud-height` (80px plus top safe-area inset).
- Top/left/right safe-area insets are respected. Keyboard focus targets have matching `scroll-margin-top`.
- `MM:SS`, server-clock offset and canonical deadline calculation remain unchanged. No client timer authorizes gameplay.
- At <=10 seconds the banner uses a stronger warning border/background and countdown weight, without flashing. `role=timer` remains `aria-live=off`; a fixed threshold sentence, not a second-by-second countdown, is announced.
- Physical iPhone notch/browser chrome behavior is not claimed as verified by desktop viewport emulation.

## Tap rearrangement

`number-tile-tap.ts` is a Number-local, pure selection/move-intent helper. It never mutates a draft or defines game legality.

1. Tap a Table tile to select its exact physical `tileId` (including rack-origin placed tiles).
2. Tap any part of another available meld, including one of its tiles, to move the selected tile there. The destination tile is not mistaken for a new selection.
3. Tap board whitespace to create a new meld and move the selected tile in one existing atomic local draft operation / one Undo entry.
4. Tap the selected tile again, or **선택 취소**, to cancel without draft/history changes. The cancel button restores focus to the source meld's keyboard activation target.
5. Tap the Rack container or the existing return action to return a rack-origin tile. Pre-turn canonical tiles cannot return to the Rack; the draft stays unchanged and a concise Korean explanation is shown.

A compact selected-tile helper and subtle destination outlines explain the next action. No modal, insertion slots, persistent board coordinates, or new gameplay command was added. Whole-meld activation and the existing new-meld/return buttons provide keyboard alternatives to whitespace/tray tapping.

Extend, split, merge and rebuild use the same existing TurnDraft operations as mouse drag. Intermediate incomplete melds stay editable; only the server judges the complete submitted Table. First-registration Table locks, own-rack contribution, physical conservation, sorting, Undo/Reset, GROUP colorless Joker, unique unordered RUN normalization and free valid Joker rearrangement are unchanged.

Same-identity presence updates retain the draft/active selection. Loss of edit capability clears selection and transient drag state. Baseline/turn changes and Reset retain the existing canonical reconciliation behavior. No transient UI identity is serialized.

## Original Number audio

Web Audio sine-note sequences replace the quieter single glide; no asset or dependency was added. Envelope gains are relative signal gains, not device/OS volume settings:

| Cue | Notes (Hz) | Duration | Peak gain |
| --- | --- | --- | --- |
| TURN_START | 659, 880 | 0.42s | 0.24 |
| SUBMIT_SUCCESS | 523, 659, 1047 | 0.45s | 0.23 |
| DRAW_SUCCESS | 440, 587 | 0.18s | 0.095 |
| PASS_SUCCESS | 440, 392 | 0.14s | 0.055 |

- Number Playing pointer/Enter/Space capture attempts to unlock a reused AudioContext when the existing sound preference is enabled. Enabling sound also attempts gesture-time unlock.
- Unsupported/blocked audio and resume/close failures never escape into gameplay. A cue blocked before unlock is dropped, not queued or replayed later. A fresh page's first turn can therefore remain silent until browser activation is available.
- Existing turnId/session-storage deduplication and accepted-current-ack/requestId feedback ownership are unchanged. Rejects, stale acknowledgements, duplicate requests and presence-only snapshots do not create additional success cues.
- Nodes disconnect when finished. Unmount closes the context, allowing an already-started short terminal Submit cue to finish first; it never creates a new cue during teardown.
- The existing Number sound preference key persists. Sound is supplementary to visual/status feedback.
- **MANUAL MOBILE AUDIO REVIEW PENDING**: actual phone speaker loudness, silent-mode behavior, iOS/Android autoplay and subjective comfort require device listening.

## Verification evidence

- Final typecheck/build: PASS. Full tests: **1172/1172** (shared 91 / Web 254 / server 827), **15 new Web tests**, no deleted/skipped tests.
- New tests cover selection/cancel/no-history, whole-destination tile intent, public six-tile RUN split/merge, extension/rebuild/duplicate-copy identity, permitted and forbidden Rack return, first-registration locks, GROUP/Joker to unordered orange RUN, serialized payload isolation, HUD/source wiring and audio unlock/rejection/envelope/dedup ownership/terminal cleanup.
- Existing Number/Hangul/GEM tests, draft/retry/reconnect, schema/privacy and production-serving regression remain passing. Separate targeted runs: **Web 150/150**, **server 293/293**, **production-serving 6/6**.
- One restricted full-run attempt failed network integration tests with `listen EPERM`; rerunning with permission to open local test ports passed. This was an execution permission limitation, not an altered assertion or runtime fix.

### Browser: actual local production build

Independent A/B clients used `localhost:43122` and `127.0.0.1:43122` with ordinary production Socket.IO flows, not a debug endpoint.

- Create/join/start; initial racks 14/14 and pool 78; A Draw; B submitted an actual 39-point R13/K13/O13 first meld.
- On B's subsequent turn, the canonical public R13 was selected, moved to board whitespace as a new incomplete meld, then merged back by tapping K13 inside the destination meld. This verifies post-registration rearrangement, not just initial placement. Intermediate invalid drafts were not submitted as valid moves.
- Canonical R13 → Rack attempt was rejected locally with the expected explanation and unchanged Table; keyboard selection/cancel, ordinary Draw, refresh/resume into the same two-player Room and read-only opponent-turn controls were observed.
- 390x844 and 320x568 measurements showed no document overflow; the timer stayed at viewport top while scrolling Table/Rack/actions. An actual 00:05 warning was observed.
- Captured running-page A/B browser warning/error logs were empty. No claim of physical-mobile listening or public Railway verification is made.

### Browser: isolated layout/controller fixture

An ephemeral, non-production fixture bundled the existing `numberBoardFixture`, real Number Playing component, real draft hook and CSS. It had no connection to a Room/server and did not ship in the application bundle.

- Each of 3/6/10/15 melds and 14/19/24/30 rack tiles was measured at both 390x844 and 320x568: document overflow 0, Rack horizontal overflow 0, horizontally clipped gameplay buttons 0.
- At 1280x900: one timer, in-flow desktop banner, no document overflow.
- Tap extension of R1/R2/R3 with rack R4, selection + tray return, mouse drag extension + one Undo, presence-only selection retention, connection-lock cleanup, turn-change read-only cleanup and keyboard cancel focus restoration were exercised in the real component.
- Fixture and production-browser checks supplement the deterministic six-tile split/merge/rebuild and Joker tests; fixtures are not represented as server-accepted gameplay.

## Manual deployment/mobile checklist

1. Deploy Latest Commit manually and refresh existing browser tabs. Railway remains single-process in-memory; redeploy can discard active Rooms/Games/sessions.
2. On actual 390/320-class mobile screens, scroll a long Table and a 30-tile Rack. Verify persistent HUD, notch/browser-chrome clearance, no horizontal Rack scrolling and reachable actions.
3. After first registration, select a public tile, tap another meld's body/tile, split onto whitespace and merge/rebuild. Cancel both ways. Verify canonical tiles cannot return to Rack, while this turn's rack-origin tiles can.
4. Verify tap-only play, desktop mouse drag, Undo/Reset, dirty Draw confirmation and same-player resume. Recheck colorless GROUP Joker and unordered RUN inference.
5. Enable sound with a real gesture. Compare new-turn and accepted Submit cues with smaller Draw/Pass cues; reject/replay/presence updates must not produce success spam. Test sound off/on, iOS/Android autoplay and comfortable real-speaker volume.

Next: **Manual mobile NUMBER_TILE verification** only. P12 waits for the user's mobile verification and GEM beginner-UX confirmation.

## Follow-up: mobile tile size polish

Baseline: `31d8c47 feat: improve game reconnect experience`, clean `master === origin/master`, typecheck/build and **1182/1182** tests passing. This follow-up changes only Number-scoped CSS inside the existing `max-width:600px` media query, its layout characterization test and this document. No production TypeScript, server/shared, rule, protocol, dependency, Hangul or GEM change.

### Compact visuals, retained interaction

| Mobile element | Before | After |
| --- | --- | --- |
| Table tile box | 44 × 56px | 40 × 52px |
| Table numeral | 21.6px | 20px |
| Rack grid minimum column | 48px | 44px |
| Rack tile minimum height | 64px | 58px |
| Rack numeral | 26.4px | 24px |
| Rack gap | 6px | 4px |
| Meld-pack row/column gap | 15 / 10px | 12 / 6px |

Table/Rack interior padding and the mobile board minimum height are slightly reduced. Table tile spacing is deliberately **4px rather than the previous 3px**: each 40px visual tile has a pseudo-element hit area extending 2px on each side, yielding a 44px-wide target without overlapping its neighbor. Whole-meld destination targets remain available. Rack columns remain at least 44px wide and wrap vertically, with no horizontal scrollbar. Color definitions, markers, Joker visuals, focus and selected states are unchanged.

HUD, click/tap rearrangement, desktop pointer drag, Undo/Reset, initial registration, canonical RUN/Joker semantics, actions, audio and credential-based reconnect retain their existing implementations. The change creates no new canonical state or payload.

### Browser layout comparison

A temporary local fixture bundled the real Playing screen, draft controller and styles in production mode. Frozen baseline CSS and candidate CSS were compared at **390×844, 320×568 and 1280×720**. The fixture is not shipped and has no server/Room mutation; it is layout/editor evidence, not a new server-accepted gameplay or physical-device claim.

- All requested Rack sizes **14/19/24/30**, Table sizes **3/6/10/15 melds**, and single RUN lengths **3/6/10/13** were inspected. Document and Rack horizontal overflow were absent in every case.
- Three-tile meld and Rack density measurements (heights are the meld-pack / Rack tile-grid, excluding surrounding controls):

| Viewport | Rack columns, before → after | 14 / 19 / 24 / 30 Rack heights, before → after | 3 / 6 / 10 / 15 meld-pack heights, before → after |
| --- | --- | --- | --- |
| 390px | 6 → 7 | 216/286/286/356 → 132/194/256/318px | 173/267/455/737 → 152/234/398/644px |
| 320px | 4 → 5 | 286/356/426/566 → 194/256/318/380px | 267/549/925/1395 → 152/234/398/644px |

- At 320px two three-tile melds now fit side by side rather than one. A six-tile RUN fits one tile row instead of two. At 390px a thirteen-tile RUN fits two rows instead of three.
- At 1280×720 the nine fixture cases retained the exact baseline geometry: ordinary Table tiles **48×60px**, Rack tiles **56×68px**, existing fonts, columns and panel heights. Desktop media rules are unchanged, including at widths above 1280px.
- Visual inspection retained distinguishable R/B/K/O markers, readable numerals and neutral Joker with its derived number hint. Expanded Table hit areas were checked with browser hit-testing on both outer edges; 320px Table selection → another meld's tile destination, Rack → active meld, Undo/Reset, and 390px sorting were exercised. The existing fixed turn HUD remained visible while scrolling. Sample gameplay controls were not horizontally clipped.
- Final automated gates: **1183/1183** tests (shared 91 / Web 265 / server 827), **1 new CSS boundary/layout test**, typecheck/build and `git diff --check` PASS. Existing tests are retained; only the old mobile-size assertion changes to the requested new visual dimensions.

Status: **SOURCE COMPLETE / DEPLOYMENT_PENDING_USER_ACTION**. No Railway deployment was performed or inferred. Physical-phone tap comfort and device/browser chrome remain manual checks after the user's deployment; desktop-browser viewport checks are not represented as physical-mobile verification.

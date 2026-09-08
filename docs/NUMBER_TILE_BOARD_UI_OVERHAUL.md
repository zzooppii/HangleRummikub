# NUMBER_TILE board UI overhaul

Status: **SOURCE COMPLETE / MANUAL PUBLIC UI REVIEW PENDING**.

Baseline: `a19fa7c fix: canonicalize number tile runs`, clean `master` matching
`origin/master`; typecheck, build and 1,135 tests passed (shared 91 / Web 217 /
server 827). This is a Number-only Web presentation/interaction change. GEM_CARD
P11C at `ff1a792` is preserved; P12 has not started.

## Design and ownership

- Compact player strip and turn/countdown sit above a central, original muted
  sage/graphite play surface. Opponents still expose rack counts only.
- Melds are small physical-looking tile groups packed with wrapping flex layout,
  not full-width dashboard cards. Valid status remains accessible without a large
  visible label. Incomplete/invalid groups have a small hint and dashed outline;
  active groups have a restrained outline/dot and an addition label when valid.
  Focusing/tapping an incomplete or invalid group reveals a concise rule helper
  locally, without a permanent large error card.
- A sage rack tray wraps vertically. Sorting is still view-only. Strong existing
  number colors, R/B/K/O markers, neutral Joker, exact physical IDs and native
  button labels are retained. A uniquely interpreted RUN Joker can display its
  derived number; GROUP Joker never acquires a color assignment.
- The action dock follows the rack: new meld, Undo, Reset, Submit and Draw/Pass.
  Initial-registration progress is compact; rejection notices and dirty-action
  confirmation retain their existing owners and focus semantics.
- The design uses original CSS gradients, borders and shadows, with no imported
  commercial artwork, logo, wood/blue-board imitation or copied card/table data.
  The textual reference was interpreted as interaction and visual hierarchy,
  not as a request to clone a product's trade dress. No image asset was added.

Implementation lives in `NumberTilePlayingScreen.tsx`,
`NumberTileTurnDraftEditor.tsx`, and the new `number-tile-board.css`, imported by
`main.tsx`. Every new CSS selector is scoped to `.number-playing-shell`; existing
shared styles and Hangul/GEM feature source are unchanged.

## Interaction and canonical boundaries

- Existing direct click/tap, first-tile auto-create, active-meld switching,
  keyboard activation, empty-meld reuse and selection behavior remain intact.
- Existing mouse Pointer Events (6px threshold, capture and cancellation cleanup)
  remain the drag mechanism. A transient fixed-position tile preview follows the
  mouse; these screen coordinates are never part of a draft or command.
- The whole play surface is now a new-meld drop target. Hit testing prioritizes
  an existing meld over its containing board, so dropping into a meld adds there;
  dropping onto whitespace uses the existing atomic `NEW_MELD` draft operation.
- Whole-meld moves and whole-rack returns still use exact `tileId`. A pre-turn
  canonical Table tile cannot enter the rack. An invalid/cancelled drop does not
  mutate the draft. Creating a meld with a dropped tile is one Undo entry.
- Table state remains an ordered meld list. No persisted board coordinates,
  generic board model, protocol field, command, server rule, idempotency policy,
  snapshot format, scheduler or privacy behavior is added or changed.
- Same-identity reconnect/presence preserves the existing draft policy. Reset,
  supersession and accepted commands clear transient editing/drag state through
  the existing lifecycle. Rejected Submit preserves the draft.
- Unordered unique RUN canonicalization, genuine numeric ambiguity resolution,
  colorless GROUP Joker, final-table conservation and server authority are
  unchanged. No GROUP/RUN selection or insertion `+` controls are reintroduced.

## Accessibility and layout

- Native buttons retain keyboard operation and descriptive tile/meld labels.
  Logical meld DOM order remains unchanged; visual packing does not reorder it.
- Mouse drag is optional. Mobile remains tap-first and vertically scrollable.
  Tile targets are at least 44px wide, with visible focus and color-independent
  markers. Reduced-motion preference disables Number-specific animation and
  transition effects.
- Rack sizes 14/19/24/30 wrap rather than horizontally scroll. Long RUNs wrap
  within a single group. The action dock is not sticky and cannot cover the rack.
- Short groups pack side by side when space allows; at 320px some groups occupy
  a row to preserve the minimum target size rather than shrinking the tiles.

## Verification evidence

Final root gates: typecheck **PASS**, tests **1,142/1,142 PASS** (shared 91 / Web
224 / server 827), build **PASS**, `git diff --check` **PASS**. All 1,135 existing
tests remain, with seven new Web board tests and no deleted/skipped tests.

Targeted runs:

| Area | Passing tests |
| --- | ---: |
| Number Web + new board tests | 59 |
| GEM Web | 31 |
| Hangul draft/actions/legacy view | 25 |
| Number server | 163 |
| GEM server | 104 |
| Production serving | 6 |

The new tests cover compact DOM structure, board-whitespace target priority and
atomic Undo, meld/run/rack stress fixtures, GROUP sizing, accessible state and
opponent edit locking, wrapping, focus, reduced motion and physical identity.
Existing release-UI assertions now inspect the actual Number-specific stylesheet
and authoritative rack count rather than removed duplicate dashboard markup.

### Real local production build

An isolated headless **Google Chrome** process, using two independent browser
contexts against the production Node build, verified:

- Home Number selection, create, direct Room join, start;
- first rack click automatically creating a meld, repeated direct placement,
  active switching, keyboard Enter, new-meld activation;
- actual mouse movement/drop from rack to meld, rack to board whitespace,
  meld to meld and rack-origin tile back to the whole rack;
- Undo of one drop, Reset, opponent-turn input lock;
- a real shuffled-rack **30-point initial Submit**, accepted by the unchanged
  server (not a debug fixture or mocked command);
- Draw: actor rack +1, pool -1, next turn and revision advance;
- fresh connection/resume preserving player and rack without duplicate players;
- actor-only drawn tile detail and opponent rack-count-only projection.

Canonical Table-to-rack rejection, invalid-drop/cancel and Joker/rearrangement
edge cases remain covered by automated draft/domain/server tests; this pass does
not claim that every edge case was reproduced manually in the browser.

### Chrome layout fixtures

35 rendered layout cases covered widths **1280, 1440, 768, 390 and 320** (mobile
heights 844/568), meld counts **3/6/10/15**, racks **14/19/24/30**, and RUN lengths
**3/6/10/13**. Assertions checked document/rack overflow, tile/control rectangles,
minimum target widths, compact short-group height and packing. Reduced-motion
computed styles passed. Desktop, tablet/mobile and long-RUN screenshots were
inspected. Additional unit fixtures cover 3/4-tile GROUPs.

These are browser-rendered, schema-valid **layout-only fixtures**, not invented
canonical production Rooms. The independent A/B flow above supplies actual
runtime evidence. Emulated viewport tests are not physical-device, Safari or
Firefox verification.

## Limitations and release state

- No browser runtime/schema error was observed. Chrome reported an existing
  `/favicon.ico` 404 on the local server; the baseline has no favicon resource.
  It is recorded rather than concealed or repaired outside this Number scope.
- No Railway deployment or public UI verification was performed or inferred
  from a push: **DEPLOYMENT_PENDING_USER_ACTION**.
- Existing single-process in-memory restart/Room-loss behavior is unchanged.
- User review of **NUMBER_TILE + GEM_CARD UI** is the next gate. Public mobile
  feel and final visual acceptance remain manual; P12 must wait for that review.
- No dependency, package manifest, lockfile, server/shared source, Number rules,
  Hangul rules/source, or GEM rules/source changed.

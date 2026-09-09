# SNEAKY_LUNCH classroom presentation redesign

Starting checkpoint: `1b15bfa`, clean `master = origin/master`. Baseline: 1,767 PASS (shared 113 / Web 430 / server 1,224). Scope: Web presentation only. No gameplay/domain/server/shared/dependency changes; no Railway deployment.

## Composition and original art

The teacher-above/participant-dashboard-below layout is replaced by one classroom board. Blackboard, teacher, lectern, two NPC pupils, window light and perspective floor share the same scene as rear participant desks. The viewer has exactly one larger foreground seat with a tray and a repeat-tap action, never a duplicate participant card. Two through eight participants retain their room-order avatar identity; hair silhouettes, shirt palettes, glasses/accessories and desk objects vary deterministically. All scenes are hand-authored repository-owned SVG/CSS; no commercial art, layout or character is copied.

`ClassroomPlaying.tsx` owns scene composition, seat presentation and the dismissible native result dialog. `classroom-art.tsx` owns backdrop/teacher/NPC artwork. `art.tsx` owns reusable food and pupils. `classroom.css` is scoped to lunch presentation; obsolete dashboard selectors are removed from `sneaky-lunch.css`. `SneakyLunchScreen.tsx` retains existing command/connection ownership and integrates the scene and bounded local effects.

## State and feedback

| Public fact | Presentation | Authority / replay boundary |
|---|---|---|
| BOARD | Back-facing teacher, writing arm/chalk | Current teacher state only |
| SUSPICIOUS | Stopped chalk, shoulder turn, question, subtle tension | No fake/real prediction or transition timer |
| WATCHING | Front-facing teacher, speech, warm danger edge, desk-impact sound | Current public state; active eat button stays enabled |
| RETURNING | Side-turn pose, wait instruction | Still dangerous; no fabricated safe window |
| Accepted own bite | Food depletion, chopsticks/chew, brief exact delta, tiny crunch | No click-time success; revision/progress delta only |
| Accepted other bite | Matching public seat motion | No remote bite-sound chorus; no new information |
| Box complete | Empty tray exits, next full tray enters; final tray stays empty | 30-bite boundary from canonical progress |
| Caught | Named teacher speech, target comic feedback, closed tray, slumped pupil/stamp at same desk | Public status change; caught participant stays spectator |
| Finished | Classroom remains behind winner/teacher result modal | Existing canonical result; close/reopen, Host-only existing rematch |

Transient state is page-local, bounded by participants/short timers and cleared on game change, disconnect and unmount. Equal/stale/replayed snapshots do not retrigger; initial/resumed states establish a new baseline. A resumed caught seat is slumped without re-playing the catch. Public progress never exposes future teacher timing/randomness. Original Web Audio cues respect the existing Sound toggle; text/visual cues remain with sound off. Reduced motion removes animations, immediately displays the canonical tray and retains text feedback. No background music/dependency was added.

The latest user explicitly approved a brief `+1`; no running `17/30` counter or scoring was introduced. All gameplay rules retain `sneaky-lunch-rules-v1`.

## Browser acceptance and verification

Local production assets are served by the existing server, with an isolated `/tmp` review harness injecting only its test clock/random port. Two independent browser origins and additional real Socket.IO participants issue the existing commands; no DOM/React-state injection or production fixture route exists. Manual clock transitions make screenshot states inspectable; they are not a live latency benchmark.

Captured/reviewed: four-player BOARD, SUSPICIOUS, WATCHING, target CAUGHT, multiple CAUGHT/RETURNING, player victory, teacher victory, eight participants, 390px and 320px. Result close/reopen/Escape with focus restored, same-room rematch, successful tap delta, disabled spectator and refresh without old effects are checked. Review identified last-row labels overlapping the foreground desk at eight players: room height is now content-driven. The 320px composition has a more compact teacher/tray/header without reducing the 64px action target. Short mobile viewports allow normal vertical scrolling instead of pinning the foreground desk over participant labels.

Screenshots are local review artifacts under `/private/tmp/lunch-classroom-review/`; they are not application assets. Key files: `01-board-4players.png`, `04-suspicious.png`, `05-watching.png`, `06-caught-impact.png`, `07-caught-spectator.png`, `08-multiple-caught-returning.png`, `09-player-win.png`, `10-eight-players.png`, `11-teacher-win-390.png`, `12-teacher-win-320.png`, `13-eight-players-390.png`, `14-eight-players-320.png`. `before.png` records the old separate-scene/dashboard layout.

## Completed quality gate

- 1,783 / 1,783 PASS: shared 113 / Web 446 / server 1,224. Sixteen additive Web tests; zero skipped/deleted tests. Full suite passed repeatedly, including after the final accessibility/layout correction.
- Root `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`: PASS. Existing production-serving tests PASS.
- Actual local production browser: two independent origins, 4 and 8 participants, the listed scene states, 1280/390/320 responsive review. No horizontal body overflow; 66px/64px mobile action targets. Warning/error console: 0 on both viewers. Sound OFF retains text, catch and scene changes. No transient replay after resume. Reduced-motion fallbacks verified in scoped CSS/tests; no claim of changing the operating system setting.
- Final bundle: JS 676.73KB / gzip 193.25KB (baseline 660.27 / 187.29; +16.46 / +5.96KB). CSS 155.58KB / gzip 32.77KB (baseline 140.71 / 29.86). Existing Vite >500KB chunk warning remains disclosed; no new dependency or image/audio downloads.
- Source audit: only SNEAKY Web presentation/tests and its documentation. Server, domain, shared DTO/protocol, other five games, dependency manifests and lockfile: diff 0. Historical release tag unchanged.
- Acceptance: one recognizable classroom, teacher focus, immediately identifiable eat action, diminishing food, friends at shared desks, no giant participant dashboard cards. Original SVG scenes, current-state-only tension and local canonical feedback meet the requested direction.
- Commit subject: `feat: redesign sneaky lunch classroom gameplay`. Normal `origin master` push after gate; no Railway deployment.

SNEAKY_LUNCH CLASSROOM REDESIGN COMPLETE — source/local gate only.

# P19D — 그림 릴레이 Web

Server checkpoint: `2f025f4`. Web now advertises five implemented games. DRAW has a concrete route rather than a renderer registry. Its Lobby is 3–8 seats with Host-only EASY/NORMAL/MIXED configuration.

Original sketchbook SVG/CSS, paper canvas, marker palette and synchronized public book pages are scoped to DRAW. Native Pointer Events use bounded integer logical coordinates (1000×700), eight colors and three widths. Pen/eraser/undo/confirmed clear are local editor operations; whole private drafts autosave after a 300ms quiet period with one in-flight save and caller-owned draft revision. Failed acknowledgements retain the command identity for retry and preserve local artwork. Only acknowledged artwork is guaranteed across refresh. Submit locks editing.

Guess is escaped text, limited to 40 Unicode characters. Waiting reveals only completion status. Reveal shows only the server-projected prefix, with original/final comparison after the last contribution. Finished has no score, rank or winner. Host rematch reuses Room/session identity; scope changes are ordered by roomRevision and gameId.

First-use five-step guide, persistent sound preference, original short synthesized sounds, text equivalents, focus outlines and reduced-motion CSS. No new dependency or external artwork/audio.

Local production browser: two actual viewers plus one raw participant completed DRAW→GUESS→REVEAL→FINISHED→same-Room Lobby (`GATNMP`, disposable local test). Three pointer-drawn strokes restored after refresh as `저장됨 · 3/250 획`. Host/non-host controls verified. 1280 desktop, 390 DRAW and 320 GUESS/Reveal inspected; no horizontal overflow. A 320 timer line-wrap was identified and corrected with nowrap. Both viewers' console warning/error logs were empty before rebuilding. P20 rechecks the final bundle and expands race/lifecycle coverage.

P19D gate: typecheck/test/build/diff-check PASS, 1645 tests (110 shared / 417 Web / 1118 server). Existing >500KB chunk warning remains. Railway NOT DEPLOYED. P20 follows this checkpoint.

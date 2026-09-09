# CITY tabletop presentation

2026-09-09 · starting HEAD `60fb5f1`.

CITY-only Web presentation: deep green table, parchment player boards, gold-edged resource tokens, public role-order track, eight-slot city progress, illustrated invitation board, matching result and guide surfaces. Existing original card art and role-selection artwork are reused; no new assets or dependencies.

- The role track lists the fixed eight public role identities. Current/revealed status comes only from the public projection. It never shows owners inferred from secret selections, hidden removals or private marks.
- City tokens show public gold, hand count and building score preview, not exact opponent cards. The eight slots show the completion goal, not a cap: nine buildings still display as nine.
- Action handlers, 45/90-second timers, 2/3-player draft, sound/music preferences, impact queue, reconnect and all rule semantics remain unchanged.
- CITY Lobby styling is opt-in through `city-lobby-shell`; other games retain the existing Lobby markup/classes.
- Existing focus, disabled states, native help dialog behavior and reduced-motion support remain. No animation was added.

Verification: four additive SSR tests cover private-choice independence, current-role indicator, 0/4/8/9 progress and labeled resource counts. The existing opponent-privacy test now asserts the token markup instead of the former single text line; secret assertions are unchanged. Full tests: 1617 (shared110 / Web409 / server1098). Typecheck/build PASS. Existing Vite large-chunk warning remains.

Local browser fixture (real React screens, not a claim of live multiplayer gameplay) checks Playing, selection, Lobby, Finished and Guide; responsive checks at 1280/768/390/320. No Railway deployment.

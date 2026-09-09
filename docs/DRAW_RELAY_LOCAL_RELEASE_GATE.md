# P20 — DRAW_RELAY local release gate

## Scope and checkpoints

Starting baseline `98d39e5`; previous NUMBER work already checkpointed, no pending NUMBER changes. P19A `9aeec62`, P19B `1958dfc`, P19C `2f025f4`, P19D `ea1d5e4`. No deployment and no dependency changes. Existing four games retain their rules and presentation.

Rules: 3–8 participants, server-shuffled immutable seats, one Book per participant. Odd counts use N−1 stages, even counts N stages with final owner guess. DRAW 90s / GUESS 45s, simultaneous barrier; timeout blank drawing or ‘모르겠어요’. No score/winner. Server-only original prompt pack has 600 unique entries (200 EASY / 250 NORMAL / 150 HARD).

## Source / protocol verification

- Raw Socket.IO 3/4/5/8-player chains complete every stage, prefix Reveal, Finished, same-Room rematch and fresh second game.
- Strict viewer-specific schema/projection checks: no own Book prompt, hidden owner/author/history, other draft or future Reveal page in PLAYING. Reveal Host sees the same opened prefix as other viewers.
- Saved private drawing survives detached serialization and actual session resume. Replay does not increment draft revision twice. Concurrent submissions advance barrier once with one page per Book.
- Timeout race test: save then deadline → blank page, not saved drawing; late submission rejected; duplicate deadline callback no-op. A regression exposed a stale scheduler retained when timeout was invoked through reconciliation rather than its timer; applied timeout now explicitly cancels the old timer before scheduling the next stage.
- Offline three-timeout streak, resume reset, future default submissions, all-player leave termination and routing conservation covered by domain tests.
- Explicit leave during DRAW preserves Book/seat routes and fills future pages, Reveal completes, rematch excludes leaver, stale credential resume rejects. Disconnect retains roster/session.

## Approved Host grace cases

| Case | Evidence |
|---|---|
| 59s resume | Real resume, later 60s callback no-op; same Host/game |
| 60s offline | Earliest connected original joinOrder gets Host; roomRevision +1 only |
| Former Host resume | Same identity, does not reclaim Host |
| Mid-Reveal | Page 1/cursor/all Books preserved; successor continues |
| Finished | Recap immutable; successor rematches same Room |
| No successor | State unchanged; later resume reevaluates |
| Commit race | Offline generation invalidated at actual UoW commit boundary; guard rejects replacement |
| Privacy | Successor receives only opened prefix, no future Book data |

Only REVEAL/FINISHED use this policy. DRAW/GUESS/FINAL_GUESS keep Host identity. Grace uses the actual continuous offline interval and a 1-second reconciliation poll (not a guarantee of millisecond-exact delivery). Presence history is process-local like existing connection infrastructure.

## Actual local production browser

Two separate browser origins/sessions plus a raw third participant completed DRAW → GUESS → REVEAL → FINISHED → same-room Lobby. Host pointer-drew three strokes, refreshed and recovered exactly the saved drawing, then submitted. Non-Host controls, waiting, prompt/drawing/guess reveal and final comparison inspected. Started a second game in the same Room.

1280 desktop, 768 tablet, 390 and 320 mobile inspected. Final 320 timer stays on one line; document scroll width 305 at viewport 320, and 753 at viewport 768. No horizontal overflow. Canvas-only touch handling, 44px controls, safe area, reduced-motion and Sound OFF have source/test coverage. Both viewers had empty warning/error console logs. Screenshots were inspected in the tool output; no claimed screenshot files were saved. Browser verification is a 3-player hybrid, not eight physical devices.

## Performance / limitations

No canvas/icon/audio dependency; native pointer canvas and short original Web Audio cues. JS 627.74KB (gzip 177.56KB), CSS 121.10KB (gzip 25.84KB). Compared with pre-DRAW: JS +26.82KB / gzip +8.59KB; CSS +11.01KB / gzip +2.51KB. Existing >500KB bundle warning remains visible.

Drawing limits: 250 strokes, 1,000 points/stroke, 12,000 total points, bounded coordinates/palette/width and 512KB command envelope. One in-flight debounced private autosave. Native pointer smoke showed no visible stalls or render loop. Local deterministic 8-player domain probe:

| Points per drawing | Drawing JSON bytes | Full canonical state bytes | Entire 64-submission relay time |
|---|---:|---:|---:|
| 100 | 1,663 | 59,550 | 70ms |
| 12,000 | 212,895 | 6,818,974 | 7,124ms |

The extreme case is bounded but expensive; it is not a production load/concurrency certification. Finished exposes a full recap, so maximally dense books are multi-megabyte. Physical stylus feel, speaker volume and slow-device/network performance still need human playtest. Acknowledged drafts restore; unsaved local edits cannot be guaranteed after refresh. Existing in-memory process-loss limitation remains; adapter round trips do not constitute durable production storage.

## Final quality gate

Final result: root typecheck PASS; full test **1651/1651 PASS twice** (shared 110 / Web 417 / server 1124); production build PASS; diff-check PASS. Production-serving regression is included in both full server runs. No tests deleted/skipped. The intermediate privacy substring false positive and scheduler-count regression were resolved, not suppressed. No Railway deployment. Stop after P20; no additional game or phase.

**P20 SOURCE / LOCAL GATE PASS — DRAW_RELAY READY FOR USER PLAYTEST.** This is a local/source readiness statement, not a production deployment or device/load certification.

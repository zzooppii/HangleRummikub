# DRAW_RELAY privacy / protocol
## Visibility
| Content | Assigned actor | Other participants | Server |
|---|---|---|---|
| Stage/kind/deadline/submitted count | yes | yes | yes |
| Initial prompt in stage1 | first DRAW actor only | no, including owner | yes |
| Immediate source | own assignment only, no author | no | yes |
| Draft | own only | no stroke count/content | yes |
| Book owner/history/future route | no | no | yes |
| Reveal pages | only opened cursor prefix | same prefix | full |
| Finished books | all | all | full |
Names and submitted booleans may be public; content is not. No generic public player-private-state. Explicit projection whitelist, never spread persisted entities.
## Concrete command direction
draw:draftSave, draw:submitDrawing, draw:submitGuess, draw:revealNext, draw:rematch. game:start remains existing shell, prompt mode Host-only. Identity: gameId+stageToken for gameplay, requestId idempotency; per-player draft revision for edit conflicts. Bounds and auth before domain. Request retries same payload cannot append a page twice. Coarse invalid-assignment errors must not reveal owner/prompt.
RevealNext Host-only and exact current cursor/revision. Rematch Host/current primary/session + FINISHED, replay-safe. Every stage transition including deadline races committed once through the room lane/UoW.

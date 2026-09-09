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
## Drawing duration extension

`draw:configure.payload.drawSeconds` optionally accepts only 15/30/45/60/90. Omission preserves the current Room setting (default 90); changing prompt mode does not reset duration. Lobby and all game projection branches expose the public `drawSeconds` setting. Canonical game state freezes it at start; later DRAW deadlines use that value, while guesses stay 45 seconds. Legacy missing fields normalize to 90. This adds no private information. Older strict-schema clients require the updated Web bundle for the added field.
2026-09-10 사용자 정정: 새 Room 생성 시 그리기 기본값을 **60초**로 명시해 저장한다. 기존 Room/게임의 설정은 유지한다. 설정 필드가 없는 과거 저장판의 90초 호환 fallback은 그대로이며, 아래 이전 기본값 90초 설명은 신규 Room에는 적용하지 않는다. 선택지 15/30/45/60/90 및 추측 45초는 유지한다.

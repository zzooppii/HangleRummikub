# NUMBER placement / same-room rematch

User-approved rules supersede the earlier NT-028/030/031/032 scoring proposal. No deployment authorized.

## Ranking authority

- New games carry `placementOrder: []`. Successful rack-empty Submit appends the actor exactly once. The immutable original `turnOrder` is never reordered.
- Placed players retain their Room identity and private self projection, but cannot act or receive scheduled turns. They are not forfeited.
- With one unplaced non-forfeited player remaining, normal completion is `PLACEMENT_COMPLETE`. The final result assigns that player the last normal rank; `placementOrder` itself records only actual rack-empty events, not an empty rack fabricated for auto-last.
- STALEMATE preserves that prefix and sorts remaining normal players by remaining tile count, then original turn order. Forfeited players follow all normal players in original turn order. No penalty or score is calculated for placement results.
- Ranks are unique 1..N. The only winner is rank 1. A prior first place remains winner when a later forfeit causes LAST_PLAYER_STANDING.
- Existing initial meld, physical conservation, Joker, rearrangement, draw/pass, 90-second timer and offline timeout rules are unchanged.

## Result and migration

New results explicitly carry `rankingMode: "PLACEMENT"`, reason, finishedAt, winnerPlayerIds and rankings with playerId/rank/forfeited/remainingRackCount. They contain no score or penalty.

Persisted states without `placementOrder` are legacy scoring games, not silently converted. Their legacy result schemas and domain tests remain valid. Production `game:start` always selects placement mode. Presence of the placement field and the result discriminator must agree; the concrete adapter validates and clones both paths. HANGUL/GEM/CITY contracts are not migrated.

## Result board / rematch

The final public table and private own rack remain visible behind a closeable/reopenable result dialog. Placed players see live ranks while the game continues. Only the current primary Host can issue concrete `number:rematch`, with current Room/game revisions and request identity. The command is NUMBER-only and FINISHED-only. Replay resets once; conflict rejects.

FINISHED → number:rematch → LOBBY → separate game:start. RoomId/code, remaining participants/nicknames/joinOrder, Host, sessions and presence survive. Game/racks/table/pool/result/placement/offline streak/deadline are removed. A new start generates fresh game/turn/tile identities and a fresh shuffle; stale callbacks cannot target it. This does not add a historical results archive: the previous finished result is not rewritten, but the active Room stops storing that game on rematch.

The Web's NUMBER snapshot shell includes the game identity for ordering only. Across game identity changes (including null Lobby), newer Room revision orders the snapshots. Within the same game the existing multi-revision comparison remains. A delayed old-game snapshot cannot overwrite a new game merely because its gameRevision is larger. Other games keep their existing comparison policy.

## Previous result vs next roster

The finished roster/result is immutable. NUMBER Room metadata `departedPlayerIds` records explicit departures without removing old result entries. Explicit leave deletes the bound credential through the existing UoW. A leaving Host transfers to the earliest remaining joinOrder, including an OFFLINE participant. Rematch filters only explicit departures. Disconnect and offline-timeout forfeits are retained, and their old gameplay flags disappear with the old game. No participant is resurrected from a stale credential.

## Verification

Automated regression coverage includes:

- 2/3/4-player chronological completion, continuation after first place, auto-last, immutable turnOrder, Submit replay exactly once, placed actor rejection, persisted projections.
- STALEMATE prefix/count/order, normal subgroup ahead of forfeit, LPS preserving the prior winner, placed leave retaining its rank.
- Explicit participant/Host departure preserving old result and deleting the credential; next roster filters only departures. Host transfers to earliest remaining joinOrder even when OFFLINE.
- Offline-timeout forfeit's credential/roster preservation and fresh-start flag reset; rematch current-primary/Host/phase checks, replay/conflict, cross-game no mutation, new identity/racks and stale callback safety.
- Scoreless result dialog, close/reopen wiring, host/non-host UI, private self rack, ongoing spectator view, NUMBER-only game-scope ordering including a missed intermediate Lobby.

Local production browser smoke (2026-09-09): real production Web served at loopback, two Chrome profiles plus two Socket.IO clients. A local-only harness seeded a conserved 3-tile RUN per player; no test/debug HTTP endpoint or production-source hook was added. Raw clients finished first and second while canonical phase stayed PLAYING. A real Web player tapped 10/11/12 and submitted; final ranks 1..4, auto-last and viewer-private racks appeared in both browsers. Host close/reopen passed. Same-room rematch and fresh 4-player start passed; new racks were 14 and the table empty. A second actual Web finish/rematch passed without refresh.

Browser testing caught and fixed mixed-scope gameRevision ordering on FINISHED→LOBBY; the regression is now automated. Desktop 1280×720 and mobile 390×844 / 320×568 modal layouts were inspected: no horizontal document overflow; controls reachable; native dialog focus/close/reopen worked. The 320px actual tile submission also passed. App console errors/warnings were zero after filtering Chrome-extension warnings. The second profile's native explicit-leave confirm could not be reliably controlled by browser automation; explicit-leave/roster/credential cases were verified by server integration tests, not claimed as completed browser checks.

Final quality gate (2026-09-09): root typecheck PASS; full tests **1587/1587 PASS twice consecutively** (shared 110 / Web 388 / server 1089), zero skipped; production build PASS; production-serving regressions PASS; diff-check PASS. Starting baseline was 1568, so 19 tests were added. Existing tests are retained, with old application expectations updated to the newly approved placement contract; pure legacy scoring tests remain. No dependency changes or HANGUL/GEM/CITY game implementation changes. Vite's existing >500 kB warning remains (main JS 599.71 kB, gzip 170.94 kB). Railway was not deployed.

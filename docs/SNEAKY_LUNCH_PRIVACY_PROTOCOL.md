# SNEAKY_LUNCH privacy and protocol

P21A confirmed contract direction. V2-only; no V1 projection or fake rack/turn owner.

| Information | Self | Other participants | Server |
|---|---|---|---|
| Settings, nickname, presence, progress, caught/forfeited, result | yes | yes | yes |
| Current teacher state/revision | yes | yes | yes |
| Initial countdown end | yes | yes | yes |
| v2 placementOrder / confirmed ranks | yes | yes | yes |
| Future teacher deadline/outcome/pattern/randomness | no | no | yes |
| Session verification/idempotency/storage/scheduler metadata | no | no | yes |

Credentials remain opaque, only in existing credential requests; never URL/log/broadcast. Projection explicitly whitelists public fields, not spreads from canonical state. FINISHED does not reveal hidden teacher history/plans.

Concrete commands: `sneaky:configure` (Host, Lobby, expected room revision, bounded box count/difficulty); `sneaky:eat` (current primary participant, game identity, seen teacher revision, requestId); `sneaky:rematch` (Host, Finished, exact room/game identity/revision). Existing `game:start` starts the game. Payload schemas strict and bounded. Wrong-game/no binding/secondary/stale request fail closed. No client timestamps or requested bite amount.

Public snapshot branches: LOBBY; PLAYING/COUNTDOWN; PLAYING/CLASSROOM; FINISHED. Countdown may expose its start signal deadline; CLASSROOM cannot expose any teacher deadline. Public gameRevision orders snapshots; teacherStateRevision fences fairness. A client that saw BOARD but reaches a later WATCHING revision receives no bite and no catch. A current danger revision catches before rate-limit consideration. Server authoritative order is the Room lane.

Local action success feedback waits for canonical acceptance; no replay on refresh/reconnect. Caught/public messages reveal only existing public status/progress. Result has unique nullable winner, reason and final participant progress/status, no score authority.

Placement upgrade: new games use `sneaky-lunch-rules-v2`, requiring public `placementOrder`; v1 prohibits that field and retains its historical result semantics. v2 adds `PLACEMENT_COMPLETE` and `LAST_PLAYER_STANDING` finish reasons. Winner is placementOrder[0], never a newly calculated score. Placed status is derived by membership in that list, independently of caught/forfeited. New commands are not needed. Adapter validation and explicit projection preserve order across persistence/resume; new game identity clears it on rematch. Fullscreen catch feedback is viewer-local; nobody receives any future teacher data or new private input details.

P21C final wire: three strict concrete events use existing StateSyncWireAck. Successful ACK carries a current whitelisted snapshot; it does not promise a bite. RATE_LIMITED returns unchanged gameplay snapshot, STALE returns existing STALE_GAME_REVISION error. Both receipts are stored atomically without changing gameRevision/roomRevision, so retrying a previously limited tap later cannot turn it into a bite. Only internal storage revision advances for receipt-only commits. Configuration/rematch use exact room revision, rematch additionally gameId/gameRevision; eat deliberately omits global gameRevision to avoid cross-player starvation. Projectors never emit teacher transitionId, phaseStartedAt, nextTransitionAt, plannedOutcome, consecutiveFakes or lastAcceptedEatAt.

Required audits: recursive forbidden future-plan keys; all phase snapshots; malformed payloads; old-game/replay conflicts; cross-game rejection; transition-vs-tap/forfeit-vs-resume/Host-vs-resume races. UI hides running numeric bite counters by product choice, not by a privacy guarantee: canonical progress remains public. The subsequent classroom redesign permits a transient accepted-bite delta and public other-seat eating motion. Both derive from increasing public gameRevision/progress in the same viewer/game; initial, replayed, stale and resumed baseline snapshots do not play old effects. No new wire fields or secrets are added.

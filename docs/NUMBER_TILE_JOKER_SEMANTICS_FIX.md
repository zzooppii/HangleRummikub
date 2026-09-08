# NUMBER_TILE Joker Semantics Fix

> 상태: SOURCE COMPLETE / MANUAL BROWSER VERIFICATION PENDING
> 범위: NUMBER_TILE domain, Number protocol-v1 command payload, PlatformSnapshotV2 Number branch, Number Web
> 보존: Hangul V1/V2, event names, `protocolVersion = 1`, `snapshotVersion = 2`, GEM_CARD P11A

## 1. Problem and decision

The earlier model persisted a Joker placement's `assignedNumber` and `assignedColor` and treated a later role change as recovery that required an exact ordinary replacement. Actual whole-Table play showed two defects:

- a physically conserved Joker could not move from one valid role/meld to another unless the old face was first replaced;
- a GROUP forced the player/server to choose one arbitrary unused color even though the rule only requires that some unused color exist.

The canonical correction separates physical identity from current role. A Joker's immutable fact is its opaque physical `tileId`. Its number/color meaning is derived only while validating its containing final meld. Previous role is not gameplay state and does not constrain a later valid rearrangement.

## 2. Bare physical placement

The Number-only proposed/public Table placement is:

```ts
type NumberTileJokerPlacement = {
  tileId: TileId;
  kind: "JOKER";
};
```

It has no `assignedNumber` or `assignedColor`. Physical IDs remain exact and opaque; duplicate, missing, forged and unauthorized references fail closed.

## 3. GROUP semantics

A GROUP is valid when:

- total size is 3–4;
- at most one Joker exists;
- ordinary Tiles all have the same number;
- ordinary colors are distinct;
- with a Joker, at least one of the four colors is unused.

The Joker number is the ordinary common number. Its color is existential and is neither selected nor persisted.

| Meld | Result |
| --- | --- |
| `R10, B10, J` | valid; Joker is a colorless number-10 wildcard |
| `R10, B10, K10, J` | valid |
| `R10, B10, O10, J` | valid |
| `R10, R10, J` | invalid duplicate ordinary color |
| `R10, B10, K10, O10, J` | invalid size 5 |

Adding `K10` or `O10` to `R10, B10, J` cannot conflict with a previous arbitrary color because no such canonical assignment exists.

## 4. RUN semantics

The later [unordered RUN correction](./NUMBER_TILE_UNORDERED_RUN_FIX.md) supersedes the original raw-position-first rule. RUN legality uses the physical set: distinct ordinary numbers of one color, at most one Joker, and a complete consecutive range of the meld's size within 1–13. If exactly one range exists, its missing number is the Joker role regardless of click/drop order. The server commits ascending order with the same physical IDs.

| Ordered RUN | Derived role |
| --- | --- |
| `J, R5, R6` | Joker = RED 4 |
| `R4, J, R6` | Joker = RED 5 |
| `R5, R6, J` | Joker = RED 7 |
| `O7, J, O9, O6` | unique Joker = ORANGE 8; normalize to `O6, O7, J, O9` |
| `R4, J, R7` | invalid; no consecutive interpretation |

Only genuinely ambiguous sets consult already-valid ascending array order as numeric intent: `J,R5,R6` means 4 and `R5,R6,J` means 7. For an unresolved order such as `R6,J,R5`, the Web offers only the two numeric choices and records the choice by ordering the same physical placements. Unresolved Submit fails closed. No color picker or persistent assignment field exists; unique solutions never require a picker.

## 5. Final-state rearrangement

The server validates pre-turn canonical Table versus submitted final ProposedTable, not an intermediate manipulation procedure.

1. Every pre-turn physical Tile ID remains exactly once in the final Table.
2. This includes every pre-turn Joker `tileId`.
3. A pre-turn Table Tile, including a Joker, cannot move to a rack or pool.
4. Every final GROUP/RUN is valid under the current meld-derived semantics.
5. Duplicate, missing, forged or unauthorized physical IDs are rejected.
6. A successful normal Submit still uses at least one physical Tile from the actor's pre-turn rack.

There is no exact old-face replacement requirement. The same Joker may change number, color and meld kind:

```text
before: RUN(R4, J1, R6)             # J1 currently derives as RED 5
final:  RUN(B8, J1, B10)            # J1 now derives as BLUE 9
```

This role change is legal when all other pre-turn Tiles are conserved elsewhere, all final melds are valid and the actor-rack contribution rule is satisfied. `J1` disappearing, appearing twice, being placed in the actor rack, or belonging to an invalid final meld remains illegal.

## 6. Initial meld value

The server calculates initial meld value from canonical ordinary faces plus each meld-derived Joker number.

- GROUP: Joker value equals the common group number.
- RUN: Joker value comes from the unique consecutive range, or the explicitly resolved ordered range when there are two valid possibilities.

Therefore the 30-point threshold remains deterministic without client-claimed assignment. For example `R10, R11, J` is an ordered RUN worth 33 because the Joker derives as 12.

## 7. Ownership and compatibility

- Number RuleEngine resolves canonical physical Tiles and independently validates kind, role, final meld validity, conservation and rack contribution.
- The Web only derives classification/role hints. Moving a Joker re-derives the preview and cannot leave stale assignment state.
- Persistence/state cloning accepts only the exact bare placement shape; obsolete assignment-bearing state fails closed instead of being silently normalized. Valid round trips do not invent an arbitrary GROUP color.
- Number command and Number V2 Table schemas remove Joker assignment fields.

The narrow Number DTO change intentionally avoids fake compatibility. These outer contracts do not change:

- `protocolVersion = 1`
- `snapshotVersion = 2`
- `number:submit`, `number:draw`, `number:pass`, `state:snapshot`
- `supportedSnapshotVersions`, `supportedGameTypes`
- `/room/{ROOM_CODE}` and platform command envelopes
- all Hangul V1/V2 branches

A strict old Number browser that already loaded the assignment-required schema may reject the corrected snapshot/ack; an old `number:submit` carrying assignment fields is also rejected by the corrected strict server. The browser must refresh to load the new Web bundle. This is an explicit open-client limitation, not a protocol-version rename. Deployment/restart still loses process-memory Rooms under the existing platform limitation.

## 8. Required regression boundary

- GROUP: colorless 3/4-Tile cases, duplicate ordinary color, size 5, no picker, extension without old-color conflict.
- RUN: unordered unique solutions, middle and both edge Joker roles, genuine numeric ambiguity, out-of-range/gap rejection, no color picker.
- Rearrangement: previous role change, GROUP↔RUN, exact-once Joker conservation, Joker-to-rack rejection, missing/duplicate old Table Tile, rack contribution and invalid final meld.
- Shared/persistence/projection: strict bare Joker schema, round-trip clone, public bare identity and no synthetic assignment.
- Web: automatic classification, move/drag role re-derivation, Undo/Reset/Submit and no stale picker state.
- Isolation: Hangul wire/rules and GEM_CARD P11A remain untouched; GEM_CARD P11B is not started by this correction.

The canonical rule details remain in [NUMBER_TILE_GAME_RULES.md](./NUMBER_TILE_GAME_RULES.md). Domain, wire, server and Web ownership are synchronized in [NUMBER_TILE_DOMAIN_DESIGN.md](./NUMBER_TILE_DOMAIN_DESIGN.md), [NUMBER_TILE_PROTOCOL_GATE.md](./NUMBER_TILE_PROTOCOL_GATE.md), [NUMBER_TILE_SERVER_INTEGRATION.md](./NUMBER_TILE_SERVER_INTEGRATION.md), and [NUMBER_TILE_WEB_IMPLEMENTATION.md](./NUMBER_TILE_WEB_IMPLEMENTATION.md).

## 9. Source checkpoint and manual production verification

This section records the original 1,045-test checkpoint. The subsequent unordered RUN follow-up and its separate validation/deployment status are recorded in [NUMBER_TILE_UNORDERED_RUN_FIX.md](./NUMBER_TILE_UNORDERED_RUN_FIX.md).

The user accepts the Codex Chrome connection limitation as a pending manual verification item rather than a source commit/push blocker. The final root typecheck, all 1,045 tests (shared 76, Web 179, server 790), build and diff-check pass; no tests are skipped. The production-serving regression passes all six cases. Direct two-window Chrome verification has not been performed by Codex.

Deployment status remains `DEPLOYMENT_PENDING_USER_ACTION`. The user will manually deploy the latest commit to Railway, refresh existing Number browser tabs and test a new Room using two Chrome windows. No Railway deployment, scale or configuration change is part of this checkpoint. The existing single-process in-memory runtime loses active Rooms/Games/sessions on redeploy. GEM_CARD P11B must wait until the user's manual browser verification is complete.

Manual checklist (`R` = RED, `B` = BLUE, `K` = BLACK, `O` = ORANGE, `J` = the same physical Joker):

1. **GROUP basic Joker:** `R10 / B10 / J` has no color picker and is a valid combination.
2. **GROUP expansion:** add `K10` to produce `R10 / B10 / K10 / J`; it remains valid without a previous arbitrary color conflict. Check the `O10` variant when possible.
3. **RUN middle Joker:** `R4 / J / R6` has no color picker, derives Joker number 5 and is valid.
4. **Existing Table Joker rearrangement:** replace the old `R4 / J / R6` with `R4 / R5 / R6` and use that same physical Joker in another valid GROUP or RUN. With Table conservation and rack contribution satisfied, Submit succeeds without the old exact-recovery error.
5. **Existing Table Joker to rack:** an attempted Submit that removes the canonical Table Joker from the final Table must be rejected by the server. The normal editor also prevents this move.
6. **Invalid Joker meld:** the server rejects an invalid final Joker meld; the normal editor may block submission before it reaches the server.
7. **Existing browser compatibility:** after deployment, refresh tabs that loaded the previous Number V2 Joker schema, then verify using a newly created Room. The old loaded browser bundle is not assumed compatible with the changed Number Joker representation.

Cases 5 and 6 already have automated server rejection coverage. If the normal UI prevents the malformed action, record that as a UI guard rather than claiming a new manual server rejection observation. No debug endpoint or browser gameplay bypass is introduced for manual testing.

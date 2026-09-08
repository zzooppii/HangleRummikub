import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { GameIdSchema, TileIdSchema, TurnIdSchema } from "@hangul-rummikub/shared";

import {
  addNumberTileDraftMeld,
  appendNumberTileDraftTileToMeld,
  canEditNumberTileTurnDraft,
  createNumberTileTurnDraft,
  placeNumberTileDraftTileInNewMeld,
  resetNumberTileTurnDraft,
  returnNumberTileDraftTileToRack,
  undoNumberTileTurnDraft,
  type NumberTileTurnDraft,
  type NumberTileTurnDraftEditResult,
} from "../features/number-tile/number-tile-turn-draft.js";
import { numberTileTableTap } from "../features/number-tile/number-tile-tap.js";
import { classifyNumberTileDraftMeld } from "../features/number-tile/number-tile-ux.js";
import { serializeNumberTileTurnDraft } from "./number-tile-actions.js";
import { numberBoardFixture } from "./number-board-test-fixture.js";

const tileId = (value: string) => v.parse(TileIdSchema, value);

/** The reported release blocker: canonical R2/R3/R4/R5 and rack B2/K2. */
function rearrangementSnapshot() {
  const snapshot = numberBoardFixture(1, 2, 4);
  snapshot.game.table.melds = [{ kind: "RUN", tiles: ([2, 3, 4, 5] as const).map(number => ({
    tileId: tileId(`r${number}`), kind: "ORDINARY", color: "RED", number,
  })) }];
  snapshot.game.privateState.rack = [
    { tileId: tileId("b2"), kind: "ORDINARY", color: "BLUE", number: 2 },
    { tileId: tileId("k2"), kind: "ORDINARY", color: "BLACK", number: 2 },
  ];
  return snapshot;
}

function baseDraft(): NumberTileTurnDraft {
  const draft = createNumberTileTurnDraft(rearrangementSnapshot());
  assert.ok(draft);
  return draft;
}

function edited(result: NumberTileTurnDraftEditResult): NumberTileTurnDraft {
  assert.ok(result.ok);
  return result.draft;
}

function twoTileDestination(base: NumberTileTurnDraft): NumberTileTurnDraft {
  const one = edited(placeNumberTileDraftTileInNewMeld(base, tileId("b2")));
  return edited(appendNumberTileDraftTileToMeld(one, tileId("k2"), 1));
}

const expectedPayload = {
  melds: [
    { kind: "RUN", tiles: ["r3", "r4", "r5"].map(id => ({ tileId: id, kind: "ORDINARY" })) },
    { kind: "GROUP", tiles: ["r2", "b2", "k2"].map(id => ({ tileId: id, kind: "ORDINARY" })) },
  ],
};

for (const [label, order] of [
  ["A: R2 → B2 → K2", ["r2", "b2", "k2"]],
  ["B: B2 → K2 → canonical R2", ["b2", "k2", "r2"]],
  ["C: B2 → canonical R2 → K2", ["b2", "r2", "k2"]],
] as const) {
  test(`flexible rearrangement order ${label} yields the same final physical Table and payload`, () => {
    const base = baseDraft();
    const before = structuredClone(base);
    let draft = edited(placeNumberTileDraftTileInNewMeld(base, tileId(order[0])));
    assert.equal(classifyNumberTileDraftMeld(draft.table.melds[1]!).status, "INCOMPLETE");
    for (const id of order.slice(1)) {
      draft = edited(appendNumberTileDraftTileToMeld(draft, tileId(id), 1));
    }
    assert.deepEqual(draft.table.melds.map(meld => meld.tiles.map(tile => tile.tileId)), [
      ["r3", "r4", "r5"], ["r2", "b2", "k2"],
    ]);
    assert.deepEqual(draft.table.melds.map(meld => classifyNumberTileDraftMeld(meld).status), ["VALID", "VALID"]);
    assert.deepEqual(serializeNumberTileTurnDraft(draft), expectedPayload);
    assert.equal(draft.history.length, 3);
    assert.equal(draft.availableRackTiles.length, 0);
    assert.deepEqual(base, before);
  });
}

test("empty and one-tile local destinations stay editable without accumulating empty melds", () => {
  const empty = edited(addNumberTileDraftMeld(baseDraft()));
  assert.equal(classifyNumberTileDraftMeld(empty.table.melds[1]!).status, "INCOMPLETE");
  assert.strictEqual(edited(addNumberTileDraftMeld(empty)), empty);
  const one = edited(appendNumberTileDraftTileToMeld(empty, tileId("b2"), 1));
  assert.equal(classifyNumberTileDraftMeld(one.table.melds[1]!).status, "INCOMPLETE");
  const two = edited(appendNumberTileDraftTileToMeld(one, tileId("k2"), 1));
  assert.deepEqual(two.table.melds[1]!.tiles.map(tile => tile.tileId), ["b2", "k2"]);
  assert.equal(classifyNumberTileDraftMeld(two.table.melds[1]!).status, "INCOMPLETE");
  assert.equal(serializeNumberTileTurnDraft(two), null);
});

test("mobile destination-tile taps move canonical R2 into an incomplete B2/K2 meld", () => {
  const draft = twoTileDestination(baseDraft());
  const before = structuredClone(draft);
  const selection = numberTileTableTap(draft, null, tileId("r2"), true);
  assert.deepEqual(selection, { kind: "SELECT", tileId: "r2", meldIndex: 0 });
  for (const destinationId of ["b2", "k2"]) {
    const intent = numberTileTableTap(draft, tileId("r2"), tileId(destinationId), true);
    assert.equal(intent.kind, "MOVE");
    if (intent.kind !== "MOVE") throw new Error("Expected incomplete destination move intent.");
    const moved = edited(appendNumberTileDraftTileToMeld(draft, intent.tileId, intent.meldIndex));
    assert.deepEqual(serializeNumberTileTurnDraft(moved), expectedPayload);
    assert.deepEqual(draft, before);
  }
});

test("whole-meld placement used by desktop drop accepts incomplete destinations without changing other identities", () => {
  const draft = twoTileDestination(baseDraft());
  assert.equal(classifyNumberTileDraftMeld(draft.table.melds[1]!).status, "INCOMPLETE");
  const moved = edited(appendNumberTileDraftTileToMeld(draft, tileId("r2"), 1));
  assert.deepEqual(serializeNumberTileTurnDraft(moved), expectedPayload);
  assert.deepEqual([...moved.table.melds.flatMap(meld => meld.tiles.map(tile => tile.tileId))].sort(), ["b2", "k2", "r2", "r3", "r4", "r5"]);
});

test("temporarily invalid melds can still receive and release physical tiles until final structure is valid", () => {
  const base = baseDraft();
  let draft = twoTileDestination(base);
  draft = edited(appendNumberTileDraftTileToMeld(draft, tileId("r3"), 1));
  assert.equal(classifyNumberTileDraftMeld(draft.table.melds[1]!).status, "INVALID");
  const before = structuredClone(draft);
  draft = edited(appendNumberTileDraftTileToMeld(draft, tileId("r2"), 1));
  assert.equal(classifyNumberTileDraftMeld(draft.table.melds[1]!).status, "INVALID");
  assert.equal(serializeNumberTileTurnDraft(draft), null);
  assert.deepEqual(edited(undoNumberTileTurnDraft(draft)), before);
  draft = edited(appendNumberTileDraftTileToMeld(draft, tileId("r3"), 0));
  assert.deepEqual(serializeNumberTileTurnDraft(draft), expectedPayload);
});

test("incomplete-destination move Undo restores the exact prior draft and Reset restores canonical baseline", () => {
  const base = baseDraft();
  const incomplete = twoTileDestination(base);
  const before = structuredClone(incomplete);
  const moved = edited(appendNumberTileDraftTileToMeld(incomplete, tileId("r2"), 1));
  assert.equal(moved.history.length, incomplete.history.length + 1);
  assert.deepEqual(edited(undoNumberTileTurnDraft(moved)), before);
  assert.deepEqual(resetNumberTileTurnDraft(moved), base);
});

test("flexible destinations do not allow fabricated/private IDs or canonical Table-to-Rack moves", () => {
  const draft = twoTileDestination(baseDraft());
  const before = structuredClone(draft);
  for (const id of ["missing-id", "forged-id", "opponent-private-id"]) {
    assert.deepEqual(appendNumberTileDraftTileToMeld(draft, tileId(id), 1), {
      ok: false, error: { code: "TILE_NOT_FOUND" },
    });
  }
  assert.deepEqual(returnNumberTileDraftTileToRack(draft, tileId("r2")), {
    ok: false, error: { code: "CANONICAL_TILE_CANNOT_RETURN_TO_RACK" },
  });
  assert.deepEqual(appendNumberTileDraftTileToMeld(draft, tileId("r2"), 999), {
    ok: false, error: { code: "MELD_NOT_FOUND" },
  });
  assert.deepEqual(draft, before);
  const duplicate = rearrangementSnapshot();
  duplicate.game.privateState.rack[0] = { ...duplicate.game.privateState.rack[0]!, tileId: tileId("r2") };
  assert.equal(createNumberTileTurnDraft(duplicate), null);
});

test("flexible editing preserves initial-table locks, current-session checks and stale game/turn rejection", () => {
  const snapshot = rearrangementSnapshot();
  const draft = twoTileDestination(baseDraft());
  assert.equal(canEditNumberTileTurnDraft(draft, snapshot, true), true);
  assert.equal(canEditNumberTileTurnDraft(draft, snapshot, false), false);
  for (const changed of [
    { ...snapshot, game: { ...snapshot.game, gameId: v.parse(GameIdSchema, "another-game") } },
    { ...snapshot, game: { ...snapshot.game, turn: { ...snapshot.game.turn, turnId: v.parse(TurnIdSchema, "another-turn") } } },
    { ...snapshot, game: { ...snapshot.game, turn: { ...snapshot.game.turn, activePlayerId: snapshot.room.players[1]!.playerId } } },
  ]) {
    assert.equal(canEditNumberTileTurnDraft(draft, changed, true), false);
  }
  assert.deepEqual(numberTileTableTap(draft, tileId("r2"), tileId("b2"), false), { kind: "IGNORE" });
  const initial = rearrangementSnapshot();
  initial.game.playerStates[0]!.initialMeldCompleted = false;
  const initialDraft = createNumberTileTurnDraft(initial);
  assert.ok(initialDraft);
  const incomplete = twoTileDestination(initialDraft);
  assert.deepEqual(appendNumberTileDraftTileToMeld(incomplete, tileId("r2"), 1), {
    ok: false, error: { code: "INITIAL_MELD_TABLE_LOCKED" },
  });
  assert.deepEqual(numberTileTableTap(incomplete, null, tileId("r2"), true), { kind: "IGNORE" });
});

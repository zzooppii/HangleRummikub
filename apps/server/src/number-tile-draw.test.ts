import assert from "node:assert/strict";
import test from "node:test";

import { TileIdSchema } from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { drawSelectedNumberTile } from "./games/number-tile/domain/draw.js";

function tileId(value: string) {
  return parse(TileIdSchema, value);
}

test("선택된 physical Tile 한 장만 pool에서 rack으로 옮긴다", () => {
  const first = tileId("number-draw-first");
  const selected = tileId("number-draw-selected");
  const last = tileId("number-draw-last");
  const existingRackTile = tileId("number-draw-rack");
  const pool = Object.freeze([first, selected, last]);
  const rack = Object.freeze([existingRackTile]);

  const result = drawSelectedNumberTile(pool, rack, selected);

  assert.equal(result.drawnTileId, selected);
  assert.deepEqual(result.poolTileIds, [first, last]);
  assert.deepEqual(result.rackTileIds, [existingRackTile, selected]);
  assert.deepEqual(pool, [first, selected, last]);
  assert.deepEqual(rack, [existingRackTile]);
  assert.notEqual(result.poolTileIds, pool);
  assert.notEqual(result.rackTileIds, rack);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.poolTileIds));
  assert.ok(Object.isFrozen(result.rackTileIds));
});

test("canonical pool에 없는 selected Tile은 draw하지 않는다", () => {
  assert.throws(
    () =>
      drawSelectedNumberTile(
        [tileId("number-draw-present")],
        [],
        tileId("number-draw-absent"),
      ),
    /not in the canonical pool/u,
  );
});

test("duplicate pool/rack 또는 두 location의 overlap은 fail-closed한다", () => {
  const duplicate = tileId("number-draw-duplicate");
  const other = tileId("number-draw-other");

  assert.throws(
    () => drawSelectedNumberTile([duplicate, duplicate], [], duplicate),
    /pool contains a duplicate/u,
  );
  assert.throws(
    () => drawSelectedNumberTile([duplicate], [other, other], duplicate),
    /rack contains a duplicate/u,
  );
  assert.throws(
    () => drawSelectedNumberTile([duplicate], [duplicate], duplicate),
    /cannot be in pool and rack/u,
  );
});

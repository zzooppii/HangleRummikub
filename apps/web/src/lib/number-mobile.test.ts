import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as v from "valibot";
import { TileIdSchema } from "@hangul-rummikub/shared";
import { NumberTilePlayingScreen } from "../features/number-tile/NumberTilePlayingScreen.js";
import { numberTileTableTap } from "../features/number-tile/number-tile-tap.js";
import { appendNumberTileDraftTileToMeld, createNumberTileTurnDraft, findNumberTileDraftTile, placeNumberTileDraftTileInNewMeld, resetNumberTileTurnDraft, returnNumberTileDraftTileToRack, undoNumberTileTurnDraft, type NumberTileTurnDraftEditResult } from "../features/number-tile/number-tile-turn-draft.js";
import { numberTileDraftMeldIsValid, classifyNumberTileDraftMeld } from "../features/number-tile/number-tile-ux.js";
import { serializeNumberTileTurnDraft } from "./number-tile-actions.js";
import { numberBoardFixture, numberBoardProps } from "./number-board-test-fixture.js";

const id = (value: string) => v.parse(TileIdSchema, value);
const edited = (result: NumberTileTurnDraftEditResult) => { assert.ok(result.ok); return result.draft; };
const editor = readFileSync(new URL("../../src/features/number-tile/NumberTileTurnDraftEditor.tsx", import.meta.url), "utf8");
const screen = readFileSync(new URL("../../src/features/number-tile/NumberTilePlayingScreen.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../src/features/number-tile/number-tile-board.css", import.meta.url), "utf8");

test("mobile Table tap selects/cancels exact physical identity without changing history", () => {
  const draft = createNumberTileTurnDraft(numberBoardFixture())!;
  const before = JSON.stringify(draft);
  assert.deepEqual(numberTileTableTap(draft, null, id("board-0-0"), true), { kind: "SELECT", tileId: "board-0-0", meldIndex: 0 });
  assert.deepEqual(numberTileTableTap(draft, id("board-0-0"), id("board-0-0"), true), { kind: "CANCEL" });
  assert.equal(JSON.stringify(draft), before);
  assert.equal(draft.history.length, 0);
});

test("tapping any destination tile moves the already selected tile, not the destination physical copy", () => {
  const draft = createNumberTileTurnDraft(numberBoardFixture())!;
  const intent = numberTileTableTap(draft, id("board-0-0"), id("board-1-0"), true);
  assert.equal(intent.kind, "MOVE");
  if (intent.kind !== "MOVE") throw new Error("expected destination intent");
  const next = edited(appendNumberTileDraftTileToMeld(draft, intent.tileId, intent.meldIndex));
  assert.equal(next.history.length, 1);
  assert.ok(next.table.melds[1]!.tiles.some(t => t.tileId === id("board-0-0")));
  assert.ok(next.table.melds[1]!.tiles.some(t => t.tileId === id("board-1-0")));
  assert.deepEqual(edited(undoNumberTileTurnDraft(next)).table, draft.table);
});

test("tap-only split and merge of a public six-tile run conserve all IDs and use one history entry per move", () => {
  const base = createNumberTileTurnDraft(numberBoardFixture(1, 14, 6))!;
  let draft = edited(placeNumberTileDraftTileInNewMeld(base, id("board-0-3")));
  draft = edited(appendNumberTileDraftTileToMeld(draft, id("board-0-4"), 1));
  draft = edited(appendNumberTileDraftTileToMeld(draft, id("board-0-5"), 1));
  assert.deepEqual(draft.table.melds.map(m => m.tiles.length), [3, 3]);
  assert.ok(draft.table.melds.every(numberTileDraftMeldIsValid));
  assert.equal(draft.history.length, 3);
  for (const tile of [...draft.table.melds[1]!.tiles]) draft = edited(appendNumberTileDraftTileToMeld(draft, tile.tileId, 0));
  assert.deepEqual(draft.table.melds, base.table.melds);
  assert.equal(draft.history.length, 6);
  assert.deepEqual(resetNumberTileTurnDraft(draft).table, base.table);
});

test("tap extension/rebuild keeps duplicate face copies distinct and rack return restores canonical rack order", () => {
  const snapshot = numberBoardFixture(1, 14, 3);
  snapshot.game.privateState.rack[0] = { tileId: id("rack-0"), kind: "ORDINARY", color: "RED", number: 4 };
  snapshot.game.privateState.rack[1] = { tileId: id("rack-1"), kind: "ORDINARY", color: "RED", number: 4 };
  const base = createNumberTileTurnDraft(snapshot)!;
  let draft = edited(appendNumberTileDraftTileToMeld(base, id("rack-0"), 0));
  assert.ok(numberTileDraftMeldIsValid(draft.table.melds[0]!));
  assert.ok(draft.availableRackTiles.some(t => t.tileId === id("rack-1")));
  draft = edited(placeNumberTileDraftTileInNewMeld(draft, id("board-0-2")));
  draft = edited(appendNumberTileDraftTileToMeld(draft, id("board-0-2"), 0));
  draft = edited(returnNumberTileDraftTileToRack(draft, id("rack-0")));
  assert.deepEqual(draft.availableRackTiles, base.availableRackTiles);
  assert.deepEqual(draft.table, base.table);
});

test("canonical ordinary/Joker Rack attempts reject without mutation, while rack-origin returns succeed", () => {
  const snapshot = numberBoardFixture(1);
  snapshot.game.table.melds[0]!.tiles[1] = { tileId: id("public-joker"), kind: "JOKER" };
  const base = createNumberTileTurnDraft(snapshot)!;
  const before = JSON.stringify(base);
  for (const tileId of [id("board-0-0"), id("public-joker")]) {
    assert.deepEqual(returnNumberTileDraftTileToRack(base, tileId), { ok: false, error: { code: "CANONICAL_TILE_CANNOT_RETURN_TO_RACK" } });
  }
  assert.equal(JSON.stringify(base), before);
  const next = edited(placeNumberTileDraftTileInNewMeld(base, id("rack-0")));
  assert.deepEqual(edited(returnNumberTileDraftTileToRack(next, id("rack-0"))).availableRackTiles, base.availableRackTiles);
});

test("opponent/locked/initial-registration Table taps are ignored; first rack tap still uses atomic new meld", () => {
  const snapshot = numberBoardFixture();
  const draft = createNumberTileTurnDraft(snapshot)!;
  assert.deepEqual(numberTileTableTap(draft, null, id("board-0-0"), false), { kind: "IGNORE" });
  assert.deepEqual(numberTileTableTap(null, null, id("board-0-0"), true), { kind: "IGNORE" });
  snapshot.game.playerStates[0]!.initialMeldCompleted = false;
  assert.deepEqual(numberTileTableTap(createNumberTileTurnDraft(snapshot), null, id("board-0-0"), true), { kind: "IGNORE" });
  const initial = createNumberTileTurnDraft(numberBoardFixture(0))!;
  const next = edited(placeNumberTileDraftTileInNewMeld(initial, id("rack-0")));
  assert.equal(next.history.length, 1);
  assert.equal(next.table.melds[0]!.tiles[0]!.tileId, id("rack-0"));
});

test("mobile moves preserve colorless GROUP, unique unordered orange RUN and freely rederived Joker role", () => {
  const snapshot = numberBoardFixture(1);
  snapshot.game.table.melds = [{ kind: "GROUP", tiles: [
    { tileId: id("r10"), kind: "ORDINARY", color: "RED", number: 10 },
    { tileId: id("b10"), kind: "ORDINARY", color: "BLUE", number: 10 },
    { tileId: id("j"), kind: "JOKER" },
  ] }];
  // Physical faces come from this test rack; local preview never changes wire identity.
  const rack = ([7, 9, 6] as const).map((number, i) => ({ tileId: id(`orange-${i}`), kind: "ORDINARY" as const, color: "ORANGE" as const, number }));
  snapshot.game.privateState.rack = [...rack, { tileId: id("k10"), kind: "ORDINARY", color: "BLACK", number: 10 }];
  const base = createNumberTileTurnDraft(snapshot)!;
  assert.ok(numberTileDraftMeldIsValid(base.table.melds[0]!));
  let draft = edited(placeNumberTileDraftTileInNewMeld(base, id("j")));
  for (const tile of rack) draft = edited(appendNumberTileDraftTileToMeld(draft, tile.tileId, 1));
  draft = edited(appendNumberTileDraftTileToMeld(draft, id("k10"), 0));
  const run = draft.table.melds[1]!;
  const result = classifyNumberTileDraftMeld(run);
  assert.equal(result.status, "VALID");
  if (result.status === "VALID") assert.equal(result.interpretation.jokerRole?.number, 8);
  assert.deepEqual(run.tiles.map(t => t.kind === "JOKER" ? "J" : t.number), [6, 7, "J", 9]);
  assert.equal(findNumberTileDraftTile(draft, id("j"))?.tile.tileId, id("j"));
  assert.doesNotMatch(JSON.stringify(run), /assignedColor|assignedNumber/);
  assert.ok(draft.table.melds.every(numberTileDraftMeldIsValid));
  const payload = serializeNumberTileTurnDraft(draft);
  assert.notEqual(payload, null);
  assert.doesNotMatch(JSON.stringify(payload), /selectedTile|activeMeld|draggedTile|assignedColor/);
});

test("mobile HUD is a single existing timer with fixed safe-area space and threshold-only announcements", () => {
  const html = renderToStaticMarkup(createElement(NumberTilePlayingScreen, numberBoardProps()));
  assert.equal((html.match(/role="timer"/g) ?? []).length, 1);
  assert.match(html, /aria-live="off"/);
  assert.match(css, /\.number-turn-banner \{ position:fixed; z-index:50; top:0/);
  assert.match(css, /env\(safe-area-inset-top, 0px\)/);
  assert.match(css, /padding:calc\(var\(--number-mobile-hud-height\) \+ 10px\)/);
  assert.match(css, /scroll-margin-top:calc\(var\(--number-mobile-hud-height\)/);
  assert.match(screen, /isMyTurn && countdown.remainingSeconds <= 10/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test("mobile tap surfaces, selection helper, cancel, Rack guard and lifecycle cleanup are actually wired", () => {
  assert.match(editor, /numberTileTableTap\(draft, selectedTileId, tileId, props.controller.canEdit\)/);
  assert.match(editor, /intent.kind === "MOVE"[\s\S]*?activateMeld\(intent.meldIndex\)/);
  assert.match(editor, /data-number-drop-new-meld\s+onClick=/);
  assert.match(editor, /data-number-drop-rack\s+onClick=/);
  assert.match(editor, /선택 취소/);
  assert.match(editor, /if \(!props.controller.canEdit\) \{\s+setSelectedTileId\(null\)/);
  assert.match(editor, /event.pointerType !== "mouse"/);
  assert.match(editor, /releasePointerCapture/);
  assert.match(editor, /공개 테이블의 타일은 내 랙으로 가져올 수 없습니다/);
  assert.doesNotMatch(editor, /onTouchMove|touch-action:\s*none/);
});

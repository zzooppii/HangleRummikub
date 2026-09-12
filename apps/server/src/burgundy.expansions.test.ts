import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { BURGUNDY_DEFAULT_SETTINGS, BURGUNDY_EXPANSION_CATALOG, GameIdSchema, PlayerIdSchema, TileIdSchema, TurnIdSchema, ServerTimeSchema, burgundyBoard, type BurgundyTile, type BurgundyAction } from "@hangul-rummikub/shared";
import { createBurgundyGame, makeBurgundyTiles, applyBurgundyAction, parseBurgundyState, timeoutBurgundy, publicBurgundy, type BurgundyState } from "./games/burgundy/domain/game.js";
import { onBurgundySale, resolveBurgundyImmediateBonuses, expansionGainWorkers, effectiveBurgundyKnowledge, scoreBurgundyExpansion, burgundyExpansionAreaSize, burgundyExpansionBonusPoints, burgundyExpansionMineSilver, burgundyExpansionKnowledgeScore, burgundyExpansionStorageCapacity, onBurgundyPlacement } from "./games/burgundy/domain/expansions.js";
const time = (n: number) => v.parse(ServerTimeSchema, n), turn = (n: number) => v.parse(TurnIdSchema, `expansion-turn-${n}`);
function random(seed = 35) { let n = seed; return { nextInt(max: number) { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n % max; } }; }
function game(n = 2, overrides: Partial<typeof BURGUNDY_DEFAULT_SETTINGS> = {}): BurgundyState {
  let id = 0;
  const settings = { ...BURGUNDY_DEFAULT_SETTINGS, extraTiles: true, whiteCastles: true, inns: true, tradeRoutes: true, shields: true, ...overrides };
  const tileId = () => v.parse(TileIdSchema, `expansion-tile-${++id}`);
  return createBurgundyGame({ gameId: v.parse(GameIdSchema, "expansion-game"), playerIds: Array.from({ length: n }, (_, i) => v.parse(PlayerIdSchema, `expansion-player-${i}`)), tiles: makeBurgundyTiles(tileId, settings), settings, now: time(100), transitionId: turn(0), starter: 0, generateTileId: tileId }, random());
}
function shield(s: BurgundyState, id: number, playerIndex = 0): void {
  const source = s.expansion.shieldDepots.find(depot => depot.includes(id)) ?? s.shieldDiscard;
  assert.ok(source.includes(id)); source.splice(source.indexOf(id), 1);
  s.players[playerIndex]!.extension.shields.push({ shieldId: id, castleCellId: s.players[playerIndex]!.board[0]!.cellId, copiedPlayerId: null });
}
function extract(s: BurgundyState, kind: string): BurgundyTile {
  const tile = s.inventory.find(t => t.kind === kind && !s.players.some(p => p.board.some(b => b.tile.tileId === t.tileId) || p.storage.some(t2 => t2.tileId === t.tileId)));
  assert.ok(tile);
  const supplyIndex = s.supply.indexOf(tile.tileId);
  if (supplyIndex >= 0) s.supply.splice(supplyIndex, 1);
  else { const source = [...s.depots, s.blackDepot, s.inns].find(d => d.some(t => t.tileId === tile.tileId)); assert.ok(source); source.splice(source.findIndex(t => t.tileId === tile.tileId), 1); }
  return tile;
}
function knowledge(s: BurgundyState, id: number, index = 0): void {
  const p = s.players[index]!, cell = burgundyBoard(p.boardId).cells.find(c => c.color === "MONASTERY" && !p.board.some(t => t.cellId === c.id)); assert.ok(cell);
  p.board.push({ cellId: cell.id, tile: extract(s, `KNOWLEDGE_${id}`) });
}
function act(s: BurgundyState, action: BurgundyAction): BurgundyState {
  const result = applyBurgundyAction(s, s.activePlayerId, action, time(s.turnStartedAt + 1), turn(s.revision + 1), random());
  if (!result.ok) assert.fail(result.reason); return result.state;
}
test("2019 expansion setups conserve all tiles and assign the printed route/shield counts for 2–4 humans", () => {
  assert.equal(BURGUNDY_EXPANSION_CATALOG.tradeRoutes.length, 12);
  assert.equal(BURGUNDY_EXPANSION_CATALOG.tradeRoutes.every(r => r.length === 3), true);
  for (const n of [2, 3, 4]) {
    const s = game(n);
    assert.equal(s.inventory.length, 182);
    assert.equal(s.players.every(p => p.extension.tradeRoute.length === (n === 2 ? 15 : n === 3 ? 12 : 9)), true);
    assert.equal(s.expansion.shieldDepots.flat().length, n * 3);
    assert.equal(s.expansion.shieldDepots.flat().length + s.shieldDiscard.length, 18);
    assert.doesNotThrow(() => parseBurgundyState(s));
    assert.equal(JSON.stringify(publicBurgundy(s)).includes("shieldDiscard"), false);
  }
});
test("all enabled 2019 expansions complete every phase by timeout for 2–4 players", () => {
  for (const n of [2, 3, 4]) {
    let s = game(n), count = 0;
    while (s.phase === "PLAYING") { s = timeoutBurgundy(s, time(s.deadlineAt!), turn(++count), random(count)); assert.doesNotThrow(() => parseBurgundyState(s)); assert.ok(count <= 35 * n); }
    assert.equal(s.result?.reason, "COMPLETED");
  }
});
test("trade routes cover every sold tile, reward only matching colors, and never wrap", () => {
  const s = game(), p = s.players[0]!;
  p.extension.tradeRoute = [{ die: 1, bonus: { type: "GAIN", workers: 4, silver: 0, score: 0 } }, { die: 2, bonus: { type: "GAIN", workers: 0, silver: 2, score: 0 } }, { die: 1, bonus: { type: "ACTION", die: null } }];
  const workers = p.workers, silver = p.silver;
  onBurgundySale(s, p, 1, 4); resolveBurgundyImmediateBonuses(s, p);
  assert.equal(p.extension.tradeRouteFilled, 3); assert.deepEqual(p.extension.tradeRouteGoods, [1, 1, 1]); assert.equal(p.workers, workers + 4); assert.equal(p.silver, silver); assert.deepEqual(s.pending, [{ type: "ACTION", die: null }]);
  onBurgundySale(s, p, 1, 10); assert.equal(s.pending.length, 1);
});
test("shield 2 receives each worker another player gains and does not trigger itself", () => {
  const s = game(); shield(s, 2); const p = s.players[0]!, other = s.players[1]!;
  const own = p.workers, theirs = other.workers;
  expansionGainWorkers(s, other, 4); assert.equal(p.workers, own + 4); assert.equal(other.workers, theirs + 4);
  expansionGainWorkers(s, p, 2); assert.equal(p.workers, own + 6); assert.equal(other.workers, theirs + 4);
});
test("shield 6 copies actual monasteries including 27 and subsequently acquired tiles", () => {
  let s = game(); shield(s, 6); knowledge(s, 27, 1);
  s = act(s, { type: "SHIELD_COPY", playerId: s.players[1]!.playerId });
  assert.equal(effectiveBurgundyKnowledge(s, s.players[0]!).includes(27), true);
  knowledge(s, 3, 1); assert.equal(effectiveBurgundyKnowledge(s, s.players[0]!).includes(3), true);
  const before = structuredClone(s), rejected = applyBurgundyAction(s, s.activePlayerId, { type: "SHIELD_COPY", playerId: s.players[1]!.playerId }, time(101), turn(9), random());
  assert.equal(rejected.ok, false); assert.deepEqual(s, before);
});
test("shield 9 replaces monastery 3 coin payout and shield 12 doubles goods points", () => {
  const s = game(); shield(s, 9); shield(s, 12); knowledge(s, 3);
  const p = s.players[0]!; s.settings.tradeRoutes = false;
  p.silver = 2; p.score = 6; p.scoreBreakdown.goodsSales = 6;
  onBurgundySale(s, p, 1, 3); assert.equal(p.silver, 3); assert.equal(p.score, 12); assert.equal(p.scoreBreakdown.goodsSales, 12);
});
test("shield 16 changes one unused die only once in the player's turn", () => {
  let s = game(); shield(s, 16); s = act(s, { type: "SHIELD_DIE", die: 0, value: 6 }); assert.equal(s.players[0]!.dice[0].value, 6);
  assert.equal(applyBurgundyAction(s, s.activePlayerId, { type: "SHIELD_DIE", die: 1, value: 6 }, time(101), turn(9), random()).ok, false);
});
test("shield doubles consume both dice and replace the previous shield on a castle", () => {
  let s = game(); shield(s, 16); const p = s.players[0]!; p.workers = 20;
  const depotIndex = s.expansion.shieldDepots.findIndex(d => d.length > 0), id = s.expansion.shieldDepots[depotIndex]![0]!;
  s = act(s, { type: "TAKE_SHIELD", value: depotIndex + 1, shieldId: id, castleCellId: p.board[0]!.cellId });
  assert.equal(s.players[0]!.dice.every(d => d.used), true); assert.equal(s.players[0]!.extension.shields[0]!.shieldId, id); assert.equal(s.shieldDiscard.includes(16), true);
});
test("shield capacities, scoring multipliers and region limit match 2019", () => {
  const s = game(), p = s.players[0]!;
  for (const id of [4, 7, 8, 10, 13, 17]) shield(s, id);
  assert.equal(burgundyExpansionStorageCapacity(p), Infinity); assert.equal(burgundyExpansionBonusPoints(p, 5), 10); assert.equal(burgundyExpansionMineSilver(p, 2), 4); assert.equal(burgundyExpansionKnowledgeScore(p, 7), 14);
  assert.equal(burgundyExpansionAreaSize(p, 7, 1), 8); assert.equal(burgundyExpansionAreaSize(p, 2, 1), 4);
  assert.equal(scoreBurgundyExpansion(s, p), 88);
});
test("ordinary duchies never receive border rewards from the 2019 expansion", () => {
  const s = game(), p = s.players[0]!; s.settings.borderPosts = true;
  onBurgundyPlacement(s, p); assert.equal(p.score, 0); assert.deepEqual(p.extension.borderConnections, []);
});
test("trade rewards resolve before an already pending phase tribute", () => {
  const s = game(), p = s.players[0]!;
  s.pending = [{ type: "SHIELD_TRIBUTE", playerId: p.playerId }];
  p.extension.tradeRoute = [{ die: 1, bonus: { type: "GAIN", workers: 0, silver: 2, score: 0 } }, { die: 1, bonus: { type: "ACTION", die: null } }];
  const silver = p.silver; onBurgundySale(s, p, 1, 2); resolveBurgundyImmediateBonuses(s, p);
  assert.equal(p.silver, silver + 2); assert.deepEqual(s.pending.map(p => p.type), ["ACTION", "SHIELD_TRIBUTE"]);
});
test("2019 border chains award the first two posts and third post once each", () => {
  const s = game(), p = s.players[0]!; s.settings.borderPosts = true; p.boardId = 11;
  const tile = p.board[0]!.tile;
  // The upper route joins the left and right posts, using one endpoint hex each.
  p.board = [-1, 0, 1, 2, 3].map(q => ({ cellId: `${q},-2`, tile }));
  onBurgundyPlacement(s, p); assert.equal(p.score, 10); assert.deepEqual(p.extension.borderConnections, ["BORDER_2"]);
  onBurgundyPlacement(s, p); assert.equal(p.score, 10);
  s.phaseIndex = 2;
  p.board.push(...[-1, 0, 1, 2, 3].map(r => ({ cellId: `-1,${r}`, tile })));
  onBurgundyPlacement(s, p); assert.equal(p.score, 21); assert.equal(p.bonuses.includes("BORDER"), true); assert.equal(s.expansion.borderFinishers.length, 1);
  onBurgundyPlacement(s, p); assert.equal(p.score, 21);
});
test("disconnected post endpoints cannot earn border points even with shield 18", () => {
  const s = game(), p = s.players[0]!; s.settings.borderPosts = true; p.boardId = 11; shield(s, 18);
  const tile = p.board[0]!.tile; p.board = ["-1,-2", "3,-2", "-2,3"].map(cellId => ({ cellId, tile }));
  onBurgundyPlacement(s, p); assert.equal(p.score, 0); assert.deepEqual(p.extension.borderConnections, []);
});
function placement(kind: string, color: "BUILDING" | "LIVESTOCK", overrides: Partial<typeof BURGUNDY_DEFAULT_SETTINGS> = {}) {
  const s = game(2, overrides), p = s.players[0]!; shield(s, 18);
  const tile = extract(s, kind); p.storage.push(tile);
  const cell = burgundyBoard(p.boardId).cells.find(c => c.color === color)!;
  p.dice[0].value = cell.die;
  return { s, tile, cell, action: { type: "PLACE", die: 0, value: cell.die, tileId: tile.tileId, cellId: cell.id } satisfies BurgundyAction };
}
test("white castles use the shared white die for their immediate extra action", () => {
  const f = placement("WHITE_CASTLE", "BUILDING"); f.s.whiteDie = 5;
  let s = act(f.s, f.action); assert.deepEqual(s.pending[0], { type: "ACTION", die: 5 });
  const workers = s.players[0]!.workers; s = act(s, { type: "EFFECT_WORKERS" });
  assert.equal(s.players[0]!.workers, workers + 2); assert.equal(s.players[0]!.dice[1].used, false);
});
test("crane immediately triggers a chosen building without owning that building", () => {
  const f = placement("CRANE", "BUILDING"); let s = act(f.s, f.action); assert.equal(s.pending[0]?.type, "CRANE");
  const silver = s.players[0]!.silver; s = act(s, { type: "CRANE", building: "BANK" }); assert.equal(s.players[0]!.silver, silver + 2);
});
test("knowledge 28 converts silver into two workers per coin, including shield 2 sharing", () => {
  let s = game(); knowledge(s, 28); shield(s, 2, 1); s.players[0]!.silver = 3;
  const own = s.players[0]!.workers, other = s.players[1]!.workers;
  s = act(s, { type: "BUY_WORKERS", silver: 2 }); assert.equal(s.players[0]!.silver, 1); assert.equal(s.players[0]!.workers, own + 4); assert.equal(s.players[1]!.workers, other + 4); assert.equal(s.players[0]!.dice.some(d => d.used), false);
});
test("geese score one chosen livestock type and score again with later livestock", () => {
  const f = placement("GEESE", "LIVESTOCK"), p = f.s.players[0]!;
  const pasture = burgundyBoard(p.boardId).cells.filter(c => c.color === "LIVESTOCK");
  const cowCell = pasture[1]!, pigCell = pasture[2]!;
  p.board.push({ cellId: cowCell.id, tile: extract(f.s, "COW_3") });
  let s = act(f.s, f.action); s = act(s, { type: "GEESE", animal: "COW" }); assert.equal(s.players[0]!.scoreBreakdown.animals, 5);
  const pig = extract(s, "PIG_4"); s.players[0]!.storage.push(pig); s.players[0]!.dice[1].value = pigCell.die;
  s = act(s, { type: "PLACE", die: 1, value: pigCell.die, tileId: pig.tileId, cellId: pigCell.id }); assert.equal(s.players[0]!.scoreBreakdown.animals, 11);
});
test("shield 3 allows worker tribute for itself and other shields", () => {
  let s = game(); shield(s, 3); shield(s, 9); const p = s.players[0]!; p.silver = 0; p.workers = 3;
  s.pending = [{ type: "SHIELD_TRIBUTE", playerId: p.playerId }];
  s = act(s, { type: "SHIELD_TRIBUTE", keepShieldIds: [3, 9], workers: 2 }); assert.equal(s.players[0]!.workers, 1); assert.equal(s.players[0]!.extension.shields.length, 2); assert.equal(s.pending.length, 0);
});
test("crane may copy the white castle only when that expansion is enabled", () => {
  const enabled = placement("CRANE", "BUILDING"); enabled.s.whiteDie = 4;
  let s = act(enabled.s, enabled.action); s = act(s, { type: "CRANE", building: "WHITE_CASTLE" }); assert.deepEqual(s.pending[0], { type: "ACTION", die: 4 });
  const disabled = placement("CRANE", "BUILDING", { whiteCastles: false }); s = act(disabled.s, disabled.action);
  const before = structuredClone(s), rejected = applyBurgundyAction(s, s.activePlayerId, { type: "CRANE", building: "WHITE_CASTLE" }, time(101), turn(9), random());
  assert.equal(rejected.ok, false); assert.deepEqual(s, before);
});
test("shield 11 cannot turn a trade-route free action into a free shield", () => {
  const s = game(); shield(s, 11); const p = s.players[0]!;
  p.extension.tradeRoute = [{ die: 1, bonus: { type: "ACTION", die: null } }]; onBurgundySale(s, p, 1, 1); resolveBurgundyImmediateBonuses(s, p);
  const depot = s.expansion.shieldDepots.findIndex(d => d.length > 0), id = s.expansion.shieldDepots[depot]![0]!;
  const before = structuredClone(s), rejected = applyBurgundyAction(s, s.activePlayerId, { type: "TAKE_SHIELD", value: depot + 1, shieldId: id, castleCellId: p.board[0]!.cellId }, time(101), turn(9), random());
  assert.equal(rejected.ok, false); assert.deepEqual(s, before);
});
test("a route sale bonus covers its goods before the remaining outer sale goods", () => {
  const s = game(), p = s.players[0]!;
  p.extension.tradeRoute = [{ die: 1, bonus: { type: "SELL" } }, { die: 2, bonus: { type: "GAIN", workers: 0, silver: 0, score: 4 } }, { die: 1, bonus: { type: "GAIN", workers: 4, silver: 0, score: 0 } }];
  onBurgundySale(s, p, 1, 2); resolveBurgundyImmediateBonuses(s, p);
  assert.deepEqual(p.extension.tradeRouteGoods, [1]); assert.equal(s.pending[0]?.type, "SELL");
  assert.equal(publicBurgundy(s).pending.some(effect => effect.type === "TRADE_FILL"), false);
  s.pending.shift(); onBurgundySale(s, p, 2, 1); resolveBurgundyImmediateBonuses(s, p);
  assert.deepEqual(p.extension.tradeRouteGoods, [1, 2, 1]); assert.equal(p.scoreBreakdown.expansion, 4); assert.equal(s.pending.length, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import {
  BURGUNDY_DEFAULT_SETTINGS,
  BURGUNDY_CATALOG,
  BURGUNDY_BOARDS,
  GameIdSchema,
  PlayerIdSchema,
  TileIdSchema,
  TurnIdSchema,
  ServerTimeSchema,
  burgundyBoard,
  burgundyRegion,
  burgundyPlacementReason,
  burgundyWorkerCost,
  type BurgundyTile,
  type BurgundyAction,
} from "@hangul-rummikub/shared";
import {
  makeBurgundyTiles,
  createBurgundyGame,
  applyBurgundyAction,
  parseBurgundyState,
  publicBurgundy,
  timeoutBurgundy,
  cancelBurgundy,
  type BurgundyState,
} from "./games/burgundy/domain/game.js";
const player = (n: number) => v.parse(PlayerIdSchema, `burgundy-player-${n}`),
  time = (n: number) => v.parse(ServerTimeSchema, n),
  turn = (n: number) => v.parse(TurnIdSchema, `burgundy-turn-${n}`);
function random(seed = 7) {
  let n = seed;
  return {
    nextInt(max: number) {
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
      return n % max;
    },
  };
}
function game(
  n = 2,
  overrides: Partial<typeof BURGUNDY_DEFAULT_SETTINGS> = {},
): BurgundyState {
  let id = 0;
  const settings = { ...BURGUNDY_DEFAULT_SETTINGS, ...overrides };
  return createBurgundyGame(
    {
      gameId: v.parse(GameIdSchema, "burgundy-game"),
      playerIds: Array.from({ length: n }, (_, i) => player(i)),
      tiles: makeBurgundyTiles(
        () => v.parse(TileIdSchema, `opaque-${++id}`),
        settings,
      ),
      settings,
      now: time(100),
      transitionId: turn(0),
      starter: 0,
      generateTileId: () => v.parse(TileIdSchema, `opaque-${++id}`),
    },
    random(),
  );
}
function act(s: BurgundyState, a: BurgundyAction): BurgundyState {
  const result = applyBurgundyAction(
    s,
    s.activePlayerId,
    a,
    time(s.turnStartedAt + 1),
    turn(s.revision + 1),
    random(s.revision),
  );
  if (!result.ok) assert.fail(result.reason);
  return result.state;
}
function extract(s: BurgundyState, kind: string): BurgundyTile {
  const tile = s.inventory.find(
    (t) =>
      t.kind === kind &&
      !s.players.some(
        (p) =>
          p.board.some((b) => b.tile.tileId === t.tileId) ||
          p.storage.some((b) => b.tileId === t.tileId),
      ),
  );
  assert.ok(tile);
  let i = s.supply.indexOf(tile.tileId);
  if (i >= 0) s.supply.splice(i, 1);
  else {
    const source = [...s.depots, s.blackDepot, s.inns].find((d) =>
      d.some((t) => t.tileId === tile.tileId),
    );
    assert.ok(source);
    i = source.findIndex((t) => t.tileId === tile.tileId);
    source.splice(i, 1);
  }
  return tile;
}
function addKnowledge(s: BurgundyState, n: number): void {
  const p = s.players[0]!,
    cell = burgundyBoard(p.boardId).cells.find(
      (c) => c.color === "MONASTERY" && !p.board.some((t) => t.cellId === c.id),
    );
  assert.ok(cell);
  p.board.push({ cellId: cell.id, tile: extract(s, `KNOWLEDGE_${n}`) });
}
test("Burgundy base catalog conserves 164 unique hex tiles including starting castles", () => {
  const s = game(4);
  assert.equal(s.inventory.length, 164);
  assert.equal(new Set(s.inventory.map((t) => t.tileId)).size, 164);
  assert.equal(
    s.players.every((p) => p.board.length === 1 && p.score === 0),
    true,
  );
  assert.equal(
    BURGUNDY_CATALOG.filter((t) => !t.expansion).reduce(
      (n, t) => n + t.count,
      0,
    ),
    164,
  );
  assert.doesNotThrow(() => parseBurgundyState(s));
});
test("Burgundy full game has 25 rounds, two dice per player and final resource scoring", () => {
  for (const n of [2, 3, 4]) {
    let s = game(n);
    let turns = 0;
    while (s.phase === "PLAYING") {
      s = timeoutBurgundy(s, time(s.deadlineAt!), turn(++turns), random(turns));
      assert.doesNotThrow(() => parseBurgundyState(s));
      assert.ok(turns <= 25 * n);
    }
    assert.equal(turns, 25 * n);
    assert.equal(s.result?.reason, "COMPLETED");
    assert.equal(s.result?.scores.length, n);
    assert.equal(s.players[0]!.workers, 101);
    assert.equal(s.result?.scores[0]?.workers, 50);
  }
});
test("Burgundy rejects foreign and stale actions atomically, including hidden IDs", () => {
  const s = game(),
    before = structuredClone(s);
  const hidden = s.supply[0]!;
  for (const id of [hidden, v.parse(TileIdSchema, "nonexistent")]) {
    const result = applyBurgundyAction(
      s,
      s.activePlayerId,
      { type: "TAKE", die: 0, value: s.players[0]!.dice[0].value, tileId: id },
      time(101),
      turn(1),
      random(),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "사용할 수 없는 타일입니다.");
  }
  assert.equal(
    applyBurgundyAction(
      s,
      player(1),
      { type: "WORKERS", die: 0 },
      time(101),
      turn(1),
      random(),
    ).ok,
    false,
  );
  assert.equal(
    applyBurgundyAction(
      s,
      s.activePlayerId,
      { type: "WORKERS", die: 0 },
      time(s.deadlineAt!),
      turn(1),
      random(),
    ).ok,
    false,
  );
  assert.deepEqual(s, before);
});
test("Burgundy projections never disclose hidden supply tile identifiers", () => {
  const s = game(),
    projection = JSON.stringify(publicBurgundy(s));
  for (const id of s.supply)
    assert.equal(projection.includes('"' + id + '"'), false);
  assert.equal(publicBurgundy(s).supplyCount, s.supply.length);
});
test("Burgundy worker adjustment wraps and knowledge8 doubles steps", () => {
  assert.equal(burgundyWorkerCost(1, 6, false), 1);
  assert.equal(burgundyWorkerCost(3, 6, false), 3);
  assert.equal(burgundyWorkerCost(3, 6, true), 2);
  assert.equal(burgundyWorkerCost(1, 5, true, 1), 1);
});
test("2019 knowledge6 buys any numbered or black tile with mixed resources, sharing the once-per-turn purchase", () => {
  for (const workers of [0, 1, 2] as const) {
    let s = game();
    addKnowledge(s, 6);
    s.players[0]!.silver = 2;
    s.players[0]!.workers = 4;
    const tile = s.depots
      .flat()
      .find(
        (t) =>
          BURGUNDY_CATALOG.find((d) => d.kind === t.kind)?.color !== "BUILDING",
      )!;
    s = act(s, { type: "BUY", tileId: tile.tileId, workers });
    assert.equal(s.players[0]!.workers, 4 - workers);
    assert.equal(s.players[0]!.silver, workers);
    assert.equal(s.players[0]!.storage[0]?.tileId, tile.tileId);
    assert.ok(s.players[0]!.dice.every((d) => !d.used));
    assert.equal(
      applyBurgundyAction(
        s,
        s.activePlayerId,
        { type: "BUY", tileId: s.blackDepot[0]!.tileId, workers: 2 },
        time(102),
        turn(2),
        random(),
      ).ok,
      false,
    );
  }
  const s = game();
  assert.equal(
    applyBurgundyAction(
      s,
      s.activePlayerId,
      { type: "BUY", tileId: s.blackDepot[0]!.tileId, workers: 1 },
      time(101),
      turn(1),
      random(),
    ).ok,
    false,
  );
});
test("Burgundy workers action knowledge13 and14 combine, bank purchase remains available after both dice", () => {
  let s = game();
  addKnowledge(s, 13);
  addKnowledge(s, 14);
  s = act(s, { type: "WORKERS", die: 0 });
  s = act(s, { type: "WORKERS", die: 1 });
  assert.equal(s.players[0]!.workers, 9);
  assert.equal(s.players[0]!.silver, 3);
  assert.equal(s.activePlayerId, player(0));
  s = act(s, { type: "BUY", tileId: s.blackDepot[0]!.tileId });
  assert.equal(s.players[0]!.silver, 1);
  s = act(s, { type: "END_TURN" });
  assert.equal(s.activePlayerId, player(1));
});
test("Burgundy goods sale sells entire stack, grants one coin per action and knowledge modifiers", () => {
  let s = game();
  addKnowledge(s, 3);
  addKnowledge(s, 4);
  const p = s.players[0]!,
    value = p.goods.findIndex((n) => n > 0) + 1,
    amount = p.goods[value - 1]!;
  p.dice[0].value = value;
  s = act(s, { type: "SELL", die: 0, value });
  assert.equal(s.players[0]!.goods[value - 1], 0);
  assert.equal(s.players[0]!.soldGoods[value - 1], amount);
  assert.equal(s.players[0]!.silver, 3);
  assert.equal(s.players[0]!.workers, 2);
  assert.equal(s.players[0]!.score, amount * 2);
});
test("Burgundy ship ordering changes only the next round and timeout finishes mandatory collection", () => {
  let s = game();
  const p = s.players[0]!;
  p.shipPosition = 2;
  p.orderStamp = 20;
  s.pending = [{ type: "SHIP" }];
  const original = [...s.roundOrder];
  s = timeoutBurgundy(s, time(s.deadlineAt!), turn(1), random());
  assert.deepEqual(s.roundOrder, original);
  assert.equal(s.activePlayerId, player(1));
  assert.equal(s.pending.length, 0);
});
test("Burgundy placement respects color, adjacency, static regions and duplicate building knowledge1", () => {
  const s = game(),
    p = s.players[0]!,
    board = burgundyBoard(p.boardId);
  assert.equal(board.cells.length, 37);
  const building = extract(s, "BANK"),
    castleCell = p.board[0]!.cellId;
  assert.ok(burgundyPlacementReason(p, building, castleCell));
  const green = board.cells.find((c) => c.color === "LIVESTOCK")!;
  assert.ok(burgundyPlacementReason(p, building, green.id));
  const town = board.cells
    .filter((c) => c.color === "BUILDING")
    .map((c) => burgundyRegion(p.boardId, c.id))
    .find((r) => r.length > 1)!;
  assert.ok(town.length > 1);
});
test("Burgundy cancellation preserves public score and clears deadline", () => {
  const s = cancelBurgundy(game(), time(101));
  assert.equal(s.phase, "FINISHED");
  assert.equal(s.deadlineAt, null);
  assert.equal(s.result?.reason, "CANCELLED");
  assert.equal(
    s.result?.scores.every((r) => r.total === 0),
    true,
  );
});
function preparePlacement(
  kind: string,
  overrides: Partial<typeof BURGUNDY_DEFAULT_SETTINGS> = {},
): {
  s: BurgundyState;
  tile: BurgundyTile;
  cellId: string;
  die: number;
} {
  const s = game(2, overrides),
    p = s.players[0]!,
    tile = extract(s, kind),
    board = burgundyBoard(p.boardId);
  p.storage.push(tile);
  p.workers = 30;
  for (const castle of board.cells.filter((c) => c.color === "CASTLE")) {
    p.board[0]!.cellId = castle.id;
    const cell = board.cells.find(
      (c) => burgundyPlacementReason(p, tile, c.id) === null,
    );
    if (cell) return { s, tile, cellId: cell.id, die: cell.die };
  }
  throw new Error("No placement fixture");
}
test("Burgundy eight building effects dispatch independently with no extra die cost", () => {
  for (const [kind, effect] of [
    ["MARKET", "TAKE"],
    ["CARPENTER", "TAKE"],
    ["CHURCH", "TAKE"],
    ["WAREHOUSE", "SELL"],
    ["TOWN_HALL", "PLACE"],
  ]) {
    const f = preparePlacement(kind!);
    const s = act(f.s, {
      type: "PLACE",
      die: 0,
      value: f.die,
      tileId: f.tile.tileId,
      cellId: f.cellId,
    });
    assert.equal(s.pending[0]?.type, effect);
    assert.equal(s.players[0]!.dice[1].used, false);
  }
  for (const kind of ["BANK", "BOARDING_HOUSE", "WATCHTOWER"]) {
    const f = preparePlacement(kind);
    f.s.players[0]!.dice[0].value = f.die;
    const s = act(f.s, {
      type: "PLACE",
      die: 0,
      value: f.die,
      tileId: f.tile.tileId,
      cellId: f.cellId,
    });
    assert.equal(s.pending.length, 0);
    if (kind === "BANK") assert.equal(s.players[0]!.silver, 3);
    if (kind === "BOARDING_HOUSE") assert.equal(s.players[0]!.workers, 34);
    if (kind === "WATCHTOWER")
      assert.equal(s.players[0]!.scoreBreakdown.buildings, 4);
  }
});
test("Burgundy castles create a resumable immediate action while mines have no immediate effect", () => {
  for (const kind of ["CASTLE", "MINE", "SHIP", "KNOWLEDGE_1"]) {
    const f = preparePlacement(kind);
    let s = act(f.s, {
      type: "PLACE",
      die: 0,
      value: f.die,
      tileId: f.tile.tileId,
      cellId: f.cellId,
    });
    assert.equal(
      s.pending[0]?.type,
      kind === "CASTLE" ? "ACTION" : kind === "SHIP" ? "SHIP" : undefined,
    );
    assert.doesNotThrow(() => parseBurgundyState(s));
    if (kind === "CASTLE") {
      const before = s.players[0]!.workers;
      s = act(s, { type: "EFFECT_WORKERS" });
      assert.equal(s.players[0]!.workers, before + 2);
      assert.equal(s.players[0]!.dice[1].used, false);
    }
  }
});
test("Burgundy livestock scores each matching animal on static pasture and knowledge7 per tile", () => {
  const definition = BURGUNDY_CATALOG.find(
    (d) => d.animal === "SHEEP" && d.animals === 2 && !d.expansion,
  )!;
  const f = preparePlacement(definition.kind);
  addKnowledge(f.s, 7);
  const s = act(f.s, {
    type: "PLACE",
    die: 0,
    value: f.die,
    tileId: f.tile.tileId,
    cellId: f.cellId,
  });
  assert.equal(s.players[0]!.scoreBreakdown.animals, 3);
});
test("Burgundy failed compound effect restores all resources and pending queue", () => {
  const f = preparePlacement("MARKET");
  const s = act(f.s, {
    type: "PLACE",
    die: 0,
    value: f.die,
    tileId: f.tile.tileId,
    cellId: f.cellId,
  });
  const before = structuredClone(s);
  const invalid = s.depots
    .flat()
    .find(
      (t) =>
        BURGUNDY_CATALOG.find((d) => d.kind === t.kind)?.color === "BUILDING",
    )!;
  const result = applyBurgundyAction(
    s,
    s.activePlayerId,
    { type: "EFFECT_TAKE", tileId: invalid.tileId },
    time(103),
    turn(3),
    random(),
  );
  assert.equal(result.ok, false);
  assert.deepEqual(s, before);
});
test("Burgundy board duplicate buildings rejected except knowledge1 within same printed town", () => {
  const s = game(),
    p = s.players[0]!,
    board = burgundyBoard(p.boardId),
    tile = extract(s, "BANK");
  p.storage.push(tile);
  const region = board.cells
    .filter((c) => c.color === "BUILDING")
    .map((c) => burgundyRegion(p.boardId, c.id))
    .find((r) => r.length > 1)!;
  assert.ok(region.length > 1);
  p.board.push({ cellId: region[0]!, tile: extract(s, "BANK") });
  const target = region.find(
    (id) => burgundyPlacementReason(p, tile, id, [1]) === null,
  );
  assert.ok(target);
  assert.match(burgundyPlacementReason(p, tile, target) ?? "", /같은 건물/);
  assert.equal(burgundyPlacementReason(p, tile, target, [1]), null);
});
test("Burgundy parser rejects duplicated opaque tiles and altered supply composition", () => {
  const s = game();
  s.supply.push(s.supply[0]!);
  assert.throws(() => parseBurgundyState(s), /conservation/);
  const second = game();
  second.inventory[0]!.kind = "MINE";
  assert.throws(() => parseBurgundyState(second), /inventory/);
  const third = game();
  third.players[0]!.goods[0]!++;
  assert.throws(() => parseBurgundyState(third), /goods conservation/);
});
test("Burgundy sold goods stay owner-visible until final scoring", () => {
  let s = game();
  const p = s.players[0]!,
    value = p.goods.findIndex((n) => n > 0) + 1;
  p.dice[0].value = value;
  s = act(s, { type: "SELL", die: 0, value });
  assert.equal(
    publicBurgundy(s, player(0)).playerStates[0]!.soldGoods[value - 1],
    p.goods[value - 1],
  );
  assert.deepEqual(
    publicBurgundy(s, player(1)).playerStates[0]!.soldGoods,
    [0, 0, 0, 0, 0, 0],
  );
  assert.ok(publicBurgundy(s, player(1)).playerStates[0]!.soldGoodsCount > 0);
});
function grantShield(s: BurgundyState, id: number): void {
  const p = s.players[0]!,
    depot = s.expansion.shieldDepots.find((d) => d.includes(id));
  if (depot) depot.splice(depot.indexOf(id), 1);
  else {
    const i = s.shieldDiscard.indexOf(id);
    assert.ok(i >= 0);
    s.shieldDiscard.splice(i, 1);
  }
  p.extension.shields.push({
    shieldId: id,
    castleCellId: p.board[0]!.cellId,
    copiedPlayerId: null,
  });
}
test("2019 enabled tile expansions preserve 182 opaque hexes throughout a full game", () => {
  for (const n of [2, 3, 4]) {
    let s = game(n, {
      extraTiles: true,
      whiteCastles: true,
      inns: true,
      shields: true,
    });
    assert.equal(s.inventory.length, 182);
    let turns = 0;
    while (s.phase === "PLAYING") {
      s = timeoutBurgundy(s, time(s.deadlineAt!), turn(++turns), random(turns));
      assert.ok(turns < 110);
    }
    assert.equal(s.result?.reason, "COMPLETED");
    assert.equal(s.inventory.length, 182);
  }
});
test("Burgundy phase tribute precedes mine income and discarded shields stop applying immediately", () => {
  let s = game(2, { shields: true });
  grantShield(s, 8);
  const p = s.players[0]!,
    mine = extract(s, "MINE"),
    cell = burgundyBoard(p.boardId).cells.find((c) => c.color === "MINE")!;
  p.board.push({ cellId: cell.id, tile: mine });
  p.silver = 0;
  for (const good of s.roundGoods) s.depotGoods[0]![good - 1]!++;
  s.roundGoods = [];
  s.roundIndex = 4;
  s.roundTurnIndex = 1;
  s.activePlayerId = player(1);
  for (const q of s.players) q.dice.forEach((d) => (d.used = true));
  s = act(s, { type: "END_TURN" });
  assert.equal(s.endingPhase, true);
  assert.equal(s.pending[0]?.type, "SHIELD_TRIBUTE");
  assert.equal(
    applyBurgundyAction(
      s,
      s.activePlayerId,
      { type: "SHIELD_TRIBUTE", keepShieldIds: [8], workers: 0 },
      time(s.turnStartedAt + 1),
      turn(100),
      random(),
    ).ok,
    false,
  );
  s = act(s, { type: "SHIELD_TRIBUTE", keepShieldIds: [], workers: 0 });
  s = act(s, { type: "END_TURN" });
  assert.equal(s.phaseIndex, 1);
  assert.equal(s.players[0]!.silver, 1);
  assert.equal(s.players[0]!.extension.shields.length, 0);
});
test("2019 score tie favors more unused hex spaces, then the player behind on the turn track", () => {
  let s = game();
  let step = 0;
  while (!(
    s.phaseIndex === 4 &&
    s.roundIndex === 4 &&
    s.roundTurnIndex === 1
  )) {
    s = timeoutBurgundy(s, time(s.deadlineAt!), turn(++step), random(step));
  }
  const p = s.players[0]!,
    tile = extract(s, "SHIP"),
    cell = burgundyBoard(p.boardId).cells.find((c) => c.color === "SHIP")!;
  p.board.push({ cellId: cell.id, tile });
  p.score = 1;
  p.scoreBreakdown.buildings = 1;
  s = timeoutBurgundy(s, time(s.deadlineAt!), turn(++step), random(step));
  assert.equal(s.players[0]!.score, s.players[1]!.score);
  assert.deepEqual(s.result?.winnerPlayerIds, [player(1)]);
});

test("2019 all sixteen verified duchies start with one unscored castle", () => {
  for (const board of BURGUNDY_BOARDS) {
    const s = game(2, {
      boardId: board.id,
      extraDuchies: true,
      borderPosts: !!board.borderPostGroups,
    });
    assert.equal(
      s.players.every((p) => p.board.length === 1 && p.score === 0),
      true,
    );
    assert.equal(s.pending.length, 0);
    assert.equal(s.rulesVersion, "burgundy-anniversary-2019-v1");
  }
});
test("Burgundy livestock repeats matching counts across the same printed pasture but not another pasture", () => {
  const two = BURGUNDY_CATALOG.find(
      (d) =>
        d.animal === "SHEEP" && d.animals === 2 && d.supply === "LIVESTOCK",
    )!,
    three = BURGUNDY_CATALOG.find(
      (d) =>
        d.animal === "SHEEP" && d.animals === 3 && d.supply === "LIVESTOCK",
    )!,
    four = BURGUNDY_CATALOG.find(
      (d) =>
        d.animal === "SHEEP" && d.animals === 4 && d.supply === "LIVESTOCK",
    )!;
  const f = preparePlacement(two.kind),
    p = f.s.players[0]!,
    board = burgundyBoard(p.boardId),
    region = burgundyRegion(p.boardId, f.cellId),
    target = board.cells.find((c) => c.id === f.cellId)!;
  const distant = board.cells.find(
    (c) =>
      region.includes(c.id) &&
      (Math.abs(c.q - target.q) +
        Math.abs(c.r - target.r) +
        Math.abs(c.q + c.r - target.q - target.r)) /
        2 >
        1,
  )!;
  assert.ok(distant);
  p.board.push({ cellId: distant.id, tile: extract(f.s, three.kind) });
  const elsewhere = board.cells.find(
    (c) => c.color === "LIVESTOCK" && !region.includes(c.id),
  )!;
  p.board.push({ cellId: elsewhere.id, tile: extract(f.s, four.kind) });
  const s = act(f.s, {
    type: "PLACE",
    die: 0,
    value: f.die,
    tileId: f.tile.tileId,
    cellId: f.cellId,
  });
  assert.equal(s.players[0]!.scoreBreakdown.animals, 5);
});
test("Burgundy mines pay in each of five phases and knowledge2 adds one worker per mine", () => {
  let s = game();
  const p = s.players[0]!,
    mine = extract(s, "MINE"),
    cell = burgundyBoard(p.boardId).cells.find((c) => c.color === "MINE")!;
  p.board.push({ cellId: cell.id, tile: mine });
  addKnowledge(s, 2);
  let step = 0;
  while (s.phase === "PLAYING")
    s = timeoutBurgundy(s, time(s.deadlineAt!), turn(++step), random(step));
  assert.equal(s.result?.scores[0]?.silver, 6);
  assert.equal(s.players[0]!.workers, 106);
});

test("shield 5 collects its selected goods type from all six depots after normal ship collection", () => {
  let s = game(2, { shields: true });
  grantShield(s, 5);
  // Move all goods to their unused supply before selecting exact public depot stacks.
  for (const counts of [...s.players.map((p) => p.goods), ...s.depotGoods]) {
    counts.forEach((amount, index) => {
      for (let n = 0; n < amount; n++)
        s.unusedGoods.push(v.parse(v.picklist([1, 2, 3, 4, 5, 6]), index + 1));
    });
    counts.fill(0);
  }
  s.unusedGoods.push(...s.goodsSupply, ...s.roundGoods);
  s.goodsSupply = [];
  s.roundGoods = [];
  for (let depot = 0; depot < 6; depot++) {
    const i = s.unusedGoods.indexOf(2);
    assert.ok(i >= 0);
    s.unusedGoods.splice(i, 1);
    s.depotGoods[depot]![1] = 1;
  }
  const other = s.unusedGoods.indexOf(3);
  assert.ok(other >= 0);
  s.unusedGoods.splice(other, 1);
  s.depotGoods[0]![2] = 1;
  s.pending = [{ type: "SHIP" }];
  s = act(s, { type: "SHIP_GOODS", depot: 1, types: [2, 3], shieldType: 2 });
  assert.deepEqual(s.players[0]!.goods, [0, 6, 1, 0, 0, 0]);
  assert.equal(
    s.depotGoods.flat().reduce((sum, amount) => sum + amount, 0),
    0,
  );
  assert.equal(s.pending.length, 0);
  assert.doesNotThrow(() => parseBurgundyState(s));
});

test("shield 11 lets a castle action acquire a shield without consuming the other die", () => {
  const f = preparePlacement("CASTLE", { shields: true });
  grantShield(f.s, 11);
  let s = act(f.s, {
    type: "PLACE",
    die: 0,
    value: f.die,
    tileId: f.tile.tileId,
    cellId: f.cellId,
  });
  assert.deepEqual(s.pending[0], { type: "ACTION", die: null, source: "CASTLE" });
  const index = s.expansion.shieldDepots.findIndex((depot) => depot.length > 0);
  assert.ok(index >= 0);
  const shieldId = s.expansion.shieldDepots[index]![0]!;
  const workers = s.players[0]!.workers;
  s = act(s, {
    type: "TAKE_SHIELD",
    value: v.parse(v.picklist([1, 2, 3, 4, 5, 6]), index + 1),
    shieldId,
    castleCellId: f.cellId,
  });
  assert.equal(s.players[0]!.dice[1].used, false);
  assert.equal(s.players[0]!.workers, workers);
  assert.equal(s.pending.length, 0);
  assert.equal(
    s.players[0]!.extension.shields.some(
      (shield) => shield.shieldId === shieldId,
    ),
    true,
  );
});

test("phase shields 14 and 15 directly place from their own market, resolve the building, then request tribute", () => {
  for (const [shieldId, kind] of [
    [14, "BANK"],
    [15, "BANK_BLACK"],
  ] as const) {
    const f = preparePlacement(kind, { shields: true });
    let s = f.s;
    grantShield(s, shieldId);
    s.players[0]!.storage = [];
    const source = shieldId === 14 ? s.depots[0]! : s.blackDepot;
    source.push(f.tile);
    for (const good of s.roundGoods) s.depotGoods[0]![good - 1]!++;
    s.roundGoods = [];
    s.roundIndex = 4;
    s.roundTurnIndex = 1;
    s.activePlayerId = player(1);
    for (const p of s.players) p.dice.forEach((die) => (die.used = true));
    s = act(s, { type: "END_TURN" });
    assert.deepEqual(s.pending[0], {
      type: "SHIELD_PLACE",
      black: shieldId === 15,
    });
    const before = structuredClone(s);
    const wrongSource = shieldId === 14 ? s.blackDepot : s.depots.flat();
    const wrongTile = wrongSource[0]!;
    assert.equal(
      applyBurgundyAction(
        s,
        s.activePlayerId,
        { type: "SHIELD_PLACE", tileId: wrongTile.tileId, cellId: f.cellId },
        time(s.turnStartedAt + 1),
        turn(900),
        random(),
      ).ok,
      false,
    );
    assert.deepEqual(s, before);
    const silver = s.players[0]!.silver;
    s = act(s, {
      type: "SHIELD_PLACE",
      tileId: f.tile.tileId,
      cellId: f.cellId,
    });
    assert.equal(
      s.players[0]!.board.some((tile) => tile.tile.tileId === f.tile.tileId),
      true,
    );
    assert.equal(s.players[0]!.silver, silver + 2);
    assert.equal(s.players[0]!.storage.length, 0);
    assert.equal(s.pending[0]?.type, "SHIELD_TRIBUTE");
    s = act(s, {
      type: "SHIELD_TRIBUTE",
      keepShieldIds: [shieldId],
      workers: 0,
    });
    s = act(s, { type: "END_TURN" });
    assert.equal(s.phaseIndex, 1);
  }
});

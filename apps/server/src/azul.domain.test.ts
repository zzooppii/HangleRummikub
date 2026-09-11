import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { AZUL_COLORS, GameIdSchema, PlayerIdSchema, ServerTimeSchema, TileIdSchema, TurnIdSchema, azulWallColumn, type AzulAction, type AzulColor, type AzulDestination } from "@hangul-rummikub/shared";
import { chooseAzulTimeoutAction, timeoutAzul, applyAzulAction, createAzulGame, makeAzulTiles, parseAzulState, publicAzul, scoreAzulPlacement, type AzulState } from "./games/azul/domain/game.js";

const now = v.parse(ServerTimeSchema, 1_000), gameId = v.parse(GameIdSchema, "azul-domain");
const turn = (n: number) => v.parse(TurnIdSchema, `azul-turn-${n}`);
function random(seed = 1) { let x = seed; return { nextInt(n: number) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x % n; } }; }
function setup(count = 2, seed = 1) { let tile = 0; return createAzulGame({ gameId, playerIds: Array.from({ length: count }, (_, i) => v.parse(PlayerIdSchema, `player-${i}`)), tiles: makeAzulTiles(() => v.parse(TileIdSchema, `azul-tile-${++tile}`)), now, starter: 0, turnId: turn(0), random: random(seed) }); }
function fixture() {
  const s = setup(); s.bag = s.inventory.map(t => t.tileId); s.factories.forEach(f => f.splice(0)); s.center = [];
  function take(color: AzulColor) { const id = s.bag.find(id => s.inventory.find(t => t.tileId === id)?.color === color); assert.ok(id); s.bag.splice(s.bag.indexOf(id), 1); return id; }
  return { s, take, wall(player: number, row: number, color: AzulColor) { s.players[player]!.wall[row]![azulWallColumn(row, color)] = take(color); } };
}
function apply(s: AzulState, action: AzulAction) { const result = applyAzulAction(s, s.activePlayerId, action, now, turn(s.revision + 1), random(11)); assert.ok(result.ok, result.ok ? "" : result.reason); return result.state; }
function legal(s: AzulState): AzulAction {
  const p = s.players.find(p => p.playerId === s.activePlayerId)!;
  const sources: AzulAction["source"][] = [...s.factories.map((_, index) => ({ kind: "FACTORY" as const, index })), { kind: "CENTER" }];
  for (const destination of [0, 1, 2, 3, 4, "FLOOR"] satisfies AzulDestination[]) for (const source of sources) {
    const pool = source.kind === "CENTER" ? s.center : s.factories[source.index]!;
    for (const color of AZUL_COLORS) {
      if (!pool.some(id => s.inventory.find(t => t.tileId === id)?.color === color)) continue;
      if (destination !== "FLOOR") {
        const line = p.patternLines[destination]!;
        if (line.length === destination + 1 || line.some(id => s.inventory.find(t => t.tileId === id)?.color !== color) || p.wall[destination]![azulWallColumn(destination, color)] !== null) continue;
      }
      return { source, color, destination };
    }
  }
  throw new Error("No legal draft.");
}

test("AZUL 2/3/4-player setup has 100 opaque tile instances and 5/7/9 full factories", () => {
  for (const count of [2, 3, 4]) { const s = setup(count); assert.equal(s.inventory.length, 100); assert.equal(s.factories.length, count * 2 + 1); assert.ok(s.factories.every(f => f.length === 4)); assert.equal(s.bag.length, 100 - (count * 2 + 1) * 4); assert.deepEqual(parseAzulState(s), s); }
  assert.throws(() => setup(1)); assert.throws(() => setup(5));
});
test("AZUL factory draft takes all one color, moves leftovers, overflows and leaves original unchanged", () => {
  const { s, take } = fixture(); s.factories[0] = [take("BLUE"), take("BLUE"), take("BLUE"), take("RED")];
  const before = structuredClone(s), next = apply(s, { source: { kind: "FACTORY", index: 0 }, color: "BLUE", destination: 1 });
  assert.deepEqual(s, before); assert.equal(next.players[0]!.patternLines[1]!.length, 2); assert.equal(next.players[0]!.floor.length, 1); assert.equal(next.center.length, 1); assert.equal(next.factories[0]!.length, 0); assert.equal(next.firstPlayerId, null); assert.equal(next.activePlayerId, s.players[1]!.playerId);
});
test("AZUL center marker precedes overflow, a full floor discards tiles but retains next starter", () => {
  const { s, take } = fixture(); s.center = [take("RED"), take("RED"), take("BLUE")]; s.players[0]!.floor = Array.from({ length: 6 }, () => take("YELLOW"));
  const next = apply(s, { source: { kind: "CENTER" }, color: "RED", destination: "FLOOR" });
  assert.equal(next.players[0]!.floor[6], "FIRST_PLAYER"); assert.equal(next.discard.length, 2); assert.equal(next.firstPlayerId, next.players[0]!.playerId); assert.equal(next.feedback?.tookFirstPlayer, true);
  const f = fixture(); f.s.center = [f.take("RED"), f.take("BLUE")]; f.s.players[0]!.floor = Array.from({ length: 7 }, () => f.take("YELLOW"));
  const full = apply(f.s, { source: { kind: "CENTER" }, color: "RED", destination: "FLOOR" }); assert.equal(full.players[0]!.floor.length, 7); assert.equal(full.firstPlayerId, full.players[0]!.playerId); assert.equal(full.discard.length, 1);
});
test("AZUL rejects wrong actor, empty source, mixed/full/occupied rows and injected fields without mutation", () => {
  const { s, take, wall } = fixture(); s.factories[0] = [take("BLUE"), take("RED")]; s.players[0]!.patternLines[1] = [take("YELLOW")]; s.players[0]!.patternLines[2] = [take("BLUE"), take("BLUE"), take("BLUE")]; wall(0, 3, "BLUE");
  const before = structuredClone(s), base = { source: { kind: "FACTORY", index: 0 }, color: "BLUE", destination: 0 };
  assert.deepEqual(applyAzulAction(s, s.players[1]!.playerId, base, now, turn(1), random()), { ok: false, reason: "NOT_YOUR_TURN" });
  for (const payload of [{ ...base, destination: 1 }, { ...base, destination: 2 }, { ...base, destination: 3 }, { ...base, source: { kind: "FACTORY", index: 8 } }, { ...base, color: "WHITE" }, { ...base, count: 1 }, { ...base, destination: -1 }]) assert.equal(applyAzulAction(s, s.activePlayerId, payload, now, turn(1), random()).ok, false);
  assert.deepEqual(s, before);
});
test("AZUL scoring counts the placed tile in both contiguous axes, not diagonals or gaps", () => {
  const wall = Array.from({ length: 5 }, () => Array<true | null>(5).fill(null)); wall[2]![2] = true;
  assert.deepEqual(scoreAzulPlacement(wall, 2, 2), { horizontal: 1, vertical: 1, points: 1 });
  wall[1]![1] = true; wall[2]![0] = true; assert.equal(scoreAzulPlacement(wall, 2, 2).points, 1);
  wall[2]![1] = true; wall[2]![3] = true; wall[1]![2] = true; wall[3]![2] = true;
  assert.deepEqual(scoreAzulPlacement(wall, 2, 2), { horizontal: 4, vertical: 3, points: 7 });
});
test("AZUL settles top to bottom, retains incomplete rows, clamps floor penalties then automatically starts next round", () => {
  const { s, take } = fixture(); s.center = [take("BLUE")]; s.players[0]!.patternLines[1] = [take("WHITE"), take("WHITE")]; s.players[0]!.patternLines[2] = [take("RED")];
  s.players[1]!.floor = Array.from({ length: 7 }, () => take("YELLOW"));
  const next = apply(s, { source: { kind: "CENTER" }, color: "BLUE", destination: 0 });
  assert.equal(next.round, 2); assert.equal(next.activePlayerId, s.players[0]!.playerId); assert.equal(next.firstPlayerId, null);
  const score = next.lastRound!.scores[0]!; assert.deepEqual(score.placements.map(p => p.points), [1, 2]); assert.equal(score.penalty, 1); assert.equal(score.after, 2);
  assert.equal(next.players[0]!.patternLines[2]!.length, 1); assert.ok(next.players.every(p => p.floor.length === 0)); assert.equal(next.players[1]!.score, 0); assert.equal(next.lastRound!.scores[1]!.penalty, 14);
});
test("AZUL reuses shuffled discard when bag runs out and retains starter if center never used", () => {
  const { s, take } = fixture(); s.factories[0] = [take("BLUE")]; s.activePlayerId = s.players[1]!.playerId; s.discard = s.bag.splice(0); s.bag = [];
  const next = apply(s, { source: { kind: "FACTORY", index: 0 }, color: "BLUE", destination: 0 });
  assert.equal(next.round, 2); assert.equal(next.activePlayerId, s.roundStarterId); assert.ok(next.factories.every(f => f.length === 4)); assert.equal(next.inventory.length, 100);
});
test("AZUL final round settles everyone, adds row/column/color bonuses and shares complete ties", () => {
  const f = fixture(); for (let player = 0; player < 2; player++) for (const color of AZUL_COLORS.slice(0, 4)) f.wall(player, 0, color);
  f.s.players[1]!.patternLines[0] = [f.take("WHITE")]; f.s.factories[0] = [f.take("WHITE")];
  const next = apply(f.s, { source: { kind: "FACTORY", index: 0 }, color: "WHITE", destination: 0 });
  assert.equal(next.phase, "FINISHED"); assert.deepEqual(next.result?.winnerPlayerIds, f.s.players.map(p => p.playerId)); assert.deepEqual(next.result?.scores.map(p => p.total), [7, 7]); assert.equal(next.round, 1);
  const b = fixture(); for (const color of AZUL_COLORS.slice(1)) b.wall(0, 0, color); for (let r = 1; r < 5; r++) { b.wall(0, r, "BLUE"); b.wall(0, r, AZUL_COLORS[(5 - r) % 5]!); }
  b.s.factories[0] = [b.take("BLUE")]; const bonuses = apply(b.s, { source: { kind: "FACTORY", index: 0 }, color: "BLUE", destination: 0 }); const score = bonuses.result!.scores[0]!;
  assert.equal(score.rows, 1); assert.equal(score.columns, 1); assert.equal(score.colors, 1); assert.equal(score.total, score.base + 19);
});
test("AZUL conservation rejects duplicated hidden IDs, wrong colors and invalid marker owners", () => {
  const s = setup(); const bad = structuredClone(s); bad.bag[0] = bad.bag[1]!; assert.throws(() => parseAzulState(bad));
  const color = structuredClone(s); color.inventory[0]!.color = "WHITE"; assert.throws(() => parseAzulState(color));
  const marker = structuredClone(s); marker.players[0]!.floor = ["FIRST_PLAYER"]; assert.throws(() => parseAzulState(marker));
  const projection = publicAzul(s); for (const id of [...s.bag, ...s.discard]) assert.equal(JSON.stringify(projection).includes(`"${id}"`), false);
});
test("AZUL deterministic complete 2/3/4-player games preserve 100 tiles throughout", () => {
  for (const count of [2, 3, 4]) for (let seed = 1; seed <= 6; seed++) {
    let s = setup(count, seed), steps = 0;
    while (s.phase === "PLAYING" && steps++ < 1500) { s = apply(s, legal(s)); assert.deepEqual(parseAzulState(s), s); }
    assert.equal(s.phase, "FINISHED", `count=${count}, seed=${seed}, steps=${steps}`); assert.equal(s.result?.reason, "WALL_COMPLETE"); assert.ok(s.result?.winnerPlayerIds.length);
  }
});

test("AZUL deadline: accepts just before 30 seconds, rejects at boundary without mutation", () => {
  const s = setup(), before = structuredClone(s), move = legal(s);
  assert.equal(s.deadlineAt, now + 30_000);
  const justBefore = applyAzulAction(s, s.activePlayerId, move, v.parse(ServerTimeSchema, s.deadlineAt! - 1), turn(1), random());
  assert.ok(justBefore.ok); assert.equal(justBefore.state.deadlineAt, s.deadlineAt! + 29_999);
  assert.deepEqual(applyAzulAction(s, s.activePlayerId, move, s.deadlineAt!, turn(1), random()), {ok:false,reason:'TURN_EXPIRED'});
  assert.deepEqual(s, before);
});
test("AZUL timeout: chooses legal low-overflow placement, preserves state, marks automatic and resets deadline", () => {
  const f = fixture(); f.s.factories[0] = [f.take('BLUE'), f.take('BLUE'), f.take('BLUE'), f.take('RED')];
  const before = structuredClone(f.s), move = chooseAzulTimeoutAction(f.s);
  assert.deepEqual(move, {source:{kind:'FACTORY',index:0},color:'BLUE',destination:2});
  assert.equal(timeoutAzul(f.s, now, turn(1), random()), null);
  const next = timeoutAzul(f.s, f.s.deadlineAt!, turn(1), random())!;
  assert.equal(next.feedback?.automatic, true); assert.equal(next.feedback?.placed, 3); assert.equal(next.feedback?.dropped, 0);
  assert.equal(next.deadlineAt, f.s.deadlineAt! + 30_000); assert.deepEqual(f.s, before);
  assert.deepEqual(parseAzulState(next), next);
  assert.throws(() => parseAzulState({...next,deadlineAt:next.deadlineAt!+1}));
});
test("AZUL automatic play completes 2/3/4-player matches with conservation and terminal timer cleared", () => {
  for (const count of [2,3,4]) {
    let s = setup(count, count), steps=0;
    while(s.phase==='PLAYING' && steps++<1500) {
      const next = timeoutAzul(s, s.deadlineAt!, turn(steps), random(steps)); assert.ok(next);
      assert.equal(next.revision, s.revision+1); assert.deepEqual(parseAzulState(next),next); s=next;
    }
    assert.equal(s.phase,'FINISHED'); assert.equal(s.deadlineAt,null);
    assert.equal(timeoutAzul(s, now, turn(2000), random()),null);
  }
});

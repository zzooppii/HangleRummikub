import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "valibot";
import { PlayerIdSchema, ServerTimeSchema, ISLAND_BOARD, ISLAND_RESOURCES, emptyIslandResources, islandResourceCount, type IslandAction, type IslandResources } from "@hangul-rummikub/shared";
import { createIslandGame, actIsland, timeoutIsland, cancelIsland, parseIslandState, activeIslandPlayer, legalIslandSettlements, legalIslandRoads, islandRoadLength, islandBankRate, islandRandom, islandPoints, ISLAND_COSTS, type IslandState, type IslandContext, type IslandCard } from "./games/island/domain/game.js";
import { projectIsland } from "./games/island/compatibility/projector.js";
import { IslandGameStateAdapter } from "./games/island/compatibility/adapter.js";
import { GameIdSchema, GameRevisionSchema } from "@hangul-rummikub/shared";

const ids = Array.from({ length: 4 }, (_, i) => parse(PlayerIdSchema, "islander-" + i));
let sequence = 0;
function create(n = 3, seed = 42, random = islandRandom(seed)) { return createIslandGame({ gameId: "island-game", playerIds: ids.slice(0, n), cardIds: Array.from({ length: 25 }, (_, i) => "secret-card-" + i), now: 1000, turnId: "island-turn", random }); }
function context(s: IslandState, seed = 42): IslandContext { sequence++; return { now: s.deadlineAt - 100, nextTurnId: "next-" + sequence, tradeId: "trade-" + sequence, seed }; }
function started(n = 3, seed = 42) {
  let s = create(n, seed);
  while (s.turnNumber === 0) { const c = { ...context(s, seed + s.setupStep), now: s.deadlineAt }; const next = timeoutIsland(s, c); assert.ok(next); s = next; }
  return s;
}
function action(s: IslandState, a: IslandAction, actor = activeIslandPlayer(s), seed = 42) {
  const before = structuredClone(s), result = actIsland(s, actor, a, context(s, seed));
  assert.ok(result.ok, JSON.stringify(a) + " " + (!result.ok ? result.reason : "")); assert.deepEqual(s, before); return result.state;
}
function ready() { const s = started(); s.stage = { kind: "ACTION" }; s.dice = [1, 1]; return parseIslandState(s); }
function fund(s: IslandState, index: number, resources: Partial<IslandResources>) {
  for (const r of ISLAND_RESOURCES) if (resources[r] !== undefined) { const delta = resources[r]! - s.players[index]!.resources[r]; s.bank[r] -= delta; s.players[index]!.resources[r] = resources[r]!; assert.ok(s.bank[r] >= 0); }
}
function card(s: IslandState, index: number, kind: IslandCard["kind"]) {
  const at = s.deck.findIndex(c => c.kind === kind); assert.ok(at >= 0);
  const c = s.deck.splice(at, 1)[0]!; c.boughtTurn = 0; s.players[index]!.cards.push(c); return c.id;
}
function seedFor(sum: number) { for (let seed = 1; seed < 10000; seed++) { const r = islandRandom(seed); if (r(6) + r(6) + 2 === sum) return seed; } throw new Error("No seed"); }

test("ISLAND public topology has 19 hexes, 54 vertices, 72 edges and nine nonoverlapping ports", () => {
  assert.deepEqual([ISLAND_BOARD.hexes.length, ISLAND_BOARD.vertices.length, ISLAND_BOARD.edges.length], [19, 54, 72]);
  assert.equal(ISLAND_BOARD.edges.filter(e => e.hexes.length === 1).length, 30);
  const vertices = ISLAND_BOARD.portEdges.flatMap(e => [ISLAND_BOARD.edges[e]!.a, ISLAND_BOARD.edges[e]!.b]);
  assert.equal(new Set(vertices).size, 18);
  for (const h of ISLAND_BOARD.hexes) assert.equal(new Set(h.vertices).size, 6);
});
test("ISLAND private deck uses fresh random draws independent of an identical public board", () => {
  const random = islandRandom(42), draws: { max: number; value: number }[] = [];
  const a = create(3, 42, max => { const value = random(max); draws.push({ max, value }); return value; });
  let at = 0;
  const b = create(3, 42, max => {
    const draw = draws[at++]!; assert.equal(max, draw.max);
    return at > draws.length - 24 ? (draw.value + 1) % max : draw.value;
  });
  assert.deepEqual(a.hexes, b.hexes); assert.deepEqual(a.ports, b.ports); assert.deepEqual(a.players, b.players);
  assert.notDeepEqual(a.deck, b.deck); assert.equal(at, draws.length);
});
for (const n of [3, 4]) test("ISLAND " + n + "-player setup, reverse order, supplies and second settlement resources", () => {
  for (const seed of [1, 42, 93, 728]) {
    let s = create(n, seed); const order = s.players.map(p => p.playerId), visited: string[] = [];
    for (let i = 0; i < n * 2; i++) {
      const active = activeIslandPlayer(s); visited.push(active);
      const vertex = legalIslandSettlements(s, active, true)[0]!, before = s.players.find(p => p.playerId === active)!.resources;
      const built = action(s, { type: "BUILD_SETTLEMENT", vertex });
      assert.equal(built.deadlineAt, s.deadlineAt); assert.equal(built.turnId, s.turnId);
      const got = built.players.find(p => p.playerId === active)!.resources;
      const expected = i < n ? 0 : ISLAND_BOARD.vertices[vertex]!.hexes.filter(h => s.hexes[h]!.resource !== null).length;
      assert.equal(islandResourceCount(got) - islandResourceCount(before), expected);
      s = action(built, { type: "BUILD_ROAD", edge: legalIslandRoads(built, active, vertex)[0]! });
    }
    assert.deepEqual(visited, [...order, ...order].map((_, i) => i < n ? order[i] : order[n * 2 - i - 1]));
    assert.equal(s.turnNumber, 1); assert.equal(s.stage.kind, "ROLL"); assert.equal(s.buildings.length, n * 2); assert.equal(s.roads.length, n * 2);
    assert.equal(s.players.every(p => islandPoints(s, p.playerId) === 2), true); parseIslandState(s);
  }
});
test("ISLAND invalid actor, placement, payload and deadline preserve state and revision", () => {
  const s = create(), before = structuredClone(s), actor = activeIslandPlayer(s), other = s.players.find(p => p.playerId !== actor)!.playerId;
  for (const a of [{ type: "BUILD_SETTLEMENT", vertex: 500 }, { type: "BUILD_SETTLEMENT", vertex: 0, playerId: other }, { type: "ROLL" }]) assert.equal(actIsland(s, actor, a, context(s)).ok, false);
  assert.equal(actIsland(s, other, { type: "BUILD_SETTLEMENT", vertex: 0 }, context(s)).ok, false);
  assert.equal(actIsland(s, actor, { type: "BUILD_SETTLEMENT", vertex: 0 }, { ...context(s), now: s.deadlineAt }).ok, false);
  assert.deepEqual(s, before);
});
test("ISLAND timeout uses exactly 120 seconds and completes each pending setup pair", () => {
  const s = create(), c = context(s);
  assert.equal(timeoutIsland(s, c), null); assert.equal(s.deadlineAt - s.startedAt, 120000);
  const next = timeoutIsland(s, { ...c, now: s.deadlineAt }); assert.ok(next);
  assert.equal(next.buildings.length, 1); assert.equal(next.roads.length, 1); assert.notEqual(next.turnId, s.turnId); assert.equal(next.deadlineAt - s.deadlineAt, 120000);
  assert.ok(next.log.some(l => l.automatic)); assert.equal(s.buildings.length, 0);
});
test("ISLAND roads require connection and cannot continue through an opponent settlement", () => {
  const s = ready(), me = activeIslandPlayer(s);
  fund(s, s.activeIndex, { WOOD: 5, BRICK: 5 });
  const edge = legalIslandRoads(s, me)[0]!, next = action(s, { type: "BUILD_ROAD", edge });
  assert.equal(next.players[s.activeIndex]!.resources.WOOD, 4);
  assert.equal(actIsland(next, me, { type: "BUILD_ROAD", edge }, context(next)).ok, false);
  const foreign = ISLAND_BOARD.edges.find(e => !legalIslandRoads(s, me).includes(e.id) && !s.roads.some(r => r.edge === e.id)); assert.ok(foreign);
  assert.equal(actIsland(s, me, { type: "BUILD_ROAD", edge: foreign.id }, context(s)).ok, false);
  const graph = ready(); graph.roads = []; graph.buildings = [];
  const vertex = ISLAND_BOARD.vertices.find(v => v.edges.length === 3)!;
  graph.roads.push({ edge: vertex.edges[0]!, playerId: me }); graph.buildings.push({ vertex: vertex.id, playerId: graph.players[1]!.playerId, kind: "SETTLEMENT" });
  assert.equal(legalIslandRoads(graph, me).includes(vertex.edges[1]!), false);
});
test("ISLAND longest road is an edge trail, handles a loop and breaks at another player's settlement", () => {
  const s = ready(), id = activeIslandPlayer(s); s.buildings = []; s.roads = [];
  const h = ISLAND_BOARD.hexes[9]!;
  const loop = ISLAND_BOARD.edges.filter(e => e.hexes.includes(h.id)); s.roads = loop.map(e => ({ edge: e.id, playerId: id }));
  assert.equal(islandRoadLength(s, id), 6);
  const branch = ISLAND_BOARD.vertices[h.vertices[0]!]!.edges.find(e => !loop.some(x => x.id === e))!;
  s.roads.push({ edge: branch, playerId: id }); assert.equal(islandRoadLength(s, id), 7);
  s.buildings.push({ vertex: h.vertices[0]!, playerId: s.players[1]!.playerId, kind: "SETTLEMENT" });
  assert.equal(islandRoadLength(s, id), 6);
  const chain = ready(); chain.buildings = []; chain.roads = [];
  let vertex = 0; const seen = new Set<number>();
  for (let i = 0; i < 5; i++) { const e = ISLAND_BOARD.vertices[vertex]!.edges.find(e => !seen.has(e))!; seen.add(e); chain.roads.push({ edge: e, playerId: id }); const edge = ISLAND_BOARD.edges[e]!; vertex = edge.a === vertex ? edge.b : edge.a; }
  assert.equal(islandRoadLength(chain, id), 5);
});
test("ISLAND longest road has no initial tie winner, retains a tied holder and transfers after a break", () => {
  let s = ready(); s.buildings = []; s.roads = [];
  function advance() { if (s.stage.kind === "ROLL") s = action(s, { type: "ROLL" }, activeIslandPlayer(s), seedFor(2)); s = action(s, { type: "END_TURN" }); }
  const first = s.players[0]!.playerId, second = s.players[1]!.playerId, third = s.players[2]!.playerId;
  const loops = [0, 18].map(hex => ISLAND_BOARD.edges.filter(e => e.hexes.includes(hex)));
  s.roads = loops.flatMap((edges, i) => edges.map(e => ({ edge: e.id, playerId: i === 0 ? first : second })));
  advance(); assert.equal(s.longestRoadPlayerId, null);
  function addBranch(hex: number, id: typeof first) {
    const anchor = ISLAND_BOARD.hexes[hex]!.vertices.find(v => ISLAND_BOARD.vertices[v]!.edges.some(e => !s.roads.some(r => r.edge === e)))!;
    const edge = ISLAND_BOARD.vertices[anchor]!.edges.find(e => !s.roads.some(r => r.edge === e))!;
    s.roads.push({ edge, playerId: id }); return anchor;
  }
  const anchor = addBranch(0, first);
  advance(); assert.equal(s.longestRoadPlayerId, first);
  addBranch(18, second);
  advance(); assert.equal(s.longestRoadPlayerId, first);
  s.buildings.push({ vertex: anchor, playerId: third, kind: "SETTLEMENT" });
  advance(); assert.equal(s.longestRoadPlayerId, second);
});
test("ISLAND largest army requires three knights, retains a tie and transfers on a larger army", () => {
  let s = ready();
  function advance() { if (s.stage.kind === "ROLL") s = action(s, { type: "ROLL" }, activeIslandPlayer(s), seedFor(2)); s = action(s, { type: "END_TURN" }); }
  function knight(index: number) { const id = card(s, index, "KNIGHT"), p = s.players[index]!, at = p.cards.findIndex(c => c.id === id); s.usedCards.push({ ...p.cards.splice(at, 1)[0]!, playerId: p.playerId }); }
  knight(0); knight(0); advance(); assert.equal(s.largestArmyPlayerId, null);
  knight(0); advance(); assert.equal(s.largestArmyPlayerId, s.players[0]!.playerId);
  knight(1); knight(1); knight(1); advance(); assert.equal(s.largestArmyPlayerId, s.players[0]!.playerId);
  knight(1); advance(); assert.equal(s.largestArmyPlayerId, s.players[1]!.playerId);
});
test("ISLAND production pays cities twice, partial single-player shortage, multi-player shortage and robber blocking", () => {
  const s = started(), id = activeIslandPlayer(s), hex = s.hexes.find(h => h.resource !== null)!, resource = hex.resource!;
  const vtx = ISLAND_BOARD.hexes[hex.id]!.vertices[0]!;
  s.buildings = [{ vertex: vtx, playerId: id, kind: "CITY" }]; s.roads = [];
  // A sole eligible player receives the one remaining card despite city demand.
  for (const p of s.players) for (const r of ISLAND_RESOURCES) { s.bank[r] += p.resources[r]; p.resources[r] = 0; }
  fund(s, 1, { [resource]: 18 }); s.robber = s.hexes.find(h => h.resource === null)!.id;
  const next = action(s, { type: "ROLL" }, id, seedFor(hex.number!));
  assert.equal(next.players[s.activeIndex]!.resources[resource], 1); assert.equal(next.bank[resource], 0);
  const blocked = structuredClone(s); blocked.robber = hex.id;
  const blockedNext = action(blocked, { type: "ROLL" }, id, seedFor(hex.number!));
  const expected = ISLAND_BOARD.vertices[vtx]!.hexes.filter(hi => hi !== hex.id && blocked.hexes[hi]!.resource === resource && blocked.hexes[hi]!.number === hex.number).length;
  assert.equal(blockedNext.players[s.activeIndex]!.resources[resource], Math.min(expected * 2, 1));
  const multiple = structuredClone(s), opposite = ISLAND_BOARD.hexes[hex.id]!.vertices[3]!;
  multiple.buildings.push({ vertex: opposite, playerId: multiple.players[2]!.playerId, kind: "SETTLEMENT" });
  const short = action(multiple, { type: "ROLL" }, id, seedFor(hex.number!)); assert.equal(short.bank[resource], 1);
});
test("ISLAND seven waits for every discard and hides discarded and stolen resource details", () => {
  let s = started(); fund(s, 0, { WOOD: 8 }); fund(s, 1, { BRICK: 8 });
  s = action(s, { type: "ROLL" }, activeIslandPlayer(s), seedFor(7)); assert.equal(s.stage.kind, "DISCARD");
  while (s.stage.kind === "DISCARD") {
    const pending = s.stage.pending[0]!, resources = emptyIslandResources(), p = s.players.find(p => p.playerId === pending.playerId)!;
    let remaining = pending.count; for (const r of ISLAND_RESOURCES) { resources[r] = Math.min(p.resources[r], remaining); remaining -= resources[r]; }
    const deadline = s.deadlineAt; s = action(s, { type: "DISCARD", resources }, pending.playerId); assert.equal(s.deadlineAt, deadline);
  }
  assert.equal(s.stage.kind, "ROBBER_HEX");
  const active = activeIslandPlayer(s), otherBuilding = s.buildings.find(b => b.playerId !== active)!, hex = ISLAND_BOARD.vertices[otherBuilding.vertex]!.hexes.find(h => h !== s.robber)!;
  s = action(s, { type: "MOVE_ROBBER", hex });
  if (s.stage.kind === "ROBBER_VICTIM") { const target = s.stage.candidates[0]!, count = islandResourceCount(s.players.find(p => p.playerId === target)!.resources); s = action(s, { type: "STEAL", playerId: target }); assert.equal(islandResourceCount(s.players.find(p => p.playerId === target)!.resources), count - 1); }
  assert.equal(s.stage.kind, "ACTION");
  assert.ok(s.log.filter(l => l.text.includes("버렸") || l.text.includes("가져왔")).every(l => !ISLAND_RESOURCES.some(r => l.text.includes(r))));
});
test("ISLAND bank and ports enforce resource-specific 4:1, 3:1 and 2:1 rates", () => {
  const s = ready(), id = activeIslandPlayer(s);
  s.buildings = []; assert.equal(islandBankRate(s, id, "WOOD"), 4);
  const port = s.ports.find(p => p.resource === null)!, edge = ISLAND_BOARD.edges[port.edge]!;
  s.buildings.push({ vertex: edge.a, playerId: id, kind: "SETTLEMENT" }); assert.equal(islandBankRate(s, id, "WOOD"), 3);
  const woodPort = s.ports.find(p => p.resource === "WOOD")!; s.buildings = [{ vertex: ISLAND_BOARD.edges[woodPort.edge]!.a, playerId: id, kind: "SETTLEMENT" }]; assert.equal(islandBankRate(s, id, "WOOD"), 2); assert.equal(islandBankRate(s, id, "ORE"), 4);
  fund(s, s.activeIndex, { WOOD: 4 }); const ore = s.players[s.activeIndex]!.resources.ORE;
  const next = action(s, { type: "BANK_TRADE", give: "WOOD", receive: "ORE" }); assert.equal(next.players[s.activeIndex]!.resources.WOOD, 2); assert.equal(next.players[s.activeIndex]!.resources.ORE, ore + 1);
  assert.equal(actIsland(next, id, { type: "BANK_TRADE", give: "WOOD", receive: "WOOD" }, context(next)).ok, false);
});
test("ISLAND trade offer, multiple responses, exactly one confirmation, replacement invalidates consent", () => {
  let s = ready(), actor = activeIslandPlayer(s); fund(s, 0, { WOOD: 6 }); fund(s, 1, { ORE: 4 }); fund(s, 2, { ORE: 4 });
  const give = { ...emptyIslandResources(), WOOD: 2 }, receive = { ...emptyIslandResources(), ORE: 1 };
  s = action(s, { type: "OFFER_TRADE", give, receive }); const tradeId = s.trade!.id;
  s = action(s, { type: "RESPOND_TRADE", tradeId, accepted: true }, s.players[1]!.playerId);
  s = action(s, { type: "RESPOND_TRADE", tradeId, accepted: true }, s.players[2]!.playerId);
  const before = structuredClone(s), other = s.players[1]!.playerId;
  s = action(s, { type: "CONFIRM_TRADE", tradeId, playerId: other });
  assert.equal(s.trade, null); assert.equal(s.players[0]!.resources.WOOD, before.players[0]!.resources.WOOD - 2); assert.equal(s.players[1]!.resources.ORE, before.players[1]!.resources.ORE - 1);
  assert.equal(actIsland(s, actor, { type: "CONFIRM_TRADE", tradeId, playerId: other }, context(s)).ok, false);
  let revised = action(before, { type: "OFFER_TRADE", give: receive, receive: give }, other);
  assert.notEqual(revised.trade!.id, tradeId); assert.deepEqual(revised.trade!.responses, []);
  assert.equal(actIsland(revised, actor, { type: "CONFIRM_TRADE", tradeId, playerId: other }, context(revised)).ok, false);
  assert.equal(actIsland(revised, revised.players[2]!.playerId, { type: "RESPOND_TRADE", tradeId: revised.trade!.id, accepted: true }, context(revised)).ok, false);
  revised = action(revised, { type: "RESPOND_TRADE", tradeId: revised.trade!.id, accepted: true }, actor);
  revised = action(revised, { type: "CONFIRM_TRADE", tradeId: revised.trade!.id, playerId: actor }, other); assert.equal(revised.trade, null);
});
test("ISLAND trade finalization rechecks inventory and rejects gifts/same resources", () => {
  const s = ready(); fund(s, 0, { WOOD: 2 }); fund(s, 1, { ORE: 1 });
  let offered = action(s, { type: "OFFER_TRADE", give: { ...emptyIslandResources(), WOOD: 2 }, receive: { ...emptyIslandResources(), ORE: 1 } });
  offered = action(offered, { type: "RESPOND_TRADE", tradeId: offered.trade!.id, accepted: true }, offered.players[1]!.playerId);
  fund(offered, 0, { WOOD: 0 }); const before = structuredClone(offered);
  assert.equal(actIsland(offered, activeIslandPlayer(offered), { type: "CONFIRM_TRADE", tradeId: offered.trade!.id, playerId: offered.players[1]!.playerId }, context(offered)).ok, false); assert.deepEqual(offered, before);
  assert.equal(actIsland(s, activeIslandPlayer(s), { type: "OFFER_TRADE", give: emptyIslandResources(), receive: { ...emptyIslandResources(), ORE: 1 } }, context(s)).ok, false);
  assert.equal(actIsland(s, activeIslandPlayer(s), { type: "OFFER_TRADE", give: { ...emptyIslandResources(), WOOD: 1 }, receive: { ...emptyIslandResources(), WOOD: 1 } }, context(s)).ok, false);
});
test("ISLAND development uses one eligible old card per turn, allows knight before roll", () => {
  const s = started(), id = activeIslandPlayer(s), knight = card(s, 0, "KNIGHT"), second = card(s, 0, "MONOPOLY");
  let used = action(s, { type: "PLAY_KNIGHT", cardId: knight }); assert.equal(used.stage.kind, "ROBBER_HEX"); assert.equal(used.playedDevelopment, true);
  used = action(used, { type: "MOVE_ROBBER", hex: used.hexes.find(h => h.id !== used.robber && !used.buildings.some(b => ISLAND_BOARD.vertices[b.vertex]!.hexes.includes(h.id)))!.id });
  assert.equal(used.stage.kind, "ROLL"); assert.equal(actIsland(used, id, { type: "PLAY_MONOPOLY", cardId: second, resource: "ORE" }, context(used)).ok, false);
  const fresh = ready(); fund(fresh, 0, { WOOL: 1, GRAIN: 1, ORE: 1 });
  fresh.deck.unshift(...fresh.deck.splice(fresh.deck.findIndex(c => c.kind === "KNIGHT"), 1));
  const bought = action(fresh, { type: "BUY_CARD" }), c = bought.players[0]!.cards.at(-1)!;
  assert.equal(c.kind, "KNIGHT"); assert.equal(actIsland(bought, activeIslandPlayer(bought), { type: "PLAY_KNIGHT", cardId: c.id }, context(bought)).ok, false);
  assert.equal(actIsland(s, id, { type: "PLAY_KNIGHT", cardId: "unknown-card" }, context(s)).ok, false);
});
for (const kind of ["PLENTY", "MONOPOLY", "ROADS"] as const) test("ISLAND " + kind + " card resolves with resource/card/piece conservation", () => {
  const s = ready(), id = activeIslandPlayer(s), cardId = card(s, 0, kind), before = structuredClone(s);
  let next: IslandState;
  if (kind === "PLENTY") { next = action(s, { type: "PLAY_PLENTY", cardId, resources: { ...emptyIslandResources(), WOOD: 2 } }); assert.equal(next.players[0]!.resources.WOOD, before.players[0]!.resources.WOOD + 2); }
  else if (kind === "MONOPOLY") { next = action(s, { type: "PLAY_MONOPOLY", cardId, resource: "GRAIN" }); assert.equal(next.players[0]!.resources.GRAIN, before.players.reduce((n, p) => n + p.resources.GRAIN, 0)); }
  else { next = action(s, { type: "PLAY_ROADS", cardId }); next = action(next, { type: "BUILD_ROAD", edge: legalIslandRoads(next, id)[0]! }); next = action(next, { type: "BUILD_ROAD", edge: legalIslandRoads(next, id)[0]! }); assert.equal(next.stage.kind, "ACTION"); assert.deepEqual(next.players[0]!.resources, before.players[0]!.resources); }
  assert.equal(next.usedCards.at(-1)!.id, cardId); parseIslandState(next);
});
test("ISLAND buying a victory card wins on own turn, hidden points and deck IDs stay private", () => {
  const s = ready(), id = activeIslandPlayer(s); s.buildings = []; s.roads = [];
  for (let i = 0; i < 5; i++) { const vertex = legalIslandSettlements(s, id, true)[0]!; s.buildings.push({ vertex, playerId: id, kind: i < 4 ? "CITY" : "SETTLEMENT" }); }
  const at = s.deck.findIndex(c => c.kind === "VICTORY"); s.deck.unshift(...s.deck.splice(at, 1)); fund(s, 0, { WOOL: 1, GRAIN: 1, ORE: 1 });
  const next = action(s, { type: "BUY_CARD" }); assert.equal(next.phase, "FINISHED"); assert.deepEqual(next.result?.winnerPlayerIds, [id]); assert.equal(next.result!.scores[0]!.points, 10);
  const privateState = ready(); card(privateState, 0, "VICTORY"); card(privateState, 1, "KNIGHT");
  const stored = { gameId: parse(GameIdSchema, privateState.gameId), gameRevision: parse(GameRevisionSchema, privateState.revision), startedAt: privateState.startedAt, finishedAt: null, state: privateState };
  const p0 = projectIsland(stored, privateState.players[0]!.playerId), p1 = projectIsland(stored, privateState.players[1]!.playerId);
  assert.equal(p0.privateState.totalPoints, 3); assert.equal(p1.playerStates[0]!.publicPoints, 2);
  assert.ok(!JSON.stringify(p1).includes(JSON.stringify(privateState.players[0]!.cards[0]!.id))); assert.ok(privateState.deck.every(c => !JSON.stringify(p0).includes(JSON.stringify(c.id))));
  assert.throws(() => projectIsland(stored, parse(PlayerIdSchema, "outsider")));
});
test("ISLAND every viewer gets exact public resources while opponents' development cards remain private", () => {
  const s = ready(); fund(s, 0, { WOOD: 3, BRICK: 2, WOOL: 0, GRAIN: 1, ORE: 4 }); card(s, 0, "VICTORY"); card(s, 1, "KNIGHT");
  for (const viewer of s.players) {
    const projected = projectIsland({ gameId: s.gameId, gameRevision: s.revision, startedAt: s.startedAt, finishedAt: s.finishedAt, state: s }, viewer.playerId);
    for (const p of s.players) {
      const publicPlayer = projected.playerStates.find(other => other.playerId === p.playerId)!;
      assert.deepEqual(publicPlayer.resources, p.resources); assert.equal(publicPlayer.resourceCount, islandResourceCount(p.resources));
      assert.equal("cards" in publicPlayer, false);
      if (p.playerId !== viewer.playerId) for (const c of p.cards) assert.ok(!JSON.stringify(projected).includes(JSON.stringify(c.id)));
    }
    projected.playerStates[0]!.resources.WOOD = 0; assert.equal(s.players[0]!.resources.WOOD, 3);
  }
});
test("ISLAND timeout resolves seven and a pre-roll knight before advancing once", () => {
  const s = started(); fund(s, 0, { WOOD: 8 }); fund(s, 1, { BRICK: 8 });
  const next = timeoutIsland(s, { ...context(s, seedFor(7)), now: s.deadlineAt }); assert.ok(next);
  assert.equal(next.turnNumber, s.turnNumber + 1); assert.equal(next.stage.kind, "ROLL"); assert.ok(next.players.every(p => islandResourceCount(p.resources) <= 8)); parseIslandState(next);
  const k = started(), cardId = card(k, 0, "KNIGHT"), used = action(k, { type: "PLAY_KNIGHT", cardId });
  const after = timeoutIsland(used, { ...context(used), now: used.deadlineAt }); assert.ok(after); assert.equal(after.turnNumber, used.turnNumber + 1);
});
test("ISLAND persisted validation rejects resource/card duplication, overlap and forged result", () => {
  const source = ready(), corrupt = structuredClone(source); corrupt.bank.WOOD++; assert.throws(() => parseIslandState(corrupt));
  const duplicate = structuredClone(source); duplicate.deck[0]!.id = duplicate.deck[1]!.id; assert.throws(() => parseIslandState(duplicate));
  const overlap = structuredClone(source); overlap.buildings.push({ ...overlap.buildings[0]! }); assert.throws(() => parseIslandState(overlap));
  const metadata = structuredClone(source); metadata.finishedAt = metadata.startedAt; assert.throws(() => parseIslandState(metadata));
  const numbers = structuredClone(source); numbers.hexes.find(h => h.number === 3)!.number = 2; assert.throws(() => parseIslandState(numbers));
  const stage = structuredClone(source); stage.stage = { kind: "SETUP_SETTLEMENT" }; assert.throws(() => parseIslandState(stage));
  const terminal = cancelIsland(source, source.deadlineAt - 1); terminal.result!.winnerPlayerIds = [activeIslandPlayer(source)]; assert.throws(() => parseIslandState(terminal));
  const adapter = new IslandGameStateAdapter(); assert.throws(() => adapter.cloneAndValidate({ gameId: source.gameId, gameRevision: parse(GameRevisionSchema, source.revision + 1), startedAt: source.startedAt, finishedAt: null, state: source }));
  const cloned = parseIslandState(source); cloned.players[0]!.resources.WOOD++; assert.notDeepEqual(cloned, source);
  const end = cancelIsland(source, source.deadlineAt - 1); assert.equal(end.finishedAt, parse(ServerTimeSchema, source.deadlineAt - 1));
});

for (const count of [3, 4]) test("ISLAND complete " + count + "-player game reaches a legal victory using production, building, cards and bank trades", () => {
  let s = started(count, 327);
  const seen = new Set<string>();
  for (let step = 1; step <= 6000 && s.phase === "PLAYING"; step++) {
    let actor = activeIslandPlayer(s), payload: IslandAction;
    const p = s.players[s.activeIndex]!, r = p.resources, random = islandRandom(step * 7919);
    const projected = projectIsland({ gameId: s.gameId, gameRevision: s.revision, startedAt: s.startedAt, finishedAt: s.finishedAt, state: s }, actor);
    assert.equal(projected.phase, "PLAYING"); if (projected.phase !== "PLAYING") throw new Error("Unexpected terminal.");
    const legal = projected.legalActions;
    if (s.stage.kind === "DISCARD") {
      const pending = s.stage.pending[0]!, resources = emptyIslandResources(), held = { ...s.players.find(p => p.playerId === pending.playerId)!.resources };
      for (let i = 0; i < pending.count; i++) { const kind = [...ISLAND_RESOURCES].sort((a, b) => held[b] - held[a])[0]!; resources[kind]++; held[kind]--; }
      actor = pending.playerId; payload = { type: "DISCARD", resources };
    } else if (s.stage.kind === "ROBBER_HEX") {
      payload = { type: "MOVE_ROBBER", hex: legal.robberHexes[random(legal.robberHexes.length)]! };
    } else if (s.stage.kind === "ROBBER_VICTIM") {
      payload = { type: "STEAL", playerId: s.stage.candidates[0]! };
    } else if (s.stage.kind === "FREE_ROADS") {
      payload = { type: "BUILD_ROAD", edge: legal.roadEdges[random(legal.roadEdges.length)]! };
    } else if (s.stage.kind === "ROLL") {
      payload = { type: "ROLL" };
    } else {
      assert.equal(s.stage.kind, "ACTION");
      const card = projected.privateState.cards.find(c => c.playable && (c.kind !== "ROADS" || legalIslandRoads(s, actor).length > 0));
      if (card?.kind === "KNIGHT") payload = { type: "PLAY_KNIGHT", cardId: card.id };
      else if (card?.kind === "ROADS") payload = { type: "PLAY_ROADS", cardId: card.id };
      else if (card?.kind === "MONOPOLY") payload = { type: "PLAY_MONOPOLY", cardId: card.id, resource: [...ISLAND_RESOURCES].sort((a, b) => s.players.filter(p => p.playerId !== actor).reduce((n, p) => n + p.resources[b] - p.resources[a], 0))[0]! };
      else if (card?.kind === "PLENTY") {
        const resources = emptyIslandResources();
        for (let i = 0; i < Math.min(2, islandResourceCount(s.bank)); i++) {
          const kind = [...ISLAND_RESOURCES].filter(k => s.bank[k] > resources[k]).sort((a, b) => (r[a] + resources[a] - ISLAND_COSTS.CITY[a]) - (r[b] + resources[b] - ISLAND_COSTS.CITY[b]))[0]!;
          resources[kind]++;
        }
        payload = { type: "PLAY_PLENTY", cardId: card.id, resources };
      } else if (legal.cityVertices.length) payload = { type: "BUILD_CITY", vertex: legal.cityVertices[0]! };
      else if (legal.settlementVertices.length) payload = { type: "BUILD_SETTLEMENT", vertex: legal.settlementVertices[random(legal.settlementVertices.length)]! };
      else if (legal.canBuyCard && seen.has("BUILD_CITY")) payload = { type: "BUY_CARD" };
      else if (legal.roadEdges.length && p.resources.WOOD > 0 && p.resources.BRICK > 0) payload = { type: "BUILD_ROAD", edge: legal.roadEdges[random(legal.roadEdges.length)]! };
      else {
        const costs = seen.has("BUILD_CITY") ? [ISLAND_COSTS.CARD, ISLAND_COSTS.CITY, ISLAND_COSTS.SETTLEMENT] : [ISLAND_COSTS.CITY];
        const goal = costs.sort((a, b) => ISLAND_RESOURCES.reduce((n, k) => n + Math.max(0, a[k] - r[k]) - Math.max(0, b[k] - r[k]), 0))[0]!;
        const missing = [...ISLAND_RESOURCES].filter(k => r[k] < goal[k] && s.bank[k] > 0);
        const surplus = [...ISLAND_RESOURCES].filter(k => r[k] - goal[k] >= legal.bankRates[k]).sort((a, b) => r[b] - r[a]);
        payload = missing.length && surplus.length ? { type: "BANK_TRADE", give: surplus[0]!, receive: missing[0]! } : { type: "END_TURN" };
      }
    }
    seen.add(payload.type);
    const result = actIsland(s, actor, payload, context(s, step * 37 + 23)); assert.ok(result.ok, JSON.stringify(payload)); s = result.state;
  }
  assert.equal(s.phase, "FINISHED", "Full-game policy must reach victory; points: " + s.players.map(p => islandPoints(s, p.playerId, true)).join(","));
  assert.equal(s.result?.reason, "VICTORY"); assert.equal(s.result!.winnerPlayerIds.length, 1); assert.ok(s.result!.scores.some(p => p.points >= 10));
  for (const expected of ["ROLL", "BUILD_CITY", "BUY_CARD", "BANK_TRADE", "DISCARD", "MOVE_ROBBER"]) assert.ok(seen.has(expected), "Missing full-game action " + expected);
  parseIslandState(s);
});

import * as v from "valibot";
import {
  GameIdSchema, PlayerIdSchema, TurnIdSchema, ServerTimeSchema, GameRevisionSchema,
  ISLAND_BOARD, ISLAND_RESOURCES, IslandActionSchema, IslandResourcesSchema, IslandHexFaceSchema,
  IslandPortSchema, IslandBuildingSchema, IslandRoadSchema, IslandTradeSchema, IslandStageSchema,
  IslandCardKindSchema, IslandOpaqueIdSchema, IslandLogSchema, emptyIslandResources, islandResourceCount,
  type IslandAction, type IslandResource, type IslandResources, type PlayerId,
} from "@hangul-rummikub/shared";

export const ISLAND_TURN_MS = 120_000;
const Integer = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const CardSchema = v.strictObject({ id: IslandOpaqueIdSchema, kind: IslandCardKindSchema, boughtTurn: Integer });
const PlayerSchema = v.strictObject({ playerId: PlayerIdSchema, resources: IslandResourcesSchema, cards: v.pipe(v.array(CardSchema), v.maxLength(25)) });
const ResultSchema = v.strictObject({
  reason: v.picklist(["VICTORY", "CANCELLED"]), winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(1)),
  scores: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, points: Integer })), v.minLength(3), v.maxLength(4)),
});
const StateSchema = v.strictObject({
  gameId: GameIdSchema, rulesVersion: v.literal("island-v1"), phase: v.picklist(["PLAYING", "FINISHED"]),
  revision: GameRevisionSchema, startedAt: ServerTimeSchema, finishedAt: v.nullable(ServerTimeSchema),
  players: v.pipe(v.array(PlayerSchema), v.minLength(3), v.maxLength(4)),
  hexes: v.pipe(v.array(IslandHexFaceSchema), v.length(19)), ports: v.pipe(v.array(IslandPortSchema), v.length(9)),
  buildings: v.pipe(v.array(IslandBuildingSchema), v.maxLength(36)), roads: v.pipe(v.array(IslandRoadSchema), v.maxLength(60)),
  bank: IslandResourcesSchema, deck: v.pipe(v.array(CardSchema), v.maxLength(25)),
  usedCards: v.pipe(v.array(v.strictObject({ ...CardSchema.entries, playerId: PlayerIdSchema })), v.maxLength(20)),
  robber: v.pipe(Integer, v.maxValue(18)), activeIndex: v.pipe(Integer, v.maxValue(3)),
  setupStep: v.pipe(Integer, v.maxValue(8)), turnNumber: Integer, turnId: TurnIdSchema, deadlineAt: ServerTimeSchema,
  stage: IslandStageSchema, playedDevelopment: v.boolean(), trade: v.nullable(IslandTradeSchema),
  longestRoadPlayerId: v.nullable(PlayerIdSchema), largestArmyPlayerId: v.nullable(PlayerIdSchema),
  dice: v.nullable(v.tuple([v.picklist([1, 2, 3, 4, 5, 6]), v.picklist([1, 2, 3, 4, 5, 6])])),
  log: v.pipe(v.array(IslandLogSchema), v.maxLength(24)), result: v.nullable(ResultSchema),
});
export type IslandState = v.InferOutput<typeof StateSchema>;
export type IslandCard = v.InferOutput<typeof CardSchema>;
export type IslandContext = Readonly<{ now: number; nextTurnId: string; tradeId: string; seed: number; automatic?: boolean }>;
export type IslandOutcome = Readonly<{ ok: true; state: IslandState }> | Readonly<{ ok: false; reason: "INVALID_ACTION" | "NOT_YOUR_TURN" | "INSUFFICIENT_RESOURCES" | "EXPIRED" }>;
const fail = (reason: Extract<IslandOutcome, { ok: false }>["reason"] = "INVALID_ACTION"): IslandOutcome => ({ ok: false, reason });
const resourceNames: Record<IslandResource, string> = { WOOD: "목재", BRICK: "벽돌", WOOL: "양모", GRAIN: "곡물", ORE: "광석" };
export const ISLAND_COSTS: Readonly<Record<"ROAD" | "SETTLEMENT" | "CITY" | "CARD", IslandResources>> = {
  ROAD: { WOOD: 1, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 },
  SETTLEMENT: { WOOD: 1, BRICK: 1, WOOL: 1, GRAIN: 1, ORE: 0 },
  CITY: { WOOD: 0, BRICK: 0, WOOL: 0, GRAIN: 2, ORE: 3 },
  CARD: { WOOD: 0, BRICK: 0, WOOL: 1, GRAIN: 1, ORE: 1 },
};
const CARD_COUNTS = { KNIGHT: 14, VICTORY: 5, ROADS: 2, PLENTY: 2, MONOPOLY: 2 } as const;
const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12] as const;
/** Local deterministic PRNG. The application supplies an unbroadcast server seed. */
export function islandRandom(seed: number): (max: number) => number {
  let state = (seed >>> 0) || 0x9e3779b9;
  return max => {
    if (!Number.isSafeInteger(max) || max < 1 || max > 0x7fffffff) throw new Error("Invalid random bound.");
    const limit = Math.floor(0x100000000 / max) * max;
    let value: number;
    do { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; value = state >>> 0; } while (value >= limit);
    return value % max;
  };
}
function shuffle<T>(items: readonly T[], random: (max: number) => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = random(i + 1); [result[i], result[j]] = [result[j]!, result[i]!]; }
  return result;
}
export function makeIslandDeck(ids: readonly string[]): IslandCard[] {
  if (ids.length !== 25 || new Set(ids).size !== 25) throw new Error("25 distinct card IDs required.");
  const cards: IslandCard[] = [];
  for (const kind of ["KNIGHT", "VICTORY", "ROADS", "PLENTY", "MONOPOLY"] as const) {
    for (let i = 0; i < CARD_COUNTS[kind]; i++) cards.push({ id: v.parse(IslandOpaqueIdSchema, ids[cards.length]), kind, boughtTurn: 0 });
  }
  return cards;
}
export function createIslandGame(input: Readonly<{ gameId: string; playerIds: readonly PlayerId[]; cardIds: readonly string[]; now: number; turnId: string; random: (maxExclusive: number) => number }>): IslandState {
  // Draw from the injected source separately: a public board must not disclose a shared seed for the private deck.
  const random = input.random;
  const terrain: (IslandResource | null)[] = shuffle(["WOOD", "WOOD", "WOOD", "WOOD", "WOOL", "WOOL", "WOOL", "WOOL", "GRAIN", "GRAIN", "GRAIN", "GRAIN", "BRICK", "BRICK", "BRICK", "ORE", "ORE", "ORE", null], random);
  let hexes: IslandState["hexes"] = [];
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const ns = shuffle(NUMBER_TOKENS, random); let at = 0;
    hexes = terrain.map((resource, id) => ({ id, resource, number: resource === null ? null : ns[at++]! }));
    if (!ISLAND_BOARD.edges.some(e => e.hexes.length === 2 && e.hexes.every(h => hexes[h]!.number === 6 || hexes[h]!.number === 8))) break;
    if (attempt === 9999) throw new Error("Unable to create valid island.");
  }
  const ports = shuffle<IslandResource | null>([null, null, null, null, ...ISLAND_RESOURCES], random);
  return parseIslandState({
    gameId: input.gameId, rulesVersion: "island-v1", phase: "PLAYING", revision: 0, startedAt: input.now, finishedAt: null,
    players: shuffle(input.playerIds, random).map(playerId => ({ playerId, resources: emptyIslandResources(), cards: [] })),
    hexes, ports: ISLAND_BOARD.portEdges.map((edge, i) => ({ edge, resource: ports[i]! })), buildings: [], roads: [],
    bank: { WOOD: 19, BRICK: 19, WOOL: 19, GRAIN: 19, ORE: 19 }, deck: shuffle(makeIslandDeck(input.cardIds), random), usedCards: [],
    robber: terrain.indexOf(null), activeIndex: 0, setupStep: 0, turnNumber: 0, turnId: input.turnId, deadlineAt: input.now + ISLAND_TURN_MS,
    stage: { kind: "SETUP_SETTLEMENT" }, playedDevelopment: false, trade: null, longestRoadPlayerId: null, largestArmyPlayerId: null, dice: null,
    log: [{ revision: 0, playerId: null, text: "섬이 준비되었습니다. 첫 마을과 도로를 배치하세요.", automatic: false }], result: null,
  });
}
export function activeIslandPlayer(s: IslandState): PlayerId { return s.players[s.activeIndex]!.playerId; }
function player(s: IslandState, id: PlayerId) { const found = s.players.find(p => p.playerId === id); if (!found) throw new Error("Unknown player."); return found; }
const canPay = (held: IslandResources, cost: IslandResources): boolean => ISLAND_RESOURCES.every(r => held[r] >= cost[r]);
function transfer(from: IslandResources, to: IslandResources, resources: IslandResources) { for (const r of ISLAND_RESOURCES) { from[r] -= resources[r]; to[r] += resources[r]; } }
function pay(s: IslandState, id: PlayerId, cost: IslandResources): boolean {
  const resources = player(s, id).resources;
  if (!canPay(resources, cost)) return false;
  transfer(resources, s.bank, cost); return true;
}
export function islandPieces(s: IslandState, id: PlayerId) {
  return { roads: 15 - s.roads.filter(r => r.playerId === id).length, settlements: 5 - s.buildings.filter(b => b.playerId === id && b.kind === "SETTLEMENT").length, cities: 4 - s.buildings.filter(b => b.playerId === id && b.kind === "CITY").length };
}
export function legalIslandSettlements(s: IslandState, id: PlayerId, setup = false): number[] {
  if (islandPieces(s, id).settlements === 0) return [];
  return ISLAND_BOARD.vertices.filter(vertex => {
    if (s.buildings.some(b => b.vertex === vertex.id)) return false;
    if (vertex.edges.some(ei => { const e = ISLAND_BOARD.edges[ei]!; return s.buildings.some(b => b.vertex === (e.a === vertex.id ? e.b : e.a)); })) return false;
    return setup || vertex.edges.some(e => s.roads.some(r => r.edge === e && r.playerId === id));
  }).map(v => v.id);
}
export function legalIslandRoads(s: IslandState, id: PlayerId, setupVertex?: number): number[] {
  if (islandPieces(s, id).roads === 0) return [];
  return ISLAND_BOARD.edges.filter(edge => {
    if (s.roads.some(r => r.edge === edge.id)) return false;
    if (setupVertex !== undefined) return edge.a === setupVertex || edge.b === setupVertex;
    return [edge.a, edge.b].some(vi => {
      const building = s.buildings.find(b => b.vertex === vi);
      if (building) return building.playerId === id;
      return ISLAND_BOARD.vertices[vi]!.edges.some(e => s.roads.some(r => r.edge === e && r.playerId === id));
    });
  }).map(e => e.id);
}
export function islandRoadLength(s: IslandState, id: PlayerId): number {
  const own = new Set(s.roads.filter(r => r.playerId === id).map(r => r.edge));
  const blocked = new Set(s.buildings.filter(b => b.playerId !== id).map(b => b.vertex));
  const walk = (vertex: number, used: Set<number>): number => {
    if (used.size > 0 && blocked.has(vertex)) return used.size;
    let longest = used.size;
    for (const ei of ISLAND_BOARD.vertices[vertex]!.edges) {
      if (!own.has(ei) || used.has(ei)) continue;
      const e = ISLAND_BOARD.edges[ei]!; used.add(ei);
      longest = Math.max(longest, walk(e.a === vertex ? e.b : e.a, used)); used.delete(ei);
    }
    return longest;
  };
  return Math.max(0, ...ISLAND_BOARD.vertices.filter(v => v.edges.some(e => own.has(e))).map(v => walk(v.id, new Set())));
}
export const islandKnights = (s: IslandState, id: PlayerId): number => s.usedCards.filter(c => c.playerId === id && c.kind === "KNIGHT").length;
function award(s: IslandState, holder: PlayerId | null, minimum: number, score: (id: PlayerId) => number): PlayerId | null {
  const values = s.players.map(p => ({ id: p.playerId, value: score(p.playerId) })), maximum = Math.max(...values.map(v => v.value));
  if (maximum < minimum) return null;
  const tied = values.filter(v => v.value === maximum);
  if (holder !== null && tied.some(v => v.id === holder)) return holder;
  return tied.length === 1 ? tied[0]!.id : null;
}
export function islandPoints(s: IslandState, id: PlayerId, includeHidden = false): number {
  return s.buildings.filter(b => b.playerId === id).reduce((sum, b) => sum + (b.kind === "CITY" ? 2 : 1), 0)
    + (s.longestRoadPlayerId === id ? 2 : 0) + (s.largestArmyPlayerId === id ? 2 : 0)
    + (includeHidden ? player(s, id).cards.filter(c => c.kind === "VICTORY").length : 0);
}
function finish(s: IslandState, reason: "VICTORY" | "CANCELLED", now: number) {
  s.phase = "FINISHED"; s.finishedAt = v.parse(ServerTimeSchema, now); s.trade = null;
  s.result = { reason, winnerPlayerIds: reason === "VICTORY" ? [activeIslandPlayer(s)] : [], scores: s.players.map(p => ({ playerId: p.playerId, points: islandPoints(s, p.playerId, true) })) };
}
function updateAwards(s: IslandState, now: number) {
  s.longestRoadPlayerId = award(s, s.longestRoadPlayerId, 5, id => islandRoadLength(s, id));
  s.largestArmyPlayerId = award(s, s.largestArmyPlayerId, 3, id => islandKnights(s, id));
  if (s.turnNumber > 0 && islandPoints(s, activeIslandPlayer(s), true) >= 10) finish(s, "VICTORY", now);
}
function log(s: IslandState, id: PlayerId | null, text: string, automatic = false) {
  s.log.push({ revision: s.revision, playerId: id, text, automatic }); s.log = s.log.slice(-24);
}
function newTurn(s: IslandState, context: IslandContext) {
  s.activeIndex = (s.activeIndex + 1) % s.players.length; s.turnNumber++; s.turnId = v.parse(TurnIdSchema, context.nextTurnId);
  s.deadlineAt = v.parse(ServerTimeSchema, context.now + ISLAND_TURN_MS); s.stage = { kind: "ROLL" }; s.playedDevelopment = false; s.dice = null; s.trade = null;
}
function completeSetup(s: IslandState, context: IslandContext) {
  s.setupStep++; s.turnId = v.parse(TurnIdSchema, context.nextTurnId); s.deadlineAt = v.parse(ServerTimeSchema, context.now + ISLAND_TURN_MS);
  if (s.setupStep === s.players.length * 2) { s.activeIndex = 0; s.turnNumber = 1; s.stage = { kind: "ROLL" }; return; }
  s.activeIndex = s.setupStep < s.players.length ? s.setupStep : s.players.length * 2 - s.setupStep - 1;
  s.stage = { kind: "SETUP_SETTLEMENT" };
}
function produce(s: IslandState, rolled: number) {
  for (const r of ISLAND_RESOURCES) {
    const claims = s.players.map(p => ({ id: p.playerId, count: s.buildings.filter(b => b.playerId === p.playerId).reduce((sum, b) =>
      sum + ISLAND_BOARD.vertices[b.vertex]!.hexes.filter(hi => hi !== s.robber && s.hexes[hi]!.resource === r && s.hexes[hi]!.number === rolled).length * (b.kind === "CITY" ? 2 : 1), 0) })).filter(p => p.count > 0);
    const total = claims.reduce((sum, p) => sum + p.count, 0);
    if (claims.length > 1 && total > s.bank[r]) continue;
    for (const claim of claims) { const n = Math.min(claim.count, s.bank[r]); s.bank[r] -= n; player(s, claim.id).resources[r] += n; }
  }
}
export function islandBankRate(s: IslandState, id: PlayerId, resource: IslandResource): 2 | 3 | 4 {
  let rate: 2 | 3 | 4 = 4;
  for (const port of s.ports) {
    const edge = ISLAND_BOARD.edges[port.edge]!;
    if (!s.buildings.some(b => b.playerId === id && (b.vertex === edge.a || b.vertex === edge.b))) continue;
    if (port.resource === resource) return 2;
    if (port.resource === null) rate = 3;
  }
  return rate;
}
function roll(s: IslandState, random: (max: number) => number) {
  s.dice = v.parse(StateSchema.entries.dice, [random(6) + 1, random(6) + 1]);
  const total = s.dice![0] + s.dice![1];
  if (total !== 7) { produce(s, total); s.stage = { kind: "ACTION" }; }
  else {
    const pending = s.players.filter(p => islandResourceCount(p.resources) > 7).map(p => ({ playerId: p.playerId, count: Math.floor(islandResourceCount(p.resources) / 2) }));
    s.stage = pending.length > 0 ? { kind: "DISCARD", pending } : { kind: "ROBBER_HEX", returnTo: "ACTION" };
  }
}
function moveRobber(s: IslandState, hex: number) {
  if (s.stage.kind !== "ROBBER_HEX" || hex === s.robber) return false;
  s.robber = hex;
  const active = activeIslandPlayer(s), adjacent = new Set(s.buildings.filter(b => ISLAND_BOARD.vertices[b.vertex]!.hexes.includes(hex)).map(b => b.playerId));
  const candidates = s.players.filter(p => p.playerId !== active && adjacent.has(p.playerId) && islandResourceCount(p.resources) > 0).map(p => p.playerId);
  s.stage = candidates.length ? { kind: "ROBBER_VICTIM", returnTo: s.stage.returnTo, candidates } : { kind: s.stage.returnTo };
  return true;
}
function randomResource(resources: IslandResources, random: (max: number) => number): IslandResource {
  let n = random(islandResourceCount(resources));
  for (const r of ISLAND_RESOURCES) { if (n < resources[r]) return r; n -= resources[r]; }
  throw new Error("Resource selection failed.");
}
function steal(s: IslandState, id: PlayerId, random: (max: number) => number): boolean {
  if (s.stage.kind !== "ROBBER_VICTIM" || !s.stage.candidates.includes(id)) return false;
  const victim = player(s, id), self = player(s, activeIslandPlayer(s)), resource = randomResource(victim.resources, random);
  victim.resources[resource]--; self.resources[resource]++; s.stage = { kind: s.stage.returnTo }; return true;
}
function finishFreeRoad(s: IslandState) {
  if (s.stage.kind !== "FREE_ROADS") return;
  s.stage = s.stage.remaining === 1 || legalIslandRoads(s, activeIslandPlayer(s)).length === 0 ? { kind: s.stage.returnTo } : { ...s.stage, remaining: 1 };
}
function consumeCard(s: IslandState, id: PlayerId, cardId: string, kind: IslandCard["kind"]): boolean {
  const p = player(s, id), index = p.cards.findIndex(c => c.id === cardId && c.kind === kind && c.boughtTurn < s.turnNumber);
  if (s.playedDevelopment || index < 0 || (s.stage.kind !== "ROLL" && s.stage.kind !== "ACTION")) return false;
  const card = p.cards.splice(index, 1)[0]!; s.usedCards.push({ ...card, playerId: id }); s.playedDevelopment = true; return true;
}
const validTrade = (give: IslandResources, receive: IslandResources): boolean =>
  islandResourceCount(give) > 0 && islandResourceCount(receive) > 0 && ISLAND_RESOURCES.every(r => give[r] === 0 || receive[r] === 0);
function apply(s: IslandState, actor: PlayerId, action: IslandAction, context: IslandContext, random: (max: number) => number): IslandOutcome {
  const active = activeIslandPlayer(s), p = player(s, actor);
  const offTurn = ["DISCARD", "OFFER_TRADE", "RESPOND_TRADE", "CONFIRM_TRADE", "CANCEL_TRADE"].includes(action.type);
  if (!offTurn && actor !== active) return fail("NOT_YOUR_TURN");
  switch (action.type) {
    case "BUILD_SETTLEMENT": {
      const setup = s.stage.kind === "SETUP_SETTLEMENT";
      if ((!setup && s.stage.kind !== "ACTION") || !legalIslandSettlements(s, actor, setup).includes(action.vertex)) return fail();
      if (!setup && !pay(s, actor, ISLAND_COSTS.SETTLEMENT)) return fail("INSUFFICIENT_RESOURCES");
      s.buildings.push({ vertex: action.vertex, playerId: actor, kind: "SETTLEMENT" });
      if (setup) {
        if (s.setupStep >= s.players.length) for (const hi of ISLAND_BOARD.vertices[action.vertex]!.hexes) { const r = s.hexes[hi]!.resource; if (r && s.bank[r] > 0) { s.bank[r]--; p.resources[r]++; } }
        s.stage = { kind: "SETUP_ROAD", vertex: action.vertex };
      }
      log(s, actor, "마을을 건설했습니다.", context.automatic); break;
    }
    case "BUILD_ROAD": {
      const setup = s.stage.kind === "SETUP_ROAD", free = s.stage.kind === "FREE_ROADS";
      if (!setup && !free && s.stage.kind !== "ACTION") return fail();
      const vertex = s.stage.kind === "SETUP_ROAD" ? s.stage.vertex : undefined;
      if (!legalIslandRoads(s, actor, vertex).includes(action.edge)) return fail();
      if (!setup && !free && !pay(s, actor, ISLAND_COSTS.ROAD)) return fail("INSUFFICIENT_RESOURCES");
      s.roads.push({ edge: action.edge, playerId: actor });
      if (setup) completeSetup(s, context); else if (free) finishFreeRoad(s);
      log(s, actor, "도로를 건설했습니다.", context.automatic); break;
    }
    case "BUILD_CITY": {
      const b = s.buildings.find(b => b.vertex === action.vertex && b.playerId === actor && b.kind === "SETTLEMENT");
      if (s.stage.kind !== "ACTION" || !b || islandPieces(s, actor).cities === 0) return fail();
      if (!pay(s, actor, ISLAND_COSTS.CITY)) return fail("INSUFFICIENT_RESOURCES");
      b.kind = "CITY"; log(s, actor, "마을을 도시로 발전시켰습니다."); break;
    }
    case "ROLL":
      if (s.stage.kind !== "ROLL") return fail();
      roll(s, random); log(s, actor, "주사위 " + s.dice!.join(" + ") + " · " + (s.dice![0] + s.dice![1] === 7 ? "도둑이 움직입니다." : "자원을 생산했습니다."), context.automatic); break;
    case "END_TURN":
      if (s.stage.kind !== "ACTION") return fail();
      updateAwards(s, context.now); if (s.phase === "FINISHED") break;
      log(s, actor, "차례를 마쳤습니다.", context.automatic); newTurn(s, context); break;
    case "BUY_CARD":
      if (s.stage.kind !== "ACTION" || s.deck.length === 0) return fail();
      if (!pay(s, actor, ISLAND_COSTS.CARD)) return fail("INSUFFICIENT_RESOURCES");
      p.cards.push({ ...s.deck.shift()!, boughtTurn: s.turnNumber }); log(s, actor, "발전 카드 한 장을 구입했습니다."); break;
    case "PLAY_KNIGHT": {
      const returnTo = s.stage.kind;
      if (returnTo !== "ROLL" && returnTo !== "ACTION" || !consumeCard(s, actor, action.cardId, "KNIGHT")) return fail();
      s.trade = null; s.stage = { kind: "ROBBER_HEX", returnTo }; log(s, actor, "기사를 사용했습니다."); break;
    }
    case "PLAY_ROADS": {
      const returnTo = s.stage.kind;
      if ((returnTo !== "ROLL" && returnTo !== "ACTION") || legalIslandRoads(s, actor).length === 0 || !consumeCard(s, actor, action.cardId, "ROADS")) return fail();
      s.trade = null; s.stage = { kind: "FREE_ROADS", returnTo, remaining: 2 }; log(s, actor, "도로 건설 카드를 사용했습니다."); break;
    }
    case "PLAY_PLENTY":
      if (islandResourceCount(action.resources) !== Math.min(2, islandResourceCount(s.bank)) || !canPay(s.bank, action.resources) || !consumeCard(s, actor, action.cardId, "PLENTY")) return fail();
      transfer(s.bank, p.resources, action.resources); log(s, actor, "풍년으로 자원 " + islandResourceCount(action.resources) + "장을 받았습니다."); break;
    case "PLAY_MONOPOLY":
      if (!consumeCard(s, actor, action.cardId, "MONOPOLY")) return fail();
      for (const other of s.players) if (other.playerId !== actor) { p.resources[action.resource] += other.resources[action.resource]; other.resources[action.resource] = 0; }
      log(s, actor, resourceNames[action.resource] + " 독점을 사용했습니다."); break;
    case "DISCARD": {
      if (s.stage.kind !== "DISCARD") return fail();
      const pending = s.stage.pending.find(p => p.playerId === actor);
      if (!pending || islandResourceCount(action.resources) !== pending.count || !canPay(p.resources, action.resources)) return fail();
      transfer(p.resources, s.bank, action.resources); const remaining = s.stage.pending.filter(p => p.playerId !== actor);
      s.stage = remaining.length ? { kind: "DISCARD", pending: remaining } : { kind: "ROBBER_HEX", returnTo: "ACTION" };
      log(s, actor, "자원 " + pending.count + "장을 버렸습니다.", context.automatic); break;
    }
    case "MOVE_ROBBER":
      if (!moveRobber(s, action.hex)) return fail();
      log(s, actor, "도둑을 이동했습니다.", context.automatic); break;
    case "STEAL":
      if (!steal(s, action.playerId, random)) return fail();
      log(s, actor, "인접 상대에게서 자원 한 장을 가져왔습니다.", context.automatic); break;
    case "BANK_TRADE": {
      const rate = islandBankRate(s, actor, action.give);
      if (s.stage.kind !== "ACTION" || action.give === action.receive || p.resources[action.give] < rate || s.bank[action.receive] < 1) return fail();
      p.resources[action.give] -= rate; s.bank[action.give] += rate; p.resources[action.receive]++; s.bank[action.receive]--;
      log(s, actor, resourceNames[action.give] + " " + rate + "장 → " + resourceNames[action.receive] + " 1장 교환"); break;
    }
    case "OFFER_TRADE":
      if (s.stage.kind !== "ACTION" || !validTrade(action.give, action.receive) || !canPay(p.resources, action.give)) return fail();
      // Only the proposer or an eligible counterpart can replace the live offer.
      if (s.trade && s.trade.proposerId !== actor && active !== actor && s.trade.proposerId !== active) return fail();
      s.trade = { id: context.tradeId, proposerId: actor, give: { ...action.give }, receive: { ...action.receive }, responses: [] };
      log(s, actor, "새 거래 조건을 제안했습니다."); break;
    case "RESPOND_TRADE":
      if (s.stage.kind !== "ACTION" || !s.trade || s.trade.id !== action.tradeId || actor === s.trade.proposerId || (actor !== active && s.trade.proposerId !== active)) return fail();
      if (action.accepted && !canPay(p.resources, s.trade.receive)) return fail("INSUFFICIENT_RESOURCES");
      s.trade.responses = [...s.trade.responses.filter(r => r.playerId !== actor), { playerId: actor, accepted: action.accepted }]; break;
    case "CONFIRM_TRADE": {
      const t = s.trade;
      if (s.stage.kind !== "ACTION" || !t || t.id !== action.tradeId || t.proposerId !== actor || action.playerId === actor || (actor !== active && action.playerId !== active)) return fail();
      if (!t.responses.some(r => r.playerId === action.playerId && r.accepted)) return fail();
      const other = player(s, action.playerId);
      if (!canPay(p.resources, t.give) || !canPay(other.resources, t.receive)) return fail("INSUFFICIENT_RESOURCES");
      transfer(p.resources, other.resources, t.give); transfer(other.resources, p.resources, t.receive);
      s.trade = null; log(s, actor, "플레이어 간 거래를 완료했습니다."); break;
    }
    case "CANCEL_TRADE":
      if (s.stage.kind !== "ACTION" || !s.trade || s.trade.id !== action.tradeId || s.trade.proposerId !== actor) return fail();
      s.trade = null; break;
  }
  updateAwards(s, context.now);
  return { ok: true, state: s };
}
export function actIsland(state: IslandState, actor: PlayerId, actionInput: unknown, context: IslandContext): IslandOutcome {
  const parsed = v.safeParse(IslandActionSchema, actionInput);
  if (!parsed.success || !state.players.some(p => p.playerId === actor) || state.phase !== "PLAYING") return fail();
  if (context.now >= state.deadlineAt) return fail("EXPIRED");
  const s = structuredClone(state); s.revision = v.parse(GameRevisionSchema, s.revision + 1);
  const result = apply(s, actor, parsed.output, context, islandRandom(context.seed));
  return result.ok ? { ok: true, state: parseIslandState(result.state) } : result;
}
export function timeoutIsland(state: IslandState, context: IslandContext): IslandState | null {
  if (state.phase !== "PLAYING" || context.now < state.deadlineAt) return null;
  const s = structuredClone(state), random = islandRandom(context.seed), actor = activeIslandPlayer(s);
  s.revision = v.parse(GameRevisionSchema, s.revision + 1);
  const automatic = { ...context, automatic: true };
  // Bounded mandatory-choice resolution: setup <=2, normal turn <=10 operations.
  for (let count = 0; count < 20 && s.phase === "PLAYING" && s.turnId === state.turnId; count++) {
    let action: IslandAction;
    let acting = actor;
    switch (s.stage.kind) {
      case "SETUP_SETTLEMENT": { const options = legalIslandSettlements(s, actor, true); action = { type: "BUILD_SETTLEMENT", vertex: options[random(options.length)]! }; break; }
      case "SETUP_ROAD": { const options = legalIslandRoads(s, actor, s.stage.vertex); action = { type: "BUILD_ROAD", edge: options[random(options.length)]! }; break; }
      case "ROLL": action = { type: "ROLL" }; break;
      case "DISCARD": {
        const pending = s.stage.pending[0]!, available = { ...player(s, pending.playerId).resources }, resources = emptyIslandResources();
        for (let i = 0; i < pending.count; i++) { const r = randomResource(available, random); available[r]--; resources[r]++; }
        acting = pending.playerId; action = { type: "DISCARD", resources }; break;
      }
      case "ROBBER_HEX": { const hexes = s.hexes.filter(h => h.id !== s.robber); action = { type: "MOVE_ROBBER", hex: hexes[random(hexes.length)]!.id }; break; }
      case "ROBBER_VICTIM": action = { type: "STEAL", playerId: s.stage.candidates[random(s.stage.candidates.length)]! }; break;
      case "FREE_ROADS": {
        const options = legalIslandRoads(s, actor);
        if (!options.length) { s.stage = { kind: s.stage.returnTo }; continue; }
        action = { type: "BUILD_ROAD", edge: options[random(options.length)]! }; break;
      }
      case "ACTION": action = { type: "END_TURN" }; break;
    }
    const applied = apply(s, acting, action, automatic, random);
    if (!applied.ok) throw new Error("Automatic island action failed.");
  }
  if (s.phase === "PLAYING" && s.turnId === state.turnId) throw new Error("Automatic island turn did not advance.");
  log(s, actor, "2분이 지나 남은 선택을 자동으로 처리했습니다.", true);
  return parseIslandState(s);
}
export function cancelIsland(state: IslandState, now: number): IslandState {
  const s = structuredClone(state); s.revision = v.parse(GameRevisionSchema, s.revision + 1); finish(s, "CANCELLED", now);
  log(s, null, "참가자가 나가 이번 판을 취소했습니다."); return parseIslandState(s);
}
export function parseIslandState(input: unknown): IslandState {
  const s = v.parse(StateSchema, input), ids = new Set(s.players.map(p => p.playerId));
  const assert = (ok: boolean, message: string) => { if (!ok) throw new Error("Invalid island state: " + message); };
  assert(ids.size === s.players.length && s.activeIndex < s.players.length, "players");
  assert(s.deadlineAt > s.startedAt && (s.finishedAt === null || s.finishedAt >= s.startedAt), "time");
  assert(s.hexes.every((h, i) => h.id === i && (h.resource === null) === (h.number === null)), "hex identities");
  for (const r of ISLAND_RESOURCES) assert(s.hexes.filter(h => h.resource === r).length === (r === "ORE" || r === "BRICK" ? 3 : 4), "terrain supply");
  assert(s.hexes.filter(h => h.resource === null).length === 1, "desert");
  assert(s.hexes.flatMap(h => h.number === null ? [] : [h.number]).sort((a, b) => a - b).every((n, i) => n === NUMBER_TOKENS[i]), "number supply");
  assert(!ISLAND_BOARD.edges.some(e => e.hexes.length === 2 && e.hexes.every(h => s.hexes[h]!.number === 6 || s.hexes[h]!.number === 8)), "red number adjacency");
  assert(s.ports.every((p, i) => p.edge === ISLAND_BOARD.portEdges[i]) && s.ports.filter(p => p.resource === null).length === 4 && ISLAND_RESOURCES.every(r => s.ports.filter(p => p.resource === r).length === 1), "ports");
  for (const r of ISLAND_RESOURCES) assert(s.bank[r] + s.players.reduce((n, p) => n + p.resources[r], 0) === 19, "resource conservation");
  assert(new Set(s.buildings.map(b => b.vertex)).size === s.buildings.length && new Set(s.roads.map(r => r.edge)).size === s.roads.length, "board overlap");
  assert([...s.buildings, ...s.roads].every(p => ids.has(p.playerId)), "piece ownership");
  for (const p of s.players) assert(Object.values(islandPieces(s, p.playerId)).every(n => n >= 0), "piece supply");
  assert(!ISLAND_BOARD.edges.some(e => s.buildings.some(b => b.vertex === e.a) && s.buildings.some(b => b.vertex === e.b)), "settlement distance");
  const cards = [...s.deck, ...s.players.flatMap(p => p.cards), ...s.usedCards];
  assert(cards.length === 25 && new Set(cards.map(c => c.id)).size === 25, "card identity conservation");
  for (const kind of ["KNIGHT", "VICTORY", "ROADS", "PLENTY", "MONOPOLY"] as const) assert(cards.filter(c => c.kind === kind).length === CARD_COUNTS[kind], "card kind conservation");
  assert(s.usedCards.every(c => c.kind !== "VICTORY" && ids.has(c.playerId)) && s.players.every(p => p.cards.every(c => c.boughtTurn <= s.turnNumber)), "card history");
  assert(s.setupStep <= s.players.length * 2 && (s.turnNumber === 0) === (s.setupStep < s.players.length * 2), "setup progress");
  assert((s.turnNumber === 0) === (s.stage.kind === "SETUP_SETTLEMENT" || s.stage.kind === "SETUP_ROAD"), "setup stage");
  if (s.stage.kind === "SETUP_ROAD") { const vertex = s.stage.vertex; assert(s.turnNumber === 0 && s.buildings.some(b => b.playerId === activeIslandPlayer(s) && b.vertex === vertex), "setup anchor"); }
  if (s.stage.kind === "DISCARD") assert(new Set(s.stage.pending.map(p => p.playerId)).size === s.stage.pending.length && s.stage.pending.every(p => ids.has(p.playerId) && p.count > 0 && Math.floor(islandResourceCount(player(s, p.playerId).resources) / 2) === p.count), "discard choices");
  if (s.stage.kind === "ROBBER_VICTIM") assert(new Set(s.stage.candidates).size === s.stage.candidates.length && s.stage.candidates.every(id => ids.has(id) && id !== activeIslandPlayer(s) && islandResourceCount(player(s, id).resources) > 0 && s.buildings.some(b => b.playerId === id && ISLAND_BOARD.vertices[b.vertex]!.hexes.includes(s.robber))), "robber choices");
  assert(s.longestRoadPlayerId === award(s, s.longestRoadPlayerId, 5, id => islandRoadLength(s, id)) && s.largestArmyPlayerId === award(s, s.largestArmyPlayerId, 3, id => islandKnights(s, id)), "awards");
  if (s.trade) {
    const t = s.trade;
    assert(s.stage.kind === "ACTION" && ids.has(t.proposerId) && validTrade(t.give, t.receive), "trade");
    assert(new Set(t.responses.map(r => r.playerId)).size === t.responses.length && t.responses.every(r => ids.has(r.playerId) && r.playerId !== t.proposerId && (r.playerId === activeIslandPlayer(s) || t.proposerId === activeIslandPlayer(s))), "trade counterpart");
  }
  assert(s.phase === "FINISHED" ? s.result !== null && s.finishedAt !== null : s.result === null && s.finishedAt === null, "terminal metadata");
  assert(s.log.every(entry => entry.revision <= s.revision && (entry.playerId === null || ids.has(entry.playerId))), "log references");
  if (s.result) {
    assert(s.result.scores.length === s.players.length && new Set(s.result.scores.map(p => p.playerId)).size === ids.size && s.result.scores.every(p => ids.has(p.playerId) && p.points === islandPoints(s, p.playerId, true)), "result scores");
    assert(s.result.reason === "CANCELLED" ? s.result.winnerPlayerIds.length === 0 : s.result.winnerPlayerIds.length === 1 && s.result.winnerPlayerIds[0] === activeIslandPlayer(s) && islandPoints(s, activeIslandPlayer(s), true) >= 10, "winner");
  }
  return s;
}

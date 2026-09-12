import * as v from "valibot";
import {
  BurgundyActionSchema,
  BurgundySettingsSchema,
  BurgundyTileSchema,
  BurgundyPlayerSchema,
  BurgundyPendingSchema,
  BurgundyFeedbackSchema,
  BurgundyResultSchema,
  BurgundyPlayingProjectionSchema,
  BurgundyFinishedProjectionSchema,
  BurgundyExpansionSchema,
  BurgundyCountSchema,
  BurgundyDieValueSchema,
  BURGUNDY_RULES_VERSION,
  BURGUNDY_CATALOG,
  BURGUNDY_KNOWLEDGE_BUILDINGS,
  burgundyProjectionIsConsistent,
  burgundyBoard,
  burgundyDefinition,
  burgundyRegion,
  burgundyPlacementReason,
  burgundyPlacementDiscount,
  burgundyWorkerCost,
  getBurgundyDepotSlots,
  GameIdSchema,
  GameRevisionSchema,
  PlayerIdSchema,
  TileIdSchema,
  TurnIdSchema,
  ServerTimeSchema,
  type BurgundyTile,
  type BurgundySettings,
  type BurgundyAction,
  type BurgundyProjection,
  type BurgundyPlayer,
  type BurgundyColor,
  type GameId,
  type PlayerId,
  type TileId,
  type TurnId,
  type ServerTime,
} from "@hangul-rummikub/shared";
import {
  createBurgundyExpansion,
  initializeBurgundyExpansions,
  effectiveBurgundyKnowledge,
  expansionGainWorkers,
  hasBurgundyShield,
  scoreBurgundyExpansion,
  onBurgundyPlacement,
  onBurgundySale,
  applyBurgundyExpansionAction,
  BurgundyExpansionRuleError,
  burgundyExpansionStorageUsed,
  burgundyExpansionStorageCapacity,
  resolveBurgundyImmediateBonuses,
} from "./expansions.js";
const count = BurgundyCountSchema;
const StateSchema = v.strictObject({
  expansion: BurgundyExpansionSchema,
  shieldDiscard: v.array(
    v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(18)),
  ),
  rulesVersion: v.literal(BURGUNDY_RULES_VERSION),
  gameId: GameIdSchema,
  revision: GameRevisionSchema,
  startedAt: ServerTimeSchema,
  finishedAt: v.nullable(ServerTimeSchema),
  phase: v.picklist(["PLAYING", "FINISHED"]),
  transitionId: TurnIdSchema,
  turnStartedAt: ServerTimeSchema,
  deadlineAt: v.nullable(ServerTimeSchema),
  activePlayerId: PlayerIdSchema,
  settings: BurgundySettingsSchema,
  inventory: v.array(BurgundyTileSchema),
  supply: v.array(TileIdSchema),
  discard: v.array(TileIdSchema),
  players: v.pipe(
    v.array(BurgundyPlayerSchema),
    v.minLength(2),
    v.maxLength(4),
  ),
  endingPhase: v.boolean(),
  phaseEndPlayerIndex: count,
  phaseIndex: v.pipe(count, v.maxValue(4)),
  roundIndex: v.pipe(count, v.maxValue(4)),
  whiteDie: BurgundyDieValueSchema,
  depots: v.pipe(v.array(v.array(BurgundyTileSchema)), v.length(6)),
  blackDepot: v.array(BurgundyTileSchema),
  inns: v.array(BurgundyTileSchema),
  depotGoods: v.pipe(v.array(v.pipe(v.array(count), v.length(6))), v.length(6)),
  goodsSupply: v.array(BurgundyDieValueSchema),
  unusedGoods: v.array(BurgundyDieValueSchema),
  roundGoods: v.array(BurgundyDieValueSchema),
  roundOrder: v.array(PlayerIdSchema),
  roundTurnIndex: count,
  orderCounter: count,
  pending: v.array(BurgundyPendingSchema),
  colorFinishers: v.record(
    v.picklist([
      "BUILDING",
      "LIVESTOCK",
      "MINE",
      "SHIP",
      "MONASTERY",
      "CASTLE",
    ]),
    v.array(PlayerIdSchema),
  ),
  feedback: v.nullable(BurgundyFeedbackSchema),
  history: v.array(BurgundyFeedbackSchema),
  result: v.nullable(BurgundyResultSchema),
});
export type BurgundyState = v.InferOutput<typeof StateSchema>;
export type BurgundyRandom = {
  nextInt(upperBound: number): number;
};
function roll(random: BurgundyRandom): number {
  const n = random.nextInt(6);
  if (!Number.isInteger(n) || n < 0 || n > 5)
    throw new Error("Invalid random source.");
  return n + 1;
}
export function shuffleBurgundy<T>(
  items: readonly T[],
  random: BurgundyRandom,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random.nextInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i)
      throw new Error("Invalid random source.");
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export function makeBurgundyTiles(
  generate: () => TileId,
  settings: BurgundySettings,
): BurgundyTile[] {
  return BURGUNDY_CATALOG.filter(
    (d) => !d.expansion || settings[d.expansion],
  ).flatMap((d) =>
    Array.from({ length: d.count }, () => ({
      tileId: generate(),
      kind: d.kind,
    })),
  );
}
function tileById(s: BurgundyState, id: TileId): BurgundyTile {
  const t = s.inventory.find((t) => t.tileId === id);
  if (!t) throw new Error("Missing tile.");
  return t;
}
export function burgundyKnowledge(p: BurgundyPlayer): number[] {
  return p.board.flatMap((t) => {
    const n = burgundyDefinition(t.tile).knowledge;
    return n ? [n] : [];
  });
}
export function burgundyTurnOrder(s: BurgundyState): PlayerId[] {
  return [...s.players]
    .sort(
      (a, b) =>
        b.shipPosition - a.shipPosition ||
        Number(effectiveBurgundyKnowledge(s, b).includes(27)) -
          Number(effectiveBurgundyKnowledge(s, a).includes(27)) ||
        (effectiveBurgundyKnowledge(s, a).includes(27) &&
        effectiveBurgundyKnowledge(s, b).includes(27)
          ? Number(hasBurgundyShield(b, 6)) - Number(hasBurgundyShield(a, 6))
          : 0) ||
        b.orderStamp - a.orderStamp,
    )
    .map((p) => p.playerId);
}
export function publicBurgundy(
  s: BurgundyState,
  _viewer?: PlayerId,
): BurgundyProjection {
  const base = {
    expansion: s.expansion,
    gameType: "BURGUNDY",
    gameId: s.gameId,
    gameRevision: s.revision,
    rulesVersion: s.rulesVersion,
    settings: s.settings,
    endingPhase: s.endingPhase,
    phaseIndex: s.phaseIndex,
    roundIndex: s.roundIndex,
    whiteDie: s.whiteDie,
    playerStates: s.players.map((p) => ({
      ...p,
      soldGoods:
        s.phase === "FINISHED" || p.playerId === _viewer
          ? p.soldGoods
          : [0, 0, 0, 0, 0, 0],
    })),
    depots: s.depots,
    blackDepot: s.blackDepot,
    inns: s.inns,
    depotGoods: s.depotGoods,
    roundGoods: s.roundGoods,
    supplyCount: s.supply.length,
    discardCount: s.discard.length,
    roundOrder: s.roundOrder,
    turnOrder: burgundyTurnOrder(s),
    pending: s.pending.filter((effect) => effect.type !== "TRADE_FILL"),
    colorFinishers: s.colorFinishers,
    feedback: s.feedback,
    history: s.history,
  };
  return s.phase === "PLAYING"
    ? v.parse(BurgundyPlayingProjectionSchema, {
        ...base,
        phase: s.phase,
        turnId: s.transitionId,
        activePlayerId: s.activePlayerId,
        turnStartedAt: s.turnStartedAt,
        deadlineAt: s.deadlineAt,
      })
    : v.parse(BurgundyFinishedProjectionSchema, {
        ...base,
        phase: s.phase,
        result: s.result,
      });
}
export function parseBurgundyState(input: unknown): BurgundyState {
  const s = v.parse(StateSchema, input),
    inv = new Map(s.inventory.map((t) => [t.tileId, t]));
  const expected = BURGUNDY_CATALOG.filter(
    (d) => !d.expansion || s.settings[d.expansion],
  );
  if (
    inv.size !== s.inventory.length ||
    s.inventory.length !== expected.reduce((n, d) => n + d.count, 0) ||
    expected.some(
      (d) => s.inventory.filter((t) => t.kind === d.kind).length !== d.count,
    )
  )
    throw new Error("Invalid Burgundy inventory.");
  const visible = [
    ...s.depots.flat(),
    ...s.blackDepot,
    ...s.inns,
    ...s.players.flatMap((p) => [...p.storage, ...p.board.map((t) => t.tile)]),
  ];
  const zones = [...s.supply, ...s.discard, ...visible.map((t) => t.tileId)];
  if (
    zones.length !== inv.size ||
    new Set(zones).size !== inv.size ||
    zones.some((id) => !inv.has(id)) ||
    visible.some((t) => inv.get(t.tileId)?.kind !== t.kind)
  )
    throw new Error("Burgundy tile conservation violation.");
  const goods = [...s.goodsSupply, ...s.unusedGoods, ...s.roundGoods];
  for (let i = 1; i <= 6; i++) {
    const n =
      goods.filter((g) => g === i).length +
      s.depotGoods.reduce((n, d) => n + d[i - 1]!, 0) +
      s.players.reduce((n, p) => n + p.goods[i - 1]! + p.soldGoods[i - 1]!, 0);
    if (n !== 7) throw new Error("Burgundy goods conservation violation.");
  }
  for (const p of s.players) {
    if (p.soldGoodsCount !== p.soldGoods.reduce((a, b) => a + b, 0))
      throw new Error("Invalid sold goods count.");
    if (p.extension.tradeRouteGoods.length !== p.extension.tradeRouteFilled || p.extension.tradeRouteFilled > p.extension.tradeRoute.length)
      throw new Error("Invalid Burgundy trade route occupancy.");
    const board = burgundyBoard(p.boardId);
    if (
      p.board.some(
        (t) =>
          !board.cells.some(
            (c) =>
              c.id === t.cellId &&
              (burgundyDefinition(t.tile).inn ||
                burgundyDefinition(t.tile).color === c.color),
          ),
      )
    )
      throw new Error("Invalid board occupancy.");
  }
  const shields = [
    ...s.expansion.shieldDepots.flat(),
    ...s.shieldDiscard,
    ...s.players.flatMap((p) => p.extension.shields.map((t) => t.shieldId)),
  ];
  if (
    shields.length !== (s.settings.shields ? 18 : 0) ||
    new Set(shields).size !== shields.length
  )
    throw new Error("Shield conservation violation.");
  if (
    s.phase === "PLAYING"
      ? s.result !== null ||
        s.finishedAt !== null ||
        s.deadlineAt === null ||
        (!s.endingPhase && s.roundOrder[s.roundTurnIndex] !== s.activePlayerId)
      : s.result === null || s.finishedAt === null || s.deadlineAt !== null
  )
    throw new Error("Invalid lifecycle.");
  if (!burgundyProjectionIsConsistent(publicBurgundy(s)))
    throw new Error("Invalid public state.");
  return s;
}
function takeSupply(s: BurgundyState, supply: string): BurgundyTile | null {
  const index = s.supply.findIndex(
    (id) => burgundyDefinition(tileById(s, id)).supply === supply,
  );
  return index < 0 ? null : tileById(s, s.supply.splice(index, 1)[0]!);
}
function replenish(s: BurgundyState): void {
  s.discard.push(
    ...s.depots.flat().map((t) => t.tileId),
    ...s.blackDepot.map((t) => t.tileId),
  );
  const slots = getBurgundyDepotSlots(
    s.players.length === 2 ? 2 : s.players.length === 3 ? 3 : 4,
    s.phaseIndex,
  );
  s.depots = slots.map((colors) =>
    colors.flatMap((color) => {
      const tile = takeSupply(s, color);
      if (!tile) throw new Error("Insufficient depot tiles.");
      return [tile];
    }),
  );
  s.blackDepot = [];
  for (let i = 0; i < s.players.length * 2; i++) {
    const tile = takeSupply(s, "BLACK");
    if (tile) s.blackDepot.push(tile);
  }
  if (s.settings.inns) {
    const inn = takeSupply(s, "INN");
    if (inn) s.inns.push(inn);
  }
  s.roundGoods = s.goodsSupply.splice(0, 5);
}
function startRound(s: BurgundyState, random: BurgundyRandom): void {
  s.roundOrder = burgundyTurnOrder(s);
  s.roundTurnIndex = 0;
  s.activePlayerId = s.roundOrder[0]!;
  s.whiteDie = roll(random);
  for (const p of s.players) {
    p.dice = [
      { value: roll(random), used: false },
      { value: roll(random), used: false },
    ];
    p.purchased = false;
    p.extension.shield16Used = false;
  }
  const good = s.roundGoods.shift();
  if (good === undefined) throw new Error("Round goods exhausted.");
  s.depotGoods[s.whiteDie - 1]![good - 1]!++;
}
export function createBurgundyGame(
  input: {
    gameId: GameId;
    playerIds: readonly PlayerId[];
    tiles: readonly BurgundyTile[];
    settings: BurgundySettings;
    now: ServerTime;
    transitionId: TurnId;
    starter?: number;
    generateTileId?: () => TileId;
  },
  random: BurgundyRandom,
): BurgundyState {
  const settings = v.parse(BurgundySettingsSchema, input.settings),
    n = input.playerIds.length;
  if (n < 2 || n > 4 || new Set(input.playerIds).size !== n)
    throw new Error("Invalid players.");
  const starter = input.starter ?? random.nextInt(n);
  if (!Number.isInteger(starter) || starter < 0 || starter >= n)
    throw new Error("Invalid starter.");
  const board = burgundyBoard(settings.boardId),
    start =
      board.cells.find((c) => c.color === "CASTLE" && c.q === 0 && c.r === 0) ??
      board.cells.find((c) => c.color === "CASTLE");
  if (!start) throw new Error("Starting castle space missing.");
  const s: BurgundyState = {
    expansion: createBurgundyExpansion(),
    shieldDiscard: [],
    gameId: input.gameId,
    rulesVersion: BURGUNDY_RULES_VERSION,
    revision: v.parse(GameRevisionSchema, 0),
    startedAt: input.now,
    finishedAt: null,
    phase: "PLAYING",
    transitionId: input.transitionId,
    turnStartedAt: input.now,
    deadlineAt: v.parse(
      ServerTimeSchema,
      input.now + settings.turnSeconds * 1000,
    ),
    activePlayerId: input.playerIds[starter]!,
    settings,
    inventory: v.parse(v.array(BurgundyTileSchema), input.tiles),
    supply: shuffleBurgundy(
      input.tiles.map((t) => t.tileId),
      random,
    ),
    discard: [],
    players: [],
    endingPhase: false,
    phaseEndPlayerIndex: 0,
    phaseIndex: 0,
    roundIndex: 0,
    whiteDie: 1,
    depots: [[], [], [], [], [], []],
    blackDepot: [],
    inns: [],
    depotGoods: Array.from({ length: 6 }, () => [0, 0, 0, 0, 0, 0]),
    goodsSupply: [],
    unusedGoods: [],
    roundGoods: [],
    roundOrder: [],
    roundTurnIndex: 0,
    orderCounter: n,
    pending: [],
    colorFinishers: {
      BUILDING: [],
      LIVESTOCK: [],
      MINE: [],
      SHIP: [],
      MONASTERY: [],
      CASTLE: [],
    },
    feedback: null,
    history: [],
    result: null,
  };
  const goods = shuffleBurgundy(
    Array.from({ length: 42 }, (_, i) => (i % 6) + 1),
    random,
  );
  s.goodsSupply = goods.splice(0, 25);
  for (const [index, playerId] of input.playerIds.entries()) {
    const castle = takeSupply(s, "CASTLE");
    if (!castle) throw new Error("Starting castle missing.");
    const p: BurgundyPlayer = {
      extension: {
        shields: [],
        shield16Used: false,
        tradeRoute: [],
        tradeRouteFilled: 0,
        tradeRouteGoods: [],
        borderConnections: [],
      },
      scoreBreakdown: {
        goodsSales: 0,
        animals: 0,
        regions: 0,
        phaseBonus: 0,
        colorBonus: 0,
        buildings: 0,
        expansion: 0,
      },
      playerId,
      score: 0,
      silver: 1,
      workers: ((index - starter + n) % n) + 1,
      boardId: settings.boardId,
      board: [{ cellId: start.id, tile: castle }],
      storage: [],
      goods: [0, 0, 0, 0, 0, 0],
      soldGoods: [0, 0, 0, 0, 0, 0],
      soldGoodsCount: 0,
      dice: [
        { value: 1, used: false },
        { value: 1, used: false },
      ],
      shipPosition: 0,
      orderStamp: n - ((index - starter + n) % n),
      purchased: false,
      bonuses: [],
    };
    for (const g of goods.splice(0, 3)) p.goods[g - 1]!++;
    s.players.push(p);
  }
  s.unusedGoods = goods;
  initializeBurgundyExpansions(s, random);
  replenish(s);
  startRound(s, random);
  return parseBurgundyState(s);
}
function fail(message: string): never {
  throw new BurgundyRuleError(message);
}
class BurgundyRuleError extends Error {}
function gainWorkers(s: BurgundyState, p: BurgundyPlayer, n: number): void {
  expansionGainWorkers(s, p, n);
}
function workers(s: BurgundyState, p: BurgundyPlayer): void {
  const k = effectiveBurgundyKnowledge(s, p);
  gainWorkers(s, p, k.includes(14) ? 4 : 2);
  if (k.includes(13)) p.silver++;
}
function adjust(
  s: BurgundyState,
  p: BurgundyPlayer,
  from: number,
  to: number,
  discount: number,
): void {
  const cost = burgundyWorkerCost(
    from,
    to,
    effectiveBurgundyKnowledge(s, p).includes(8),
    discount,
  );
  if (cost > p.workers) fail("주사위를 조정할 일꾼이 부족합니다.");
  p.workers -= cost;
}
function store(
  s: BurgundyState,
  p: BurgundyPlayer,
  tile: BurgundyTile,
  discardId?: TileId,
): void {
  if (discardId !== undefined) {
    const i = p.storage.findIndex((t) => t.tileId === discardId);
    if (i < 0) fail("사용할 수 없는 타일입니다.");
    s.discard.push(p.storage.splice(i, 1)[0]!.tileId);
  }
  if (burgundyExpansionStorageUsed(p) >= burgundyExpansionStorageCapacity(p))
    fail("저장 공간이 가득 찼습니다. 버릴 타일을 선택하세요.");
  p.storage.push(tile);
}
function take(
  s: BurgundyState,
  p: BurgundyPlayer,
  id: TileId,
  discardId?: TileId,
  depot?: number,
  colors?: readonly BurgundyColor[],
): void {
  const source =
    depot === undefined
      ? s.depots.find((d) => d.some((t) => t.tileId === id))
      : s.depots[depot - 1];
  const i = source?.findIndex((t) => t.tileId === id) ?? -1;
  if (!source || i < 0) fail("사용할 수 없는 타일입니다.");
  const tile = source[i]!;
  if (colors && !colors.includes(burgundyDefinition(tile).color))
    fail("이 효과로 가져올 수 없는 타일입니다.");
  store(s, p, tile, discardId);
  source.splice(i, 1);
}
function sell(s: BurgundyState, p: BurgundyPlayer, value: number): void {
  const amount = p.goods[value - 1]!;
  if (!amount) fail("판매할 상품이 없습니다.");
  p.goods[value - 1] = 0;
  p.soldGoods[value - 1]! += amount;
  p.soldGoodsCount += amount;
  p.score += amount * s.players.length;
  p.scoreBreakdown.goodsSales += amount * s.players.length;
  const k = effectiveBurgundyKnowledge(s, p);
  p.silver += k.includes(3) ? 2 : 1;
  if (k.includes(4)) gainWorkers(s, p, 1);
  onBurgundySale(s, p, value, amount);
}
function buildingEffect(
  s: BurgundyState,
  p: BurgundyPlayer,
  building: string,
): void {
  switch (building) {
    case "MARKET":
      s.pending.unshift({ type: "TAKE", colors: ["SHIP", "LIVESTOCK"] });
      break;
    case "CARPENTER":
      s.pending.unshift({ type: "TAKE", colors: ["BUILDING"] });
      break;
    case "CHURCH":
      s.pending.unshift({
        type: "TAKE",
        colors: ["CASTLE", "MINE", "MONASTERY"],
      });
      break;
    case "WAREHOUSE":
      s.pending.unshift({ type: "SELL" });
      break;
    case "BOARDING_HOUSE":
      gainWorkers(s, p, 4);
      break;
    case "BANK":
      p.silver += 2;
      break;
    case "TOWN_HALL":
      s.pending.unshift({ type: "PLACE" });
      break;
    case "WATCHTOWER":
      p.score += 4;
      p.scoreBreakdown.buildings += 4;
      break;
    case "WHITE_CASTLE":
      s.pending.unshift({ type: "ACTION", die: s.whiteDie });
      break;
    case "CRANE":
      s.pending.unshift({ type: "CRANE" });
      break;
  }
}
function livestock(
  s: BurgundyState,
  p: BurgundyPlayer,
  tile: BurgundyTile,
  cellId: string,
  animal?: string,
): void {
  const def = burgundyDefinition(tile),
    region = new Set(burgundyRegion(p.boardId, cellId)),
    species = animal ?? def.animal;
  const scoring = p.board
    .filter((t) => hasBurgundyShield(p, 1) || region.has(t.cellId))
    .map((t) => burgundyDefinition(t.tile))
    .filter((d) => d.animal && (d.animal === species || d.animal === "GEESE"));
  const points = scoring.reduce(
    (n, d) =>
      n +
      (d.animals ?? 0) +
      (effectiveBurgundyKnowledge(s, p).includes(7) ? 1 : 0),
    0,
  );
  p.score += points;
  p.scoreBreakdown.animals += points;
}
function place(
  s: BurgundyState,
  p: BurgundyPlayer,
  id: TileId,
  cellId: string,
): void {
  const i = p.storage.findIndex((t) => t.tileId === id);
  if (i < 0) fail("사용할 수 없는 타일입니다.");
  const tile = p.storage[i]!,
    reason = burgundyPlacementReason(
      p,
      tile,
      cellId,
      effectiveBurgundyKnowledge(s, p),
    );
  if (reason) fail(reason);
  const def = burgundyDefinition(tile);
  p.storage.splice(i, 1);
  p.board.push({ cellId, tile });
  if (def.whiteCastle) s.pending.unshift({ type: "ACTION", die: s.whiteDie });
  else if (def.building) buildingEffect(s, p, def.building);
  else if (def.animal === "GEESE")
    s.pending.unshift({ type: "GEESE", tileId: id, cellId });
  else if (def.color === "LIVESTOCK") livestock(s, p, tile, cellId);
  else if (def.color === "CASTLE") {
    s.pending.unshift({ type: "ACTION", die: null, source: "CASTLE" });
  } else if (def.color === "SHIP") {
    p.shipPosition++;
    p.orderStamp = ++s.orderCounter;
    s.pending.unshift({ type: "SHIP" });
  }
  const region = burgundyRegion(p.boardId, cellId),
    board = burgundyBoard(p.boardId),
    color = board.cells.find((c) => c.id === cellId)!.color;
  if (region.every((id) => p.board.some((t) => t.cellId === id))) {
    const size = Math.min(
      8,
      region.length +
        p.board.filter(
          (t) => region.includes(t.cellId) && burgundyDefinition(t.tile).inn,
        ).length +
        Number(hasBurgundyShield(p, 17)),
    );
    p.score += (size * (size + 1)) / 2 + 10 - s.phaseIndex * 2;
    p.scoreBreakdown.regions += (size * (size + 1)) / 2;
    p.scoreBreakdown.phaseBonus += 10 - s.phaseIndex * 2;
  }
  if (
    board.cells
      .filter((c) => c.color === color)
      .every((c) => p.board.some((t) => t.cellId === c.id)) &&
    !s.colorFinishers[color]!.includes(p.playerId)
  ) {
    const finishers = s.colorFinishers[color]!;
    if (finishers.length < 2) {
      const bonus =
        (s.players.length + (finishers.length === 0 ? 3 : 0)) *
        (hasBurgundyShield(p, 7) ? 2 : 1);
      p.score += bonus;
      p.scoreBreakdown.colorBonus += bonus;
      p.bonuses.push(color);
    }
    finishers.push(p.playerId);
  }
  onBurgundyPlacement(s, p);
}
function shipGoods(
  s: BurgundyState,
  p: BurgundyPlayer,
  a: Extract<
    BurgundyAction,
    {
      type: "SHIP_GOODS";
    }
  >,
): void {
  if (new Set(a.types).size !== a.types.length)
    fail("상품 종류가 중복되었습니다.");
  const depots = [a.depot];
  if (a.adjacentDepot !== undefined) {
    if (
      !effectiveBurgundyKnowledge(s, p).includes(5) ||
      ![((a.depot + 4) % 6) + 1, (a.depot % 6) + 1].includes(a.adjacentDepot)
    )
      fail("인접한 교역소만 추가로 선택할 수 있습니다.");
    depots.push(a.adjacentDepot);
  }
  if (
    a.types.some(
      (t) =>
        p.goods[t - 1] === 0 &&
        !depots.some((d) => s.depotGoods[d - 1]![t - 1]! > 0),
    )
  )
    fail("선택한 교역소에 없는 상품입니다.");
  const types = new Set(p.goods.flatMap((n, i) => (n ? [i + 1] : [])));
  for (const t of a.types) types.add(t);
  if (types.size > 3) fail("상품은 세 종류까지만 보관할 수 있습니다.");
  // Already stored types must always be taken. New selected types are whole stacks.
  for (const d of depots) {
    const goods = s.depotGoods[d - 1]!;
    for (let i = 0; i < 6; i++)
      if (types.has(i + 1)) {
        p.goods[i]! += goods[i]!;
        goods[i] = 0;
      }
  }
  if (a.shieldType !== undefined) {
    if (
      !hasBurgundyShield(p, 5) ||
      (!types.has(a.shieldType) && types.size >= 3)
    )
      fail("방패로 가져올 수 없는 상품입니다.");
    for (const goods of s.depotGoods) {
      p.goods[a.shieldType - 1]! += goods[a.shieldType - 1]!;
      goods[a.shieldType - 1] = 0;
    }
    types.add(a.shieldType);
  }
  if (
    types.size < 3 &&
    depots.some((d) => s.depotGoods[d - 1]!.some((n) => n > 0))
  )
    fail("남는 상품 저장 공간을 먼저 채워야 합니다.");
}
function finalScore(s: BurgundyState, now: ServerTime): void {
  const scores = s.players.map((p) => {
    const k = effectiveBurgundyKnowledge(s, p);
    let knowledge = 0;
    if (k.includes(15))
      knowledge += p.soldGoods.filter((n) => n > 0).length * 2;
    if (k.includes(24))
      knowledge +=
        new Set(
          p.board.map((t) => burgundyDefinition(t.tile).animal).filter(Boolean),
        ).size * 4;
    if (k.includes(25)) knowledge += p.soldGoods.reduce((a, b) => a + b, 0);
    if (k.includes(26)) knowledge += p.bonuses.length * 3;
    const scoringBuildings = k.flatMap((n) =>
      BURGUNDY_KNOWLEDGE_BUILDINGS[n] ? [BURGUNDY_KNOWLEDGE_BUILDINGS[n]] : [],
    );
    for (const t of p.board) {
      const d = burgundyDefinition(t.tile);
      if (d.building === "CRANE") {
        if (scoringBuildings.length) knowledge += 4;
      } else if (d.building && scoringBuildings.includes(d.building))
        knowledge += 4;
    }
    if (hasBurgundyShield(p, 10)) knowledge *= 2;
    const row = {
      playerId: p.playerId,
      earned: { ...p.scoreBreakdown },
      base: p.score,
      goods: p.goods.reduce((a, b) => a + b, 0),
      silver: p.silver,
      workers: Math.floor(p.workers / 2),
      knowledge,
      expansion: scoreBurgundyExpansion(s, p),
      total: 0,
    };
    row.total =
      row.base +
      row.goods +
      row.silver +
      row.workers +
      row.knowledge +
      row.expansion;
    p.score = row.total;
    return row;
  });
  const order = burgundyTurnOrder(s);
  const ranked = [...s.players].sort(
    (a, b) =>
      b.score - a.score ||
      a.board.length - b.board.length ||
      order.indexOf(b.playerId) - order.indexOf(a.playerId),
  );
  s.phase = "FINISHED";
  s.finishedAt = now;
  s.deadlineAt = null;
  s.pending = [];
  s.result = {
    reason: "COMPLETED",
    winnerPlayerIds: [ranked[0]!.playerId],
    scores,
  };
}
function finishPhase(
  s: BurgundyState,
  now: ServerTime,
  nextTurnId: TurnId,
  random: BurgundyRandom,
): void {
  for (const p of s.players) {
    const mines = p.board.filter(
      (t) =>
        burgundyDefinition(t.tile).color === "MINE" &&
        !burgundyDefinition(t.tile).inn,
    ).length;
    p.silver +=
      mines * (p.extension.shields.some((t) => t.shieldId === 8) ? 2 : 1);
    if (effectiveBurgundyKnowledge(s, p).includes(2)) gainWorkers(s, p, mines);
  }
  s.endingPhase = false;
  if (s.phaseIndex === 4) {
    finalScore(s, now);
    return;
  }
  s.phaseIndex++;
  s.roundIndex = 0;
  replenish(s);
  startRound(s, random);
  s.transitionId = nextTurnId;
  s.turnStartedAt = now;
  s.deadlineAt = v.parse(ServerTimeSchema, now + s.settings.turnSeconds * 1000);
}
function phaseEndPlayer(
  s: BurgundyState,
  now: ServerTime,
  nextTurnId: TurnId,
  random: BurgundyRandom,
): void {
  while (s.phaseEndPlayerIndex < s.players.length) {
    const p = s.players.find(
      (p) => p.playerId === s.roundOrder[s.phaseEndPlayerIndex],
    )!;
    s.activePlayerId = p.playerId;
    s.pending = [];
    if (p.extension.shields.some((t) => t.shieldId === 14))
      s.pending.push({ type: "SHIELD_PLACE", black: false });
    if (p.extension.shields.some((t) => t.shieldId === 15))
      s.pending.push({ type: "SHIELD_PLACE", black: true });
    if (p.extension.shields.length)
      s.pending.push({ type: "SHIELD_TRIBUTE", playerId: p.playerId });
    if (s.pending.length) {
      s.transitionId = nextTurnId;
      s.turnStartedAt = now;
      s.deadlineAt = v.parse(
        ServerTimeSchema,
        now + s.settings.turnSeconds * 1000,
      );
      return;
    }
    s.phaseEndPlayerIndex++;
  }
  finishPhase(s, now, nextTurnId, random);
}
function endTurn(
  s: BurgundyState,
  now: ServerTime,
  nextTurnId: TurnId,
  random: BurgundyRandom,
): void {
  s.pending = [];
  s.roundTurnIndex++;
  if (s.roundTurnIndex === s.players.length) {
    s.roundIndex++;
    if (s.roundIndex === 5) {
      s.roundIndex = 4;
      s.endingPhase = true;
      s.phaseEndPlayerIndex = 0;
      phaseEndPlayer(s, now, nextTurnId, random);
      return;
    }
    startRound(s, random);
  } else s.activePlayerId = s.roundOrder[s.roundTurnIndex]!;
  s.transitionId = nextTurnId;
  s.turnStartedAt = now;
  s.deadlineAt = v.parse(ServerTimeSchema, now + s.settings.turnSeconds * 1000);
}
function apply(
  s: BurgundyState,
  p: BurgundyPlayer,
  a: BurgundyAction,
  now: ServerTime,
  nextTurnId: TurnId,
  random: BurgundyRandom,
): void {
  const pending = s.pending[0],
    k = effectiveBurgundyKnowledge(s, p);
  if (
    s.endingPhase &&
    [
      "BUY",
      "TAKE",
      "PLACE",
      "SELL",
      "WORKERS",
      "TAKE_SHIELD",
      "SHIELD_DIE",
    ].includes(a.type) &&
    !(a.type === "TAKE_SHIELD" && pending?.type === "ACTION")
  )
    fail("시대 종료 효과를 먼저 완료하세요.");
  if (applyBurgundyExpansionAction(s, p, a, { place, store, adjust })) return;
  if (a.type === "BUY") {
    const workerPayment = a.workers ?? 0;
    if (
      p.purchased ||
      (workerPayment > 0 && !k.includes(6)) ||
      p.workers < workerPayment ||
      p.silver < 2 - workerPayment
    )
      fail("구매는 턴당 한 번이며 지불 자원이 부족합니다.");
    const source = [
      s.blackDepot,
      s.inns,
      ...(k.includes(6) ? s.depots : []),
    ].find((d) => d.some((t) => t.tileId === a.tileId));
    const index = source?.findIndex((t) => t.tileId === a.tileId) ?? -1;
    if (!source || index < 0) fail("사용할 수 없는 타일입니다.");
    store(s, p, source[index]!, a.discardTileId);
    source.splice(index, 1);
    p.workers -= workerPayment;
    p.silver -= 2 - workerPayment;
    p.purchased = true;
    return;
  }
  if (a.type === "BUY_WORKERS") {
    if (!k.includes(28) || a.silver < 1 || p.silver < a.silver)
      fail("일꾼을 구매할 수 없습니다.");
    p.silver -= a.silver;
    gainWorkers(s, p, a.silver * 2);
    return;
  }
  if (pending) {
    if (a.type === "SKIP_EFFECT") {
      if (
        pending.type === "ACTION" ||
        pending.type === "SHIP" ||
        pending.type === "GEESE" ||
        pending.type === "SHIELD_TRIBUTE"
      )
        fail("필수 효과를 완료하세요.");
      if (
        pending.type === "SHIELD_PLACE" &&
        timeoutChoice(s, p).type !== "SKIP_EFFECT"
      )
        fail("배치 가능한 타일이 있어 방패 효과를 완료해야 합니다.");
      s.pending.shift();
      return;
    }
    s.pending.shift();
    switch (a.type) {
      case "EFFECT_TAKE":
        if (pending.type === "TAKE_BLACK") {
          const i = s.blackDepot.findIndex((t) => t.tileId === a.tileId);
          if (i < 0) fail("사용할 수 없는 타일입니다.");
          store(s, p, s.blackDepot[i]!, a.discardTileId);
          s.blackDepot.splice(i, 1);
          return;
        }
        if (pending.type !== "TAKE" && pending.type !== "ACTION")
          fail("현재 효과와 일치하지 않습니다.");
        if (pending.type === "ACTION") {
          const value = a.value;
          if (value === undefined) fail("교역소 숫자를 선택하세요.");
          if (pending.die !== null)
            adjust(s, p, pending.die, value, k.includes(12) ? 1 : 0);
          take(s, p, a.tileId, a.discardTileId, value);
        } else take(s, p, a.tileId, a.discardTileId, undefined, pending.colors);
        return;
      case "EFFECT_PLACE": {
        if (pending.type !== "PLACE" && pending.type !== "ACTION")
          fail("현재 효과와 일치하지 않습니다.");
        const tile = p.storage.find((t) => t.tileId === a.tileId),
          cell = burgundyBoard(p.boardId).cells.find((c) => c.id === a.cellId);
        if (!tile || !cell) fail("사용할 수 없는 타일입니다.");
        if (pending.type === "ACTION" && pending.die !== null)
          adjust(
            s,
            p,
            pending.die,
            cell.die,
            burgundyDefinition(tile).inn
              ? 0
              : burgundyPlacementDiscount(burgundyDefinition(tile).color, k),
          );
        place(s, p, a.tileId, a.cellId);
        return;
      }
      case "EFFECT_SELL":
        if (pending.type !== "SELL" && pending.type !== "ACTION")
          fail("현재 효과와 일치하지 않습니다.");
        if (pending.type === "ACTION" && pending.die !== null)
          adjust(s, p, pending.die, a.value, 0);
        sell(s, p, a.value);
        return;
      case "EFFECT_WORKERS":
        if (pending.type !== "ACTION") fail("현재 효과와 일치하지 않습니다.");
        workers(s, p);
        return;
      case "SHIP_GOODS":
        if (pending.type !== "SHIP") fail("현재 효과와 일치하지 않습니다.");
        shipGoods(s, p, a);
        return;
      case "CRANE":
        if (pending.type !== "CRANE") fail("현재 효과와 일치하지 않습니다.");
        if (a.building === "WHITE_CASTLE" && !s.settings.whiteCastles)
          fail("흰 성 확장이 활성화되지 않았습니다.");
        buildingEffect(s, p, a.building);
        return;
      case "GEESE":
        if (pending.type !== "GEESE") fail("현재 효과와 일치하지 않습니다.");
        livestock(s, p, tileById(s, pending.tileId), pending.cellId, a.animal);
        return;
      default:
        fail("진행 중인 타일 효과를 먼저 완료하세요.");
    }
  }
  if (a.type === "END_TURN") {
    if (s.endingPhase) {
      s.phaseEndPlayerIndex++;
      phaseEndPlayer(s, now, nextTurnId, random);
      return;
    }
    if (p.dice.some((d) => !d.used)) fail("주사위 두 개를 먼저 사용하세요.");
    endTurn(s, now, nextTurnId, random);
    return;
  }
  if (
    a.type !== "TAKE" &&
    a.type !== "PLACE" &&
    a.type !== "SELL" &&
    a.type !== "WORKERS"
  )
    fail("현재 사용할 수 없는 행동입니다.");
  const die = p.dice[a.die];
  if (die.used) fail("이미 사용한 주사위입니다.");
  if (a.type === "TAKE") {
    adjust(s, p, die.value, a.value, k.includes(12) ? 1 : 0);
    take(s, p, a.tileId, a.discardTileId, a.value);
  } else if (a.type === "PLACE") {
    const tile = p.storage.find((t) => t.tileId === a.tileId),
      cell = burgundyBoard(p.boardId).cells.find((c) => c.id === a.cellId);
    if (!tile || !cell || cell.die !== a.value)
      fail("사용할 수 없는 타일 또는 칸입니다.");
    adjust(
      s,
      p,
      die.value,
      a.value,
      burgundyDefinition(tile).inn
        ? 0
        : burgundyPlacementDiscount(burgundyDefinition(tile).color, k),
    );
    place(s, p, a.tileId, a.cellId);
  } else if (a.type === "SELL") {
    adjust(s, p, die.value, a.value, 0);
    sell(s, p, a.value);
  } else workers(s, p);
  die.used = true;
}
export function applyBurgundyAction(
  state: BurgundyState,
  actor: PlayerId,
  payload: unknown,
  now: ServerTime,
  nextTurnId: TurnId,
  random: BurgundyRandom,
):
  | {
      ok: true;
      state: BurgundyState;
    }
  | {
      ok: false;
      code:
        | "INVALID_PAYLOAD"
        | "INVALID_PHASE"
        | "NOT_YOUR_TURN"
        | "TURN_EXPIRED"
        | "RULE_VIOLATION";
      reason: string;
    } {
  const action = v.safeParse(BurgundyActionSchema, payload);
  if (!action.success)
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      reason: "잘못된 행동 형식입니다.",
    };
  if (state.phase !== "PLAYING" || state.deadlineAt === null)
    return {
      ok: false,
      code: "INVALID_PHASE",
      reason: "진행 중인 게임이 아닙니다.",
    };
  if (state.activePlayerId !== actor)
    return {
      ok: false,
      code: "NOT_YOUR_TURN",
      reason: "자신의 차례가 아닙니다.",
    };
  if (now >= state.deadlineAt)
    return {
      ok: false,
      code: "TURN_EXPIRED",
      reason: "행동 시간이 만료되었습니다.",
    };
  const s = structuredClone(state),
    p = s.players.find((p) => p.playerId === actor)!;
  const score = p.score;
  try {
    apply(s, p, action.output, now, nextTurnId, random);
    resolveBurgundyImmediateBonuses(s, p);
  } catch (error) {
    if (
      error instanceof BurgundyRuleError ||
      error instanceof BurgundyExpansionRuleError
    )
      return { ok: false, code: "RULE_VIOLATION", reason: error.message };
    throw error;
  }
  s.revision = v.parse(GameRevisionSchema, s.revision + 1);
  s.feedback = {
    playerId: actor,
    message: action.output.type,
    points: Math.max(0, p.score - score),
    automatic: false,
    at: now,
  };
  s.history = [...s.history, s.feedback].slice(-12);
  return { ok: true, state: parseBurgundyState(s) };
}
function timeoutChoice(s: BurgundyState, p: BurgundyPlayer): BurgundyAction {
  const effect = s.pending[0];
  if (!effect) {
    const die = p.dice.findIndex((d) => !d.used);
    return die === 0 || die === 1
      ? { type: "WORKERS", die }
      : { type: "END_TURN" };
  }
  if (effect.type === "SHIELD_PLACE") {
    const source = effect.black ? s.blackDepot : s.depots.flat();
    for (const tile of source)
      for (const cell of burgundyBoard(p.boardId).cells)
        if (
          burgundyPlacementReason(
            p,
            tile,
            cell.id,
            effectiveBurgundyKnowledge(s, p),
          ) === null
        )
          return { type: "SHIELD_PLACE", tileId: tile.tileId, cellId: cell.id };
    return { type: "SKIP_EFFECT" };
  }
  if (effect.type === "SHIELD_TRIBUTE")
    return {
      type: "SHIELD_TRIBUTE",
      keepShieldIds: p.extension.shields
        .slice(0, p.silver)
        .map((t) => t.shieldId),
      workers: 0,
    };
  if (effect.type === "ACTION") return { type: "EFFECT_WORKERS" };
  if (effect.type === "GEESE") return { type: "GEESE", animal: "SHEEP" };
  if (effect.type === "SHIP") {
    const types = p.goods.flatMap((n, i) => (n ? [i + 1] : []));
    for (let i = 0; i < 6 && types.length < 3; i++)
      if (s.depotGoods[0]![i]! > 0 && !types.includes(i + 1)) types.push(i + 1);
    return { type: "SHIP_GOODS", depot: 1, types };
  }
  return { type: "SKIP_EFFECT" };
}
export function timeoutBurgundy(
  state: BurgundyState,
  now: ServerTime,
  nextTurnId: TurnId,
  random: BurgundyRandom,
): BurgundyState {
  if (
    state.phase !== "PLAYING" ||
    state.deadlineAt === null ||
    now < state.deadlineAt
  )
    return state;
  const s = structuredClone(state),
    actor = s.activePlayerId,
    p = s.players.find((p) => p.playerId === actor)!,
    score = p.score;
  for (
    let i = 0;
    i < 150 && s.phase === "PLAYING" && s.activePlayerId === actor;
    i++
  ) {
    const a = timeoutChoice(s, p);
    apply(s, p, a, now, nextTurnId, random);
    resolveBurgundyImmediateBonuses(s, p);
    if (a.type === "END_TURN") break;
  }
  s.revision = v.parse(GameRevisionSchema, s.revision + 1);
  s.feedback = {
    playerId: actor,
    message: "시간 초과: 남은 주사위를 일꾼으로 전환했습니다.",
    points: Math.max(0, p.score - score),
    automatic: true,
    at: now,
  };
  s.history = [...s.history, s.feedback].slice(-12);
  return parseBurgundyState(s);
}
export function cancelBurgundy(
  state: BurgundyState,
  now: ServerTime,
): BurgundyState {
  if (state.phase === "FINISHED") return state;
  const s = structuredClone(state);
  s.phase = "FINISHED";
  s.finishedAt = now;
  s.deadlineAt = null;
  s.pending = [];
  s.revision = v.parse(GameRevisionSchema, s.revision + 1);
  s.result = {
    reason: "CANCELLED",
    winnerPlayerIds: [],
    scores: s.players.map((p) => ({
      playerId: p.playerId,
      earned: { ...p.scoreBreakdown },
      base: p.score,
      goods: 0,
      silver: 0,
      workers: 0,
      knowledge: 0,
      expansion: 0,
      total: p.score,
    })),
  };
  return parseBurgundyState(s);
}

import * as v from "valibot";
import {
  CARCASSONNE_CATALOG,
  CARCASSONNE_RULES_VERSION,
  CARCASSONNE_TURN_DURATION_MS,
  CarcassonneTileSchema,
  CarcassonneBoardTileSchema,
  CarcassonneMeepleSchema,
  CarcassonneActionSchema,
  CarcassonnePlayerSchema,
  CarcassonneFeedbackSchema,
  CarcassonneResultSchema,
  CarcassonnePlayingProjectionSchema,
  CarcassonneFinishedProjectionSchema,
  carcassonneProjectionIsConsistent,
  analyzeCarcassonneBoard,
  carcassonnePlacementReason,
  carcassonneRegionKey,
  carcassonneFeaturePoints,
  carcassonneMajority,
  legalCarcassonnePlacements,
  GameIdSchema,
  GameRevisionSchema,
  PlayerIdSchema,
  TileIdSchema,
  TurnIdSchema,
  ServerTimeSchema,
  type CarcassonneTile,
  type CarcassonneAction,
  type CarcassonneProjection,
  type CarcassonneFeature,
  type CarcassonneScoreEvent,
  type CarcassonneResult,
  type GameId,
  type PlayerId,
  type TileId,
  type TurnId,
  type ServerTime,
} from "@hangul-rummikub/shared";
const ids = v.pipe(v.array(TileIdSchema), v.maxLength(72));
const StateSchema = v.strictObject({
  rulesVersion: v.literal(CARCASSONNE_RULES_VERSION),
  gameId: GameIdSchema,
  revision: GameRevisionSchema,
  startedAt: ServerTimeSchema,
  finishedAt: v.nullable(ServerTimeSchema),
  phase: v.picklist(["PLAYING", "FINISHED"]),
  transitionId: TurnIdSchema,
  turnStartedAt: ServerTimeSchema,
  deadlineAt: v.nullable(ServerTimeSchema),
  activePlayerId: PlayerIdSchema,
  inventory: v.pipe(v.array(CarcassonneTileSchema), v.length(72)),
  bag: ids,
  discard: ids,
  currentTileId: v.nullable(TileIdSchema),
  board: v.pipe(
    v.array(CarcassonneBoardTileSchema),
    v.minLength(1),
    v.maxLength(72),
  ),
  meeples: v.pipe(v.array(CarcassonneMeepleSchema), v.maxLength(35)),
  players: v.pipe(
    v.array(CarcassonnePlayerSchema),
    v.minLength(2),
    v.maxLength(5),
  ),
  feedback: v.nullable(CarcassonneFeedbackSchema),
  history: v.pipe(v.array(CarcassonneFeedbackSchema), v.maxLength(8)),
  result: v.nullable(CarcassonneResultSchema),
});
export type CarcassonneState = v.InferOutput<typeof StateSchema>;
export type CarcassonneRandom = { nextInt(upperBound: number): number };
export function makeCarcassonneTiles(
  generate: () => TileId,
): CarcassonneTile[] {
  return Object.values(CARCASSONNE_CATALOG).flatMap((t) =>
    Array.from({ length: t.count }, () => ({
      tileId: generate(),
      kind: t.kind,
    })),
  );
}
export function shuffleCarcassonne<T>(
  items: readonly T[],
  random: CarcassonneRandom,
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
function tileById(s: CarcassonneState, id: TileId): CarcassonneTile {
  const tile = s.inventory.find((t) => t.tileId === id);
  if (!tile) throw new Error("Missing Carcassonne tile.");
  return tile;
}
export function publicCarcassonne(s: CarcassonneState): CarcassonneProjection {
  const base = {
    gameType: "CARCASSONNE",
    gameId: s.gameId,
    gameRevision: s.revision,
    rulesVersion: s.rulesVersion,
    board: s.board,
    meeples: s.meeples,
    currentTile: s.currentTileId === null ? null : tileById(s, s.currentTileId),
    bagCount: s.bag.length,
    discardedTiles: s.discard.map((id) => tileById(s, id)),
    playerStates: s.players,
    feedback: s.feedback,
    history: s.history,
  };
  return s.phase === "PLAYING"
    ? v.parse(CarcassonnePlayingProjectionSchema, {
        ...base,
        phase: s.phase,
        turnId: s.transitionId,
        activePlayerId: s.activePlayerId,
        turnStartedAt: s.turnStartedAt,
        deadlineAt: s.deadlineAt,
      })
    : v.parse(CarcassonneFinishedProjectionSchema, {
        ...base,
        phase: s.phase,
        result: s.result,
      });
}
export function parseCarcassonneState(input: unknown): CarcassonneState {
  const s = v.parse(StateSchema, input),
    inventory = new Map(s.inventory.map((t) => [t.tileId, t]));
  if (
    inventory.size !== 72 ||
    Object.values(CARCASSONNE_CATALOG).some(
      (t) => s.inventory.filter((i) => i.kind === t.kind).length !== t.count,
    )
  )
    throw new Error("Invalid Carcassonne inventory.");
  const zones = [
    ...s.bag,
    ...s.discard,
    ...s.board.map((t) => t.tileId),
    ...(s.currentTileId ? [s.currentTileId] : []),
  ];
  if (
    zones.length !== 72 ||
    new Set(zones).size !== 72 ||
    zones.some((id) => !inventory.has(id)) ||
    s.board.some((t) => inventory.get(t.tileId)?.kind !== t.kind)
  )
    throw new Error("Carcassonne tile conservation failed.");
  if (!s.players.some((p) => p.playerId === s.activePlayerId))
    throw new Error("Invalid active player.");
  if (
    s.phase === "PLAYING"
      ? s.finishedAt !== null ||
        s.result !== null ||
        s.currentTileId === null ||
        s.deadlineAt !== s.turnStartedAt + CARCASSONNE_TURN_DURATION_MS
      : s.finishedAt === null || s.result === null || s.deadlineAt !== null
  )
    throw new Error("Invalid Carcassonne lifecycle.");
  if (!carcassonneProjectionIsConsistent(publicCarcassonne(s)))
    throw new Error("Invalid Carcassonne public state.");
  return s;
}
/** Draw only on the server. Unplaceable tiles are removed, without consuming a player's turn. */
function drawNext(s: CarcassonneState): boolean {
  s.currentTileId = null;
  while (s.bag.length) {
    const id = s.bag.pop()!;
    if (legalCarcassonnePlacements(s.board, tileById(s, id)).length) {
      s.currentTileId = id;
      return true;
    }
    s.discard.push(id);
  }
  return false;
}
export function createCarcassonneGame(input: {
  gameId: GameId;
  playerIds: readonly PlayerId[];
  tiles: readonly CarcassonneTile[];
  starter: number;
  now: ServerTime;
  turnId: TurnId;
  random: CarcassonneRandom;
}): CarcassonneState {
  if (
    input.playerIds.length < 2 ||
    input.playerIds.length > 5 ||
    new Set(input.playerIds).size !== input.playerIds.length ||
    !Number.isInteger(input.starter) ||
    input.starter < 0 ||
    input.starter >= input.playerIds.length
  )
    throw new Error("Invalid Carcassonne players.");
  const tiles = v.parse(
      v.pipe(v.array(CarcassonneTileSchema), v.length(72)),
      input.tiles,
    ),
    start = tiles.find((t) => t.kind === "D");
  if (!start) throw new Error("Start tile missing.");
  const s: CarcassonneState = {
    rulesVersion: CARCASSONNE_RULES_VERSION,
    gameId: input.gameId,
    revision: v.parse(GameRevisionSchema, 0),
    startedAt: input.now,
    finishedAt: null,
    phase: "PLAYING",
    transitionId: input.turnId,
    turnStartedAt: input.now,
    deadlineAt: v.parse(
      ServerTimeSchema,
      input.now + CARCASSONNE_TURN_DURATION_MS,
    ),
    activePlayerId: input.playerIds[input.starter]!,
    inventory: tiles,
    bag: shuffleCarcassonne(
      tiles.filter((t) => t.tileId !== start.tileId).map((t) => t.tileId),
      input.random,
    ),
    discard: [],
    currentTileId: null,
    board: [{ ...start, x: 0, y: 0, rotation: 0 }],
    meeples: [],
    players: input.playerIds.map((playerId) => ({
      playerId,
      score: 0,
      availableMeeples: 7,
    })),
    feedback: null,
    history: [],
    result: null,
  };
  if (!drawNext(s)) throw new Error("No playable opening tile.");
  return parseCarcassonneState(s);
}
function scoreEvent(
  feature: CarcassonneFeature,
  final: boolean,
): CarcassonneScoreEvent {
  return {
    featureId: feature.id,
    kind: feature.kind,
    tileIds: [...feature.tileIds],
    points: carcassonneFeaturePoints(feature, final),
    winnerPlayerIds: carcassonneMajority(feature),
    returnedPlayerIds: final ? [] : feature.meeples.map((m) => m.playerId),
    final,
    complete: feature.complete,
    shields: feature.shields,
    cityCount: feature.completedCityIds.length,
  };
}
function settleCompleted(s: CarcassonneState): CarcassonneScoreEvent[] {
  const features = analyzeCarcassonneBoard(s.board, s.meeples),
    events: CarcassonneScoreEvent[] = [];
  for (const feature of features) {
    if (!feature.complete || feature.meeples.length === 0) continue;
    const event = scoreEvent(feature, false);
    events.push(event);
    for (const p of s.players) {
      if (event.winnerPlayerIds.includes(p.playerId)) p.score += event.points;
      p.availableMeeples += feature.meeples.filter(
        (m) => m.playerId === p.playerId,
      ).length;
    }
    const returned = new Set(feature.meeples);
    s.meeples = s.meeples.filter((m) => !returned.has(m));
  }
  return events;
}
function finish(s: CarcassonneState, now: ServerTime): void {
  const finalScoring = analyzeCarcassonneBoard(s.board, s.meeples)
    .filter((f) => f.meeples.length > 0)
    .map((f) => scoreEvent(f, true));
  const scores: CarcassonneResult["scores"] = s.players.map((p) => {
    const sum = (kind: CarcassonneScoreEvent["kind"]) =>
      finalScoring
        .filter(
          (f) => f.kind === kind && f.winnerPlayerIds.includes(p.playerId),
        )
        .reduce((n, f) => n + f.points, 0);
    const base = p.score,
      roads = sum("ROAD"),
      cities = sum("CITY"),
      monasteries = sum("MONASTERY"),
      fields = sum("FIELD"),
      total = base + roads + cities + monasteries + fields;
    p.score = total;
    return {
      playerId: p.playerId,
      base,
      roads,
      cities,
      monasteries,
      fields,
      total,
    };
  });
  const best = Math.max(...scores.map((s) => s.total));
  s.result = {
    reason: "TILES_EXHAUSTED",
    winnerPlayerIds: scores
      .filter((s) => s.total === best)
      .map((s) => s.playerId),
    scores,
    finalScoring,
  };
  s.phase = "FINISHED";
  s.finishedAt = now;
  s.deadlineAt = null;
}
export type CarcassonneApplyResult =
  | { ok: true; state: CarcassonneState }
  | {
      ok: false;
      reason:
        "INVALID_PHASE" | "NOT_YOUR_TURN" | "INVALID_ACTION" | "TURN_EXPIRED";
    };
export function applyCarcassonneAction(
  state: CarcassonneState,
  actor: PlayerId,
  input: unknown,
  now: ServerTime,
  turnId: TurnId,
  _random?: CarcassonneRandom,
): CarcassonneApplyResult {
  if (state.phase !== "PLAYING") return { ok: false, reason: "INVALID_PHASE" };
  if (state.activePlayerId !== actor)
    return { ok: false, reason: "NOT_YOUR_TURN" };
  if (state.deadlineAt === null || now >= state.deadlineAt)
    return { ok: false, reason: "TURN_EXPIRED" };
  return applyMove(state, actor, input, now, turnId, false);
}
function applyMove(
  state: CarcassonneState,
  actor: PlayerId,
  input: unknown,
  now: ServerTime,
  turnId: TurnId,
  automatic: boolean,
): CarcassonneApplyResult {
  const parsed = v.safeParse(CarcassonneActionSchema, input);
  if (!parsed.success) return { ok: false, reason: "INVALID_ACTION" };
  const a = parsed.output,
    p = state.players.find((p) => p.playerId === actor);
  // Compare against the authorized current tile before looking up any supplied ID.
  if (!p || a.tileId !== state.currentTileId)
    return { ok: false, reason: "INVALID_ACTION" };
  const tile = {
    ...tileById(state, a.tileId),
    x: a.x,
    y: a.y,
    rotation: a.rotation,
  };
  if (carcassonnePlacementReason(state.board, tile) !== null)
    return { ok: false, reason: "INVALID_ACTION" };
  if (a.meepleRegionId !== null) {
    if (
      p.availableMeeples < 1 ||
      !CARCASSONNE_CATALOG[tile.kind].regions.some(
        (r) => r.id === a.meepleRegionId,
      )
    )
      return { ok: false, reason: "INVALID_ACTION" };
    const feature = analyzeCarcassonneBoard(
      [...state.board, tile],
      state.meeples,
    ).find((f) =>
      f.nodes.includes(carcassonneRegionKey(tile.tileId, a.meepleRegionId!)),
    );
    if (!feature || feature.meeples.length > 0)
      return { ok: false, reason: "INVALID_ACTION" };
  }
  const s = v.parse(StateSchema, state),
    player = s.players.find((p) => p.playerId === actor)!;
  s.board.push(tile);
  s.currentTileId = null;
  if (a.meepleRegionId !== null) {
    s.meeples.push({
      playerId: actor,
      tileId: tile.tileId,
      regionId: a.meepleRegionId,
    });
    player.availableMeeples--;
  }
  const scoring = settleCompleted(s);
  s.feedback = {
    playerId: actor,
    tile,
    meepleRegionId: a.meepleRegionId,
    automatic,
    at: now,
    scoring,
  };
  s.history = [...s.history, s.feedback].slice(-8);
  s.revision = v.parse(GameRevisionSchema, s.revision + 1);
  s.transitionId = turnId;
  s.turnStartedAt = now;
  if (!drawNext(s)) finish(s, now);
  else {
    s.activePlayerId =
      s.players[
        (s.players.findIndex((p) => p.playerId === actor) + 1) %
          s.players.length
      ]!.playerId;
    s.deadlineAt = v.parse(
      ServerTimeSchema,
      now + CARCASSONNE_TURN_DURATION_MS,
    );
  }
  return { ok: true, state: parseCarcassonneState(s) };
}
export function chooseCarcassonneTimeoutAction(
  s: CarcassonneState,
): CarcassonneAction | null {
  if (s.phase !== "PLAYING" || s.currentTileId === null) return null;
  const tile = legalCarcassonnePlacements(
    s.board,
    tileById(s, s.currentTileId),
  )[0];
  return tile
    ? {
        tileId: tile.tileId,
        x: tile.x,
        y: tile.y,
        rotation: tile.rotation,
        meepleRegionId: null,
      }
    : null;
}
export function timeoutCarcassonne(
  s: CarcassonneState,
  now: ServerTime,
  turnId: TurnId,
  _random?: CarcassonneRandom,
): CarcassonneState | null {
  if (s.phase !== "PLAYING" || s.deadlineAt === null || now < s.deadlineAt)
    return null;
  const action = chooseCarcassonneTimeoutAction(s);
  if (!action) return null;
  const applied = applyMove(s, s.activePlayerId, action, now, turnId, true);
  return applied.ok ? applied.state : null;
}
export function cancelCarcassonne(
  state: CarcassonneState,
  now: ServerTime,
): CarcassonneState {
  const s = parseCarcassonneState(state);
  if (s.phase === "FINISHED") return s;
  s.phase = "FINISHED";
  s.finishedAt = now;
  s.deadlineAt = null;
  s.revision = v.parse(GameRevisionSchema, s.revision + 1);
  s.result = {
    reason: "CANCELLED",
    winnerPlayerIds: [],
    scores: [],
    finalScoring: [],
  };
  return parseCarcassonneState(s);
}

import * as v from "valibot";
import {
  AZUL_COLORS, AZUL_FLOOR_PENALTIES, AZUL_TURN_DURATION_MS, AzulActionSchema, AzulTileSchema,
  AzulFeedbackSchema, AzulRoundResultSchema, AzulResultSchema,
  AzulPlayingProjectionSchema, AzulFinishedProjectionSchema, azulProjectionIsConsistent,
  azulWallColumn, GameIdSchema, GameRevisionSchema, PlayerIdSchema, TileIdSchema,
  TurnIdSchema, ServerTimeSchema, type AzulTile, type AzulAction,
  type AzulProjection, type AzulRoundResult, type GameId, type PlayerId, type TileId,
  type TurnId, type ServerTime,
} from "@hangul-rummikub/shared";

const ids = v.pipe(v.array(TileIdSchema), v.maxLength(100));
const StateSchema = v.strictObject({
  rulesVersion: v.literal("azul-base-v1"), gameId: GameIdSchema, revision: GameRevisionSchema,
  startedAt: ServerTimeSchema, finishedAt: v.nullable(ServerTimeSchema), phase: v.picklist(["PLAYING", "FINISHED"]),
  round: v.pipe(v.number(), v.safeInteger(), v.minValue(1)), transitionId: TurnIdSchema,
  turnStartedAt: ServerTimeSchema, deadlineAt: v.nullable(ServerTimeSchema),
  activePlayerId: PlayerIdSchema, roundStarterId: PlayerIdSchema, firstPlayerId: v.nullable(PlayerIdSchema),
  inventory: v.pipe(v.array(AzulTileSchema), v.length(100)), bag: ids, discard: ids,
  factories: v.pipe(v.array(v.pipe(v.array(TileIdSchema), v.maxLength(4))), v.minLength(5), v.maxLength(9)), center: ids,
  players: v.pipe(v.array(v.strictObject({
    playerId: PlayerIdSchema, score: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
    patternLines: v.pipe(v.array(v.pipe(v.array(TileIdSchema), v.maxLength(5))), v.length(5)),
    wall: v.pipe(v.array(v.pipe(v.array(v.nullable(TileIdSchema)), v.length(5))), v.length(5)),
    floor: v.pipe(v.array(v.union([TileIdSchema, v.literal("FIRST_PLAYER")])), v.maxLength(7)),
  })), v.minLength(2), v.maxLength(4)),
  lastRound: v.nullable(AzulRoundResultSchema), feedback: v.nullable(AzulFeedbackSchema), result: v.nullable(AzulResultSchema),
});
export type AzulState = v.InferOutput<typeof StateSchema>;
export type AzulRandom = { nextInt(upperBound: number): number };
export function shuffleAzul<T>(items: readonly T[], random: AzulRandom): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random.nextInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error("Invalid random source.");
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export function makeAzulTiles(generate: () => TileId): AzulTile[] {
  return AZUL_COLORS.flatMap(color => Array.from({ length: 20 }, () => ({ tileId: generate(), color })));
}
export function azulTile(s: AzulState, id: TileId): AzulTile {
  const tile = s.inventory.find(t => t.tileId === id);
  if (!tile) throw new Error("Missing Azul tile.");
  return tile;
}
export function publicAzul(s: AzulState): AzulProjection {
  const base = {
    gameType: "AZUL", gameId: s.gameId, gameRevision: s.revision, rulesVersion: s.rulesVersion, round: s.round,
    factories: s.factories.map(f => f.map(id => azulTile(s, id))), center: s.center.map(id => azulTile(s, id)),
    firstPlayerId: s.firstPlayerId, bagCount: s.bag.length, discardCount: s.discard.length,
    playerStates: s.players.map(p => ({ playerId: p.playerId, score: p.score,
      patternLines: p.patternLines.map(line => line.map(id => azulTile(s, id))),
      wall: p.wall.map(line => line.map(id => id === null ? null : azulTile(s, id))),
      floor: p.floor.map(id => id === "FIRST_PLAYER" ? "FIRST_PLAYER" : azulTile(s, id)),
    })), lastRound: s.lastRound, feedback: s.feedback,
  };
  return s.phase === "PLAYING"
    ? v.parse(AzulPlayingProjectionSchema, { ...base, phase: s.phase, turnId: s.transitionId, activePlayerId: s.activePlayerId, turnStartedAt: s.turnStartedAt, deadlineAt: s.deadlineAt })
    : v.parse(AzulFinishedProjectionSchema, { ...base, phase: s.phase, result: s.result });
}
export function parseAzulState(input: unknown): AzulState {
  const s = v.parse(StateSchema, input);
  const inventory = new Set(s.inventory.map(t => t.tileId));
  if (inventory.size !== 100 || s.inventory.some(t => t.tileId === "FIRST_PLAYER") || AZUL_COLORS.some(color => s.inventory.filter(t => t.color === color).length !== 20)) throw new Error("Invalid Azul inventory.");
  const zones = [...s.bag, ...s.discard, ...s.factories.flat(), ...s.center,
    ...s.players.flatMap(p => [...p.patternLines.flat(), ...p.wall.flat().filter(id => id !== null), ...p.floor.filter((id): id is TileId => id !== "FIRST_PLAYER")])];
  if (zones.length !== 100 || new Set(zones).size !== 100 || zones.some(id => !inventory.has(id))) throw new Error("Azul tile conservation failed.");
  if (!s.players.some(p => p.playerId === s.activePlayerId) || !s.players.some(p => p.playerId === s.roundStarterId)) throw new Error("Invalid Azul active player.");
  if (s.phase === "FINISHED" ? s.finishedAt === null || s.result === null : s.finishedAt !== null || s.result !== null) throw new Error("Invalid Azul terminal state.");
  if (s.phase === "FINISHED" ? s.deadlineAt !== null : s.deadlineAt !== s.turnStartedAt + AZUL_TURN_DURATION_MS) throw new Error("Invalid Azul deadline.");
  const view = publicAzul(s);
  if (!azulProjectionIsConsistent(view)) throw new Error("Invalid Azul board.");
  if (s.phase === "PLAYING" && s.players.some(p => p.wall.some(r => r.every(t => t !== null)))) throw new Error("Unsettled Azul finish.");
  return s;
}
function fillFactories(s: AzulState, random: AzulRandom): void {
  s.factories = Array.from({ length: s.players.length * 2 + 1 }, () => []);
  for (const factory of s.factories) {
    for (let i = 0; i < 4; i++) {
      if (!s.bag.length && s.discard.length) { s.bag = shuffleAzul(s.discard, random); s.discard = []; }
      const id = s.bag.pop();
      if (id !== undefined) factory.push(id);
    }
  }
}
export function createAzulGame(input: { gameId: GameId; playerIds: readonly PlayerId[]; tiles: readonly AzulTile[]; starter: number; now: ServerTime; turnId: TurnId; random: AzulRandom }): AzulState {
  if (input.playerIds.length < 2 || input.playerIds.length > 4 || new Set(input.playerIds).size !== input.playerIds.length || !Number.isInteger(input.starter) || input.starter < 0 || input.starter >= input.playerIds.length) throw new Error("Invalid Azul players.");
  const s: AzulState = {
    rulesVersion: "azul-base-v1", gameId: input.gameId, revision: v.parse(GameRevisionSchema, 0), startedAt: input.now, finishedAt: null,
    turnStartedAt: input.now, deadlineAt: v.parse(ServerTimeSchema, input.now + AZUL_TURN_DURATION_MS),
    phase: "PLAYING", round: 1, transitionId: input.turnId, activePlayerId: input.playerIds[input.starter]!, roundStarterId: input.playerIds[input.starter]!, firstPlayerId: null,
    inventory: input.tiles.map(t => ({ ...t })), bag: shuffleAzul(input.tiles.map(t => t.tileId), input.random), discard: [], factories: [], center: [],
    players: input.playerIds.map(playerId => ({ playerId, score: 0, patternLines: Array.from({ length: 5 }, () => []), wall: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => null)), floor: [] })),
    lastRound: null, feedback: null, result: null,
  };
  fillFactories(s, input.random);
  return parseAzulState(s);
}
export function scoreAzulPlacement(wall: readonly (readonly (unknown | null)[])[], row: number, col: number): { horizontal: number; vertical: number; points: number } {
  let horizontal = 1, vertical = 1;
  for (const direction of [-1, 1]) {
    for (let c = col + direction; c >= 0 && c < 5 && wall[row]?.[c] != null; c += direction) horizontal++;
    for (let r = row + direction; r >= 0 && r < 5 && wall[r]?.[col] != null; r += direction) vertical++;
  }
  return { horizontal, vertical, points: horizontal === 1 && vertical === 1 ? 1 : (horizontal > 1 ? horizontal : 0) + (vertical > 1 ? vertical : 0) };
}
function settleRound(s: AzulState, now: ServerTime, random: AzulRandom): void {
  const result: AzulRoundResult = { round: s.round, scores: [] };
  for (const p of s.players) {
    const score: AzulRoundResult["scores"][number] = { playerId: p.playerId, before: p.score, after: 0, penalty: 0, placements: [] };
    for (let row = 0; row < 5; row++) {
      const line = p.patternLines[row]!;
      if (line.length !== row + 1) continue;
      const id = line[0]!, color = azulTile(s, id).color, column = azulWallColumn(row, color);
      p.wall[row]![column] = id;
      const points = scoreAzulPlacement(p.wall, row, column);
      p.score += points.points;
      score.placements.push({ row, column, color, ...points });
      s.discard.push(...line.slice(1));
      p.patternLines[row] = [];
    }
    score.penalty = AZUL_FLOOR_PENALTIES.slice(0, p.floor.length).reduce((sum, n) => sum + n, 0);
    p.score = Math.max(0, p.score - score.penalty);
    score.after = p.score;
    s.discard.push(...p.floor.filter((id): id is TileId => id !== "FIRST_PLAYER"));
    p.floor = [];
    result.scores.push(score);
  }
  s.lastRound = result;
  if (s.players.some(p => p.wall.some(row => row.every(id => id !== null)))) {
    const scores = s.players.map(p => {
      const rows = p.wall.filter(row => row.every(id => id !== null)).length;
      const columns = Array.from({ length: 5 }, (_, c) => p.wall.every(row => row[c] !== null)).filter(Boolean).length;
      const colors = AZUL_COLORS.filter(color => p.wall.every((row, r) => row[azulWallColumn(r, color)] !== null)).length;
      const base = p.score, total = base + rows * 2 + columns * 7 + colors * 10;
      p.score = total;
      return { playerId: p.playerId, base, rows, columns, colors, total };
    });
    const bestScore = Math.max(...scores.map(p => p.total));
    const bestRows = Math.max(...scores.filter(p => p.total === bestScore).map(p => p.rows));
    s.result = { reason: "WALL_COMPLETE", winnerPlayerIds: scores.filter(p => p.total === bestScore && p.rows === bestRows).map(p => p.playerId), scores };
    s.phase = "FINISHED";
    s.finishedAt = now;
  } else {
    // If every offer was monochrome, the previous round starter keeps the marker.
    s.activePlayerId = s.firstPlayerId ?? s.roundStarterId;
    s.roundStarterId = s.activePlayerId;
    s.firstPlayerId = null;
    s.round++;
    fillFactories(s, random);
  }
}
export type AzulApplyResult = { ok: true; state: AzulState } | { ok: false; reason: "INVALID_PHASE" | "NOT_YOUR_TURN" | "INVALID_ACTION" | "TURN_EXPIRED" };
export function applyAzulAction(state: AzulState, actor: PlayerId, input: unknown, now: ServerTime, turnId: TurnId, random: AzulRandom): AzulApplyResult {
  if (state.phase !== "PLAYING") return { ok: false, reason: "INVALID_PHASE" };
  if (state.activePlayerId !== actor) return { ok: false, reason: "NOT_YOUR_TURN" };
  if (state.deadlineAt === null || now >= state.deadlineAt) return { ok: false, reason: "TURN_EXPIRED" };
  return applyMove(state, actor, input, now, turnId, random, false);
}
function applyMove(state: AzulState, actor: PlayerId, input: unknown, now: ServerTime, turnId: TurnId, random: AzulRandom, automatic: boolean): AzulApplyResult {
  const parsed = v.safeParse(AzulActionSchema, input);
  if (!parsed.success) return { ok: false, reason: "INVALID_ACTION" };
  const action: AzulAction = parsed.output;
  const p = state.players.find(p => p.playerId === actor);
  const source = action.source.kind === "CENTER" ? state.center : state.factories[action.source.index];
  if (!p || !source) return { ok: false, reason: "INVALID_ACTION" };
  const chosen = source.filter(id => azulTile(state, id).color === action.color);
  if (!chosen.length) return { ok: false, reason: "INVALID_ACTION" };
  if (action.destination !== "FLOOR") {
    const line = p.patternLines[action.destination]!, wall = p.wall[action.destination]!;
    if (line.length === action.destination + 1 || line.some(id => azulTile(state, id).color !== action.color) || wall.some(id => id !== null && azulTile(state, id).color === action.color)) return { ok: false, reason: "INVALID_ACTION" };
  }
  const s = parseAzulState(state), player = s.players.find(p => p.playerId === actor)!;
  if (action.source.kind === "CENTER") s.center = s.center.filter(id => !chosen.includes(id));
  else { s.center.push(...s.factories[action.source.index]!.filter(id => !chosen.includes(id))); s.factories[action.source.index] = []; }
  const tookFirstPlayer = action.source.kind === "CENTER" && s.firstPlayerId === null;
  if (tookFirstPlayer) {
    s.firstPlayerId = actor;
    if (player.floor.length < 7) player.floor.push("FIRST_PLAYER");
  }
  const capacity = action.destination === "FLOOR" ? 0 : action.destination + 1 - player.patternLines[action.destination]!.length;
  const placed = Math.min(capacity, chosen.length);
  if (action.destination !== "FLOOR") player.patternLines[action.destination]!.push(...chosen.slice(0, placed));
  for (const id of chosen.slice(placed)) { if (player.floor.length < 7) player.floor.push(id); else s.discard.push(id); }
  s.feedback = { playerId: actor, color: action.color, source: action.source, destination: action.destination, count: chosen.length, placed, dropped: chosen.length - placed, tookFirstPlayer, automatic, at: now };
  s.revision = v.parse(GameRevisionSchema, s.revision + 1);
  s.transitionId = turnId;
  if (s.center.length === 0 && s.factories.every(f => f.length === 0)) settleRound(s, now, random);
  else s.activePlayerId = s.players[(s.players.findIndex(p => p.playerId === actor) + 1) % s.players.length]!.playerId;
  s.turnStartedAt = now;
  s.deadlineAt = s.phase === "FINISHED" ? null : v.parse(ServerTimeSchema, now + AZUL_TURN_DURATION_MS);
  return { ok: true, state: parseAzulState(s) };
}
export function cancelAzul(state: AzulState, now: ServerTime): AzulState {
  const s = parseAzulState(state);
  if (s.phase === "FINISHED") return s;
  s.phase = "FINISHED"; s.deadlineAt = null; s.finishedAt = now; s.revision = v.parse(GameRevisionSchema, s.revision + 1);
  s.result = { reason: "CANCELLED", winnerPlayerIds: [], scores: [] };
  return parseAzulState(s);
}

/** Stable fallback using only public offers and the active player's board. */
export function chooseAzulTimeoutAction(s: AzulState): AzulAction | null {
  if (s.phase !== "PLAYING") return null;
  const p = s.players.find(p => p.playerId === s.activePlayerId)!;
  let best: { action: AzulAction; dropped: number; placed: number } | null = null;
  const sources: AzulAction["source"][] = [...s.factories.map((_, index) => ({ kind: "FACTORY" as const, index })), { kind: "CENTER" }];
  for (const destination of [0, 1, 2, 3, 4, "FLOOR"] as const) for (const source of sources) for (const color of AZUL_COLORS) {
    const pool = source.kind === "CENTER" ? s.center : s.factories[source.index]!;
    const count = pool.filter(id => azulTile(s, id).color === color).length;
    if (!count) continue;
    if (destination !== "FLOOR" && (p.patternLines[destination]!.length === destination + 1 || p.patternLines[destination]!.some(id => azulTile(s, id).color !== color) || p.wall[destination]![azulWallColumn(destination, color)] !== null)) continue;
    const placed = destination === "FLOOR" ? 0 : Math.min(count, destination + 1 - p.patternLines[destination]!.length);
    const dropped = count - placed;
    if (!best || dropped < best.dropped || dropped === best.dropped && placed > best.placed) best = { action: { source, color, destination }, dropped, placed };
  }
  return best?.action ?? null;
}
export function timeoutAzul(s: AzulState, now: ServerTime, turnId: TurnId, random: AzulRandom): AzulState | null {
  if (s.phase !== "PLAYING" || s.deadlineAt === null || now < s.deadlineAt) return null;
  const action = chooseAzulTimeoutAction(s);
  if (!action) return null;
  const result = applyMove(s, s.activePlayerId, action, now, turnId, random, true);
  return result.ok ? result.state : null;
}

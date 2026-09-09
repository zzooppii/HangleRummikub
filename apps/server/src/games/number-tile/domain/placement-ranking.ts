import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { NumberTileGameState } from "./game-state.js";

export type NumberPlacementResult = Readonly<{
  rankingMode: "PLACEMENT";
  reason: "PLACEMENT_COMPLETE" | "STALEMATE" | "LAST_PLAYER_STANDING";
  finishedAt: ServerTime;
  winnerPlayerIds: readonly PlayerId[];
  rankings: readonly Readonly<{ playerId: PlayerId; rank: number; forfeited: boolean; remainingRackCount: number }>[];
}>;

/** Placement is separate from forfeit. The original turn order never changes. */
export function numberActivePlayers(game: Pick<NumberTileGameState, "turnOrder" | "forfeitedPlayerIds" | "placementOrder">): readonly PlayerId[] {
  return game.turnOrder.filter(id => !game.forfeitedPlayerIds.has(id) && !game.placementOrder?.includes(id));
}

export function numberIneligiblePlayers(game: Pick<NumberTileGameState, "forfeitedPlayerIds" | "placementOrder">): ReadonlySet<PlayerId> {
  return new Set([...game.forfeitedPlayerIds, ...game.placementOrder ?? []]);
}

export function createNumberPlacementResult(game: NumberTileGameState, reason: NumberPlacementResult["reason"], finishedAt: ServerTime): NumberPlacementResult {
  if (game.placementOrder === undefined) throw new Error("Placement result requires explicit placement state.");
  const placed = [...game.placementOrder];
  if (new Set(placed).size !== placed.length || placed.some(id => !game.turnOrder.includes(id) || game.forfeitedPlayerIds.has(id) || game.racks.get(id)?.length !== 0)) throw new Error("Invalid Number placement order.");
  const remaining = [...numberActivePlayers(game)];
  if (reason !== "STALEMATE" && remaining.length !== 1) throw new Error("Number completion requires one remaining active player.");
  if (reason === "PLACEMENT_COMPLETE" && placed.length === 0) throw new Error("Normal placement completion requires a rack-empty placement.");
  if (reason === "STALEMATE") {
    if (game.pool.length !== 0 || remaining.length < 2 || !remaining.every(id => game.noPlayPlayerIds.includes(id))) throw new Error("Number stalemate requires the full active no-play cycle.");
    remaining.sort((a,b) => game.racks.get(a)!.length - game.racks.get(b)!.length || game.turnOrder.indexOf(a) - game.turnOrder.indexOf(b));
  }
  const order = [...placed, ...remaining, ...game.turnOrder.filter(id => game.forfeitedPlayerIds.has(id))];
  if (order.length !== game.turnOrder.length) throw new Error("Number result must rank all participants.");
  return Object.freeze({ rankingMode: "PLACEMENT", reason, finishedAt,
    winnerPlayerIds: Object.freeze([order[0]!]),
    rankings: Object.freeze(order.map((playerId, i) => Object.freeze({ playerId, rank: i + 1, forfeited: game.forfeitedPlayerIds.has(playerId), remainingRackCount: game.racks.get(playerId)!.length }))) });
}

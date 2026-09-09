import * as v from "valibot";

import {
  GameIdSchema,
  PlayerIdSchema,
  TileIdSchema,
  TurnIdSchema,
} from "../../identifiers.js";
import {
  GameRevisionSchema,
  ServerTimeSchema,
} from "../../protocol.js";
import {
  NUMBER_TILE_COLORS,
  NumberTileColorSchema,
  NumberTileNumberSchema,
} from "./turn-command-contracts.js";

export const NUMBER_TILE_PHYSICAL_TILE_COUNT = 106;
export const NUMBER_TILE_TURN_DURATION_MS = 90_000;

export const NumberTileCountSchema = v.pipe(
  v.number(),
  v.integer("Number Tile counts must be integers."),
  v.safeInteger("Number Tile counts must be safe integers."),
  v.minValue(0, "Number Tile counts must not be negative."),
  v.maxValue(
    NUMBER_TILE_PHYSICAL_TILE_COUNT,
    "Number Tile counts exceed the physical inventory.",
  ),
);
export type NumberTileCount = v.InferOutput<typeof NumberTileCountSchema>;

export const NumberTileTurnNumberSchema = v.pipe(
  v.number(),
  v.integer("Number Tile turn numbers must be integers."),
  v.safeInteger("Number Tile turn numbers must be safe integers."),
  v.minValue(1, "Number Tile turn numbers must be positive."),
);
export type NumberTileTurnNumber = v.InferOutput<
  typeof NumberTileTurnNumberSchema
>;

const NumberTileScoreSchema = v.pipe(
  v.number(),
  v.integer("Number Tile scores must be integers."),
  v.safeInteger("Number Tile scores must be safe integers."),
);

const NumberTilePenaltySchema = v.pipe(
  NumberTileScoreSchema,
  v.minValue(0, "Number Tile penalties must not be negative."),
);

const NumberTileRankSchema = v.pipe(
  v.number(),
  v.integer("Number Tile ranks must be integers."),
  v.safeInteger("Number Tile ranks must be safe integers."),
  v.minValue(1, "Number Tile ranks must be positive."),
  v.maxValue(4, "Number Tile ranks must not exceed the Player count."),
);

export const NumberTileOrdinaryTileViewV2Schema = v.strictObject({
  tileId: TileIdSchema,
  kind: v.literal("ORDINARY"),
  number: NumberTileNumberSchema,
  color: NumberTileColorSchema,
});
export type NumberTileOrdinaryTileViewV2 = v.InferOutput<
  typeof NumberTileOrdinaryTileViewV2Schema
>;

export const NumberTileJokerTileViewV2Schema = v.strictObject({
  tileId: TileIdSchema,
  kind: v.literal("JOKER"),
});
export type NumberTileJokerTileViewV2 = v.InferOutput<
  typeof NumberTileJokerTileViewV2Schema
>;

export const NumberTilePrivateRackTileViewV2Schema = v.variant("kind", [
  NumberTileOrdinaryTileViewV2Schema,
  NumberTileJokerTileViewV2Schema,
]);
export type NumberTilePrivateRackTileViewV2 = v.InferOutput<
  typeof NumberTilePrivateRackTileViewV2Schema
>;

export const NumberTileOrdinaryTablePlacementV2Schema =
  NumberTileOrdinaryTileViewV2Schema;
export type NumberTileOrdinaryTablePlacementV2 = v.InferOutput<
  typeof NumberTileOrdinaryTablePlacementV2Schema
>;

export const NumberTileJokerTablePlacementV2Schema = v.strictObject({
  tileId: TileIdSchema,
  kind: v.literal("JOKER"),
});
export type NumberTileJokerTablePlacementV2 = v.InferOutput<
  typeof NumberTileJokerTablePlacementV2Schema
>;

export const NumberTileTablePlacementV2Schema = v.variant("kind", [
  NumberTileOrdinaryTablePlacementV2Schema,
  NumberTileJokerTablePlacementV2Schema,
]);
export type NumberTileTablePlacementV2 = v.InferOutput<
  typeof NumberTileTablePlacementV2Schema
>;

const NumberTileGroupV2ObjectSchema = v.strictObject({
  kind: v.literal("GROUP"),
  tiles: v.pipe(
    v.array(NumberTileTablePlacementV2Schema),
    v.minLength(3, "A Number Tile GROUP requires at least three Tiles."),
    v.maxLength(4, "A Number Tile GROUP supports at most four Tiles."),
  ),
});

export const NumberTileGroupV2Schema = v.pipe(
  NumberTileGroupV2ObjectSchema,
  v.check(
    (meld) =>
      meld.tiles.filter((placement) => placement.kind === "JOKER").length <= 1,
    "A Number Tile meld may contain at most one Joker.",
  ),
  v.check((meld) => {
    const ordinary = meld.tiles.filter(
      (placement) => placement.kind === "ORDINARY",
    );
    return (
      ordinary.length >= 2 &&
      ordinary.every((tile) => tile.number === ordinary[0]?.number) &&
      new Set(ordinary.map((tile) => tile.color)).size === ordinary.length &&
      (ordinary.length === meld.tiles.length ||
        ordinary.length < NUMBER_TILE_COLORS.length)
    );
  }, "A public Number Tile GROUP must have one number, distinct ordinary colors, and an available wildcard color."),
);
export type NumberTileGroupV2 = v.InferOutput<
  typeof NumberTileGroupV2Schema
>;

const NumberTileRunV2ObjectSchema = v.strictObject({
  kind: v.literal("RUN"),
  tiles: v.pipe(
    v.array(NumberTileTablePlacementV2Schema),
    v.minLength(3, "A Number Tile RUN requires at least three Tiles."),
    v.maxLength(13, "A Number Tile RUN supports at most thirteen Tiles."),
  ),
});

export const NumberTileRunV2Schema = v.pipe(
  NumberTileRunV2ObjectSchema,
  v.check(
    (meld) =>
      meld.tiles.filter((placement) => placement.kind === "JOKER").length <= 1,
    "A Number Tile meld may contain at most one Joker.",
  ),
  v.check((meld) => {
    const ordinary = meld.tiles.flatMap((placement, index) =>
      placement.kind === "ORDINARY" ? [{ placement, index }] : [],
    );
    if (ordinary.length < 2) {
      return false;
    }
    const start = ordinary[0]!.placement.number - ordinary[0]!.index;
    return (
      start >= 1 &&
      start + meld.tiles.length - 1 <= 13 &&
      ordinary.every(
        ({ placement, index }) =>
          placement.color === ordinary[0]!.placement.color &&
          placement.number === start + index,
      )
    );
  }, "A public Number Tile RUN must derive one color and an ordered consecutive sequence."),
);
export type NumberTileRunV2 = v.InferOutput<typeof NumberTileRunV2Schema>;

export const NumberTileMeldV2Schema = v.variant("kind", [
  NumberTileGroupV2Schema,
  NumberTileRunV2Schema,
]);
export type NumberTileMeldV2 = v.InferOutput<typeof NumberTileMeldV2Schema>;

function numberTileTableTileIds(table: {
  melds: readonly { tiles: readonly { tileId: string }[] }[];
}): readonly string[] {
  return table.melds.flatMap((meld) =>
    meld.tiles.map((placement) => placement.tileId),
  );
}

const NumberTileTableV2ObjectSchema = v.strictObject({
  melds: v.pipe(
    v.array(NumberTileMeldV2Schema),
    v.maxLength(35, "A Number Tile Table contains too many melds."),
  ),
});

export const NumberTileTableV2Schema = v.pipe(
  NumberTileTableV2ObjectSchema,
  v.check(
    (table) => {
      const tileIds = numberTileTableTileIds(table);
      return (
        tileIds.length <= NUMBER_TILE_PHYSICAL_TILE_COUNT &&
        new Set(tileIds).size === tileIds.length
      );
    },
    "A public Number Tile Table must reference each physical Tile at most once.",
  ),
);
export type NumberTileTableV2 = v.InferOutput<
  typeof NumberTileTableV2Schema
>;

export const NumberTilePlayerStateV2Schema = v.strictObject({
  playerId: PlayerIdSchema,
  rackCount: NumberTileCountSchema,
  initialMeldCompleted: v.boolean(),
  forfeited: v.boolean(),
});
export type NumberTilePlayerStateV2 = v.InferOutput<
  typeof NumberTilePlayerStateV2Schema
>;

const NumberTilePlayerStatesV2Schema = v.pipe(
  v.array(NumberTilePlayerStateV2Schema),
  v.minLength(2),
  v.maxLength(4),
  v.check(
    (players) =>
      new Set(players.map((player) => player.playerId)).size === players.length,
    "Number Tile player states must not contain duplicate Players.",
  ),
);

export const NumberTilePrivateStateV2Schema = v.pipe(
  v.strictObject({
    rack: v.pipe(
      v.array(NumberTilePrivateRackTileViewV2Schema),
      v.maxLength(NUMBER_TILE_PHYSICAL_TILE_COUNT),
    ),
  }),
  v.check(
    (privateState) =>
      new Set(privateState.rack.map((tile) => tile.tileId)).size ===
      privateState.rack.length,
    "The private Number Tile rack must not contain duplicate Tiles.",
  ),
);
export type NumberTilePrivateStateV2 = v.InferOutput<
  typeof NumberTilePrivateStateV2Schema
>;

export const NumberTileTurnV2Schema = v.pipe(
  v.strictObject({
    turnId: TurnIdSchema,
    turnNumber: NumberTileTurnNumberSchema,
    activePlayerId: PlayerIdSchema,
    startedAt: ServerTimeSchema,
    deadlineAt: ServerTimeSchema,
  }),
  v.check(
    (turn) =>
      turn.deadlineAt - turn.startedAt === NUMBER_TILE_TURN_DURATION_MS,
    "A Number Tile turn must use the canonical duration.",
  ),
);
export type NumberTileTurnV2 = v.InferOutput<typeof NumberTileTurnV2Schema>;

export const NumberTilePlayerResultEntryV2Schema = v.strictObject({
  playerId: PlayerIdSchema,
  score: NumberTileScoreSchema,
  remainingRackCount: NumberTileCountSchema,
  penaltyCost: NumberTilePenaltySchema,
  forfeited: v.boolean(),
});
export type NumberTilePlayerResultEntryV2 = v.InferOutput<
  typeof NumberTilePlayerResultEntryV2Schema
>;

export const NumberTileStalemateRankingEntryV2Schema = v.strictObject({
  ...NumberTilePlayerResultEntryV2Schema.entries,
  rank: NumberTileRankSchema,
});
export type NumberTileStalemateRankingEntryV2 = v.InferOutput<
  typeof NumberTileStalemateRankingEntryV2Schema
>;

function hasUniqueResultPlayers(
  entries: readonly { playerId: string }[],
): boolean {
  return new Set(entries.map((entry) => entry.playerId)).size === entries.length;
}

function createSingleWinnerResultSchema(
  reason: "RACK_EMPTY" | "LAST_PLAYER_STANDING",
) {
  return v.pipe(
    v.strictObject({
      reason: v.literal(reason),
      finishedAt: ServerTimeSchema,
      winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.length(1)),
      playerResults: v.pipe(
        v.array(NumberTilePlayerResultEntryV2Schema),
        v.minLength(2),
        v.maxLength(4),
      ),
    }),
    v.check(
      (result) => hasUniqueResultPlayers(result.playerResults),
      "Number Tile result Players must be unique.",
    ),
    v.check(
      (result) => {
        const winner = result.playerResults.find(
          (entry) => entry.playerId === result.winnerPlayerIds[0],
        );
        return winner !== undefined && !winner.forfeited;
      },
      "A Number Tile winner must be a non-forfeited result Player.",
    ),
    v.check((result) => {
      const winnerPlayerId = result.winnerPlayerIds[0];
      const expectedWinnerScore = result.playerResults.reduce(
        (total, entry) =>
          entry.playerId === winnerPlayerId
            ? total
            : total + entry.penaltyCost,
        0,
      );
      return result.playerResults.every((entry) =>
        entry.playerId === winnerPlayerId
          ? entry.score === expectedWinnerScore
          : entry.score === (entry.penaltyCost === 0 ? 0 : -entry.penaltyCost),
      );
    }, "Number Tile single-winner scores must transfer losing penalties."),
    v.check((result) => {
      const winnerPlayerId = result.winnerPlayerIds[0];
      const winner = result.playerResults.find(
        (entry) => entry.playerId === winnerPlayerId,
      );
      if (winner === undefined) {
        return false;
      }
      if (reason === "RACK_EMPTY") {
        return (
          winner.remainingRackCount === 0 &&
          result.playerResults.every(
            (entry) =>
              entry.playerId === winnerPlayerId ||
              entry.remainingRackCount > 0,
          )
        );
      }
      return (
        winner.remainingRackCount > 0 &&
        result.playerResults.filter((entry) => !entry.forfeited).length === 1 &&
        result.playerResults.every((entry) => entry.remainingRackCount > 0)
      );
    }, "Number Tile terminal reason must match rack and forfeit metadata."),
  );
}

export const NumberTileRackEmptyResultV2Schema =
  createSingleWinnerResultSchema("RACK_EMPTY");
export type NumberTileRackEmptyResultV2 = v.InferOutput<
  typeof NumberTileRackEmptyResultV2Schema
>;

export const NumberTileLastPlayerStandingResultV2Schema =
  createSingleWinnerResultSchema("LAST_PLAYER_STANDING");
export type NumberTileLastPlayerStandingResultV2 = v.InferOutput<
  typeof NumberTileLastPlayerStandingResultV2Schema
>;

export const NumberTileStalemateResultV2Schema = v.pipe(
  v.strictObject({
    reason: v.literal("STALEMATE"),
    finishedAt: ServerTimeSchema,
    winnerPlayerIds: v.pipe(
      v.array(PlayerIdSchema),
      v.minLength(1),
      v.maxLength(4),
      v.check(
        (playerIds) => new Set(playerIds).size === playerIds.length,
        "Number Tile winners must not contain duplicates.",
      ),
    ),
    rankings: v.pipe(
      v.array(NumberTileStalemateRankingEntryV2Schema),
      v.minLength(2),
      v.maxLength(4),
    ),
  }),
  v.check(
    (result) => hasUniqueResultPlayers(result.rankings),
    "Number Tile ranking Players must be unique.",
  ),
  v.check(
    (result) =>
      result.rankings.filter((entry) => !entry.forfeited).length >= 2 &&
      result.rankings.every(
        (entry) =>
          entry.score ===
          (entry.penaltyCost === 0 ? 0 : -entry.penaltyCost),
      ),
    "Number Tile stalemate requires eligible Players and negative penalty scores.",
  ),
  v.check((result) => {
    let reachedForfeitedEntries = false;
    let subgroupIndex = 0;
    let subgroupOffset = 0;
    let previousPenalty: number | undefined;
    let previousRank = 0;

    for (const entry of result.rankings) {
      if (entry.forfeited && !reachedForfeitedEntries) {
        reachedForfeitedEntries = true;
        subgroupOffset = subgroupIndex;
        subgroupIndex = 0;
        previousPenalty = undefined;
        previousRank = 0;
      } else if (!entry.forfeited && reachedForfeitedEntries) {
        return false;
      }

      const expectedRank =
        previousPenalty === entry.penaltyCost
          ? previousRank
          : subgroupOffset + subgroupIndex + 1;
      if (
        (previousPenalty !== undefined &&
          entry.penaltyCost < previousPenalty) ||
        entry.rank !== expectedRank
      ) {
        return false;
      }
      previousPenalty = entry.penaltyCost;
      previousRank = entry.rank;
      subgroupIndex += 1;
    }
    return true;
  }, "Number Tile stalemate rankings must follow eligibility and competition order."),
  v.check(
    (result) => {
      const expectedWinnerIds = result.rankings
        .filter((entry) => entry.rank === 1 && !entry.forfeited)
        .map((entry) => entry.playerId);
      return (
        expectedWinnerIds.length === result.winnerPlayerIds.length &&
        expectedWinnerIds.every(
          (playerId, index) => result.winnerPlayerIds[index] === playerId,
        )
      );
    },
    "Number Tile stalemate winners must be the non-forfeited rank-one Players.",
  ),
);
export type NumberTileStalemateResultV2 = v.InferOutput<
  typeof NumberTileStalemateResultV2Schema
>;

export const NumberTilePlacementResultV2Schema = v.pipe(v.strictObject({
  rankingMode: v.literal("PLACEMENT"),
  reason: v.picklist(["PLACEMENT_COMPLETE", "STALEMATE", "LAST_PLAYER_STANDING"]),
  finishedAt: ServerTimeSchema,
  winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.length(1)),
  rankings: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, rank: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4)), forfeited: v.boolean(), remainingRackCount: NumberTileCountSchema })), v.minLength(2), v.maxLength(4)),
}), v.check(result => new Set(result.rankings.map(p => p.playerId)).size === result.rankings.length && result.rankings.every((p,i) => p.rank === i + 1) && !result.rankings[0]!.forfeited && result.winnerPlayerIds[0] === result.rankings[0]!.playerId && result.rankings.every((p,i) => !result.rankings.slice(0,i).some(previous => previous.forfeited && !p.forfeited)), "Placement ranks must be unique, ordered, complete and non-forfeited first."));

export const NumberTileGameResultV2Schema = v.union([NumberTilePlacementResultV2Schema, v.variant("reason", [
  NumberTileRackEmptyResultV2Schema,
  NumberTileLastPlayerStandingResultV2Schema,
  NumberTileStalemateResultV2Schema,
])]);
export type NumberTileGameResultV2 = v.InferOutput<
  typeof NumberTileGameResultV2Schema
>;

function hasPrivateRackSeparatedFromTable(projection: {
  table: { melds: readonly { tiles: readonly { tileId: string }[] }[] };
  privateState: { rack: readonly { tileId: string }[] };
}): boolean {
  const tableTileIds = new Set(numberTileTableTileIds(projection.table));
  return projection.privateState.rack.every(
    (tile) => !tableTileIds.has(tile.tileId),
  );
}

function numberTileProjectionConservesCounts(projection: {
  remainingPoolCount: number;
  table: { melds: readonly { tiles: readonly unknown[] }[] };
  playerStates: readonly { rackCount: number }[];
}): boolean {
  return (
    projection.remainingPoolCount +
      projection.playerStates.reduce(
        (total, player) => total + player.rackCount,
        0,
      ) +
      projection.table.melds.reduce(
        (total, meld) => total + meld.tiles.length,
        0,
      ) ===
    NUMBER_TILE_PHYSICAL_TILE_COUNT
  );
}

const NumberTilePlayingProjectionV2ObjectSchema = v.strictObject({
  placementOrder: v.optional(v.array(PlayerIdSchema)),
  gameType: v.literal("NUMBER_TILE"),
  gameId: GameIdSchema,
  gameRevision: GameRevisionSchema,
  remainingPoolCount: NumberTileCountSchema,
  table: NumberTileTableV2Schema,
  playerStates: NumberTilePlayerStatesV2Schema,
  turn: NumberTileTurnV2Schema,
  privateState: NumberTilePrivateStateV2Schema,
});

export const NumberTilePlayingProjectionV2Schema = v.pipe(
  NumberTilePlayingProjectionV2ObjectSchema,
  v.check(p => p.placementOrder === undefined || new Set(p.placementOrder).size === p.placementOrder.length && p.placementOrder.every(id => p.playerStates.some(s => s.playerId === id && !s.forfeited && s.rackCount === 0)) && p.playerStates.filter(s => !s.forfeited && !p.placementOrder?.includes(s.playerId)).length >= 2 && p.playerStates.every(s => s.forfeited || p.placementOrder?.includes(s.playerId) || s.rackCount > 0), "Placement state must contain unique completed players and leave active play."),
  v.check(
    (projection) =>
      projection.playerStates.some(
        (player) =>
          player.playerId === projection.turn.activePlayerId &&
          !projection.placementOrder?.includes(player.playerId) &&
          !player.forfeited,
      ),
    "The active Number Tile Player must be eligible.",
  ),
  v.check(
    (projection) => hasPrivateRackSeparatedFromTable(projection),
    "A physical Number Tile cannot appear on the Table and private rack.",
  ),
  v.check(
    (projection) => numberTileProjectionConservesCounts(projection),
    "The Number Tile projection must conserve the physical inventory.",
  ),
);
export type NumberTilePlayingProjectionV2 = v.InferOutput<
  typeof NumberTilePlayingProjectionV2Schema
>;

const NumberTileFinishedProjectionV2ObjectSchema = v.strictObject({
  placementOrder: v.optional(v.array(PlayerIdSchema)),
  gameType: v.literal("NUMBER_TILE"),
  gameId: GameIdSchema,
  gameRevision: GameRevisionSchema,
  remainingPoolCount: NumberTileCountSchema,
  table: NumberTileTableV2Schema,
  playerStates: NumberTilePlayerStatesV2Schema,
  privateState: NumberTilePrivateStateV2Schema,
  result: NumberTileGameResultV2Schema,
});

export const NumberTileFinishedProjectionV2Schema = v.pipe(
  NumberTileFinishedProjectionV2ObjectSchema,
  v.check(p => "rankingMode" in p.result ? p.placementOrder !== undefined && new Set(p.placementOrder).size === p.placementOrder.length && p.placementOrder.every((id,i) => "rankingMode" in p.result && p.result.rankings[i]?.playerId === id && p.result.rankings[i]?.remainingRackCount === 0) : p.placementOrder === undefined, "Number result format must match placement state."),
  v.check(p => {
    if (!("rankingMode" in p.result)) return true;
    const placed = p.placementOrder ?? [];
    if (!placed.every(id => p.playerStates.some(s => s.playerId === id && !s.forfeited && s.rackCount === 0))) return false;
    const remaining = p.playerStates.filter(s => !s.forfeited && !placed.includes(s.playerId));
    return p.result.reason === "STALEMATE" ? remaining.length >= 2 && p.remainingPoolCount === 0
      : remaining.length === 1 && (p.result.reason !== "PLACEMENT_COMPLETE" || placed.length > 0);
  }, "Number terminal placement population must match its finish reason."),
  v.check(
    (projection) => hasPrivateRackSeparatedFromTable(projection),
    "A physical Number Tile cannot appear on the Table and private rack.",
  ),
  v.check(
    (projection) => numberTileProjectionConservesCounts(projection),
    "The Number Tile projection must conserve the physical inventory.",
  ),
  v.check((projection) => {
    const resultEntries =
      "rankingMode" in projection.result || projection.result.reason === "STALEMATE"
        ? projection.result.rankings
        : projection.result.playerResults;
    const playerIds = new Set(
      projection.playerStates.map((player) => player.playerId),
    );
    return (
      resultEntries.length === playerIds.size &&
      resultEntries.every((entry) => {
        const player = projection.playerStates.find(
          (candidate) => candidate.playerId === entry.playerId,
        );
        return (
          player !== undefined &&
          player.rackCount === entry.remainingRackCount &&
          player.forfeited === entry.forfeited
        );
      })
    );
  }, "Finished Number Tile result metadata must match player game state."),
);
export type NumberTileFinishedProjectionV2 = v.InferOutput<
  typeof NumberTileFinishedProjectionV2Schema
>;

import {
  NUMBER_TILE_COLORS,
  deriveNumberTileRun,
  type NumberTileColor,
  type NumberTileNumber,
  type NumberTilePrivateRackTileViewV2,
  type NumberTileTablePlacementV2,
  type NumberTileRunSolution,
} from "@hangul-rummikub/shared";

import type {
  NumberTileDraftMeld,
  NumberTileDraftMeldKind,
  NumberTileDraftPlacement,
} from "./number-tile-turn-draft.js";

export const NUMBER_TILE_COLOR_LABELS: Readonly<
  Record<NumberTileColor, string>
> = Object.freeze({
  RED: "빨강",
  BLUE: "파랑",
  BLACK: "검정",
  ORANGE: "주황",
});

export const NUMBER_TILE_COLOR_MARKERS: Readonly<
  Record<NumberTileColor, string>
> = Object.freeze({
  RED: "R",
  BLUE: "B",
  BLACK: "K",
  ORANGE: "O",
});

const COLOR_ORDER = new Map(
  NUMBER_TILE_COLORS.map((color, index) => [color, index] as const),
);

export type NumberTileRackSortMode = "DEFAULT" | "NUMBER" | "COLOR";

export type NumberTileMeldInterpretation = Readonly<{
  kind: NumberTileDraftMeldKind;
  /** Derived preview only. GROUP colors remain existential and are never stored. */
  jokerRole: Readonly<{
    number: NumberTileNumber;
    color: NumberTileColor | null;
  }> | null;
}>;

export type NumberTileMeldClassification =
  | Readonly<{ status: "INCOMPLETE" }>
  | Readonly<{ status: "INVALID" }>
  | Readonly<{ status: "AMBIGUOUS"; candidates: readonly NumberTileRunSolution[] }>
  | Readonly<{
      status: "VALID";
      interpretation: NumberTileMeldInterpretation;
    }>;

type EffectiveFace = Readonly<{
  number: NumberTileNumber;
  color: NumberTileColor;
}>;

function colorIndex(color: NumberTileColor): number {
  return COLOR_ORDER.get(color) ?? NUMBER_TILE_COLORS.length;
}

function groupInterpretation(
  meld: NumberTileDraftMeld,
): NumberTileMeldInterpretation | null {
  if (meld.tiles.length < 3 || meld.tiles.length > 4) {
    return null;
  }
  const ordinary = meld.tiles.filter((tile) => tile.kind === "ORDINARY");
  const jokerCount = meld.tiles.length - ordinary.length;
  const number = ordinary[0]?.number;
  if (
    number === undefined ||
    jokerCount > 1 ||
    ordinary.some((tile) => tile.number !== number) ||
    new Set(ordinary.map((tile) => tile.color)).size !== ordinary.length ||
    (jokerCount === 1 && ordinary.length >= NUMBER_TILE_COLORS.length)
  ) {
    return null;
  }
  return {
    kind: "GROUP",
    jokerRole: jokerCount === 1 ? { number, color: null } : null,
  };
}

/**
 * Browser-only guidance. The server still resolves physical Tiles and validates
 * the complete proposed Table independently on Submit.
 */
export function classifyNumberTileDraftMeld(
  meld: NumberTileDraftMeld,
): NumberTileMeldClassification {
  const jokerCount = meld.tiles.filter((tile) => tile.kind === "JOKER").length;
  if (
    new Set(meld.tiles.map((tile) => tile.tileId)).size !== meld.tiles.length ||
    jokerCount > 1
  ) {
    return { status: "INVALID" };
  }
  if (meld.tiles.length < 3) {
    return { status: "INCOMPLETE" };
  }

  const group = groupInterpretation(meld);
  if (group !== null) return { status: "VALID", interpretation: group };

  const run = deriveNumberTileRun(meld.tiles.map(tile =>
    tile.kind === "ORDINARY" ? { number: tile.number, color: tile.color } : null,
  ));
  if (run.status !== "VALID") return run;
  const ordinary = meld.tiles.find(tile => tile.kind === "ORDINARY");
  if (ordinary === undefined || ordinary.kind !== "ORDINARY") return { status: "INVALID" };
  return {
    status: "VALID",
    interpretation: {
      kind: "RUN",
      jokerRole: run.solution.jokerNumber === null
        ? null
        : { number: run.solution.jokerNumber, color: ordinary.color },
    },
  };
}

function placementFaceForOrdering(
  placement: NumberTileDraftPlacement,
  interpretation: NumberTileMeldInterpretation,
): EffectiveFace {
  if (placement.kind === "ORDINARY") {
    return { number: placement.number, color: placement.color };
  }
  const role = interpretation.jokerRole;
  if (role === null || role.color === null) {
    throw new Error("A valid Number Tile RUN Joker must have a derived face.");
  }
  return {
    number: role.number,
    color: role.color,
  };
}

function comparePlacement(
  left: NumberTileDraftPlacement,
  right: NumberTileDraftPlacement,
  interpretation: NumberTileMeldInterpretation,
): number {
  if (interpretation.kind === "GROUP") {
    if (left.kind === "JOKER" || right.kind === "JOKER") {
      if (left.kind === right.kind) {
        return String(left.tileId).localeCompare(String(right.tileId));
      }
      return left.kind === "JOKER" ? 1 : -1;
    }
  }
  const leftFace = placementFaceForOrdering(left, interpretation);
  const rightFace = placementFaceForOrdering(right, interpretation);
  const primary = interpretation.kind === "RUN"
    ? leftFace.number - rightFace.number
    : colorIndex(leftFace.color) - colorIndex(rightFace.color);
  if (primary !== 0) {
    return primary;
  }
  const secondary = interpretation.kind === "RUN"
    ? colorIndex(leftFace.color) - colorIndex(rightFace.color)
    : leftFace.number - rightFace.number;
  return secondary !== 0
    ? secondary
    : String(left.tileId).localeCompare(String(right.tileId));
}

/** Unique RUN sets normalize regardless of insertion order. Genuine numeric
 * ambiguity stays unresolved until ordered intent is explicit. No Joker face
 * is persisted, and GROUP Joker color stays neutral. */
export function normalizeNumberTileDraftMeld(
  meld: NumberTileDraftMeld,
): NumberTileDraftMeld {
  const classification = classifyNumberTileDraftMeld(meld);
  if (classification.status !== "VALID") {
    return {
      ...meld,
      kind: null,
    };
  }

  const interpretation = classification.interpretation;
  return {
    ...meld,
    kind: interpretation.kind,
    tiles: [...meld.tiles].sort((left, right) =>
      comparePlacement(left, right, interpretation)
    ),
  };
}

export function numberTileDraftMeldIsValid(
  meld: NumberTileDraftMeld,
): boolean {
  return classifyNumberTileDraftMeld(meld).status === "VALID";
}

/** Display-only initial contribution hint. The server remains authoritative. */
export function numberTileInitialMeldValueHint(
  melds: readonly NumberTileDraftMeld[],
): number {
  return melds.reduce((total, meld) => {
    const classification = classifyNumberTileDraftMeld(meld);
    const jokerNumber = classification.status === "VALID"
      ? classification.interpretation.jokerRole?.number ?? 0
      : 0;
    return total + meld.tiles.reduce((meldTotal, tile) => {
      if (tile.origin !== "SELF_RACK") {
        return meldTotal;
      }
      return meldTotal + (tile.kind === "ORDINARY" ? tile.number : jokerNumber);
    }, 0);
  }, 0);
}

export function sortNumberTileRackTiles(
  tiles: readonly NumberTilePrivateRackTileViewV2[],
  mode: NumberTileRackSortMode,
): readonly NumberTilePrivateRackTileViewV2[] {
  if (mode === "DEFAULT") {
    return [...tiles];
  }

  return tiles
    .map((tile, canonicalIndex) => ({ tile, canonicalIndex }))
    .sort((left, right) => {
      if (left.tile.kind === "JOKER" || right.tile.kind === "JOKER") {
        if (left.tile.kind === right.tile.kind) {
          return left.canonicalIndex - right.canonicalIndex;
        }
        return left.tile.kind === "JOKER" ? 1 : -1;
      }

      const primary = mode === "NUMBER"
        ? left.tile.number - right.tile.number
        : colorIndex(left.tile.color) - colorIndex(right.tile.color);
      if (primary !== 0) {
        return primary;
      }
      const secondary = mode === "NUMBER"
        ? colorIndex(left.tile.color) - colorIndex(right.tile.color)
        : left.tile.number - right.tile.number;
      return secondary !== 0
        ? secondary
        : left.canonicalIndex - right.canonicalIndex;
    })
    .map(({ tile }) => tile);
}

export function numberTilePlacementLabel(
  tile:
    | NumberTilePrivateRackTileViewV2
    | NumberTileTablePlacementV2
    | NumberTileDraftPlacement,
): string {
  if (tile.kind === "ORDINARY") {
    return `${NUMBER_TILE_COLOR_LABELS[tile.color]} ${tile.number}`;
  }
  return "조커";
}

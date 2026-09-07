import {
  NUMBER_TILE_COLORS,
  NUMBER_TILE_NUMBERS,
  type NumberTileColor,
  type NumberTileNumber,
  type NumberTilePrivateRackTileViewV2,
  type NumberTileTablePlacementV2,
} from "@hangul-rummikub/shared";

import type {
  NumberTileDraftJokerPlacement,
  NumberTileDraftMeld,
  NumberTileDraftMeldKind,
  NumberTileDraftPlacement,
  NumberTileJokerAssignment,
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
  jokerAssignment: NumberTileJokerAssignment | null;
}>;

export type NumberTileMeldClassification =
  | Readonly<{ status: "INCOMPLETE" }>
  | Readonly<{ status: "INVALID" }>
  | Readonly<{
      status: "AMBIGUOUS_JOKER";
      interpretations: readonly NumberTileMeldInterpretation[];
    }>
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

function effectiveFace(
  placement: NumberTileDraftPlacement,
  inferredAssignment: NumberTileJokerAssignment | null,
): EffectiveFace | null {
  if (placement.kind === "ORDINARY") {
    return { number: placement.number, color: placement.color };
  }
  const assignment = placement.assignment ?? inferredAssignment;
  return assignment === null ? null : assignment;
}

function isGroup(faces: readonly EffectiveFace[]): boolean {
  return (
    faces.length >= 3 &&
    faces.length <= 4 &&
    faces.every((face) => face.number === faces[0]?.number) &&
    new Set(faces.map((face) => face.color)).size === faces.length
  );
}

function isRun(faces: readonly EffectiveFace[]): boolean {
  if (faces.length < 3) {
    return false;
  }
  const sorted = [...faces].sort((left, right) => left.number - right.number);
  return (
    sorted.every((face) => face.color === sorted[0]?.color) &&
    sorted.every(
      (face, index) =>
        index === 0 || face.number === sorted[index - 1]!.number + 1,
    )
  );
}

function interpretationsFor(
  meld: NumberTileDraftMeld,
  jokerAssignment: NumberTileJokerAssignment | null,
): readonly NumberTileMeldInterpretation[] {
  const faces = meld.tiles.map((tile) => effectiveFace(tile, jokerAssignment));
  if (faces.some((face) => face === null)) {
    return [];
  }
  const resolvedFaces = faces as readonly EffectiveFace[];
  const interpretations: NumberTileMeldInterpretation[] = [];
  if (isGroup(resolvedFaces)) {
    interpretations.push({ kind: "GROUP", jokerAssignment });
  }
  if (isRun(resolvedFaces)) {
    interpretations.push({ kind: "RUN", jokerAssignment });
  }
  return interpretations;
}

function allJokerInterpretations(
  meld: NumberTileDraftMeld,
): readonly NumberTileMeldInterpretation[] {
  const withoutClaimedAssignment: NumberTileDraftMeld = {
    ...meld,
    tiles: meld.tiles.map((tile) =>
      tile.kind === "JOKER"
        ? { ...tile, assignment: null, assignmentSource: null }
        : tile
    ),
  };
  const interpretations: NumberTileMeldInterpretation[] = [];
  for (const color of NUMBER_TILE_COLORS) {
    for (const number of NUMBER_TILE_NUMBERS) {
      interpretations.push(
        ...interpretationsFor(withoutClaimedAssignment, { color, number }),
      );
    }
  }
  return interpretations;
}

/**
 * Browser-only guidance. The server still resolves physical Tiles and validates
 * the complete proposed Table independently on Submit.
 */
export function classifyNumberTileDraftMeld(
  meld: NumberTileDraftMeld,
): NumberTileMeldClassification {
  const jokers = meld.tiles.filter(
    (tile): tile is NumberTileDraftJokerPlacement => tile.kind === "JOKER",
  );
  if (
    new Set(meld.tiles.map((tile) => tile.tileId)).size !== meld.tiles.length ||
    jokers.length > 1
  ) {
    return { status: "INVALID" };
  }
  if (meld.tiles.length < 3) {
    return { status: "INCOMPLETE" };
  }

  const joker = jokers[0];
  if (joker === undefined) {
    const interpretations = interpretationsFor(meld, null);
    return interpretations.length === 1
      ? { status: "VALID", interpretation: interpretations[0]! }
      : { status: "INVALID" };
  }

  if (joker.assignment !== null) {
    const assignedInterpretations = interpretationsFor(
      meld,
      joker.assignment,
    );
    if (assignedInterpretations.length === 1) {
      return {
        status: "VALID",
        interpretation: assignedInterpretations[0]!,
      };
    }
  }

  const interpretations = allJokerInterpretations(meld);
  if (interpretations.length === 0) {
    return { status: "INVALID" };
  }
  if (interpretations.length === 1) {
    return { status: "VALID", interpretation: interpretations[0]! };
  }
  return {
    status: "AMBIGUOUS_JOKER",
    interpretations: Object.freeze(interpretations),
  };
}

function placementFaceForOrdering(
  placement: NumberTileDraftPlacement,
  interpretation: NumberTileMeldInterpretation,
): EffectiveFace {
  const face = effectiveFace(placement, interpretation.jokerAssignment);
  if (face === null) {
    throw new Error("A valid Number Tile interpretation must resolve every face.");
  }
  return face;
}

function comparePlacement(
  left: NumberTileDraftPlacement,
  right: NumberTileDraftPlacement,
  interpretation: NumberTileMeldInterpretation,
): number {
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

/** Clears stale inferred values, applies only a unique Joker inference, and
 * orders valid melds for readable display and the existing RUN wire contract. */
export function normalizeNumberTileDraftMeld(
  meld: NumberTileDraftMeld,
): NumberTileDraftMeld {
  const withoutStaleInference: NumberTileDraftMeld = {
    ...meld,
    tiles: meld.tiles.map((tile) =>
      tile.kind === "JOKER" && tile.assignmentSource === "INFERRED"
        ? { ...tile, assignment: null, assignmentSource: null }
        : tile,
    ),
  };
  const classification = classifyNumberTileDraftMeld(withoutStaleInference);
  if (classification.status !== "VALID") {
    const shouldClearInvalidAssignment =
      classification.status === "AMBIGUOUS_JOKER" ||
      classification.status === "INVALID";
    return {
      ...withoutStaleInference,
      kind: null,
      tiles: shouldClearInvalidAssignment
        ? withoutStaleInference.tiles.map((tile) =>
            tile.kind === "JOKER"
              ? { ...tile, assignment: null, assignmentSource: null }
              : tile
          )
        : withoutStaleInference.tiles,
    };
  }

  const interpretation = classification.interpretation;
  const withInference = withoutStaleInference.tiles.map((tile) =>
    tile.kind !== "JOKER" || interpretation.jokerAssignment === null
      ? tile
      : tile.assignment?.number === interpretation.jokerAssignment.number &&
          tile.assignment.color === interpretation.jokerAssignment.color
        ? tile
        : {
            ...tile,
            assignment: { ...interpretation.jokerAssignment },
            assignmentSource: "INFERRED" as const,
          },
  );
  return {
    ...withoutStaleInference,
    kind: interpretation.kind,
    tiles: [...withInference].sort((left, right) =>
      comparePlacement(left, right, interpretation)
    ),
  };
}

export function numberTileDraftMeldIsValid(
  meld: NumberTileDraftMeld,
): boolean {
  return classifyNumberTileDraftMeld(meld).status === "VALID";
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
  const assignment = "assignment" in tile
    ? tile.assignment
    : "assignedNumber" in tile
      ? { number: tile.assignedNumber, color: tile.assignedColor }
      : null;
  if (assignment === null) {
    return "조커";
  }
  return `조커, ${NUMBER_TILE_COLOR_LABELS[assignment.color]} ${assignment.number}으로 사용 중`;
}

export function interpretationKey(
  interpretation: NumberTileMeldInterpretation,
): string {
  const assignment = interpretation.jokerAssignment;
  return assignment === null
    ? interpretation.kind
    : `${interpretation.kind}:${assignment.color}:${assignment.number}`;
}

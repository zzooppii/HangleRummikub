import type { TileId } from "@hangul-rummikub/shared";

import {
  cloneNumberTile,
  isNumberTileColor,
  isNumberTileNumber,
  type NumberTile,
  type NumberTileColor,
  type NumberTileNumber,
} from "./tile.js";
import {
  cloneNumberTileTable,
  type NumberTileMeld,
  type NumberTilePlacement,
  type NumberTileProposedTable,
  type NumberTileTable,
} from "./table.js";

export const NUMBER_TILE_INITIAL_MELD_MINIMUM_VALUE = 30;

export const NUMBER_TILE_RULE_FAILURE_CODES = [
  "INVALID_MELD",
  "DUPLICATE_TILE_REFERENCE",
  "INVALID_TILE_ACCESS",
  "TILE_CONSERVATION_FAILED",
  "INITIAL_MELD_REQUIRED",
  "INITIAL_MELD_TOO_LOW",
  "TABLE_REARRANGEMENT_NOT_ALLOWED",
  "NO_NEW_RACK_TILE",
  "INVALID_JOKER_ASSIGNMENT",
  "INVALID_JOKER_RECOVERY",
] as const;

export type NumberTileRuleFailureCode =
  (typeof NUMBER_TILE_RULE_FAILURE_CODES)[number];

export type NumberTileRuleFailure = Readonly<{
  code: NumberTileRuleFailureCode;
}>;

export type NumberTileRuleResult<TValue> =
  | Readonly<{ ok: true; value: TValue }>
  | Readonly<{ ok: false; error: NumberTileRuleFailure }>;

export type NumberTileMeldValidation = Readonly<{
  value: number;
}>;

export type ValidateNumberTileSubmitInput = Readonly<{
  canonicalTable: NumberTileTable;
  proposedTable: NumberTileProposedTable;
  tilesById: ReadonlyMap<TileId, NumberTile>;
  actorRackTileIds: readonly TileId[];
  initialMeldCompleted: boolean;
}>;

export type ValidatedNumberTileSubmit = Readonly<{
  table: NumberTileTable;
  newlyUsedRackTileIds: readonly TileId[];
  remainingRackTileIds: readonly TileId[];
  recoveredJokerTileIds: readonly TileId[];
  completesInitialMeld: boolean;
  initialMeldValue: number | null;
}>;

type EffectiveFace = Readonly<{
  number: NumberTileNumber;
  color: NumberTileColor;
}>;

function success<TValue>(value: TValue): NumberTileRuleResult<TValue> {
  return Object.freeze({ ok: true, value });
}

function failure<TValue>(
  code: NumberTileRuleFailureCode,
): NumberTileRuleResult<TValue> {
  return Object.freeze({ ok: false, error: Object.freeze({ code }) });
}

function tileIdsInTable(table: NumberTileTable | NumberTileProposedTable) {
  return table.melds.flatMap((meld) =>
    meld.tiles.map((placement) => placement.tileId),
  );
}

function placementFace(
  placement: NumberTilePlacement,
  tilesById: ReadonlyMap<TileId, NumberTile>,
): NumberTileRuleResult<EffectiveFace> {
  const tile = tilesById.get(placement.tileId);
  if (tile === undefined) {
    return failure("INVALID_TILE_ACCESS");
  }

  if (tile.tileId !== placement.tileId) {
    throw new Error("Canonical Number Tile lookup key does not match tileId.");
  }
  const canonicalTile = cloneNumberTile(tile);

  if (canonicalTile.kind === "ORDINARY") {
    if (
      placement.kind !== "ORDINARY" ||
      "assignedNumber" in placement ||
      "assignedColor" in placement
    ) {
      return failure("INVALID_JOKER_ASSIGNMENT");
    }
    return success(
      Object.freeze({
        number: canonicalTile.number,
        color: canonicalTile.color,
      }),
    );
  }

  if (
    placement.kind !== "JOKER" ||
    !isNumberTileNumber(placement.assignedNumber) ||
    !isNumberTileColor(placement.assignedColor)
  ) {
    return failure("INVALID_JOKER_ASSIGNMENT");
  }

  return success(
    Object.freeze({
      number: placement.assignedNumber,
      color: placement.assignedColor,
    }),
  );
}

export function validateNumberTileMeld(
  meld: NumberTileMeld,
  tilesById: ReadonlyMap<TileId, NumberTile>,
): NumberTileRuleResult<NumberTileMeldValidation> {
  const tileIds = meld.tiles.map((placement) => placement.tileId);
  if (new Set(tileIds).size !== tileIds.length) {
    return failure("DUPLICATE_TILE_REFERENCE");
  }

  if (meld.kind !== "GROUP" && meld.kind !== "RUN") {
    return failure("INVALID_MELD");
  }

  const jokerCount = meld.tiles.filter(
    (placement) => placement.kind === "JOKER",
  ).length;
  if (jokerCount > 1) {
    return failure("INVALID_MELD");
  }

  const faces: EffectiveFace[] = [];
  for (const placement of meld.tiles) {
    const faceResult = placementFace(placement, tilesById);
    if (!faceResult.ok) {
      return faceResult;
    }
    faces.push(faceResult.value);
  }

  if (meld.kind === "GROUP") {
    if (faces.length < 3 || faces.length > 4) {
      return failure("INVALID_MELD");
    }
    const expectedNumber = faces[0]!.number;
    if (
      faces.some((face) => face.number !== expectedNumber) ||
      new Set(faces.map((face) => face.color)).size !== faces.length
    ) {
      return failure("INVALID_MELD");
    }
  } else {
    if (faces.length < 3) {
      return failure("INVALID_MELD");
    }
    const expectedColor = faces[0]!.color;
    if (faces.some((face) => face.color !== expectedColor)) {
      return failure("INVALID_MELD");
    }
    for (let index = 1; index < faces.length; index += 1) {
      if (faces[index]!.number !== faces[index - 1]!.number + 1) {
        return failure("INVALID_MELD");
      }
    }
  }

  return success(
    Object.freeze({
      value: faces.reduce((total, face) => total + face.number, 0),
    }),
  );
}

function validateCompleteTable(
  table: NumberTileTable | NumberTileProposedTable,
  tilesById: ReadonlyMap<TileId, NumberTile>,
): NumberTileRuleResult<null> {
  const allTileIds = tileIdsInTable(table);
  if (new Set(allTileIds).size !== allTileIds.length) {
    return failure("DUPLICATE_TILE_REFERENCE");
  }

  for (const meld of table.melds) {
    const result = validateNumberTileMeld(meld, tilesById);
    if (!result.ok) {
      return result;
    }
  }
  return success(null);
}

function assertCanonicalInput(input: ValidateNumberTileSubmitInput): void {
  const canonicalResult = validateCompleteTable(
    input.canonicalTable,
    input.tilesById,
  );
  if (!canonicalResult.ok) {
    throw new Error(
      `Invalid canonical Number Table: ${canonicalResult.error.code}.`,
    );
  }

  const tableIds = new Set(tileIdsInTable(input.canonicalTable));
  const rackIds = new Set<TileId>();
  for (const tileId of input.actorRackTileIds) {
    if (rackIds.has(tileId)) {
      throw new Error("Canonical Number rack contains a duplicate Tile ID.");
    }
    rackIds.add(tileId);

    const tile = input.tilesById.get(tileId);
    if (tile === undefined || tile.tileId !== tileId) {
      throw new Error("Canonical Number rack references an invalid Tile.");
    }
    cloneNumberTile(tile);
    if (tableIds.has(tileId)) {
      throw new Error("A canonical Number Tile cannot be in rack and Table.");
    }
  }

  for (const tileId of tableIds) {
    const tile = input.tilesById.get(tileId);
    if (tile === undefined || tile.tileId !== tileId) {
      throw new Error("Canonical Number Table references an invalid Tile.");
    }
  }
}

function placementSignature(placement: NumberTilePlacement): string {
  return placement.kind === "JOKER"
    ? JSON.stringify([
        placement.kind,
        placement.tileId,
        placement.assignedColor,
        placement.assignedNumber,
      ])
    : JSON.stringify([placement.kind, placement.tileId]);
}

function meldSignature(meld: NumberTileMeld): string {
  const placements = meld.tiles.map(placementSignature);
  if (meld.kind === "GROUP") {
    placements.sort();
  }
  return JSON.stringify([meld.kind, placements]);
}

function initialNewMelds(
  canonicalTable: NumberTileTable,
  proposedTable: NumberTileProposedTable,
): readonly NumberTileMeld[] | null {
  const remainingSignatures = new Map<string, number>();
  for (const meld of canonicalTable.melds) {
    const signature = meldSignature(meld);
    remainingSignatures.set(
      signature,
      (remainingSignatures.get(signature) ?? 0) + 1,
    );
  }

  const newMelds: NumberTileMeld[] = [];
  for (const meld of proposedTable.melds) {
    const signature = meldSignature(meld);
    const remaining = remainingSignatures.get(signature) ?? 0;
    if (remaining > 0) {
      remainingSignatures.set(signature, remaining - 1);
    } else {
      newMelds.push(meld);
    }
  }

  return [...remainingSignatures.values()].some((count) => count !== 0)
    ? null
    : newMelds;
}

function faceKey(face: EffectiveFace): string {
  return `${face.color}:${face.number}`;
}

function validateJokerRecovery(
  canonicalTable: NumberTileTable,
  proposedTable: NumberTileProposedTable,
  tilesById: ReadonlyMap<TileId, NumberTile>,
  newlyUsedRackTileIds: readonly TileId[],
): NumberTileRuleResult<readonly TileId[]> {
  const finalPlacementsById = new Map(
    proposedTable.melds.flatMap((meld) =>
      meld.tiles.map((placement) => [placement.tileId, placement] as const),
    ),
  );
  const replacementSupply = new Map<string, number>();
  for (const tileId of newlyUsedRackTileIds) {
    const tile = tilesById.get(tileId);
    if (tile?.kind === "ORDINARY") {
      const key = faceKey(tile);
      replacementSupply.set(key, (replacementSupply.get(key) ?? 0) + 1);
    }
  }

  const recoveredJokerTileIds: TileId[] = [];
  for (const oldPlacement of canonicalTable.melds.flatMap(
    (meld) => meld.tiles,
  )) {
    if (oldPlacement.kind !== "JOKER") {
      continue;
    }
    const finalPlacement = finalPlacementsById.get(oldPlacement.tileId);
    if (finalPlacement?.kind !== "JOKER") {
      return failure("INVALID_JOKER_RECOVERY");
    }
    if (
      finalPlacement.assignedNumber === oldPlacement.assignedNumber &&
      finalPlacement.assignedColor === oldPlacement.assignedColor
    ) {
      continue;
    }

    const oldFaceKey = faceKey({
      number: oldPlacement.assignedNumber,
      color: oldPlacement.assignedColor,
    });
    const available = replacementSupply.get(oldFaceKey) ?? 0;
    if (available === 0) {
      return failure("INVALID_JOKER_RECOVERY");
    }
    replacementSupply.set(oldFaceKey, available - 1);
    recoveredJokerTileIds.push(oldPlacement.tileId);
  }

  return success(Object.freeze(recoveredJokerTileIds));
}

export function validateNumberTileSubmit(
  input: ValidateNumberTileSubmitInput,
): NumberTileRuleResult<ValidatedNumberTileSubmit> {
  assertCanonicalInput(input);

  const proposedTileIds = tileIdsInTable(input.proposedTable);
  if (new Set(proposedTileIds).size !== proposedTileIds.length) {
    return failure("DUPLICATE_TILE_REFERENCE");
  }

  const canonicalTileIds = new Set(tileIdsInTable(input.canonicalTable));
  const actorRackTileIds = new Set(input.actorRackTileIds);
  if (
    proposedTileIds.some(
      (tileId) =>
        !canonicalTileIds.has(tileId) && !actorRackTileIds.has(tileId),
    )
  ) {
    return failure("INVALID_TILE_ACCESS");
  }

  if (
    [...canonicalTileIds].some(
      (tileId) => !proposedTileIds.includes(tileId),
    )
  ) {
    return failure("TILE_CONSERVATION_FAILED");
  }

  const tableValidation = validateCompleteTable(
    input.proposedTable,
    input.tilesById,
  );
  if (!tableValidation.ok) {
    return tableValidation;
  }

  const proposedTileIdSet = new Set(proposedTileIds);
  const newlyUsedRackTileIds = Object.freeze(
    input.actorRackTileIds.filter((tileId) => proposedTileIdSet.has(tileId)),
  );
  const remainingRackTileIds = Object.freeze(
    input.actorRackTileIds.filter((tileId) => !proposedTileIdSet.has(tileId)),
  );

  let initialMeldValue: number | null = null;
  let recoveredJokerTileIds: readonly TileId[] = Object.freeze([]);
  if (!input.initialMeldCompleted) {
    const newMelds = initialNewMelds(
      input.canonicalTable,
      input.proposedTable,
    );
    if (newMelds === null) {
      return failure("TABLE_REARRANGEMENT_NOT_ALLOWED");
    }
    if (newMelds.length === 0) {
      return failure("INITIAL_MELD_REQUIRED");
    }
    if (
      newMelds.some((meld) =>
        meld.tiles.some(
          (placement) => !actorRackTileIds.has(placement.tileId),
        ),
      )
    ) {
      return failure("TABLE_REARRANGEMENT_NOT_ALLOWED");
    }

    initialMeldValue = 0;
    for (const meld of newMelds) {
      const meldResult = validateNumberTileMeld(meld, input.tilesById);
      if (!meldResult.ok) {
        return meldResult;
      }
      initialMeldValue += meldResult.value.value;
    }
    if (initialMeldValue < NUMBER_TILE_INITIAL_MELD_MINIMUM_VALUE) {
      return failure("INITIAL_MELD_TOO_LOW");
    }
  } else {
    const recoveryResult = validateJokerRecovery(
      input.canonicalTable,
      input.proposedTable,
      input.tilesById,
      newlyUsedRackTileIds,
    );
    if (!recoveryResult.ok) {
      return recoveryResult;
    }
    recoveredJokerTileIds = recoveryResult.value;
    if (newlyUsedRackTileIds.length === 0) {
      return failure("NO_NEW_RACK_TILE");
    }
  }

  return success(
    Object.freeze({
      table: cloneNumberTileTable(input.proposedTable),
      newlyUsedRackTileIds,
      remainingRackTileIds,
      recoveredJokerTileIds,
      completesInitialMeld: !input.initialMeldCompleted,
      initialMeldValue,
    }),
  );
}

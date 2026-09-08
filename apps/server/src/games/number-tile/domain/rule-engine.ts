import { deriveNumberTileRun, type TileId } from "@hangul-rummikub/shared";

import {
  cloneNumberTile,
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

function canonicalTileForPlacement(
  placement: NumberTilePlacement,
  tilesById: ReadonlyMap<TileId, NumberTile>,
): NumberTileRuleResult<NumberTile> {
  const tile = tilesById.get(placement.tileId);
  if (tile === undefined) {
    return failure("INVALID_TILE_ACCESS");
  }

  if (tile.tileId !== placement.tileId) {
    throw new Error("Canonical Number Tile lookup key does not match tileId.");
  }
  const canonicalTile = cloneNumberTile(tile);

  if (
    placement.kind !== canonicalTile.kind ||
    "assignedNumber" in placement ||
    "assignedColor" in placement
  ) {
    return failure("INVALID_JOKER_ASSIGNMENT");
  }
  return success(canonicalTile);
}

/** Validates canonical physical faces, then orders only an unambiguous RUN. */
export function normalizeNumberTileMeld(
  meld: NumberTileMeld,
  tilesById: ReadonlyMap<TileId, NumberTile>,
): NumberTileRuleResult<Readonly<{ value: number; meld: NumberTileMeld }>> {
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

  const ordinaryFaces: EffectiveFace[] = [];
  const faces: Array<EffectiveFace | null> = [];
  for (const placement of meld.tiles) {
    const tileResult = canonicalTileForPlacement(placement, tilesById);
    if (!tileResult.ok) {
      return tileResult;
    }
    if (tileResult.value.kind === "ORDINARY") {
      const face = Object.freeze({ number: tileResult.value.number, color: tileResult.value.color });
      faces.push(face);
      ordinaryFaces.push(face);
    } else {
      faces.push(null);
    }
  }

  if (meld.kind === "GROUP") {
    if (
      meld.tiles.length < 3 ||
      meld.tiles.length > 4 ||
      ordinaryFaces.length === 0
    ) {
      return failure("INVALID_MELD");
    }
    const expectedNumber = ordinaryFaces[0]!.number;
    if (
      ordinaryFaces.some((face) => face.number !== expectedNumber) ||
      new Set(ordinaryFaces.map((face) => face.color)).size !==
        ordinaryFaces.length
    ) {
      return failure("INVALID_MELD");
    }
    return success(
      Object.freeze({ value: expectedNumber * meld.tiles.length, meld }),
    );
  } else {
    const derived = deriveNumberTileRun(faces);
    if (derived.status !== "VALID") {
      // An ambiguous unordered edge Joker must not silently choose its value.
      return failure("INVALID_MELD");
    }
    return success(
      Object.freeze({
        value: derived.solution.value,
        meld: Object.freeze({
          kind: "RUN" as const,
          tiles: Object.freeze(derived.solution.orderedIndices.map((index) => meld.tiles[index]!)),
        }),
      }),
    );
  }
}

export function validateNumberTileMeld(
  meld: NumberTileMeld,
  tilesById: ReadonlyMap<TileId, NumberTile>,
): NumberTileRuleResult<NumberTileMeldValidation> {
  const result = normalizeNumberTileMeld(meld, tilesById);
  return result.ok ? success(Object.freeze({ value: result.value.value })) : result;
}

function normalizeCompleteTable(
  table: NumberTileTable | NumberTileProposedTable,
  tilesById: ReadonlyMap<TileId, NumberTile>,
): NumberTileRuleResult<NumberTileTable> {
  const allTileIds = tileIdsInTable(table);
  if (new Set(allTileIds).size !== allTileIds.length) {
    return failure("DUPLICATE_TILE_REFERENCE");
  }

  const melds: NumberTileMeld[] = [];
  for (const meld of table.melds) {
    const result = normalizeNumberTileMeld(meld, tilesById);
    if (!result.ok) {
      return result;
    }
    melds.push(result.value.meld);
  }
  return success(cloneNumberTileTable({ melds }));
}

function assertCanonicalInput(input: ValidateNumberTileSubmitInput): void {
  const canonicalResult = normalizeCompleteTable(
    input.canonicalTable,
    input.tilesById,
  );
  if (!canonicalResult.ok) {
    throw new Error(
      `Invalid canonical Number Table: ${canonicalResult.error.code}.`,
    );
  }
  if (input.canonicalTable.melds.some((meld, index) =>
    meld.kind === "RUN" && meld.tiles.some((tile, tileIndex) =>
      tile.tileId !== canonicalResult.value.melds[index]!.tiles[tileIndex]!.tileId))) {
    throw new Error("Invalid canonical Number Table: RUN order is not normalized.");
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
  return JSON.stringify([placement.kind, placement.tileId]);
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

  const tableValidation = normalizeCompleteTable(
    input.proposedTable,
    input.tilesById,
  );
  if (!tableValidation.ok) {
    return tableValidation;
  }
  const normalizedProposedTable = tableValidation.value;

  const proposedTileIdSet = new Set(proposedTileIds);
  const newlyUsedRackTileIds = Object.freeze(
    input.actorRackTileIds.filter((tileId) => proposedTileIdSet.has(tileId)),
  );
  const remainingRackTileIds = Object.freeze(
    input.actorRackTileIds.filter((tileId) => !proposedTileIdSet.has(tileId)),
  );

  let initialMeldValue: number | null = null;
  if (!input.initialMeldCompleted) {
    const newMelds = initialNewMelds(
      input.canonicalTable,
      normalizedProposedTable,
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
  } else if (newlyUsedRackTileIds.length === 0) {
    return failure("NO_NEW_RACK_TILE");
  }

  return success(
    Object.freeze({
      table: normalizedProposedTable,
      newlyUsedRackTileIds,
      remainingRackTileIds,
      completesInitialMeld: !input.initialMeldCompleted,
      initialMeldValue,
    }),
  );
}

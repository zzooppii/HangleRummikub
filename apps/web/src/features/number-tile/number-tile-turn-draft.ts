import type {
  GameId,
  GameRevision,
  NumberTileColor,
  NumberTileNumber,
  NumberTilePlayingPlatformSnapshotV2,
  NumberTilePrivateRackTileViewV2,
  NumberTileTablePlacementV2,
  NumberTileTableV2,
  PlatformSnapshotV2,
  TileId,
  TurnId,
} from "@hangul-rummikub/shared";

import { isSameGameplayIdentity } from "../../lib/gameplay-identity.js";
import { normalizeNumberTileDraftMeld } from "./number-tile-ux.js";

export const NUMBER_TILE_TURN_DRAFT_HISTORY_LIMIT = 50;

export type NumberTileDraftMode = "INITIAL_MELD" | "REARRANGEMENT";
export type NumberTileDraftMeldKind = "GROUP" | "RUN";
export type NumberTileDraftTileOrigin = "CANONICAL_TABLE" | "SELF_RACK";

export type NumberTileDraftOrdinaryPlacement = Readonly<{
  tileId: TileId;
  kind: "ORDINARY";
  number: NumberTileNumber;
  color: NumberTileColor;
  origin: NumberTileDraftTileOrigin;
}>;

export type NumberTileJokerAssignment = Readonly<{
  number: NumberTileNumber;
  color: NumberTileColor;
}>;

export type NumberTileDraftJokerPlacement = Readonly<{
  tileId: TileId;
  kind: "JOKER";
  /** Null is intentionally allowed while the browser draft is incomplete. */
  assignment: NumberTileJokerAssignment | null;
  assignmentSource: "CANONICAL" | "INFERRED" | "USER" | null;
  origin: NumberTileDraftTileOrigin;
}>;

export type NumberTileDraftPlacement =
  | NumberTileDraftOrdinaryPlacement
  | NumberTileDraftJokerPlacement;

export type NumberTileDraftMeld = Readonly<{
  /** Canonical melds arrive classified; local/in-progress melds may be null. */
  kind: NumberTileDraftMeldKind | null;
  origin: "CANONICAL_TABLE" | "LOCAL";
  /** May be empty, short, or otherwise invalid until the server validates Submit. */
  tiles: readonly NumberTileDraftPlacement[];
}>;

export type NumberTileDraftTable = Readonly<{
  /** This is the complete proposed Table, including every pre-turn Table Tile. */
  melds: readonly NumberTileDraftMeld[];
}>;

type NumberTileDraftPresent = Readonly<{
  table: NumberTileDraftTable;
  availableRackTiles: readonly NumberTilePrivateRackTileViewV2[];
}>;

export type NumberTileTurnDraft = Readonly<{
  baseGameId: GameId;
  baseGameRevision: GameRevision;
  baseTurnId: TurnId;
  mode: NumberTileDraftMode;
  table: NumberTileDraftTable;
  availableRackTiles: readonly NumberTilePrivateRackTileViewV2[];
  /** Immutable catalog used to restore the authoritative rack order. */
  rackTiles: readonly NumberTilePrivateRackTileViewV2[];
  canonicalTableTileIds: readonly TileId[];
  baseline: NumberTileDraftPresent;
  history: readonly NumberTileDraftPresent[];
}>;

export type NumberTileDraftTileLocation =
  | Readonly<{
      source: "AVAILABLE_RACK";
      tile: NumberTilePrivateRackTileViewV2;
      rackIndex: number;
    }>
  | Readonly<{
      source: "TABLE";
      tile: NumberTileDraftPlacement;
      meldIndex: number;
      tileIndex: number;
    }>;

export type NumberTileDraftTarget = Readonly<{
  meldIndex: number;
  /** Final zero-based insertion index after the source Tile is removed. */
  tileIndex: number;
}>;

export type NumberTileTurnDraftEditErrorCode =
  | "MELD_NOT_FOUND"
  | "MELD_NOT_EMPTY"
  | "INVALID_TARGET"
  | "TILE_NOT_FOUND"
  | "TILE_NOT_JOKER"
  | "JOKER_NOT_ON_TABLE"
  | "INITIAL_MELD_TABLE_LOCKED"
  | "CANONICAL_TILE_CANNOT_RETURN_TO_RACK"
  | "NO_UNDO_HISTORY";

export type NumberTileTurnDraftEditResult =
  | Readonly<{ ok: true; draft: NumberTileTurnDraft }>
  | Readonly<{
      ok: false;
      error: Readonly<{ code: NumberTileTurnDraftEditErrorCode }>;
    }>;

export type NumberTileTurnDraftReconciliationDecision =
  | "KEEP_DRAFT"
  | "RESET_DRAFT";

function cloneRackTile(
  tile: NumberTilePrivateRackTileViewV2,
): NumberTilePrivateRackTileViewV2 {
  return { ...tile };
}

function cloneAssignment(
  assignment: NumberTileJokerAssignment | null,
): NumberTileJokerAssignment | null {
  return assignment === null ? null : { ...assignment };
}

function clonePlacement(
  placement: NumberTileDraftPlacement,
): NumberTileDraftPlacement {
  return placement.kind === "JOKER"
    ? { ...placement, assignment: cloneAssignment(placement.assignment) }
    : { ...placement };
}

function cloneMeld(meld: NumberTileDraftMeld): NumberTileDraftMeld {
  return { ...meld, tiles: meld.tiles.map(clonePlacement) };
}

function cloneTable(table: NumberTileDraftTable): NumberTileDraftTable {
  return { melds: table.melds.map(cloneMeld) };
}

function clonePresent(present: NumberTileDraftPresent): NumberTileDraftPresent {
  return {
    table: cloneTable(present.table),
    availableRackTiles: present.availableRackTiles.map(cloneRackTile),
  };
}

function canonicalPlacement(
  placement: NumberTileTablePlacementV2,
): NumberTileDraftPlacement {
  if (placement.kind === "JOKER") {
    return {
      tileId: placement.tileId,
      kind: "JOKER",
      assignment: {
        number: placement.assignedNumber,
        color: placement.assignedColor,
      },
      assignmentSource: "CANONICAL",
      origin: "CANONICAL_TABLE",
    };
  }

  return {
    ...placement,
    origin: "CANONICAL_TABLE",
  };
}

function canonicalTable(table: NumberTileTableV2): NumberTileDraftTable {
  return {
    melds: table.melds.map((meld) => ({
      kind: meld.kind,
      origin: "CANONICAL_TABLE",
      tiles: meld.tiles.map(canonicalPlacement),
    })),
  };
}

function tableTileIds(table: NumberTileDraftTable): readonly TileId[] {
  return table.melds.flatMap((meld) =>
    meld.tiles.map((placement) => placement.tileId),
  );
}

function hasUniqueTileIdentity(
  table: NumberTileDraftTable,
  rack: readonly NumberTilePrivateRackTileViewV2[],
): boolean {
  const tileIds = [
    ...tableTileIds(table),
    ...rack.map((tile) => tile.tileId),
  ];
  return new Set(tileIds).size === tileIds.length;
}

/** Creates an active Player's detached, browser-memory-only Number Tile draft. */
export function createNumberTileTurnDraft(
  snapshot: NumberTilePlayingPlatformSnapshotV2,
  isCurrentCommandSession = true,
): NumberTileTurnDraft | null {
  if (
    !isCurrentCommandSession ||
    snapshot.self.playerId !== snapshot.game.turn.activePlayerId
  ) {
    return null;
  }

  const selfState = snapshot.game.playerStates.find(
    (player) => player.playerId === snapshot.self.playerId,
  );
  if (selfState === undefined) {
    return null;
  }

  const table = canonicalTable(snapshot.game.table);
  const rackTiles = snapshot.game.privateState.rack.map(cloneRackTile);
  if (!hasUniqueTileIdentity(table, rackTiles)) {
    return null;
  }

  const baseline = clonePresent({ table, availableRackTiles: rackTiles });
  return {
    baseGameId: snapshot.game.gameId,
    baseGameRevision: snapshot.game.gameRevision,
    baseTurnId: snapshot.game.turn.turnId,
    mode: selfState.initialMeldCompleted
      ? "REARRANGEMENT"
      : "INITIAL_MELD",
    table: cloneTable(baseline.table),
    availableRackTiles: baseline.availableRackTiles.map(cloneRackTile),
    rackTiles: rackTiles.map(cloneRackTile),
    canonicalTableTileIds: [...tableTileIds(table)],
    baseline,
    history: [],
  };
}

function fail(
  code: NumberTileTurnDraftEditErrorCode,
): NumberTileTurnDraftEditResult {
  return { ok: false, error: { code } };
}

function succeed(
  draft: NumberTileTurnDraft,
): NumberTileTurnDraftEditResult {
  return { ok: true, draft };
}

function currentPresent(draft: NumberTileTurnDraft): NumberTileDraftPresent {
  return {
    table: draft.table,
    availableRackTiles: draft.availableRackTiles,
  };
}

function presentFingerprint(present: NumberTileDraftPresent): string {
  return JSON.stringify({
    table: present.table,
    availableRackTileIds: present.availableRackTiles.map(
      (tile) => tile.tileId,
    ),
  });
}

function commitEdit(
  draft: NumberTileTurnDraft,
  nextPresent: NumberTileDraftPresent,
  meldIndexesToNormalize: readonly number[] = [],
): NumberTileTurnDraft {
  if (
    presentFingerprint(currentPresent(draft)) ===
    presentFingerprint(nextPresent)
  ) {
    return draft;
  }
  const normalizedIndexes = new Set(meldIndexesToNormalize);
  const normalizedPresent: NumberTileDraftPresent = {
    ...nextPresent,
    table: {
      melds: nextPresent.table.melds.map((meld, meldIndex) =>
        normalizedIndexes.has(meldIndex)
          ? normalizeNumberTileDraftMeld(meld)
          : meld
      ),
    },
  };
  if (
    presentFingerprint(currentPresent(draft)) ===
    presentFingerprint(normalizedPresent)
  ) {
    return draft;
  }

  const history = [
    ...draft.history,
    clonePresent(currentPresent(draft)),
  ].slice(-NUMBER_TILE_TURN_DRAFT_HISTORY_LIMIT);
  const next = clonePresent(normalizedPresent);
  return {
    ...draft,
    table: next.table,
    availableRackTiles: next.availableRackTiles,
    history,
  };
}

export function addNumberTileDraftMeld(
  draft: NumberTileTurnDraft,
): NumberTileTurnDraftEditResult {
  if (findNumberTileDraftReusableEmptyMeldIndex(draft) !== null) {
    return succeed(draft);
  }
  return succeed(
    commitEdit(draft, {
      table: {
        melds: [
          ...draft.table.melds,
          { kind: null, origin: "LOCAL", tiles: [] },
        ],
      },
      availableRackTiles: draft.availableRackTiles,
    }),
  );
}

/** Returns the one reusable local empty meld, preventing empty-card buildup. */
export function findNumberTileDraftReusableEmptyMeldIndex(
  draft: NumberTileTurnDraft,
): number | null {
  const meldIndex = draft.table.melds.findIndex(
    (meld) => meld.origin === "LOCAL" && meld.tiles.length === 0,
  );
  return meldIndex === -1 ? null : meldIndex;
}

export function removeEmptyNumberTileDraftMeld(
  draft: NumberTileTurnDraft,
  meldIndex: number,
): NumberTileTurnDraftEditResult {
  const meld = draft.table.melds[meldIndex];
  if (meld === undefined) {
    return fail("MELD_NOT_FOUND");
  }
  if (meld.tiles.length !== 0) {
    return fail("MELD_NOT_EMPTY");
  }

  return succeed(
    commitEdit(draft, {
      table: {
        melds: draft.table.melds.filter((_, index) => index !== meldIndex),
      },
      availableRackTiles: draft.availableRackTiles,
    }),
  );
}

export function findNumberTileDraftTile(
  draft: NumberTileTurnDraft,
  tileId: TileId,
): NumberTileDraftTileLocation | null {
  const rackIndex = draft.availableRackTiles.findIndex(
    (tile) => tile.tileId === tileId,
  );
  if (rackIndex !== -1) {
    const tile = draft.availableRackTiles[rackIndex];
    return tile === undefined
      ? null
      : { source: "AVAILABLE_RACK", tile, rackIndex };
  }

  for (let meldIndex = 0; meldIndex < draft.table.melds.length; meldIndex += 1) {
    const meld = draft.table.melds[meldIndex];
    if (meld === undefined) {
      continue;
    }
    const tileIndex = meld.tiles.findIndex((tile) => tile.tileId === tileId);
    if (tileIndex !== -1) {
      const tile = meld.tiles[tileIndex];
      if (tile !== undefined) {
        return { source: "TABLE", tile, meldIndex, tileIndex };
      }
    }
  }

  return null;
}

function removeTableTile(
  table: NumberTileDraftTable,
  source: Extract<NumberTileDraftTileLocation, { source: "TABLE" }>,
): NumberTileDraftTable {
  return {
    melds: table.melds.map((meld, meldIndex) =>
      meldIndex === source.meldIndex
        ? {
            ...meld,
            tiles: meld.tiles.filter((_, tileIndex) =>
              tileIndex !== source.tileIndex
            ),
          }
        : meld,
    ),
  };
}

type RemovedTableSource = Readonly<{
  table: NumberTileDraftTable;
  targetMeldIndex: number;
  sourceMeldIndex: number | null;
}>;

function removeTableSourceForMove(
  table: NumberTileDraftTable,
  source: Extract<NumberTileDraftTileLocation, { source: "TABLE" }>,
  targetMeldIndex: number,
): RemovedTableSource {
  const withoutTile = removeTableTile(table, source);
  const emptiedSource = withoutTile.melds[source.meldIndex];
  const shouldPruneSource =
    source.meldIndex !== targetMeldIndex &&
    emptiedSource?.tiles.length === 0;
  if (!shouldPruneSource) {
    return {
      table: withoutTile,
      targetMeldIndex,
      sourceMeldIndex: source.meldIndex,
    };
  }

  return {
    table: {
      melds: withoutTile.melds.filter(
        (_, meldIndex) => meldIndex !== source.meldIndex,
      ),
    },
    targetMeldIndex:
      targetMeldIndex > source.meldIndex
        ? targetMeldIndex - 1
        : targetMeldIndex,
    sourceMeldIndex: null,
  };
}

function rackPlacement(
  tile: NumberTilePrivateRackTileViewV2,
): NumberTileDraftPlacement {
  return tile.kind === "JOKER"
    ? {
        tileId: tile.tileId,
        kind: "JOKER",
        assignment: null,
        assignmentSource: null,
        origin: "SELF_RACK",
      }
    : { ...tile, origin: "SELF_RACK" };
}

function insertTableTile(
  table: NumberTileDraftTable,
  target: NumberTileDraftTarget,
  tile: NumberTileDraftPlacement,
): NumberTileDraftTable {
  return {
    melds: table.melds.map((meld, meldIndex) =>
      meldIndex === target.meldIndex
        ? {
            ...meld,
            tiles: [
              ...meld.tiles.slice(0, target.tileIndex),
              tile,
              ...meld.tiles.slice(target.tileIndex),
            ],
          }
        : meld,
    ),
  };
}

function isCanonicalMeldLocked(
  draft: NumberTileTurnDraft,
  meld: NumberTileDraftMeld,
): boolean {
  return draft.mode === "INITIAL_MELD" && meld.origin === "CANONICAL_TABLE";
}

/**
 * Moves one physical Tile by tileId. The target index is interpreted after
 * removing a Table source, so a move cannot copy or displace another Tile.
 */
export function placeNumberTileDraftTile(
  draft: NumberTileTurnDraft,
  tileId: TileId,
  target: NumberTileDraftTarget,
): NumberTileTurnDraftEditResult {
  const source = findNumberTileDraftTile(draft, tileId);
  if (source === null) {
    return fail("TILE_NOT_FOUND");
  }

  const originalTargetMeld = draft.table.melds[target.meldIndex];
  if (originalTargetMeld === undefined) {
    return fail("MELD_NOT_FOUND");
  }
  if (isCanonicalMeldLocked(draft, originalTargetMeld)) {
    return fail("INITIAL_MELD_TABLE_LOCKED");
  }
  if (
    source.source === "TABLE" &&
    isCanonicalMeldLocked(draft, draft.table.melds[source.meldIndex]!)
  ) {
    return fail("INITIAL_MELD_TABLE_LOCKED");
  }

  const removedSource =
    source.source === "TABLE"
      ? removeTableSourceForMove(draft.table, source, target.meldIndex)
      : {
          table: draft.table,
          targetMeldIndex: target.meldIndex,
          sourceMeldIndex: null,
        };
  const targetMeld = removedSource.table.melds[removedSource.targetMeldIndex];
  if (
    targetMeld === undefined ||
    !Number.isInteger(target.tileIndex) ||
    target.tileIndex < 0 ||
    target.tileIndex > targetMeld.tiles.length
  ) {
    return fail("INVALID_TARGET");
  }

  const placement =
    source.source === "TABLE" ? source.tile : rackPlacement(source.tile);
  const adjustedTarget = {
    meldIndex: removedSource.targetMeldIndex,
    tileIndex: target.tileIndex,
  };
  const nextTable = insertTableTile(
    removedSource.table,
    adjustedTarget,
    placement,
  );
  const nextRack =
    source.source === "AVAILABLE_RACK"
      ? draft.availableRackTiles.filter((tile) => tile.tileId !== tileId)
      : draft.availableRackTiles;

  return succeed(
    commitEdit(draft, {
      table: nextTable,
      availableRackTiles: nextRack,
    }, [
      ...(removedSource.sourceMeldIndex === null
        ? []
        : [removedSource.sourceMeldIndex]),
      adjustedTarget.meldIndex,
    ]),
  );
}

/** Appends one physical Tile to a whole-card target using post-removal indices. */
export function appendNumberTileDraftTileToMeld(
  draft: NumberTileTurnDraft,
  tileId: TileId,
  meldIndex: number,
): NumberTileTurnDraftEditResult {
  const meld = draft.table.melds[meldIndex];
  if (meld === undefined) {
    return fail("MELD_NOT_FOUND");
  }
  const source = findNumberTileDraftTile(draft, tileId);
  if (source === null) {
    return fail("TILE_NOT_FOUND");
  }
  const targetLengthAfterRemoval =
    source.source === "TABLE" && source.meldIndex === meldIndex
      ? meld.tiles.length - 1
      : meld.tiles.length;
  return placeNumberTileDraftTile(draft, tileId, {
    meldIndex,
    tileIndex: targetLengthAfterRemoval,
  });
}

/** Creates (or reuses) one local meld and moves a Tile in one Undo entry. */
export function placeNumberTileDraftTileInNewMeld(
  draft: NumberTileTurnDraft,
  tileId: TileId,
): NumberTileTurnDraftEditResult {
  const reusableMeldIndex = findNumberTileDraftReusableEmptyMeldIndex(draft);
  if (reusableMeldIndex !== null) {
    return appendNumberTileDraftTileToMeld(
      draft,
      tileId,
      reusableMeldIndex,
    );
  }

  const source = findNumberTileDraftTile(draft, tileId);
  if (source === null) {
    return fail("TILE_NOT_FOUND");
  }
  if (
    source.source === "TABLE" &&
    isCanonicalMeldLocked(draft, draft.table.melds[source.meldIndex]!)
  ) {
    return fail("INITIAL_MELD_TABLE_LOCKED");
  }

  const tableWithoutSource =
    source.source === "TABLE"
      ? removeTableTile(draft.table, source)
      : draft.table;
  const originalSourceMeldIndex =
    source.source === "TABLE" ? source.meldIndex : null;
  const emptiedSource =
    originalSourceMeldIndex === null
      ? undefined
      : tableWithoutSource.melds[originalSourceMeldIndex];
  const shouldPruneSource =
    emptiedSource?.tiles.length === 0;
  const remainingMelds = shouldPruneSource
    ? tableWithoutSource.melds.filter(
        (_, meldIndex) => meldIndex !== originalSourceMeldIndex,
      )
    : tableWithoutSource.melds;
  const placement =
    source.source === "TABLE" ? source.tile : rackPlacement(source.tile);
  const targetMeldIndex = remainingMelds.length;
  const nextTable: NumberTileDraftTable = {
    melds: [
      ...remainingMelds,
      { kind: null, origin: "LOCAL", tiles: [placement] },
    ],
  };
  const nextRack =
    source.source === "AVAILABLE_RACK"
      ? draft.availableRackTiles.filter((tile) => tile.tileId !== tileId)
      : draft.availableRackTiles;
  const sourceMeldIndex =
    originalSourceMeldIndex !== null && !shouldPruneSource
      ? originalSourceMeldIndex
      : null;
  return succeed(
    commitEdit(
      draft,
      { table: nextTable, availableRackTiles: nextRack },
      [
        ...(sourceMeldIndex === null ? [] : [sourceMeldIndex]),
        targetMeldIndex,
      ],
    ),
  );
}

export function returnNumberTileDraftTileToRack(
  draft: NumberTileTurnDraft,
  tileId: TileId,
): NumberTileTurnDraftEditResult {
  const source = findNumberTileDraftTile(draft, tileId);
  if (source === null) {
    return fail("TILE_NOT_FOUND");
  }
  if (source.source === "AVAILABLE_RACK") {
    return succeed(draft);
  }
  if (source.tile.origin === "CANONICAL_TABLE") {
    return fail("CANONICAL_TILE_CANNOT_RETURN_TO_RACK");
  }

  const availableTileIds = new Set([
    ...draft.availableRackTiles.map((tile) => tile.tileId),
    tileId,
  ]);
  const restoredRack = draft.rackTiles.filter((tile) =>
    availableTileIds.has(tile.tileId),
  );
  const tableWithoutSource = removeTableTile(draft.table, source);
  const emptiedSource = tableWithoutSource.melds[source.meldIndex];
  const shouldPruneSource = emptiedSource?.tiles.length === 0;
  const nextTable = shouldPruneSource
    ? {
        melds: tableWithoutSource.melds.filter(
          (_, meldIndex) => meldIndex !== source.meldIndex,
        ),
      }
    : tableWithoutSource;
  return succeed(
    commitEdit(
      draft,
      { table: nextTable, availableRackTiles: restoredRack },
      shouldPruneSource ? [] : [source.meldIndex],
    ),
  );
}

export function assignNumberTileDraftJoker(
  draft: NumberTileTurnDraft,
  tileId: TileId,
  assignment: NumberTileJokerAssignment,
): NumberTileTurnDraftEditResult {
  const source = findNumberTileDraftTile(draft, tileId);
  if (source === null) {
    return fail("TILE_NOT_FOUND");
  }
  if (source.tile.kind !== "JOKER") {
    return fail("TILE_NOT_JOKER");
  }
  if (source.source !== "TABLE") {
    return fail("JOKER_NOT_ON_TABLE");
  }
  const meld = draft.table.melds[source.meldIndex];
  if (meld === undefined) {
    return fail("MELD_NOT_FOUND");
  }
  if (isCanonicalMeldLocked(draft, meld)) {
    return fail("INITIAL_MELD_TABLE_LOCKED");
  }

  const updated: NumberTileDraftJokerPlacement = {
    ...source.tile,
    assignment: { ...assignment },
    assignmentSource: "USER",
  };
  const tableWithoutSource = removeTableTile(draft.table, source);
  return succeed(
    commitEdit(draft, {
      table: insertTableTile(
        tableWithoutSource,
        { meldIndex: source.meldIndex, tileIndex: source.tileIndex },
        updated,
      ),
      availableRackTiles: draft.availableRackTiles,
    }, [source.meldIndex]),
  );
}

export function undoNumberTileTurnDraft(
  draft: NumberTileTurnDraft,
): NumberTileTurnDraftEditResult {
  const previous = draft.history.at(-1);
  if (previous === undefined) {
    return fail("NO_UNDO_HISTORY");
  }

  const restored = clonePresent(previous);
  return succeed({
    ...draft,
    table: restored.table,
    availableRackTiles: restored.availableRackTiles,
    history: draft.history.slice(0, -1).map(clonePresent),
  });
}

export function resetNumberTileTurnDraft(
  draft: NumberTileTurnDraft,
): NumberTileTurnDraft {
  const baseline = clonePresent(draft.baseline);
  return {
    ...draft,
    table: baseline.table,
    availableRackTiles: baseline.availableRackTiles,
    history: [],
  };
}

export function isNumberTileTurnDraftDirty(
  draft: NumberTileTurnDraft,
): boolean {
  return (
    presentFingerprint(currentPresent(draft)) !==
    presentFingerprint(draft.baseline)
  );
}

/** Presence-only snapshots keep edits; changed canonical game/turn identity resets. */
export function decideNumberTileTurnDraftReconciliation(
  draft: NumberTileTurnDraft,
  incomingSnapshot: PlatformSnapshotV2,
): NumberTileTurnDraftReconciliationDecision {
  if (
    incomingSnapshot.room.phase !== "PLAYING" ||
    incomingSnapshot.room.gameType !== "NUMBER_TILE" ||
    incomingSnapshot.game === null ||
    incomingSnapshot.game.gameType !== "NUMBER_TILE" ||
    !("turn" in incomingSnapshot.game)
  ) {
    return "RESET_DRAFT";
  }

  if (
    !isSameGameplayIdentity(
      {
        gameId: draft.baseGameId,
        gameRevision: draft.baseGameRevision,
        turnId: draft.baseTurnId,
      },
      {
        gameId: incomingSnapshot.game.gameId,
        gameRevision: incomingSnapshot.game.gameRevision,
        turnId: incomingSnapshot.game.turn.turnId,
      },
    ) ||
    incomingSnapshot.self.playerId !==
      incomingSnapshot.game.turn.activePlayerId
  ) {
    return "RESET_DRAFT";
  }

  return "KEEP_DRAFT";
}

export function canEditNumberTileTurnDraft(
  draft: NumberTileTurnDraft | null,
  incomingSnapshot: PlatformSnapshotV2,
  currentCommandSession: boolean,
): boolean {
  return currentCommandSession &&
    draft !== null &&
    decideNumberTileTurnDraftReconciliation(draft, incomingSnapshot) ===
      "KEEP_DRAFT";
}

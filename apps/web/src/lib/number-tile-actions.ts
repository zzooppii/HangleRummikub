import {
  PROTOCOL_VERSION,
  type GameRevision,
  type NumberDrawCommand,
  type NumberPassCommand,
  type NumberSubmitCommand,
  type NumberTilePlayingPlatformSnapshotV2,
  type NumberTileProposedTable,
  type ProtocolErrorCode,
  type RequestId,
  type TurnId,
} from "@hangul-rummikub/shared";

import type { NumberTileTurnDraft } from "../features/number-tile/number-tile-turn-draft.js";
import {
  classifyNumberTileDraftMeld,
  normalizeNumberTileDraftMeld,
} from "../features/number-tile/number-tile-ux.js";
import {
  runAsyncSingleFlight,
  type AsyncSingleFlightRef,
} from "./async-single-flight.js";

export type PendingNumberTileActionCommand =
  | NumberDrawCommand
  | NumberPassCommand;

export type NumberTileCommandFlightRef = AsyncSingleFlightRef;

export type NumberTileCommandFailureAction =
  | "PRESERVE_DRAFT"
  | "RESET_DRAFT_AND_SYNC";

const RESETTING_ERRORS = new Set<ProtocolErrorCode>([
  "STALE_GAME_REVISION",
  "NOT_YOUR_TURN",
  "TURN_EXPIRED",
  "GAME_EXPIRED",
  "INVALID_PHASE",
  "UNAUTHENTICATED",
  "INVALID_TILE_ACCESS",
]);

export function serializeNumberTileTurnDraft(
  draft: NumberTileTurnDraft,
): NumberTileProposedTable | null {
  const melds: NumberTileProposedTable["melds"] = [];
  const serializedTileIds = new Set<string>();
  for (const meld of draft.table.melds) {
    const normalizedMeld = normalizeNumberTileDraftMeld(meld);
    const classification = classifyNumberTileDraftMeld(normalizedMeld);
    if (classification.status !== "VALID") {
      return null;
    }
    const tiles: NumberTileProposedTable["melds"][number]["tiles"] = [];
    for (const tile of normalizedMeld.tiles) {
      if (serializedTileIds.has(tile.tileId)) {
        return null;
      }
      serializedTileIds.add(tile.tileId);
      if (tile.kind === "JOKER") {
        tiles.push({
          tileId: tile.tileId,
          kind: "JOKER",
        });
      } else {
        tiles.push({ tileId: tile.tileId, kind: "ORDINARY" });
      }
    }
    melds.push({ kind: classification.interpretation.kind, tiles });
  }
  return { melds };
}

export function createOrReuseNumberSubmitCommand(
  pendingCommand: NumberSubmitCommand | null,
  draft: NumberTileTurnDraft,
  createId: () => RequestId,
): NumberSubmitCommand | null {
  if (pendingCommand !== null) {
    return pendingCommand;
  }

  const proposedTable = serializeNumberTileTurnDraft(draft);
  return proposedTable === null
    ? null
    : {
        kind: "number:submit",
        protocolVersion: PROTOCOL_VERSION,
        requestId: createId(),
        expectedGameRevision: draft.baseGameRevision,
        turnId: draft.baseTurnId,
        payload: { proposedTable },
      };
}

export function createOrReuseNumberDrawCommand(
  pendingCommand: NumberDrawCommand | null,
  expectedGameRevision: GameRevision,
  turnId: TurnId,
  createId: () => RequestId,
): NumberDrawCommand {
  return pendingCommand ?? {
    kind: "number:draw",
    protocolVersion: PROTOCOL_VERSION,
    requestId: createId(),
    expectedGameRevision,
    turnId,
    payload: {},
  };
}

export function createOrReuseNumberPassCommand(
  pendingCommand: NumberPassCommand | null,
  expectedGameRevision: GameRevision,
  turnId: TurnId,
  createId: () => RequestId,
): NumberPassCommand {
  return pendingCommand ?? {
    kind: "number:pass",
    protocolVersion: PROTOCOL_VERSION,
    requestId: createId(),
    expectedGameRevision,
    turnId,
    payload: {},
  };
}

export function decideNumberTileCommandFailureAction(
  code: ProtocolErrorCode,
  acknowledgedGameRevision: GameRevision | null,
  expectedGameRevision: GameRevision,
): NumberTileCommandFailureAction {
  return RESETTING_ERRORS.has(code) ||
    (acknowledgedGameRevision !== null &&
      acknowledgedGameRevision !== expectedGameRevision)
    ? "RESET_DRAFT_AND_SYNC"
    : "PRESERVE_DRAFT";
}

export function numberSnapshotSupersedesCommand(
  command: NumberSubmitCommand | PendingNumberTileActionCommand,
  snapshot: NumberTilePlayingPlatformSnapshotV2 | null,
): boolean {
  return snapshot === null ||
    snapshot.game.gameRevision > command.expectedGameRevision ||
    snapshot.game.turn.turnId !== command.turnId;
}

export function runNumberTileCommandSingleFlight(
  flightRef: NumberTileCommandFlightRef,
  execute: () => Promise<void>,
): Promise<void> {
  return runAsyncSingleFlight(flightRef, execute);
}

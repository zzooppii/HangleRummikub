import {
  PROTOCOL_VERSION,
  type ProposedBoard,
  type ProtocolErrorCode,
  type GameRevision,
  type RequestId,
  type RoomCode,
  type TurnSubmitCommand,
} from "@hangul-rummikub/shared";

import type {
  DraftPlacedTile,
  DraftSyllable,
  TurnDraft,
} from "./turn-draft.js";

export type TurnSubmitFailureAction =
  | "PRESERVE_DRAFT"
  | "RESET_DRAFT_AND_SYNC";

export type TurnSubmitFlightRef = {
  current: Promise<void> | null;
};

type PendingTurnSnapshot =
  | Readonly<{
      room: Readonly<{ phase: "LOBBY" }>;
      versions: Readonly<{ gameRevision: null }>;
    }>
  | Readonly<{
      room: Readonly<{ phase: "PLAYING" }>;
      versions: Readonly<{ gameRevision: number }>;
      game: Readonly<{ turn: Readonly<{ turnId: string }> }>;
    }>
  | Readonly<{
      room: Readonly<{ phase: "FINISHED" }>;
      versions: Readonly<{ gameRevision: number }>;
    }>;

const DRAFT_PRESERVING_ERRORS = new Set<ProtocolErrorCode>([
  "INVALID_BOARD",
  "INVALID_HANGUL_COMPOSITION",
  "WORD_NOT_ALLOWED",
  "RULE_VIOLATION",
  "TEMPORARILY_UNAVAILABLE",
]);

const DRAFT_RESETTING_ERRORS = new Set<ProtocolErrorCode>([
  "STALE_GAME_REVISION",
  "NOT_YOUR_TURN",
  "TURN_EXPIRED",
  "INVALID_PHASE",
  "UNAUTHENTICATED",
  "INVALID_TILE_ACCESS",
]);

function serializeComponent(tile: DraftPlacedTile) {
  return {
    tileId: tile.tileId,
    assignedSymbol: tile.assignedSymbol,
  };
}

function serializeSyllable(syllable: DraftSyllable) {
  return {
    choseong:
      syllable.choseong === null
        ? []
        : [serializeComponent(syllable.choseong)],
    jungseong: syllable.jungseong
      .filter((tile): tile is DraftPlacedTile => tile !== null)
      .map(serializeComponent),
    jongseong: syllable.jongseong
      .filter((tile): tile is DraftPlacedTile => tile !== null)
      .map(serializeComponent),
  };
}

/**
 * Converts the browser-only working copy into the narrow wire proposal. It
 * deliberately excludes physical metadata, composed words, rack state, and
 * every other client-derived claim the server must calculate for itself.
 */
export function serializeTurnDraft(draft: TurnDraft): ProposedBoard {
  return {
    wordGroups: draft.wordGroups.map((group) => ({
      groupId: group.groupId,
      syllables: group.syllables.map(serializeSyllable),
    })),
  };
}

/** Keeps an acknowledgement-loss retry byte-for-byte on the same command. */
export function createOrReuseTurnSubmitCommand(
  pendingCommand: TurnSubmitCommand | null,
  draft: TurnDraft,
  createId: () => RequestId,
): TurnSubmitCommand {
  if (pendingCommand !== null) {
    return pendingCommand;
  }

  return {
    kind: "turn:submit",
    protocolVersion: PROTOCOL_VERSION,
    requestId: createId(),
    expectedGameRevision: draft.baseGameRevision,
    turnId: draft.baseTurnId,
    payload: {
      proposedBoard: serializeTurnDraft(draft),
    },
  };
}

/** Runs at most one transport attempt at a time for the current browser page. */
export function runTurnSubmitSingleFlight(
  flightRef: TurnSubmitFlightRef,
  execute: () => Promise<void>,
): Promise<void> {
  if (flightRef.current !== null) {
    return flightRef.current;
  }

  const flight = execute().finally(() => {
    if (flightRef.current === flight) {
      flightRef.current = null;
    }
  });
  flightRef.current = flight;
  return flight;
}

export function decideTurnSubmitFailureAction(
  code: ProtocolErrorCode,
  acknowledgedGameRevision: GameRevision | null,
  expectedGameRevision: GameRevision,
): TurnSubmitFailureAction {
  if (DRAFT_PRESERVING_ERRORS.has(code)) {
    return acknowledgedGameRevision === expectedGameRevision
      ? "PRESERVE_DRAFT"
      : "RESET_DRAFT_AND_SYNC";
  }

  if (DRAFT_RESETTING_ERRORS.has(code)) {
    return "RESET_DRAFT_AND_SYNC";
  }

  // Other safe rejections do not discard work unless the protocol explicitly
  // says that the authoritative turn or Tile view can no longer be trusted.
  return "PRESERVE_DRAFT";
}

export function snapshotSupersedesPendingTurnSubmit(
  pendingCommand: TurnSubmitCommand,
  snapshot: PendingTurnSnapshot,
): boolean {
  if (
    snapshot.room.phase !== "PLAYING" ||
    !("game" in snapshot) ||
    !("turn" in snapshot.game)
  ) {
    return true;
  }

  return (
    snapshot.versions.gameRevision === null ||
    snapshot.versions.gameRevision > pendingCommand.expectedGameRevision ||
    snapshot.game.turn.turnId !== pendingCommand.turnId
  );
}

/** A page-memory retry is scoped to the Room in which it was created. */
export function shouldDiscardPendingTurnSubmitOnNavigation(
  currentRoomCode: RoomCode,
  nextRoomCode: RoomCode | null,
): boolean {
  return nextRoomCode === null || nextRoomCode !== currentRoomCode;
}

import {
  PROTOCOL_VERSION,
  type GameRevision,
  type PlayingStateSnapshot,
  type ProtocolErrorCode,
  type RequestId,
  type RoomCode,
  type TurnDrawBagKind,
  type TurnDrawCommand,
  type TurnId,
  type TurnPassCommand,
} from "@hangul-rummikub/shared";

export type PendingTurnActionCommand = TurnDrawCommand | TurnPassCommand;

export type TurnActionFlightRef = {
  current: Promise<void> | null;
};

export type TurnActionFailureAction =
  | "PRESERVE_DRAFT"
  | "RESET_DRAFT_AND_SYNC";

export type TurnActionControls = Readonly<{
  visible: boolean;
  canDrawConsonant: boolean;
  canDrawVowel: boolean;
  canPass: boolean;
}>;

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

const RESETTING_ERRORS = new Set<ProtocolErrorCode>([
  "STALE_GAME_REVISION",
  "NOT_YOUR_TURN",
  "TURN_EXPIRED",
  "INVALID_PHASE",
  "UNAUTHENTICATED",
]);

export function createOrReuseTurnDrawCommand(
  pendingCommand: TurnDrawCommand | null,
  expectedGameRevision: GameRevision,
  turnId: TurnId,
  bagKind: TurnDrawBagKind,
  createId: () => RequestId,
): TurnDrawCommand {
  if (pendingCommand !== null) {
    return pendingCommand;
  }

  return {
    kind: "turn:draw",
    protocolVersion: PROTOCOL_VERSION,
    requestId: createId(),
    expectedGameRevision,
    turnId,
    payload: { bagKind },
  };
}

export function createOrReuseTurnPassCommand(
  pendingCommand: TurnPassCommand | null,
  expectedGameRevision: GameRevision,
  turnId: TurnId,
  createId: () => RequestId,
): TurnPassCommand {
  if (pendingCommand !== null) {
    return pendingCommand;
  }

  return {
    kind: "turn:pass",
    protocolVersion: PROTOCOL_VERSION,
    requestId: createId(),
    expectedGameRevision,
    turnId,
    payload: {},
  };
}

/** Runs at most one Draw or Pass transport attempt for the current page. */
export function runTurnActionSingleFlight(
  flightRef: TurnActionFlightRef,
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

export function getTurnActionControls(
  snapshot: PlayingStateSnapshot,
  commandCapable: boolean,
  commandPending: boolean,
): TurnActionControls {
  const isActive =
    snapshot.game.turn.activePlayerId === snapshot.self.playerId;
  const visible = isActive && commandCapable;
  const enabled = visible && !commandPending;

  return {
    visible,
    canDrawConsonant:
      enabled && snapshot.game.bagCounts.consonant > 0,
    canDrawVowel: enabled && snapshot.game.bagCounts.vowel > 0,
    canPass:
      enabled &&
      snapshot.game.bagCounts.consonant === 0 &&
      snapshot.game.bagCounts.vowel === 0,
  };
}

export function shouldConfirmDraw(isDraftDirty: boolean): boolean {
  return isDraftDirty;
}

export function decideTurnActionFailureAction(
  code: ProtocolErrorCode,
  acknowledgedGameRevision: GameRevision | null,
  expectedGameRevision: GameRevision,
): TurnActionFailureAction {
  if (
    RESETTING_ERRORS.has(code) ||
    (acknowledgedGameRevision !== null &&
      acknowledgedGameRevision !== expectedGameRevision)
  ) {
    return "RESET_DRAFT_AND_SYNC";
  }

  return "PRESERVE_DRAFT";
}

export function snapshotSupersedesPendingTurnAction(
  pendingCommand: PendingTurnActionCommand,
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

export function shouldDiscardPendingTurnActionOnNavigation(
  currentRoomCode: RoomCode,
  nextRoomCode: RoomCode | null,
): boolean {
  return nextRoomCode === null || nextRoomCode !== currentRoomCode;
}

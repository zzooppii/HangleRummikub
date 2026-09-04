import type {
  GameFinishedEvent,
  StateSnapshot,
  StateVersions,
  TurnStartedEvent,
} from "@hangul-rummikub/shared";

export type SnapshotUpdateDecision =
  | "APPLY"
  | "KEEP_EQUAL"
  | "IGNORE_STALE"
  | "REQUEST_SYNC";

export type AdvisorySnapshotDecision = "IGNORE" | "REQUEST_SYNC";

type RevisionComparison = -1 | 0 | 1;

function compareRevision(
  currentRevision: number,
  incomingRevision: number,
): RevisionComparison {
  if (incomingRevision > currentRevision) {
    return 1;
  }

  if (incomingRevision < currentRevision) {
    return -1;
  }

  return 0;
}

function compareGameRevision(
  currentRevision: StateVersions["gameRevision"],
  incomingRevision: StateVersions["gameRevision"],
): RevisionComparison {
  if (currentRevision === null) {
    return incomingRevision === null ? 0 : 1;
  }

  if (incomingRevision === null) {
    return -1;
  }

  return compareRevision(currentRevision, incomingRevision);
}

export function compareStateVersions(
  currentVersions: StateVersions,
  incomingVersions: StateVersions,
): SnapshotUpdateDecision {
  const gameComparison = compareGameRevision(
    currentVersions.gameRevision,
    incomingVersions.gameRevision,
  );

  const comparisons: RevisionComparison[] = [
    compareRevision(
      currentVersions.roomRevision,
      incomingVersions.roomRevision,
    ),
    compareRevision(
      currentVersions.presenceVersion,
      incomingVersions.presenceVersion,
    ),
    gameComparison,
  ];
  const hasNewerDimension = comparisons.includes(1);
  const hasOlderDimension = comparisons.includes(-1);

  if (hasNewerDimension && hasOlderDimension) {
    return "REQUEST_SYNC";
  }

  if (hasNewerDimension) {
    return "APPLY";
  }

  if (hasOlderDimension) {
    return "IGNORE_STALE";
  }

  return "KEEP_EQUAL";
}

export function decideSnapshotUpdate(
  currentSnapshot: StateSnapshot | null,
  incomingSnapshot: StateSnapshot,
): SnapshotUpdateDecision {
  if (currentSnapshot === null) {
    return "APPLY";
  }

  if (
    currentSnapshot.room.roomId !== incomingSnapshot.room.roomId ||
    currentSnapshot.self.playerId !== incomingSnapshot.self.playerId
  ) {
    return "REQUEST_SYNC";
  }

  return compareStateVersions(
    currentSnapshot.versions,
    incomingSnapshot.versions,
  );
}

/**
 * Advisory events never replace canonical state. They only trigger a sync when
 * they prove that the currently held snapshot is missing or contradicts state.
 */
export function decideTurnStartedAdvisory(
  currentSnapshot: StateSnapshot | null,
  event: TurnStartedEvent,
): AdvisorySnapshotDecision {
  if (currentSnapshot === null) {
    return "REQUEST_SYNC";
  }

  if (
    "game" in currentSnapshot &&
    currentSnapshot.game.gameId !== event.payload.gameId
  ) {
    return "IGNORE";
  }

  const versionDecision = compareStateVersions(
    currentSnapshot.versions,
    event.versions,
  );
  if (versionDecision === "APPLY" || versionDecision === "REQUEST_SYNC") {
    return "REQUEST_SYNC";
  }
  if (versionDecision === "IGNORE_STALE") {
    return "IGNORE";
  }

  if (
    currentSnapshot.room.phase !== "PLAYING" ||
    !("game" in currentSnapshot) ||
    !("turn" in currentSnapshot.game)
  ) {
    return "IGNORE";
  }

  const currentTurn = currentSnapshot.game.turn;
  return currentTurn.turnId === event.payload.turnId &&
    currentTurn.turnNumber === event.payload.turnNumber &&
    currentTurn.activePlayerId === event.payload.activePlayerId &&
    currentTurn.deadlineAt === event.payload.deadlineAt
    ? "IGNORE"
    : "REQUEST_SYNC";
}

export function decideGameFinishedAdvisory(
  currentSnapshot: StateSnapshot | null,
  event: GameFinishedEvent,
): AdvisorySnapshotDecision {
  if (currentSnapshot === null || !("game" in currentSnapshot)) {
    return "REQUEST_SYNC";
  }

  if (currentSnapshot.game.gameId !== event.payload.gameId) {
    return "IGNORE";
  }

  const versionDecision = compareStateVersions(
    currentSnapshot.versions,
    event.versions,
  );
  if (versionDecision === "APPLY" || versionDecision === "REQUEST_SYNC") {
    return "REQUEST_SYNC";
  }
  if (versionDecision === "IGNORE_STALE") {
    return "IGNORE";
  }

  if (
    currentSnapshot.room.phase !== "FINISHED" ||
    !("result" in currentSnapshot.game)
  ) {
    return "REQUEST_SYNC";
  }

  const currentResult = currentSnapshot.game.result;
  const sameWinners =
    currentResult.winnerPlayerIds.length ===
      event.payload.winnerPlayerIds.length &&
    currentResult.winnerPlayerIds.every(
      (playerId, index) => playerId === event.payload.winnerPlayerIds[index],
    );

  return currentResult.reason === event.payload.reason &&
    currentResult.finishedAt === event.payload.finishedAt &&
    sameWinners
    ? "IGNORE"
    : "REQUEST_SYNC";
}

import type {
  StateSnapshot,
  StateVersions,
} from "@hangul-rummikub/shared";

export type SnapshotUpdateDecision =
  | "APPLY"
  | "KEEP_EQUAL"
  | "IGNORE_STALE"
  | "REQUEST_SYNC";

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

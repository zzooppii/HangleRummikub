import {
  PROTOCOL_VERSION,
  validateStateSnapshot,
  type PlatformSnapshotV2,
  type StateSnapshot,
} from "@hangul-rummikub/shared";

/**
 * Transitional browser adapter for the existing Hangul screens and command
 * controller. The V2 projection is already player-private; this function only
 * restores the legacy V1 field layout and makes no privacy or rule decisions.
 */
export function adaptPlatformSnapshotV2ToLegacyHangulV1(
  snapshot: PlatformSnapshotV2,
): StateSnapshot {
  if (snapshot.room.gameType !== "HANGUL_TILE") {
    throw new Error("Only HANGUL_TILE PlatformSnapshot V2 is supported.");
  }

  const common = {
    protocolVersion: PROTOCOL_VERSION,
    serverTime: snapshot.serverTime,
    room: {
      roomId: snapshot.room.roomId,
      roomCode: snapshot.room.roomCode,
      phase: snapshot.room.phase,
    },
  };

  if (snapshot.game === null) {
    const validation = validateStateSnapshot({
      ...common,
      versions: {
        roomRevision: snapshot.versions.roomRevision,
        gameRevision: null,
        presenceVersion: snapshot.versions.presenceVersion,
      },
      room: {
        ...common.room,
        players: snapshot.room.players.map(({ playerId, nickname, isHost, connectionStatus }) => ({ playerId, nickname, isHost, connectionStatus })),
      },
      self: { playerId: snapshot.self.playerId },
    });

    if (!validation.ok) {
      throw new Error("PlatformSnapshot V2 cannot form a legacy Lobby view.");
    }

    return validation.value;
  }

  if (snapshot.game.gameType !== "HANGUL_TILE") {
    throw new Error("Only HANGUL_TILE game projections are supported.");
  }

  const playerStates = new Map(
    snapshot.game.playerStates.map((player) => [player.playerId, player]),
  );
  const players = snapshot.room.players.map((player) => {
    const gamePlayer = playerStates.get(player.playerId);
    if (gamePlayer === undefined) {
      throw new Error("Hangul player state is missing for a Room Player.");
    }

    return {
      ...player,
      rackCount: gamePlayer.rackCount,
      initialMeldCompleted: gamePlayer.initialMeldCompleted,
      forfeited: gamePlayer.forfeited,
    };
  });
  const validation = validateStateSnapshot({
    ...common,
    versions: {
      roomRevision: snapshot.versions.roomRevision,
      gameRevision: snapshot.game.gameRevision,
      presenceVersion: snapshot.versions.presenceVersion,
    },
    room: {
      ...common.room,
      players,
    },
    game: snapshot.game.publicState,
    self: {
      playerId: snapshot.self.playerId,
      rack: snapshot.game.privateState.rack,
    },
  });

  if (!validation.ok) {
    throw new Error(
      "PlatformSnapshot V2 cannot form a legacy Hangul game view.",
    );
  }

  return validation.value;
}

import {
  PROTOCOL_VERSION,
  type PlatformPlayerViewV2,
  type GameType,
  type PlayerId,
  type RoomCode,
  type RoomId,
  type RoomPhase,
  type ServerTime,
  type StateVersions,
  type StateSnapshot,
} from "@hangul-rummikub/shared";

import type { CompatibleWebSnapshot } from "./snapshot-wire-decoder.js";

export type RoomSnapshotShell = Readonly<{
  /** NUMBER rematch ordering: gameRevision is scoped to this game, not the Room. */
  gameId?: string | null;
  protocolVersion: typeof PROTOCOL_VERSION;
  versions: StateVersions;
  serverTime: ServerTime;
  room: Readonly<{
    roomId: RoomId;
    roomCode: RoomCode;
    phase: RoomPhase;
    gameType: GameType;
    players: readonly PlatformPlayerViewV2[];
  }>;
  self: Readonly<{ playerId: PlayerId }>;
}>;

function fromLegacySnapshot(snapshot: StateSnapshot): RoomSnapshotShell {
  return {
    gameId: "game" in snapshot ? snapshot.game.gameId : null,
    protocolVersion: snapshot.protocolVersion,
    versions: snapshot.versions,
    serverTime: snapshot.serverTime,
    room: {
      roomId: snapshot.room.roomId,
      roomCode: snapshot.room.roomCode,
      phase: snapshot.room.phase,
      gameType: "HANGUL_TILE",
      players: snapshot.room.players.map((player) => ({
        playerId: player.playerId,
        nickname: player.nickname,
        isHost: player.isHost,
        connectionStatus: player.connectionStatus,
      })),
    },
    self: { playerId: snapshot.self.playerId },
  };
}

/**
 * Extracts only platform room/session ordering data. It never translates a
 * NUMBER_TILE projection into the legacy Hangul game shape.
 */
export function projectRoomSnapshotShell(
  compatible: CompatibleWebSnapshot,
): RoomSnapshotShell {
  if (compatible.kind === "LEGACY_HANGUL_V1") {
    return fromLegacySnapshot(compatible.legacySnapshot);
  }

  const snapshot = compatible.platformSnapshot;
  return {
    gameId: snapshot.game === null ? null : "gameId" in snapshot.game ? snapshot.game.gameId : snapshot.game.publicState.gameId,
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: snapshot.versions.roomRevision,
      gameRevision: snapshot.game?.gameRevision ?? null,
      presenceVersion: snapshot.versions.presenceVersion,
    },
    serverTime: snapshot.serverTime,
    room: {
      roomId: snapshot.room.roomId,
      roomCode: snapshot.room.roomCode,
      phase: snapshot.room.phase,
      gameType: snapshot.room.gameType,
      players: snapshot.room.players,
    },
    self: snapshot.self,
  };
}

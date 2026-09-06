import {
  GameTypeSchema,
  PLATFORM_SNAPSHOT_VERSION,
  PlatformSnapshotV2Schema,
  StateSnapshotSchema,
  type PlatformSnapshotV2,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

export type MapLegacyStateSnapshotV1ToPlatformSnapshotV2Input = Readonly<{
  canonicalGameType: unknown;
  snapshot: unknown;
}>;

/**
 * Transitional P5A mapper from the already validated and privacy-safe legacy
 * wire projection to the latent PlatformSnapshot V2 representation.
 *
 * This mapper deliberately does not inspect canonical game state or make new
 * privacy decisions. It is not connected to the production realtime path.
 */
export function mapLegacyStateSnapshotV1ToPlatformSnapshotV2(
  input: MapLegacyStateSnapshotV1ToPlatformSnapshotV2Input,
): PlatformSnapshotV2 {
  const gameType = v.parse(GameTypeSchema, input.canonicalGameType);
  if (gameType !== "HANGUL_TILE") {
    throw new Error(
      "Legacy Hangul v1 snapshots can only map canonical HANGUL_TILE Rooms.",
    );
  }
  const snapshot = v.parse(StateSnapshotSchema, input.snapshot);
  const platformPlayers = snapshot.room.players.map((player) => ({
    playerId: player.playerId,
    nickname: player.nickname,
    isHost: player.isHost,
    connectionStatus: player.connectionStatus,
  }));
  const platformSnapshotBase = {
    snapshotVersion: PLATFORM_SNAPSHOT_VERSION,
    versions: {
      roomRevision: snapshot.versions.roomRevision,
      presenceVersion: snapshot.versions.presenceVersion,
    },
    serverTime: snapshot.serverTime,
    room: {
      roomId: snapshot.room.roomId,
      roomCode: snapshot.room.roomCode,
      phase: snapshot.room.phase,
      gameType,
      players: platformPlayers,
    },
    self: {
      playerId: snapshot.self.playerId,
    },
  };

  if (!("game" in snapshot)) {
    return v.parse(PlatformSnapshotV2Schema, {
      ...platformSnapshotBase,
      game: null,
    });
  }

  return v.parse(PlatformSnapshotV2Schema, {
    ...platformSnapshotBase,
    game: {
      gameType,
      gameRevision: snapshot.versions.gameRevision,
      publicState: snapshot.game,
      playerStates: snapshot.room.players.map((player) => ({
        playerId: player.playerId,
        rackCount: player.rackCount,
        initialMeldCompleted: player.initialMeldCompleted,
        forfeited: player.forfeited,
      })),
      privateState: {
        rack: snapshot.self.rack,
      },
    },
  });
}

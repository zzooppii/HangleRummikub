import {
  PROTOCOL_VERSION,
  StateSnapshotSchema,
  type PlayerId,
  type StateSnapshot,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type { LegacyHangulV1GameProjector } from "../games/legacy-hangul-v1-game-projector.js";
import { LEGACY_V1_DEFAULT_GAME_TYPE } from "../games/legacy-hangul-compatibility-registration.js";
import type { RoomRecord } from "../model/persistence.js";
import type {
  PlayerPresenceReader,
  RoomPresenceReadModel,
} from "../ports/player-presence-reader.js";
import type { Clock } from "../ports/system.js";

export type { RoomPresenceReadModel };
export type RoomPresenceReadPort = PlayerPresenceReader;

export type LobbyStateSnapshotProjectorDependencies = Readonly<{
  clock: Clock;
  presenceReader: PlayerPresenceReader;
  legacyHangulV1GameProjector: LegacyHangulV1GameProjector;
}>;

export type ProjectLobbyStateSnapshotInput = Readonly<{
  room: RoomRecord;
  selfPlayerId: PlayerId;
}>;

export class LobbyStateSnapshotProjector {
  readonly #clock: Clock;
  readonly #presenceReader: PlayerPresenceReader;
  readonly #legacyHangulV1GameProjector: LegacyHangulV1GameProjector;

  constructor(dependencies: LobbyStateSnapshotProjectorDependencies) {
    this.#clock = dependencies.clock;
    this.#presenceReader = dependencies.presenceReader;
    this.#legacyHangulV1GameProjector =
      dependencies.legacyHangulV1GameProjector;
  }

  async project(
    input: ProjectLobbyStateSnapshotInput,
  ): Promise<StateSnapshot> {
    if (
      !input.room.players.some(
        (player) => player.playerId === input.selfPlayerId,
      )
    ) {
      throw new Error("Snapshot self Player is not present in the Room.");
    }
    if (input.room.gameType !== LEGACY_V1_DEFAULT_GAME_TYPE) {
      throw new Error(
        "Unsupported Room gameType for Legacy Hangul v1 projection.",
      );
    }

    const presence = await this.#presenceReader.readRoomPresence(
      input.room.roomId,
    );
    const basePlayers = input.room.players.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      isHost: player.playerId === input.room.hostPlayerId,
      connectionStatus:
        presence.connectionStatusByPlayerId.get(player.playerId) ??
        "OFFLINE",
    }));
    const baseSnapshot = {
      protocolVersion: PROTOCOL_VERSION,
      serverTime: this.#clock.now(),
    };

    if (input.room.phase === "LOBBY") {
      if (input.room.game !== null) {
        throw new Error("LOBBY Room must not contain a GameState.");
      }

      return v.parse(StateSnapshotSchema, {
        ...baseSnapshot,
        versions: {
          roomRevision: input.room.roomRevision,
          gameRevision: null,
          presenceVersion: presence.presenceVersion,
        },
        room: {
          roomId: input.room.roomId,
          roomCode: input.room.roomCode,
          phase: "LOBBY",
          players: basePlayers,
        },
        self: { playerId: input.selfPlayerId },
      });
    }

    if (input.room.game === null) {
      throw new Error("A non-LOBBY Room must contain a GameState.");
    }
    if (input.room.phase !== "PLAYING" && input.room.phase !== "FINISHED") {
      throw new Error("Unsupported Room phase for Game projection.");
    }

    const gameProjection = this.#legacyHangulV1GameProjector({
      phase: input.room.phase,
      playerIds: input.room.players.map((player) => player.playerId),
      selfPlayerId: input.selfPlayerId,
      game: input.room.game,
    });
    if (gameProjection.phase !== input.room.phase) {
      throw new Error("Room phase and Game projection are inconsistent.");
    }

    const playerProgressByPlayerId = new Map(
      gameProjection.playerProgress.map(
        (progress) => [progress.playerId, progress] as const,
      ),
    );
    if (
      playerProgressByPlayerId.size !== gameProjection.playerProgress.length
    ) {
      throw new Error("Game projection contains duplicate Player state.");
    }
    const playingPlayers = basePlayers.map((publicView) => {
      const progress = playerProgressByPlayerId.get(publicView.playerId);
      if (progress === undefined) {
        throw new Error("Game projection is missing a registered Player state.");
      }

      return {
        ...publicView,
        rackCount: progress.rackCount,
        initialMeldCompleted: progress.initialMeldCompleted,
        forfeited: progress.forfeited,
      };
    });

    return v.parse(StateSnapshotSchema, {
      ...baseSnapshot,
      versions: {
        roomRevision: input.room.roomRevision,
        gameRevision: gameProjection.gameRevision,
        presenceVersion: presence.presenceVersion,
      },
      room: {
        roomId: input.room.roomId,
        roomCode: input.room.roomCode,
        phase: gameProjection.phase,
        players: playingPlayers,
      },
      game: gameProjection.game,
      self: {
        playerId: input.selfPlayerId,
        rack: gameProjection.privateRack,
      },
    });
  }
}

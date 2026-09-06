import {
  PLATFORM_SNAPSHOT_VERSION,
  PlatformSnapshotV2Schema,
  type PlatformSnapshotV2,
  type PlayerId,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type { NumberTileV2GameProjector } from "../games/number-tile/compatibility/number-tile-v2-game-projector.js";
import type { RoomRecord } from "../model/persistence.js";
import type { PlayerPresenceReader } from "../ports/player-presence-reader.js";
import type { Clock } from "../ports/system.js";
import type { LobbyStateSnapshotProjector } from "./lobby-state-snapshot-projector.js";
import { mapLegacyStateSnapshotV1ToPlatformSnapshotV2 } from "./platform-snapshot-v2-mapper.js";

export type PlatformSnapshotV2ProjectorDependencies = Readonly<{
  clock: Clock;
  presenceReader: PlayerPresenceReader;
  legacyHangulSnapshotProjector: LobbyStateSnapshotProjector;
  numberTileGameProjector: NumberTileV2GameProjector;
}>;

export type ProjectPlatformSnapshotV2Input = Readonly<{
  room: RoomRecord;
  selfPlayerId: PlayerId;
}>;

/**
 * Projects the versioned platform shell while leaving game-private decisions
 * in each concrete game projector. Hangul V2 continues to map the frozen V1
 * projection; Number Tile has no V1 representation.
 */
export class PlatformSnapshotV2Projector {
  readonly #clock: Clock;
  readonly #presenceReader: PlayerPresenceReader;
  readonly #legacyHangulSnapshotProjector: LobbyStateSnapshotProjector;
  readonly #numberTileGameProjector: NumberTileV2GameProjector;

  constructor(dependencies: PlatformSnapshotV2ProjectorDependencies) {
    this.#clock = dependencies.clock;
    this.#presenceReader = dependencies.presenceReader;
    this.#legacyHangulSnapshotProjector =
      dependencies.legacyHangulSnapshotProjector;
    this.#numberTileGameProjector = dependencies.numberTileGameProjector;
  }

  async project(
    input: ProjectPlatformSnapshotV2Input,
  ): Promise<PlatformSnapshotV2> {
    if (
      !input.room.players.some(
        (player) => player.playerId === input.selfPlayerId,
      )
    ) {
      throw new Error("Snapshot self Player is not present in the Room.");
    }

    if (input.room.gameType === "HANGUL_TILE") {
      const legacySnapshot = await this.#legacyHangulSnapshotProjector.project(
        input,
      );
      return mapLegacyStateSnapshotV1ToPlatformSnapshotV2({
        canonicalGameType: input.room.gameType,
        snapshot: legacySnapshot,
      });
    }

    const presence = await this.#presenceReader.readRoomPresence(
      input.room.roomId,
    );
    const roomPlayers = input.room.players.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      isHost: player.playerId === input.room.hostPlayerId,
      connectionStatus:
        presence.connectionStatusByPlayerId.get(player.playerId) ?? "OFFLINE",
    }));
    const base = {
      snapshotVersion: PLATFORM_SNAPSHOT_VERSION,
      versions: {
        roomRevision: input.room.roomRevision,
        presenceVersion: presence.presenceVersion,
      },
      serverTime: this.#clock.now(),
      room: {
        roomId: input.room.roomId,
        roomCode: input.room.roomCode,
        gameType: input.room.gameType,
        players: roomPlayers,
      },
      self: { playerId: input.selfPlayerId },
    } as const;

    if (input.room.phase === "LOBBY") {
      if (input.room.game !== null) {
        throw new Error("LOBBY Room must not contain a GameState.");
      }
      return v.parse(PlatformSnapshotV2Schema, {
        ...base,
        room: { ...base.room, phase: "LOBBY" },
        game: null,
      });
    }

    if (input.room.game === null) {
      throw new Error("A non-LOBBY Room must contain a GameState.");
    }
    const playerIds = input.room.players.map((player) => player.playerId);
    if (input.room.phase === "PLAYING") {
      if (input.room.game.turn === null || input.room.game.result !== null) {
        throw new Error(
          "PLAYING Number Tile Room requires an active GameState.",
        );
      }
      const game = this.#numberTileGameProjector({
        phase: "PLAYING",
        playerIds,
        selfPlayerId: input.selfPlayerId,
        game: input.room.game,
      });
      return v.parse(PlatformSnapshotV2Schema, {
        ...base,
        room: { ...base.room, phase: "PLAYING" },
        game,
      });
    }
    if (
      input.room.phase !== "FINISHED" ||
      input.room.game.turn !== null ||
      input.room.game.result === null
    ) {
      throw new Error("FINISHED Number Tile Room requires a terminal GameState.");
    }
    const game = this.#numberTileGameProjector({
      phase: "FINISHED",
      playerIds,
      selfPlayerId: input.selfPlayerId,
      game: input.room.game,
    });
    return v.parse(PlatformSnapshotV2Schema, {
      ...base,
      room: { ...base.room, phase: "FINISHED" },
      game,
    });
  }
}

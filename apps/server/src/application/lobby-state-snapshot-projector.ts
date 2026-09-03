import {
  PROTOCOL_VERSION,
  StateSnapshotSchema,
  type PlayerId,
  type StateSnapshot,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type { BoardTilePlacement } from "../domain/game/board.js";
import { JOKER_ALLOWED_SYMBOLS } from "../domain/game/tile-inventory.js";
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
}>;

export type ProjectLobbyStateSnapshotInput = Readonly<{
  room: RoomRecord;
  selfPlayerId: PlayerId;
}>;

export class LobbyStateSnapshotProjector {
  readonly #clock: Clock;
  readonly #presenceReader: PlayerPresenceReader;

  constructor(dependencies: LobbyStateSnapshotProjectorDependencies) {
    this.#clock = dependencies.clock;
    this.#presenceReader = dependencies.presenceReader;
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

    const game = input.room.game;
    if (
      (input.room.phase === "PLAYING" &&
        (game.turn === null || game.result !== null)) ||
      (input.room.phase === "FINISHED" &&
        (game.turn !== null || game.result === null))
    ) {
      throw new Error("Room phase and canonical GameState are inconsistent.");
    }
    if (input.room.phase !== "PLAYING" && input.room.phase !== "FINISHED") {
      throw new Error("Unsupported Room phase for Game projection.");
    }
    const rack = game.racks.get(input.selfPlayerId);
    if (rack === undefined) {
      throw new Error("Snapshot self Player has no canonical rack.");
    }

    const playingPlayers = input.room.players.map((player, index) => {
      const publicView = basePlayers[index];
      const playerRack = game.racks.get(player.playerId);
      const initialMeldCompleted = game.initialMeldCompleted.get(
        player.playerId,
      );
      if (
        publicView === undefined ||
        playerRack === undefined ||
        initialMeldCompleted === undefined
      ) {
        throw new Error("GameState is missing a registered Player state.");
      }
      return {
        ...publicView,
        rackCount: playerRack.length,
        initialMeldCompleted,
      };
    });

    const privateRack = rack.map((tileId) => {
      const tile = game.tilesById.get(tileId);
      if (tile === undefined) {
        throw new Error("Rack contains an unknown Tile.");
      }
      return tile.kind === "JOKER"
        ? {
            tileId: tile.tileId,
            kind: tile.kind,
            physicalType: tile.physicalType,
            sourceBag: tile.sourceBag,
            allowedSymbols: [...JOKER_ALLOWED_SYMBOLS],
          }
        : {
            tileId: tile.tileId,
            kind: tile.kind,
            physicalType: tile.physicalType,
            sourceBag: tile.sourceBag,
            allowedSymbols: [...tile.allowedSymbols],
          };
    });

    const projectBoardPlacement = (placement: BoardTilePlacement) => {
      const tile = game.tilesById.get(placement.tileId);
      if (tile === undefined) {
        throw new Error("Board contains an unknown Tile.");
      }

      return tile.kind === "JOKER"
        ? {
            tileId: tile.tileId,
            kind: tile.kind,
            physicalType: tile.physicalType,
            assignedSymbol: placement.assignedSymbol,
            allowedSymbols: [...JOKER_ALLOWED_SYMBOLS],
          }
        : {
            tileId: tile.tileId,
            kind: tile.kind,
            physicalType: tile.physicalType,
            assignedSymbol: placement.assignedSymbol,
            allowedSymbols: [...tile.allowedSymbols],
          };
    };
    const publicBoard = {
      wordGroups: game.board.wordGroups.map((wordGroup) => ({
        groupId: wordGroup.groupId,
        syllables: wordGroup.syllables.map((syllable) => ({
          choseong: syllable.choseong.map(projectBoardPlacement),
          jungseong: syllable.jungseong.map(projectBoardPlacement),
          jongseong: syllable.jongseong.map(projectBoardPlacement),
        })),
      })),
    };

    const commonSnapshot = {
      ...baseSnapshot,
      versions: {
        roomRevision: input.room.roomRevision,
        gameRevision: game.gameRevision,
        presenceVersion: presence.presenceVersion,
      },
      room: {
        roomId: input.room.roomId,
        roomCode: input.room.roomCode,
        players: playingPlayers,
      },
      game: {
        gameId: game.gameId,
        board: publicBoard,
        turnOrder: game.turnOrder,
        bagCounts: {
          consonant: game.consonantBag.length,
          vowel: game.vowelBag.length,
        },
      },
      self: {
        playerId: input.selfPlayerId,
        rack: privateRack,
      },
    };

    if (input.room.phase === "PLAYING" && game.turn !== null) {
      return v.parse(StateSnapshotSchema, {
        ...commonSnapshot,
        room: {
          ...commonSnapshot.room,
          phase: "PLAYING",
        },
        game: {
          ...commonSnapshot.game,
          turn: game.turn,
        },
      });
    }

    if (input.room.phase === "FINISHED" && game.result !== null) {
      return v.parse(StateSnapshotSchema, {
        ...commonSnapshot,
        room: {
          ...commonSnapshot.room,
          phase: "FINISHED",
        },
        game: {
          ...commonSnapshot.game,
          result: {
            reason: game.result.reason,
            winnerPlayerId: game.result.winnerPlayerId,
            scores: game.result.scores.map(({ playerId, score }) => ({
              playerId,
              score,
            })),
            finishedAt: game.result.finishedAt,
          },
        },
      });
    }

    throw new Error("Room phase and canonical GameState are inconsistent.");
  }
}

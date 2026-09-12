import { projectSpaceCrew } from "../games/space-crew/compatibility/projector.js";
import { BURGUNDY_DEFAULT_SETTINGS } from "@hangul-rummikub/shared";
import { CITY_DEFAULT_SETTINGS } from "@hangul-rummikub/shared";
import { projectIsland } from "../games/island/compatibility/projector.js";
import { projectSplendor } from "../games/splendor/compatibility/projector.js";
import { projectTrain } from "../games/train/compatibility/projector.js";
import { projectCentury } from "../games/century/compatibility/projector.js";
import { projectJaipur } from "../games/jaipur/compatibility/projector.js";
import { projectLoveLetter } from "../games/love-letter/compatibility/projector.js";
import { projectGuryongtu } from "../games/guryongtu/compatibility/projector.js";
import { projectAzul } from "../games/azul/compatibility/projector.js";
import { projectVegas } from "../games/vegas/compatibility/projector.js";
import { projectBurgundy } from "../games/burgundy/compatibility/projector.js";
import { projectCarcassonne } from "../games/carcassonne/compatibility/projector.js";
import { projectClue } from "../games/clue/compatibility/projector.js";
import { projectDuet } from "../games/word-duet/compatibility/projector.js";
import { projectSaboteur } from "../games/saboteur/compatibility/projector.js";
import { projectLostCities } from "../games/lost-cities/compatibility/projector.js";
import { projectHalli } from "../games/halli-galli/compatibility/projector.js";
import { projectWolf } from "../games/wolf-night/compatibility/projector.js";
import { projectLiar } from "../games/liar-game/compatibility/projector.js";
import { projectSpyfall } from "../games/spyfall/compatibility/projector.js";
import type { GemCardV2GameProjector } from "../games/gem-card/compatibility/gem-card-v2-game-projector.js";
import { projectCityRoleV2Game, type CityRoleV2GameProjector } from "../games/city-role/compatibility/city-role-v2-game-projector.js";
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
import { projectRoomParticipants } from "./project-room-participants.js";

export type PlatformSnapshotV2ProjectorDependencies = Readonly<{
  clock: Clock;
  presenceReader: PlayerPresenceReader;
  legacyHangulSnapshotProjector: LobbyStateSnapshotProjector;
  numberTileGameProjector: NumberTileV2GameProjector;
  gemCardGameProjector: GemCardV2GameProjector;
  cityRoleGameProjector?: CityRoleV2GameProjector;
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
  readonly #gemCardGameProjector: GemCardV2GameProjector;
  readonly #cityRoleGameProjector: CityRoleV2GameProjector;

  constructor(dependencies: PlatformSnapshotV2ProjectorDependencies) {
    this.#gemCardGameProjector = dependencies.gemCardGameProjector;
    this.#cityRoleGameProjector = dependencies.cityRoleGameProjector ?? projectCityRoleV2Game;
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

    if (input.room.gameType === "HANGUL_TILE" && input.room.phase !== "LOBBY") {
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
    const roomPlayers = projectRoomParticipants(
      input.room.players,
      input.room.hostPlayerId,
      presence.connectionStatusByPlayerId,
    ).map(player => input.room.phase === "LOBBY" && input.room.readyPlayerIds !== undefined
      ? { ...player, isReady: input.room.readyPlayerIds.includes(player.playerId) } : player);
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
        room: { ...base.room, phase: "LOBBY", ...(input.room.gameType === "BURGUNDY" ? {settings:input.room.settings??BURGUNDY_DEFAULT_SETTINGS} : {}), ...(input.room.gameType === "LIAR_GAME" ? { settings: input.room.settings ?? { category: "RANDOM", discussionSeconds: 90 } } : {}), ...(input.room.gameType === "SPYFALL" ? { settings: input.room.settings ?? { roundSeconds: 480, useRoles: false, locationPack: "ALL" } } : {}), ...(input.room.gameType === "SPLENDOR" ? {settings:input.room.settings??{mode:"BASE"}} : {}), ...(input.room.gameType === "LOST_CITIES" ? {settings:input.room.settings??{mode:"BASE"}} : {}), ...(input.room.gameType === "CITY_ROLE" ? { settings: input.room.settings ?? CITY_DEFAULT_SETTINGS } : {}), ...(input.room.gameType === "WOLF_NIGHT" ? { settings: input.room.settings ?? { roles: null, discussionSeconds: 180 } } : {}), ...(input.room.gameType === "SNEAKY_LUNCH" ? { settings: input.room.settings ?? { lunchboxCount: 3, difficulty: "NORMAL" } } : {}), ...(input.room.gameType === "DRAW_RELAY" ? {promptMode:input.room.promptMode ?? "MIXED",drawSeconds:input.room.drawSeconds ?? 90} : {}) },
        game: null,
      });
    }

    if (input.room.gameType === "HANGUL_TILE") throw new Error("Unexpected Hangul projection route.");
    if (input.room.game === null) {
      throw new Error("A non-LOBBY Room must contain a GameState.");
    }
    const playerIds = input.room.players.map((player) => player.playerId);
    if(input.room.gameType === "ISLAND_SETTLERS") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectIsland(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "SPLENDOR") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectSplendor(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "TRAIN") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectTrain(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "CENTURY") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectCentury(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "SPACE_CREW") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectSpaceCrew(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "JAIPUR") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectJaipur(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "LOVE_LETTER") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectLoveLetter(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "GURYONGTU") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectGuryongtu(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "AZUL") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectAzul(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "VEGAS") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectVegas(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "BURGUNDY") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase,settings:input.room.settings??BURGUNDY_DEFAULT_SETTINGS},game:projectBurgundy(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "CARCASSONNE") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectCarcassonne(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "CLUE") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectClue(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "WORD_DUET") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectDuet(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "SABOTEUR") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectSaboteur(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "LOST_CITIES") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase,settings:input.room.settings??{mode:"BASE"}},game:projectLostCities(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "HALLI_GALLI") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectHalli(input.room.game)});
    if(input.room.gameType === "WOLF_NIGHT") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectWolf(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "LIAR_GAME") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectLiar(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "SPYFALL") return v.parse(PlatformSnapshotV2Schema, {...base,room:{...base.room,phase:input.room.phase},game:projectSpyfall(input.room.game,input.selfPlayerId)});
    if(input.room.gameType === "SNEAKY_LUNCH") return v.parse(PlatformSnapshotV2Schema, {...base, room:{...base.room,phase:input.room.phase},game:projectSneakyLunch(input.room.game)});
    if(input.room.gameType === "DRAW_RELAY") return v.parse(PlatformSnapshotV2Schema,{...base,room:{...base.room,phase:input.room.phase},game:projectDrawRelay(input.room.game,input.selfPlayerId)});
    if (input.room.gameType === "CITY_ROLE") {
      const game = this.#cityRoleGameProjector({ phase: input.room.phase, playerIds, selfPlayerId: input.selfPlayerId, game: input.room.game });
      return v.parse(PlatformSnapshotV2Schema, { ...base, room: { ...base.room, phase: input.room.phase }, game });
    }
    if (input.room.gameType === "GEM_CARD") {
      const game = this.#gemCardGameProjector({ phase: input.room.phase, playerIds, selfPlayerId: input.selfPlayerId, game: input.room.game });
      return v.parse(PlatformSnapshotV2Schema, { ...base, room: { ...base.room, phase: input.room.phase }, game });
    }
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
import { projectSneakyLunch } from "../games/sneaky-lunch/compatibility/projector.js";
import { projectDrawRelay } from "../games/draw-relay/compatibility/projector.js";

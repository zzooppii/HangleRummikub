import type { createIslandLifecycle } from "../games/island/application/lifecycle.js";
import type { createSplendorLifecycle } from "../games/splendor/application/lifecycle.js";
import type { createJaipurLifecycle } from "../games/jaipur/application/lifecycle.js";
import type { createGuryongtuLifecycle } from "../games/guryongtu/application/lifecycle.js";
import type { createAzulLifecycle } from "../games/azul/application/lifecycle.js";
import type { createClueLifecycle } from "../games/clue/application/lifecycle.js";
import type { createDuetLifecycle } from "../games/word-duet/application/lifecycle.js";
import type { createSaboteurLifecycle } from "../games/saboteur/application/lifecycle.js";
import type { createLostCitiesLifecycle } from "../games/lost-cities/application/lifecycle.js";
import type { createHalliLifecycle } from "../games/halli-galli/application/lifecycle.js";
import type { createWolfLifecycle } from "../games/wolf-night/application/lifecycle.js";
import type { createLiarLifecycle } from "../games/liar-game/application/lifecycle.js";
import type { createSpyfallLifecycle } from "../games/spyfall/application/lifecycle.js";
import type { createSneakyLifecycle } from "../games/sneaky-lunch/application/lifecycle.js";
import type { DrawRelayStoredGame } from "../games/draw-relay/compatibility/adapter.js";
import type { createDrawRelayLifecycle } from "../games/draw-relay/application/lifecycle.js";
import type { PlayingGemGameState } from "../games/gem-card/domain/game-state.js";
import type { CityRoleStoredGame } from "../games/city-role/compatibility/city-role-game-state-adapter.js";
import type { CityRolePlayerLifecycleActionRouting, CityRolePlayingLeaveActionResult } from "../games/city-role/application/city-role-player-lifecycle-actions.js";
import type { GemCardPlayerLifecycleActionRouting, GemCardPlayingLeaveActionResult } from "../games/gem-card/application/gem-card-player-lifecycle-actions.js";
import type {
  GameId,
  GameRevision,
  PlayerId,
  ServerTime,
} from "@hangul-rummikub/shared";

import type { PlayingGameState } from "../games/hangul-tile/domain/game-state.js";
import type {
  LegacyHangulPlayerLifecycleActionRouting,
  LegacyHangulPlayingLeaveActionResult,
} from "../games/hangul-tile/compatibility/legacy-hangul-player-lifecycle-actions.js";
import type { PlayingNumberTileGameState } from "../games/number-tile/domain/game-state.js";
import type {
  NumberTilePlayerLifecycleActionRouting,
  NumberTilePlayingLeaveActionResult,
} from "../games/number-tile/application/number-tile-player-lifecycle-actions.js";
import type { RoomRecord } from "../model/persistence.js";

export type PlayingLeaveAdvisory =
  | "NONE"
  | "TURN_STARTED"
  | "GAME_FINISHED";

export type PlayingLeaveActionResult =
  | LegacyHangulPlayingLeaveActionResult
  | NumberTilePlayingLeaveActionResult
  | GemCardPlayingLeaveActionResult
  | CityRolePlayingLeaveActionResult;

export type PresenceRestoredPlan =
  | Readonly<{ status: "RESET"; gameType: "DRAW_RELAY"; game: DrawRelayStoredGame; gameId: GameId; gameRevision: GameRevision; previousOfflineTimeoutStreak: number }>
  | Readonly<{ status: "RESET"; gameType: "CITY_ROLE"; game: CityRoleStoredGame; gameId: GameId; gameRevision: GameRevision; previousOfflineTimeoutStreak: number }>
  | Readonly<{ status: "RESET"; gameType: "GEM_CARD"; game: PlayingGemGameState; gameId: GameId; gameRevision: GameRevision; previousOfflineTimeoutStreak: number }>
  | Readonly<{ status: "NO_CHANGE" }>
  | Readonly<{
      status: "RESET";
      gameType: "HANGUL_TILE";
      game: PlayingGameState;
      gameId: GameId;
      gameRevision: GameRevision;
      previousOfflineTimeoutStreak: number;
    }>
  | Readonly<{
      status: "RESET";
      gameType: "NUMBER_TILE";
      game: PlayingNumberTileGameState;
      gameId: GameId;
      gameRevision: GameRevision;
      previousOfflineTimeoutStreak: number;
    }>;

export type PlayerLifecycleRouterDependencies = Readonly<{
  island?: ReturnType<typeof createIslandLifecycle>;
  splendor?: ReturnType<typeof createSplendorLifecycle>;
  jaipur?: ReturnType<typeof createJaipurLifecycle>;
  guryongtu?: ReturnType<typeof createGuryongtuLifecycle>;
  azul?: ReturnType<typeof createAzulLifecycle>;
  clue?: ReturnType<typeof createClueLifecycle>;
  duet?: ReturnType<typeof createDuetLifecycle>;
  saboteur?: ReturnType<typeof createSaboteurLifecycle>;
  lostCities?: ReturnType<typeof createLostCitiesLifecycle>;
  halli?: ReturnType<typeof createHalliLifecycle>;
  wolf?: ReturnType<typeof createWolfLifecycle>;
  liar?: ReturnType<typeof createLiarLifecycle>;
  spyfall?: ReturnType<typeof createSpyfallLifecycle>;
  sneaky?: ReturnType<typeof createSneakyLifecycle>;
  drawRelay?: ReturnType<typeof createDrawRelayLifecycle>;
  hangul: LegacyHangulPlayerLifecycleActionRouting;
  numberTile: NumberTilePlayerLifecycleActionRouting;
  gemCard: GemCardPlayerLifecycleActionRouting;
  cityRole: CityRolePlayerLifecycleActionRouting;
}>;

export interface PlayerLifecycleActionRouting {
  applyPlayingLeave(input: {
    room: RoomRecord;
    actorPlayerId: PlayerId;
    occurredAt: ServerTime;
  }): PlayingLeaveActionResult;
  planPresenceRestored(
    room: RoomRecord,
    playerId: PlayerId,
  ): PresenceRestoredPlan;
}

/** Dispatches platform lifecycle orchestration by immutable Room gameType. */
export class PlayerLifecycleRouter implements PlayerLifecycleActionRouting {
  readonly #island: ReturnType<typeof createIslandLifecycle> | undefined;
  readonly #splendor: ReturnType<typeof createSplendorLifecycle> | undefined;
  readonly #jaipur: ReturnType<typeof createJaipurLifecycle> | undefined;
  readonly #guryongtu: ReturnType<typeof createGuryongtuLifecycle> | undefined;
  readonly #azul: ReturnType<typeof createAzulLifecycle> | undefined;
  readonly #clue: ReturnType<typeof createClueLifecycle> | undefined;
  readonly #duet: ReturnType<typeof createDuetLifecycle> | undefined;
  readonly #saboteur: ReturnType<typeof createSaboteurLifecycle> | undefined;
  readonly #lostCities: ReturnType<typeof createLostCitiesLifecycle> | undefined;
  readonly #halli: ReturnType<typeof createHalliLifecycle> | undefined;
  readonly #wolf: ReturnType<typeof createWolfLifecycle> | undefined;
  readonly #liar: ReturnType<typeof createLiarLifecycle> | undefined;
  readonly #spyfall: ReturnType<typeof createSpyfallLifecycle> | undefined;
  readonly #sneaky: ReturnType<typeof createSneakyLifecycle> | undefined;
  readonly #drawRelay: ReturnType<typeof createDrawRelayLifecycle> | undefined;
  readonly #hangul: LegacyHangulPlayerLifecycleActionRouting;
  readonly #numberTile: NumberTilePlayerLifecycleActionRouting;
  readonly #gemCard: GemCardPlayerLifecycleActionRouting;
  readonly #cityRole: CityRolePlayerLifecycleActionRouting;

  constructor(dependencies: PlayerLifecycleRouterDependencies) {
    if (dependencies.hangul.gameType !== "HANGUL_TILE") {
      throw new Error("Missing HANGUL_TILE player lifecycle capability.");
    }
    if (dependencies.numberTile.gameType !== "NUMBER_TILE") {
      throw new Error("Missing NUMBER_TILE player lifecycle capability.");
    }
    this.#island = dependencies.island;
    this.#splendor = dependencies.splendor;
    this.#jaipur = dependencies.jaipur;
    this.#guryongtu = dependencies.guryongtu;
    this.#azul = dependencies.azul;
    this.#clue = dependencies.clue;
    this.#duet = dependencies.duet;
    this.#saboteur = dependencies.saboteur;
    this.#lostCities = dependencies.lostCities;
    this.#halli = dependencies.halli;
    this.#wolf = dependencies.wolf;
    this.#liar = dependencies.liar;
    this.#spyfall = dependencies.spyfall;
    this.#sneaky = dependencies.sneaky;
    this.#drawRelay = dependencies.drawRelay;
    this.#hangul = dependencies.hangul;
    this.#numberTile = dependencies.numberTile;
    if (dependencies.gemCard.gameType !== "GEM_CARD") throw new Error("Missing GEM_CARD lifecycle capability.");
    this.#gemCard = dependencies.gemCard;
    if (dependencies.cityRole.gameType !== "CITY_ROLE") throw new Error("Missing CITY_ROLE lifecycle capability.");
    this.#cityRole = dependencies.cityRole;
    Object.freeze(this);
  }

  applyPlayingLeave(input: {
    room: RoomRecord;
    actorPlayerId: PlayerId;
    occurredAt: ServerTime;
  }): PlayingLeaveActionResult {
    switch (input.room.gameType) {
      case "ISLAND_SETTLERS":
        if (!this.#island) throw new Error("ISLAND lifecycle missing.");
        return this.#island.applyPlayingLeave(input);
      case "SPLENDOR":
        if (!this.#splendor) throw new Error("SPLENDOR lifecycle missing.");
        return this.#splendor.applyPlayingLeave(input);
      case "SABOTEUR":
        if (!this.#saboteur) throw new Error("SABOTEUR lifecycle missing.");
        return this.#saboteur.applyPlayingLeave(input);
      case "JAIPUR":
        if (!this.#jaipur) throw new Error("JAIPUR lifecycle missing.");
        return this.#jaipur.applyPlayingLeave(input);
      case "GURYONGTU":
        if (!this.#guryongtu) throw new Error("GURYONGTU lifecycle missing.");
        return this.#guryongtu.applyPlayingLeave(input);
      case "AZUL":
        if (!this.#azul) throw new Error("AZUL lifecycle missing.");
        return this.#azul.applyPlayingLeave(input);
      case "CLUE":
        if (!this.#clue) throw new Error("CLUE lifecycle missing.");
        return this.#clue.applyPlayingLeave(input);
      case "WORD_DUET":
        if (!this.#duet) throw new Error("WORD_DUET lifecycle missing.");
        return this.#duet.applyPlayingLeave(input);
      case "LOST_CITIES":
        if (!this.#lostCities) throw new Error("LOST_CITIES lifecycle missing.");
        return this.#lostCities.applyPlayingLeave(input);
      case "HALLI_GALLI":
        if (!this.#halli) throw new Error("HALLI lifecycle missing.");
        return this.#halli.applyPlayingLeave(input);
      case "WOLF_NIGHT":
        if (!this.#wolf) throw new Error("WOLF lifecycle missing.");
        return this.#wolf.applyPlayingLeave(input);
      case "LIAR_GAME":
        if (!this.#liar) throw new Error("LIAR lifecycle missing.");
        return this.#liar.applyPlayingLeave(input);
      case "SPYFALL":
        if (!this.#spyfall) throw new Error("SPYFALL lifecycle missing.");
        return this.#spyfall.applyPlayingLeave(input);
      case "SNEAKY_LUNCH":
        if (!this.#sneaky) throw new Error("SNEAKY lifecycle missing.");
        return this.#sneaky.applyPlayingLeave(input);
      case "DRAW_RELAY":
        if (!this.#drawRelay) throw new Error("DRAW lifecycle missing.");
        return this.#drawRelay.applyPlayingLeave(input);
      case "HANGUL_TILE":
        return this.#hangul.applyPlayingLeave(input);
      case "NUMBER_TILE":
        return this.#numberTile.applyPlayingLeave(input);
      case "GEM_CARD":
        return this.#gemCard.applyPlayingLeave(input);
      case "CITY_ROLE":
        return this.#cityRole.applyPlayingLeave(input);
    }
  }

  planPresenceRestored(
    room: RoomRecord,
    playerId: PlayerId,
  ): PresenceRestoredPlan {
    switch (room.gameType) {
      case "ISLAND_SETTLERS": return {status:"NO_CHANGE"};
      case "SPLENDOR": return {status:"NO_CHANGE"};
      case "JAIPUR": return {status:"NO_CHANGE"};
      case "GURYONGTU": return {status:"NO_CHANGE"};
      case "AZUL": return {status:"NO_CHANGE"};
      case "CLUE": return {status:"NO_CHANGE"};
      case "WORD_DUET": return {status:"NO_CHANGE"};
      case "SABOTEUR": return {status:"NO_CHANGE"};
      case "LOST_CITIES": return {status:"NO_CHANGE"};
      case "HALLI_GALLI": return {status:"NO_CHANGE"};
      case "WOLF_NIGHT": return {status:"NO_CHANGE"};
      case "LIAR_GAME": return {status:"NO_CHANGE"};
      case "SPYFALL": return {status:"NO_CHANGE"};
      case "SNEAKY_LUNCH": return {status:"NO_CHANGE"};
      case "DRAW_RELAY":
        if (!this.#drawRelay) throw new Error("DRAW lifecycle missing.");
        return this.#drawRelay.planPresenceRestored(room, playerId);
      case "CITY_ROLE": {
        const plan = this.#cityRole.planPresenceRestored(room, playerId);
        return plan.status === "RESET" ? Object.freeze({ ...plan, gameType: room.gameType }) : plan;
      }
      case "HANGUL_TILE": {
        const plan = this.#hangul.planPresenceRestored(room, playerId);
        return plan.status === "RESET"
          ? Object.freeze({ ...plan, gameType: room.gameType })
          : plan;
      }
      case "GEM_CARD": {
        const plan = this.#gemCard.planPresenceRestored(room, playerId);
        return plan.status === "RESET" ? Object.freeze({ ...plan, gameType: room.gameType }) : plan;
      }
      case "NUMBER_TILE": {
        const plan = this.#numberTile.planPresenceRestored(room, playerId);
        return plan.status === "RESET"
          ? Object.freeze({ ...plan, gameType: room.gameType })
          : plan;
      }
    }
  }
}

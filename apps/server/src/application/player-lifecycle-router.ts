import type { PlayingGemGameState } from "../games/gem-card/domain/game-state.js";
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
  | GemCardPlayingLeaveActionResult;

export type PresenceRestoredPlan =
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
  hangul: LegacyHangulPlayerLifecycleActionRouting;
  numberTile: NumberTilePlayerLifecycleActionRouting;
  gemCard: GemCardPlayerLifecycleActionRouting;
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
  readonly #hangul: LegacyHangulPlayerLifecycleActionRouting;
  readonly #numberTile: NumberTilePlayerLifecycleActionRouting;
  readonly #gemCard: GemCardPlayerLifecycleActionRouting;

  constructor(dependencies: PlayerLifecycleRouterDependencies) {
    if (dependencies.hangul.gameType !== "HANGUL_TILE") {
      throw new Error("Missing HANGUL_TILE player lifecycle capability.");
    }
    if (dependencies.numberTile.gameType !== "NUMBER_TILE") {
      throw new Error("Missing NUMBER_TILE player lifecycle capability.");
    }
    this.#hangul = dependencies.hangul;
    this.#numberTile = dependencies.numberTile;
    if (dependencies.gemCard.gameType !== "GEM_CARD") throw new Error("Missing GEM_CARD lifecycle capability.");
    this.#gemCard = dependencies.gemCard;
    Object.freeze(this);
  }

  applyPlayingLeave(input: {
    room: RoomRecord;
    actorPlayerId: PlayerId;
    occurredAt: ServerTime;
  }): PlayingLeaveActionResult {
    switch (input.room.gameType) {
      case "HANGUL_TILE":
        return this.#hangul.applyPlayingLeave(input);
      case "NUMBER_TILE":
        return this.#numberTile.applyPlayingLeave(input);
      case "GEM_CARD":
        return this.#gemCard.applyPlayingLeave(input);
    }
  }

  planPresenceRestored(
    room: RoomRecord,
    playerId: PlayerId,
  ): PresenceRestoredPlan {
    switch (room.gameType) {
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

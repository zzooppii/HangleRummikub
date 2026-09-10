import { CITY_ALL_ROLE_IDS } from "../domain/role.js";
import { TurnIdSchema, type GameId, type GameRevision, type PlayerId, type ServerTime } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { CurrentTurnIdentity } from "../../../application/turn-transition.js";
import type { RoomRecord, RoomWriteCandidate } from "../../../model/persistence.js";
import type { IdGenerator } from "../../../ports/system.js";
import type { CityRoleStoredGame } from "../compatibility/city-role-game-state-adapter.js";
import { parseCityPlayerId } from "../domain/identity.js";
import { forfeitCityPlayers, resetCityOfflineStreak } from "../domain/rule-engine.js";
import { asCityPlayingRoom } from "./city-role-command-service.js";
import { CityRoleEntropySource, cityDomainEntropy } from "./city-role-entropy.js";
import { transitionCityRoom } from "./city-role-transition.js";

export type CityRolePlayingLeaveActionResult = Readonly<{ candidate: RoomWriteCandidate; nextTurnIdentity: CurrentTurnIdentity | null; finishedGameId: GameId | null; advisory: "NONE" }>;
export type CityRolePresenceRestoredPlan = Readonly<{ status: "NO_CHANGE" }> | Readonly<{ status: "RESET"; game: CityRoleStoredGame; gameId: GameId; gameRevision: GameRevision; previousOfflineTimeoutStreak: number }>;
export interface CityRolePlayerLifecycleActionRouting {
  readonly gameType: "CITY_ROLE";
  applyPlayingLeave(input: { room: RoomRecord; actorPlayerId: PlayerId; occurredAt: ServerTime }): CityRolePlayingLeaveActionResult;
  planPresenceRestored(room: RoomRecord, playerId: PlayerId): CityRolePresenceRestoredPlan;
}
export function createCityRolePlayerLifecycleActions(ids: IdGenerator): CityRolePlayerLifecycleActionRouting {
  return Object.freeze({
    gameType: "CITY_ROLE",
    applyPlayingLeave(input: { room: RoomRecord; actorPlayerId: PlayerId; occurredAt: ServerTime }): CityRolePlayingLeaveActionResult {
      const room = asCityPlayingRoom(input.room);
      if (!room) throw new Error("CITY leave requires a playing CITY room.");
      const actor = room.game.state.players.find(player => String(player.playerId) === input.actorPlayerId);
      if (!actor) throw new Error("CITY leave player missing.");
      if (actor.forfeited) return { candidate: { ...room, updatedAt: input.occurredAt }, nextTurnIdentity: null, finishedGameId: null, advisory: "NONE" };
      const random = new CityRoleEntropySource(room.game.entropySeed, room.game.entropyCounter);
      const pending = room.game.state.pendingChoice?.ownerPlayerId === actor.playerId ? room.game.state.pendingChoice.cards : [];
      const discard = [...room.game.state.discard, ...actor.hand, ...pending];
      const state = forfeitCityPlayers(room.game.state, [actor.playerId], cityDomainEntropy(ids, random, discard, CITY_ALL_ROLE_IDS.slice(0, room.game.state.expansion?.settings.roles.length ?? 8)));
      const candidate = transitionCityRoom(room, state, input.occurredAt, random.counter);
      const game = candidate.game;
      return { candidate, advisory: "NONE", finishedGameId: state.window === null ? game.gameId : null,
        nextTurnIdentity: state.window === null ? null : { roomId: room.roomId, gameId: game.gameId, gameRevision: game.gameRevision, turnId: parse(TurnIdSchema, state.window.actionId) } };
    },
    planPresenceRestored(room: RoomRecord, playerId: PlayerId): CityRolePresenceRestoredPlan {
      if (room.gameType !== "CITY_ROLE") throw new Error("CITY presence gameType mismatch.");
      const playing = asCityPlayingRoom(room);
      const player = playing?.game.state.players.find(candidate => String(candidate.playerId) === playerId);
      if (!playing || !player || player.forfeited || player.offlineTimeoutStreak === 0) return { status: "NO_CHANGE" };
      const game = Object.freeze({ ...playing.game, state: resetCityOfflineStreak(playing.game.state, parseCityPlayerId(playerId)) });
      return { status: "RESET", game, gameId: game.gameId, gameRevision: game.gameRevision, previousOfflineTimeoutStreak: player.offlineTimeoutStreak };
    },
  });
}

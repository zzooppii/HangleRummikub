import { CityRolePlayingProjectionV2Schema, CityRoleFinishedProjectionV2Schema, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { getCityTemplate } from "../domain/cardset-v1.js";
import type { BuildingCardId } from "../domain/identity.js";
import type { CityRoleStoredGame } from "./city-role-game-state-adapter.js";

/** Explicit viewer whitelist. Never spread a player, role assignment or stored game. */
export function projectCityRoleV2Game(input: {
  phase: "PLAYING" | "FINISHED";
  game: CityRoleStoredGame;
  playerIds: readonly PlayerId[];
  selfPlayerId: PlayerId;
}) {
  const { state } = input.game;
  if (!input.playerIds.includes(input.selfPlayerId) || new Set(input.playerIds).size !== state.players.length || input.playerIds.length !== state.players.length || state.players.some(player => !input.playerIds.some(id => id === String(player.playerId)))) throw new Error("CITY projection roster mismatch.");
  const self = state.players.find(player => String(player.playerId) === input.selfPlayerId);
  if (!self) throw new Error("CITY projection viewer missing.");
  const card = (cardId: BuildingCardId) => {
    const instance = state.cards.find(value => value.cardId === cardId);
    if (!instance) throw new Error("CITY visible card missing.");
    const template = getCityTemplate(instance.templateId);
    return { cardId, templateId: instance.templateId, name: template.name, category: template.category, cost: template.cost, victoryPoints: template.victoryPoints };
  };
  const privateState = {
    hand: self.hand.map(card),
    selectedRoleIds: state.round.assignments.filter(role => role.playerId === self.playerId).map(role => role.roleId),
    marks: state.marks.filter(mark => mark.sourcePlayerId === self.playerId).map(mark => ({ kind: mark.kind, targetRoleId: mark.targetRoleId, status: mark.status })),
  };
  const common = {
    gameType: "CITY_ROLE", gameId: input.game.gameId, gameRevision: input.game.gameRevision,
    rulesVersion: state.rulesVersion, cardSetVersion: state.cardSetVersion, roleSetVersion: state.roleSetVersion,
    ...(state.landmarkHistory === undefined ? {} : { landmarkHistory: state.landmarkHistory.map(row => ({
      playerId: row.playerId, gardenUsed: row.gardenUsed, sundialUsed: row.sundialUsed,
      staircaseInitialized: row.staircaseInitialized, staircaseRemaining: row.staircaseRemaining,
      staircaseSpent: row.staircaseSpent, lastDiscountRound: row.lastDiscountRound,
    })) }),
    roundNumber: state.round.roundNumber, seatOrder: [...state.seatOrder], leaderPlayerId: state.leaderPlayerId,
    rolesPerPlayer: state.round.rolesPerPlayer, publicRemovedRoleIds: [...state.round.publicRemoved],
    ...(state.roleDraftVersion === undefined ? {} : { roleDraftVersion: state.roleDraftVersion, secretPairDraft: state.round.eligibleAtSetup.length === 2 }),
    revealedRoles: state.revealedRoles.map(role => ({ roundNumber: role.roundNumber, roleId: role.roleId, playerId: role.playerId, kind: role.kind })),
    protectedPlayerIds: [...state.round.protectedPlayerIds],
    firstCompletion: state.firstCompletion === null ? null : { playerId: state.firstCompletion.playerId, roundNumber: state.firstCompletion.roundNumber },
    playerStates: state.players.map(player => ({ playerId: player.playerId, gold: player.gold, handCount: player.hand.length,
      builtBuildings: player.city.map(card), scorePreview: player.city.reduce((sum, id) => sum + card(id).victoryPoints, 0), forfeited: player.forfeited })),
  };
  const ownPending = state.pendingChoice?.ownerPlayerId === self.playerId ? { pendingCards: state.pendingChoice.cards.map(card) } : {};
  if (input.phase === "FINISHED" && state.result !== null && input.game.finishedAt !== null) {
    return parse(CityRoleFinishedProjectionV2Schema, { ...common, phase: "FINISHED", privateState: { ...privateState, ...ownPending },
      result: { reason: state.result.reason, finishedAt: input.game.finishedAt, rankings: state.result.rankings.map(row => ({ ...row })), winnerPlayerIds: state.result.rankings.filter(row => row.winner).map(row => row.playerId) } });
  }
  if (input.phase !== "PLAYING" || state.window === null || input.game.deadlineAt === null || input.game.windowStartedAt === null) throw new Error("CITY projection phase mismatch.");
  const window = { actionId: state.window.actionId, activePlayerId: state.window.activePlayerId, startedAt: input.game.windowStartedAt, deadlineAt: input.game.deadlineAt };
  if (state.window.kind === "ROLE_SELECTION") {
    return parse(CityRolePlayingProjectionV2Schema, { ...common, phase: "ROLE_SELECTION", window,
      privateState: { ...privateState, ...(state.window.activePlayerId === self.playerId ? { availableRoleIds: [...state.round.available] } : {}) } });
  }
  return parse(CityRolePlayingProjectionV2Schema, { ...common, phase: "ROLE_ACTION",
    window: { ...window, activeRoleId: state.window.activeRoleId, waitingFor: state.pendingChoice === null ? "ACTION" : "DRAW_BUILDING_CHOICE" },
    privateState: { ...privateState, ...ownPending, ...(state.window.activePlayerId === self.playerId ? { action: { acquisition: state.window.acquisition, abilityUsed: state.window.abilityUsed, buildingsBuilt: state.window.buildingsBuilt } } : {}) },
  });
}
export type CityRoleV2GameProjector = typeof projectCityRoleV2Game;

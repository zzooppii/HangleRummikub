import { CityRoleLobbyPlatformSnapshotV2Schema, CityRolePlayingPlatformSnapshotV2Schema, CityRoleFinishedPlatformSnapshotV2Schema } from "@hangul-rummikub/shared";
import { parse } from "valibot";

export function cityLobbyFixture(count = 3) {
  return parse(CityRoleLobbyPlatformSnapshotV2Schema, {
    snapshotVersion: 2, versions: { roomRevision: 0, presenceVersion: 0 }, serverTime: 1000,
    room: { roomId: "city-web-room", roomCode: "BCDFGH", gameType: "CITY_ROLE", phase: "LOBBY",
      players: Array.from({ length: count }, (_, index) => ({ playerId: `P${index}`, nickname: `도시${index}`, isHost: index === 0, connectionStatus: "CONNECTED" })) },
    self: { playerId: "P0" }, game: null,
  });
}

const ownCard = { cardId: "city-own-card", templateId: "CB-CIV-01", name: "비표보관소", category: "CIVIC", cost: 1, victoryPoints: 1 };

export function citySelectionFixture(count = 3) {
  const lobby = cityLobbyFixture(count);
  return parse(CityRolePlayingPlatformSnapshotV2Schema, { ...lobby, room: { ...lobby.room, phase: "PLAYING" }, game: {
    gameType: "CITY_ROLE", gameId: "city-web-game", gameRevision: 0,
    rulesVersion: "city-rules-v1", cardSetVersion: "city-cardset-v1", roleSetVersion: "city-roles-v1",
    phase: "ROLE_SELECTION", roundNumber: 1, rolesPerPlayer: count <= 3 ? 2 : 1,
    seatOrder: lobby.room.players.map((player) => player.playerId), leaderPlayerId: "P0",
    playerStates: lobby.room.players.map((player, index) => ({ playerId: player.playerId, gold: 2, handCount: index === 0 ? 1 : 4, builtBuildings: [], scorePreview: 0, forfeited: false })),
    publicRemovedRoleIds: [], revealedRoles: [], protectedPlayerIds: [], firstCompletion: null,
    window: { actionId: "city-selection-window", activePlayerId: "P0", startedAt: 1000, deadlineAt: 46000 },
    privateState: { hand: [ownCard], selectedRoleIds: [], marks: [], availableRoleIds: ["CR-01", "CR-02", "CR-03", "CR-04", "CR-05"] },
  } });
}

export function cityActionFixture(pending = false) {
  const selection = citySelectionFixture();
  const { hand, selectedRoleIds: _roles, marks } = selection.game.privateState;
  return parse(CityRolePlayingPlatformSnapshotV2Schema, { ...selection, game: { ...selection.game, phase: "ROLE_ACTION",
    revealedRoles: [{ roundNumber: 1, roleId: "CR-03", playerId: "P0", kind: "NORMAL" }],
    window: { actionId: "city-action-window", activePlayerId: "P0", activeRoleId: "CR-03", startedAt: 1000, deadlineAt: 91000, waitingFor: pending ? "DRAW_BUILDING_CHOICE" : "ACTION" },
    privateState: { hand, marks, selectedRoleIds: ["CR-03", "CR-06"], action: { acquisition: pending ? "PENDING" : "COMPLETE", abilityUsed: false, buildingsBuilt: 0 },
      ...(pending ? { pendingCards: [{ ...ownCard, cardId: "city-pending-1" }, { ...ownCard, cardId: "city-pending-2" }] } : {}),
    },
  } });
}

export function cityFinishedFixture() {
  const playing = citySelectionFixture(2);
  const { window: _window, privateState: _private, ...common } = playing.game;
  return parse(CityRoleFinishedPlatformSnapshotV2Schema, { ...playing, room: { ...playing.room, phase: "FINISHED" }, game: { ...common, phase: "FINISHED",
    playerStates: common.playerStates.map((player, index) => index === 0 ? player : { ...player, gold: 0, handCount: 0, forfeited: true }),
    privateState: { hand: [ownCard], selectedRoleIds: [], marks: [] },
    result: { reason: "LAST_PLAYER_STANDING", finishedAt: 5000, winnerPlayerIds: ["P0"], rankings: common.playerStates.map((player, index) => ({
      playerId: player.playerId, rank: index + 1, score: 0, buildingVP: 0, completionBonus: 0, diversityBonus: 0, buildingCount: 0, forfeited: index !== 0, winner: index === 0,
    })) },
  } });
}

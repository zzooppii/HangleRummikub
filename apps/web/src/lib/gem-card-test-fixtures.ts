import {
  validatePlatformSnapshotV2,
  type GemCardLobbyPlatformSnapshotV2,
  type GemCardPlayingPlatformSnapshotV2,
  type GemCardFinishedPlatformSnapshotV2,
} from "@hangul-rummikub/shared";

function lobbyData() {
  return {
    snapshotVersion: 2, versions: { roomRevision: 0, presenceVersion: 0 }, serverTime: 1000,
    room: { roomId: "gem-web-room", roomCode: "BCDFGH", gameType: "GEM_CARD", phase: "LOBBY",
      players: ["A", "B", "C"].map((playerId, index) => ({ playerId, nickname: `${playerId}참가자`, isHost: index === 0, connectionStatus: "CONNECTED" })) },
    self: { playerId: "A" }, game: null,
  };
}

export function gemLobbyFixture(): GemCardLobbyPlatformSnapshotV2 {
  const result = validatePlatformSnapshotV2(lobbyData());
  if (!result.ok || result.value.room.gameType !== "GEM_CARD" || result.value.room.phase !== "LOBBY" || result.value.game !== null)
    throw new Error("Invalid GEM Lobby fixture.");
  return result.value as GemCardLobbyPlatformSnapshotV2;
}

export function gemPlayingFixture(): GemCardPlayingPlatformSnapshotV2 {
  const zero = { DAWN: 0, TIDE: 0, GROVE: 0, EMBER: 0, ECHO: 0 };
  const lobby = lobbyData();
  const result = validatePlatformSnapshotV2({ ...lobby, room: { ...lobby.room, phase: "PLAYING" }, game: {
    gameType: "GEM_CARD", gameId: "gem-web-game", gameRevision: 0, rulesVersion: "gem-rules-v1", cardSetVersion: "gem-cardset-v1",
    turnOrder: ["A", "B", "C"], supply: { DAWN: 7, TIDE: 7, GROVE: 7, EMBER: 7, ECHO: 7, PRISM: 5 },
    market: [1, 2, 3].map(tier => ({ tier, remainingDeckCount: 12, slots: [1, 2, 3].map(index => ({
      cardId: `GC-T${tier}-0${index}`, tier, cost: { ...zero, DAWN: 3, EMBER: 2 }, productionResource: "TIDE", victoryPoints: tier - 1,
    })) })),
    playerStates: ["A", "B", "C"].map(playerId => ({ playerId, resources: { ...zero, PRISM: 0 }, production: { ...zero }, purchasedCards: [], reservedCards: [], score: 0, forfeited: false })),
    turn: { turnId: "gem-web-turn", turnNumber: 1, activePlayerId: "A", startedAt: 1000, deadlineAt: 46000 }, fairRound: null,
  } });
  if (!result.ok || result.value.game?.gameType !== "GEM_CARD" || !("turn" in result.value.game)) throw new Error("Invalid GEM Playing fixture.");
  return result.value as GemCardPlayingPlatformSnapshotV2;
}

export function gemFinishedFixture(reason: GemCardFinishedPlatformSnapshotV2["game"]["result"]["reason"] = "LAST_PLAYER_STANDING"): GemCardFinishedPlatformSnapshotV2 {
  const playing = gemPlayingFixture();
  const { turn: _turn, fairRound: _fairRound, ...game } = playing.game;
  const zero = { DAWN: 0, TIDE: 0, GROVE: 0, EMBER: 0, ECHO: 0 };
  const players = game.playerStates.map((player, index) => {
    const tier = index === 0 ? 3 : 2;
    const purchasedCards = index === 2 ? [] : [4, 5, 6, 7].map(card => ({ cardId: `GC-T${tier}-0${card}`, tier, cost: { ...zero, DAWN: 4 }, productionResource: "DAWN", victoryPoints: 5 }));
    return { ...player, purchasedCards, production: { ...zero, DAWN: purchasedCards.length }, score: purchasedCards.length * 5,
      forfeited: reason === "LAST_PLAYER_STANDING" && index !== 0 };
  });
  const result = validatePlatformSnapshotV2({ ...playing, room: { ...playing.room, phase: "FINISHED" }, game: {
    ...game, market: game.market.map(tier => ({ ...tier, remainingDeckCount: tier.tier === 1 ? 12 : 8 })), playerStates: players,
    result: { reason, finishedAt: 46000, winnerPlayerIds: reason === "LAST_PLAYER_STANDING" ? ["A"] : ["A", "B"],
      rankings: players.map((player, index) => ({ playerId: player.playerId, rank: reason === "LAST_PLAYER_STANDING" ? index + 1 : index === 2 ? 3 : 1,
        score: player.score, purchasedCardCount: player.purchasedCards.length, forfeited: player.forfeited })) },
  } });
  if (!result.ok || result.value.game?.gameType !== "GEM_CARD" || !("result" in result.value.game)) throw new Error("Invalid GEM Finished fixture.");
  return result.value as GemCardFinishedPlatformSnapshotV2;
}

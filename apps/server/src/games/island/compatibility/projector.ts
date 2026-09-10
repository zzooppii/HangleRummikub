import { IslandPlayingProjectionSchema, IslandFinishedProjectionSchema, ISLAND_RESOURCES, islandResourceCount, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { IslandStoredGame } from "./adapter.js";
import { activeIslandPlayer, islandPoints, islandRoadLength, islandKnights, islandPieces, legalIslandRoads, legalIslandSettlements, islandBankRate, ISLAND_COSTS } from "../domain/game.js";

/** Explicit allowlist. Never spread a canonical player/card/state into the wire DTO. */
export function projectIsland(game: IslandStoredGame, viewer: PlayerId) {
  const s = game.state, self = s.players.find(p => p.playerId === viewer);
  if (!self) throw new Error("Island viewer must be a participant.");
  const active = activeIslandPlayer(s), mine = active === viewer, setup = s.turnNumber === 0;
  const canPlayCard = mine && !s.playedDevelopment && (s.stage.kind === "ROLL" || s.stage.kind === "ACTION");
  const affordable = (kind: keyof typeof ISLAND_COSTS) => ISLAND_RESOURCES.every(r => self.resources[r] >= ISLAND_COSTS[kind][r]);
  const base = {
    gameType: "ISLAND_SETTLERS", gameId: game.gameId, gameRevision: game.gameRevision, rulesVersion: s.rulesVersion,
    hexes: s.hexes.map(h => ({ id: h.id, resource: h.resource, number: h.number })),
    ports: s.ports.map(p => ({ edge: p.edge, resource: p.resource })), roads: s.roads.map(r => ({ edge: r.edge, playerId: r.playerId })),
    buildings: s.buildings.map(b => ({ vertex: b.vertex, playerId: b.playerId, kind: b.kind })),
    robber: s.robber, bank: { ...s.bank }, developmentCount: s.deck.length,
    playerStates: s.players.map(p => {
      const pieces = islandPieces(s, p.playerId);
      return { playerId: p.playerId, resources: { ...p.resources }, resourceCount: islandResourceCount(p.resources), developmentCount: p.cards.length,
        knights: islandKnights(s, p.playerId), roadLength: islandRoadLength(s, p.playerId), publicPoints: islandPoints(s, p.playerId),
        remainingRoads: pieces.roads, remainingSettlements: pieces.settlements, remainingCities: pieces.cities };
    }),
    longestRoadPlayerId: s.longestRoadPlayerId, largestArmyPlayerId: s.largestArmyPlayerId, dice: s.dice ? [...s.dice] : null,
    log: s.log.map(l => ({ revision: l.revision, playerId: l.playerId, text: l.text, automatic: l.automatic })),
    privateState: { playerId: viewer, resources: { ...self.resources }, totalPoints: islandPoints(s, viewer, true),
      cards: self.cards.map(c => ({ id: c.id, kind: c.kind, playable: s.phase === "PLAYING" && canPlayCard && c.kind !== "VICTORY" && c.boughtTurn < s.turnNumber && (c.kind !== "ROADS" || legalIslandRoads(s, viewer).length > 0) })) },
  };
  if (s.phase === "FINISHED") return parse(IslandFinishedProjectionSchema, { ...base, phase: "FINISHED", result: s.result });
  return parse(IslandPlayingProjectionSchema, {
    ...base, phase: "PLAYING", activePlayerId: active, turnId: s.turnId, turnNumber: s.turnNumber, deadlineAt: s.deadlineAt,
    stage: structuredClone(s.stage),
    trade: s.trade ? { id: s.trade.id, proposerId: s.trade.proposerId, give: { ...s.trade.give }, receive: { ...s.trade.receive }, responses: s.trade.responses.map(r => ({ playerId: r.playerId, accepted: r.accepted })) } : null,
    legalActions: {
      roadEdges: mine && (s.stage.kind === "SETUP_ROAD" || s.stage.kind === "FREE_ROADS" || s.stage.kind === "ACTION" && affordable("ROAD")) ? legalIslandRoads(s, viewer, s.stage.kind === "SETUP_ROAD" ? s.stage.vertex : undefined) : [],
      settlementVertices: mine && (s.stage.kind === "SETUP_SETTLEMENT" || s.stage.kind === "ACTION" && affordable("SETTLEMENT")) ? legalIslandSettlements(s, viewer, setup) : [],
      cityVertices: mine && s.stage.kind === "ACTION" && affordable("CITY") && islandPieces(s, viewer).cities > 0 ? s.buildings.filter(b => b.playerId === viewer && b.kind === "SETTLEMENT").map(b => b.vertex) : [],
      robberHexes: mine && s.stage.kind === "ROBBER_HEX" ? s.hexes.filter(h => h.id !== s.robber).map(h => h.id) : [],
      bankRates: { WOOD: islandBankRate(s, viewer, "WOOD"), BRICK: islandBankRate(s, viewer, "BRICK"), WOOL: islandBankRate(s, viewer, "WOOL"), GRAIN: islandBankRate(s, viewer, "GRAIN"), ORE: islandBankRate(s, viewer, "ORE") },
      canBuyCard: mine && s.stage.kind === "ACTION" && s.deck.length > 0 && affordable("CARD"), canPlayCard,
    },
  });
}

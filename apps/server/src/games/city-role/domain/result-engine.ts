import { expandedScore } from "./expansion-scoring.js";
import { validateCityGameCards } from "./cardset-v2.js";
import { CITY_CATEGORIES, getCityTemplate } from "./cardset-v1.js";
import type { CityFinishReason, CityGameResult, CityGameState, CityRanking } from "./game-state.js";
import { cityLandmarkScoring } from "./landmarks-v2.js";

/** CITY scoring only: no clock, platform revision, tie-break or shared Result model. */
export function calculateCityResult(state: CityGameState, reason: CityFinishReason): CityGameResult {
  const cards = validateCityGameCards(state.cards, state.rulesVersion);
  const eligible = state.players.filter(player => !player.forfeited);
  if (reason === "LAST_PLAYER_STANDING") {
    if (eligible.length !== 1) throw new Error("CITY last-player-standing requires one eligible player.");
  } else if (reason === "NO_ELIGIBLE_PLAYERS") {
    if (eligible.length !== 0) throw new Error("CITY no-eligible result requires zero eligible players.");
  } else if (reason === "CITY_COMPLETION_ROUND_END") {
    if (eligible.length < 2 || state.firstCompletion === null)
      throw new Error("CITY completion result requires a completion latch and two eligible players.");
  } else {
    throw new Error("CITY finish reason is not supported.");
  }
  if (state.players.length < 2 || state.players.length > 6 ||
      new Set(state.players.map(player => player.playerId)).size !== state.players.length ||
      new Set(state.seatOrder).size !== state.players.length ||
      state.seatOrder.length !== state.players.length ||
      state.players.some(player => !state.seatOrder.includes(player.playerId)))
    throw new Error("CITY result participants are inconsistent.");

  const seen = new Set<string>();
  const rows = state.players.map(player => {
    if (state.expansion) return { playerId: player.playerId, ...expandedScore(state, player), buildingCount: player.city.length, forfeited: player.forfeited };
    const templates = player.city.map(cardId => {
      const card = cards.find(candidate => candidate.cardId === cardId);
      if (card === undefined || seen.has(cardId)) throw new Error("CITY result physical city is invalid.");
      seen.add(cardId);
      return getCityTemplate(card.templateId);
    });
    if (new Set(templates.map(template => template.templateId)).size !== templates.length)
      throw new Error("CITY result city repeats a building template.");
    const buildingVP = templates.reduce((sum, template) => sum + template.victoryPoints, 0);
    const completionBonus = player.forfeited ? 0 : state.firstCompletion?.playerId === player.playerId ? 4 : player.city.length >= 8 ? 2 : 0;
    const special = state.rulesVersion === "city-rules-v2" ? cityLandmarkScoring(templates, player.forfeited) : null;
    const diversityBonus = special?.diversityBonus ?? (!player.forfeited && CITY_CATEGORIES.every(category => templates.some(template => template.category === category)) ? 3 : 0);
    return {
      playerId: player.playerId, buildingVP, completionBonus, diversityBonus,
      ...(special === null ? {} : { landmarkBonus: special.landmarkBonus }),
      score: buildingVP + completionBonus + diversityBonus + (special?.landmarkBonus ?? 0),
      buildingCount: player.city.length, forfeited: player.forfeited,
    };
  }).sort((left, right) => Number(left.forfeited) - Number(right.forfeited) ||
    right.score - left.score || state.seatOrder.indexOf(left.playerId) - state.seatOrder.indexOf(right.playerId));

  const rankings: CityRanking[] = [];
  for (const [index, row] of rows.entries()) {
    const previous = rankings[index - 1];
    const rank = previous !== undefined && previous.forfeited === row.forfeited && previous.score === row.score ? previous.rank : index + 1;
    rankings.push(Object.freeze({ ...row, rank, winner: !row.forfeited && rank === 1 }));
  }
  return Object.freeze({ reason, rankings: Object.freeze(rankings) });
}

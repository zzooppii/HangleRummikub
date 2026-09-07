import { isDeepStrictEqual } from "node:util";
import { GameIdSchema, GameRevisionSchema, PlayerIdSchema, type GameId, type GameRevision, type ServerTime, type TurnId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { GEM_CARDSET_V1, GEM_CARDSET_VERSION, validateGemCardSet } from "../domain/cardset-v1.js";
import { GEM_RULES_VERSION, assertGemCardConservation, assertGemGameResourceConservation, type GemGameState } from "../domain/game-state.js";
import { createGemMarket } from "../domain/market.js";
import { createGemPlayerState, hasGemPlayerReachedScoreTarget } from "../domain/player-state.js";
import { allEligibleGemPlayersLackMainAction, isGemMarketExhausted, isGemNoProgressCycleComplete, pruneGemNoProgressTracker, pruneGemPendingFairRound } from "../domain/progress.js";
import { createGemResourceCounts } from "../domain/resource.js";
import { createGemGameResult } from "../domain/result-engine.js";
import { createGemTurn } from "../domain/turn.js";
export type GemCardGameLifecycleInspection = Readonly<{
  lifecycle: "RUNNING";
  gameId: GameId;
  gameRevision: GameRevision;
  activeTurn: Readonly<{
    turnId: TurnId;
    deadlineAt: ServerTime;
  }>;
}> | Readonly<{
  lifecycle: "FINISHED";
  gameId: GameId;
  finishedAt: ServerTime;
}>;
export interface GemCardGameStateStorage {
  readonly gameType: "GEM_CARD";
  cloneAndValidate(state: GemGameState): GemGameState;
  inspectLifecycle(state: GemGameState): GemCardGameLifecycleInspection;
}
/** GEM-owned whole-state coherence; platform persistence never inspects cards/resources. */
export class GemCardGameStateAdapter implements GemCardGameStateStorage {
  readonly gameType = "GEM_CARD" as const;
  constructor() { Object.freeze(this); }
  cloneAndValidate(state: GemGameState): GemGameState {
    if (state.rulesVersion !== GEM_RULES_VERSION || state.cardSetVersion !== GEM_CARDSET_VERSION)
      throw new Error("Unsupported GEM rules/cardset version.");
    const turnOrder = Object.freeze(state.turnOrder.map(id => parse(PlayerIdSchema, id)));
    const players = Object.freeze(state.players.map(createGemPlayerState));
    if (turnOrder.length < 2 || turnOrder.length > 4 || new Set(turnOrder).size !== turnOrder.length || players.length !== turnOrder.length || new Set(players.map(p => p.playerId)).size !== players.length || players.some(p => !turnOrder.includes(p.playerId)))
      throw new Error("GEM player identities disagree.");
    if (players.some(p => p.offlineTimeoutStreak === 3 && !p.forfeited))
      throw new Error("Third offline timeout must forfeit atomically.");
    const noProgressPlayerIds = pruneGemNoProgressTracker(state.noProgressPlayerIds, turnOrder, players);
    if (!isDeepStrictEqual(noProgressPlayerIds, state.noProgressPlayerIds))
      throw new Error("GEM yield tracker is not canonical.");
    const pendingFairRound = state.pendingFairRound === null ? null : pruneGemPendingFairRound(state.pendingFairRound, turnOrder, players);
    if (!isDeepStrictEqual(pendingFairRound, state.pendingFairRound))
      throw new Error("GEM pending fair round is not canonical.");
    const base = Object.freeze({
      gameId: parse(GameIdSchema, state.gameId), gameRevision: parse(GameRevisionSchema, state.gameRevision),
      rulesVersion: GEM_RULES_VERSION, cardSetVersion: GEM_CARDSET_VERSION,
      cards: validateGemCardSet(state.cards), market: createGemMarket(state.market),
      supply: createGemResourceCounts(state.supply), players, turnOrder, noProgressPlayerIds, pendingFairRound,
    });
    // Balance totals alone do not prove cardSetVersion identity: a corrupt
    // store could swap two card definitions while preserving every total.
    if (!GEM_CARDSET_V1.every(card => isDeepStrictEqual(card, base.cards.find(value => value.cardId === card.cardId)))) {
      throw new Error("GEM stored card definitions differ from gem-cardset-v1.");
    }
    const eligible = players.filter(p => !p.forfeited);
    const threshold = players.some(p => hasGemPlayerReachedScoreTarget(p, base.cards));
    const exhausted = isGemMarketExhausted(base.market, players);
    const noProgress = isGemNoProgressCycleComplete({ tracker: noProgressPlayerIds, turnOrder, players }) && allEligibleGemPlayersLackMainAction(base);
    if (pendingFairRound?.reason === "SCORE_THRESHOLD_ROUND_END" && !threshold || pendingFairRound?.reason === "MARKET_EXHAUSTED_ROUND_END" && !exhausted)
      throw new Error("GEM pending trigger does not exist.");
    let cloned: GemGameState;
    if (state.turn !== null) {
      const turn = createGemTurn(state.turn);
      if (state.result !== null || eligible.length < 2 || !eligible.some(p => p.playerId === turn.activePlayerId))
        throw new Error("GEM running lifecycle is invalid.");
      if (pendingFairRound !== null) {
        const expectedQueue = turnOrder.slice(turnOrder.indexOf(turn.activePlayerId)).filter(id => eligible.some(p => p.playerId === id));
        if (!isDeepStrictEqual(pendingFairRound.remainingPlayerIds, expectedQueue))
          throw new Error("GEM fair-round queue must begin at the active player and end at the cycle boundary.");
      }
      else if (threshold || exhausted || noProgress)
        throw new Error("GEM running state has an unhandled finish trigger.");
      cloned = Object.freeze({ ...base, turn, result: null });
    }
    else {
      if (state.result === null || pendingFairRound !== null)
        throw new Error("GEM finished lifecycle is invalid.");
      const result = createGemGameResult({ reason: state.result.reason, finishedAt: state.result.finishedAt, players, cards: base.cards });
      if (!isDeepStrictEqual(result, state.result))
        throw new Error("GEM result differs from canonical calculation.");
      if (result.reason === "MARKET_EXHAUSTED_ROUND_END" && !exhausted || result.reason === "NO_PROGRESS" && (!noProgress || threshold || exhausted))
        throw new Error("GEM finish reason disagrees with canonical state.");
      cloned = Object.freeze({ ...base, turn: null, result });
    }
    assertGemCardConservation(cloned);
    assertGemGameResourceConservation(cloned);
    return cloned;
  }
  inspectLifecycle(state: GemGameState): GemCardGameLifecycleInspection {
    if (state.turn === null) {
      if (state.result === null)
        throw new Error("GEM finished result missing.");
      return Object.freeze({ lifecycle: "FINISHED", gameId: state.gameId, finishedAt: state.result.finishedAt });
    }
    if (state.result !== null)
      throw new Error("GEM active result must be null.");
    return Object.freeze({ lifecycle: "RUNNING", gameId: state.gameId, gameRevision: state.gameRevision, activeTurn: Object.freeze({ turnId: state.turn.turnId, deadlineAt: state.turn.deadlineAt }) });
  }
}

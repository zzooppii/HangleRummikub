import { SaboteurPlayingProjectionSchema, SaboteurFinishedProjectionSchema, type PlayerId } from '@hangul-rummikub/shared';
import { parse } from 'valibot';
import { saboteurCard, saboteurGold } from '../domain/game.js';
import type { SaboteurStoredGame } from './adapter.js';
/** Whitelist every viewer field. Hidden deck/goal/role state is never serialized and filtered afterward. */
export function projectSaboteur(game: SaboteurStoredGame, viewer: PlayerId) {
    const s = game.state, p = s.players.find(p => p.playerId === viewer);
    if (!p)
        throw new Error('Saboteur viewer missing.');
    const base = { gameType: 'SABOTEUR', gameId: game.gameId, gameRevision: game.gameRevision, rulesVersion: s.rulesVersion, round: s.round, roundId: s.roundId, deckCount: s.deck.length, discardCount: s.discard.length,
        board: s.board.map(t => ({ ...t })), goals: s.goals.map(g => ({ ...g })), playerStates: s.players.map(p => ({ playerId: p.playerId, handCount: p.hand.length, brokenTools: p.equipment.map(e => e.tool) })),
        privateState: { playerId: viewer, role: p.role, hand: p.hand.map(id => saboteurCard(s, id)), gold: p.gold.map(id => saboteurGold(s, id)), observations: p.observations.map(o => ({ ...o })), goldChoices: s.phase === 'GOLD_SELECTION' && s.activePlayerId === viewer ? s.goldPool.map(id => saboteurGold(s, id)) : [], chatSequence: p.chatSequence }, messages: s.messages, roundResults: s.roundResults, feedback: s.feedback };
    if (s.phase === 'FINISHED')
        return parse(SaboteurFinishedProjectionSchema, { ...base, phase: 'FINISHED', result: s.result });
    return parse(SaboteurPlayingProjectionSchema, s.phase === 'ROUND_RESULT' ? { ...base, phase: 'ROUND_RESULT', confirmedPlayerIds: s.confirmedPlayerIds } : { ...base, phase: s.phase, turnId: s.transitionId, activePlayerId: s.activePlayerId });
}

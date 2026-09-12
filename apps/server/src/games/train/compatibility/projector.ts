import { TrainPlayingProjectionSchema, TrainFinishedProjectionSchema, type PlayerId } from '@hangul-rummikub/shared';
import { parse } from 'valibot';
import { trainCard, trainTicket, trainTicketViews } from '../domain/game.js';
import type { TrainStoredGame } from './adapter.js';
export function projectTrain(game: TrainStoredGame, viewer: PlayerId) {
    const s = game.state, p = s.players.find(p => p.playerId === viewer);
    if (!p)
        throw new Error('Train viewer missing.');
    const base = { gameType: 'TRAIN', gameId: game.gameId, gameRevision: game.gameRevision, rulesVersion: s.rulesVersion, startingPlayerId: s.startingPlayerId, round: s.round, finalTurnsRemaining: s.finalTurnsRemaining, finalTriggerPlayerId: s.finalTriggerPlayerId,
        market: s.market.map(id => trainCard(s, id)), deckCount: s.deck.length, discardCount: s.discard.length, ticketDeckCount: s.ticketDeck.length, claims: s.claims,
        playerStates: s.players.map(p => ({ playerId: p.playerId, trains: p.trains, routePoints: p.routePoints, handCount: p.hand.length, ticketCount: p.tickets.length, pendingTicketCount: p.pendingTickets.length })), privateState: { playerId: viewer, hand: p.hand.map(id => trainCard(s, id)), tickets: trainTicketViews(s, p), pendingTickets: p.pendingTickets.map(id => trainTicket(s, id)), minimumKeep: p.pendingTickets.length ? (s.step === 'SETUP' ? 2 : 1) : 0 }, feedback: s.feedback };
    return s.phase === 'FINISHED' ? parse(TrainFinishedProjectionSchema, { ...base, phase: 'FINISHED', result: s.result }) : parse(TrainPlayingProjectionSchema, { ...base, phase: 'PLAYING', turnId: s.transitionId, activePlayerId: s.activePlayerId, step: s.step });
}

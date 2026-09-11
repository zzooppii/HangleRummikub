import * as v from 'valibot';
import { GameIdSchema, GameRevisionSchema, PlayerIdSchema, ServerTimeSchema, TurnIdSchema, SaboteurCardIdSchema, SaboteurCardSchema, SaboteurGoldSchema, SaboteurRoleSchema, SaboteurToolSchema, SaboteurBoardTileSchema, SaboteurGoalSchema, SaboteurRoundResultSchema, SaboteurResultSchema, SaboteurFeedbackSchema, SaboteurMessageSchema, SaboteurGoalIdSchema, SaboteurActionSchema, canPlaceSaboteur, type SaboteurCard, type SaboteurAction, type PlayerId, type ServerTime, type TurnId } from '@hangul-rummikub/shared';
import { cardSignature, makeSaboteurCards, saboteurRoles } from './catalog.js';
import { revealSaboteurGoals } from './board.js';
export const SABOTEUR_ACTION_MS = 30_000;
export const SABOTEUR_RESULT_MS = 60_000;
const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const cardIds = v.array(SaboteurCardIdSchema);
const State = v.strictObject({ gameId: GameIdSchema, rulesVersion: v.literal('saboteur-base-2025-v1'), revision: GameRevisionSchema, phase: v.picklist(['PLAYING', 'GOLD_SELECTION', 'ROUND_RESULT', 'FINISHED']), startedAt: ServerTimeSchema, finishedAt: v.nullable(ServerTimeSchema), deadlineAt: v.nullable(ServerTimeSchema), round: v.pipe(count, v.minValue(1), v.maxValue(3)), roundId: TurnIdSchema, transitionId: TurnIdSchema, activePlayerId: PlayerIdSchema, lastActorId: PlayerIdSchema,
    cards: v.pipe(v.array(SaboteurCardSchema), v.length(67)), deck: cardIds, discard: cardIds, board: v.pipe(v.array(SaboteurBoardTileSchema), v.maxLength(40)), goals: v.pipe(v.array(SaboteurGoalSchema), v.length(3)), hiddenGoals: v.pipe(v.array(v.picklist(['GOLD', 'ROCK_NE', 'ROCK_NW'])), v.length(3)), unusedRole: SaboteurRoleSchema,
    goldCards: v.pipe(v.array(SaboteurGoldSchema), v.length(28)), goldDeck: cardIds, goldPool: cardIds, goldQueue: v.array(PlayerIdSchema),
    players: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, role: SaboteurRoleSchema, hand: v.pipe(cardIds, v.maxLength(6)), equipment: v.pipe(v.array(v.strictObject({ tool: SaboteurToolSchema, cardId: SaboteurCardIdSchema })), v.maxLength(3)), gold: cardIds, observations: v.pipe(v.array(v.strictObject({ goalId: SaboteurGoalIdSchema, face: v.picklist(['GOLD', 'ROCK_NE', 'ROCK_NW']) })), v.maxLength(3)), chatSequence: count, lastChatAt: v.nullable(ServerTimeSchema) })), v.minLength(3), v.maxLength(10)),
    confirmedPlayerIds: v.array(PlayerIdSchema), roundResults: v.pipe(v.array(SaboteurRoundResultSchema), v.maxLength(3)), result: v.nullable(SaboteurResultSchema), feedback: SaboteurFeedbackSchema, messages: v.pipe(v.array(SaboteurMessageSchema), v.maxLength(60)) });
export type SaboteurState = v.InferOutput<typeof State>;
export type SaboteurRoundSetup = {
    cards: SaboteurCard[];
    roles: SaboteurState['players'][number]['role'][];
    goals: SaboteurState['hiddenGoals'];
};
type Identity = {
    gameId: SaboteurState['gameId'];
    playerIds: PlayerId[];
    now: ServerTime;
    transitionId: TurnId;
    starter: number;
    goldCards: SaboteurState['goldCards'];
};
export function saboteurCard(s: Pick<SaboteurState, 'cards'>, id: string) { const card = s.cards.find(c => c.cardId === id); if (!card)
    throw new Error('Invalid Saboteur card reference.'); return card; }
export function saboteurGold(s: Pick<SaboteurState, 'goldCards'>, id: string) { const card = s.goldCards.find(c => c.cardId === id); if (!card)
    throw new Error('Invalid Saboteur gold reference.'); return card; }
function sameMultiset(a: readonly string[], b: readonly string[]) { return a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]); }
const inventory = makeSaboteurCards(() => 'catalog').map(cardSignature);
export function parseSaboteurState(input: unknown): SaboteurState {
    const s = v.parse(State, input), ids = new Set(s.players.map(p => p.playerId));
    if (ids.size !== s.players.length || !ids.has(s.activePlayerId) || !ids.has(s.lastActorId))
        throw new Error('Invalid Saboteur roster.');
    if ((s.phase === 'FINISHED') !== (s.deadlineAt === null) || s.deadlineAt !== null && s.deadlineAt < s.startedAt) throw new Error('Invalid Saboteur deadline.');
    const cards = new Map(s.cards.map(c => [c.cardId, c])), all = [...s.deck, ...s.discard, ...s.board.map(c => c.cardId), ...s.players.flatMap(p => [...p.hand, ...p.equipment.map(e => e.cardId)])];
    if (cards.size !== 67 || all.length !== 67 || new Set(all).size !== 67 || all.some(id => !cards.has(id)) || !sameMultiset(s.cards.map(cardSignature), inventory))
        throw new Error('Saboteur card conservation.');
    const gold = [...s.goldDeck, ...s.goldPool, ...s.players.flatMap(p => p.gold)], goldIds = new Set(s.goldCards.map(c => c.cardId));
    if (goldIds.size !== 28 || gold.length !== 28 || new Set(gold).size !== 28 || gold.some(id => !goldIds.has(id)) || s.cards.some(c => goldIds.has(c.cardId)) || !sameMultiset(s.goldCards.map(c => String(c.value)), [...Array(16).fill('1'), ...Array(8).fill('2'), ...Array(4).fill('3')]))
        throw new Error('Saboteur gold conservation.');
    if (!sameMultiset([...s.players.map(p => p.role), s.unusedRole], saboteurRoles(s.players.length)) || !sameMultiset(s.hiddenGoals, ['GOLD', 'ROCK_NE', 'ROCK_NW']))
        throw new Error('Saboteur setup mismatch.');
    if (new Set(s.board.map(c => `${c.x},${c.y}`)).size !== s.board.length || s.board.some(t => { const c = cards.get(t.cardId); return c?.kind !== 'PATH' || c.path !== t.path || !ids.has(t.placedBy) || t.x === 0 && t.y === 0 || s.goals.some(g => g.x === t.x && g.y === t.y); }))
        throw new Error('Invalid Saboteur board.');
    if (s.goals.some((g, i) => g.goalId !== ['A', 'B', 'C'][i] || g.y !== [-2, 0, 2][i] || g.face !== null && g.face !== s.hiddenGoals[i] || g.face === null && g.rotation !== 0))
        throw new Error('Invalid Saboteur goals.');
    for (const p of s.players) {
        if (new Set(p.equipment.map(e => e.tool)).size !== p.equipment.length || p.equipment.some(e => { const c = cards.get(e.cardId); return c?.kind !== 'BREAK' || c.tool !== e.tool; }) || new Set(p.observations.map(o => o.goalId)).size !== p.observations.length || p.observations.some(o => o.face !== s.hiddenGoals[['A', 'B', 'C'].indexOf(o.goalId)]))
            throw new Error('Invalid Saboteur player zones.');
    }
    if (new Set(s.confirmedPlayerIds).size !== s.confirmedPlayerIds.length || s.confirmedPlayerIds.some(id => !ids.has(id)) || s.confirmedPlayerIds.length >= ids.size || s.phase !== 'ROUND_RESULT' && s.confirmedPlayerIds.length > 0)
        throw new Error('Invalid round confirmations.');
    if (s.phase === 'PLAYING' && (s.roundResults.length !== s.round - 1 || !s.players.find(p => p.playerId === s.activePlayerId)?.hand.length || s.goals.some(g => g.face === 'GOLD')))
        throw new Error('Invalid Saboteur turn.');
    if (s.phase === 'GOLD_SELECTION' && (s.roundResults.length !== s.round || s.goldQueue[0] !== s.activePlayerId || !s.goldPool.length || s.goldQueue.length !== s.goldPool.length || new Set(s.goldQueue).size !== s.goldQueue.length || s.goldQueue.some(id => s.players.find(p => p.playerId === id)?.role !== 'MINER') || s.roundResults.at(-1)?.winner !== 'MINERS'))
        throw new Error('Invalid gold selection.');
    if (s.phase !== 'GOLD_SELECTION' && (s.goldPool.length || s.goldQueue.length))
        throw new Error('Unexpected gold pool.');
    if (s.phase === 'ROUND_RESULT' && (s.round === 3 || s.roundResults.length !== s.round))
        throw new Error('Invalid round result.');
    if ((s.phase === 'FINISHED') !== (s.finishedAt !== null && s.result !== null) || s.phase !== 'FINISHED' && (s.finishedAt !== null || s.result !== null) || s.finishedAt !== null && s.finishedAt < s.startedAt)
        throw new Error('Invalid finish metadata.');
    if (s.roundResults.some((r, i) => r.round !== i + 1 || r.roles.length !== ids.size || new Set(r.roles.map(p => p.playerId)).size !== ids.size || r.roles.some(p => !ids.has(p.playerId))))
        throw new Error('Invalid role history.');
    if (s.result?.reason === 'THREE_ROUNDS') {
        const scores = s.players.map(p => ({ playerId: p.playerId, gold: p.gold.reduce((n, id) => n + saboteurGold(s, id).value, 0) })), best = Math.max(...scores.map(p => p.gold)), winners = scores.filter(p => p.gold === best).map(p => p.playerId);
        if (s.round !== 3 || s.roundResults.length !== 3 || JSON.stringify(scores) !== JSON.stringify(s.result.scores) || !sameMultiset(winners, s.result.winnerPlayerIds))
            throw new Error('Invalid Saboteur winner.');
    }
    if (s.result?.reason === 'CANCELLED' && (s.result.winnerPlayerIds.length || s.result.scores.length))
        throw new Error('Invalid cancellation.');
    if (s.messages.some(m => !ids.has(m.playerId)) || s.feedback && (!ids.has(s.feedback.playerId) || s.feedback.targetPlayerId !== null && !ids.has(s.feedback.targetPlayerId)))
        throw new Error('Invalid public feedback.');
    return s;
}
function deal(s: SaboteurState, setup: SaboteurRoundSetup, starter: PlayerId, token: TurnId) {
    if (setup.roles.length !== s.players.length + 1)
        throw new Error('Invalid role setup.');
    s.cards = setup.cards.map(c => v.parse(SaboteurCardSchema, c));
    s.deck = s.cards.map(c => c.cardId);
    s.discard = [];
    s.board = [];
    s.hiddenGoals = [...setup.goals];
    s.goals = [{ goalId: 'A', x: 8, y: -2, face: null, rotation: 0 }, { goalId: 'B', x: 8, y: 0, face: null, rotation: 0 }, { goalId: 'C', x: 8, y: 2, face: null, rotation: 0 }];
    const size = s.players.length <= 5 ? 6 : s.players.length <= 7 ? 5 : 4;
    s.players.forEach((p, i) => { p.role = setup.roles[i]!; p.hand = s.deck.splice(0, size); p.equipment = []; p.observations = []; p.chatSequence = 0; p.lastChatAt = null; });
    s.unusedRole = setup.roles.at(-1)!;
    s.phase = 'PLAYING';
    s.activePlayerId = starter;
    s.lastActorId = starter;
    s.roundId = token;
    s.transitionId = token;
    s.confirmedPlayerIds = [];
    s.feedback = null;
    s.messages = [];
}
export function createSaboteurGame(input: Identity & SaboteurRoundSetup): SaboteurState {
    if (input.playerIds.length < 3 || input.playerIds.length > 10 || !Number.isInteger(input.starter) || !input.playerIds[input.starter])
        throw new Error('Invalid initial roster.');
    const starter = input.playerIds[input.starter]!;
    const s: SaboteurState = { gameId: input.gameId, rulesVersion: 'saboteur-base-2025-v1', revision: v.parse(GameRevisionSchema, 0), phase: 'PLAYING', startedAt: input.now, finishedAt: null, deadlineAt: v.parse(ServerTimeSchema, input.now + SABOTEUR_ACTION_MS), round: 1, roundId: input.transitionId, transitionId: input.transitionId, activePlayerId: starter, lastActorId: starter, cards: [], deck: [], discard: [], board: [], goals: [], hiddenGoals: [], unusedRole: 'MINER', goldCards: input.goldCards.map(c => ({ ...c })), goldDeck: input.goldCards.map(c => c.cardId), goldPool: [], goldQueue: [], players: input.playerIds.map(playerId => ({ playerId, role: 'MINER', hand: [], equipment: [], gold: [], observations: [], chatSequence: 0, lastChatAt: null })), confirmedPlayerIds: [], roundResults: [], result: null, feedback: null, messages: [] };
    deal(s, input, starter, input.transitionId);
    return parseSaboteurState(s);
}
type Outcome = {
    ok: true;
    state: SaboteurState;
} | {
    ok: false;
    reason: 'INVALID_PHASE' | 'NOT_YOUR_TURN' | 'INVALID_ACTION';
};
const invalid = (): Outcome => ({ ok: false, reason: 'INVALID_ACTION' });
function settle(s: SaboteurState, now: ServerTime) {
    s.goldQueue = [];
    s.goldPool = [];
    s.confirmedPlayerIds = [];
    if (s.round < 3) {
        s.phase = 'ROUND_RESULT';
        return;
    }
    s.phase = 'FINISHED';
    s.deadlineAt = null;
    s.finishedAt = now;
    const scores = s.players.map(p => ({ playerId: p.playerId, gold: p.gold.reduce((n, id) => n + saboteurGold(s, id).value, 0) })), best = Math.max(...scores.map(p => p.gold));
    s.result = { reason: 'THREE_ROUNDS', winnerPlayerIds: scores.filter(p => p.gold === best).map(p => p.playerId), scores };
}
function goldCombination(s: SaboteurState, target: number): SaboteurState['goldDeck'] | null {
    const visit = (start: number, left: number): SaboteurState['goldDeck'] | null => { if (left === 0)
        return []; for (let i = start; i < s.goldDeck.length; i++) {
        const id = s.goldDeck[i]!, value = saboteurGold(s, id).value;
        if (value > left)
            continue;
        const rest = visit(i + 1, left - value);
        if (rest)
            return [id, ...rest];
    } return null; };
    return visit(0, target);
}
function endRound(s: SaboteurState, goldReached: boolean, now: ServerTime) {
    const sab = s.players.filter(p => p.role === 'SABOTEUR');
    s.roundResults.push({ round: s.round, winner: goldReached ? 'MINERS' : sab.length ? 'SABOTEURS' : 'NOBODY', roles: s.players.map(p => ({ playerId: p.playerId, role: p.role })) });
    if (goldReached) {
        const i = s.players.findIndex(p => p.playerId === s.lastActorId);
        s.goldQueue = Array.from({ length: s.players.length }, (_, offset) => s.players[(i - offset + s.players.length) % s.players.length]!).filter(p => p.role === 'MINER').map(p => p.playerId);
        s.goldPool = s.goldDeck.splice(0, s.goldQueue.length);
        s.activePlayerId = s.goldQueue[0]!;
        s.phase = 'GOLD_SELECTION';
    }
    else {
        for (const p of sab) {
            const awarded = goldCombination(s, sab.length === 1 ? 4 : sab.length === 4 ? 2 : 3);
            if (!awarded)
                throw new Error('Gold reward cannot be allocated.');
            p.gold.push(...awarded);
            s.goldDeck = s.goldDeck.filter(id => !awarded.includes(id));
        }
        settle(s, now);
    }
}
function performSaboteurAction(input: SaboteurState, actor: PlayerId, actionInput: SaboteurAction, now: ServerTime, token: TurnId): Outcome {
    if (input.phase !== 'PLAYING' && input.phase !== 'GOLD_SELECTION')
        return { ok: false, reason: 'INVALID_PHASE' };
    if (input.activePlayerId !== actor)
        return { ok: false, reason: 'NOT_YOUR_TURN' };
    const parsed = v.safeParse(SaboteurActionSchema, actionInput);
    if (!parsed.success)
        return invalid();
    const a = parsed.output, s = parseSaboteurState(input), p = s.players.find(p => p.playerId === actor)!;
    if (s.phase === 'GOLD_SELECTION') {
        if (a.kind !== 'TAKE_GOLD' || !s.goldPool.includes(a.cardId))
            return invalid();
        p.gold.push(a.cardId);
        s.goldPool = s.goldPool.filter(id => id !== a.cardId);
        s.goldQueue.shift();
        if (s.goldQueue.length)
            s.activePlayerId = s.goldQueue[0]!;
        else
            settle(s, now);
    }
    else {
        if (a.kind === 'TAKE_GOLD' || !p.hand.includes(a.cardId))
            return invalid();
        const c = saboteurCard(s, a.cardId);
        let discardCard = true;
        if (a.kind === 'PLACE') {
            if (c.kind !== 'PATH' || p.equipment.length)
                return invalid();
            const tile = { cardId: c.cardId, path: c.path, x: a.x, y: a.y, rotation: a.rotation, placedBy: actor };
            if (!canPlaceSaboteur(s, tile))
                return invalid();
            s.board.push(tile);
            discardCard = false;
            s.goals = revealSaboteurGoals(s, s.hiddenGoals);
        }
        else if (a.kind === 'BREAK') {
            const target = s.players.find(t => t.playerId === a.targetPlayerId);
            if (c.kind !== 'BREAK' || !target || target === p || target.equipment.some(e => e.tool === c.tool))
                return invalid();
            target.equipment.push({ tool: c.tool, cardId: c.cardId });
            discardCard = false;
        }
        else if (a.kind === 'REPAIR') {
            const target = s.players.find(t => t.playerId === a.targetPlayerId);
            if (c.kind !== 'REPAIR' || !target || !c.tools.includes(a.tool))
                return invalid();
            const eq = target.equipment.find(e => e.tool === a.tool);
            if (!eq)
                return invalid();
            target.equipment = target.equipment.filter(e => e !== eq);
            s.discard.push(eq.cardId);
        }
        else if (a.kind === 'MAP') {
            const i = s.goals.findIndex(g => g.goalId === a.goalId);
            if (c.kind !== 'MAP' || i < 0 || s.goals[i]!.face !== null)
                return invalid();
            p.observations = p.observations.filter(o => o.goalId !== a.goalId);
            p.observations.push({ goalId: a.goalId, face: s.hiddenGoals[i]! });
        }
        else if (a.kind === 'ROCKFALL') {
            const tile = s.board.find(t => t.x === a.x && t.y === a.y);
            if (c.kind !== 'ROCKFALL' || !tile)
                return invalid();
            s.board = s.board.filter(t => t !== tile);
            s.discard.push(tile.cardId);
        }
        p.hand = p.hand.filter(id => id !== c.cardId);
        if (discardCard)
            s.discard.push(c.cardId);
        const drawn = s.deck.shift();
        if (drawn)
            p.hand.push(drawn);
        s.lastActorId = actor;
        if (s.goals.some(g => g.face === 'GOLD'))
            endRound(s, true, now);
        else if (s.players.every(p => p.hand.length === 0))
            endRound(s, false, now);
        else {
            const i = s.players.findIndex(p => p.playerId === actor);
            s.activePlayerId = Array.from({ length: s.players.length }, (_, n) => s.players[(i + n + 1) % s.players.length]!).find(p => p.hand.length > 0)!.playerId;
        }
    }
    s.feedback = { playerId: actor, kind: a.kind, at: now, targetPlayerId: a.kind === 'BREAK' || a.kind === 'REPAIR' ? a.targetPlayerId : null, tool: a.kind === 'REPAIR' ? a.tool : a.kind === 'BREAK' ? (() => { const c = saboteurCard(s, a.cardId); return c.kind === 'BREAK' ? c.tool : null; })() : null, position: a.kind === 'PLACE' || a.kind === 'ROCKFALL' ? { x: a.x, y: a.y } : null };
    s.deadlineAt = s.phase === 'FINISHED' ? null : v.parse(ServerTimeSchema, now + (s.phase === 'ROUND_RESULT' ? SABOTEUR_RESULT_MS : SABOTEUR_ACTION_MS));
    s.transitionId = token;
    s.revision = v.parse(GameRevisionSchema, s.revision + 1);
    return { ok: true, state: parseSaboteurState(s) };
}
export function confirmSaboteurRound(input: SaboteurState, actor: PlayerId, setup: SaboteurRoundSetup | null, token: TurnId, now: ServerTime): Outcome {
    if (input.deadlineAt === null || now >= input.deadlineAt) return { ok: false, reason: 'INVALID_PHASE' };
    if (input.phase !== 'ROUND_RESULT')
        return { ok: false, reason: 'INVALID_PHASE' };
    if (!input.players.some(p => p.playerId === actor) || input.confirmedPlayerIds.includes(actor))
        return invalid();
    const s = parseSaboteurState(input);
    s.confirmedPlayerIds.push(actor);
    if (s.confirmedPlayerIds.length === s.players.length) {
        if (!setup)
            throw new Error('Next round setup required.');
        const i = s.players.findIndex(p => p.playerId === s.lastActorId), starter = s.players[(i + 1) % s.players.length]!.playerId;
        s.round++;
        deal(s, setup, starter, token);
        s.deadlineAt = v.parse(ServerTimeSchema, now + SABOTEUR_ACTION_MS);
    }
    s.revision = v.parse(GameRevisionSchema, s.revision + 1);
    return { ok: true, state: parseSaboteurState(s) };
}
export function saySaboteur(input: SaboteurState, actor: PlayerId, text: string, sequence: number, now: ServerTime): Outcome {
    if (input.phase === 'FINISHED')
        return { ok: false, reason: 'INVALID_PHASE' };
    const p = input.players.find(p => p.playerId === actor);
    const trimmed = text.trim();
    if (!p || sequence !== p.chatSequence || !trimmed || trimmed.length > 240 || p.lastChatAt !== null && now - p.lastChatAt < 2000)
        return invalid();
    const s = parseSaboteurState(input), self = s.players.find(p => p.playerId === actor)!;
    self.chatSequence++;
    self.lastChatAt = now;
    s.messages.push({ playerId: actor, text: trimmed, at: now });
    s.messages = s.messages.slice(-60);
    s.revision = v.parse(GameRevisionSchema, s.revision + 1);
    return { ok: true, state: parseSaboteurState(s) };
}
export function cancelSaboteur(input: SaboteurState, now: ServerTime): SaboteurState {
    const s = parseSaboteurState(input);
    if (s.phase === 'FINISHED')
        return s;
    s.goldDeck.push(...s.goldPool);
    s.goldPool = [];
    s.goldQueue = [];
    s.confirmedPlayerIds = [];
    s.phase = 'FINISHED';
    s.deadlineAt = null;
    s.finishedAt = now;
    s.result = { reason: 'CANCELLED', winnerPlayerIds: [], scores: [] };
    s.revision = v.parse(GameRevisionSchema, s.revision + 1);
    return parseSaboteurState(s);
}

/** Player commands cannot beat an overdue server timer, even if its callback is delayed. */
export function applySaboteurAction(input: SaboteurState, actor: PlayerId, action: SaboteurAction, now: ServerTime, token: TurnId): Outcome {
    if (input.deadlineAt === null || now >= input.deadlineAt) return {ok:false,reason:'INVALID_PHASE'};
    return performSaboteurAction(input, actor, action, now, token);
}
/** The application supplies the random index and next-round setup; no client chooses a timeout action. */
export function timeoutSaboteur(input: SaboteurState, now: ServerTime, token: TurnId, choice: number, setup: SaboteurRoundSetup | null): SaboteurState | null {
    if (input.phase === 'FINISHED' || input.deadlineAt === null || now < input.deadlineAt) return null;
    if (input.phase === 'ROUND_RESULT') {
        if (!setup) throw new Error('Next round setup required.');
        const s = parseSaboteurState(input), i = s.players.findIndex(p => p.playerId === s.lastActorId);
        s.round++;
        deal(s, setup, s.players[(i+1)%s.players.length]!.playerId, token);
        s.deadlineAt = v.parse(ServerTimeSchema, now + SABOTEUR_ACTION_MS);
        s.revision = v.parse(GameRevisionSchema, s.revision + 1);
        return parseSaboteurState(s);
    }
    const cards = input.phase === 'GOLD_SELECTION' ? input.goldPool : input.players.find(p => p.playerId === input.activePlayerId)!.hand;
    if (!Number.isInteger(choice) || !cards[choice]) throw new Error('Invalid timeout selection.');
    const outcome = performSaboteurAction(input, input.activePlayerId, {kind:input.phase === 'GOLD_SELECTION' ? 'TAKE_GOLD' : 'DISCARD', cardId:cards[choice]!}, now, token);
    if (!outcome.ok) throw new Error('Invalid timeout action.');
    if (outcome.state.feedback) outcome.state.feedback.kind = input.phase === 'GOLD_SELECTION' ? 'TIMEOUT_GOLD' : 'TIMEOUT_DISCARD';
    return parseSaboteurState(outcome.state);
}

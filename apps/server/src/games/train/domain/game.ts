import * as v from 'valibot';
import { GameIdSchema, PlayerIdSchema, TurnIdSchema, GameRevisionSchema, ServerTimeSchema, TrainCardSchema, TrainTicketCardSchema, TrainCardIdSchema, TrainActionSchema, TrainCountSchema as count, TrainClaimSchema, TrainResultSchema, TrainFeedbackSchema, TRAIN_COLORS, TRAIN_ROUTES, TRAIN_TICKETS, TRAIN_RULES_VERSION, TRAIN_ROUTE_POINTS, type PlayerId, type TrainCard, type TrainTicketCard, type TrainCardId } from '@hangul-rummikub/shared';
const ids = v.array(TrainCardIdSchema);
const State = v.strictObject({ gameId: GameIdSchema, rulesVersion: v.literal(TRAIN_RULES_VERSION), revision: GameRevisionSchema, phase: v.picklist(['PLAYING', 'FINISHED']), startedAt: ServerTimeSchema, finishedAt: v.nullable(ServerTimeSchema), transitionId: TurnIdSchema, activePlayerId: PlayerIdSchema, startingPlayerId: PlayerIdSchema, step: v.picklist(['SETUP', 'TURN', 'DRAW_SECOND', 'CHOOSE_TICKETS']), setupIndex: count, round: v.pipe(count, v.minValue(1)), finalTurnsRemaining: v.nullable(v.pipe(count, v.maxValue(5))), finalTriggerPlayerId: v.nullable(PlayerIdSchema), consecutivePasses: count, cards: v.pipe(v.array(TrainCardSchema), v.length(110)), tickets: v.pipe(v.array(TrainTicketCardSchema), v.length(30)), deck: ids, discard: ids, market: v.pipe(ids, v.maxLength(5)), ticketDeck: ids, claims: v.array(TrainClaimSchema), players: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, trains: v.pipe(count, v.maxValue(45)), routePoints: count, hand: ids, tickets: ids, pendingTickets: v.pipe(ids, v.maxLength(3)) })), v.minLength(2), v.maxLength(5)), result: v.nullable(TrainResultSchema), feedback: TrainFeedbackSchema });
export type TrainState = v.InferOutput<typeof State>;
export type TrainRandom = (maxExclusive: number) => number;
export function shuffleTrain<T>(items: T[], random: TrainRandom): T[] { for (let i = items.length - 1; i > 0; i--) {
    const j = random(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i)
        throw new Error('Invalid train random source.');
    [items[i], items[j]] = [items[j]!, items[i]!];
} return items; }
export function makeTrainCards(id: () => string): {
    cards: TrainCard[];
    tickets: TrainTicketCard[];
} { return { cards: TRAIN_COLORS.flatMap(color => Array.from({ length: color === 'LOCOMOTIVE' ? 14 : 12 }, () => v.parse(TrainCardSchema, { cardId: id(), color }))), tickets: TRAIN_TICKETS.map(t => v.parse(TrainTicketCardSchema, { cardId: id(), ticketId: t.ticketId })) }; }
export function trainCard(s: TrainState, id: TrainCardId): TrainCard { const c = s.cards.find(c => c.cardId === id); if (!c)
    throw new Error('Missing train card.'); return c; }
export function trainTicket(s: TrainState, id: TrainCardId): TrainTicketCard { const c = s.tickets.find(c => c.cardId === id); if (!c)
    throw new Error('Missing train ticket.'); return c; }
export function trainConnected(claims: TrainState['claims'], playerId: PlayerId, a: string, b: string): boolean { const reached = new Set([a]), queue = [a]; for (let i = 0; i < queue.length; i++) {
    const city = queue[i]!;
    for (const claim of claims) {
        if (claim.playerId !== playerId)
            continue;
        const r = TRAIN_ROUTES.find(r => r.routeId === claim.routeId)!;
        const next = r.a === city ? r.b : r.b === city ? r.a : null;
        if (next && !reached.has(next)) {
            reached.add(next);
            queue.push(next);
        }
    }
} return reached.has(b); }
/** Weighted edge-simple trail: a city can repeat, an owned route cannot. */
export function trainLongestPath(claims: TrainState['claims'], playerId: PlayerId): number {
    const edges = claims.filter(c => c.playerId === playerId).map(c => TRAIN_ROUTES.find(r => r.routeId === c.routeId)!);
    const adj = new Map<string, number[]>();
    edges.forEach((e, i) => { for (const city of [e.a, e.b])
        adj.set(city, [...(adj.get(city) ?? []), i]); });
    const cache = new Map<string, number>();
    function visit(city: string, used: bigint): number { const key = city + ':' + used.toString(36), prior = cache.get(key); if (prior !== undefined)
        return prior; let best = 0; for (const i of adj.get(city) ?? []) {
        const bit = 1n << BigInt(i);
        if ((used & bit) !== 0n)
            continue;
        const edge = edges[i]!;
        best = Math.max(best, edge.length + visit(edge.a === city ? edge.b : edge.a, used | bit));
    } cache.set(key, best); return best; }
    return Math.max(0, ...[...adj.keys()].map(city => visit(city, 0n)));
}
function ticketView(s: TrainState, p: TrainState['players'][number]) { return p.tickets.map(id => { const c = trainTicket(s, id), t = TRAIN_TICKETS.find(t => t.ticketId === c.ticketId)!; return { ...c, completed: trainConnected(s.claims, p.playerId, t.a, t.b) }; }); }
export function scoreTrain(s: TrainState) { const lengths = s.players.map(p => trainLongestPath(s.claims, p.playerId)), longest = Math.max(...lengths); return s.players.map((p, i) => { const tickets = ticketView(s, p), ticketPoints = tickets.reduce((n, c) => n + (c.completed ? 1 : -1) * TRAIN_TICKETS.find(t => t.ticketId === c.ticketId)!.points, 0), longestBonus = lengths[i] === longest && longest > 0 ? 10 : 0; return { playerId: p.playerId, routePoints: p.routePoints, ticketPoints, longestLength: lengths[i]!, longestBonus, completedCount: tickets.filter(t => t.completed).length, total: p.routePoints + ticketPoints + longestBonus, tickets }; }); }
function winners(scores: ReturnType<typeof scoreTrain>) { const ranked = [...scores].sort((a, b) => b.total - a.total || b.completedCount - a.completedCount || b.longestBonus - a.longestBonus), top = ranked[0]!; return ranked.filter(s => s.total === top.total && s.completedCount === top.completedCount && s.longestBonus === top.longestBonus).map(s => s.playerId); }
function finish(s: TrainState, reason: 'TRAINS' | 'STALEMATE' | 'CANCELLED', now: TrainState['startedAt']) { s.phase = 'FINISHED'; s.finishedAt = now; const scores = scoreTrain(s); s.result = v.parse(TrainResultSchema, { reason, scores, winnerPlayerIds: reason === 'CANCELLED' ? [] : winners(scores) }); }
export function parseTrainState(input: unknown): TrainState {
    const s = v.parse(State, input), players = new Set(s.players.map(p => p.playerId)), all = [...s.cards, ...s.tickets], allIds = new Set(all.map(c => c.cardId));
    if (players.size !== s.players.length || !players.has(s.activePlayerId) || !players.has(s.startingPlayerId) || s.setupIndex > s.players.length)
        throw new Error('Train roster mismatch.');
    if (TRAIN_COLORS.some(color => s.cards.filter(c => c.color === color).length !== (color === 'LOCOMOTIVE' ? 14 : 12)) || new Set(s.tickets.map(t => t.ticketId)).size !== 30 || s.tickets.some(t => !TRAIN_TICKETS.some(x => x.ticketId === t.ticketId)))
        throw new Error('Train catalog mismatch.');
    const cardZones = [...s.deck, ...s.discard, ...s.market, ...s.players.flatMap(p => p.hand)], ticketZones = [...s.ticketDeck, ...s.players.flatMap(p => [...p.tickets, ...p.pendingTickets])], zones = [...cardZones, ...ticketZones];
    if (allIds.size !== 140 || zones.length !== 140 || new Set(zones).size !== 140 || cardZones.some(id => !s.cards.some(c => c.cardId === id)) || ticketZones.some(id => !s.tickets.some(c => c.cardId === id)))
        throw new Error('Train card conservation failed.');
    if (new Set(s.claims.map(c => c.routeId)).size !== s.claims.length || s.claims.some(c => !players.has(c.playerId) || !TRAIN_ROUTES.some(r => r.routeId === c.routeId)))
        throw new Error('Train claim invalid.');
    for (const p of s.players) {
        const routes = TRAIN_ROUTES.filter(r => s.claims.some(c => c.routeId === r.routeId && c.playerId === p.playerId));
        if (p.trains !== 45 - routes.reduce((n, r) => n + r.length, 0) || p.routePoints !== routes.reduce((n, r) => n + TRAIN_ROUTE_POINTS[r.length]!, 0))
            throw new Error('Train pieces/score conservation failed.');
    }
    for (const c of s.claims) {
        const route = TRAIN_ROUTES.find(r => r.routeId === c.routeId)!;
        if (s.claims.some(o => o.routeId !== c.routeId && TRAIN_ROUTES.find(r => r.routeId === o.routeId)!.group === route.group && (players.size < 4 || o.playerId === c.playerId)))
            throw new Error('Train double route invalid.');
    }
    if ((s.finalTriggerPlayerId === null) !== (s.finalTurnsRemaining === null) || s.finalTriggerPlayerId !== null && (!players.has(s.finalTriggerPlayerId) || s.finalTurnsRemaining! > players.size || s.players.find(p => p.playerId === s.finalTriggerPlayerId)!.trains > 2) || s.phase === 'PLAYING' && s.finalTurnsRemaining === 0)
        throw new Error('Train final turn mismatch.');
    if (s.step === 'SETUP') {
        if (s.setupIndex >= s.players.length || s.activePlayerId !== s.players[s.setupIndex]!.playerId || s.players.some((p, i) => i < s.setupIndex ? p.pendingTickets.length !== 0 || p.tickets.length < 2 : p.pendingTickets.length !== 3 || p.tickets.length !== 0))
            throw new Error('Train setup mismatch.');
    }
    else if (s.setupIndex !== s.players.length || s.players.some(p => p.pendingTickets.length > 0 && (s.step !== 'CHOOSE_TICKETS' || p.playerId !== s.activePlayerId)) || s.step === 'CHOOSE_TICKETS' && s.players.find(p => p.playerId === s.activePlayerId)!.pendingTickets.length === 0)
        throw new Error('Train pending tickets mismatch.');
    if (s.phase === 'FINISHED' ? (s.finishedAt === null || s.result === null) : (s.finishedAt !== null || s.result !== null))
        throw new Error('Train phase mismatch.');
    if (s.finishedAt !== null && s.finishedAt < s.startedAt || s.feedback && !players.has(s.feedback.playerId))
        throw new Error('Train metadata mismatch.');
    if (s.result) {
        const scores = scoreTrain(s);
        if (JSON.stringify(scores) !== JSON.stringify(s.result.scores) || JSON.stringify(s.result.winnerPlayerIds) !== JSON.stringify(s.result.reason === 'CANCELLED' ? [] : winners(scores)) || s.result.reason === 'TRAINS' && s.finalTurnsRemaining !== 0)
            throw new Error('Train final scoring mismatch.');
    }
    return s;
}
function replenishDeck(s: TrainState, random: TrainRandom) { if (!s.deck.length && s.discard.length)
    s.deck = shuffleTrain(s.discard.splice(0), random); }
function fillMarket(s: TrainState, random: TrainRandom) { while (s.market.length < 5) {
    replenishDeck(s, random);
    const id = s.deck.shift();
    if (!id)
        break;
    s.market.push(id);
} }
function normalizeMarket(s: TrainState, random: TrainRandom) {
    fillMarket(s, random);
    let rounds = 0;
    while (s.market.filter(id => trainCard(s, id).color === 'LOCOMOTIVE').length >= 3) {
        const available = [...s.market, ...s.deck, ...s.discard];
        if (available.filter(id => trainCard(s, id).color !== 'LOCOMOTIVE').length < 3)
            break;
        s.discard.push(...s.market.splice(0));
        fillMarket(s, random);
        if (++rounds === 64) {
            const pool = shuffleTrain([...s.market, ...s.deck, ...s.discard], random), ordinary = pool.filter(id => trainCard(s, id).color !== 'LOCOMOTIVE').slice(0, 3), rest = pool.filter(id => !ordinary.includes(id));
            s.market = shuffleTrain([...ordinary, ...rest.splice(0, 2)], random);
            s.deck = rest;
            s.discard = [];
            break;
        }
    }
}
export function createTrainGame(input: {
    gameId: TrainState['gameId'];
    playerIds: PlayerId[];
    now: TrainState['startedAt'];
    transitionId: TrainState['transitionId'];
    starter: number;
    cards: TrainCard[];
    tickets: TrainTicketCard[];
}, random: TrainRandom): TrainState {
    const n = input.playerIds.length;
    if (n < 2 || n > 5 || !Number.isInteger(input.starter) || input.starter < 0 || input.starter >= n)
        throw new Error('Train needs 2–5 players.');
    const deck = input.cards.map(c => c.cardId), ticketDeck = input.tickets.map(c => c.cardId), players = input.playerIds.map(playerId => ({ playerId, trains: 45, routePoints: 0, hand: deck.splice(0, 4), tickets: [], pendingTickets: ticketDeck.splice(0, 3) }));
    const s = v.parse(State, { gameId: input.gameId, rulesVersion: TRAIN_RULES_VERSION, revision: 0, phase: 'PLAYING', startedAt: input.now, finishedAt: null, transitionId: input.transitionId, activePlayerId: input.playerIds[0], startingPlayerId: input.playerIds[input.starter], step: 'SETUP', setupIndex: 0, round: 1, finalTurnsRemaining: null, finalTriggerPlayerId: null, consecutivePasses: 0, cards: input.cards, tickets: input.tickets, deck, discard: [], market: [], ticketDeck, claims: [], players, result: null, feedback: null });
    normalizeMarket(s, random);
    return parseTrainState(s);
}
export function trainRouteAvailable(s: Pick<TrainState, 'claims' | 'players'>, actor: PlayerId, routeId: string): boolean { const route = TRAIN_ROUTES.find(r => r.routeId === routeId); return !!route && !s.claims.some(c => c.routeId === routeId || TRAIN_ROUTES.find(r => r.routeId === c.routeId)?.group === route.group && (s.players.length < 4 || c.playerId === actor)); }
function hasClaim(s: TrainState, actor: PlayerId) { const p = s.players.find(p => p.playerId === actor)!; return TRAIN_ROUTES.some(r => r.length <= p.trains && trainRouteAvailable(s, actor, r.routeId) && TRAIN_COLORS.filter(c => c !== 'LOCOMOTIVE' && (r.color === 'GRAY' || r.color === c)).some(color => p.hand.filter(id => { const c = trainCard(s, id).color; return c === color || c === 'LOCOMOTIVE'; }).length >= r.length)); }
export function canTrainPass(s: TrainState, actor: PlayerId): boolean { return s.step === 'TURN' && !s.deck.length && !s.discard.length && !s.market.length && !s.ticketDeck.length && !hasClaim(s, actor); }
function endTurn(s: TrainState, now: TrainState['startedAt']) {
    const p = s.players.find(p => p.playerId === s.activePlayerId)!;
    if (s.finalTurnsRemaining !== null) {
        s.finalTurnsRemaining--;
        if (s.finalTurnsRemaining === 0) {
            finish(s, 'TRAINS', now);
            return;
        }
    }
    else if (p.trains <= 2) {
        s.finalTriggerPlayerId = p.playerId;
        s.finalTurnsRemaining = s.players.length;
    }
    if (s.consecutivePasses >= s.players.length) {
        finish(s, 'STALEMATE', now);
        return;
    }
    const next = s.players[(s.players.indexOf(p) + 1) % s.players.length]!.playerId;
    s.activePlayerId = next;
    s.step = 'TURN';
    if (next === s.startingPlayerId)
        s.round++;
}
export type TrainApplied = {
    ok: true;
    state: TrainState;
} | {
    ok: false;
    reason: 'INVALID_PHASE' | 'NOT_YOUR_TURN' | 'INVALID_ACTION';
};
export function applyTrainAction(current: TrainState, actor: PlayerId, input: unknown, now: TrainState['startedAt'], nextTurn: TrainState['transitionId'], random: TrainRandom): TrainApplied {
    if (current.phase !== 'PLAYING')
        return { ok: false, reason: 'INVALID_PHASE' };
    if (current.activePlayerId !== actor)
        return { ok: false, reason: 'NOT_YOUR_TURN' };
    const parsed = v.safeParse(TrainActionSchema, input);
    if (!parsed.success)
        return { ok: false, reason: 'INVALID_ACTION' };
    const a = parsed.output, s = structuredClone(current), p = s.players.find(p => p.playerId === actor)!, invalid = (): TrainApplied => ({ ok: false, reason: 'INVALID_ACTION' });
    if (a.kind === 'KEEP_TICKETS') {
        if (s.step !== 'SETUP' && s.step !== 'CHOOSE_TICKETS')
            return invalid();
        const all = [...a.keepCardIds, ...a.returnCardIds], min = s.step === 'SETUP' ? 2 : 1;
        if (a.keepCardIds.length < min || all.length !== p.pendingTickets.length || new Set(all).size !== all.length || all.some(id => !p.pendingTickets.includes(id)))
            return invalid();
        p.tickets.push(...a.keepCardIds);
        s.ticketDeck.push(...a.returnCardIds);
        p.pendingTickets = [];
        if (s.step === 'SETUP') {
            s.setupIndex++;
            if (s.setupIndex === s.players.length) {
                s.activePlayerId = s.startingPlayerId;
                s.step = 'TURN';
            }
            else
                s.activePlayerId = s.players[s.setupIndex]!.playerId;
        }
        else
            endTurn(s, now);
    }
    else if (a.kind === 'DRAW_DECK' || a.kind === 'DRAW_MARKET') {
        if (s.step !== 'TURN' && s.step !== 'DRAW_SECOND')
            return invalid();
        let card: TrainCard;
        if (a.kind === 'DRAW_DECK') {
            replenishDeck(s, random);
            const id = s.deck.shift();
            if (!id)
                return invalid();
            card = trainCard(s, id);
        }
        else {
            const i = s.market.indexOf(a.cardId);
            if (i < 0)
                return invalid();
            card = trainCard(s, a.cardId);
            if (s.step === 'DRAW_SECOND' && card.color === 'LOCOMOTIVE')
                return invalid();
            s.market.splice(i, 1);
        }
        p.hand.push(card.cardId);
        normalizeMarket(s, random);
        s.consecutivePasses = 0;
        const canDrawSecond = s.deck.length + s.discard.length > 0 || s.market.some(id => trainCard(s, id).color !== 'LOCOMOTIVE');
        if (s.step === 'DRAW_SECOND' || a.kind === 'DRAW_MARKET' && card.color === 'LOCOMOTIVE' || !canDrawSecond)
            endTurn(s, now);
        else
            s.step = 'DRAW_SECOND';
    }
    else {
        if (s.step !== 'TURN')
            return invalid();
        if (a.kind === 'CLAIM_ROUTE') {
            const r = TRAIN_ROUTES.find(r => r.routeId === a.routeId);
            if (!r || !trainRouteAvailable(s, actor, r.routeId) || r.length > p.trains || a.cardIds.length !== r.length || new Set(a.cardIds).size !== a.cardIds.length || a.cardIds.some(id => !p.hand.includes(id)))
                return invalid();
            const colors = new Set(a.cardIds.map(id => trainCard(s, id).color).filter(c => c !== 'LOCOMOTIVE'));
            if (colors.size > 1 || r.color !== 'GRAY' && [...colors].some(c => c !== r.color))
                return invalid();
            p.hand = p.hand.filter(id => !a.cardIds.includes(id));
            s.discard.push(...a.cardIds);
            p.trains -= r.length;
            p.routePoints += TRAIN_ROUTE_POINTS[r.length]!;
            s.claims.push({ routeId: r.routeId, playerId: actor });
            s.consecutivePasses = 0;
            normalizeMarket(s, random);
            endTurn(s, now);
        }
        else if (a.kind === 'DRAW_TICKETS') {
            if (!s.ticketDeck.length)
                return invalid();
            p.pendingTickets = s.ticketDeck.splice(0, 3);
            s.step = 'CHOOSE_TICKETS';
            s.consecutivePasses = 0;
        }
        else if (a.kind === 'PASS') {
            if (!canTrainPass(s, actor))
                return invalid();
            s.consecutivePasses++;
            endTurn(s, now);
        }
    }
    s.revision = v.parse(GameRevisionSchema, s.revision + 1);
    s.transitionId = nextTurn;
    s.feedback = { playerId: actor, kind: a.kind, routeId: a.kind === 'CLAIM_ROUTE' ? a.routeId : null, at: now };
    return { ok: true, state: parseTrainState(s) };
}
export function cancelTrain(current: TrainState, now: TrainState['startedAt']): TrainState { const s = structuredClone(current); if (s.phase === 'FINISHED')
    return parseTrainState(s); s.revision = v.parse(GameRevisionSchema, s.revision + 1); finish(s, 'CANCELLED', now); return parseTrainState(s); }
export { ticketView as trainTicketViews };

import { shuffleFrozen } from "../../../domain/frozen-fisher-yates.js";
import * as v from "valibot";
import { SaboteurClientCommandSchema, GameRevisionSchema, RoomRevisionSchema, ServerTimeSchema, type SaboteurClientCommand, type ErrorDto, type RoomId, type PlayerId, type ServerTime } from "@hangul-rummikub/shared";
import { GameStartSuccessDataSchema, type StartGameInput, type GameStartResult } from "../../../application/game-start-service.js";
import type { RoomMutationSerialExecutor } from "../../../application/room-session-service.js";
import type { RoomRepository } from "../../../ports/room-repository.js";
import type { RoomUnitOfWork } from "../../../ports/room-unit-of-work.js";
import type { IdempotencyRepository } from "../../../ports/idempotency-repository.js";
import type { RoomPresencePolicyReader } from "../../../ports/room-presence-policy.js";
import type { Clock, IdGenerator, RandomSource } from "../../../ports/system.js";
import type { SaboteurRoomRecord } from "../../../model/persistence.js";
import { makeSaboteurCards, makeSaboteurGold, saboteurRoles } from "../domain/catalog.js";
import { createSaboteurGame, applySaboteurAction, confirmSaboteurRound, saySaboteur, type SaboteurState, type SaboteurRoundSetup } from "../domain/game.js";
export type SaboteurDependencies = Readonly<{
    roomRepository: RoomRepository;
    roomUnitOfWork: RoomUnitOfWork;
    idempotencyRepository: IdempotencyRepository;
    roomMutationExecutor: RoomMutationSerialExecutor;
    presence: RoomPresencePolicyReader;
    clock: Clock;
    ids: IdGenerator;
    random: RandomSource;
}>;
const failure = (code: ErrorDto['code']) => ({ ok: false as const, error: { code, message: code === 'RULE_VIOLATION' ? '선택한 카드와 수량을 확인해주세요.' : code === 'NOT_ENOUGH_PLAYERS' ? '사보타지는 3~10명이 플레이합니다.' : '현재 차례와 연결 상태를 확인해주세요.', recoverable: true } });
const Receipt = v.strictObject({ outcome: v.literal('ACCEPTED') });
export function transitionSaboteur(room: SaboteurRoomRecord, state: SaboteurState, at: ServerTime): Omit<SaboteurRoomRecord, 'storageRevision'> {
    if (!room.game)
        throw new Error('Missing Saboteur game.');
    const phase = state.phase === 'FINISHED' ? 'FINISHED' : 'PLAYING';
    return { ...room, phase, game: { ...room.game, state, gameRevision: state.revision, finishedAt: state.finishedAt }, roomRevision: phase === room.phase ? room.roomRevision : v.parse(RoomRevisionSchema, room.roomRevision + 1), updatedAt: at };
}
export class SaboteurService {
    private readonly listeners = new Set<(roomId: RoomId) => void | Promise<void>>();
    constructor(readonly deps: SaboteurDependencies) { }
    subscribe(listener: (roomId: RoomId) => void | Promise<void>) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
    async notify(roomId: RoomId) { await Promise.allSettled([...this.listeners].map(fn => Promise.resolve().then(() => fn(roomId)))); }
    private roundSetup(count: number): SaboteurRoundSetup {
        return { cards: [...shuffleFrozen(makeSaboteurCards(() => this.deps.ids.generateTileId()), this.deps.random)],
            roles: [...shuffleFrozen(saboteurRoles(count), this.deps.random)], goals: [...shuffleFrozen(['GOLD', 'ROCK_NE', 'ROCK_NW'] as const, this.deps.random)] };
    }
    async start(input: StartGameInput): Promise<GameStartResult> {
        const d = this.deps;
        try {
            return await d.roomMutationExecutor.run(input.roomId, async (): Promise<GameStartResult> => {
                if (!input.authorization.isCurrent())
                    return failure('UNAUTHENTICATED');
                const room = await d.roomRepository.findById(input.roomId);
                if (room?.gameType !== 'SABOTEUR' || room.departedPlayerIds?.includes(input.actorPlayerId) || !room.players.some(p => p.playerId === input.actorPlayerId))
                    return failure('INVALID_PHASE');
                const scopeKey = `room-player:${room.roomId}:${input.actorPlayerId}`, payloadFingerprint = JSON.stringify(['game:start', input.expectedRoomRevision]);
                const prior = await d.idempotencyRepository.classify(scopeKey, input.requestId, payloadFingerprint);
                if (prior.status === 'CONFLICT')
                    return failure('REQUEST_ID_REUSED');
                if (prior.status === 'REPLAY')
                    return { ok: true, data: v.parse(GameStartSuccessDataSchema, prior.record.terminalResult) };
                if (room.phase !== 'LOBBY' || room.game !== null)
                    return failure('INVALID_PHASE');
                if (room.hostPlayerId !== input.actorPlayerId)
                    return failure('HOST_ONLY');
                if (room.roomRevision !== input.expectedRoomRevision)
                    return failure('STALE_ROOM_REVISION');
                if (room.players.length < 3 || room.players.length > 10)
                    return failure('NOT_ENOUGH_PLAYERS');
                const lease = await d.presence.acquireRoomPresenceLease(room.roomId);
                if (!lease.isCurrent() || !room.players.every(p => lease.connectionStatusByPlayerId.get(p.playerId) === 'CONNECTED'))
                    return failure('PLAYERS_NOT_CONNECTED');
                const now = d.clock.now(), gameId = d.ids.generateGameId(), turnId = d.ids.generateTurnId();
                const state = createSaboteurGame({ ...this.roundSetup(room.players.length), goldCards: [...shuffleFrozen(makeSaboteurGold(() => d.ids.generateTileId()), d.random)], gameId, playerIds: room.players.map(p => p.playerId), now, transitionId: turnId, starter: d.random.nextInt(room.players.length) });
                const roomRevision = v.parse(RoomRevisionSchema, room.roomRevision + 1), gameRevision = v.parse(GameRevisionSchema, 0);
                const data = v.parse(GameStartSuccessDataSchema, { roomId: room.roomId, roomRevision, gameId, gameRevision, turnId });
                const committed = await d.roomUnitOfWork.commit({ roomMutation: { kind: 'REPLACE', candidate: { ...room, phase: 'PLAYING', roomRevision, updatedAt: now, game: { gameId, gameRevision, startedAt: now, finishedAt: null, state } }, expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision }, sessionMutation: { kind: 'NONE' }, idempotency: { scopeKey, requestId: input.requestId, payloadFingerprint, terminalResult: data, createdAt: now } }, { isSatisfied: () => input.authorization.isCurrent() && lease.isCurrent() });
                return committed.status === 'COMMITTED' ? { ok: true, data } : failure('STALE_ROOM_REVISION');
            });
        }
        catch {
            return failure('INTERNAL_ERROR');
        }
    }
    async command(input: Readonly<{
        roomId: RoomId;
        actorPlayerId: PlayerId;
        command: SaboteurClientCommand;
        receivedAt: ServerTime;
        authorization: {
            isCurrent(): boolean;
        };
    }>) {
        const parsed = v.safeParse(SaboteurClientCommandSchema, input.command);
        if (!parsed.success)
            return failure('INVALID_PAYLOAD');
        const d = this.deps, c = parsed.output;
        let changed = false;
        try {
            const result = await d.roomMutationExecutor.run(input.roomId, async () => {
                if (!input.authorization.isCurrent())
                    return failure('UNAUTHENTICATED');
                const room = await d.roomRepository.findById(input.roomId);
                if (room?.gameType !== 'SABOTEUR' || room.departedPlayerIds?.includes(input.actorPlayerId) || !room.players.some(p => p.playerId === input.actorPlayerId))
                    return failure('INVALID_PHASE');
                const scopeKey = `room-player:${room.roomId}:${input.actorPlayerId}`, payloadFingerprint = JSON.stringify(c);
                const prior = await d.idempotencyRepository.classify(scopeKey, c.requestId, payloadFingerprint);
                if (prior.status === 'CONFLICT')
                    return failure('REQUEST_ID_REUSED');
                if (prior.status === 'REPLAY') {
                    v.parse(Receipt, prior.record.terminalResult);
                    return { ok: true as const };
                }
                if (!room.game || room.game.gameId !== c.gameId || c.kind !== 'saboteur:say' && room.game.gameRevision < c.expectedGameRevision)
                    return failure('STALE_GAME_REVISION');
                if (room.phase !== 'PLAYING')
                    return failure('INVALID_PHASE');
                const s = room.game.state, now = v.parse(ServerTimeSchema, d.clock.now());
                if (c.kind === 'saboteur:act' && c.turnId !== s.transitionId || (c.kind === 'saboteur:nextRound' || c.kind === 'saboteur:say') && c.roundId !== s.roundId)
                    return failure('STALE_GAME_REVISION');
                if (c.kind === 'saboteur:nextRound' && (s.phase !== 'ROUND_RESULT' || s.confirmedPlayerIds.includes(input.actorPlayerId)))
                    return failure('INVALID_PHASE');
                const applied = c.kind === 'saboteur:say' ? saySaboteur(s, input.actorPlayerId, c.payload.text, c.payload.sequence, now) : c.kind === 'saboteur:act' ? applySaboteurAction(s, input.actorPlayerId, c.payload, now, d.ids.generateTurnId()) : confirmSaboteurRound(s, input.actorPlayerId, s.confirmedPlayerIds.length === s.players.length - 1 ? this.roundSetup(s.players.length) : null, d.ids.generateTurnId());
                if (!applied.ok)
                    return failure(applied.reason === 'INVALID_ACTION' ? 'RULE_VIOLATION' : applied.reason);
                const committed = await d.roomUnitOfWork.commit({ roomMutation: { kind: 'REPLACE', candidate: transitionSaboteur(room, applied.state, now), expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision }, sessionMutation: { kind: 'NONE' }, idempotency: { scopeKey, requestId: c.requestId, payloadFingerprint, terminalResult: { outcome: 'ACCEPTED' }, createdAt: now } }, { isSatisfied: () => input.authorization.isCurrent() });
                if (committed.status !== 'COMMITTED')
                    return failure('STALE_GAME_REVISION');
                changed = true;
                return { ok: true as const };
            });
            if (changed)
                await this.notify(input.roomId);
            return result;
        }
        catch {
            return failure('INTERNAL_ERROR');
        }
    }
}

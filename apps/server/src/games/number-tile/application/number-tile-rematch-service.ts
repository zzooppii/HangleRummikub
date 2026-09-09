import { RoomRevisionSchema, type ErrorDto, type GameId, type GameRevision, type RoomRevision } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { StartGameInput } from "../../../application/game-start-service.js";
import type { NumberTilePassServiceDependencies } from "./number-tile-pass-service.js";

export type NumberRematchInput = StartGameInput & Readonly<{ gameId: GameId; expectedGameRevision: GameRevision }>;
export type NumberRematchResult = { ok: true; roomRevision: RoomRevision } | { ok: false; error: ErrorDto };
const failure = (code: ErrorDto["code"]): NumberRematchResult => ({ ok: false, error: { code, message: "다시 하기 요청을 처리할 수 없습니다. 현재 방 상태를 확인해주세요.", recoverable: true } });

/** Resets only NUMBER's finished game. Room/session identity remains untouched. */
export class NumberTileRematchService {
  constructor(private readonly deps: NumberTilePassServiceDependencies) {}
  async rematch(input: NumberRematchInput): Promise<NumberRematchResult> {
    try {
      return await this.deps.roomMutationExecutor.run(input.roomId, async () => {
        if (!input.authorization.isCurrent()) return failure("UNAUTHENTICATED");
        const room = await this.deps.roomRepository.findById(input.roomId);
        if (!room) return failure("ROOM_NOT_FOUND");
        if (room.gameType !== "NUMBER_TILE") return failure("INVALID_PHASE");
        if (room.hostPlayerId !== input.actorPlayerId) return failure("HOST_ONLY");
        const scopeKey = `room-player:${input.roomId}:${input.actorPlayerId}`;
        const payloadFingerprint = JSON.stringify(["number:rematch", input.gameId, input.expectedGameRevision, input.expectedRoomRevision]);
        const prior = await this.deps.idempotencyRepository.classify(scopeKey, input.requestId, payloadFingerprint);
        if (prior.status === "CONFLICT") return failure("REQUEST_ID_REUSED");
        if (prior.status === "REPLAY") {
          const value = prior.record.terminalResult;
          if (typeof value !== "object" || value === null || !("numberRematchRevision" in value)) return failure("INTERNAL_ERROR");
          return { ok: true, roomRevision: parse(RoomRevisionSchema, value.numberRematchRevision) };
        }
        if (room.phase !== "FINISHED" || room.game === null) return failure("INVALID_PHASE");
        if (room.roomRevision !== input.expectedRoomRevision) return failure("STALE_ROOM_REVISION");
        if (room.game.gameId !== input.gameId || room.game.gameRevision !== input.expectedGameRevision) return failure("STALE_GAME_REVISION");
        const roomRevision = parse(RoomRevisionSchema, room.roomRevision + 1), now = this.deps.clock.now();
        const committed = await this.deps.roomUnitOfWork.commit({
          roomMutation: { kind: "REPLACE", expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision,
            candidate: { roomId: room.roomId, roomCode: room.roomCode, gameType: "NUMBER_TILE", phase: "LOBBY", hostPlayerId: room.hostPlayerId, players: room.players.filter(p => !room.departedPlayerIds?.includes(p.playerId)), game: null, roomRevision, createdAt: room.createdAt, updatedAt: now } },
          sessionMutation: { kind: "NONE" },
          idempotency: { scopeKey, requestId: input.requestId, payloadFingerprint, terminalResult: { numberRematchRevision: roomRevision }, createdAt: now },
        }, { isSatisfied: () => input.authorization.isCurrent() });
        if (committed.status !== "COMMITTED" && committed.status !== "REPLAY") return failure("STALE_ROOM_REVISION");
        // Finished games already have no active deadline; no replay may cancel a new game.
        return { ok: true, roomRevision };
      });
    } catch { return failure("INTERNAL_ERROR"); }
  }
}

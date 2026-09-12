import { RoomRevisionSchema, type ErrorDto, type GameType, type RoomPreparationCommand, type RoomRevision } from "@hangul-rummikub/shared";
import * as v from "valibot";
import type { RoomWriteCandidate } from "../model/persistence.js";
import type { StartGameInput } from "./game-start-service.js";
import type { RoomMutationSerialExecutor } from "./room-session-service.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type { RoomUnitOfWork } from "../ports/room-unit-of-work.js";
import type { IdempotencyRepository } from "../ports/idempotency-repository.js";
import type { Clock } from "../ports/system.js";

type Dependencies = Readonly<{ roomRepository: RoomRepository; roomMutationExecutor: RoomMutationSerialExecutor; roomUnitOfWork: RoomUnitOfWork; idempotencyRepository: IdempotencyRepository; clock: Clock }>;
export type RoomPreparationInput = Pick<StartGameInput, "roomId" | "actorPlayerId" | "authorization"> & Readonly<{
  command: RoomPreparationCommand;
  canRepresentGame(gameType: GameType): boolean;
}>;
type Result = { ok: true; roomRevision: RoomRevision } | { ok: false; error: ErrorDto };
const fail = (code: ErrorDto["code"], message = "방 상태가 변경되었습니다. 다시 확인해주세요."): Result => ({ ok: false, error: { code, message, recoverable: true } });

/** Keeps the room and bound sessions while replacing only the completed game. */
export class RoomGameSelectionService {
  constructor(private readonly deps: Dependencies) {}

  async prepare(input: RoomPreparationInput): Promise<Result> {
    try {
      return await this.deps.roomMutationExecutor.run(input.roomId, async () => {
        if (!input.authorization.isCurrent()) return fail("UNAUTHENTICATED");
        const room = await this.deps.roomRepository.findById(input.roomId);
        if (room === null) return fail("ROOM_NOT_FOUND");
        const departed = "departedPlayerIds" in room ? room.departedPlayerIds ?? [] : [];
        const players = room.players.filter(player => !departed.includes(player.playerId));
        if (!players.some(player => player.playerId === input.actorPlayerId)) return fail("UNAUTHENTICATED");
        const { command } = input;
        if (command.kind === "room:selectGame" && room.hostPlayerId !== input.actorPlayerId) return fail("HOST_ONLY", "방장만 게임을 변경할 수 있습니다.");
        const scopeKey = `room-player:${room.roomId}:${input.actorPlayerId}`;
        const fingerprint = JSON.stringify(command);
        const prior = await this.deps.idempotencyRepository.classify(scopeKey, command.requestId, fingerprint);
        if (prior.status === "CONFLICT") return fail("REQUEST_ID_REUSED");
        if (prior.status === "REPLAY") {
          const parsed = v.safeParse(v.strictObject({ roomPreparationRevision: RoomRevisionSchema }), prior.record.terminalResult);
          return parsed.success ? { ok: true, roomRevision: parsed.output.roomPreparationRevision } : fail("INTERNAL_ERROR");
        }
        if (room.roomRevision !== command.expectedRoomRevision) return fail("STALE_ROOM_REVISION");
        if (room.phase === "PLAYING") return fail("INVALID_PHASE", "진행 중인 게임이 끝난 뒤 변경할 수 있습니다.");
        const roomRevision = v.parse(RoomRevisionSchema, room.roomRevision + 1);
        const now = this.deps.clock.now();
        let candidate: RoomWriteCandidate;
        if (command.kind === "room:selectGame") {
          if ((room.game?.gameId ?? null) !== command.payload.gameId || (room.game?.gameRevision ?? null) !== command.expectedGameRevision) return fail("STALE_GAME_REVISION");
          if (!input.canRepresentGame(command.payload.gameType)) return fail("INCOMPATIBLE_GAME_CAPABILITY", "참가자가 새로고침하여 선택한 게임을 지원하는 버전으로 접속해야 합니다.");
          const lobby = {
            roomId: room.roomId, roomCode: room.roomCode,
            phase: "LOBBY" as const, game: null, players, hostPlayerId: room.hostPlayerId,
            ...(room.liarPromptHistory === undefined ? {} : { liarPromptHistory: room.liarPromptHistory }),
            readyPlayerIds: [], roomRevision, createdAt: room.createdAt, updatedAt: now,
          };
          candidate = command.payload.gameType === "SPACE_CREW"
            ? { ...lobby, gameType: "SPACE_CREW" }
            : { ...lobby, gameType: command.payload.gameType };
          if (command.payload.gameType === "LIAR_GAME" && room.gameType === "LIAR_GAME") {
            candidate = { ...candidate, gameType: "LIAR_GAME", game: null, settings: room.settings ?? { category: "RANDOM", discussionSeconds: 90 } };
          }
          if(command.payload.gameType === "SPLENDOR" && room.gameType === "SPLENDOR") {
            candidate={...candidate,gameType:"SPLENDOR",game:null,settings:room.settings??{mode:"BASE"}};
          }
          if(command.payload.gameType === "LOST_CITIES" && room.gameType === "LOST_CITIES") {
            candidate={...candidate,gameType:"LOST_CITIES",game:null,settings:room.settings??{mode:"BASE"}};
          }
        } else {
          if (room.phase !== "LOBBY" || room.readyPlayerIds === undefined) return fail("INVALID_PHASE");
          const others = room.readyPlayerIds.filter(id => id !== input.actorPlayerId);
          candidate = { ...room, roomRevision, updatedAt: now, readyPlayerIds: command.payload.ready ? [...others, input.actorPlayerId] : others };
        }
        const result = await this.deps.roomUnitOfWork.commit({
          roomMutation: {
            kind: command.kind === "room:selectGame" ? "RESET_GAME" : "REPLACE", candidate,
            expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision,
          },
          sessionMutation: { kind: "NONE" },
          idempotency: { scopeKey, requestId: command.requestId, payloadFingerprint: fingerprint, terminalResult: { roomPreparationRevision: roomRevision }, createdAt: now },
        }, { isSatisfied: () => input.authorization.isCurrent() && (command.kind !== "room:selectGame" || input.canRepresentGame(command.payload.gameType)) });
        if (result.status === "IDEMPOTENCY_CONFLICT") return fail("REQUEST_ID_REUSED");
        if (result.status === "PRECONDITION_FAILED") return fail(result.reason === "COMMIT_PRECONDITION_FAILED" ? "UNAUTHENTICATED" : "STALE_ROOM_REVISION");
        return { ok: true, roomRevision };
      });
    } catch { return fail("INTERNAL_ERROR"); }
  }
}

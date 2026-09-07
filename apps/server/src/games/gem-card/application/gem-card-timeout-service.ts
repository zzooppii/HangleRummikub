import { RequestIdSchema } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { scheduleCurrentTurnBestEffort } from "../../../application/turn-transition.js";
import type { PlayerPresenceLeaseReader } from "../../../ports/player-presence-lease.js";
import type { ScheduledTurnDeadline } from "../../../ports/system.js";
import { applyGemTimeoutRule, evaluateGemFinishAfterConsumedTurn } from "../domain/progress.js";
import { asGemPlayingRoom, gemMutationData, notifyGemMutation, parseGemReplay, type GemCommandDependencies, type GemMutationData } from "./gem-card-command-service.js";
import { transitionGemRoom } from "./gem-card-transition.js";
export type GemTimeoutResult = Readonly<{
  status: "APPLIED";
  data: GemMutationData;
}> | Readonly<{
  status: "NO_OP";
  reason: "STALE" | "NOT_DUE" | "PRESENCE_CHANGED";
}> | Readonly<{
  status: "FAILED";
}>;
export type GemTimeoutDependencies = GemCommandDependencies & Readonly<{
  presenceLeaseReader: PlayerPresenceLeaseReader;
}>;
type Execution = {
  result: GemTimeoutResult;
  committed: boolean;
};
const noOp = (reason: "STALE" | "NOT_DUE" | "PRESENCE_CHANGED"): Execution => ({ result: { status: "NO_OP", reason }, committed: false });
const failed = (): Execution => ({ result: { status: "FAILED" }, committed: false });
export class GemCardTimeoutService {
  readonly #deps: GemTimeoutDependencies;
  readonly #listeners = new Set<(data: GemMutationData) => void | Promise<void>>();
  constructor(deps: GemTimeoutDependencies) { this.#deps = deps; }
  subscribeApplied(listener: (data: GemMutationData) => void | Promise<void>): () => void { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  async timeout(input: ScheduledTurnDeadline): Promise<GemTimeoutResult> {
    let execution: Execution;
    try {
      execution = await this.#deps.roomMutationExecutor.run(input.roomId, () => this.#withinLane(input));
    }
    catch {
      return { status: "FAILED" };
    }
    if (execution.result.status === "APPLIED") {
      const data = execution.result.data;
      await notifyGemMutation(this.#deps, data);
      if (execution.committed)
        await Promise.allSettled([...this.#listeners].map(listener => Promise.resolve().then(() => listener(data))));
    }
    else if (execution.result.status === "NO_OP" && execution.result.reason === "NOT_DUE") {
      await scheduleCurrentTurnBestEffort(this.#deps.roomRepository, this.#deps.turnScheduler, { roomId: input.roomId, gameId: input.gameId, gameRevision: input.expectedGameRevision, turnId: input.turnId }, this.#deps.onTurnSchedulingFailure);
    }
    return execution.result;
  }
  async #withinLane(input: ScheduledTurnDeadline): Promise<Execution> {
    const located = await this.#deps.roomRepository.findById(input.roomId);
    if (!located)
      return noOp("STALE");
    if (located.gameType !== "GEM_CARD")
      return failed();
    const room = asGemPlayingRoom(located);
    if (!room || room.game.gameId !== input.gameId || room.game.gameRevision !== input.expectedGameRevision || room.game.turn.turnId !== input.turnId || room.game.turn.deadlineAt !== input.deadlineAt)
      return noOp("STALE");
    const at = this.#deps.clock.now();
    if (at < input.deadlineAt)
      return noOp("NOT_DUE");
    const scopeKey = `room-timeout:${input.roomId}:${input.gameId}`;
    const requestId = parse(RequestIdSchema, `gem-timeout:${input.gameId}:${input.turnId}`);
    const payloadFingerprint = JSON.stringify(["gem:timeout", input.gameId, input.turnId, input.expectedGameRevision, input.deadlineAt]);
    const prior = await this.#deps.idempotencyRepository.classify(scopeKey, requestId, payloadFingerprint);
    if (prior.status === "CONFLICT")
      return failed();
    if (prior.status === "REPLAY") {
      const replay = parseGemReplay(prior.record.terminalResult);
      return replay.ok ? { result: { status: "APPLIED", data: replay.data }, committed: false } : failed();
    }
    const lease = await this.#deps.presenceLeaseReader.acquirePlayerPresenceLease(room.roomId, room.game.turn.activePlayerId);
    if (!lease.isCurrent())
      return noOp("PRESENCE_CHANGED");
    const change = applyGemTimeoutRule({ ...room.game, playerId: room.game.turn.activePlayerId, isOffline: lease.connectionStatus === "OFFLINE" });
    const base = { ...room.game, players: change.players, supply: change.supply, noProgressPlayerIds: change.noProgressPlayerIds };
    const finish = evaluateGemFinishAfterConsumedTurn({ ...base, actorPlayerId: room.game.turn.activePlayerId, existingPendingFairRound: room.game.pendingFairRound });
    const candidate = transitionGemRoom(room, base, finish, at, this.#deps.idGenerator, true);
    const terminalResult = gemMutationData({ ...candidate, storageRevision: room.storageRevision });
    const result = await this.#deps.roomUnitOfWork.commit({ roomMutation: { kind: "REPLACE", candidate, expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision }, sessionMutation: { kind: "NONE" }, idempotency: { scopeKey, requestId, payloadFingerprint, terminalResult, createdAt: at } }, { isSatisfied: () => lease.isCurrent() });
    if (result.status === "COMMITTED" || result.status === "REPLAY") {
      const parsed = parseGemReplay(result.idempotency.terminalResult);
      return parsed.ok ? { result: { status: "APPLIED", data: parsed.data }, committed: result.status === "COMMITTED" } : failed();
    }
    return result.status === "PRECONDITION_FAILED" ? noOp(result.reason === "COMMIT_PRECONDITION_FAILED" ? "PRESENCE_CHANGED" : "STALE") : failed();
  }
}

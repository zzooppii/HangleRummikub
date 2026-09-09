import { PlayerIdSchema, RequestIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { scheduleCurrentTurnBestEffort } from "../../../application/turn-transition.js";
import type { PlayerPresenceLeaseReader } from "../../../ports/player-presence-lease.js";
import type { ScheduledTurnDeadline } from "../../../ports/system.js";
import { timeoutCityWindow } from "../domain/rule-engine.js";
import { asCityPlayingRoom, cityMutationData, notifyCityMutation, parseCityReplay, type CityCommandDependencies, type CityMutationData } from "./city-role-command-service.js";
import { CityRoleEntropySource, cityDomainEntropy } from "./city-role-entropy.js";
import { transitionCityRoom } from "./city-role-transition.js";

export type CityTimeoutResult = Readonly<{ status: "APPLIED"; data: CityMutationData }> | Readonly<{ status: "NO_OP"; reason: "STALE" | "NOT_DUE" | "PRESENCE_CHANGED" }> | Readonly<{ status: "FAILED" }>;
export type CityTimeoutDependencies = CityCommandDependencies & Readonly<{ presenceLeaseReader: PlayerPresenceLeaseReader }>;
type Execution = Readonly<{ result: CityTimeoutResult; committed: boolean }>;
const noOp = (reason: "STALE" | "NOT_DUE" | "PRESENCE_CHANGED"): Execution => ({ result: { status: "NO_OP", reason }, committed: false });
const failed = (): Execution => ({ result: { status: "FAILED" }, committed: false });
export class CityRoleTimeoutService {
  readonly #deps: CityTimeoutDependencies;
  readonly #listeners = new Set<(data: CityMutationData) => void | Promise<void>>();
  constructor(deps: CityTimeoutDependencies) { this.#deps = deps; }
  subscribeApplied(listener: (data: CityMutationData) => void | Promise<void>): () => void { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
  async timeout(input: ScheduledTurnDeadline): Promise<CityTimeoutResult> {
    let execution: Execution;
    try { execution = await this.#deps.roomMutationExecutor.run(input.roomId, () => this.#withinLane(input)); }
    catch { return { status: "FAILED" }; }
    if (execution.result.status === "APPLIED") {
      const data = execution.result.data;
      await notifyCityMutation(this.#deps, data);
      if (execution.committed) await Promise.allSettled([...this.#listeners].map(listener => Promise.resolve().then(() => listener(data))));
    } else if (execution.result.status === "NO_OP" && execution.result.reason === "NOT_DUE") {
      await scheduleCurrentTurnBestEffort(this.#deps.roomRepository, this.#deps.turnScheduler, { roomId: input.roomId, gameId: input.gameId,
        gameRevision: input.expectedGameRevision, turnId: input.turnId }, this.#deps.onTurnSchedulingFailure);
    }
    return execution.result;
  }
  async #withinLane(input: ScheduledTurnDeadline): Promise<Execution> {
    const located = await this.#deps.roomRepository.findById(input.roomId);
    if (!located) return noOp("STALE");
    if (located.gameType !== "CITY_ROLE") return failed();
    const room = asCityPlayingRoom(located);
    if (!room || room.game.gameId !== input.gameId || room.game.gameRevision !== input.expectedGameRevision ||
      String(room.game.state.window.actionId) !== input.turnId || room.game.deadlineAt !== input.deadlineAt) return noOp("STALE");
    const at = this.#deps.clock.now();
    if (at < input.deadlineAt) return noOp("NOT_DUE");
    const scopeKey = `room-timeout:${input.roomId}:${input.gameId}`;
    const requestId = parse(RequestIdSchema, `city-timeout:${input.gameId}:${input.turnId}`);
    const payloadFingerprint = JSON.stringify(["city:timeout", input.gameId, input.turnId, input.expectedGameRevision, input.deadlineAt]);
    const prior = await this.#deps.idempotencyRepository.classify(scopeKey, requestId, payloadFingerprint);
    if (prior.status === "CONFLICT") return failed();
    if (prior.status === "REPLAY") {
      const replay = parseCityReplay(prior.record.terminalResult);
      return replay.ok ? { result: { status: "APPLIED", data: replay.data }, committed: false } : failed();
    }
    const game = room.game, window = game.state.window;
    const actorId: PlayerId = parse(PlayerIdSchema, window.activePlayerId);
    const lease = await this.#deps.presenceLeaseReader.acquirePlayerPresenceLease(room.roomId, actorId);
    if (!lease.isCurrent()) return noOp("PRESENCE_CHANGED");
    const offline = lease.connectionStatus === "OFFLINE";
    const actor = game.state.players.find(player => player.playerId === window.activePlayerId);
    if (!actor) return failed();
    const random = new CityRoleEntropySource(game.entropySeed, game.entropyCounter);
    // E02's next-role reshuffle happens after third-timeout liquidation. The
    // pending default retains first and bottoms the rest before liquidation.
    const pendingKept = game.state.pendingChoice?.cards.slice(0, 1) ?? [];
    const discard = offline && actor.offlineTimeoutStreak >= 2
      ? [...game.state.discard, ...actor.hand, ...pendingKept] : game.state.discard;
    const role = window.kind === "ROLE_SELECTION" ? game.state.round.available[random.nextInt(game.state.round.available.length)] : undefined;
    const remaining = game.state.round.available.filter(candidate => candidate !== role);
    const discardRoleId = role !== undefined && game.state.roleDraftVersion === "city-draft-v2" && game.state.round.eligibleAtSetup.length === 2
      ? remaining[random.nextInt(remaining.length)] : undefined;
    const state = timeoutCityWindow(game.state, { gameId: game.state.gameId, actionId: window.actionId, playerId: window.activePlayerId },
      { offline, ...(role === undefined ? {} : { selectedRoleId: role }), ...(discardRoleId === undefined ? {} : { discardRoleId }) }, cityDomainEntropy(this.#deps.idGenerator, random, discard));
    const candidate = transitionCityRoom(room, state, at, random.counter);
    const terminalResult = cityMutationData({ ...candidate, storageRevision: room.storageRevision }, window.actionId);
    const actorForfeited = state.players.some(player => player.playerId === actor.playerId && player.forfeited);
    const committed = await this.#deps.roomUnitOfWork.commit({ roomMutation: { kind: "REPLACE", candidate,
      expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision },
      sessionMutation: actorForfeited ? { kind: "DELETE_BOUND_PLAYER", roomId: room.roomId, playerId: actorId } : { kind: "NONE" },
      idempotency: { scopeKey, requestId, payloadFingerprint, terminalResult, createdAt: at } }, { isSatisfied: () => lease.isCurrent() });
    if (committed.status === "COMMITTED" || committed.status === "REPLAY") {
      const replay = parseCityReplay(committed.idempotency.terminalResult);
      return replay.ok ? { result: { status: "APPLIED", data: replay.data }, committed: committed.status === "COMMITTED" } : failed();
    }
    return committed.status === "PRECONDITION_FAILED" ? noOp(committed.reason === "COMMIT_PRECONDITION_FAILED" ? "PRESENCE_CHANGED" : "STALE") : failed();
  }
}

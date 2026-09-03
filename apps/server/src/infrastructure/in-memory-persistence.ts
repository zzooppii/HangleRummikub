import type {
  RequestId,
  RoomCode,
  RoomId,
  ServerTime,
} from "@hangul-rummikub/shared";
import { BOOTSTRAP_SESSION_TTL_MS } from "@hangul-rummikub/shared";

import { cloneGameState } from "../domain/game/game-state.js";
import {
  createStorageRevision,
  incrementStorageRevision,
  type BoundSessionRecord,
  type IdempotencyRecord,
  type JsonValue,
  type RoomRecord,
  type RoomWriteCandidate,
  type SessionRecord,
  type StorageRevision,
  type UnboundSessionRecord,
} from "../model/persistence.js";
import type {
  IdempotencyLookupResult,
  IdempotencyRepository,
} from "../ports/idempotency-repository.js";
import type {
  CreateRoomResult,
  DeleteRoomInput,
  DeleteRoomResult,
  ReplaceRoomInput,
  ReplaceRoomResult,
  RoomRepository,
} from "../ports/room-repository.js";
import type {
  RoomUnitOfWorkCommitPrecondition,
  RoomUnitOfWork,
  RoomUnitOfWorkChangeSet,
  RoomUnitOfWorkFailure,
  RoomUnitOfWorkResult,
} from "../ports/room-unit-of-work.js";
import type {
  PromoteUnboundSessionInput,
  PromoteUnboundSessionResult,
  SaveUnboundSessionResult,
  SessionRepository,
} from "../ports/session-repository.js";
import type { SessionVerificationData } from "../ports/system.js";

type InMemoryState = {
  roomsById: Map<RoomId, RoomRecord>;
  roomIdByCode: Map<RoomCode, RoomId>;
  sessionsByVerificationKey: Map<string, SessionRecord>;
  idempotencyByScope: Map<string, Map<RequestId, IdempotencyRecord>>;
};

export type InMemoryCommitCheckpoint =
  | "AFTER_ROOM_WRITE"
  | "AFTER_SESSION_WRITE"
  | "AFTER_IDEMPOTENCY_WRITE";

export type InMemoryPersistenceOptions = Readonly<{
  onCommitCheckpoint?: (checkpoint: InMemoryCommitCheckpoint) => void;
}>;

type AppliedRoomResult =
  | { status: "APPLIED"; room: RoomRecord | null }
  | { status: "FAILED"; reason: RoomUnitOfWorkFailure };

const FORBIDDEN_REPLAY_FIELD_NAMES = new Set([
  "bootstrapCredential",
  "connectionGeneration",
  "constructor",
  "digestHex",
  "__proto__",
  "prototype",
  "rawToken",
  "sessionToken",
  "socketId",
  "storageRevision",
  "tokenHash",
  "verificationData",
]);

function emptyState(): InMemoryState {
  return {
    roomsById: new Map(),
    roomIdByCode: new Map(),
    sessionsByVerificationKey: new Map(),
    idempotencyByScope: new Map(),
  };
}

function copyState(state: InMemoryState): InMemoryState {
  return {
    roomsById: new Map(state.roomsById),
    roomIdByCode: new Map(state.roomIdByCode),
    sessionsByVerificationKey: new Map(state.sessionsByVerificationKey),
    idempotencyByScope: new Map(
      [...state.idempotencyByScope].map(([scopeKey, records]) => [
        scopeKey,
        new Map(records),
      ]),
    ),
  };
}

function requireNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function requireNonEmpty(value: string, name: string): void {
  if (value.length === 0) {
    throw new TypeError(`${name} must not be empty.`);
  }
}

function cloneStorageRevision(revision: StorageRevision): StorageRevision {
  return createStorageRevision(revision);
}

function clonePlayerRecord(
  player: RoomRecord["players"][number],
): RoomRecord["players"][number] {
  requireNonNegativeSafeInteger(player.joinOrder, "joinOrder");
  return Object.freeze({
    playerId: player.playerId,
    nickname: player.nickname,
    joinOrder: player.joinOrder,
  });
}

function cloneRoomWriteCandidate(
  candidate: RoomWriteCandidate,
): RoomWriteCandidate {
  requireNonNegativeSafeInteger(candidate.roomRevision, "roomRevision");
  requireNonNegativeSafeInteger(candidate.createdAt, "createdAt");
  requireNonNegativeSafeInteger(candidate.updatedAt, "updatedAt");

  if (candidate.phase === "LOBBY") {
    if (candidate.game !== null) {
      throw new TypeError("A LOBBY Room must not contain a GameState.");
    }
  } else if (candidate.phase === "PLAYING") {
    if (
      candidate.game === null ||
      candidate.game.turn === null ||
      candidate.game.result !== null
    ) {
      throw new TypeError("A PLAYING Room must contain an active GameState.");
    }
  } else if (
    candidate.game === null ||
    candidate.game.turn !== null ||
    candidate.game.result === null
  ) {
    throw new TypeError("A FINISHED Room must contain a terminal GameState.");
  }

  return Object.freeze({
    roomId: candidate.roomId,
    roomCode: candidate.roomCode,
    phase: candidate.phase,
    hostPlayerId: candidate.hostPlayerId,
    players: Object.freeze(candidate.players.map(clonePlayerRecord)),
    game: candidate.game === null ? null : cloneGameState(candidate.game),
    roomRevision: candidate.roomRevision,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  });
}

function persistRoom(
  candidate: RoomWriteCandidate,
  storageRevision: StorageRevision,
): RoomRecord {
  const detached = cloneRoomWriteCandidate(candidate);
  return Object.freeze({
    roomId: detached.roomId,
    roomCode: detached.roomCode,
    phase: detached.phase,
    hostPlayerId: detached.hostPlayerId,
    players: detached.players,
    game: detached.game,
    roomRevision: detached.roomRevision,
    storageRevision: cloneStorageRevision(storageRevision),
    createdAt: detached.createdAt,
    updatedAt: detached.updatedAt,
  });
}

function cloneRoomRecord(room: RoomRecord): RoomRecord {
  return persistRoom(room, room.storageRevision);
}

function cloneVerificationData(
  verificationData: SessionVerificationData,
): SessionVerificationData {
  if (
    verificationData.algorithm !== "SHA-256" ||
    !/^[0-9a-f]{64}$/u.test(verificationData.digestHex)
  ) {
    throw new TypeError("Session verification data is invalid.");
  }

  return Object.freeze({
    algorithm: verificationData.algorithm,
    digestHex: verificationData.digestHex,
  });
}

function verificationKey(
  verificationData: SessionVerificationData,
): string {
  const detached = cloneVerificationData(verificationData);
  return `${detached.algorithm}:${detached.digestHex}`;
}

function cloneUnboundSession(
  session: UnboundSessionRecord,
): UnboundSessionRecord {
  requireNonNegativeSafeInteger(session.issuedAt, "issuedAt");
  requireNonNegativeSafeInteger(session.expiresAt, "expiresAt");
  if (session.expiresAt < session.issuedAt) {
    throw new RangeError("expiresAt must not precede issuedAt.");
  }
  if (session.expiresAt - session.issuedAt !== BOOTSTRAP_SESSION_TTL_MS) {
    throw new RangeError("UNBOUND session lifetime must be exactly 5 minutes.");
  }

  return Object.freeze({
    state: "UNBOUND",
    verificationData: cloneVerificationData(session.verificationData),
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
  });
}

function cloneBoundSession(session: BoundSessionRecord): BoundSessionRecord {
  return Object.freeze({
    state: "BOUND",
    verificationData: cloneVerificationData(session.verificationData),
    roomId: session.roomId,
    playerId: session.playerId,
  });
}

function cloneSessionRecord(session: SessionRecord): SessionRecord {
  switch (session.state) {
    case "UNBOUND":
      return cloneUnboundSession(session);
    case "BOUND":
      return cloneBoundSession(session);
  }
}

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Idempotency terminal result must be JSON-safe.");
    }
    return value;
  }

  if (isJsonArray(value)) {
    return Object.freeze(value.map(cloneJsonValue));
  }

  const detached: Record<string, JsonValue> = {};
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_REPLAY_FIELD_NAMES.has(key)) {
      throw new TypeError(
        "Idempotency terminal result contains a server-private field.",
      );
    }
    const nested = value[key];
    if (nested === undefined) {
      throw new TypeError("Idempotency terminal result must be JSON-safe.");
    }
    detached[key] = cloneJsonValue(nested);
  }
  return Object.freeze(detached);
}

function cloneIdempotencyRecord(
  record: IdempotencyRecord,
): IdempotencyRecord {
  requireNonEmpty(record.scopeKey, "scopeKey");
  requireNonEmpty(record.payloadFingerprint, "payloadFingerprint");
  requireNonNegativeSafeInteger(record.createdAt, "createdAt");

  return Object.freeze({
    scopeKey: record.scopeKey,
    requestId: record.requestId,
    payloadFingerprint: record.payloadFingerprint,
    terminalResult: cloneJsonValue(record.terminalResult),
    createdAt: record.createdAt,
  });
}

function classifyIdempotency(
  state: InMemoryState,
  scopeKey: string,
  requestId: RequestId,
  payloadFingerprint: string,
): IdempotencyLookupResult {
  requireNonEmpty(scopeKey, "scopeKey");
  requireNonEmpty(payloadFingerprint, "payloadFingerprint");

  const existing = state.idempotencyByScope.get(scopeKey)?.get(requestId);
  if (existing === undefined) {
    return { status: "MISS" };
  }

  return existing.payloadFingerprint === payloadFingerprint
    ? { status: "REPLAY", record: cloneIdempotencyRecord(existing) }
    : { status: "CONFLICT", record: cloneIdempotencyRecord(existing) };
}

function insertIdempotency(
  state: InMemoryState,
  record: IdempotencyRecord,
): IdempotencyRecord {
  const detached = cloneIdempotencyRecord(record);
  const scopeRecords =
    state.idempotencyByScope.get(detached.scopeKey) ?? new Map();
  const nextScopeRecords = new Map(scopeRecords);
  nextScopeRecords.set(detached.requestId, detached);
  state.idempotencyByScope.set(detached.scopeKey, nextScopeRecords);
  return detached;
}

function deleteIdempotencyScopes(
  state: InMemoryState,
  scopeKeys: readonly string[],
): void {
  for (const scopeKey of scopeKeys) {
    requireNonEmpty(scopeKey, "scopeKey");
    state.idempotencyByScope.delete(scopeKey);
  }
}

function createRoomInState(
  state: InMemoryState,
  candidate: RoomWriteCandidate,
): CreateRoomResult {
  if (state.roomsById.has(candidate.roomId)) {
    return { status: "ROOM_ID_CONFLICT" };
  }
  if (state.roomIdByCode.has(candidate.roomCode)) {
    return { status: "ROOM_CODE_CONFLICT" };
  }

  const room = persistRoom(candidate, createStorageRevision(0));
  state.roomsById.set(room.roomId, room);
  state.roomIdByCode.set(room.roomCode, room.roomId);
  return { status: "CREATED", room: cloneRoomRecord(room) };
}

function replaceRoomInState(
  state: InMemoryState,
  input: ReplaceRoomInput,
): ReplaceRoomResult {
  const current = state.roomsById.get(input.candidate.roomId);
  if (current === undefined) {
    return { status: "ROOM_NOT_FOUND" };
  }
  if (current.roomRevision !== input.expectedRoomRevision) {
    return { status: "STALE_ROOM_REVISION" };
  }
  if (current.storageRevision !== input.expectedStorageRevision) {
    return { status: "STALE_STORAGE_REVISION" };
  }

  const codeOwner = state.roomIdByCode.get(input.candidate.roomCode);
  if (codeOwner !== undefined && codeOwner !== current.roomId) {
    return { status: "ROOM_CODE_CONFLICT" };
  }
  if (current.storageRevision === Number.MAX_SAFE_INTEGER) {
    return { status: "STORAGE_REVISION_EXHAUSTED" };
  }

  const room = persistRoom(
    input.candidate,
    incrementStorageRevision(current.storageRevision),
  );
  if (current.roomCode !== room.roomCode) {
    state.roomIdByCode.delete(current.roomCode);
  }
  state.roomsById.set(room.roomId, room);
  state.roomIdByCode.set(room.roomCode, room.roomId);
  return { status: "REPLACED", room: cloneRoomRecord(room) };
}

function deleteRoomInState(
  state: InMemoryState,
  input: DeleteRoomInput,
): DeleteRoomResult {
  const current = state.roomsById.get(input.roomId);
  if (current === undefined) {
    return { status: "ROOM_NOT_FOUND" };
  }
  if (current.roomRevision !== input.expectedRoomRevision) {
    return { status: "STALE_ROOM_REVISION" };
  }
  if (current.storageRevision !== input.expectedStorageRevision) {
    return { status: "STALE_STORAGE_REVISION" };
  }

  state.roomsById.delete(current.roomId);
  state.roomIdByCode.delete(current.roomCode);
  return { status: "DELETED" };
}

function promoteSessionInState(
  state: InMemoryState,
  input: PromoteUnboundSessionInput,
): PromoteUnboundSessionResult {
  requireNonNegativeSafeInteger(input.now, "now");
  const key = verificationKey(input.verificationData);
  const current = state.sessionsByVerificationKey.get(key);
  if (current === undefined) {
    return { status: "SESSION_NOT_FOUND" };
  }
  if (current.state === "BOUND") {
    return { status: "SESSION_ALREADY_BOUND" };
  }
  if (input.now >= current.expiresAt) {
    return { status: "SESSION_EXPIRED" };
  }

  const room = state.roomsById.get(input.roomId);
  if (room === undefined) {
    return { status: "ROOM_NOT_FOUND" };
  }
  if (!room.players.some((player) => player.playerId === input.playerId)) {
    return { status: "PLAYER_NOT_FOUND" };
  }

  const session = cloneBoundSession({
    state: "BOUND",
    verificationData: current.verificationData,
    roomId: input.roomId,
    playerId: input.playerId,
  });
  state.sessionsByVerificationKey.set(key, session);
  return { status: "PROMOTED", session: cloneBoundSession(session) };
}

function deleteSessionsByRoomId(
  state: InMemoryState,
  roomId: RoomId,
): number {
  let deletedCount = 0;
  for (const [key, session] of state.sessionsByVerificationKey) {
    if (session.state === "BOUND" && session.roomId === roomId) {
      state.sessionsByVerificationKey.delete(key);
      deletedCount += 1;
    }
  }
  return deletedCount;
}

function roomFailure(result: Exclude<CreateRoomResult, { status: "CREATED" }>): RoomUnitOfWorkFailure;
function roomFailure(result: Exclude<ReplaceRoomResult, { status: "REPLACED" }>): RoomUnitOfWorkFailure;
function roomFailure(result: Exclude<DeleteRoomResult, { status: "DELETED" }>): RoomUnitOfWorkFailure;
function roomFailure(
  result:
    | Exclude<CreateRoomResult, { status: "CREATED" }>
    | Exclude<ReplaceRoomResult, { status: "REPLACED" }>
    | Exclude<DeleteRoomResult, { status: "DELETED" }>,
): RoomUnitOfWorkFailure {
  return result.status;
}

function applyRoomMutation(
  state: InMemoryState,
  changeSet: RoomUnitOfWorkChangeSet,
): AppliedRoomResult {
  switch (changeSet.roomMutation.kind) {
    case "CREATE": {
      const result = createRoomInState(
        state,
        changeSet.roomMutation.candidate,
      );
      return result.status === "CREATED"
        ? { status: "APPLIED", room: result.room }
        : { status: "FAILED", reason: roomFailure(result) };
    }
    case "REPLACE": {
      const result = replaceRoomInState(state, {
        candidate: changeSet.roomMutation.candidate,
        expectedRoomRevision: changeSet.roomMutation.expectedRoomRevision,
        expectedStorageRevision:
          changeSet.roomMutation.expectedStorageRevision,
      });
      return result.status === "REPLACED"
        ? { status: "APPLIED", room: result.room }
        : { status: "FAILED", reason: roomFailure(result) };
    }
    case "DELETE": {
      const result = deleteRoomInState(state, {
        roomId: changeSet.roomMutation.roomId,
        expectedRoomRevision: changeSet.roomMutation.expectedRoomRevision,
        expectedStorageRevision:
          changeSet.roomMutation.expectedStorageRevision,
      });
      return result.status === "DELETED"
        ? { status: "APPLIED", room: null }
        : { status: "FAILED", reason: roomFailure(result) };
    }
  }
}

function targetRoomId(changeSet: RoomUnitOfWorkChangeSet): RoomId {
  return changeSet.roomMutation.kind === "DELETE"
    ? changeSet.roomMutation.roomId
    : changeSet.roomMutation.candidate.roomId;
}

function applySessionMutation(
  state: InMemoryState,
  changeSet: RoomUnitOfWorkChangeSet,
): RoomUnitOfWorkFailure | null {
  const mutation = changeSet.sessionMutation;
  const deletesRoom = changeSet.roomMutation.kind === "DELETE";
  if (deletesRoom !== (mutation.kind === "DELETE_BY_ROOM")) {
    return "SESSION_ROOM_MISMATCH";
  }

  switch (mutation.kind) {
    case "NONE":
      return null;
    case "PROMOTE_UNBOUND": {
      if (mutation.roomId !== targetRoomId(changeSet)) {
        return "SESSION_ROOM_MISMATCH";
      }
      const result = promoteSessionInState(state, mutation);
      return result.status === "PROMOTED" ? null : result.status;
    }
    case "DELETE_BY_ROOM":
      if (mutation.roomId !== targetRoomId(changeSet)) {
        return "SESSION_ROOM_MISMATCH";
      }
      deleteSessionsByRoomId(state, mutation.roomId);
      return null;
  }
}

export class InMemoryPersistence
  implements
    RoomRepository,
    SessionRepository,
    IdempotencyRepository,
    RoomUnitOfWork
{
  #state = emptyState();
  readonly #onCommitCheckpoint:
    | ((checkpoint: InMemoryCommitCheckpoint) => void)
    | undefined;

  constructor(options: InMemoryPersistenceOptions = {}) {
    this.#onCommitCheckpoint = options.onCommitCheckpoint;
  }

  async findById(roomId: RoomId): Promise<RoomRecord | null> {
    const room = this.#state.roomsById.get(roomId);
    return room === undefined ? null : cloneRoomRecord(room);
  }

  async findByCode(roomCode: RoomCode): Promise<RoomRecord | null> {
    const roomId = this.#state.roomIdByCode.get(roomCode);
    if (roomId === undefined) {
      return null;
    }
    const room = this.#state.roomsById.get(roomId);
    return room === undefined ? null : cloneRoomRecord(room);
  }

  async createIfAbsent(
    candidate: RoomWriteCandidate,
  ): Promise<CreateRoomResult> {
    const nextState = copyState(this.#state);
    const result = createRoomInState(nextState, candidate);
    if (result.status === "CREATED") {
      this.#state = nextState;
    }
    return result;
  }

  async replace(input: ReplaceRoomInput): Promise<ReplaceRoomResult> {
    const nextState = copyState(this.#state);
    const result = replaceRoomInState(nextState, input);
    if (result.status === "REPLACED") {
      this.#state = nextState;
    }
    return result;
  }

  async delete(input: DeleteRoomInput): Promise<DeleteRoomResult> {
    const nextState = copyState(this.#state);
    const result = deleteRoomInState(nextState, input);
    if (result.status === "DELETED") {
      this.#state = nextState;
    }
    return result;
  }

  async findByVerificationData(
    verificationData: SessionVerificationData,
  ): Promise<SessionRecord | null> {
    const session = this.#state.sessionsByVerificationKey.get(
      verificationKey(verificationData),
    );
    return session === undefined ? null : cloneSessionRecord(session);
  }

  async saveUnbound(
    session: UnboundSessionRecord,
  ): Promise<SaveUnboundSessionResult> {
    const detached = cloneUnboundSession(session);
    const key = verificationKey(detached.verificationData);
    if (this.#state.sessionsByVerificationKey.has(key)) {
      return { status: "SESSION_ALREADY_EXISTS" };
    }

    const nextState = copyState(this.#state);
    nextState.sessionsByVerificationKey.set(key, detached);
    this.#state = nextState;
    return { status: "SAVED", session: cloneUnboundSession(detached) };
  }

  async promoteUnbound(
    input: PromoteUnboundSessionInput,
  ): Promise<PromoteUnboundSessionResult> {
    const nextState = copyState(this.#state);
    const result = promoteSessionInState(nextState, input);
    if (result.status === "PROMOTED") {
      this.#state = nextState;
    }
    return result;
  }

  async deleteByVerificationData(
    verificationData: SessionVerificationData,
  ): Promise<boolean> {
    const key = verificationKey(verificationData);
    if (!this.#state.sessionsByVerificationKey.has(key)) {
      return false;
    }
    const nextState = copyState(this.#state);
    nextState.sessionsByVerificationKey.delete(key);
    this.#state = nextState;
    return true;
  }

  async deleteByRoomId(roomId: RoomId): Promise<number> {
    const nextState = copyState(this.#state);
    const deletedCount = deleteSessionsByRoomId(nextState, roomId);
    if (deletedCount > 0) {
      this.#state = nextState;
    }
    return deletedCount;
  }

  async classify(
    scopeKey: string,
    requestId: RequestId,
    payloadFingerprint: string,
  ): Promise<IdempotencyLookupResult> {
    return classifyIdempotency(
      this.#state,
      scopeKey,
      requestId,
      payloadFingerprint,
    );
  }

  async deleteByScope(scopeKey: string): Promise<number> {
    requireNonEmpty(scopeKey, "scopeKey");
    const records = this.#state.idempotencyByScope.get(scopeKey);
    if (records === undefined) {
      return 0;
    }
    const nextState = copyState(this.#state);
    nextState.idempotencyByScope.delete(scopeKey);
    this.#state = nextState;
    return records.size;
  }

  async deleteCreatedBefore(cutoff: ServerTime): Promise<number> {
    requireNonNegativeSafeInteger(cutoff, "cutoff");
    const nextState = copyState(this.#state);
    let deletedCount = 0;

    for (const [scopeKey, records] of nextState.idempotencyByScope) {
      const retained = new Map<RequestId, IdempotencyRecord>();
      for (const [requestId, record] of records) {
        if (record.createdAt < cutoff) {
          deletedCount += 1;
        } else {
          retained.set(requestId, record);
        }
      }
      if (retained.size === 0) {
        nextState.idempotencyByScope.delete(scopeKey);
      } else {
        nextState.idempotencyByScope.set(scopeKey, retained);
      }
    }

    if (deletedCount > 0) {
      this.#state = nextState;
    }
    return deletedCount;
  }

  async commit(
    changeSet: RoomUnitOfWorkChangeSet,
    precondition?: RoomUnitOfWorkCommitPrecondition,
  ): Promise<RoomUnitOfWorkResult> {
    const existing = classifyIdempotency(
      this.#state,
      changeSet.idempotency.scopeKey,
      changeSet.idempotency.requestId,
      changeSet.idempotency.payloadFingerprint,
    );
    if (existing.status === "REPLAY") {
      return { status: "REPLAY", idempotency: existing.record };
    }
    if (existing.status === "CONFLICT") {
      return {
        status: "IDEMPOTENCY_CONFLICT",
        idempotency: existing.record,
      };
    }

    const nextState = copyState(this.#state);
    const roomResult = applyRoomMutation(nextState, changeSet);
    if (roomResult.status === "FAILED") {
      return {
        status: "PRECONDITION_FAILED",
        reason: roomResult.reason,
      };
    }
    this.#onCommitCheckpoint?.("AFTER_ROOM_WRITE");

    const sessionFailure = applySessionMutation(nextState, changeSet);
    if (sessionFailure !== null) {
      return {
        status: "PRECONDITION_FAILED",
        reason: sessionFailure,
      };
    }
    this.#onCommitCheckpoint?.("AFTER_SESSION_WRITE");

    if ("idempotencyScopesToDelete" in changeSet) {
      deleteIdempotencyScopes(
        nextState,
        changeSet.idempotencyScopesToDelete,
      );
    }
    const idempotency = insertIdempotency(
      nextState,
      changeSet.idempotency,
    );
    this.#onCommitCheckpoint?.("AFTER_IDEMPOTENCY_WRITE");

    if (precondition !== undefined && !precondition.isSatisfied()) {
      return {
        status: "PRECONDITION_FAILED",
        reason: "COMMIT_PRECONDITION_FAILED",
      };
    }

    this.#state = nextState;
    return {
      status: "COMMITTED",
      room:
        roomResult.room === null ? null : cloneRoomRecord(roomResult.room),
      idempotency: cloneIdempotencyRecord(idempotency),
    };
  }
}

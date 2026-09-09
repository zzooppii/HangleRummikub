import { GemCardGameStateAdapter, type GemCardGameStateStorage, type GemCardGameLifecycleInspection } from "../games/gem-card/compatibility/gem-card-game-state-adapter.js";
import { CityRoleGameStateAdapter, type CityRoleGameStateStorage, type CityRoleGameLifecycleInspection } from "../games/city-role/compatibility/city-role-game-state-adapter.js";
import type {
  PlayerId,
  RequestId,
  RoomCode,
  RoomId,
  ServerTime,
} from "@hangul-rummikub/shared";
import {
  BOOTSTRAP_SESSION_TTL_MS,
  GameTypeSchema,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import {
  LegacyHangulGameStateAdapter,
  type LegacyHangulGameLifecycleInspection,
  type LegacyHangulGameStateStorage,
} from "../games/hangul-tile/compatibility/legacy-hangul-game-state-adapter.js";
import {
  NumberTileGameStateAdapter,
  type NumberTileGameLifecycleInspection,
  type NumberTileGameStateStorage,
} from "../games/number-tile/compatibility/number-tile-game-state-adapter.js";
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
import type { ActiveTurnReader } from "../ports/active-turn-reader.js";
import type { ActiveGameReader } from "../ports/active-game-reader.js";
import type {
  FinishedRoomRetentionIdentity,
  FinishedRoomRetentionReader,
} from "../ports/finished-room-retention-reader.js";
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
  RoomCleanupUnitOfWork,
  RoomCleanupChangeSet,
  RoomCleanupResult,
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
import type {
  ScheduledGameDeadline,
  ScheduledTurnDeadline,
} from "../ports/system.js";

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
  legacyHangulGameStateAdapter?: LegacyHangulGameStateStorage;
  numberTileGameStateAdapter?: NumberTileGameStateStorage;
  gemCardGameStateAdapter?: GemCardGameStateStorage;
  cityRoleGameStateAdapter?: CityRoleGameStateStorage;
  onCommitCheckpoint?: (checkpoint: InMemoryCommitCheckpoint) => void;
}>;

type GameStateStorageAdapters = Readonly<{
  legacyHangul: LegacyHangulGameStateStorage;
  numberTile: NumberTileGameStateStorage;
  gemCard: GemCardGameStateStorage;
  cityRole: CityRoleGameStateStorage;
}>;

type RoomGameLifecycleInspection =
  | Readonly<{ gameType: "CITY_ROLE"; inspection: CityRoleGameLifecycleInspection }>
  | Readonly<{ gameType: "GEM_CARD"; inspection: GemCardGameLifecycleInspection }>
  | Readonly<{
      gameType: "HANGUL_TILE";
      inspection: LegacyHangulGameLifecycleInspection;
    }>
  | Readonly<{
      gameType: "NUMBER_TILE";
      inspection: NumberTileGameLifecycleInspection;
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
  adapters: GameStateStorageAdapters,
): RoomWriteCandidate {
  v.parse(GameTypeSchema, candidate.gameType);
  requireNonNegativeSafeInteger(candidate.roomRevision, "roomRevision");
  requireNonNegativeSafeInteger(candidate.createdAt, "createdAt");
  requireNonNegativeSafeInteger(candidate.updatedAt, "updatedAt");
  if (
    candidate.hostPlayerId !== null &&
    !candidate.players.some(
      (player) => player.playerId === candidate.hostPlayerId,
    )
  ) {
    throw new TypeError("Room Host must reference a current Player.");
  }
  if (candidate.phase !== "LOBBY" && candidate.hostPlayerId === null) {
    throw new TypeError("Only a LOBBY Room may be temporarily hostless.");
  }

  const shell = {
    roomId: candidate.roomId,
    roomCode: candidate.roomCode,
    phase: candidate.phase,
    hostPlayerId: candidate.hostPlayerId,
    players: Object.freeze(candidate.players.map(clonePlayerRecord)),
    roomRevision: candidate.roomRevision,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  } as const;

  switch (candidate.gameType) {
    case "HANGUL_TILE": {
      const game =
        candidate.game === null
          ? null
          : adapters.legacyHangul.cloneAndValidate(candidate.game);
      validateRoomGameCoherence(shell.phase, shell.players, game, () =>
        game === null ? null : adapters.legacyHangul.inspectLifecycle(game),
      );
      return Object.freeze({
        ...shell,
        gameType: "HANGUL_TILE" as const,
        game,
      });
    }
    case "NUMBER_TILE": {
      const departedPlayerIds = candidate.departedPlayerIds === undefined ? undefined : Object.freeze([...candidate.departedPlayerIds]);
      if (departedPlayerIds !== undefined && (candidate.phase === "LOBBY" && departedPlayerIds.length > 0 || new Set(departedPlayerIds).size !== departedPlayerIds.length || departedPlayerIds.some(id => !candidate.players.some(p => p.playerId === id)))) throw new Error("Invalid Number departed roster.");
      const game =
        candidate.game === null
          ? null
          : adapters.numberTile.cloneAndValidate(candidate.game);
      validateRoomGameCoherence(shell.phase, shell.players, game, () =>
        game === null ? null : adapters.numberTile.inspectLifecycle(game),
      );
      return Object.freeze({
        ...shell,
        gameType: "NUMBER_TILE" as const,
        ...(departedPlayerIds === undefined ? {} : { departedPlayerIds }),
        game,
      });
    }
    case "GEM_CARD": {
      const game =
        candidate.game === null
          ? null
          : adapters.gemCard.cloneAndValidate(candidate.game);
      validateRoomGameCoherence(shell.phase, shell.players, game, () =>
        game === null ? null : adapters.gemCard.inspectLifecycle(game),
      );
      return Object.freeze({
        ...shell,
        gameType: "GEM_CARD" as const,
        game,
      });
    }
    case "CITY_ROLE": {
      const game = candidate.game === null ? null : adapters.cityRole.cloneAndValidate(candidate.game);
      validateRoomGameCoherence(shell.phase, shell.players, game, () => game === null ? null : adapters.cityRole.inspectLifecycle(game));
      return Object.freeze({ ...shell, gameType: "CITY_ROLE", game });
    }
  }
}

function validateRoomGameCoherence(
  phase: RoomRecord["phase"],
  players: RoomRecord["players"],
  game: RoomRecord["game"],
  inspect: () =>
    | LegacyHangulGameLifecycleInspection
    | GemCardGameLifecycleInspection
    | CityRoleGameLifecycleInspection
    | NumberTileGameLifecycleInspection
    | null,
): void {
  const inspection = inspect();
  if (phase === "LOBBY") {
    if (game !== null || inspection !== null) {
      throw new TypeError("A LOBBY Room must not contain a GameState.");
    }
    return;
  }
  if (phase === "PLAYING") {
    if (game === null || inspection?.lifecycle !== "RUNNING") {
      throw new TypeError(
        "A PLAYING Room must contain an active GameState.",
      );
    }
  } else if (game === null || inspection?.lifecycle !== "FINISHED") {
    throw new TypeError(
      "A FINISHED Room must contain a terminal GameState.",
    );
  }

  const playerIds = players.map((player) => player.playerId);
  const participantIds: readonly string[] = "state" in game ? game.state.seatOrder : game.turnOrder;
  if (
    playerIds.length !== participantIds.length ||
    new Set(playerIds).size !== playerIds.length ||
    participantIds.some((playerId) => !playerIds.some(id => id === playerId))
  ) {
    throw new TypeError("Room Players and GameState Players must match.");
  }
}

function persistRoom(
  candidate: RoomWriteCandidate,
  storageRevision: StorageRevision,
  adapters: GameStateStorageAdapters,
): RoomRecord {
  const detached = cloneRoomWriteCandidate(candidate, adapters);
  const revision = cloneStorageRevision(storageRevision);
  switch (detached.gameType) {
    case "HANGUL_TILE":
      return Object.freeze({ ...detached, storageRevision: revision });
    case "NUMBER_TILE":
    case "GEM_CARD":
    case "CITY_ROLE":
      return Object.freeze({ ...detached, storageRevision: revision });
  }
}

function cloneRoomRecord(
  room: RoomRecord,
  adapters: GameStateStorageAdapters,
): RoomRecord {
  return persistRoom(room, room.storageRevision, adapters);
}

function inspectRoomGame(
  room: RoomRecord,
  adapters: GameStateStorageAdapters,
): RoomGameLifecycleInspection | null {
  if (room.game === null) {
    return null;
  }
  switch (room.gameType) {
    case "HANGUL_TILE":
      return Object.freeze({
        gameType: room.gameType,
        inspection: adapters.legacyHangul.inspectLifecycle(room.game),
      });
    case "NUMBER_TILE":
      return Object.freeze({
        gameType: room.gameType,
        inspection: adapters.numberTile.inspectLifecycle(room.game),
      });
    case "GEM_CARD":
      return Object.freeze({
        gameType: room.gameType,
        inspection: adapters.gemCard.inspectLifecycle(room.game),
      });
    case "CITY_ROLE":
      return Object.freeze({ gameType: room.gameType, inspection: adapters.cityRole.inspectLifecycle(room.game) });
  }
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
  adapters: GameStateStorageAdapters,
): CreateRoomResult {
  if (state.roomsById.has(candidate.roomId)) {
    return { status: "ROOM_ID_CONFLICT" };
  }
  if (state.roomIdByCode.has(candidate.roomCode)) {
    return { status: "ROOM_CODE_CONFLICT" };
  }

  const room = persistRoom(
    candidate,
    createStorageRevision(0),
    adapters,
  );
  state.roomsById.set(room.roomId, room);
  state.roomIdByCode.set(room.roomCode, room.roomId);
  return {
    status: "CREATED",
    room: cloneRoomRecord(room, adapters),
  };
}

function replaceRoomInState(
  state: InMemoryState,
  input: ReplaceRoomInput,
  adapters: GameStateStorageAdapters,
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
  if (current.gameType !== input.candidate.gameType) {
    return { status: "GAME_TYPE_MISMATCH" };
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
    adapters,
  );
  if (current.roomCode !== room.roomCode) {
    state.roomIdByCode.delete(current.roomCode);
  }
  state.roomsById.set(room.roomId, room);
  state.roomIdByCode.set(room.roomCode, room.roomId);
  return {
    status: "REPLACED",
    room: cloneRoomRecord(room, adapters),
  };
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

function deleteSessionsByPlayer(
  state: InMemoryState,
  roomId: RoomId,
  playerId: PlayerId,
): number {
  let deletedCount = 0;
  for (const [key, session] of state.sessionsByVerificationKey) {
    if (
      session.state === "BOUND" &&
      session.roomId === roomId &&
      session.playerId === playerId
    ) {
      state.sessionsByVerificationKey.delete(key);
      deletedCount += 1;
    }
  }
  return deletedCount;
}

function idempotencyRecordBelongsToRoom(
  record: IdempotencyRecord,
  roomId: RoomId,
): boolean {
  if (
    record.scopeKey.startsWith(`room-player:${roomId}:`) ||
    record.scopeKey.startsWith(`room-timeout:${roomId}:`)
  ) {
    return true;
  }
  const terminalResult = record.terminalResult;
  return (
    terminalResult !== null &&
    !isJsonArray(terminalResult) &&
    typeof terminalResult === "object" &&
    terminalResult.roomId === roomId
  );
}

function deleteIdempotencyByRoomId(
  state: InMemoryState,
  roomId: RoomId,
): number {
  let deletedCount = 0;
  for (const [scopeKey, records] of state.idempotencyByScope) {
    const retained = new Map<RequestId, IdempotencyRecord>();
    for (const [requestId, record] of records) {
      if (idempotencyRecordBelongsToRoom(record, roomId)) {
        deletedCount += 1;
      } else {
        retained.set(requestId, record);
      }
    }
    if (retained.size === 0) {
      state.idempotencyByScope.delete(scopeKey);
    } else {
      state.idempotencyByScope.set(scopeKey, retained);
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
  adapters: GameStateStorageAdapters,
): AppliedRoomResult {
  switch (changeSet.roomMutation.kind) {
    case "CREATE": {
      const result = createRoomInState(
        state,
        changeSet.roomMutation.candidate,
        adapters,
      );
      return result.status === "CREATED"
        ? { status: "APPLIED", room: result.room }
        : { status: "FAILED", reason: roomFailure(result) };
    }
    case "REPLACE": {
      const result = replaceRoomInState(
        state,
        {
          candidate: changeSet.roomMutation.candidate,
          expectedRoomRevision: changeSet.roomMutation.expectedRoomRevision,
          expectedStorageRevision:
            changeSet.roomMutation.expectedStorageRevision,
        },
        adapters,
      );
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
    case "DELETE_BOUND_PLAYER": {
      if (mutation.roomId !== targetRoomId(changeSet) || deletesRoom) {
        return "SESSION_ROOM_MISMATCH";
      }
      return deleteSessionsByPlayer(
        state,
        mutation.roomId,
        mutation.playerId,
      ) > 0
        ? null
        : "SESSION_NOT_FOUND";
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
    RoomUnitOfWork,
    RoomCleanupUnitOfWork,
    ActiveGameReader,
    ActiveTurnReader,
    FinishedRoomRetentionReader
{
  #state = emptyState();
  readonly #onCommitCheckpoint:
    | ((checkpoint: InMemoryCommitCheckpoint) => void)
    | undefined;
  readonly #gameStateStorageAdapters: GameStateStorageAdapters;

  constructor(options: InMemoryPersistenceOptions = {}) {
    const legacyHangul =
      options.legacyHangulGameStateAdapter ??
      new LegacyHangulGameStateAdapter();
    const numberTile =
      options.numberTileGameStateAdapter ?? new NumberTileGameStateAdapter();
    if (legacyHangul.gameType !== "HANGUL_TILE") {
      throw new Error("Hangul storage adapter has an invalid gameType.");
    }
    if (numberTile.gameType !== "NUMBER_TILE") {
      throw new Error("Number Tile storage adapter has an invalid gameType.");
    }
    const gemCard = options.gemCardGameStateAdapter ?? new GemCardGameStateAdapter();
    const cityRole = options.cityRoleGameStateAdapter ?? new CityRoleGameStateAdapter();
    if (cityRole.gameType !== "CITY_ROLE") throw new Error("CITY storage adapter has an invalid gameType.");
    if (gemCard.gameType !== "GEM_CARD") throw new Error("GEM storage adapter has an invalid gameType.");
    this.#gameStateStorageAdapters = Object.freeze({
      gemCard,
      cityRole,
      legacyHangul,
      numberTile,
    });
    this.#onCommitCheckpoint = options.onCommitCheckpoint;
  }

  async findById(roomId: RoomId): Promise<RoomRecord | null> {
    const room = this.#state.roomsById.get(roomId);
    return room === undefined
      ? null
      : cloneRoomRecord(room, this.#gameStateStorageAdapters);
  }

  async findByCode(roomCode: RoomCode): Promise<RoomRecord | null> {
    const roomId = this.#state.roomIdByCode.get(roomCode);
    if (roomId === undefined) {
      return null;
    }
    const room = this.#state.roomsById.get(roomId);
    return room === undefined
      ? null
      : cloneRoomRecord(room, this.#gameStateStorageAdapters);
  }

  async listActiveTurnDeadlines(): Promise<
    readonly ScheduledTurnDeadline[]
  > {
    const deadlines: ScheduledTurnDeadline[] = [];
    for (const room of this.#state.roomsById.values()) {
      if (room.phase !== "PLAYING" || room.game === null) {
        continue;
      }
      const inspection = inspectRoomGame(
        room,
        this.#gameStateStorageAdapters,
      );
      if (
        inspection === null ||
        inspection.inspection.lifecycle !== "RUNNING"
      ) {
        continue;
      }
      const lifecycle = inspection.inspection;
      deadlines.push(
        Object.freeze({
          roomId: room.roomId,
          gameId: lifecycle.gameId,
          turnId: lifecycle.activeTurn.turnId,
          expectedGameRevision: lifecycle.gameRevision,
          deadlineAt: lifecycle.activeTurn.deadlineAt,
        }),
      );
    }
    return Object.freeze(deadlines);
  }

  async listActiveGameDeadlines(): Promise<
    readonly ScheduledGameDeadline[]
  > {
    const deadlines: ScheduledGameDeadline[] = [];
    for (const room of this.#state.roomsById.values()) {
      if (room.phase !== "PLAYING" || room.game === null) {
        continue;
      }
      const inspection = inspectRoomGame(
        room,
        this.#gameStateStorageAdapters,
      );
      if (
        inspection === null ||
        inspection.gameType !== "HANGUL_TILE" ||
        inspection.inspection.lifecycle !== "RUNNING"
      ) {
        continue;
      }
      deadlines.push(
        Object.freeze({
          roomId: room.roomId,
          gameId: inspection.inspection.gameId,
          deadlineAt: inspection.inspection.gameDeadlineAt,
        }),
      );
    }
    return Object.freeze(deadlines);
  }

  async listFinishedRoomRetentions(): Promise<
    readonly FinishedRoomRetentionIdentity[]
  > {
    const identities: FinishedRoomRetentionIdentity[] = [];
    for (const room of this.#state.roomsById.values()) {
      if (room.phase !== "FINISHED" || room.game === null) {
        continue;
      }
      const inspection = inspectRoomGame(
        room,
        this.#gameStateStorageAdapters,
      );
      if (
        inspection === null ||
        inspection.inspection.lifecycle !== "FINISHED"
      ) {
        continue;
      }
      const lifecycle = inspection.inspection;
      identities.push(
        Object.freeze({
          roomId: room.roomId,
          gameId: lifecycle.gameId,
          finishedAt: lifecycle.finishedAt,
        }),
      );
    }
    return Object.freeze(identities);
  }

  async createIfAbsent(
    candidate: RoomWriteCandidate,
  ): Promise<CreateRoomResult> {
    const nextState = copyState(this.#state);
    const result = createRoomInState(
      nextState,
      candidate,
      this.#gameStateStorageAdapters,
    );
    if (result.status === "CREATED") {
      this.#state = nextState;
    }
    return result;
  }

  async replace(input: ReplaceRoomInput): Promise<ReplaceRoomResult> {
    const nextState = copyState(this.#state);
    const result = replaceRoomInState(
      nextState,
      input,
      this.#gameStateStorageAdapters,
    );
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
    const roomResult = applyRoomMutation(
      nextState,
      changeSet,
      this.#gameStateStorageAdapters,
    );
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
        roomResult.room === null
          ? null
          : cloneRoomRecord(
              roomResult.room,
              this.#gameStateStorageAdapters,
            ),
      idempotency: cloneIdempotencyRecord(idempotency),
    };
  }


  async cleanup(
    changeSet: RoomCleanupChangeSet,
    precondition?: RoomUnitOfWorkCommitPrecondition,
  ): Promise<RoomCleanupResult> {
    if (changeSet.sessionMutation.roomId !== changeSet.roomMutation.roomId) {
      return {
        status: "PRECONDITION_FAILED",
        reason: "SESSION_ROOM_MISMATCH",
      };
    }

    const nextState = copyState(this.#state);
    const roomResult = deleteRoomInState(nextState, {
      roomId: changeSet.roomMutation.roomId,
      expectedRoomRevision: changeSet.roomMutation.expectedRoomRevision,
      expectedStorageRevision: changeSet.roomMutation.expectedStorageRevision,
    });
    if (roomResult.status !== "DELETED") {
      return {
        status: "PRECONDITION_FAILED",
        reason: roomFailure(roomResult),
      };
    }
    this.#onCommitCheckpoint?.("AFTER_ROOM_WRITE");

    deleteSessionsByRoomId(nextState, changeSet.sessionMutation.roomId);
    this.#onCommitCheckpoint?.("AFTER_SESSION_WRITE");
    deleteIdempotencyByRoomId(nextState, changeSet.roomMutation.roomId);
    this.#onCommitCheckpoint?.("AFTER_IDEMPOTENCY_WRITE");

    if (precondition !== undefined && !precondition.isSatisfied()) {
      return {
        status: "PRECONDITION_FAILED",
        reason: "COMMIT_PRECONDITION_FAILED",
      };
    }
    this.#state = nextState;
    return { status: "COMMITTED" };
  }
}

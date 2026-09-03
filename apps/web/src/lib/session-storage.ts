import {
  PROTOCOL_VERSION,
  type BrowserStoredPlayerSession,
  type Nickname,
  type RequestId,
  type RoomCode,
  type RoomCreateCommand,
  type RoomJoinCommand,
  type SessionToken,
  validateBrowserStoredPlayerSession,
  validateRoomCode,
  validateRoomCreateCommand,
  validateRoomJoinCommand,
} from "@hangul-rummikub/shared";

export const PLAYER_SESSION_STORAGE_KEY =
  "hangul-rummikub.player-session.v1";
export const PENDING_ROOM_OPERATION_STORAGE_KEY =
  "hangul-rummikub.pending-room-operation.v1";

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type PendingRoomOperation = RoomCreateCommand | RoomJoinCommand;

function safelyRemove(storage: SessionStorageLike, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

type StoredJsonReadResult =
  | { kind: "MISSING" }
  | { kind: "VALUE"; value: unknown };

function readJson(
  storage: SessionStorageLike,
  key: string,
): StoredJsonReadResult {
  let serialized: string | null;

  try {
    serialized = storage.getItem(key);
  } catch {
    return { kind: "MISSING" };
  }

  if (serialized === null) {
    return { kind: "MISSING" };
  }

  try {
    return { kind: "VALUE", value: JSON.parse(serialized) as unknown };
  } catch {
    safelyRemove(storage, key);
    return { kind: "MISSING" };
  }
}

function writeJson(
  storage: SessionStorageLike,
  key: string,
  value: unknown,
): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readStoredPlayerSession(
  storage: SessionStorageLike,
): BrowserStoredPlayerSession | null {
  const readResult = readJson(storage, PLAYER_SESSION_STORAGE_KEY);

  if (readResult.kind === "MISSING") {
    return null;
  }

  const validation = validateBrowserStoredPlayerSession(readResult.value);

  if (!validation.ok) {
    safelyRemove(storage, PLAYER_SESSION_STORAGE_KEY);
    return null;
  }

  return validation.value;
}

export function readStoredPlayerSessionForRoom(
  storage: SessionStorageLike,
  roomCodeInput: unknown,
): BrowserStoredPlayerSession | null {
  const roomCodeResult = validateRoomCode(roomCodeInput);

  if (!roomCodeResult.ok) {
    return null;
  }

  const storedSession = readStoredPlayerSession(storage);

  if (storedSession?.credential.roomCode !== roomCodeResult.value) {
    return null;
  }

  return storedSession;
}

export function writeStoredPlayerSession(
  storage: SessionStorageLike,
  session: BrowserStoredPlayerSession,
): boolean {
  return writeJson(storage, PLAYER_SESSION_STORAGE_KEY, session);
}

export function clearStoredPlayerSession(storage: SessionStorageLike): void {
  safelyRemove(storage, PLAYER_SESSION_STORAGE_KEY);
}

export function createPendingRoomCreateOperation(input: {
  requestId: RequestId;
  sessionToken: SessionToken;
  nickname: Nickname;
}): RoomCreateCommand {
  return {
    kind: "room:create",
    protocolVersion: PROTOCOL_VERSION,
    requestId: input.requestId,
    payload: {
      bootstrapCredential: { sessionToken: input.sessionToken },
      nickname: input.nickname,
    },
  };
}

export function createPendingRoomJoinOperation(input: {
  requestId: RequestId;
  sessionToken: SessionToken;
  nickname: Nickname;
  roomCode: RoomCode;
}): RoomJoinCommand {
  return {
    kind: "room:join",
    protocolVersion: PROTOCOL_VERSION,
    requestId: input.requestId,
    payload: {
      bootstrapCredential: { sessionToken: input.sessionToken },
      nickname: input.nickname,
      roomCode: input.roomCode,
    },
  };
}

export function readPendingRoomOperation(
  storage: SessionStorageLike,
): PendingRoomOperation | null {
  const readResult = readJson(
    storage,
    PENDING_ROOM_OPERATION_STORAGE_KEY,
  );

  if (readResult.kind === "MISSING") {
    return null;
  }

  const createValidation = validateRoomCreateCommand(readResult.value);

  if (createValidation.ok) {
    return createValidation.value;
  }

  const joinValidation = validateRoomJoinCommand(readResult.value);

  if (joinValidation.ok) {
    return joinValidation.value;
  }

  safelyRemove(storage, PENDING_ROOM_OPERATION_STORAGE_KEY);
  return null;
}

export function writePendingRoomOperation(
  storage: SessionStorageLike,
  operation: PendingRoomOperation,
): boolean {
  return writeJson(storage, PENDING_ROOM_OPERATION_STORAGE_KEY, operation);
}

export function clearPendingRoomOperation(storage: SessionStorageLike): void {
  safelyRemove(storage, PENDING_ROOM_OPERATION_STORAGE_KEY);
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  PROTOCOL_VERSION,
  validateBootstrapCredential,
  validateBrowserStoredPlayerSession,
  validateNickname,
  validateRequestId,
  validateRoomCode,
} from "@hangul-rummikub/shared";

import {
  PENDING_ROOM_OPERATION_STORAGE_KEY,
  PLAYER_SESSION_STORAGE_KEY,
  clearPendingRoomOperation,
  createPendingRoomCreateOperation,
  createPendingRoomJoinOperation,
  readPendingRoomOperation,
  readStoredPlayerSession,
  readStoredPlayerSessionForRoom,
  type SessionStorageLike,
  writePendingRoomOperation,
  writeStoredPlayerSession,
} from "./session-storage.js";

class MemoryStorage implements SessionStorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function roomCode(input = "ABC234") {
  const result = validateRoomCode(input);

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Room code fixture must be valid.");
  }

  return result.value;
}

function requestId(input: string) {
  const result = validateRequestId(input);

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Request ID fixture must be valid.");
  }

  return result.value;
}

function nickname(input: string) {
  const result = validateNickname(input);

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Nickname fixture must be valid.");
  }

  return result.value;
}

function sessionToken() {
  const result = validateBootstrapCredential({
    sessionToken: "opaque_session_token_for_web_storage_test",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Session token fixture must be valid.");
  }

  return result.value.sessionToken;
}

function storedPlayerSession() {
  const result = validateBrowserStoredPlayerSession({
    protocolVersion: PROTOCOL_VERSION,
    credential: {
      roomCode: "ABC234",
      sessionToken: "opaque_bound_token_for_web_storage_test",
    },
    playerId: "player_web_storage_test",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Stored Player session fixture must be valid.");
  }

  return result.value;
}

test("유효한 bound Player session을 저장하고 검증해서 읽는다", () => {
  const storage = new MemoryStorage();
  const session = storedPlayerSession();

  assert.equal(writeStoredPlayerSession(storage, session), true);
  assert.deepEqual(readStoredPlayerSession(storage), session);
});

test("malformed JSON과 schema-invalid session은 삭제한다", () => {
  const malformedStorage = new MemoryStorage();
  malformedStorage.setItem(PLAYER_SESSION_STORAGE_KEY, "{not-json");

  assert.equal(readStoredPlayerSession(malformedStorage), null);
  assert.equal(malformedStorage.getItem(PLAYER_SESSION_STORAGE_KEY), null);

  const invalidStorage = new MemoryStorage();
  invalidStorage.setItem(
    PLAYER_SESSION_STORAGE_KEY,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      credential: { roomCode: "ABC234" },
      playerId: "player_missing_token",
    }),
  );

  assert.equal(readStoredPlayerSession(invalidStorage), null);
  assert.equal(invalidStorage.getItem(PLAYER_SESSION_STORAGE_KEY), null);

  const nullStorage = new MemoryStorage();
  nullStorage.setItem(PLAYER_SESSION_STORAGE_KEY, "null");

  assert.equal(readStoredPlayerSession(nullStorage), null);
  assert.equal(nullStorage.getItem(PLAYER_SESSION_STORAGE_KEY), null);
});

test("현재 URL과 다른 Room의 credential은 자동 사용하지 않고 보존한다", () => {
  const storage = new MemoryStorage();
  const session = storedPlayerSession();
  writeStoredPlayerSession(storage, session);

  assert.equal(readStoredPlayerSessionForRoom(storage, "JKM567"), null);
  assert.deepEqual(readStoredPlayerSession(storage), session);
  assert.deepEqual(readStoredPlayerSessionForRoom(storage, "abc234"), session);
});

test("pending create는 logical retry에서 같은 requestId와 payload를 유지한다", () => {
  const storage = new MemoryStorage();
  const operation = createPendingRoomCreateOperation({
    requestId: requestId("request_pending_create"),
    sessionToken: sessionToken(),
    nickname: nickname("  혁상  "),
  });

  assert.equal(writePendingRoomOperation(storage, operation), true);

  const retryOperation = readPendingRoomOperation(storage);
  assert.deepEqual(retryOperation, operation);
  assert.equal(retryOperation?.requestId, operation.requestId);
  assert.equal(retryOperation?.kind, "room:create");

  clearPendingRoomOperation(storage);
  assert.equal(readPendingRoomOperation(storage), null);
});

test("pending join은 canonical input과 같은 requestId를 유지한다", () => {
  const storage = new MemoryStorage();
  const operation = createPendingRoomJoinOperation({
    requestId: requestId("request_pending_join"),
    sessionToken: sessionToken(),
    nickname: nickname("Harvey"),
    roomCode: roomCode("abc234"),
  });

  assert.equal(writePendingRoomOperation(storage, operation), true);
  assert.deepEqual(readPendingRoomOperation(storage), operation);

  const serialized = storage.getItem(PENDING_ROOM_OPERATION_STORAGE_KEY);
  assert.notEqual(serialized, null);
  assert.equal(serialized?.includes("/room/"), false);
});

test("invalid pending operation은 삭제한다", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    PENDING_ROOM_OPERATION_STORAGE_KEY,
    JSON.stringify({
      kind: "room:join",
      protocolVersion: PROTOCOL_VERSION,
      requestId: "request_invalid_pending",
      payload: {
        bootstrapCredential: { sessionToken: sessionToken() },
        nickname: "Harvey",
        roomCode: "INVALID",
      },
    }),
  );

  assert.equal(readPendingRoomOperation(storage), null);
  assert.equal(storage.getItem(PENDING_ROOM_OPERATION_STORAGE_KEY), null);
});

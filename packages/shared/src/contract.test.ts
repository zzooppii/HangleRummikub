import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";

import {
  BOOTSTRAP_SESSION_TTL_MS,
  BROWSER_CREDENTIAL_STORAGE,
  DUPLICATE_CONNECTION_POLICY,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ClientToServerEvents,
  type RoomCreateAck,
  RoomPhaseSchema,
  SessionReplacedNotificationSchema,
  type ServerToClientEvents,
  validateBootstrapCredential,
  validateBootstrapSessionAck,
  validateBoundPlayerCredential,
  validateBrowserStoredPlayerSession,
  validateClientCommand,
  validateErrorDto,
  validateNickname,
  validateProtocolVersion,
  validateRevision,
  validateRoomCreateAck,
  validateRoomCreateCommand,
  validateRoomCode,
  validateRoomJoinAck,
  validateRoomJoinCommand,
  validateRoomScopedAck,
  validateSessionBootstrapAck,
  validateSessionBootstrapCommand,
  validateSessionReplacedNotification,
  validateSessionResumeAck,
  validateSessionResumeCommand,
  validateStateSnapshot,
  validateStateSnapshotDeliveryData,
  validateStateSnapshotEvent,
  validateStateSyncAck,
  validateStateSyncCommand,
  validateStateVersions,
  validateUnscopedAck,
} from "./index.js";

const sessionToken = "opaque_session_token_for_contract_tests";
const AckDataSchema = v.strictObject({ accepted: v.boolean() });

function validateUnscopedTestAck(input: unknown) {
  return validateUnscopedAck(input, AckDataSchema);
}

function validateRoomScopedTestAck(input: unknown) {
  return validateRoomScopedAck(input, AckDataSchema);
}

function createVersions() {
  return {
    roomRevision: 2,
    gameRevision: null,
    presenceVersion: 3,
  };
}

function createSnapshot() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    versions: createVersions(),
    serverTime: 1_750_000_000_000,
    room: {
      roomId: "room_123",
      roomCode: "ABCD23",
      phase: "LOBBY",
      players: [
        {
          playerId: "player_123",
          nickname: "혁상",
          isHost: true,
          connectionStatus: "CONNECTED",
        },
      ],
    },
    self: {
      playerId: "player_123",
    },
  };
}

function createSnapshotDeliveryData() {
  return { snapshot: createSnapshot() };
}

function createRoomScopedSnapshotSuccess() {
  return {
    scope: "ROOM",
    requestId: "request_snapshot_success",
    ok: true,
    serverTime: 1_750_000_000_000,
    versions: createVersions(),
    data: createSnapshotDeliveryData(),
  };
}

test("nickname policy가 유효한 입력을 정규화한다", () => {
  const cases = [
    { name: "Korean", input: "혁상", expected: "혁상" },
    { name: "English", input: "Harvey", expected: "Harvey" },
    {
      name: "number and underscore",
      input: "player_1",
      expected: "player_1",
    },
    {
      name: "outer whitespace",
      input: "  Harvey  ",
      expected: "Harvey",
    },
    {
      name: "NFC normalization",
      input: "혁상",
      expected: "혁상",
    },
    {
      name: "exactly 12 code points",
      input: "123456789012",
      expected: "123456789012",
    },
  ];

  for (const { name, input, expected } of cases) {
    const result = validateNickname(input);

    assert.equal(result.ok, true, `${name} nickname should be valid`);
    if (result.ok) {
      assert.equal(result.value, expected);
    }
  }

  const composed = validateNickname("혁상");
  const decomposed = validateNickname("혁상");
  assert.equal(composed.ok, true);
  assert.equal(decomposed.ok, true);
  if (composed.ok && decomposed.ok) {
    assert.equal(composed.value, decomposed.value);
  }
});

test("nickname policy가 유효하지 않은 입력을 안정적인 code로 거절한다", () => {
  const cases = [
    { name: "empty", input: "" },
    { name: "empty after trim", input: " \t\n " },
    { name: "over 12 code points", input: "1234567890123" },
    { name: "embedded whitespace", input: "player one" },
    { name: "emoji", input: "player🙂" },
    { name: "HTML punctuation", input: "<script>" },
  ];

  for (const { name, input } of cases) {
    const result = validateNickname(input);

    assert.equal(result.ok, false, `${name} nickname should be rejected`);
    if (!result.ok) {
      assert.equal(result.error.code, "NICKNAME_INVALID");
    }
  }
});

test("room code policy가 입력을 canonical uppercase로 정규화한다", () => {
  const cases = [
    { name: "canonical", input: "ABCD23", expected: "ABCD23" },
    {
      name: "lowercase and trim",
      input: "  abcd23  ",
      expected: "ABCD23",
    },
  ];

  for (const { name, input, expected } of cases) {
    const result = validateRoomCode(input);

    assert.equal(result.ok, true, `${name} room code should be valid`);
    if (result.ok) {
      assert.equal(result.value, expected);
    }
  }

  assert.equal(ROOM_CODE_ALPHABET, "ABCDEFGHJKMNPQRSTUVWXYZ23456789");
  assert.equal(ROOM_CODE_LENGTH, 6);
  for (const character of ROOM_CODE_ALPHABET) {
    assert.equal(
      validateRoomCode(`${character}BC234`).ok,
      true,
      `${character} should belong to the generation alphabet`,
    );
  }
});

test("room code policy가 길이, 제외 문자와 symbol 오류를 거절한다", () => {
  const cases = [
    { name: "wrong length", input: "ABCD2" },
    { name: "excluded zero", input: "ABCD20" },
    { name: "excluded O", input: "ABCD2O" },
    { name: "excluded one", input: "ABCD21" },
    { name: "excluded I", input: "ABCD2I" },
    { name: "excluded L", input: "ABCD2L" },
    { name: "invalid symbol", input: "ABCD2!" },
    { name: "non-ASCII input", input: "ABCD2ß" },
  ];

  for (const { name, input } of cases) {
    const result = validateRoomCode(input);

    assert.equal(result.ok, false, `${name} room code should be rejected`);
    if (!result.ok) {
      assert.equal(result.error.code, "ROOM_CODE_INVALID");
    }
  }
});

test("revision은 0과 양의 safe integer만 허용한다", () => {
  const validCases = [0, 1, 42, Number.MAX_SAFE_INTEGER];
  const invalidCases = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1];

  for (const input of validCases) {
    assert.equal(
      validateRevision(input).ok,
      true,
      `${input} should be a valid revision`,
    );
  }

  for (const input of invalidCases) {
    assert.equal(
      validateRevision(input).ok,
      false,
      `${input} should be an invalid revision`,
    );
  }
});

test("StateVersions는 Game 부재 null과 유효 revision 0을 구분한다", () => {
  assert.equal(validateStateVersions(createVersions()).ok, true);
  assert.equal(
    validateStateVersions({
      ...createVersions(),
      gameRevision: 0,
    }).ok,
    true,
  );
  assert.equal(
    validateStateVersions({
      roomRevision: 2,
      presenceVersion: 3,
    }).ok,
    false,
  );
});

test("protocol version은 지원 version과 incompatible version을 구분한다", () => {
  const supported = validateProtocolVersion(PROTOCOL_VERSION);
  const unsupported = validateProtocolVersion(PROTOCOL_VERSION + 1);
  const malformed = validateProtocolVersion("1");

  assert.equal(supported.ok, true);
  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) {
    assert.equal(unsupported.error.code, "INCOMPATIBLE_PROTOCOL");
  }
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.error.code, "INVALID_PAYLOAD");
  }
});

test("Phase 2의 정확한 다섯 command shape를 검증한다", () => {
  const commands = [
    {
      kind: "session:bootstrap",
      protocolVersion: PROTOCOL_VERSION,
      requestId: "request_bootstrap",
      payload: {},
    },
    {
      kind: "room:create",
      protocolVersion: PROTOCOL_VERSION,
      requestId: "request_create",
      payload: {
        bootstrapCredential: { sessionToken },
        nickname: " 혁상 ",
      },
    },
    {
      kind: "room:join",
      protocolVersion: PROTOCOL_VERSION,
      requestId: "request_join",
      payload: {
        bootstrapCredential: { sessionToken },
        nickname: "Harvey",
        roomCode: "abcd23",
      },
    },
    {
      kind: "session:resume",
      protocolVersion: PROTOCOL_VERSION,
      requestId: "request_resume",
      payload: {
        credential: { roomCode: "ABCD23", sessionToken },
        lastSeenVersions: createVersions(),
      },
    },
    {
      kind: "state:sync",
      protocolVersion: PROTOCOL_VERSION,
      requestId: "request_sync",
      payload: {},
    },
  ];

  for (const command of commands) {
    const result = validateClientCommand(command);

    assert.equal(result.ok, true, `${command.kind} should be valid`);
    if (result.ok) {
      assert.equal(result.value.kind, command.kind);
    }
  }
});

test("command validator가 잘못된 kind, protocol과 불필요한 field를 거절한다", () => {
  const cases = [
    {
      name: "unknown command",
      expectedCode: "INVALID_PAYLOAD",
      command: {
        kind: "game:start",
        protocolVersion: PROTOCOL_VERSION,
        requestId: "request_unknown",
        payload: {},
      },
    },
    {
      name: "unsupported protocol",
      expectedCode: "INCOMPATIBLE_PROTOCOL",
      command: {
        kind: "session:bootstrap",
        protocolVersion: PROTOCOL_VERSION + 1,
        requestId: "request_protocol",
        payload: {},
      },
    },
    {
      name: "unexpected room revision",
      expectedCode: "INVALID_PAYLOAD",
      command: {
        kind: "state:sync",
        protocolVersion: PROTOCOL_VERSION,
        requestId: "request_revision",
        expectedRoomRevision: 1,
        payload: {},
      },
    },
    {
      name: "credential on state sync",
      expectedCode: "INVALID_PAYLOAD",
      command: {
        kind: "state:sync",
        protocolVersion: PROTOCOL_VERSION,
        requestId: "request_token",
        payload: { sessionToken },
      },
    },
  ];

  for (const { name, expectedCode, command } of cases) {
    const result = validateClientCommand(command);

    assert.equal(result.ok, false, `${name} should be rejected`);
    if (!result.ok) {
      assert.equal(result.error.code, expectedCode);
    }
  }
});

test("bootstrap, bound, browser-stored credential envelope를 검증한다", () => {
  const bootstrap = validateBootstrapCredential({ sessionToken });
  const bound = validateBoundPlayerCredential({
    roomCode: " abcd23 ",
    sessionToken,
  });
  const stored = validateBrowserStoredPlayerSession({
    protocolVersion: PROTOCOL_VERSION,
    playerId: "player_123",
    credential: { roomCode: "ABCD23", sessionToken },
  });

  assert.equal(bootstrap.ok, true);
  assert.equal(bound.ok, true);
  if (bound.ok) {
    assert.equal(bound.value.roomCode, "ABCD23");
  }
  assert.equal(stored.ok, true);
  if (stored.ok) {
    assert.equal(stored.value.playerId, "player_123");
  }
  assert.equal(
    validateBootstrapCredential({ sessionToken, roomCode: "ABCD23" }).ok,
    false,
  );
  assert.equal(
    validateBoundPlayerCredential({
      roomCode: "ABCD23",
      sessionToken,
      playerId: "must-not-be-part-of-the-credential",
    }).ok,
    false,
  );
  assert.equal(
    validateBrowserStoredPlayerSession({
      protocolVersion: PROTOCOL_VERSION + 1,
      playerId: "player_123",
      credential: { roomCode: "ABCD23", sessionToken },
    }).ok,
    false,
  );
  assert.equal(
    validateBrowserStoredPlayerSession({
      protocolVersion: PROTOCOL_VERSION,
      credential: { roomCode: "ABCD23", sessionToken },
    }).ok,
    false,
  );
  assert.equal(
    validateBrowserStoredPlayerSession({
      protocolVersion: PROTOCOL_VERSION,
      playerId: "",
      credential: { roomCode: "ABCD23", sessionToken },
    }).ok,
    false,
  );
  assert.equal(
    validateBrowserStoredPlayerSession({
      protocolVersion: PROTOCOL_VERSION,
      playerId: "player_123",
      credential: { roomCode: "ABCD23", sessionToken },
      socketId: "must-not-be-persisted",
    }).ok,
    false,
  );
});

test("session policy 상수와 직접 bootstrap credential response를 고정한다", () => {
  assert.equal(BOOTSTRAP_SESSION_TTL_MS, 300_000);
  assert.equal(BROWSER_CREDENTIAL_STORAGE, "sessionStorage");
  assert.equal(DUPLICATE_CONNECTION_POLICY, "single-primary");

  assert.equal(
    validateBootstrapSessionAck({
      scope: "UNSCOPED",
      requestId: "request_bootstrap_ack",
      ok: true,
      serverTime: 100,
      data: {
        credential: { sessionToken },
        expiresAt: 300_100,
      },
    }).ok,
    true,
  );
  assert.equal(
    validateBootstrapSessionAck({
      scope: "UNSCOPED",
      requestId: "request_wrong_bootstrap_ack",
      ok: true,
      serverTime: 100,
      data: { sessionToken },
    }).ok,
    false,
  );
});

test("ack의 success/failure와 unscoped/room scope를 구분한다", () => {
  const error = {
    code: "ROOM_NOT_FOUND",
    message: "Room was not found.",
    recoverable: true,
  };
  const cases = [
    {
      name: "unscoped success",
      expected: true,
      validate: validateUnscopedTestAck,
      input: {
        scope: "UNSCOPED",
        requestId: "request_ack_1",
        ok: true,
        serverTime: 10,
        data: { accepted: true },
      },
    },
    {
      name: "unscoped failure",
      expected: true,
      validate: validateUnscopedTestAck,
      input: {
        scope: "UNSCOPED",
        requestId: "request_ack_2",
        ok: false,
        serverTime: 10,
        error,
      },
    },
    {
      name: "room success",
      expected: true,
      validate: validateRoomScopedTestAck,
      input: {
        scope: "ROOM",
        requestId: "request_ack_3",
        ok: true,
        serverTime: 10,
        versions: createVersions(),
        data: { accepted: true },
      },
    },
    {
      name: "room failure",
      expected: true,
      validate: validateRoomScopedTestAck,
      input: {
        scope: "ROOM",
        requestId: "request_ack_4",
        ok: false,
        serverTime: 10,
        versions: createVersions(),
        error,
      },
    },
    {
      name: "unscoped cannot contain versions",
      expected: false,
      validate: validateUnscopedTestAck,
      input: {
        scope: "UNSCOPED",
        requestId: "request_ack_5",
        ok: true,
        serverTime: 10,
        versions: createVersions(),
        data: { accepted: true },
      },
    },
    {
      name: "room scope requires versions",
      expected: false,
      validate: validateRoomScopedTestAck,
      input: {
        scope: "ROOM",
        requestId: "request_ack_6",
        ok: true,
        serverTime: 10,
        data: { accepted: true },
      },
    },
    {
      name: "success cannot contain error",
      expected: false,
      validate: validateUnscopedTestAck,
      input: {
        scope: "UNSCOPED",
        requestId: "request_ack_7",
        ok: true,
        serverTime: 10,
        data: { accepted: true },
        error,
      },
    },
    {
      name: "failure cannot contain data",
      expected: false,
      validate: validateRoomScopedTestAck,
      input: {
        scope: "ROOM",
        requestId: "request_ack_8",
        ok: false,
        serverTime: 10,
        versions: createVersions(),
        data: {},
        error,
      },
    },
    {
      name: "success data must match its schema",
      expected: false,
      validate: validateRoomScopedTestAck,
      input: {
        scope: "ROOM",
        requestId: "request_ack_9",
        ok: true,
        serverTime: 10,
        versions: createVersions(),
        data: { sessionToken },
      },
    },
  ];

  for (const { name, expected, validate, input } of cases) {
    assert.equal(validate(input).ok, expected, name);
  }
});

test("error DTO는 safe public shape만 허용한다", () => {
  const valid = validateErrorDto({
    code: "NICKNAME_TAKEN",
    message: "Nickname is already in use.",
    recoverable: true,
  });
  const withStack = validateErrorDto({
    code: "INTERNAL_ERROR",
    message: "An internal error occurred.",
    recoverable: false,
    stack: "secret internal stack",
  });

  assert.equal(valid.ok, true);
  assert.equal(withStack.ok, false);
});

test("Room code 후보 소진 오류는 안정적인 public error code다", () => {
  const result = validateErrorDto({
    code: "ROOM_CODE_EXHAUSTED",
    message: "A room code could not be allocated.",
    recoverable: true,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.code, "ROOM_CODE_EXHAUSTED");
  }
});

test("Lobby snapshot은 game 부재를 null revision으로 표현한다", () => {
  const result = validateStateSnapshot(createSnapshot());

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.room.phase, "LOBBY");
    assert.equal(result.value.versions.gameRevision, null);
    assert.equal(result.value.self.playerId, "player_123");
  }
});

test("Room phase와 session replacement notification은 exhaustive shape를 가진다", () => {
  for (const phase of ["LOBBY", "PLAYING", "FINISHED"]) {
    assert.equal(v.safeParse(RoomPhaseSchema, phase).success, true);
  }
  assert.equal(v.safeParse(RoomPhaseSchema, "PAUSED").success, false);

  const notification = {
    kind: "session:replaced",
    protocolVersion: PROTOCOL_VERSION,
    serverTime: 100,
    reason: "NEW_PRIMARY_CONNECTION",
  };
  assert.equal(
    v.safeParse(SessionReplacedNotificationSchema, notification).success,
    true,
  );
  assert.equal(
    v.safeParse(SessionReplacedNotificationSchema, {
      ...notification,
      connectionGeneration: 2,
    }).success,
    false,
  );
});

test("snapshot projection은 credential과 server-only field를 거절한다", () => {
  const forbiddenKeys = [
    "sessionToken",
    "tokenHash",
    "sessionTokenHash",
    "socketId",
    "connectionGeneration",
    "bootstrapCredential",
    "storageRevision",
    "repositoryMetadata",
  ];

  for (const forbiddenKey of forbiddenKeys) {
    const snapshot = createSnapshot();
    const topLevel = {
      ...snapshot,
      [forbiddenKey]: "must-not-be-public",
    };
    const roomLevel = {
      ...snapshot,
      room: {
        ...snapshot.room,
        [forbiddenKey]: "must-not-be-public",
      },
    };
    const playerLevel = {
      ...snapshot,
      room: {
        ...snapshot.room,
        players: snapshot.room.players.map((player) => ({
          ...player,
          [forbiddenKey]: "must-not-be-public",
        })),
      },
    };
    const selfLevel = {
      ...snapshot,
      self: {
        ...snapshot.self,
        [forbiddenKey]: "must-not-be-public",
      },
    };

    assert.equal(
      validateStateSnapshot(topLevel).ok,
      false,
      `${forbiddenKey} must be rejected at snapshot level`,
    );
    assert.equal(
      validateStateSnapshot(roomLevel).ok,
      false,
      `${forbiddenKey} must be rejected at room level`,
    );
    assert.equal(
      validateStateSnapshot(playerLevel).ok,
      false,
      `${forbiddenKey} must be rejected at public player level`,
    );
    assert.equal(
      validateStateSnapshot(selfLevel).ok,
      false,
      `${forbiddenKey} must be rejected at self level`,
    );
  }
});

test("Phase 5 command별 validator는 unknown 입력을 정확한 command로 좁힌다", () => {
  const bootstrap = validateSessionBootstrapCommand({
    kind: "session:bootstrap",
    protocolVersion: PROTOCOL_VERSION,
    requestId: "request_bootstrap_specific",
    payload: {},
  });
  const create = validateRoomCreateCommand({
    kind: "room:create",
    protocolVersion: PROTOCOL_VERSION,
    requestId: "request_create_specific",
    payload: {
      bootstrapCredential: { sessionToken },
      nickname: " 혁상 ",
    },
  });
  const join = validateRoomJoinCommand({
    kind: "room:join",
    protocolVersion: PROTOCOL_VERSION,
    requestId: "request_join_specific",
    payload: {
      bootstrapCredential: { sessionToken },
      nickname: "Harvey",
      roomCode: " abcd23 ",
    },
  });
  const resume = validateSessionResumeCommand({
    kind: "session:resume",
    protocolVersion: PROTOCOL_VERSION,
    requestId: "request_resume_specific",
    payload: {
      credential: { roomCode: "ABCD23", sessionToken },
      lastSeenVersions: null,
    },
  });
  const sync = validateStateSyncCommand({
    kind: "state:sync",
    protocolVersion: PROTOCOL_VERSION,
    requestId: "request_sync_specific",
    payload: {},
  });

  assert.equal(bootstrap.ok, true);
  assert.equal(create.ok, true);
  assert.equal(join.ok, true);
  assert.equal(resume.ok, true);
  assert.equal(sync.ok, true);
  if (create.ok && join.ok) {
    assert.equal(create.value.kind, "room:create");
    assert.equal(create.value.payload.nickname, "혁상");
    assert.equal(join.value.kind, "room:join");
    assert.equal(join.value.payload.roomCode, "ABCD23");
  }

  assert.equal(
    validateRoomCreateCommand({
      kind: "state:sync",
      protocolVersion: PROTOCOL_VERSION,
      requestId: "request_wrong_specific_kind",
      payload: {},
    }).ok,
    false,
  );
});

test("Phase 5 room command ack는 room-scoped success와 scope별 failure만 허용한다", () => {
  const success = createRoomScopedSnapshotSuccess();
  const unscopedFailure = {
    scope: "UNSCOPED",
    requestId: "request_prescope_failure",
    ok: false,
    serverTime: 1_750_000_000_000,
    error: {
      code: "ROOM_NOT_FOUND",
      message: "Room was not found.",
      recoverable: true,
    },
  };
  const roomScopedFailure = {
    scope: "ROOM",
    requestId: "request_scoped_failure",
    ok: false,
    serverTime: 1_750_000_000_000,
    versions: createVersions(),
    error: {
      code: "ROOM_FULL",
      message: "Room is full.",
      recoverable: true,
    },
  };
  const validators = [
    validateRoomCreateAck,
    validateRoomJoinAck,
    validateSessionResumeAck,
    validateStateSyncAck,
  ];

  for (const validate of validators) {
    assert.equal(validate(success).ok, true);
    assert.equal(validate(unscopedFailure).ok, true);
    assert.equal(validate(roomScopedFailure).ok, true);
    assert.equal(
      validate({
        ...success,
        scope: "UNSCOPED",
        versions: undefined,
      }).ok,
      false,
      "room command success must not use an unscoped revision sentinel",
    );
    const { versions: _versions, ...withoutVersions } = success;
    assert.equal(
      validate(withoutVersions).ok,
      false,
      "room-scoped success requires real StateVersions",
    );
  }
});

test("requestId를 읽을 수 없는 malformed command는 null uncorrelated ack를 사용한다", () => {
  const uncorrelatedFailure = {
    scope: "UNSCOPED",
    requestId: null,
    ok: false,
    serverTime: 1_750_000_000_000,
    error: {
      code: "INVALID_PAYLOAD",
      message: "Command payload is invalid.",
      recoverable: false,
    },
  };
  const validators = [
    validateSessionBootstrapAck,
    validateRoomCreateAck,
    validateRoomJoinAck,
    validateSessionResumeAck,
    validateStateSyncAck,
  ];

  for (const validate of validators) {
    assert.equal(validate(uncorrelatedFailure).ok, true);
    assert.equal(
      validate({
        ...uncorrelatedFailure,
        error: {
          ...uncorrelatedFailure.error,
          code: "INTERNAL_ERROR",
        },
      }).ok,
      false,
    );
  }

  assert.equal(
    validateSessionBootstrapAck({
      ...uncorrelatedFailure,
      requestId: undefined,
    }).ok,
    false,
  );
  assert.equal(
    validateBootstrapSessionAck(uncorrelatedFailure).ok,
    false,
    "the Phase 2 correlated ack contract remains unchanged",
  );
});

test("concrete Room ack type은 scope와 ok discriminant로 안전하게 narrowing된다", () => {
  function summarize(ack: RoomCreateAck): string {
    if (ack.requestId === null) {
      return ack.error.code;
    }

    if (ack.scope === "UNSCOPED") {
      return ack.error.code;
    }

    if (!ack.ok) {
      return ack.error.code;
    }

    return ack.data.snapshot.room.roomCode;
  }

  const result = validateRoomCreateAck(createRoomScopedSnapshotSuccess());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(summarize(result.value), "ABCD23");
  }
});

test("StateSnapshot delivery ack와 event는 strict하고 secret-free다", () => {
  const data = createSnapshotDeliveryData();
  const event = {
    kind: "state:snapshot",
    protocolVersion: PROTOCOL_VERSION,
    versions: createVersions(),
    serverTime: 1_750_000_000_000,
    payload: data,
  };

  assert.equal(validateStateSnapshotDeliveryData(data).ok, true);
  assert.equal(validateStateSnapshotEvent(event).ok, true);
  assert.equal(
    validateStateSnapshotDeliveryData({ ...data, sessionToken }).ok,
    false,
  );
  assert.equal(
    validateStateSnapshotEvent({ ...event, storageRevision: 1 }).ok,
    false,
  );
  assert.equal(
    validateRoomCreateAck({
      ...createRoomScopedSnapshotSuccess(),
      data: { ...data, tokenHash: "must-not-be-public" },
    }).ok,
    false,
  );

  const snapshotListener: ServerToClientEvents["state:snapshot"] = (
    received,
  ) => {
    assert.equal(received.kind, "state:snapshot");
  };
  const parsed = validateStateSnapshotEvent(event);
  if (parsed.ok) {
    snapshotListener(parsed.value);
  }
});

test("Socket.IO event map은 다섯 command ack와 두 server event를 연결한다", () => {
  const parsedCommand = validateRoomCreateCommand({
    kind: "room:create",
    protocolVersion: PROTOCOL_VERSION,
    requestId: "request_event_map",
    payload: {
      bootstrapCredential: { sessionToken },
      nickname: "Harvey",
    },
  });
  const parsedAck = validateRoomCreateAck(createRoomScopedSnapshotSuccess());
  let acknowledged = false;
  const handler: ClientToServerEvents["room:create"] = (
    command,
    acknowledge,
  ) => {
    assert.equal(command.kind, "room:create");
    if (parsedAck.ok) {
      acknowledge(parsedAck.value);
    }
  };

  if (parsedCommand.ok) {
    handler(parsedCommand.value, () => {
      acknowledged = true;
    });
  }
  assert.equal(acknowledged, true);

  const replacement = {
    kind: "session:replaced",
    protocolVersion: PROTOCOL_VERSION,
    serverTime: 1_750_000_000_000,
    reason: "NEW_PRIMARY_CONNECTION",
  };
  assert.equal(validateSessionReplacedNotification(replacement).ok, true);
  assert.equal(
    validateSessionReplacedNotification({
      ...replacement,
      connectionGeneration: 2,
    }).ok,
    false,
  );

  const replacementListener: ServerToClientEvents["session:replaced"] = (
    event,
  ) => {
    assert.equal(event.reason, "NEW_PRIMARY_CONNECTION");
  };
  const parsedReplacement = validateSessionReplacedNotification(replacement);
  if (parsedReplacement.ok) {
    replacementListener(parsedReplacement.value);
  }
});

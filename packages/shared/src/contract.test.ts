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
  type GameStartAck,
  type PlayingStateSnapshot,
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
  validateGameStartAck,
  validateGameStartCommand,
  validateLobbyStateSnapshot,
  validateNickname,
  validateProtocolVersion,
  validatePlayingStateSnapshot,
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
  validateTurnStartedEvent,
  validateUnscopedAck,
} from "./index.js";

const sessionToken = "opaque_session_token_for_contract_tests";
const AckDataSchema = v.strictObject({ accepted: v.boolean() });

function ordinaryBoardTilePlacement(
  tileId: string,
  assignedSymbol: string,
  allowedSymbols: readonly string[] = [assignedSymbol],
) {
  return {
    tileId,
    kind: "ORDINARY" as const,
    physicalType: `TEST_${tileId}`,
    assignedSymbol,
    allowedSymbols: [...allowedSymbols],
  };
}

function jokerBoardTilePlacement(tileId: string, assignedSymbol: string) {
  return {
    tileId,
    kind: "JOKER" as const,
    physicalType: "JOKER" as const,
    assignedSymbol,
    allowedSymbols: ["ㄱ", "ㅏ"],
  };
}

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

function createPlayingSnapshot() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 3,
      gameRevision: 0,
      presenceVersion: 3,
    },
    serverTime: 1_750_000_000_000,
    room: {
      roomId: "room_123",
      roomCode: "ABCD23",
      phase: "PLAYING",
      players: [
        {
          playerId: "player_123",
          nickname: "혁상",
          isHost: true,
          connectionStatus: "CONNECTED",
          rackCount: 2,
          initialMeldCompleted: false,
        },
        {
          playerId: "player_456",
          nickname: "Harvey",
          isHost: false,
          connectionStatus: "CONNECTED",
          rackCount: 2,
          initialMeldCompleted: false,
        },
      ],
    },
    game: {
      gameId: "game_123",
      board: {
        wordGroups: [
          {
            groupId: "group_123",
            syllables: [
              {
                choseong: [
                  ordinaryBoardTilePlacement("tile_board_1", "ㄱ"),
                ],
                jungseong: [
                  ordinaryBoardTilePlacement("tile_board_2", "ㅏ"),
                ],
                jongseong: [],
              },
            ],
          },
        ],
      },
      turnOrder: ["player_123", "player_456"],
      turn: {
        turnId: "turn_123",
        turnNumber: 1,
        activePlayerId: "player_123",
        startedAt: 1_750_000_000_000,
        deadlineAt: 1_750_000_060_000,
      },
      bagCounts: {
        consonant: 81,
        vowel: 47,
      },
    },
    self: {
      playerId: "player_123",
      rack: [
        {
          tileId: "tile_self_ordinary",
          kind: "ORDINARY",
          physicalType: "GIYEOK_NIEUN",
          sourceBag: "CONSONANT",
          allowedSymbols: ["ㄱ", "ㄴ"],
        },
        {
          tileId: "tile_self_joker",
          kind: "JOKER",
          physicalType: "JOKER",
          sourceBag: "VOWEL",
          allowedSymbols: ["ㄱ", "ㅏ"],
        },
      ],
    },
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
        kind: "game:unknown",
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

test("Socket.IO event map은 기존 command ack와 server event를 연결한다", () => {
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

test("Phase 11 game start 오류 code는 safe public DTO로 검증된다", () => {
  for (const code of ["NOT_ENOUGH_PLAYERS", "PLAYERS_NOT_CONNECTED"] as const) {
    const result = validateErrorDto({
      code,
      message: "The game cannot start yet.",
      recoverable: true,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.code, code);
    }
  }
});

test("game:start는 room revision과 strict empty payload만 받는다", () => {
  const command = {
    kind: "game:start",
    protocolVersion: PROTOCOL_VERSION,
    requestId: "request_game_start",
    expectedRoomRevision: 2,
    payload: {},
  };
  const parsed = validateGameStartCommand(command);

  assert.equal(parsed.ok, true);
  assert.equal(validateClientCommand(command).ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.kind, "game:start");
    assert.equal(parsed.value.expectedRoomRevision, 2);
  }

  const invalidCommands: unknown[] = [
    { ...command, actorPlayerId: "player_123" },
    { ...command, expectedGameRevision: 0 },
    { ...command, randomSeed: 7 },
    { ...command, expectedRoomRevision: -1 },
    { ...command, payload: { playerId: "player_123" } },
    { ...command, payload: { turnOrder: ["player_123"] } },
    { ...command, payload: { tileIds: ["tile_123"] } },
  ];
  const { expectedRoomRevision: _expectedRoomRevision, ...withoutRevision } =
    command;

  invalidCommands.push(withoutRevision);
  for (const invalidCommand of invalidCommands) {
    assert.equal(validateGameStartCommand(invalidCommand).ok, false);
  }
});

test("LOBBY와 PLAYING snapshot은 phase, game revision, game view를 함께 구분한다", () => {
  const lobby = createSnapshot();
  const playing = createPlayingSnapshot();
  const lobbyResult = validateLobbyStateSnapshot(lobby);
  const playingResult = validatePlayingStateSnapshot(playing);

  assert.equal(lobbyResult.ok, true);
  assert.equal(playingResult.ok, true);
  assert.equal(validateStateSnapshot(lobby).ok, true);
  assert.equal(validateStateSnapshot(playing).ok, true);

  function summarize(snapshot: PlayingStateSnapshot): string {
    return `${snapshot.game.gameId}:${snapshot.game.turn.turnNumber}:${snapshot.self.rack.length}`;
  }

  if (playingResult.ok) {
    assert.equal(summarize(playingResult.value), "game_123:1:2");
  }

  assert.equal(
    validateStateSnapshot({
      ...lobby,
      versions: { ...lobby.versions, gameRevision: 0 },
    }).ok,
    false,
  );
  assert.equal(
    validateStateSnapshot({ ...lobby, game: playing.game }).ok,
    false,
  );
  assert.equal(
    validateStateSnapshot({
      ...playing,
      versions: { ...playing.versions, gameRevision: null },
    }).ok,
    false,
  );
  const { game: _game, ...playingWithoutGame } = playing;
  assert.equal(validateStateSnapshot(playingWithoutGame).ok, false);
  assert.equal(validateLobbyStateSnapshot(playing).ok, false);
  assert.equal(validatePlayingStateSnapshot(lobby).ok, false);
});

test("PLAYING projection은 public summary와 본인 rack detail만 허용한다", () => {
  const playing = createPlayingSnapshot();
  const withOtherRack = {
    ...playing,
    room: {
      ...playing.room,
      players: playing.room.players.map((player) =>
        player.playerId === "player_456"
          ? { ...player, rack: [{ tileId: "private_other_tile" }] }
          : player,
      ),
    },
  };
  const withBagOrder = {
    ...playing,
    game: {
      ...playing.game,
      bagCounts: {
        ...playing.game.bagCounts,
        consonantTileIds: ["future_draw_tile"],
      },
    },
  };
  const withTilesById = {
    ...playing,
    game: {
      ...playing.game,
      tilesById: { tile_hidden: { physicalType: "HIDDEN" } },
    },
  };
  const withRackAssignment = {
    ...playing,
    self: {
      ...playing.self,
      rack: playing.self.rack.map((tile) => ({
        ...tile,
        assignedSymbol: "must-not-live-on-a-rack-tile",
      })),
    },
  };
  const withMismatchedRackCount = {
    ...playing,
    room: {
      ...playing.room,
      players: playing.room.players.map((player) =>
        player.playerId === playing.self.playerId
          ? { ...player, rackCount: player.rackCount + 1 }
          : player,
      ),
    },
  };
  const withDuplicateTurnOrder = {
    ...playing,
    game: {
      ...playing.game,
      turnOrder: ["player_123", "player_123"],
    },
  };

  for (const [name, input] of [
    ["other rack", withOtherRack],
    ["bag order", withBagOrder],
    ["tilesById", withTilesById],
    ["rack assignment", withRackAssignment],
    ["rack count mismatch", withMismatchedRackCount],
    ["duplicate turn order", withDuplicateTurnOrder],
  ] as const) {
    assert.equal(validatePlayingStateSnapshot(input).ok, false, name);
  }

  assert.equal(
    validatePlayingStateSnapshot({
      ...playing,
      game: {
        ...playing.game,
        turn: { ...playing.game.turn, turnNumber: 0 },
      },
    }).ok,
    false,
  );
  assert.equal(
    validatePlayingStateSnapshot({
      ...playing,
      self: {
        ...playing.self,
        rack: playing.self.rack.map((tile) =>
          tile.kind === "JOKER"
            ? { ...tile, allowedSymbols: ["ㅘ"] }
            : tile,
        ),
      },
    }).ok,
    false,
  );
});

test("public Board runtime contract는 canonical syllable 구조와 식별자 유일성을 강제한다", () => {
  const playing = createPlayingSnapshot();
  const validSyllable = {
    choseong: [ordinaryBoardTilePlacement("tile_choseong", "ㄱ")],
    jungseong: [ordinaryBoardTilePlacement("tile_jungseong", "ㅏ")],
    jongseong: [],
  };
  const snapshotWithGroups = (wordGroups: readonly unknown[]) => ({
    ...playing,
    game: {
      ...playing.game,
      board: { wordGroups },
    },
  });
  const groupWithSyllable = (syllable: unknown) => ({
    groupId: "group_structure",
    syllables: [syllable],
  });

  const malformedCases: readonly Readonly<{
    name: string;
    wordGroups: readonly unknown[];
  }>[] = [
    {
      name: "empty WordGroup",
      wordGroups: [{ groupId: "group_empty", syllables: [] }],
    },
    {
      name: "missing choseong",
      wordGroups: [
        groupWithSyllable({ ...validSyllable, choseong: [] }),
      ],
    },
    {
      name: "multiple choseong components",
      wordGroups: [
        groupWithSyllable({
          ...validSyllable,
          choseong: [
            ...validSyllable.choseong,
            ordinaryBoardTilePlacement("tile_choseong_2", "ㄴ"),
          ],
        }),
      ],
    },
    {
      name: "missing jungseong",
      wordGroups: [
        groupWithSyllable({ ...validSyllable, jungseong: [] }),
      ],
    },
    {
      name: "three jungseong components",
      wordGroups: [
        groupWithSyllable({
          ...validSyllable,
          jungseong: [
            ordinaryBoardTilePlacement("tile_vowel_1", "ㅗ"),
            ordinaryBoardTilePlacement("tile_vowel_2", "ㅏ"),
            ordinaryBoardTilePlacement("tile_vowel_3", "ㅣ"),
          ],
        }),
      ],
    },
    {
      name: "unsupported compound jungseong order",
      wordGroups: [
        groupWithSyllable({
          ...validSyllable,
          jungseong: [
            ordinaryBoardTilePlacement("tile_vowel_1", "ㅏ"),
            ordinaryBoardTilePlacement("tile_vowel_2", "ㅗ"),
          ],
        }),
      ],
    },
    {
      name: "three jongseong components",
      wordGroups: [
        groupWithSyllable({
          ...validSyllable,
          jongseong: [
            ordinaryBoardTilePlacement("tile_final_1", "ㄹ"),
            ordinaryBoardTilePlacement("tile_final_2", "ㄱ"),
            ordinaryBoardTilePlacement("tile_final_3", "ㅅ"),
          ],
        }),
      ],
    },
    {
      name: "unsupported final cluster",
      wordGroups: [
        groupWithSyllable({
          ...validSyllable,
          jongseong: [
            ordinaryBoardTilePlacement("tile_final_1", "ㅅ"),
            ordinaryBoardTilePlacement("tile_final_2", "ㄱ"),
          ],
        }),
      ],
    },
    {
      name: "choseong-only consonant in jongseong role",
      wordGroups: [
        groupWithSyllable({
          ...validSyllable,
          jongseong: [
            ordinaryBoardTilePlacement("tile_wrong_final_role", "ㄸ"),
          ],
        }),
      ],
    },
    {
      name: "vowel in choseong role",
      wordGroups: [
        groupWithSyllable({
          ...validSyllable,
          choseong: [
            ordinaryBoardTilePlacement("tile_wrong_role", "ㅏ"),
          ],
        }),
      ],
    },
    {
      name: "consonant in jungseong role",
      wordGroups: [
        groupWithSyllable({
          ...validSyllable,
          jungseong: [
            ordinaryBoardTilePlacement("tile_wrong_role", "ㄱ"),
          ],
        }),
      ],
    },
    {
      name: "unsupported assigned symbol",
      wordGroups: [
        groupWithSyllable({
          ...validSyllable,
          choseong: [
            ordinaryBoardTilePlacement("tile_unknown_symbol", "A"),
          ],
        }),
      ],
    },
    {
      name: "duplicate groupId",
      wordGroups: [
        { groupId: "group_duplicate", syllables: [validSyllable] },
        {
          groupId: "group_duplicate",
          syllables: [
            {
              choseong: [
                ordinaryBoardTilePlacement("tile_second_choseong", "ㄴ"),
              ],
              jungseong: [
                ordinaryBoardTilePlacement("tile_second_jungseong", "ㅏ"),
              ],
              jongseong: [],
            },
          ],
        },
      ],
    },
    {
      name: "duplicate tileId",
      wordGroups: [
        groupWithSyllable({
          ...validSyllable,
          jungseong: [
            ordinaryBoardTilePlacement("tile_choseong", "ㅏ"),
          ],
        }),
      ],
    },
  ];

  for (const fixture of malformedCases) {
    assert.equal(
      validatePlayingStateSnapshot(snapshotWithGroups(fixture.wordGroups)).ok,
      false,
      fixture.name,
    );
  }
});

test("public Board Tile metadata는 ordinary/Joker를 구분하고 private origin을 거절한다", () => {
  const playing = createPlayingSnapshot();
  const snapshotWithChoseong = (choseong: unknown) => ({
    ...playing,
    game: {
      ...playing.game,
      board: {
        wordGroups: [
          {
            groupId: "group_tile_metadata",
            syllables: [
              {
                choseong: [choseong],
                jungseong: [
                  ordinaryBoardTilePlacement("tile_metadata_vowel", "ㅏ"),
                ],
                jongseong: [],
              },
            ],
          },
        ],
      },
    },
  });

  assert.equal(
    validatePlayingStateSnapshot(
      snapshotWithChoseong(
        ordinaryBoardTilePlacement(
          "tile_metadata_ordinary",
          "ㄱ",
          ["ㄱ", "ㄴ"],
        ),
      ),
    ).ok,
    true,
  );
  assert.equal(
    validatePlayingStateSnapshot(
      snapshotWithChoseong(
        jokerBoardTilePlacement("tile_metadata_joker", "ㄱ"),
      ),
    ).ok,
    true,
  );

  const invalidPlacements: readonly Readonly<{
    name: string;
    placement: unknown;
  }>[] = [
    {
      name: "legacy metadata-free placement",
      placement: { tileId: "tile_metadata_legacy", assignedSymbol: "ㄱ" },
    },
    {
      name: "ordinary assignedSymbol outside allowedSymbols",
      placement: ordinaryBoardTilePlacement(
        "tile_metadata_invalid_assignment",
        "ㄱ",
        ["ㄴ"],
      ),
    },
    {
      name: "ordinary sourceBag disclosure",
      placement: {
        ...ordinaryBoardTilePlacement("tile_metadata_source", "ㄱ"),
        sourceBag: "CONSONANT",
      },
    },
    {
      name: "Joker without server-derived allowedSymbols",
      placement: {
        tileId: "tile_metadata_joker_symbols",
        kind: "JOKER",
        physicalType: "JOKER",
        assignedSymbol: "ㄱ",
      },
    },
    {
      name: "Joker compound symbol option",
      placement: {
        ...jokerBoardTilePlacement("tile_metadata_joker_compound", "ㄱ"),
        allowedSymbols: ["ㄱ", "ㅘ"],
      },
    },
    {
      name: "Joker assignedSymbol outside allowedSymbols",
      placement: {
        ...jokerBoardTilePlacement("tile_metadata_joker_assignment", "ㄱ"),
        allowedSymbols: ["ㅏ"],
      },
    },
    {
      name: "Joker non-Joker physicalType",
      placement: {
        ...jokerBoardTilePlacement("tile_metadata_joker_type", "ㄱ"),
        physicalType: "GIYEOK_NIEUN_ROTATION",
      },
    },
  ];

  for (const fixture of invalidPlacements) {
    assert.equal(
      validatePlayingStateSnapshot(
        snapshotWithChoseong(fixture.placement),
      ).ok,
      false,
      fixture.name,
    );
  }
});

test("PLAYING snapshot은 Board와 self rack 사이의 physical Tile 중복을 거절한다", () => {
  const playing = createPlayingSnapshot();
  const firstRackTile = playing.self.rack[0];
  const firstGroup = playing.game.board.wordGroups[0];
  assert.ok(firstRackTile);
  assert.ok(firstGroup);
  const firstSyllable = firstGroup.syllables[0];
  assert.ok(firstSyllable);
  const firstBoardTile = firstSyllable.choseong[0];
  assert.ok(firstBoardTile);

  const overlappingSnapshot = {
    ...playing,
    self: {
      ...playing.self,
      rack: [
        {
          ...firstRackTile,
          tileId: firstBoardTile.tileId,
        },
        ...playing.self.rack.slice(1),
      ],
    },
  };

  assert.equal(validatePlayingStateSnapshot(overlappingSnapshot).ok, false);
});

test("public Board runtime contract는 지원되는 복합모음과 겹받침을 허용한다", () => {
  const playing = createPlayingSnapshot();
  const result = validatePlayingStateSnapshot({
    ...playing,
    game: {
      ...playing.game,
      board: {
        wordGroups: [
          {
            groupId: "group_compound",
            syllables: [
              {
                choseong: [
                  ordinaryBoardTilePlacement("tile_compound_initial", "ㄱ"),
                ],
                jungseong: [
                  ordinaryBoardTilePlacement("tile_compound_vowel_1", "ㅗ"),
                  ordinaryBoardTilePlacement("tile_compound_vowel_2", "ㅏ"),
                ],
                jongseong: [
                  ordinaryBoardTilePlacement("tile_compound_final_1", "ㄱ"),
                  ordinaryBoardTilePlacement("tile_compound_final_2", "ㅅ"),
                ],
              },
            ],
          },
        ],
      },
    },
  });

  assert.equal(result.ok, true);
});

test("game:start ack와 turn:started event는 PLAYING projection만 전달한다", () => {
  const snapshot = createPlayingSnapshot();
  const ack = {
    scope: "ROOM",
    requestId: "request_game_start_ack",
    ok: true,
    serverTime: snapshot.serverTime,
    versions: snapshot.versions,
    data: { snapshot },
  };
  const parsedAck = validateGameStartAck(ack);

  assert.equal(parsedAck.ok, true);

  function activePlayer(acceptedAck: GameStartAck): string {
    if (
      acceptedAck.requestId === null ||
      acceptedAck.scope === "UNSCOPED" ||
      !acceptedAck.ok
    ) {
      return "failure";
    }

    return acceptedAck.data.snapshot.game.turn.activePlayerId;
  }

  if (parsedAck.ok) {
    assert.equal(activePlayer(parsedAck.value), "player_123");
  }

  assert.equal(
    validateGameStartAck({
      ...ack,
      data: { snapshot: createSnapshot() },
    }).ok,
    false,
  );
  assert.equal(
    validateGameStartAck({
      ...ack,
      data: { snapshot, sessionToken },
    }).ok,
    false,
  );

  const event = {
    kind: "turn:started",
    protocolVersion: PROTOCOL_VERSION,
    versions: snapshot.versions,
    serverTime: snapshot.serverTime,
    payload: {
      gameId: snapshot.game.gameId,
      turnId: snapshot.game.turn.turnId,
      turnNumber: snapshot.game.turn.turnNumber,
      activePlayerId: snapshot.game.turn.activePlayerId,
      deadlineAt: snapshot.game.turn.deadlineAt,
    },
  };
  const parsedEvent = validateTurnStartedEvent(event);

  assert.equal(parsedEvent.ok, true);
  assert.equal(
    validateTurnStartedEvent({
      ...event,
      versions: { ...event.versions, gameRevision: null },
    }).ok,
    false,
  );
  assert.equal(
    validateTurnStartedEvent({
      ...event,
      payload: { ...event.payload, rack: snapshot.self.rack },
    }).ok,
    false,
  );
  assert.equal(
    validateTurnStartedEvent({
      ...event,
      payload: { ...event.payload, turnNumber: 0 },
    }).ok,
    false,
  );

  const commandResult = validateGameStartCommand({
    kind: "game:start",
    protocolVersion: PROTOCOL_VERSION,
    requestId: "request_event_map_game_start",
    expectedRoomRevision: 2,
    payload: {},
  });
  let acknowledged = false;
  const startHandler: ClientToServerEvents["game:start"] = (
    command,
    acknowledge,
  ) => {
    assert.equal(command.kind, "game:start");
    if (parsedAck.ok) {
      acknowledge(parsedAck.value);
    }
  };
  const turnListener: ServerToClientEvents["turn:started"] = (received) => {
    assert.equal(received.payload.turnId, "turn_123");
  };

  if (commandResult.ok) {
    startHandler(commandResult.value, () => {
      acknowledged = true;
    });
  }
  if (parsedEvent.ok) {
    turnListener(parsedEvent.value);
  }
  assert.equal(acknowledged, true);
});

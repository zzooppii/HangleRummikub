import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";

import {
  BOOTSTRAP_SESSION_TTL_MS,
  BROWSER_CREDENTIAL_STORAGE,
  DUPLICATE_CONNECTION_POLICY,
  OPAQUE_IDENTIFIER_MAX_LENGTH,
  PROPOSED_ASSIGNED_SYMBOL_MAX_LENGTH,
  PROPOSED_BOARD_MAX_TILE_REFERENCES,
  PROPOSED_BOARD_MAX_WORD_GROUPS,
  PROPOSED_WORD_GROUP_MAX_SYLLABLES,
  PROPOSED_WORD_GROUP_ID_MAX_LENGTH,
  PROTOCOL_VERSION,
  GameResultSchema,
  ProposedWordGroupSchema,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SESSION_TOKEN_MAX_LENGTH,
  type ClientToServerEvents,
  type GameStartAck,
  type TurnDrawAck,
  type TurnPassAck,
  type TurnSubmitAck,
  type PlayingStateSnapshot,
  type RoomCreateAck,
  type RoomLeaveAck,
  RoomPhaseSchema,
  SessionReplacedNotificationSchema,
  type ServerToClientEvents,
  validateBootstrapCredential,
  validateBootstrapSessionAck,
  validateBoundPlayerCredential,
  validateBrowserStoredPlayerSession,
  validateClientCommand,
  validateErrorDto,
  validateFinishedStateSnapshot,
  validateGameFinishedEvent,
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
  validateRoomClosedEvent,
  validateRoomLeaveAck,
  validateRoomLeaveCommand,
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
  validateTurnDrawAck,
  validateTurnDrawCommand,
  validateTurnPassAck,
  validateTurnPassCommand,
  validateTurnSubmitAck,
  validateTurnSubmitCommand,
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
          forfeited: false,
        },
        {
          playerId: "player_456",
          nickname: "Harvey",
          isHost: false,
          connectionStatus: "CONNECTED",
          rackCount: 2,
          initialMeldCompleted: false,
          forfeited: false,
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

function createFinishedSnapshot() {
  const playing = createPlayingSnapshot();

  return {
    ...playing,
    versions: {
      ...playing.versions,
      roomRevision: 4,
      gameRevision: 1,
    },
    room: {
      ...playing.room,
      phase: "FINISHED",
      players: playing.room.players.map((player) =>
        player.playerId === "player_123"
          ? { ...player, rackCount: 0, initialMeldCompleted: true }
          : player,
      ),
    },
    game: {
      gameId: playing.game.gameId,
      board: playing.game.board,
      turnOrder: playing.game.turnOrder,
      bagCounts: playing.game.bagCounts,
      result: {
        reason: "RACK_EMPTY",
        winnerPlayerIds: ["player_123"],
        rankings: [
          {
            playerId: "player_123",
            rank: 1,
            score: 2,
            remainingRackCount: 0,
            penaltyCost: 0,
            forfeited: false,
          },
          {
            playerId: "player_456",
            rank: 2,
            score: -2,
            remainingRackCount: 2,
            penaltyCost: 2,
            forfeited: false,
          },
        ],
        finishedAt: 1_750_000_030_000,
      },
    },
    self: {
      playerId: "player_123",
      rack: [],
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

test("opaque identifier와 session token은 oversized transport input을 제한한다", () => {
  const identifierAtLimit = "i".repeat(OPAQUE_IDENTIFIER_MAX_LENGTH);
  const oversizedIdentifier = `${identifierAtLimit}i`;
  const tokenAtLimit = "t".repeat(SESSION_TOKEN_MAX_LENGTH);
  const oversizedToken = `${tokenAtLimit}t`;

  assert.equal(
    validateSessionBootstrapCommand({
      kind: "session:bootstrap",
      protocolVersion: PROTOCOL_VERSION,
      requestId: identifierAtLimit,
      payload: {},
    }).ok,
    true,
  );
  assert.equal(
    validateSessionBootstrapCommand({
      kind: "session:bootstrap",
      protocolVersion: PROTOCOL_VERSION,
      requestId: oversizedIdentifier,
      payload: {},
    }).ok,
    false,
  );

  assert.equal(
    validateBootstrapCredential({ sessionToken: tokenAtLimit }).ok,
    true,
  );
  assert.equal(
    validateBootstrapCredential({ sessionToken: oversizedToken }).ok,
    false,
  );

  const submit = turnSubmitCommand({
    wordGroups: [
      {
        groupId: "group_oversized_id_boundary",
        syllables: [proposedSyllable("tile_id_boundary")],
      },
    ],
  });
  assert.equal(
    validateTurnSubmitCommand({ ...submit, turnId: oversizedIdentifier }).ok,
    false,
  );
  assert.equal(
    validateTurnSubmitCommand({
      ...submit,
      payload: {
        proposedBoard: {
          wordGroups: [
            {
              groupId: "group_oversized_tile_id",
              syllables: [proposedSyllable(oversizedIdentifier)],
            },
          ],
        },
      },
    }).ok,
    false,
  );
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
    "offlineTimeoutStreak",
    "offlineTimeoutStreaks",
    "hostGraceGeneration",
    "hostGraceTimerId",
    "cleanupTimerId",
    "graceDeadlineAt",
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

function proposedSyllable(seed: string) {
  return {
    choseong: [{ tileId: `${seed}_c`, assignedSymbol: "ㄱ" }],
    jungseong: [{ tileId: `${seed}_v`, assignedSymbol: "ㅏ" }],
    jongseong: [{ tileId: `${seed}_f`, assignedSymbol: "ㄴ" }],
  };
}

function turnSubmitCommand(proposedBoard: unknown) {
  return {
    kind: "turn:submit",
    protocolVersion: PROTOCOL_VERSION,
    requestId: "request_turn_submit",
    expectedGameRevision: 0,
    turnId: "turn_123",
    payload: { proposedBoard },
  };
}

function turnDrawCommand(bagKind: unknown) {
  return {
    kind: "turn:draw",
    protocolVersion: PROTOCOL_VERSION,
    requestId: "request_turn_draw",
    expectedGameRevision: 0,
    turnId: "turn_123",
    payload: { bagKind },
  };
}

function turnPassCommand() {
  return {
    kind: "turn:pass",
    protocolVersion: PROTOCOL_VERSION,
    requestId: "request_turn_pass",
    expectedGameRevision: 0,
    turnId: "turn_123",
    payload: {},
  };
}

test("turn:submit command는 actor/derived state 없이 strict ProposedBoard만 받는다", () => {
  const proposedBoard = {
    wordGroups: [
      {
        groupId: "group_submit",
        syllables: [proposedSyllable("tile_submit")],
      },
    ],
  };
  const command = turnSubmitCommand(proposedBoard);
  const result = validateTurnSubmitCommand(command);

  assert.equal(result.ok, true);
  assert.equal(validateClientCommand(command).ok, true);
  if (result.ok) {
    assert.equal(result.value.expectedGameRevision, 0);
    assert.equal(result.value.turnId, "turn_123");
    assert.equal(result.value.payload.proposedBoard.wordGroups.length, 1);
  }

  for (const invalid of [
    { ...command, playerId: "player_spoofed" },
    { ...command, expectedGameRevision: -1 },
    { ...command, turnId: "" },
    { ...command, payload: { ...command.payload, rack: [] } },
    { ...command, payload: { ...command.payload, composedWord: "간" } },
    {
      ...command,
      payload: {
        proposedBoard: { ...proposedBoard, tilesById: {} },
      },
    },
  ]) {
    assert.equal(validateTurnSubmitCommand(invalid).ok, false);
  }
});

test("ProposedBoard wire schema는 component cardinality를 resource shape로 제한한다", () => {
  const base = proposedSyllable("tile_cardinality");
  const cases = [
    { ...base, choseong: [] },
    {
      ...base,
      choseong: [
        ...base.choseong,
        { tileId: "tile_second_c", assignedSymbol: "ㄴ" },
      ],
    },
    { ...base, jungseong: [] },
    {
      ...base,
      jungseong: [
        ...base.jungseong,
        { tileId: "tile_second_v", assignedSymbol: "ㅏ" },
        { tileId: "tile_third_v", assignedSymbol: "ㅣ" },
      ],
    },
    {
      ...base,
      jongseong: [
        ...base.jongseong,
        { tileId: "tile_second_f", assignedSymbol: "ㄱ" },
        { tileId: "tile_third_f", assignedSymbol: "ㅅ" },
      ],
    },
  ];

  for (const syllable of cases) {
    assert.equal(
      validateTurnSubmitCommand(
        turnSubmitCommand({
          wordGroups: [{ groupId: "group_counts", syllables: [syllable] }],
        }),
      ).ok,
      false,
    );
  }
});

test("ProposedBoard는 156개 aggregate Tile reference까지만 허용한다", () => {
  const makeBoard = (syllableCount: number) => ({
    wordGroups: [
      {
        groupId: "group_tile_limit",
        syllables: Array.from({ length: syllableCount }, (_, index) =>
          proposedSyllable(`tile_limit_${index}`),
        ),
      },
    ],
  });

  assert.equal(PROPOSED_BOARD_MAX_TILE_REFERENCES, 156);
  assert.equal(validateTurnSubmitCommand(turnSubmitCommand(makeBoard(52))).ok, true);
  assert.equal(
    validateTurnSubmitCommand(turnSubmitCommand(makeBoard(53))).ok,
    false,
  );
});

test("ProposedBoard는 group/syllable/string 입력 크기를 제한한다", () => {
  const groupIdAtLimit = "g".repeat(PROPOSED_WORD_GROUP_ID_MAX_LENGTH);
  const symbolAtLimit = "가".repeat(PROPOSED_ASSIGNED_SYMBOL_MAX_LENGTH);
  const groupsAtLimit = Array.from(
    { length: PROPOSED_BOARD_MAX_WORD_GROUPS },
    (_, index) => ({ groupId: `group_${index}`, syllables: [] }),
  );

  assert.equal(
    validateTurnSubmitCommand(
      turnSubmitCommand({ wordGroups: groupsAtLimit }),
    ).ok,
    true,
  );
  assert.equal(
    validateTurnSubmitCommand(
      turnSubmitCommand({
        wordGroups: [
          ...groupsAtLimit,
          { groupId: "group_over_limit", syllables: [] },
        ],
      }),
    ).ok,
    false,
  );
  assert.equal(
    v.safeParse(ProposedWordGroupSchema, {
      groupId: "group_syllable_at_limit",
      syllables: Array.from(
        { length: PROPOSED_WORD_GROUP_MAX_SYLLABLES },
        (_, index) => proposedSyllable(`tile_syllable_at_limit_${index}`),
      ),
    }).success,
    true,
  );
  assert.equal(
    v.safeParse(ProposedWordGroupSchema, {
      groupId: "group_syllable_over_limit",
      syllables: Array.from(
        { length: PROPOSED_WORD_GROUP_MAX_SYLLABLES + 1 },
        (_, index) => proposedSyllable(`tile_syllable_over_limit_${index}`),
      ),
    }).success,
    false,
  );
  assert.equal(
    validateTurnSubmitCommand(
      turnSubmitCommand({
        wordGroups: [{ groupId: groupIdAtLimit, syllables: [] }],
      }),
    ).ok,
    true,
  );
  assert.equal(
    validateTurnSubmitCommand(
      turnSubmitCommand({
        wordGroups: [{ groupId: `${groupIdAtLimit}g`, syllables: [] }],
      }),
    ).ok,
    false,
  );
  assert.equal(
    validateTurnSubmitCommand(
      turnSubmitCommand({
        wordGroups: [
          {
            groupId: "group_symbol_limit",
            syllables: [
              {
                choseong: [
                  { tileId: "tile_symbol_limit", assignedSymbol: symbolAtLimit },
                ],
                jungseong: [
                  { tileId: "tile_symbol_vowel", assignedSymbol: "ㅏ" },
                ],
                jongseong: [],
              },
            ],
          },
        ],
      }),
    ).ok,
    true,
  );
  assert.equal(
    validateTurnSubmitCommand(
      turnSubmitCommand({
        wordGroups: [
          {
            groupId: "group_symbol_over_limit",
            syllables: [
              {
                choseong: [
                  {
                    tileId: "tile_symbol_over_limit",
                    assignedSymbol: `${symbolAtLimit}가`,
                  },
                ],
                jungseong: [
                  { tileId: "tile_symbol_over_vowel", assignedSymbol: "ㅏ" },
                ],
                jongseong: [],
              },
            ],
          },
        ],
      }),
    ).ok,
    false,
  );
});

test("ProposedBoard transport는 안전한 game-rule invalid shape를 RuleEngine에 남긴다", () => {
  assert.equal(
    validateTurnSubmitCommand(
      turnSubmitCommand({
        wordGroups: [
          { groupId: "group_empty_semantic", syllables: [] },
          {
            groupId: "group_unsupported_semantic",
            syllables: [
              {
                choseong: [
                  { tileId: "tile_same", assignedSymbol: "X" },
                ],
                jungseong: [
                  { tileId: "tile_same", assignedSymbol: "Y" },
                ],
                jongseong: [],
              },
            ],
          },
        ],
      }),
    ).ok,
    true,
  );
});

test("Phase 13 public error code는 safe ErrorDto로 직렬화된다", () => {
  for (const code of [
    "NOT_YOUR_TURN",
    "TURN_EXPIRED",
    "INVALID_TILE_ACCESS",
    "INVALID_BOARD",
    "INVALID_HANGUL_COMPOSITION",
    "WORD_NOT_ALLOWED",
    "RULE_VIOLATION",
    "TEMPORARILY_UNAVAILABLE",
  ] as const) {
    const result = validateErrorDto({
      code,
      message: "The proposed turn was not accepted.",
      recoverable: true,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.code, code);
    }
  }
});

test("FINISHED snapshot은 no-active-turn result와 본인 rack만 공개한다", () => {
  const snapshot = createFinishedSnapshot();
  const result = validateFinishedStateSnapshot(snapshot);

  assert.equal(result.ok, true);
  assert.equal(validateStateSnapshot(snapshot).ok, true);
  if (result.ok) {
    assert.equal(result.value.room.phase, "FINISHED");
    assert.equal(result.value.game.result.reason, "RACK_EMPTY");
    assert.deepEqual(result.value.game.result.winnerPlayerIds, ["player_123"]);
    assert.equal("turn" in result.value.game, false);
  }

  for (const leaked of [
    { ...snapshot, sessionToken },
    {
      ...snapshot,
      game: { ...snapshot.game, turn: createPlayingSnapshot().game.turn },
    },
    {
      ...snapshot,
      game: { ...snapshot.game, tilesById: {} },
    },
    {
      ...snapshot,
      game: { ...snapshot.game, result: { ...snapshot.game.result, rack: [] } },
    },
  ]) {
    assert.equal(validateFinishedStateSnapshot(leaked).ok, false);
  }
});

test("일반화된 Game result는 5개 reason과 competition ranking을 검증한다", () => {
  const penaltyRankings = [
    {
      playerId: "player_123",
      rank: 1,
      score: -3,
      remainingRackCount: 3,
      penaltyCost: 3,
      forfeited: false,
    },
    {
      playerId: "player_456",
      rank: 1,
      score: -3,
      remainingRackCount: 3,
      penaltyCost: 3,
      forfeited: false,
    },
    {
      playerId: "player_789",
      rank: 3,
      score: -32,
      remainingRackCount: 3,
      penaltyCost: 32,
      forfeited: false,
    },
  ] as const;

  for (const reason of ["TIME_LIMIT", "STALEMATE"] as const) {
    assert.equal(
      v.safeParse(GameResultSchema, {
        reason,
        winnerPlayerIds: ["player_123", "player_456"],
        rankings: penaltyRankings,
        finishedAt: 1_750_000_030_000,
      }).success,
      true,
      reason,
    );
  }

  assert.equal(
    v.safeParse(GameResultSchema, {
      reason: "RACK_EMPTY",
      winnerPlayerIds: ["player_123"],
      rankings: [
        {
          ...penaltyRankings[0],
          score: 35,
          remainingRackCount: 0,
          penaltyCost: 0,
        },
        { ...penaltyRankings[1], rank: 2 },
        { ...penaltyRankings[2], rank: 3 },
      ],
      finishedAt: 1_750_000_030_000,
    }).success,
    true,
  );

  assert.equal(
    v.safeParse(GameResultSchema, {
      reason: "LAST_PLAYER_STANDING",
      winnerPlayerIds: ["player_123"],
      rankings: [
        { ...penaltyRankings[0], score: 35 },
        { ...penaltyRankings[1], rank: 2, forfeited: true },
        { ...penaltyRankings[2], rank: 3, forfeited: true },
      ],
      finishedAt: 1_750_000_030_000,
    }).success,
    true,
  );

  assert.equal(
    v.safeParse(GameResultSchema, {
      reason: "ALL_PLAYERS_FORFEITED",
      winnerPlayerIds: [],
      rankings: penaltyRankings.map((entry) => ({
        ...entry,
        forfeited: true,
      })),
      finishedAt: 1_750_000_030_000,
    }).success,
    true,
  );
  assert.equal(
    v.safeParse(GameResultSchema, {
      reason: "TIME_LIMIT",
      winnerPlayerIds: ["player_123", "player_456"],
      rankings: penaltyRankings.map((entry, index) =>
        index === 2 ? { ...entry, rank: 2 } : entry,
      ),
      finishedAt: 1_750_000_030_000,
    }).success,
    false,
    "dense 1,1,2 ranking must be rejected",
  );
});

test("Game result ranking은 reason별 key 순서와 정확한 competition rank를 강제한다", () => {
  const cases = [
    {
      reason: "TIME_LIMIT",
      winnerPlayerIds: ["player_456"],
      rankings: [
        {
          playerId: "player_456",
          rank: 1,
          score: -3,
          remainingRackCount: 3,
          penaltyCost: 3,
          forfeited: false,
        },
        {
          playerId: "player_123",
          rank: 2,
          score: -31,
          remainingRackCount: 2,
          penaltyCost: 31,
          forfeited: false,
        },
      ],
    },
    {
      reason: "STALEMATE",
      winnerPlayerIds: ["player_456"],
      rankings: [
        {
          playerId: "player_456",
          rank: 1,
          score: -32,
          remainingRackCount: 3,
          penaltyCost: 32,
          forfeited: false,
        },
        {
          playerId: "player_123",
          rank: 2,
          score: -3,
          remainingRackCount: 3,
          penaltyCost: 3,
          forfeited: false,
        },
      ],
    },
    {
      reason: "ALL_PLAYERS_FORFEITED",
      winnerPlayerIds: [],
      rankings: [
        {
          playerId: "player_456",
          rank: 1,
          score: -32,
          remainingRackCount: 3,
          penaltyCost: 32,
          forfeited: true,
        },
        {
          playerId: "player_123",
          rank: 2,
          score: -3,
          remainingRackCount: 3,
          penaltyCost: 3,
          forfeited: true,
        },
      ],
    },
  ] as const;

  for (const result of cases) {
    assert.equal(
      v.safeParse(GameResultSchema, {
        ...result,
        finishedAt: 1_750_000_030_000,
      }).success,
      false,
      result.reason,
    );
  }
});

test("negative-score 종료 reason은 score = -penaltyCost를 강제한다", () => {
  for (const reason of [
    "TIME_LIMIT",
    "STALEMATE",
    "ALL_PLAYERS_FORFEITED",
  ] as const) {
    assert.equal(
      v.safeParse(GameResultSchema, {
        reason,
        winnerPlayerIds:
          reason === "ALL_PLAYERS_FORFEITED" ? [] : ["player_123"],
        rankings: [
          {
            playerId: "player_123",
            rank: 1,
            score: 3,
            remainingRackCount: 3,
            penaltyCost: 3,
            forfeited: reason === "ALL_PLAYERS_FORFEITED",
          },
          {
            playerId: "player_456",
            rank: 2,
            score: -32,
            remainingRackCount: 3,
            penaltyCost: 32,
            forfeited: reason === "ALL_PLAYERS_FORFEITED",
          },
        ],
        finishedAt: 1_750_000_030_000,
      }).success,
      false,
      reason,
    );
  }
});

test("single-winner 종료는 loser penalty 합의 transfer score를 강제한다", () => {
  for (const reason of ["RACK_EMPTY", "LAST_PLAYER_STANDING"] as const) {
    assert.equal(
      v.safeParse(GameResultSchema, {
        reason,
        winnerPlayerIds: ["player_123"],
        rankings: [
          {
            playerId: "player_123",
            rank: 1,
            score: 31,
            remainingRackCount: reason === "RACK_EMPTY" ? 0 : 2,
            penaltyCost: reason === "RACK_EMPTY" ? 0 : 2,
            forfeited: false,
          },
          {
            playerId: "player_456",
            rank: 2,
            score: -32,
            remainingRackCount: 3,
            penaltyCost: 32,
            forfeited: reason === "LAST_PLAYER_STANDING",
          },
        ],
        finishedAt: 1_750_000_030_000,
      }).success,
      false,
      reason,
    );
  }
});

test("rack-empty와 forfeit 종료는 winner/rack/forfeited 관계를 강제한다", () => {
  const rackEmpty = {
    reason: "RACK_EMPTY" as const,
    winnerPlayerIds: ["player_123"],
    rankings: [
      {
        playerId: "player_123",
        rank: 1,
        score: 2,
        remainingRackCount: 0,
        penaltyCost: 0,
        forfeited: false,
      },
      {
        playerId: "player_456",
        rank: 2,
        score: -2,
        remainingRackCount: 2,
        penaltyCost: 2,
        forfeited: false,
      },
    ],
    finishedAt: 1_750_000_030_000,
  };
  for (const invalidWinner of [
    { remainingRackCount: 1 },
    { penaltyCost: 1 },
    { forfeited: true },
  ]) {
    assert.equal(
      v.safeParse(GameResultSchema, {
        ...rackEmpty,
        rankings: [
          { ...rackEmpty.rankings[0], ...invalidWinner },
          rackEmpty.rankings[1],
        ],
      }).success,
      false,
    );
  }

  assert.equal(
    v.safeParse(GameResultSchema, {
      reason: "LAST_PLAYER_STANDING",
      winnerPlayerIds: ["player_123"],
      rankings: [
        {
          playerId: "player_123",
          rank: 1,
          score: 2,
          remainingRackCount: 4,
          penaltyCost: 4,
          forfeited: false,
        },
        {
          playerId: "player_456",
          rank: 2,
          score: -2,
          remainingRackCount: 2,
          penaltyCost: 2,
          forfeited: false,
        },
      ],
      finishedAt: 1_750_000_030_000,
    }).success,
    false,
  );

  assert.equal(
    v.safeParse(GameResultSchema, {
      reason: "LAST_PLAYER_STANDING",
      winnerPlayerIds: ["player_123"],
      rankings: [
        {
          playerId: "player_123",
          rank: 1,
          score: 2,
          remainingRackCount: 4,
          penaltyCost: 4,
          forfeited: true,
        },
        {
          playerId: "player_456",
          rank: 2,
          score: -2,
          remainingRackCount: 2,
          penaltyCost: 2,
          forfeited: true,
        },
      ],
      finishedAt: 1_750_000_030_000,
    }).success,
    false,
  );

  assert.equal(
    v.safeParse(GameResultSchema, {
      reason: "ALL_PLAYERS_FORFEITED",
      winnerPlayerIds: [],
      rankings: [
        {
          playerId: "player_123",
          rank: 1,
          score: -2,
          remainingRackCount: 2,
          penaltyCost: 2,
          forfeited: false,
        },
        {
          playerId: "player_456",
          rank: 2,
          score: -3,
          remainingRackCount: 3,
          penaltyCost: 3,
          forfeited: true,
        },
      ],
      finishedAt: 1_750_000_030_000,
    }).success,
    false,
  );
});

test("공동 winner 순서는 rank-one ranking의 deterministic 순서와 같아야 한다", () => {
  assert.equal(
    v.safeParse(GameResultSchema, {
      reason: "TIME_LIMIT",
      winnerPlayerIds: ["player_456", "player_123"],
      rankings: [
        {
          playerId: "player_123",
          rank: 1,
          score: -3,
          remainingRackCount: 3,
          penaltyCost: 3,
          forfeited: false,
        },
        {
          playerId: "player_456",
          rank: 1,
          score: -3,
          remainingRackCount: 3,
          penaltyCost: 3,
          forfeited: false,
        },
      ],
      finishedAt: 1_750_000_030_000,
    }).success,
    false,
  );
});

test("turn:submit ack와 game:finished advisory는 typed, strict, secret-free다", () => {
  const snapshot = createFinishedSnapshot();
  const ack = {
    scope: "ROOM",
    requestId: "request_turn_submit_ack",
    ok: true,
    serverTime: snapshot.serverTime,
    versions: snapshot.versions,
    data: { snapshot },
  };
  const parsedAck = validateTurnSubmitAck(ack);
  assert.equal(parsedAck.ok, true);
  assert.equal(
    validateTurnSubmitAck({ ...ack, data: { snapshot, sessionToken } }).ok,
    false,
  );

  const finishedEvent = {
    kind: "game:finished",
    protocolVersion: PROTOCOL_VERSION,
    versions: snapshot.versions,
    serverTime: snapshot.serverTime,
    payload: {
      gameId: snapshot.game.gameId,
      reason: "RACK_EMPTY",
      winnerPlayerIds: snapshot.game.result.winnerPlayerIds,
      finalGameRevision: snapshot.versions.gameRevision,
      finishedAt: snapshot.game.result.finishedAt,
    },
  };
  const parsedEvent = validateGameFinishedEvent(finishedEvent);
  assert.equal(parsedEvent.ok, true);
  for (const reason of [
    "RACK_EMPTY",
    "TIME_LIMIT",
    "STALEMATE",
    "LAST_PLAYER_STANDING",
    "ALL_PLAYERS_FORFEITED",
  ] as const) {
    assert.equal(
      validateGameFinishedEvent({
        ...finishedEvent,
        payload: {
          ...finishedEvent.payload,
          reason,
          winnerPlayerIds:
            reason === "ALL_PLAYERS_FORFEITED"
              ? []
              : finishedEvent.payload.winnerPlayerIds,
        },
      }).ok,
      true,
      reason,
    );
  }
  assert.equal(
    validateGameFinishedEvent({
      ...finishedEvent,
      payload: { ...finishedEvent.payload, finalGameRevision: 2 },
    }).ok,
    false,
  );
  assert.equal(
    validateGameFinishedEvent({ ...finishedEvent, socketId: "socket_secret" })
      .ok,
    false,
  );

  const parsedCommand = validateTurnSubmitCommand(
    turnSubmitCommand({ wordGroups: [] }),
  );
  let acknowledged = false;
  const submitHandler: ClientToServerEvents["turn:submit"] = (
    command,
    acknowledge,
  ) => {
    assert.equal(command.kind, "turn:submit");
    if (parsedAck.ok) {
      acknowledge(parsedAck.value);
    }
  };
  const finishedListener: ServerToClientEvents["game:finished"] = (event) => {
    assert.equal(event.payload.reason, "RACK_EMPTY");
  };

  if (parsedCommand.ok) {
    submitHandler(parsedCommand.value, (received: TurnSubmitAck) => {
      acknowledged = received.ok;
    });
  }
  if (parsedEvent.ok) {
    finishedListener(parsedEvent.value);
  }
  assert.equal(acknowledged, true);
});

test("turn:draw는 선택 bag만 받고 turn:pass는 strict empty payload만 받는다", () => {
  for (const bagKind of ["CONSONANT", "VOWEL"] as const) {
    const command = turnDrawCommand(bagKind);
    const result = validateTurnDrawCommand(command);

    assert.equal(result.ok, true);
    assert.equal(validateClientCommand(command).ok, true);
    if (result.ok) {
      assert.equal(result.value.kind, "turn:draw");
      assert.equal(result.value.payload.bagKind, bagKind);
    }
  }

  const draw = turnDrawCommand("CONSONANT");
  for (const invalid of [
    turnDrawCommand("JOKER"),
    turnDrawCommand("consonant"),
    { ...draw, playerId: "player_spoofed" },
    { ...draw, expectedGameRevision: -1 },
    { ...draw, turnId: "" },
    { ...draw, payload: {} },
    { ...draw, payload: { bagKind: "CONSONANT", tileId: "tile_spoofed" } },
    { ...draw, payload: { bagKind: "CONSONANT", nextPlayerId: "player_456" } },
  ]) {
    assert.equal(validateTurnDrawCommand(invalid).ok, false);
  }

  const pass = turnPassCommand();
  const passResult = validateTurnPassCommand(pass);
  assert.equal(passResult.ok, true);
  assert.equal(validateClientCommand(pass).ok, true);
  if (passResult.ok) {
    assert.equal(passResult.value.kind, "turn:pass");
    assert.deepEqual(passResult.value.payload, {});
  }

  for (const invalid of [
    { ...pass, playerId: "player_spoofed" },
    { ...pass, expectedGameRevision: -1 },
    { ...pass, turnId: "" },
    { ...pass, payload: { bagKind: "CONSONANT" } },
    { ...pass, payload: { reason: "NO_MOVE" } },
  ]) {
    assert.equal(validateTurnPassCommand(invalid).ok, false);
  }

  assert.equal(validateTurnDrawCommand(pass).ok, false);
  assert.equal(validateTurnPassCommand(draw).ok, false);
});

test("Phase 14 draw/pass error code는 safe ErrorDto로 직렬화된다", () => {
  for (const code of ["BAG_EMPTY", "PASS_NOT_ALLOWED"] as const) {
    const result = validateErrorDto({
      code,
      message: "The requested turn action was not accepted.",
      recoverable: true,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.code, code);
    }
  }
});

test("turn:draw는 PLAYING, stalemate turn:pass는 PLAYING/FINISHED snapshot을 전달한다", () => {
  const snapshot = createPlayingSnapshot();
  const createAck = (requestId: string) => ({
    scope: "ROOM" as const,
    requestId,
    ok: true as const,
    serverTime: snapshot.serverTime,
    versions: snapshot.versions,
    data: { snapshot },
  });
  const drawAckResult = validateTurnDrawAck(createAck("request_draw_ack"));
  const passAckResult = validateTurnPassAck(createAck("request_pass_ack"));

  assert.equal(drawAckResult.ok, true);
  assert.equal(passAckResult.ok, true);

  assert.equal(
    validateTurnDrawAck({
      ...createAck("request_invalid_draw_phase_ack"),
      data: { snapshot: createFinishedSnapshot() },
    }).ok,
    false,
  );
  assert.equal(
    validateTurnPassAck({
      ...createAck("request_stalemate_ack"),
      data: { snapshot: createFinishedSnapshot() },
    }).ok,
    true,
  );

  for (const validate of [validateTurnDrawAck, validateTurnPassAck]) {
    assert.equal(
      validate({
        ...createAck("request_secret_ack"),
        data: { snapshot, sessionToken },
      }).ok,
      false,
    );
    assert.equal(
      validate({
        ...createAck("request_derived_ack"),
        data: { snapshot, drawnTileId: "tile_secret" },
      }).ok,
      false,
    );
  }

  const parsedDraw = validateTurnDrawCommand(turnDrawCommand("VOWEL"));
  const parsedPass = validateTurnPassCommand(turnPassCommand());
  let drawAcknowledged = false;
  let passAcknowledged = false;
  const drawHandler: ClientToServerEvents["turn:draw"] = (
    command,
    acknowledge,
  ) => {
    assert.equal(command.payload.bagKind, "VOWEL");
    if (drawAckResult.ok) {
      acknowledge(drawAckResult.value);
    }
  };
  const passHandler: ClientToServerEvents["turn:pass"] = (
    command,
    acknowledge,
  ) => {
    assert.deepEqual(command.payload, {});
    if (passAckResult.ok) {
      acknowledge(passAckResult.value);
    }
  };

  if (parsedDraw.ok) {
    drawHandler(parsedDraw.value, (received: TurnDrawAck) => {
      drawAcknowledged = received.ok;
    });
  }
  if (parsedPass.ok) {
    passHandler(parsedPass.value, (received: TurnPassAck) => {
      passAcknowledged = received.ok;
    });
  }

  assert.equal(drawAcknowledged, true);
  assert.equal(passAcknowledged, true);
});

test("room:leave command는 phase-aware revision과 strict empty payload를 강제한다", () => {
  const lobbyCommand = {
    kind: "room:leave",
    protocolVersion: PROTOCOL_VERSION,
    requestId: "request_leave_lobby",
    expectedRoomRevision: 4,
    expectedGameRevision: null,
    payload: {},
  };
  const playingCommand = {
    ...lobbyCommand,
    requestId: "request_leave_playing",
    expectedGameRevision: 7,
  };

  assert.equal(validateRoomLeaveCommand(lobbyCommand).ok, true);
  assert.equal(validateRoomLeaveCommand(playingCommand).ok, true);
  assert.equal(validateClientCommand(lobbyCommand).ok, true);

  const { expectedRoomRevision: _roomRevision, ...withoutRoomRevision } =
    lobbyCommand;
  const { expectedGameRevision: _gameRevision, ...withoutGameRevision } =
    lobbyCommand;
  for (const invalid of [
    withoutRoomRevision,
    withoutGameRevision,
    { ...lobbyCommand, expectedRoomRevision: -1 },
    { ...lobbyCommand, expectedGameRevision: -1 },
    { ...lobbyCommand, actorPlayerId: "player_spoofed" },
    { ...lobbyCommand, payload: { reason: "USER_REQUEST" } },
  ]) {
    assert.equal(validateRoomLeaveCommand(invalid).ok, false);
  }
});

test("room:leave acknowledgement는 terminal metadata만 허용한다", () => {
  const acknowledgement = {
    scope: "ROOM" as const,
    requestId: "request_leave_ack",
    ok: true as const,
    serverTime: 1_750_000_000_000,
    versions: {
      roomRevision: 5,
      gameRevision: null,
      presenceVersion: 8,
    },
    data: {
      roomId: "room_123",
      roomCode: "ABCD23",
      roomClosed: false,
    },
  };
  const parsed = validateRoomLeaveAck(acknowledgement);

  assert.equal(parsed.ok, true);
  assert.equal(
    validateRoomLeaveAck({
      ...acknowledgement,
      data: { ...acknowledgement.data, snapshot: createSnapshot() },
    }).ok,
    false,
  );
  assert.equal(
    validateRoomLeaveAck({
      ...acknowledgement,
      data: { ...acknowledgement.data, sessionToken },
    }).ok,
    false,
  );

  const command = validateRoomLeaveCommand({
    kind: "room:leave",
    protocolVersion: PROTOCOL_VERSION,
    requestId: acknowledgement.requestId,
    expectedRoomRevision: 4,
    expectedGameRevision: null,
    payload: {},
  });
  let acknowledged = false;
  const handler: ClientToServerEvents["room:leave"] = (
    received,
    acknowledge,
  ) => {
    assert.equal(received.expectedGameRevision, null);
    if (parsed.ok) {
      acknowledge(parsed.value);
    }
  };
  if (command.ok) {
    handler(command.value, (received: RoomLeaveAck) => {
      acknowledged = received.ok;
    });
  }
  assert.equal(acknowledged, true);
});

test("room:closed advisory event는 재사용 가능한 code와 불변 public Room identity를 함께 전달한다", () => {
  const event = {
    kind: "room:closed",
    protocolVersion: PROTOCOL_VERSION,
    serverTime: 1_750_000_000_000,
    payload: { roomId: "room_123", roomCode: "ABCD23" },
  };
  const parsed = validateRoomClosedEvent(event);

  assert.equal(parsed.ok, true);
  for (const invalid of [
    { ...event, payload: { roomCode: event.payload.roomCode } },
    { ...event, socketId: "socket_private" },
    { ...event, connectionGeneration: 2 },
    { ...event, payload: { ...event.payload, reason: "HOST_LEFT" } },
    { ...event, payload: { ...event.payload, sessionToken } },
  ]) {
    assert.equal(validateRoomClosedEvent(invalid).ok, false);
  }

  let delivered = false;
  const listener: ServerToClientEvents["room:closed"] = (received) => {
    delivered =
      received.payload.roomId === "room_123" &&
      received.payload.roomCode === "ABCD23";
  };
  if (parsed.ok) {
    listener(parsed.value);
  }
  assert.equal(delivered, true);
});

test("forfeited 공개 상태는 PLAYING과 FINISHED Player에만 존재한다", () => {
  const playing = createPlayingSnapshot();
  const finished = createFinishedSnapshot();
  const lobby = createSnapshot();

  assert.equal(validatePlayingStateSnapshot(playing).ok, true);
  assert.equal(validateFinishedStateSnapshot(finished).ok, true);
  assert.equal(
    validatePlayingStateSnapshot({
      ...playing,
      room: {
        ...playing.room,
        players: playing.room.players.map(
          ({ forfeited: _forfeited, ...player }) => player,
        ),
      },
    }).ok,
    false,
  );
  assert.equal(
    validateLobbyStateSnapshot({
      ...lobby,
      room: {
        ...lobby.room,
        players: lobby.room.players.map((player) => ({
          ...player,
          forfeited: false,
        })),
      },
    }).ok,
    false,
  );
});

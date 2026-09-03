import * as v from "valibot";

import {
  BootstrapCredentialSchema,
  BootstrapSessionAckSchema,
  BrowserStoredPlayerSessionSchema,
  BoundPlayerCredentialSchema,
  ClientCommandSchema,
  ErrorDtoSchema,
  PROTOCOL_VERSION,
  ProtocolVersionSchema,
  RevisionSchema,
  SessionReplacedNotificationSchema,
  StateVersionsSchema,
  createRoomScopedAckSchema,
  createUnscopedAckSchema,
  type ErrorDto,
  type GameStartCommand,
  type KnownClientCommand,
  type ProtocolErrorCode,
  type RoomCreateCommand,
  type RoomJoinCommand,
  type SessionBootstrapCommand,
  type SessionResumeCommand,
  type StateSyncCommand,
  type TurnDrawCommand,
  type TurnPassCommand,
  type TurnSubmitCommand,
} from "./protocol.js";
import {
  GameFinishedEventSchema,
  GameStartAckSchema,
  RoomCreateAckSchema,
  RoomJoinAckSchema,
  SessionBootstrapAckSchema,
  SessionResumeAckSchema,
  StateSnapshotDeliveryDataSchema,
  StateSnapshotEventSchema,
  StateSyncAckSchema,
  TurnStartedEventSchema,
  TurnDrawAckSchema,
  TurnPassAckSchema,
  TurnSubmitAckSchema,
} from "./realtime.js";
import {
  NicknameSchema,
  RequestIdSchema,
  RoomCodeSchema,
} from "./identifiers.js";
import {
  LobbyStateSnapshotSchema,
  FinishedStateSnapshotSchema,
  PlayingStateSnapshotSchema,
  StateSnapshotSchema,
  type LobbyStateSnapshot,
  type FinishedStateSnapshot,
  type PlayingStateSnapshot,
  type StateSnapshot,
} from "./projections.js";

export type RuntimeValidationResult<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; error: ErrorDto };

function validationError(
  code: ProtocolErrorCode,
  message: string,
  recoverable: boolean,
): ErrorDto {
  return { code, message, recoverable };
}

function validateSchema<
  const TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  schema: TSchema,
  input: unknown,
  error: ErrorDto,
): RuntimeValidationResult<v.InferOutput<TSchema>> {
  const result = v.safeParse(schema, input);

  if (!result.success) {
    return { ok: false, error };
  }

  return { ok: true, value: result.output };
}

export function validateNickname(input: unknown) {
  return validateSchema(
    NicknameSchema,
    input,
    validationError("NICKNAME_INVALID", "Nickname is invalid.", true),
  );
}

export function validateRoomCode(input: unknown) {
  return validateSchema(
    RoomCodeSchema,
    input,
    validationError("ROOM_CODE_INVALID", "Room code is invalid.", true),
  );
}

export function validateRequestId(input: unknown) {
  return validateSchema(
    RequestIdSchema,
    input,
    validationError("INVALID_PAYLOAD", "Request ID is invalid.", false),
  );
}

export function validateRevision(input: unknown) {
  return validateSchema(
    RevisionSchema,
    input,
    validationError("INVALID_PAYLOAD", "Revision is invalid.", false),
  );
}

export function validateProtocolVersion(input: unknown) {
  if (typeof input === "number" && Number.isInteger(input)) {
    if (input !== PROTOCOL_VERSION) {
      return {
        ok: false,
        error: validationError(
          "INCOMPATIBLE_PROTOCOL",
          "Protocol version is not supported.",
          false,
        ),
      } satisfies RuntimeValidationResult<never>;
    }
  }

  return validateSchema(
    ProtocolVersionSchema,
    input,
    validationError("INVALID_PAYLOAD", "Protocol version is invalid.", false),
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function hasInvalidNickname(input: Record<string, unknown>): boolean {
  if (input.kind !== "room:create" && input.kind !== "room:join") {
    return false;
  }

  if (!isRecord(input.payload)) {
    return false;
  }

  return !v.safeParse(NicknameSchema, input.payload.nickname).success;
}

function hasInvalidRoomCode(input: Record<string, unknown>): boolean {
  if (!isRecord(input.payload)) {
    return false;
  }

  if (input.kind === "room:join") {
    return !v.safeParse(RoomCodeSchema, input.payload.roomCode).success;
  }

  if (input.kind !== "session:resume") {
    return false;
  }

  if (!isRecord(input.payload.credential)) {
    return false;
  }

  return !v.safeParse(
    RoomCodeSchema,
    input.payload.credential.roomCode,
  ).success;
}

export function validateClientCommand(
  input: unknown,
): RuntimeValidationResult<KnownClientCommand> {
  if (isRecord(input)) {
    const protocolResult = validateProtocolVersion(input.protocolVersion);

    if (!protocolResult.ok) {
      return protocolResult;
    }

    if (hasInvalidNickname(input)) {
      return {
        ok: false,
        error: validationError(
          "NICKNAME_INVALID",
          "Nickname is invalid.",
          true,
        ),
      };
    }

    if (hasInvalidRoomCode(input)) {
      return {
        ok: false,
        error: validationError(
          "ROOM_CODE_INVALID",
          "Room code is invalid.",
          true,
        ),
      };
    }
  }

  return validateSchema(
    ClientCommandSchema,
    input,
    validationError("INVALID_PAYLOAD", "Command payload is invalid.", false),
  );
}

export function validateSessionBootstrapCommand(
  input: unknown,
): RuntimeValidationResult<SessionBootstrapCommand> {
  const result = validateClientCommand(input);

  if (!result.ok) {
    return result;
  }

  if (result.value.kind !== "session:bootstrap") {
    return {
      ok: false,
      error: validationError(
        "INVALID_PAYLOAD",
        "Session bootstrap command is invalid.",
        false,
      ),
    } satisfies RuntimeValidationResult<never>;
  }

  return { ok: true, value: result.value };
}

export function validateRoomCreateCommand(
  input: unknown,
): RuntimeValidationResult<RoomCreateCommand> {
  const result = validateClientCommand(input);

  if (!result.ok) {
    return result;
  }

  if (result.value.kind !== "room:create") {
    return {
      ok: false,
      error: validationError(
        "INVALID_PAYLOAD",
        "Room create command is invalid.",
        false,
      ),
    } satisfies RuntimeValidationResult<never>;
  }

  return { ok: true, value: result.value };
}

export function validateRoomJoinCommand(
  input: unknown,
): RuntimeValidationResult<RoomJoinCommand> {
  const result = validateClientCommand(input);

  if (!result.ok) {
    return result;
  }

  if (result.value.kind !== "room:join") {
    return {
      ok: false,
      error: validationError(
        "INVALID_PAYLOAD",
        "Room join command is invalid.",
        false,
      ),
    } satisfies RuntimeValidationResult<never>;
  }

  return { ok: true, value: result.value };
}

export function validateSessionResumeCommand(
  input: unknown,
): RuntimeValidationResult<SessionResumeCommand> {
  const result = validateClientCommand(input);

  if (!result.ok) {
    return result;
  }

  if (result.value.kind !== "session:resume") {
    return {
      ok: false,
      error: validationError(
        "INVALID_PAYLOAD",
        "Session resume command is invalid.",
        false,
      ),
    } satisfies RuntimeValidationResult<never>;
  }

  return { ok: true, value: result.value };
}

export function validateStateSyncCommand(
  input: unknown,
): RuntimeValidationResult<StateSyncCommand> {
  const result = validateClientCommand(input);

  if (!result.ok) {
    return result;
  }

  if (result.value.kind !== "state:sync") {
    return {
      ok: false,
      error: validationError(
        "INVALID_PAYLOAD",
        "State sync command is invalid.",
        false,
      ),
    } satisfies RuntimeValidationResult<never>;
  }

  return { ok: true, value: result.value };
}

export function validateGameStartCommand(
  input: unknown,
): RuntimeValidationResult<GameStartCommand> {
  const result = validateClientCommand(input);

  if (!result.ok) {
    return result;
  }

  if (result.value.kind !== "game:start") {
    return {
      ok: false,
      error: validationError(
        "INVALID_PAYLOAD",
        "Game start command is invalid.",
        false,
      ),
    } satisfies RuntimeValidationResult<never>;
  }

  return { ok: true, value: result.value };
}

export function validateTurnSubmitCommand(
  input: unknown,
): RuntimeValidationResult<TurnSubmitCommand> {
  const result = validateClientCommand(input);

  if (!result.ok) {
    return result;
  }

  if (result.value.kind !== "turn:submit") {
    return {
      ok: false,
      error: validationError(
        "INVALID_PAYLOAD",
        "Turn submit command is invalid.",
        false,
      ),
    } satisfies RuntimeValidationResult<never>;
  }

  return { ok: true, value: result.value };
}

export function validateTurnDrawCommand(
  input: unknown,
): RuntimeValidationResult<TurnDrawCommand> {
  const result = validateClientCommand(input);

  if (!result.ok) {
    return result;
  }

  if (result.value.kind !== "turn:draw") {
    return {
      ok: false,
      error: validationError(
        "INVALID_PAYLOAD",
        "Turn draw command is invalid.",
        false,
      ),
    } satisfies RuntimeValidationResult<never>;
  }

  return { ok: true, value: result.value };
}

export function validateTurnPassCommand(
  input: unknown,
): RuntimeValidationResult<TurnPassCommand> {
  const result = validateClientCommand(input);

  if (!result.ok) {
    return result;
  }

  if (result.value.kind !== "turn:pass") {
    return {
      ok: false,
      error: validationError(
        "INVALID_PAYLOAD",
        "Turn pass command is invalid.",
        false,
      ),
    } satisfies RuntimeValidationResult<never>;
  }

  return { ok: true, value: result.value };
}

export function validateStateVersions(input: unknown) {
  return validateSchema(
    StateVersionsSchema,
    input,
    validationError("INVALID_PAYLOAD", "State versions are invalid.", false),
  );
}

export function validateBootstrapCredential(input: unknown) {
  return validateSchema(
    BootstrapCredentialSchema,
    input,
    validationError("UNAUTHENTICATED", "Bootstrap credential is invalid.", false),
  );
}

export function validateBoundPlayerCredential(input: unknown) {
  return validateSchema(
    BoundPlayerCredentialSchema,
    input,
    validationError("UNAUTHENTICATED", "Player credential is invalid.", false),
  );
}

export function validateBrowserStoredPlayerSession(input: unknown) {
  return validateSchema(
    BrowserStoredPlayerSessionSchema,
    input,
    validationError("SESSION_NOT_FOUND", "Stored player session is invalid.", false),
  );
}

export function validateUnscopedAck<
  const TDataSchema extends v.BaseSchema<
    unknown,
    unknown,
    v.BaseIssue<unknown>
  >,
>(input: unknown, dataSchema: TDataSchema) {
  return validateSchema(
    createUnscopedAckSchema(dataSchema),
    input,
    validationError("INVALID_PAYLOAD", "Unscoped acknowledgement is invalid.", false),
  );
}

export function validateRoomScopedAck<
  const TDataSchema extends v.BaseSchema<
    unknown,
    unknown,
    v.BaseIssue<unknown>
  >,
>(input: unknown, dataSchema: TDataSchema) {
  return validateSchema(
    createRoomScopedAckSchema(dataSchema),
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Room-scoped acknowledgement is invalid.",
      false,
    ),
  );
}

export function validateBootstrapSessionAck(input: unknown) {
  return validateSchema(
    BootstrapSessionAckSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Bootstrap acknowledgement is invalid.",
      false,
    ),
  );
}

export function validateSessionBootstrapAck(input: unknown) {
  return validateSchema(
    SessionBootstrapAckSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Session bootstrap transport acknowledgement is invalid.",
      false,
    ),
  );
}

export function validateRoomCreateAck(input: unknown) {
  return validateSchema(
    RoomCreateAckSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Room create acknowledgement is invalid.",
      false,
    ),
  );
}

export function validateRoomJoinAck(input: unknown) {
  return validateSchema(
    RoomJoinAckSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Room join acknowledgement is invalid.",
      false,
    ),
  );
}

export function validateSessionResumeAck(input: unknown) {
  return validateSchema(
    SessionResumeAckSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Session resume acknowledgement is invalid.",
      false,
    ),
  );
}

export function validateStateSyncAck(input: unknown) {
  return validateSchema(
    StateSyncAckSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "State sync acknowledgement is invalid.",
      false,
    ),
  );
}

export function validateGameStartAck(input: unknown) {
  return validateSchema(
    GameStartAckSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Game start acknowledgement is invalid.",
      false,
    ),
  );
}

export function validateTurnSubmitAck(input: unknown) {
  return validateSchema(
    TurnSubmitAckSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Turn submit acknowledgement is invalid.",
      false,
    ),
  );
}

export function validateTurnDrawAck(input: unknown) {
  return validateSchema(
    TurnDrawAckSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Turn draw acknowledgement is invalid.",
      false,
    ),
  );
}

export function validateTurnPassAck(input: unknown) {
  return validateSchema(
    TurnPassAckSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Turn pass acknowledgement is invalid.",
      false,
    ),
  );
}

export function validateErrorDto(input: unknown) {
  return validateSchema(
    ErrorDtoSchema,
    input,
    validationError("INVALID_PAYLOAD", "Error response is invalid.", false),
  );
}

export function validateStateSnapshot(
  input: unknown,
): RuntimeValidationResult<StateSnapshot> {
  return validateSchema(
    StateSnapshotSchema,
    input,
    validationError("INVALID_PAYLOAD", "State snapshot is invalid.", false),
  );
}

export function validateLobbyStateSnapshot(
  input: unknown,
): RuntimeValidationResult<LobbyStateSnapshot> {
  return validateSchema(
    LobbyStateSnapshotSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Lobby state snapshot is invalid.",
      false,
    ),
  );
}

export function validatePlayingStateSnapshot(
  input: unknown,
): RuntimeValidationResult<PlayingStateSnapshot> {
  return validateSchema(
    PlayingStateSnapshotSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Playing state snapshot is invalid.",
      false,
    ),
  );
}

export function validateFinishedStateSnapshot(
  input: unknown,
): RuntimeValidationResult<FinishedStateSnapshot> {
  return validateSchema(
    FinishedStateSnapshotSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Finished state snapshot is invalid.",
      false,
    ),
  );
}

export function validateStateSnapshotDeliveryData(input: unknown) {
  return validateSchema(
    StateSnapshotDeliveryDataSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "State snapshot delivery data is invalid.",
      false,
    ),
  );
}

export function validateStateSnapshotEvent(input: unknown) {
  return validateSchema(
    StateSnapshotEventSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "State snapshot event is invalid.",
      false,
    ),
  );
}

export function validateTurnStartedEvent(input: unknown) {
  return validateSchema(
    TurnStartedEventSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Turn started event is invalid.",
      false,
    ),
  );
}

export function validateGameFinishedEvent(input: unknown) {
  return validateSchema(
    GameFinishedEventSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Game finished event is invalid.",
      false,
    ),
  );
}

export function validateSessionReplacedNotification(input: unknown) {
  return validateSchema(
    SessionReplacedNotificationSchema,
    input,
    validationError(
      "INVALID_PAYLOAD",
      "Session replacement notification is invalid.",
      false,
    ),
  );
}

import * as v from "valibot";

import {
  NICKNAME_MAX_CODE_POINTS,
  NICKNAME_MIN_CODE_POINTS,
  ROOM_CODE_LENGTH,
} from "./policies.js";

/** Transport resource limits; generated identifiers are currently at most 43 characters. */
export const OPAQUE_IDENTIFIER_MAX_LENGTH = 128;
export const SESSION_TOKEN_MAX_LENGTH = 512;

const OpaqueIdentifierValueSchema = v.pipe(
  v.string(),
  v.nonEmpty("Identifier must not be empty."),
  v.maxLength(
    OPAQUE_IDENTIFIER_MAX_LENGTH,
    "Identifier exceeds the transport length limit.",
  ),
);

export const RoomIdSchema = v.pipe(
  OpaqueIdentifierValueSchema,
  v.brand("RoomId"),
);
export type RoomId = v.InferOutput<typeof RoomIdSchema>;

export const PlayerIdSchema = v.pipe(
  OpaqueIdentifierValueSchema,
  v.brand("PlayerId"),
);
export type PlayerId = v.InferOutput<typeof PlayerIdSchema>;

export const GameIdSchema = v.pipe(
  OpaqueIdentifierValueSchema,
  v.brand("GameId"),
);
export type GameId = v.InferOutput<typeof GameIdSchema>;

export const TurnIdSchema = v.pipe(
  OpaqueIdentifierValueSchema,
  v.brand("TurnId"),
);
export type TurnId = v.InferOutput<typeof TurnIdSchema>;

export const TileIdSchema = v.pipe(
  OpaqueIdentifierValueSchema,
  v.brand("TileId"),
);
export type TileId = v.InferOutput<typeof TileIdSchema>;

export const RequestIdSchema = v.pipe(
  OpaqueIdentifierValueSchema,
  v.brand("RequestId"),
);
export type RequestId = v.InferOutput<typeof RequestIdSchema>;

export const SessionTokenSchema = v.pipe(
  v.string(),
  v.nonEmpty("Session token must not be empty."),
  v.maxLength(
    SESSION_TOKEN_MAX_LENGTH,
    "Session token exceeds the transport length limit.",
  ),
  v.regex(/^\S+$/u, "Session token must not contain whitespace."),
  v.brand("SessionToken"),
);
export type SessionToken = v.InferOutput<typeof SessionTokenSchema>;

export const NicknameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.normalize("NFC"),
  v.check((nickname) => {
    const codePointLength = Array.from(nickname).length;

    return (
      codePointLength >= NICKNAME_MIN_CODE_POINTS &&
      codePointLength <= NICKNAME_MAX_CODE_POINTS
    );
  }, "Nickname must contain between 1 and 12 Unicode code points."),
  v.regex(
    /^[\p{L}\p{N}_]+$/u,
    "Nickname may contain only Unicode letters, numbers, and underscore.",
  ),
  v.brand("Nickname"),
);
export type Nickname = v.InferOutput<typeof NicknameSchema>;

export const RoomCodeSchema = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^[A-Za-z0-9]+$/u, "Room code input must be ASCII alphanumeric."),
  v.toUpperCase(),
  v.length(ROOM_CODE_LENGTH, "Room code must contain exactly 6 characters."),
  v.regex(
    /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/u,
    "Room code contains an excluded or invalid character.",
  ),
  v.brand("RoomCode"),
);
export type RoomCode = v.InferOutput<typeof RoomCodeSchema>;

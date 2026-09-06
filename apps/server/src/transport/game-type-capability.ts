import {
  resolveSupportedGameTypesCapability,
  type GameType,
} from "@hangul-rummikub/shared";

export const GAME_TYPE_CAPABILITY_ERROR_MESSAGE = "INVALID_GAME_CAPABILITY";

export type GameTypeCapabilityNegotiationResult =
  | Readonly<{
      ok: true;
      mode: "LEGACY_DEFAULT" | "EXPLICIT";
      supportedGameTypes: readonly GameType[];
    }>
  | Readonly<{ ok: false }>;

/** Connection-scoped parsing only; this metadata grants no game authority. */
export function negotiateGameTypeCapability(
  handshakeAuth: unknown,
): GameTypeCapabilityNegotiationResult {
  return resolveSupportedGameTypesCapability(handshakeAuth);
}

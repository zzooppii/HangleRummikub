import {
  PROTOCOL_VERSION,
  type GameRevision,
  type GemCardPlayingPlatformSnapshotV2,
  type GemCollectCommand,
  type GemCollectSelectionDto,
  type GemMarketSourceDto,
  type GemPurchaseCommand,
  type GemPurchaseSourceDto,
  type GemReserveCommand,
  type GemYieldCommand,
  type ProtocolErrorCode,
  type RequestId,
  type TurnId,
} from "@hangul-rummikub/shared";
import { markRequestFeedbackSeen } from "../../lib/request-feedback.js";

export type GemCardActionKind = "COLLECT" | "PURCHASE" | "RESERVE" | "YIELD";
export type PendingGemCardCommand = GemCollectCommand | GemPurchaseCommand |
  GemReserveCommand | GemYieldCommand;
export type GemCardActionFeedback = Readonly<{
  requestId: RequestId;
  kind: GemCardActionKind;
  message: string;
}>;

// Request preparation does not calculate payment, resource changes or legality.
// Detached/frozen payloads keep a lost-ack retry independent of later UI edits.
export function createGemCollectCommand(
  selection: GemCollectSelectionDto,
  expectedGameRevision: GameRevision,
  turnId: TurnId,
  createId: () => RequestId,
): GemCollectCommand {
  const detached: GemCollectSelectionDto = selection.kind === "PRISM"
    ? { kind: "PRISM" }
    : { kind: "BASIC", resources: [...selection.resources] };
  if (detached.kind === "BASIC") Object.freeze(detached.resources);
  return Object.freeze({
    kind: "gem:collect", protocolVersion: PROTOCOL_VERSION,
    requestId: createId(), expectedGameRevision, turnId,
    payload: Object.freeze({ selection: Object.freeze(detached) }),
  });
}

export function createGemPurchaseCommand(
  source: GemPurchaseSourceDto,
  expectedGameRevision: GameRevision,
  turnId: TurnId,
  createId: () => RequestId,
): GemPurchaseCommand {
  const detached: GemPurchaseSourceDto = source.kind === "MARKET"
    ? { kind: "MARKET", tier: source.tier, slotIndex: source.slotIndex }
    : { kind: "RESERVED", cardId: source.cardId };
  return Object.freeze({
    kind: "gem:purchase", protocolVersion: PROTOCOL_VERSION,
    requestId: createId(), expectedGameRevision, turnId,
    payload: Object.freeze({ source: Object.freeze(detached) }),
  });
}

export function createGemReserveCommand(
  source: GemMarketSourceDto,
  expectedGameRevision: GameRevision,
  turnId: TurnId,
  createId: () => RequestId,
): GemReserveCommand {
  return Object.freeze({
    kind: "gem:reserve", protocolVersion: PROTOCOL_VERSION,
    requestId: createId(), expectedGameRevision, turnId,
    payload: Object.freeze({ source: Object.freeze({
      tier: source.tier, slotIndex: source.slotIndex,
    }) }),
  });
}

export function createGemYieldCommand(
  expectedGameRevision: GameRevision,
  turnId: TurnId,
  createId: () => RequestId,
): GemYieldCommand {
  return Object.freeze({
    kind: "gem:yield", protocolVersion: PROTOCOL_VERSION,
    requestId: createId(), expectedGameRevision, turnId,
    payload: Object.freeze({}),
  });
}

export function gemCardCommandKind(command: PendingGemCardCommand): GemCardActionKind {
  switch (command.kind) {
    case "gem:collect": return "COLLECT";
    case "gem:purchase": return "PURCHASE";
    case "gem:reserve": return "RESERVE";
    case "gem:yield": return "YIELD";
  }
}

export function gemCardActionFeedback(
  command: PendingGemCardCommand,
  announcedRequestIds: Set<RequestId>,
): GemCardActionFeedback | null {
  if (!markRequestFeedbackSeen(announcedRequestIds, command.requestId)) return null;
  const kind = gemCardCommandKind(command);
  const messages: Record<GemCardActionKind, string> = {
    COLLECT: "자원을 받았습니다.", PURCHASE: "카드를 구매했습니다.",
    RESERVE: "카드를 예약했습니다.", YIELD: "행동 없이 턴을 마쳤습니다.",
  };
  return { kind, requestId: command.requestId, message: messages[kind] };
}

export function gemSnapshotSupersedesCommand(
  command: PendingGemCardCommand,
  snapshot: Pick<GemCardPlayingPlatformSnapshotV2, "game"> | null,
): boolean {
  return snapshot === null ||
    snapshot.game.gameRevision > command.expectedGameRevision ||
    snapshot.game.turn.turnId !== command.turnId;
}

export function shouldResetGemSelectionAfterFailure(
  code: ProtocolErrorCode,
  acknowledgedGameRevision: GameRevision | null,
  expectedGameRevision: GameRevision,
): boolean {
  return ["STALE_GAME_REVISION", "NOT_YOUR_TURN", "TURN_EXPIRED", "INVALID_PHASE",
    "UNAUTHENTICATED", "CARD_NOT_AVAILABLE"].includes(code) ||
    (acknowledgedGameRevision !== null && acknowledgedGameRevision !== expectedGameRevision);
}

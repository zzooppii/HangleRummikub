import { PROTOCOL_VERSION, validateCityClientCommand, type CityClientCommand, type CityRolePlayingPlatformSnapshotV2, type RequestId, type CityActionWireAck, type ProtocolErrorCode } from "@hangul-rummikub/shared";
import { markRequestFeedbackSeen } from "../../lib/request-feedback.js";
import { getUserErrorMessage } from "../../lib/error-messages.js";
import type { CityImpact, CityImpactSnapshot } from "./city-impact.js";

type Intent<T> = T extends CityClientCommand ? Pick<T, "kind" | "payload"> : never;
/** CITY-only UI choice; it contains no canonical replacement state. */
export type CityActionIntent = Intent<CityClientCommand>;
export type CityActionFeedback = Readonly<{ requestId: RequestId; kind: CityClientCommand["kind"]; message: string;
  impact?: Readonly<{ gameId: string; revision: number; event: CityImpact }> }>;

export function cityErrorMessage(code: ProtocolErrorCode): string {
  if (code === "CARD_NOT_AVAILABLE") return "현재 사용할 수 없는 카드입니다. 최신 상태를 다시 확인해주세요.";
  if (code === "RULE_VIOLATION") return "현재 단계에서 사용할 수 없는 행동입니다. 획득·선택·건설 조건을 확인해주세요.";
  return getUserErrorMessage(code);
}

export function createCityCommand(intent: CityActionIntent, snapshot: CityRolePlayingPlatformSnapshotV2, createId: () => RequestId): CityClientCommand {
  const candidate = validateCityClientCommand({ ...intent, protocolVersion: PROTOCOL_VERSION, requestId: createId(),
    gameId: snapshot.game.gameId, actionId: snapshot.game.window.actionId, expectedGameRevision: snapshot.game.gameRevision });
  if (!candidate.ok) throw new Error("Invalid CITY action choice.");
  const command = candidate.value;
  if (command.kind === "city:useRoleAbility" && command.payload.ability === "REPLACE_OWN_CARDS") Object.freeze(command.payload.cardIds);
  Object.freeze(command.payload);
  return Object.freeze(command);
}

export function cityReceiptMatches(command: CityClientCommand, ack: CityActionWireAck): boolean {
  return !ack.ok || (ack.data.gameId === command.gameId && ack.data.committedGameRevision === command.expectedGameRevision + 1 &&
    ack.versions.gameRevision !== null && ack.versions.gameRevision >= ack.data.committedGameRevision);
}

export function cityActionFeedback(command: CityClientCommand, seen: Set<RequestId>, snapshot?: Readonly<{ room: { players: CityImpactSnapshot["room"]["players"] } }>): CityActionFeedback | null {
  if (!markRequestFeedbackSeen(seen, command.requestId)) return null;
  const messages: Record<CityClientCommand["kind"], string> = {
    "city:selectRole": "역할을 비밀리에 선택했습니다.", "city:takeIncome": "금화 2개를 받았습니다.",
    "city:drawBuildingCards": "카드 보기 요청이 처리되었습니다. 현재 단계 안내를 확인하세요.", "city:chooseBuildingCard": "선택한 카드를 손패에 넣었습니다.",
    "city:useRoleAbility": "역할 능력을 사용했습니다.", "city:build": "건물을 건설했습니다.", "city:endTurn": "역할 차례를 마쳤습니다.",
  };
  let event: CityImpact | undefined;
  const id = `${command.gameId}:ack:${command.requestId}`;
  if (command.kind === "city:useRoleAbility") {
    if (command.payload.ability === "MARK_ROLE_DISABLED" || command.payload.ability === "MARK_ROLE_GOLD_TRANSFER") event = { id, cue: "TICK", intensity: "small", message: "비밀 지목이 접수되었습니다. 효과는 해당 역할이 진행될 때 판정됩니다." };
    if (command.payload.ability === "REPLACE_OWN_CARDS") event = { id, cue: "SHUFFLE", intensity: "medium", message: `카드 ${command.payload.cardIds.length}장을 새 카드로 교환했습니다.` };
    if (command.payload.ability === "EXCHANGE_HANDS") {
      const target = command.payload.targetPlayerId;
      const name = snapshot?.room.players.find(p => p.playerId === target)?.nickname ?? "상대";
      event = { id, cue: "SHUFFLE", intensity: "medium", message: `${name}님과 손패 전체를 교환했습니다.` };
    }
  } else if (command.kind === "city:takeIncome") event = { id, cue: "COIN_GAIN", intensity: "small", message: "기본 획득으로 금화 2개를 받았습니다." };
  else if (command.kind === "city:chooseBuildingCard") event = { id, cue: "DRAW", intensity: "small", message: "선택한 건물 카드를 손패에 넣었습니다." };
  else if (command.kind === "city:drawBuildingCards") event = { id, cue: "DRAW", intensity: "small", message: "건물 카드가 준비되었습니다. 가져갈 카드를 선택하세요." };
  else if (command.kind === "city:selectRole") event = { id, cue: "TICK", intensity: "small", message: "역할을 비밀리에 선택했습니다." };
  return { requestId: command.requestId, kind: command.kind, message: messages[command.kind],
    ...(event ? { impact: { gameId: command.gameId, revision: command.expectedGameRevision + 1, event } } : {}) };
}

/** A failed attempt is actor-private. The message states only already-public protection. */
export function cityProtectionRejection(command: CityClientCommand, code: ProtocolErrorCode, snapshot: CityImpactSnapshot): CityActionFeedback | null {
  if (code !== "RULE_VIOLATION" || command.kind !== "city:useRoleAbility" || command.payload.ability !== "DESTROY_BUILDING" || snapshot.game.phase !== "ROLE_ACTION" ||
    snapshot.game.gameId !== command.gameId || snapshot.game.window.activePlayerId !== snapshot.self.playerId || snapshot.game.window.actionId !== command.actionId ||
    !snapshot.game.protectedPlayerIds.includes(command.payload.targetPlayerId)) return null;
  const message = "이 도시는 현재 보호받고 있습니다.";
  return { requestId: command.requestId, kind: command.kind, message, impact: { gameId: command.gameId, revision: snapshot.game.gameRevision,
    event: { id: `${command.gameId}:reject:${command.requestId}`, cue: "SHIELD", intensity: "medium", message, cardId: command.payload.cardId } } };
}

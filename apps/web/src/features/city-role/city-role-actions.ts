import { PROTOCOL_VERSION, validateCityClientCommand, type CityClientCommand, type CityRolePlayingPlatformSnapshotV2, type RequestId, type CityActionWireAck, type ProtocolErrorCode } from "@hangul-rummikub/shared";
import { markRequestFeedbackSeen } from "../../lib/request-feedback.js";
import { getUserErrorMessage } from "../../lib/error-messages.js";

type Intent<T> = T extends CityClientCommand ? Pick<T, "kind" | "payload"> : never;
/** CITY-only UI choice; it contains no canonical replacement state. */
export type CityActionIntent = Intent<CityClientCommand>;
export type CityActionFeedback = Readonly<{ requestId: RequestId; kind: CityClientCommand["kind"]; message: string }>;

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

export function cityActionFeedback(command: CityClientCommand, seen: Set<RequestId>): CityActionFeedback | null {
  if (!markRequestFeedbackSeen(seen, command.requestId)) return null;
  const messages: Record<CityClientCommand["kind"], string> = {
    "city:selectRole": "역할을 비밀리에 선택했습니다.", "city:takeIncome": "금화 2개를 받았습니다.",
    "city:drawBuildingCards": "카드 보기 요청이 처리되었습니다. 현재 단계 안내를 확인하세요.", "city:chooseBuildingCard": "선택한 카드를 손패에 넣었습니다.",
    "city:useRoleAbility": "역할 능력을 사용했습니다.", "city:build": "건물을 건설했습니다.", "city:endTurn": "역할 차례를 마쳤습니다.",
  };
  return { requestId: command.requestId, kind: command.kind, message: messages[command.kind] };
}

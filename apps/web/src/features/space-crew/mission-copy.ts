/** Original Korean summaries of the audited basic-game missions; no private game data. */
export type SpaceCrewMissionCopy = Readonly<{
  title: string; objective: string; setupNotes: readonly string[];
  communicationNote: string; completionNote: string; fivePlayerTransfer: boolean;
}>;
export type SpaceCrewUiCommunication =
  | Readonly<{ kind: "NORMAL" | "DEAD_ZONE" | "NOMINEE_FORBIDDEN" }>
  | Readonly<{ kind: "DISRUPTION"; fromTrick: 2 | 3 }>;
const DEAD_ZONE = new Set([6, 14, 21, 25, 29, 39]);
const TRANSFER = new Set([25, 27, 28, 30, 31, 32, 35, 36, 37, 38, 39, 40, 42, 43, 45, 47, 48, 49]);
const EXHAUSTION = new Set([5, 16, 29, 33, 34, 41, 48, 50]);
const DECISION = new Set([20, 27, 37]);
const DISTRIBUTION = new Set([24, 32, 36, 43]);
const TASK_COUNTS = [1, 2, 2, 3, 0, 3, 3, 3, 0, 4, 4, 4, 0, 4, 4, 0, 2, 5, 5, 2, 5, 5, 5, 6, 6, 0, 3, 6, 0, 6, 6, 7, 0, 0, 7, 7, 4, 8, 8, 8, 0, 9, 9, 0, 9, 0, 10, 3, 10, 0] as const;
const ORDER_NOTES: Readonly<Partial<Record<number, string>>> = {
  3: "숫자 1·2 목표를 전체 목표 중 각각 첫째·둘째로 완료합니다.",
  6: "화살표 I 목표를 II 목표보다 먼저 완료합니다.",
  7: "Ω 목표를 모든 목표 중 마지막으로 완료합니다.",
  8: "숫자 1·2·3 목표를 전체 목표 중 해당 순서에 완료합니다.",
  11: "숫자 1 목표를 가장 먼저 완료합니다.",
  12: "Ω 목표를 모든 목표 중 마지막으로 완료합니다.",
  14: "화살표 I → II → III 순서를 지킵니다. 다른 목표는 사이에 완료해도 됩니다.",
  15: "숫자 1·2·3·4 목표를 전체 목표 중 해당 순서에 완료합니다.",
  19: "숫자 1 목표를 가장 먼저 완료합니다.",
  21: "숫자 1·2 목표를 전체 목표 중 각각 첫째·둘째로 완료합니다.",
  22: "화살표 I → II → III → IV 순서를 지킵니다. 다른 목표는 사이에 완료해도 됩니다.",
  23: "숫자 1·2·3·4·5 목표를 전체 목표 중 해당 순서에 완료합니다.",
  25: "화살표 I 목표를 II 목표보다 먼저 완료합니다.",
  28: "숫자 1 목표를 가장 먼저, Ω 목표를 가장 마지막에 완료합니다.",
  30: "화살표 I → II → III 순서를 지킵니다. 다른 목표는 사이에 완료해도 됩니다.",
  31: "숫자 1·2·3 목표를 전체 목표 중 해당 순서에 완료합니다.",
  35: "화살표 I → II → III 순서를 지킵니다. 다른 목표는 사이에 완료해도 됩니다.",
  36: "숫자 1·2 목표를 전체 목표 중 각각 첫째·둘째로 완료합니다.",
  39: "화살표 I → II → III 순서를 지킵니다. 다른 목표는 사이에 완료해도 됩니다.",
  40: "숫자 1·2·3 목표를 전체 목표 중 해당 순서에 완료합니다.",
  45: "화살표 I → II → III 순서를 지킵니다. 다른 목표는 사이에 완료해도 됩니다.",
  48: "Ω 목표를 모든 목표 중 마지막이면서 이번 시도의 마지막 트릭에 완료합니다.",
  49: "화살표 I → II → III 순서를 지킵니다. 다른 목표는 사이에 완료해도 됩니다.",
};
const OBJECTIVES: Readonly<Partial<Record<number, string>>> = {
  5: "지명된 승무원이 트릭을 한 번도 이기지 않아야 합니다.",
  9: "색상 1 카드로 트릭을 한 번 이겨야 합니다.",
  13: "로켓 1·2·3·4가 각각 트릭의 승리 카드가 되어야 합니다.",
  16: "색상 9 카드가 한 번도 트릭의 승리 카드가 되면 안 됩니다.",
  17: "목표 2개를 완료할 때까지 색상 9 카드로 트릭을 이기면 안 됩니다.",
  26: "서로 다른 색상의 1 카드 두 장으로 각각 트릭을 이겨야 합니다.",
  29: "매 트릭이 끝날 때 승무원들의 승리 횟수 차이가 1 이하여야 합니다.",
  33: "지명된 승무원은 정확히 한 트릭만 이겨야 하며 로켓으로 이기면 안 됩니다.",
  34: "매 트릭 뒤 승리 횟수 차이가 1 이하여야 하며, 사령관이 첫 트릭과 마지막 트릭을 이겨야 합니다.",
  41: "지명된 승무원은 첫 트릭과 마지막 트릭만 이겨야 하며 로켓으로 이기면 안 됩니다.",
  44: "로켓 1 → 2 → 3 → 4가 이 순서대로 각각 트릭의 승리 카드가 되어야 합니다.",
  46: "최초 분홍 9 보유자의 왼쪽 승무원이 분홍 카드 9장을 모두 획득해야 합니다.",
  48: "목표 3개를 완료하고, Ω 목표는 이번 시도의 마지막 트릭에 완료해야 합니다.",
  50: "한 명은 처음 네 트릭만, 다른 한 명은 마지막 트릭만 이깁니다. 나머지 트릭은 다른 승무원들이 이깁니다.",
};
function validMission(number: number): void {
  if (!Number.isInteger(number) || number < 1 || number > 50) throw new Error("유효하지 않은 미션 번호입니다.");
}
export function getSpaceCrewMissionCommunication(number: number): SpaceCrewUiCommunication {
  validMission(number);
  if (DEAD_ZONE.has(number)) return { kind: "DEAD_ZONE" };
  if (number === 18 || number === 30) return { kind: "DISRUPTION", fromTrick: 2 };
  if (number === 19 || number === 28 || number === 38) return { kind: "DISRUPTION", fromTrick: 3 };
  return { kind: number === 11 ? "NOMINEE_FORBIDDEN" : "NORMAL" };
}
export function getSpaceCrewMissionCopy(number: number): SpaceCrewMissionCopy {
  validMission(number);
  const taskCount = TASK_COUNTS[number - 1];
  const notes: string[] = [];
  if (taskCount) notes.push(DECISION.has(number)
    ? "목표를 공개하기 전에 사령관 왼쪽부터 가능·불가능만 답합니다. 사령관이 자신을 제외한 한 명에게 모든 목표를 맡깁니다."
    : DISTRIBUTION.has(number)
      ? "목표를 한 장씩 공개합니다. 사령관 왼쪽부터 가능·불가능만 답하고, 사령관이 배분합니다. 배분 완료 시 목표 수 차이는 1 이하여야 합니다."
      : "사령관부터 왼쪽 순서로 목표를 한 장씩 선택합니다.");
  const order = ORDER_NOTES[number]; if (order) notes.push(order);
  if (number === 5) notes.push("사령관 왼쪽부터 좋음·나쁨만 답합니다. 사령관은 자신을 포함해 한 명을 지명합니다.");
  if (number === 11) notes.push("사령관은 자신을 포함해 교신할 수 없는 한 명을 지명합니다.");
  if (number === 12) notes.push("첫 트릭 후 미션이 계속되면 각자의 카드 한 장이 무작위로 왼쪽에 전달됩니다. 현재 교신 중인 카드는 제외합니다.");
  if (number === 23) notes.push("첫 목표 선택 전에 사령관이 순서 토큰 두 개의 위치를 한 번 바꿀 수 있습니다.");
  if (number === 33 || number === 41) notes.push("사령관 왼쪽부터 가능·불가능만 답합니다. 사령관이 자신을 제외한 한 명을 지명합니다.");
  if (number === 40) notes.push("첫 목표 선택 전에 사령관이 순서 토큰 하나를 토큰 없는 목표로 한 번 옮길 수 있습니다.");
  if (number === 44) notes.push("로켓으로 이기는 트릭 사이에 다른 트릭이 있어도 됩니다.");
  if (number === 46) notes.push("분홍 9의 최초 보유자와 담당자는 구조 신호 교환 후에도 바뀌지 않습니다.");
  if (number === 50) notes.push("사령관부터 처음 네 트릭·중간·마지막 중 희망 역할만 말합니다. 서로 다른 두 담당자를 제안하고 모두 동의하면 확정합니다.");
  const rule = getSpaceCrewMissionCommunication(number);
  const communicationNote = rule.kind === "DEAD_ZONE"
    ? "데드존: 교신 가능한 색상 카드만 공개하고, 최고·최저·유일 표시는 하지 않습니다."
    : rule.kind === "DISRUPTION" ? `${rule.fromTrick}번째 트릭부터 교신할 수 있습니다.`
      : rule.kind === "NOMINEE_FORBIDDEN" ? "지명된 승무원은 이번 시도에 교신할 수 없습니다."
        : "목표와 준비를 마친 뒤, 트릭 사이에 각자 한 번 교신할 수 있습니다.";
  return Object.freeze({ title: `미션 ${number}`, objective: OBJECTIVES[number] ?? `전체 목표 ${taskCount}개를 각 담당자가 모두 완료해야 합니다.`,
    setupNotes: Object.freeze(notes), communicationNote,
    completionNote: EXHAUSTION.has(number) ? "마지막 트릭까지 조건을 지켜야 성공합니다." : "모든 목표를 달성하면 즉시 성공합니다.",
    fivePlayerTransfer: TRANSFER.has(number) });
}

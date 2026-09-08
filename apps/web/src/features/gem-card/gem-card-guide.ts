/** GEM-only, optional Web preference. Not a credential or a game/session field. */
export const GEM_TUTORIAL_PREFERENCE = "hangul-rummikub:preferences:gem-tutorial-v1";
type TutorialStorage = Pick<Storage, "getItem" | "setItem">;
function tutorialStorage(): TutorialStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; }
  catch { return undefined; }
}
export function hasSeenGemTutorial(storage = tutorialStorage()): boolean {
  try { return storage?.getItem(GEM_TUTORIAL_PREFERENCE) === "seen"; }
  catch { return false; }
}
export function markGemTutorialSeen(storage = tutorialStorage()): void {
  try { storage?.setItem(GEM_TUTORIAL_PREFERENCE, "seen"); }
  catch { /* A blocked preference store must not interrupt the tutorial or gameplay. */ }
}

export const GEM_TUTORIAL_STEPS = [
  { title: "18점을 향해 카드를 모으세요", body: "카드를 구매하면 카드의 승점을 얻습니다. 누군가 18점 이상이 되면 최종 라운드를 마친 뒤 순위를 정합니다.", example: "자원 모으기 → 카드 구매 → 영구 할인과 승점" },
  { title: "먼저 자원을 모으세요", body: "한 턴에 서로 다른 기본 자원 1~2개 또는 프리즘 1개를 받습니다. 기본 자원과 프리즘은 섞지 않으며, 총 보유 한도는 9개입니다.", example: "새벽 1 + 물결 1  또는  프리즘 1" },
  { title: "자원으로 카드를 구매하세요", body: "공개 시장 또는 내 예약 카드 중 1장을 구매합니다. 지불한 자원은 공용 공급으로 돌아가고, 구매한 카드의 승점이 내 점수에 더해집니다.", example: "승점 0인 카드도 영구 할인은 줍니다." },
  { title: "산 카드는 계속 할인을 줍니다", body: "불씨 영구 할인 +1 카드를 보유하면 앞으로 모든 카드의 불씨 비용이 1 감소합니다. 할인은 소모되지 않으며 여러 장이면 누적됩니다.", example: "불씨 기본 비용 3 − 영구 할인 2 = 실제 비용 1" },
  { title: "프리즘은 부족한 자원을 대신합니다", body: "구매할 때 기본 자원을 먼저 쓰고, 부족한 만큼만 보유한 프리즘을 씁니다. 지불은 서버가 계산하며 프리즘까지 부족하면 구매할 수 없습니다.", example: "새벽 2 + 불씨 1 필요 → 새벽 2 + 프리즘 1로 지불 가능" },
  { title: "원하는 카드를 예약할 수 있습니다", body: "공개 시장 카드만 최대 2장 예약하고 나중에 구매할 수 있습니다. 예약 카드도 모두에게 공개되며, 예약 자체의 자원·승점·할인 보상은 없습니다.", example: "18점을 향해 시작해보세요." },
] as const;

export function nextGemTutorialStep(step: number): number | null {
  return step >= GEM_TUTORIAL_STEPS.length - 1 ? null : step + 1;
}

export const GEM_GUIDE_SECTIONS = [
  { title: "목표 · 18점", body: "구매한 카드의 승점을 모읍니다. 종료 시 기권하지 않은 플레이어 중 점수가 가장 높은 사람이 승리하며, 최고 점수 동점은 공동 우승입니다." },
  { title: "내 차례에 할 수 있는 행동", body: "자원 받기 · 카드 구매 · 카드 예약 중 정확히 하나를 하면 턴이 끝납니다. 아무것도 할 수 없을 때만 행동 없이 턴 종료를 요청할 수 있습니다." },
  { title: "자원 받기", body: "공용 공급이 남은 서로 다른 기본 자원 1~2개를 각각 1개씩, 또는 프리즘 1개를 받습니다. 같은 기본 자원 2개, 기본 자원 + 프리즘, 기본 3종은 받을 수 없습니다." },
  { title: "카드 구매", body: "시장 카드 또는 내 예약 카드 1장을 선택합니다. 기본 비용에서 내 영구 할인을 뺀 비용을 지불합니다. 지불한 자원은 공급으로 돌아가며 시장의 빈 슬롯은 같은 단계의 덱에서 즉시 채웁니다. 그 덱이 비면 빈 자리를 유지합니다." },
  { title: "영구 할인", body: "구매한 카드마다 표시된 자원 비용이 앞으로 1씩 줄어듭니다. 할인은 소모되지 않고 누적되며 실제 비용은 0 아래로 내려가지 않습니다. 예약만 한 카드는 할인을 주지 않습니다." },
  { title: "프리즘", body: "서버는 실제 비용에 맞는 기본 자원을 먼저 쓰고 부족분만 프리즘으로 채웁니다. 프리즘은 보유한 만큼만 쓸 수 있으며 지불 순서를 직접 고를 필요는 없습니다." },
  { title: "카드 예약", body: "공개 시장 카드만 최대 2장까지 예약합니다. 예약 카드의 내용은 상대에게도 공개됩니다. 예약 보상은 없으며 나중에 일반 구매와 같은 비용 계산으로 살 수 있습니다. 비공개 덱 맨 위 카드는 예약할 수 없습니다." },
  { title: "자원 9개 제한", body: "기본 자원과 프리즘을 합해 최대 9개입니다. 8개일 때 1개 받기는 가능하지만 2개 받기는 전체 거절됩니다. 9개이면 더 받을 수 없고, 구매로 자원을 사용하면 다시 받을 수 있습니다." },
  { title: "최종 라운드", body: "누군가 18점 이상이 되어도 모두 즉시 끝나지는 않습니다. 현재 순서에서 아직 행동하지 않은 기권하지 않은 플레이어가 행동한 뒤, 순서가 처음으로 돌아가기 전에 종료합니다. 최종 점수로 비교합니다.", example: "순서 A → B → C에서 B가 18점: C까지 행동 후 종료. C가 18점: 그 행동으로 라운드 종료." },
  { title: "행동 없이 턴 종료 · YIELD", body: "자원 받기·구매·예약이 모두 불가능할 때만 사용할 수 있습니다. 임의로 쉬는 일반 패스가 아닙니다. 서버가 가능 여부를 확인하며 모두가 연속으로 진행 불가이면 게임이 종료될 수 있습니다." },
] as const;

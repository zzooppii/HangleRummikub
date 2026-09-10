import type { WolfRole, WolfStage } from "@hangul-rummikub/shared";
export const ROLE_COPY: Readonly<Record<WolfRole, { name: string; symbol: string; team: string; description: string }>> = {
  DOPPELGANGER: { name: "도플갱어", symbol: "◈", team: "복사한 역할", description: "다른 사람의 역할을 복사합니다. 예언가·강도·말썽쟁이·주정뱅이를 복사하면 지금 바로 능력을 사용합니다. 늑대·프리메이슨은 함께 깨어나고, 하수인은 즉시 늑대를 확인하며, 불면증환자는 맨 마지막에 깨어납니다." },
  WEREWOLF: { name: "늑대인간", symbol: "☾", team: "늑대팀", description: "함께 깨어난 늑대를 확인합니다. 혼자라면 중앙 카드 1장을 볼 수 있습니다. 마지막에 늑대가 아무도 탈락하지 않게 하세요. 무두장이만 탈락하면 늑대팀도 집니다." },
  MINION: { name: "하수인", symbol: "♜", team: "늑대팀", description: "늑대가 누구인지 확인하지만 늑대는 당신을 모릅니다. 늑대가 있다면 대신 의심받아도 좋아요. 늑대가 없으면 하수인이 아닌 누군가가 탈락해야 합니다. 무두장이 승리가 우선합니다." },
  MASON: { name: "프리메이슨", symbol: "⚒", team: "마을팀", description: "다른 프리메이슨을 확인합니다. 아무도 없다면 동료 카드는 중앙에 있습니다. 두 장을 함께 사용합니다." },
  SEER: { name: "예언가", symbol: "✧", team: "마을팀", description: "다른 사람의 카드 1장 또는 중앙 카드 2장을 확인합니다. 카드를 움직이지는 않습니다." },
  ROBBER: { name: "강도", symbol: "♠", team: "마을팀", description: "자신과 다른 사람의 카드를 교환하고 얻은 카드를 확인합니다. 새 역할의 능력은 사용하지 않습니다." },
  TROUBLEMAKER: { name: "말썽쟁이", symbol: "⇄", team: "마을팀", description: "자신을 제외한 두 사람의 카드를 교환합니다. 바뀐 카드를 볼 수는 없습니다." },
  DRUNK: { name: "주정뱅이", symbol: "♧", team: "마을팀", description: "자신의 카드와 중앙 카드 1장을 반드시 교환합니다. 새 카드는 확인할 수 없습니다." },
  INSOMNIAC: { name: "불면증환자", symbol: "◉", team: "마을팀", description: "밤의 끝에 자신의 카드를 확인합니다. 강도나 말썽쟁이에 의해 바뀌었을 수도 있어요." },
  VILLAGER: { name: "마을주민", symbol: "⌂", team: "마을팀", description: "밤 행동은 없습니다. 다른 사람들의 이야기를 듣고 모순을 찾아보세요. 역할이 바뀌었을 가능성도 생각하세요." },
  HUNTER: { name: "사냥꾼", symbol: "◎", team: "마을팀", description: "당신이 탈락하면 당신이 투표한 사람도 함께 탈락합니다. 밤에는 깨어나지 않습니다." },
  TANNER: { name: "무두장이", symbol: "◇", team: "독립", description: "당신 자신이 탈락해야 승리합니다. 늑대도 함께 탈락했다면 마을팀과 같이 이깁니다. 밤에는 깨어나지 않습니다." },
};
export const STAGE_COPY: Readonly<Record<WolfStage, string>> = { REVEAL: "당신의 비밀을 확인하세요", DOPPELGANGER: "도플갱어가 깨어납니다", WEREWOLF: "늑대들이 눈을 뜹니다", MINION: "하수인이 늑대를 찾습니다", MASON: "프리메이슨이 만납니다", SEER: "예언가가 진실을 봅니다", ROBBER: "강도가 움직입니다", TROUBLEMAKER: "말썽쟁이가 장난을 칩니다", DRUNK: "주정뱅이가 비틀거립니다", INSOMNIAC: "불면증환자가 눈을 뜹니다", DOPPEL_INSOMNIAC: "도플갱어가 마지막으로 확인합니다", DISCUSSION: "해가 떴습니다. 누구를 믿나요?", VOTE: "단 한 표로, 밤의 결말을", FINISHED: "지난밤의 진실" };

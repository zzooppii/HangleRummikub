import {
  CARCASSONNE_CATALOG,
  CARCASSONNE_FEATURE_LABELS,
  analyzeCarcassonneBoard,
  carcassonneFeaturePoints,
  carcassonneMajority,
  carcassonneMeepleChoices,
  carcassonnePlacementReason,
  type CarcassonneAction,
  type CarcassonneBoardTile,
  type CarcassonneProjection,
  type CarcassonneRotation,
  type CarcassonneFeature,
  type PlayerId,
} from "@hangul-rummikub/shared";
export type CarcassonneDraft = {
  x: number;
  y: number;
  rotation: CarcassonneRotation;
  meepleRegionId: string | null;
};
export function previewCarcassonne(
  g: CarcassonneProjection,
  selfId: PlayerId,
  draft: CarcassonneDraft | null,
) {
  const player = g.playerStates.find((p) => p.playerId === selfId);
  const tile: CarcassonneBoardTile | null =
    draft && g.currentTile
      ? { ...g.currentTile, x: draft.x, y: draft.y, rotation: draft.rotation }
      : null;
  let reason =
    g.phase !== "PLAYING"
      ? "게임이 종료되었습니다."
      : g.activePlayerId !== selfId
        ? "상대의 차례입니다."
        : !tile
          ? "점선으로 표시된 빈칸을 골라주세요."
          : (carcassonnePlacementReason(g.board, tile) ?? "");
  const choices =
    tile && !carcassonnePlacementReason(g.board, tile)
      ? carcassonneMeepleChoices(g.board, g.meeples, tile)
      : [];
  if (!reason && draft?.meepleRegionId) {
    const choice = choices.find((c) => c.region.id === draft.meepleRegionId);
    if (!player || player.availableMeeples === 0)
      reason = "남은 미플이 없습니다. 타일만 놓아주세요.";
    else if (!choice || !choice.available)
      reason = "연결된 영역에 이미 미플이 있습니다.";
  }
  const action: CarcassonneAction | null =
    !reason && tile && draft
      ? {
          tileId: tile.tileId,
          x: tile.x,
          y: tile.y,
          rotation: tile.rotation,
          meepleRegionId: draft.meepleRegionId,
        }
      : null;
  const claims = action?.meepleRegionId
    ? [
        ...g.meeples,
        {
          tileId: action.tileId,
          regionId: action.meepleRegionId,
          playerId: selfId,
        },
      ]
    : g.meeples;
  const scored =
    tile && action
      ? analyzeCarcassonneBoard([...g.board, tile], claims).filter(
          (f) => f.complete && f.meeples.length,
        )
      : [];
  const gains = g.playerStates
    .map((p) => ({
      playerId: p.playerId,
      points: scored
        .filter((f) => carcassonneMajority(f).includes(p.playerId))
        .reduce((n, f) => n + carcassonneFeaturePoints(f, false), 0),
    }))
    .filter((p) => p.points > 0);
  return {
    tile,
    reason,
    choices,
    action,
    gains,
    returnCount: scored.reduce(
      (n, f) => n + f.meeples.filter((m) => m.playerId === selfId).length,
      0,
    ),
  };
}
export function describeCarcassonneFeature(
  feature: CarcassonneFeature,
): string {
  const label = CARCASSONNE_FEATURE_LABELS[feature.kind];
  if (feature.kind === "FIELD")
    return (
      label +
      " · 완성 도시 " +
      feature.completedCityIds.length +
      "개 · 현재 종료 점수 " +
      carcassonneFeaturePoints(feature, true) +
      "점"
    );
  if (feature.kind === "MONASTERY")
    return label + " · 주변 포함 " + feature.surroundingCount + "/9칸";
  return (
    label +
    " · " +
    feature.tileIds.length +
    "타일" +
    (feature.shields ? " · 방패 " + feature.shields + "개" : "") +
    " · " +
    (feature.complete ? "완성" : feature.openEdges + "곳 열림")
  );
}
export const CARCASSONNE_PLAYER_COLORS = [
  "#b9473e",
  "#356ca5",
  "#d89b29",
  "#5d813e",
  "#7b5b97",
] as const;
export function carcassonneTileLabel(
  tile: Pick<CarcassonneBoardTile, "kind" | "rotation">,
): string {
  return CARCASSONNE_CATALOG[tile.kind].label + " · " + tile.rotation + "°";
}
export function nextCarcassonneRotation(
  rotation: CarcassonneRotation,
  clockwise = true,
): CarcassonneRotation {
  const values = [0, 90, 180, 270] as const;
  return values[(values.indexOf(rotation) + (clockwise ? 1 : 3)) % 4]!;
}

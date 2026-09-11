import type { PlayerId, TileId } from "../../identifiers.js";
import type {
  CarcassonneBoardTile,
  CarcassonneMeeple,
  CarcassonneRotation,
  CarcassonneTile,
} from "./actions.js";
import {
  CARCASSONNE_CATALOG,
  type CarcassonneFeatureKind,
  type CarcassonneRegion,
} from "./catalog.js";
export const CARCASSONNE_OFFSETS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
export const carcassonneCellKey = (x: number, y: number): string => x + "," + y;
export const carcassonneRegionKey = (
  tileId: string,
  regionId: string,
): string => tileId + "/" + regionId;
export function rotateCarcassonnePoint(
  point: readonly [number, number],
  rotation: CarcassonneRotation,
): readonly [number, number] {
  const [x, y] = point;
  switch (rotation) {
    case 0:
      return [x, y];
    case 90:
      return [100 - y, x];
    case 180:
      return [100 - x, 100 - y];
    case 270:
      return [y, 100 - x];
  }
}
export function carcassonneEdge(
  tile: Pick<CarcassonneBoardTile, "kind" | "rotation">,
  direction: number,
): "CITY" | "ROAD" | "FIELD" {
  const local = (direction - tile.rotation / 90 + 4) % 4;
  return CARCASSONNE_CATALOG[tile.kind].regions.find(
    (r) =>
      r.kind !== "FIELD" && r.kind !== "MONASTERY" && r.ports.includes(local),
  )?.kind === "CITY"
    ? "CITY"
    : CARCASSONNE_CATALOG[tile.kind].regions.some(
          (r) => r.kind === "ROAD" && r.ports.includes(local),
        )
      ? "ROAD"
      : "FIELD";
}
export function carcassonnePlacementReason(
  board: readonly CarcassonneBoardTile[],
  tile: CarcassonneBoardTile,
): string | null {
  if (
    !Number.isSafeInteger(tile.x) ||
    !Number.isSafeInteger(tile.y) ||
    Math.abs(tile.x) > 72 ||
    Math.abs(tile.y) > 72
  )
    return "보드 범위를 벗어났습니다.";
  const cells = new Map(board.map((t) => [carcassonneCellKey(t.x, t.y), t]));
  if (cells.has(carcassonneCellKey(tile.x, tile.y)))
    return "이미 타일이 있는 자리입니다.";
  let touches = false;
  for (const [direction, [dx, dy]] of CARCASSONNE_OFFSETS.entries()) {
    const neighbor = cells.get(carcassonneCellKey(tile.x + dx, tile.y + dy));
    if (!neighbor) continue;
    touches = true;
    if (
      carcassonneEdge(tile, direction) !==
      carcassonneEdge(neighbor, (direction + 2) % 4)
    )
      return (
        ["북", "동", "남", "서"][direction] +
        "쪽 지형이 이웃 타일과 맞지 않습니다."
      );
  }
  return touches ? null : "기존 타일의 한 변과 이어져야 합니다.";
}
export function carcassonneFrontier(
  board: readonly CarcassonneBoardTile[],
): { x: number; y: number }[] {
  const occupied = new Set(board.map((t) => carcassonneCellKey(t.x, t.y))),
    result = new Map<string, { x: number; y: number }>();
  for (const t of board)
    for (const [dx, dy] of CARCASSONNE_OFFSETS) {
      const x = t.x + dx,
        y = t.y + dy,
        key = carcassonneCellKey(x, y);
      if (!occupied.has(key) && Math.abs(x) <= 72 && Math.abs(y) <= 72)
        result.set(key, { x, y });
    }
  return [...result.values()].sort(
    (a, b) =>
      Math.abs(a.x) + Math.abs(a.y) - Math.abs(b.x) - Math.abs(b.y) ||
      a.y - b.y ||
      a.x - b.x,
  );
}
export function legalCarcassonnePlacements(
  board: readonly CarcassonneBoardTile[],
  tile: CarcassonneTile,
): CarcassonneBoardTile[] {
  const result: CarcassonneBoardTile[] = [];
  // Build the public lookup once; all four orientations must agree with every neighbor.
  const cells = new Map(board.map((t) => [carcassonneCellKey(t.x, t.y), t]));
  for (const { x, y } of carcassonneFrontier(board))
    for (const rotation of [0, 90, 180, 270] as const) {
      const candidate = { ...tile, x, y, rotation };
      if (
        CARCASSONNE_OFFSETS.every(([dx, dy], direction) => {
          const n = cells.get(carcassonneCellKey(x + dx, y + dy));
          return (
            !n ||
            carcassonneEdge(candidate, direction) ===
              carcassonneEdge(n, (direction + 2) % 4)
          );
        })
      )
        result.push(candidate);
    }
  return result;
}
export type CarcassonneFeature = {
  id: string;
  kind: CarcassonneFeatureKind;
  nodes: string[];
  tileIds: TileId[];
  openEdges: number;
  shields: number;
  complete: boolean;
  meeples: CarcassonneMeeple[];
  completedCityIds: string[];
  surroundingCount: number;
};
type Node = {
  key: string;
  tile: CarcassonneBoardTile;
  region: CarcassonneRegion;
  links: string[];
  openEdges: number;
};
/** Field ports across an edge reverse handedness: N-left meets S-left, not S-right. */
export function oppositeCarcassonneFieldPort(port: number): number {
  return (port + (port % 2 === 0 ? 5 : 3)) % 8;
}
export function analyzeCarcassonneBoard(
  board: readonly CarcassonneBoardTile[],
  meeples: readonly CarcassonneMeeple[],
): CarcassonneFeature[] {
  const cells = new Map(board.map((t) => [carcassonneCellKey(t.x, t.y), t])),
    nodes = new Map<string, Node>();
  for (const tile of board)
    for (const region of CARCASSONNE_CATALOG[tile.kind].regions) {
      const key = carcassonneRegionKey(tile.tileId, region.id);
      nodes.set(key, { key, tile, region, links: [], openEdges: 0 });
    }
  for (const node of nodes.values()) {
    const { tile, region } = node;
    for (const port of region.ports) {
      const field = region.kind === "FIELD",
        world =
          (port + (tile.rotation / 90) * (field ? 2 : 1)) % (field ? 8 : 4),
        direction = field ? Math.floor(world / 2) : world;
      const offset = CARCASSONNE_OFFSETS[direction];
      if (!offset) throw new Error("Invalid catalog port.");
      const neighbor = cells.get(
        carcassonneCellKey(tile.x + offset[0], tile.y + offset[1]),
      );
      if (!neighbor) {
        node.openEdges++;
        continue;
      }
      const opposite = field
        ? oppositeCarcassonneFieldPort(world)
        : (world + 2) % 4;
      const local =
        (opposite -
          (neighbor.rotation / 90) * (field ? 2 : 1) +
          (field ? 8 : 4)) %
        (field ? 8 : 4);
      const other = CARCASSONNE_CATALOG[neighbor.kind].regions.find(
        (r) => r.kind === region.kind && r.ports.includes(local),
      );
      if (other)
        node.links.push(carcassonneRegionKey(neighbor.tileId, other.id));
      else node.openEdges++;
    }
  }
  const seen = new Set<string>(),
    features: CarcassonneFeature[] = [],
    byNode = new Map<string, CarcassonneFeature>();
  const claims = new Map<string, CarcassonneMeeple[]>();
  for (const m of meeples) {
    const key = carcassonneRegionKey(m.tileId, m.regionId);
    claims.set(key, [...(claims.get(key) ?? []), m]);
  }
  for (const start of nodes.values()) {
    if (seen.has(start.key)) continue;
    const queue = [start.key],
      component: Node[] = [];
    seen.add(start.key);
    for (let i = 0; i < queue.length; i++) {
      const node = nodes.get(queue[i]!);
      if (!node) throw new Error("Missing feature node.");
      component.push(node);
      for (const key of node.links)
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(key);
        }
    }
    let surroundingCount = 0;
    if (start.region.kind === "MONASTERY")
      for (let y = -1; y <= 1; y++)
        for (let x = -1; x <= 1; x++)
          if (cells.has(carcassonneCellKey(start.tile.x + x, start.tile.y + y)))
            surroundingCount++;
    const openEdges = component.reduce((n, t) => n + t.openEdges, 0);
    const feature: CarcassonneFeature = {
      id: [...queue].sort()[0]!,
      kind: start.region.kind,
      nodes: queue,
      tileIds: [...new Set(component.map((n) => n.tile.tileId))],
      openEdges,
      shields: component.reduce((n, t) => n + t.region.shields, 0),
      complete:
        start.region.kind === "MONASTERY"
          ? surroundingCount === 9
          : start.region.kind !== "FIELD" && openEdges === 0,
      meeples: queue.flatMap((key) => claims.get(key) ?? []),
      completedCityIds: [],
      surroundingCount,
    };
    features.push(feature);
    for (const key of queue) byNode.set(key, feature);
  }
  for (const feature of features)
    if (feature.kind === "FIELD") {
      const cities = new Set<string>();
      for (const key of feature.nodes) {
        const node = nodes.get(key)!;
        for (const cityId of node.region.adjacentCities) {
          const city = byNode.get(
            carcassonneRegionKey(node.tile.tileId, cityId),
          );
          if (city?.kind === "CITY" && city.complete) cities.add(city.id);
        }
      }
      feature.completedCityIds = [...cities].sort();
    }
  return features;
}
export function carcassonneFeaturePoints(
  feature: CarcassonneFeature,
  final: boolean,
): number {
  switch (feature.kind) {
    case "FIELD":
      return final ? feature.completedCityIds.length * 3 : 0;
    case "MONASTERY":
      return final || feature.complete ? feature.surroundingCount : 0;
    case "ROAD":
      return final || feature.complete ? feature.tileIds.length : 0;
    case "CITY":
      return feature.complete
        ? (feature.tileIds.length + feature.shields) * 2
        : final
          ? feature.tileIds.length + feature.shields
          : 0;
  }
}
export function carcassonneMajority(feature: CarcassonneFeature): PlayerId[] {
  const counts = new Map<PlayerId, number>();
  for (const m of feature.meeples)
    counts.set(m.playerId, (counts.get(m.playerId) ?? 0) + 1);
  const maximum = Math.max(0, ...counts.values());
  return [...counts].filter(([, count]) => count === maximum).map(([id]) => id);
}
export function carcassonneMeepleChoices(
  board: readonly CarcassonneBoardTile[],
  meeples: readonly CarcassonneMeeple[],
  tile: CarcassonneBoardTile,
): {
  region: CarcassonneRegion;
  feature: CarcassonneFeature;
  available: boolean;
}[] {
  const features = analyzeCarcassonneBoard([...board, tile], meeples);
  return CARCASSONNE_CATALOG[tile.kind].regions.map((region) => {
    const feature = features.find((f) =>
      f.nodes.includes(carcassonneRegionKey(tile.tileId, region.id)),
    );
    if (!feature) throw new Error("Missing placed feature.");
    return { region, feature, available: feature.meeples.length === 0 };
  });
}

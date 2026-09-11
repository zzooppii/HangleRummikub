/** Official base inventory A–X, Big Box 2010 appendix B1. Art is original. */
export const CARCASSONNE_TILE_KINDS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
] as const;
export type CarcassonneTileKind = (typeof CARCASSONNE_TILE_KINDS)[number];
export type CarcassonneFeatureKind = "CITY" | "ROAD" | "FIELD" | "MONASTERY";
export type CarcassonneRegion = Readonly<{
  id: string;
  kind: CarcassonneFeatureKind;
  ports: readonly number[];
  adjacentCities: readonly string[];
  shields: number;
  point: readonly [number, number];
  path: string;
}>;
export type CarcassonneTileDefinition = Readonly<{
  kind: CarcassonneTileKind;
  count: number;
  label: string;
  regions: readonly CarcassonneRegion[];
}>;
const all = "M0 0H100V100H0Z",
  left = "M0 0H50V100H0Z",
  right = "M50 0H100V100H50Z";
const top = "M0 0H100V50H0Z",
  bottom = "M0 50H100V100H0Z";
const nw = "M0 0H50V50H0Z",
  ne = "M50 0H100V50H50Z",
  se = "M50 50H100V100H50Z",
  sw = "M0 50H50V100H0Z";
const curveSE = "M100 50Q50 50 50 100",
  curveNW = "M50 0Q50 50 0 50",
  curveSW = "M50 100Q50 50 0 50";
const insideSE = "M100 50Q50 50 50 100H100Z",
  outsideSE = "M0 0H100V50Q50 50 50 100H0Z";
const insideNW = "M50 0Q50 50 0 50V0Z",
  outsideNW = "M50 0H100V100H0V50Q50 50 50 0Z";
const insideSW = "M50 100Q50 50 0 50V100Z",
  outsideSW = "M0 0H100V100H50Q50 50 0 50Z";
const capN = "M0 0H100Q78 29 50 29Q22 29 0 0Z";
const capE = "M100 0V100Q71 78 71 50Q71 22 100 0Z";
const capS = "M100 100H0Q22 71 50 71Q78 71 100 100Z";
const capW = "M0 100V0Q29 22 29 50Q29 78 0 100Z";
const cornerNW = "M0 0H100Q82 22 50 50Q22 82 0 100Z";
const cityNEW = "M0 0H100V100Q50 36 0 100Z";
const cityNS = "M0 0H100Q65 50 100 100H0Q35 50 0 0Z";
const cityEW = "M0 0Q50 35 100 0V100Q50 65 0 100Z";
const r = (
  id: string,
  kind: CarcassonneFeatureKind,
  ports: readonly number[],
  point: readonly [number, number],
  path: string,
  adjacentCities: readonly string[] = [],
  shields = 0,
): CarcassonneRegion => ({
  id,
  kind,
  ports,
  point,
  path,
  adjacentCities,
  shields,
});
const c = (
  ports: readonly number[],
  point: readonly [number, number],
  path: string,
  shields = 0,
  id = "c0",
) => r(id, "CITY", ports, point, path, [], shields);
const road = (
  ports: readonly number[],
  point: readonly [number, number],
  path: string,
  id = "r0",
) => r(id, "ROAD", ports, point, path);
const f = (
  id: string,
  ports: readonly number[],
  point: readonly [number, number],
  path: string,
  adjacentCities: readonly string[] = [],
) => r(id, "FIELD", ports, point, path, adjacentCities);
const monastery = r("m0", "MONASTERY", [], [50, 46], "M34 30H66V63H34Z");
const d = (
  kind: CarcassonneTileKind,
  count: number,
  label: string,
  regions: readonly CarcassonneRegion[],
): CarcassonneTileDefinition => ({ kind, count, label, regions });
const allPorts = [0, 1, 2, 3, 4, 5, 6, 7];
/** Directions: N/E/S/W=0/1/2/3. Field half-edges run clockwise, N-left=0. */
export const CARCASSONNE_CATALOG: Readonly<
  Record<CarcassonneTileKind, CarcassonneTileDefinition>
> = {
  A: d("A", 2, "길이 있는 수도원", [
    monastery,
    road([2], [50, 82], "M50 63L50 100"),
    f("f0", allPorts, [20, 28], all),
  ]),
  B: d("B", 4, "수도원", [monastery, f("f0", allPorts, [20, 28], all)]),
  C: d("C", 1, "방패 도시", [c([0, 1, 2, 3], [50, 50], all, 1)]),
  D: d("D", 4, "도시와 곧은 길", [
    c([1], [87, 50], capE),
    road([0, 2], [50, 46], "M50 0L50 100"),
    f("f0", [0, 5, 6, 7], [24, 45], left),
    f("f1", [1, 4], [64, 16], right, ["c0"]),
  ]),
  E: d("E", 5, "작은 도시", [
    c([0], [50, 14], capN),
    f("f0", [2, 3, 4, 5, 6, 7], [50, 65], all, ["c0"]),
  ]),
  F: d("F", 2, "방패가 있는 연결 도시", [
    c([1, 3], [50, 50], cityEW, 1),
    f("f0", [0, 1], [50, 12], top, ["c0"]),
    f("f1", [4, 5], [50, 88], bottom, ["c0"]),
  ]),
  G: d("G", 1, "연결 도시", [
    c([0, 2], [50, 50], cityNS),
    f("f0", [2, 3], [88, 50], right, ["c0"]),
    f("f1", [6, 7], [12, 50], left, ["c0"]),
  ]),
  H: d("H", 3, "마주 보는 두 도시", [
    c([1], [87, 50], capE),
    c([3], [13, 50], capW, 0, "c1"),
    f("f0", [0, 1, 4, 5], [50, 50], all, ["c0", "c1"]),
  ]),
  I: d("I", 2, "이웃한 두 도시", [
    c([1], [87, 50], capE),
    c([2], [50, 87], capS, 0, "c1"),
    f("f0", [0, 1, 6, 7], [34, 34], all, ["c0", "c1"]),
  ]),
  J: d("J", 3, "도시와 오른쪽 굽은 길", [
    c([0], [50, 14], capN),
    road([1, 2], [64, 64], curveSE),
    f("f0", [2, 5, 6, 7], [26, 51], outsideSE, ["c0"]),
    f("f1", [3, 4], [84, 84], insideSE),
  ]),
  K: d("K", 3, "도시와 왼쪽 굽은 길", [
    c([1], [87, 50], capE),
    road([0, 3], [36, 36], curveNW),
    f("f0", [0, 7], [16, 16], insideNW),
    f("f1", [1, 4, 5, 6], [49, 77], outsideNW, ["c0"]),
  ]),
  L: d("L", 3, "도시와 삼거리", [
    c([1], [87, 50], capE),
    road([0], [50, 21], "M50 0L50 50"),
    road([2], [50, 79], "M50 50L50 100", "r1"),
    road([3], [21, 50], "M0 50L50 50", "r2"),
    f("f0", [1, 4], [64, 16], right, ["c0"]),
    f("f1", [0, 7], [22, 23], nw),
    f("f2", [5, 6], [22, 77], sw),
  ]),
  M: d("M", 2, "방패가 있는 모퉁이 도시", [
    c([0, 3], [30, 29], cornerNW, 1),
    f("f0", [2, 3, 4, 5], [75, 76], all, ["c0"]),
  ]),
  N: d("N", 3, "모퉁이 도시", [
    c([0, 3], [30, 29], cornerNW),
    f("f0", [2, 3, 4, 5], [75, 76], all, ["c0"]),
  ]),
  O: d("O", 2, "방패 도시와 굽은 길", [
    c([0, 3], [30, 29], cornerNW, 1),
    road([1, 2], [64, 64], curveSE),
    f("f0", [2, 5], [81, 35], outsideSE, ["c0"]),
    f("f1", [3, 4], [85, 85], insideSE),
  ]),
  P: d("P", 3, "모퉁이 도시와 굽은 길", [
    c([0, 3], [30, 29], cornerNW),
    road([1, 2], [64, 64], curveSE),
    f("f0", [2, 5], [81, 35], outsideSE, ["c0"]),
    f("f1", [3, 4], [85, 85], insideSE),
  ]),
  Q: d("Q", 1, "방패가 있는 큰 도시", [
    c([0, 1, 3], [50, 35], cityNEW, 1),
    f("f0", [4, 5], [50, 87], all, ["c0"]),
  ]),
  R: d("R", 3, "큰 도시", [
    c([0, 1, 3], [50, 35], cityNEW),
    f("f0", [4, 5], [50, 87], all, ["c0"]),
  ]),
  S: d("S", 2, "방패 도시의 입구", [
    c([0, 1, 3], [50, 35], cityNEW, 1),
    road([2], [50, 85], "M50 68L50 100"),
    f("f0", [4], [69, 91], right, ["c0"]),
    f("f1", [5], [31, 91], left, ["c0"]),
  ]),
  T: d("T", 1, "도시의 입구", [
    c([0, 1, 3], [50, 35], cityNEW),
    road([2], [50, 85], "M50 68L50 100"),
    f("f0", [4], [69, 91], right, ["c0"]),
    f("f1", [5], [31, 91], left, ["c0"]),
  ]),
  U: d("U", 8, "곧은 길", [
    road([0, 2], [50, 50], "M50 0L50 100"),
    f("f0", [0, 5, 6, 7], [22, 50], left),
    f("f1", [1, 2, 3, 4], [78, 50], right),
  ]),
  V: d("V", 9, "굽은 길", [
    road([2, 3], [36, 64], curveSW),
    f("f0", [5, 6], [16, 84], insideSW),
    f("f1", [0, 1, 2, 3, 4, 7], [66, 35], outsideSW),
  ]),
  W: d("W", 4, "삼거리", [
    road([1], [80, 50], "M50 50L100 50"),
    road([2], [50, 80], "M50 50L50 100", "r1"),
    road([3], [20, 50], "M0 50L50 50", "r2"),
    f("f0", [0, 1, 2, 7], [50, 23], top),
    f("f1", [3, 4], [78, 78], se),
    f("f2", [5, 6], [22, 78], sw),
  ]),
  X: d("X", 1, "사거리", [
    road([0], [50, 20], "M50 0L50 50"),
    road([1], [80, 50], "M50 50L100 50", "r1"),
    road([2], [50, 80], "M50 50L50 100", "r2"),
    road([3], [20, 50], "M0 50L50 50", "r3"),
    f("f0", [0, 7], [22, 22], nw),
    f("f1", [1, 2], [78, 22], ne),
    f("f2", [3, 4], [78, 78], se),
    f("f3", [5, 6], [22, 78], sw),
  ]),
};
export const CARCASSONNE_RULES_VERSION = "carcassonne-base72-v1" as const;
export const CARCASSONNE_TURN_DURATION_MS = 90_000;
export const CARCASSONNE_FEATURE_LABELS: Readonly<
  Record<CarcassonneFeatureKind, string>
> = { CITY: "도시", ROAD: "도로", FIELD: "들판", MONASTERY: "수도원" };

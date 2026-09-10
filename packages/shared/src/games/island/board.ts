/** Public board geometry only. No shuffled terrain, hands or game authority. */
export type IslandVertex = Readonly<{ id: number; x: number; y: number; hexes: readonly number[]; edges: readonly number[] }>;
export type IslandEdge = Readonly<{ id: number; a: number; b: number; hexes: readonly number[] }>;
export type IslandHex = Readonly<{ id: number; q: number; r: number; x: number; y: number; vertices: readonly number[] }>;
function makeTopology() {
  const vertices: { id: number; x: number; y: number; hexes: number[]; edges: number[] }[] = [];
  const edges: { id: number; a: number; b: number; hexes: number[] }[] = [];
  const hexes: IslandHex[] = [];
  const vertexKeys = new Map<string, number>(), edgeKeys = new Map<string, number>();
  for (let r = -2; r <= 2; r++) for (let q = Math.max(-2, -r - 2); q <= Math.min(2, -r + 2); q++) {
    const id = hexes.length, x = Math.sqrt(3) * (q + r / 2), y = 1.5 * r, corners: number[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k * 60 - 30) * Math.PI / 180;
      const vx = Math.round((x + Math.cos(a)) * 10000) / 10000, vy = Math.round((y + Math.sin(a)) * 10000) / 10000;
      const key = vx + "," + vy;
      let vi = vertexKeys.get(key);
      if (vi === undefined) { vi = vertices.length; vertexKeys.set(key, vi); vertices.push({ id: vi, x: vx, y: vy, hexes: [], edges: [] }); }
      vertices[vi]!.hexes.push(id); corners.push(vi);
    }
    for (let k = 0; k < 6; k++) {
      const a = corners[k]!, b = corners[(k + 1) % 6]!, key = [a, b].sort((a, b) => a - b).join(",");
      let ei = edgeKeys.get(key);
      if (ei === undefined) { ei = edges.length; edgeKeys.set(key, ei); edges.push({ id: ei, a, b, hexes: [] }); vertices[a]!.edges.push(ei); vertices[b]!.edges.push(ei); }
      edges[ei]!.hexes.push(id);
    }
    hexes.push(Object.freeze({ id, q, r, x, y, vertices: Object.freeze(corners) }));
  }
  const coast = edges.filter(e => e.hexes.length === 1).sort((a, b) => {
    const av = vertices[a.a]!, aw = vertices[a.b]!, bv = vertices[b.a]!, bw = vertices[b.b]!;
    return Math.atan2(av.y + aw.y, av.x + aw.x) - Math.atan2(bv.y + bw.y, bv.x + bw.x);
  });
  const ports = Array.from({ length: 9 }, (_, i) => coast[Math.floor(i * coast.length / 9)]!.id);
  return Object.freeze({
    hexes: Object.freeze(hexes),
    vertices: Object.freeze(vertices.map(p => Object.freeze({ ...p, hexes: Object.freeze(p.hexes), edges: Object.freeze(p.edges) }))),
    edges: Object.freeze(edges.map(e => Object.freeze({ ...e, hexes: Object.freeze(e.hexes) }))),
    portEdges: Object.freeze(ports),
  });
}
export const ISLAND_BOARD = makeTopology();

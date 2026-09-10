import type { SaboteurProjection } from './contracts.js';
import { saboteurConnections, SABOTEUR_DIRECTIONS, type SaboteurDirection, type SaboteurPath } from './actions.js';
type Tile = SaboteurProjection['board'][number];
type Goal = SaboteurProjection['goals'][number];
export type BoardView = {
    board: readonly Tile[];
    goals: readonly Goal[];
};
export const SABOTEUR_OFFSETS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] } as const;
export const opposite = (d: SaboteurDirection) => SABOTEUR_DIRECTIONS[(SABOTEUR_DIRECTIONS.indexOf(d) + 2) % 4]!;
export const saboteurCellKey = (x: number, y: number) => `${x},${y}`;
export const saboteurPortKey = (x: number, y: number, d: SaboteurDirection) => `${saboteurCellKey(x, y)}:${d}`;
export function saboteurBoardCells(s: BoardView) {
    const result = new Map<string, {
        x: number;
        y: number;
        groups: SaboteurDirection[][];
    }>();
    result.set('0,0', { x: 0, y: 0, groups: [['N', 'E', 'S', 'W']] });
    for (const t of s.board)
        result.set(saboteurCellKey(t.x, t.y), { x: t.x, y: t.y, groups: saboteurConnections(t.path, t.rotation) });
    for (const g of s.goals)
        if (g.face !== null) {
            const path: SaboteurPath = g.face === 'GOLD' ? 'NESW' : g.face === 'ROCK_NE' ? 'ES' : 'WS';
            result.set(saboteurCellKey(g.x, g.y), { x: g.x, y: g.y, groups: saboteurConnections(path, g.rotation) });
        }
    return result;
}
export function reachableSaboteurPorts(s: BoardView): Set<string> {
    const map = saboteurBoardCells(s), visited = new Set<string>(), queue = ['0,0:N'];
    for (let i = 0; i < queue.length; i++) {
        const entry = queue[i]!;
        if (visited.has(entry))
            continue;
        visited.add(entry);
        const [xy, direction] = entry.split(':'), cell = map.get(xy!);
        if (!cell)
            continue;
        const group = cell.groups.find(g => g.some(d => d === direction));
        if (!group)
            continue;
        for (const d of group) {
            const p = saboteurPortKey(cell.x, cell.y, d);
            if (!visited.has(p))
                queue.push(p);
            const [dx, dy] = SABOTEUR_OFFSETS[d], neighbor = map.get(saboteurCellKey(cell.x + dx, cell.y + dy));
            if (neighbor?.groups.some(g => g.includes(opposite(d)))) {
                const q = saboteurPortKey(cell.x + dx, cell.y + dy, opposite(d));
                if (!visited.has(q))
                    queue.push(q);
            }
        }
    }
    return visited;
}
export function canPlaceSaboteur(s: BoardView, t: Tile): boolean {
    if (t.x === 0 && t.y === 0 || s.board.some(c => c.x === t.x && c.y === t.y) || s.goals.some(c => c.x === t.x && c.y === t.y))
        return false;
    const map = saboteurBoardCells(s), ends = saboteurConnections(t.path, t.rotation).flat();
    let adjacent = false;
    for (const d of SABOTEUR_DIRECTIONS) {
        const [dx, dy] = SABOTEUR_OFFSETS[d], neighbor = map.get(saboteurCellKey(t.x + dx, t.y + dy));
        if (!neighbor)
            continue;
        adjacent = true;
        if (ends.includes(d) !== neighbor.groups.flat().includes(opposite(d)))
            return false;
    }
    if (!adjacent)
        return false;
    const reachable = reachableSaboteurPorts({ ...s, board: [...s.board, t] });
    return ends.some(d => reachable.has(saboteurPortKey(t.x, t.y, d)));
}

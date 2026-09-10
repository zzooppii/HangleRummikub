import { SABOTEUR_DIRECTIONS, SABOTEUR_OFFSETS, saboteurBoardCells, saboteurCellKey, saboteurPortKey, opposite, reachableSaboteurPorts, saboteurConnections, type BoardView, type SaboteurProjection } from '@hangul-rummikub/shared';
type Goal = SaboteurProjection['goals'][number];
/** Hidden faces enter this routine only after reachability is established independently of their identity. */
export function revealSaboteurGoals(s: BoardView, hidden: readonly NonNullable<Goal['face']>[]): Goal[] {
    const goals = s.goals.map(g => ({ ...g }));
    let changed = true;
    while (changed) {
        changed = false;
        const view = { board: s.board, goals }, reachable = reachableSaboteurPorts(view), map = saboteurBoardCells(view);
        for (const [i, g] of goals.entries()) {
            if (g.face !== null)
                continue;
            const entering = SABOTEUR_DIRECTIONS.filter(d => { const [dx, dy] = SABOTEUR_OFFSETS[d]; return reachable.has(saboteurPortKey(g.x + dx, g.y + dy, opposite(d))); });
            if (!entering.length)
                continue;
            const face = hidden[i]!;
            let best = -1, bestRotation: 0 | 180 = 0;
            for (const rotation of [0, 180] as const) {
                const ends = face === 'GOLD' ? SABOTEUR_DIRECTIONS : saboteurConnections(face === 'ROCK_NE' ? 'ES' : 'WS', rotation).flat();
                if (!entering.some(d => ends.includes(d)))
                    continue;
                const score = SABOTEUR_DIRECTIONS.reduce((n, d) => { const [dx, dy] = SABOTEUR_OFFSETS[d], neighbor = map.get(saboteurCellKey(g.x + dx, g.y + dy)); return n + Number(!!neighbor && ends.includes(d) === neighbor.groups.flat().includes(opposite(d))); }, 0);
                if (score > best) {
                    best = score;
                    bestRotation = rotation;
                }
            }
            g.face = face;
            g.rotation = bestRotation;
            changed = true;
        }
    }
    return goals;
}

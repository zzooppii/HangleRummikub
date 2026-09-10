import { canPlaceSaboteur, type SaboteurCard, type SaboteurProjection } from '@hangul-rummikub/shared';
export function saboteurCandidates(g: SaboteurProjection, c: SaboteurCard | null, rotation: 0 | 180) {
    if (c?.kind !== 'PATH' || g.phase !== 'PLAYING' || g.playerStates.find(p => p.playerId === g.privateState.playerId)?.brokenTools.length)
        return [];
    const occupied = [{ x: 0, y: 0 }, ...g.board, ...g.goals], unique = new Map<string, {
        x: number;
        y: number;
    }>();
    for (const t of [{ x: 0, y: 0 }, ...g.board, ...g.goals.filter(g => g.face !== null)])
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const x = t.x + dx!, y = t.y + dy!;
            if (x < -41 || x > 49 || y < -41 || y > 49 || occupied.some(p => p.x === x && p.y === y))
                continue;
            if (canPlaceSaboteur(g, { cardId: c.cardId, path: c.path, x, y, rotation, placedBy: g.privateState.playerId }))
                unique.set(`${x},${y}`, { x, y });
        }
    return [...unique.values()];
}
export function saboteurBoardBounds(g: SaboteurProjection) { const xs = [0, 8, ...g.board.map(t => t.x)], ys = [-2, 2, ...g.board.map(t => t.y)]; return { minX: Math.min(...xs) - 1, maxX: Math.max(...xs) + 1, minY: Math.min(...ys) - 1, maxY: Math.max(...ys) + 1 }; }
export function saboteurFeedback(g: SaboteurProjection, name: (id: string) => string): string | null {
    const f = g.feedback;
    if (!f)
        return null;
    const who = name(f.playerId), target = f.targetPlayerId ? name(f.targetPlayerId) : '';
    switch (f.kind) {
        case 'PLACE': return `${who}님이 길을 놓았습니다.`;
        case 'BREAK': return `${who}님이 ${target}님의 장비를 고장 냈습니다.`;
        case 'REPAIR': return `${who}님이 ${target}님의 장비를 수리했습니다.`;
        case 'MAP': return `${who}님이 지도를 확인했습니다.`;
        case 'ROCKFALL': return `${who}님이 낙석으로 길을 제거했습니다.`;
        case 'DISCARD': return `${who}님이 카드 한 장을 버렸습니다.`;
        case 'TAKE_GOLD': return `${who}님이 금 카드를 선택했습니다.`;
    }
}

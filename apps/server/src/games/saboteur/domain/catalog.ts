import { SaboteurCardSchema, SaboteurGoldSchema, type SaboteurCard, type SaboteurPath, SABOTEUR_TOOLS } from '@hangul-rummikub/shared';
import * as v from 'valibot';
export const PATH_COUNTS: Readonly<Record<SaboteurPath, number>> = { NS: 4, NSE: 5, NESW: 5, ES: 4, WS: 5, NEW: 5, EW: 3, DEAD_S: 1, DEAD_NSW: 1, DEAD_ALL: 1, DEAD_ES: 1, DEAD_WS: 1, DEAD_W: 1, DEAD_NS: 1, DEAD_N: 1, DEAD_EW: 1 };
export function makeSaboteurCards(id: () => string): SaboteurCard[] {
    const cards: SaboteurCard[] = [];
    for (const [path, count] of Object.entries(PATH_COUNTS))
        for (let i = 0; i < count; i++)
            cards.push(v.parse(SaboteurCardSchema, { kind: 'PATH', cardId: id(), path }));
    for (const tool of SABOTEUR_TOOLS) {
        for (let i = 0; i < 3; i++)
            cards.push(v.parse(SaboteurCardSchema, { kind: 'BREAK', cardId: id(), tool }));
        for (let i = 0; i < 2; i++)
            cards.push(v.parse(SaboteurCardSchema, { kind: 'REPAIR', cardId: id(), tools: [tool] }));
    }
    for (let i = 0; i < 3; i++)
        cards.push(v.parse(SaboteurCardSchema, { kind: 'REPAIR', cardId: id(), tools: [SABOTEUR_TOOLS[i], SABOTEUR_TOOLS[(i + 1) % 3]] }));
    for (let i = 0; i < 6; i++)
        cards.push(v.parse(SaboteurCardSchema, { kind: 'MAP', cardId: id() }));
    for (let i = 0; i < 3; i++)
        cards.push(v.parse(SaboteurCardSchema, { kind: 'ROCKFALL', cardId: id() }));
    return cards;
}
export function makeSaboteurGold(id: () => string) { return [1, 2, 3].flatMap(value => Array.from({ length: value === 1 ? 16 : value === 2 ? 8 : 4 }, () => v.parse(SaboteurGoldSchema, { cardId: id(), value }))); }
export function saboteurRoles(count: number): ('MINER' | 'SABOTEUR')[] {
    const sab = [1, 1, 2, 2, 3, 3, 3, 4][count - 3];
    if (sab === undefined)
        throw new Error('Saboteur needs 3–10 players.');
    return [...Array.from({ length: sab }, () => 'SABOTEUR' as const), ...Array.from({ length: count + 1 - sab }, () => 'MINER' as const)];
}
export function cardSignature(c: SaboteurCard): string { return c.kind === 'PATH' ? `PATH:${c.path}` : c.kind === 'BREAK' ? `BREAK:${c.tool}` : c.kind === 'REPAIR' ? `REPAIR:${[...c.tools].sort().join(',')}` : c.kind; }

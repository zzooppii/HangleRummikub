import * as v from "valibot";
export const VEGAS_FACES = [1, 2, 3, 4, 5, 6] as const;
export const VegasFaceSchema = v.picklist(VEGAS_FACES);
export type VegasFace = v.InferOutput<typeof VegasFaceSchema>;
export const VEGAS_TURN_DURATION_MS = 30000;
export const VegasActionSchema = v.variant("kind", [
    v.strictObject({ kind: v.literal("ROLL") }),
    v.strictObject({ kind: v.literal("PLACE"), face: VegasFaceSchema }),
]);
export type VegasAction = v.InferOutput<typeof VegasActionSchema>;
/** Public calculation only: equal positive counts ALL cancel, including lower ranks. */
export function vegasPayout(counts: readonly number[], banknotes: readonly number[]) {
    const excluded = counts.map(n => n > 0 && counts.filter(c => c === n).length > 1);
    const ranked = counts.map((count, index) => ({ count, index }))
        .filter(p => p.count > 0 && !excluded[p.index]).sort((a, b) => b.count - a.count);
    const notes = [...banknotes].sort((a, b) => b - a);
    return { excluded, awards: ranked.slice(0, notes.length).map((p, i) => ({ playerIndex: p.index, amount: notes[i]! })), returned: notes.slice(ranked.length) };
}

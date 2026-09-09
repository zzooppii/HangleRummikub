import * as v from "valibot";

export const DRAW_COLORS = ["#202838", "#ffffff", "#e65353", "#edaa35", "#45a977", "#4286d5", "#9363c5", "#ed86ac"] as const;
export const DRAW_WIDTHS = [4, 10, 22] as const;
const coordinate = (max: number) => v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(max));
export const DrawingStrokeSchema = v.strictObject({
  strokeId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  tool: v.picklist(["PEN", "ERASER"]),
  color: v.picklist(DRAW_COLORS),
  width: v.picklist(DRAW_WIDTHS),
  points: v.pipe(v.array(v.strictObject({ x: coordinate(1000), y: coordinate(700) })), v.minLength(1), v.maxLength(1000)),
});
export const DrawingSchema = v.pipe(v.strictObject({
  strokes: v.pipe(v.array(DrawingStrokeSchema), v.maxLength(250)),
}), v.check(doc => doc.strokes.reduce((n, s) => n + s.points.length, 0) <= 12000
  && new Set(doc.strokes.map(s => s.strokeId)).size === doc.strokes.length, "Drawing limits exceeded."));
export type Drawing = v.InferOutput<typeof DrawingSchema>;
export const GuessSchema = v.pipe(v.string(), v.maxLength(160), v.transform(s => s.normalize("NFC").replace(/\s+/gu, " ").trim()),
  v.check(s => Array.from(s).length >= 1 && Array.from(s).length <= 40));
export function parseDrawing(value: unknown): Drawing { return v.parse(DrawingSchema, value); }

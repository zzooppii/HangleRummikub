import type { Drawing } from "@hangul-rummikub/shared";
export const BLANK_DRAWING: Drawing = { strokes: [] };
export function logicalPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) {
  return { x: Math.round(Math.max(0, Math.min(1000, (clientX - rect.left) / Math.max(1, rect.width) * 1000))),
    y: Math.round(Math.max(0, Math.min(700, (clientY - rect.top) / Math.max(1, rect.height) * 700))) };
}
export function appendStroke(drawing: Drawing, stroke: Drawing["strokes"][number]): Drawing {
  if (drawing.strokes.length >= 250 || drawing.strokes.reduce((n, s) => n + s.points.length, 0) + stroke.points.length > 12000) return drawing;
  return { strokes: [...drawing.strokes, stroke] };
}
export function undoStroke(drawing: Drawing): Drawing { return { strokes: drawing.strokes.slice(0, -1) }; }
export function paintDrawing(ctx: CanvasRenderingContext2D, drawing: Drawing): void {
  ctx.clearRect(0, 0, 1000, 700); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 1000, 700);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const stroke of drawing.strokes) {
    ctx.strokeStyle = stroke.tool === "ERASER" ? "#ffffff" : stroke.color; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = stroke.width;
    const first = stroke.points[0]; if (!first) continue;
    if (stroke.points.length === 1) { ctx.beginPath(); ctx.arc(first.x, first.y, stroke.width / 2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(first.x, first.y); for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y); ctx.stroke(); }
  }
}

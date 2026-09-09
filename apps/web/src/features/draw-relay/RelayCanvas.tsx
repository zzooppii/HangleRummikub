import { useEffect, useRef, type PointerEvent } from "react";
import type { Drawing } from "@hangul-rummikub/shared";
import { appendStroke, logicalPoint, paintDrawing } from "./drawing.js";
export function RelayCanvas(props: { drawing: Drawing; editable?: boolean; tool?: "PEN" | "ERASER"; color?: Drawing["strokes"][number]["color"]; width?: 4 | 10 | 22; onChange?: (drawing: Drawing) => void; onPencil?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), active = useRef<{ id: number; stroke: Drawing["strokes"][number] } | null>(null);
  const latest = useRef(props); latest.current = props;
  useEffect(() => { const ctx = canvas.current?.getContext("2d"); if (ctx) paintDrawing(ctx, props.drawing); }, [props.drawing]);
  useEffect(() => { if (!props.editable) active.current = null; }, [props.editable]);
  const point = (e: PointerEvent<HTMLCanvasElement>) => logicalPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
  function down(e: PointerEvent<HTMLCanvasElement>) {
    if (!props.editable || active.current || e.button !== 0 || props.drawing.strokes.length >= 250) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    active.current = { id: e.pointerId, stroke: { strokeId: crypto.randomUUID(), tool: props.tool ?? "PEN", color: props.color ?? "#202838", width: props.width ?? 4, points: [point(e)] } };
    props.onPencil?.(); redraw();
  }
  function redraw() { const ctx = canvas.current?.getContext("2d"); if (ctx) paintDrawing(ctx, active.current ? appendStroke(latest.current.drawing, active.current.stroke) : latest.current.drawing); }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    const current = active.current; if (!current || current.id !== e.pointerId) return;
    e.preventDefault(); const p = point(e), last = current.stroke.points.at(-1)!;
    if (current.stroke.points.length < 1000 && Math.hypot(p.x - last.x, p.y - last.y) >= 2) { current.stroke.points.push(p); redraw(); }
  }
  function up(e: PointerEvent<HTMLCanvasElement>) {
    const current = active.current; if (!current || current.id !== e.pointerId) return;
    active.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const next = appendStroke(latest.current.drawing, current.stroke); latest.current.onChange?.(next);
  }
  return <canvas ref={canvas} className={`relay-canvas${props.editable ? " editable" : ""}`} width={1000} height={700}
    aria-label={props.editable ? "그림 그리기 영역" : "전달받은 그림"} role="img" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>그림을 표시하는 캔버스입니다.</canvas>;
}

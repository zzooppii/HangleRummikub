import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  CARCASSONNE_CATALOG,
  carcassonneFrontier,
  carcassonneRegionKey,
  legalCarcassonnePlacements,
  type CarcassonneBoardTile,
  type CarcassonneProjection,
  type CarcassonneRotation,
} from "@hangul-rummikub/shared";
import { CarcassonneTileArt } from "./art.js";
import { CARCASSONNE_PLAYER_COLORS } from "./ui.js";
type Props = {
  game: CarcassonneProjection;
  rotation: CarcassonneRotation;
  draft: CarcassonneBoardTile | null;
  meepleRegionId: string | null;
  selfId: string;
  enabled: boolean;
  highlight: readonly string[];
  onPlace(x: number, y: number): void;
  onInspect(tile: CarcassonneBoardTile): void;
};
const size = 84;
export function CarcassonneBoard({
  game: g,
  rotation,
  draft,
  meepleRegionId,
  selfId,
  enabled,
  highlight,
  onPlace,
  onInspect,
}: Props) {
  const viewport = useRef<HTMLDivElement>(null),
    [camera, setCamera] = useState({ x: -42, y: -42, zoom: 1 }),
    cameraRef = useRef(camera);
  cameraRef.current = camera;
  const pointers = useRef(new Map<number, { x: number; y: number }>()),
    gesture = useRef<{
      x: number;
      y: number;
      camera: typeof camera;
      distance: number;
      midX: number;
      midY: number;
    } | null>(null),
    suppressClickUntil = useRef(0);
  const frontier = useMemo(() => carcassonneFrontier(g.board), [g.board]);
  const legal = useMemo(
    () =>
      new Set(
        (g.currentTile
          ? legalCarcassonnePlacements(g.board, g.currentTile)
          : []
        )
          .filter((t) => t.rotation === rotation)
          .map((t) => t.x + "," + t.y),
      ),
    [g.board, g.currentTile, rotation],
  );
  const boardRef = useRef(g.board);
  boardRef.current = g.board;
  function focus(x: number, y: number, zoom = cameraRef.current.zoom) {
    setCamera({
      x: -(x + 0.5) * size * zoom,
      y: -(y + 0.5) * size * zoom,
      zoom,
    });
  }
  function fit() {
    const box = viewport.current?.getBoundingClientRect();
    if (!box) return;
    const tiles = boardRef.current,
      minX = Math.min(...tiles.map((t) => t.x)) - 1,
      maxX = Math.max(...tiles.map((t) => t.x)) + 1,
      minY = Math.min(...tiles.map((t) => t.y)) - 1,
      maxY = Math.max(...tiles.map((t) => t.y)) + 1;
    const zoom = Math.min(
      1.25,
      Math.max(
        0.22,
        Math.min(
          box.width / ((maxX - minX + 1) * size),
          box.height / ((maxY - minY + 1) * size),
        ),
      ),
    );
    setCamera({
      x: (-(minX + maxX + 1) / 2) * size * zoom,
      y: (-(minY + maxY + 1) / 2) * size * zoom,
      zoom,
    });
  }
  useEffect(() => {
    fit();
  }, []);
  function zoomBy(factor: number) {
    const current = cameraRef.current,
      zoom = Math.max(0.22, Math.min(2.4, current.zoom * factor)),
      ratio = zoom / current.zoom;
    setCamera({ x: current.x * ratio, y: current.y * ratio, zoom });
  }
  useEffect(() => {
    const target = viewport.current;
    if (!target) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = cameraRef.current,
        zoom = Math.max(
          0.22,
          Math.min(2.4, c.zoom * Math.exp(-e.deltaY * 0.0015)),
        ),
        bounds = target.getBoundingClientRect(),
        x = e.clientX - bounds.left - bounds.width / 2,
        y = e.clientY - bounds.top - bounds.height / 2,
        ratio = zoom / c.zoom;
      setCamera({ x: x - (x - c.x) * ratio, y: y - (y - c.y) * ratio, zoom });
    };
    target.addEventListener("wheel", wheel, { passive: false });
    return () => target.removeEventListener("wheel", wheel);
  }, []);
  function begin(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const values = [...pointers.current.values()],
      a = values[0]!,
      b = values[1] ?? a;
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      camera: cameraRef.current,
      distance: Math.hypot(b.x - a.x, b.y - a.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  }
  function drag(e: PointerEvent<HTMLDivElement>) {
    const gestureState = gesture.current;
    if (!gestureState || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const values = [...pointers.current.values()];
    if (values.length === 2 && gestureState.distance > 0) {
      const a = values[0]!,
        b = values[1]!,
        bounds = e.currentTarget.getBoundingClientRect(),
        zoom = Math.max(
          0.22,
          Math.min(
            2.4,
            (gestureState.camera.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
              gestureState.distance,
          ),
        ),
        ratio = zoom / gestureState.camera.zoom,
        baseX = gestureState.midX - bounds.left - bounds.width / 2,
        baseY = gestureState.midY - bounds.top - bounds.height / 2;
      setCamera({
        zoom,
        x:
          (a.x + b.x) / 2 -
          bounds.left -
          bounds.width / 2 -
          (baseX - gestureState.camera.x) * ratio,
        y:
          (a.y + b.y) / 2 -
          bounds.top -
          bounds.height / 2 -
          (baseY - gestureState.camera.y) * ratio,
      });
      suppressClickUntil.current = performance.now() + 300;
    } else {
      const dx = e.clientX - gestureState.x,
        dy = e.clientY - gestureState.y;
      if (Math.abs(dx) + Math.abs(dy) < 5) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setCamera({
        ...gestureState.camera,
        x: gestureState.camera.x + dx,
        y: gestureState.camera.y + dy,
      });
      suppressClickUntil.current = performance.now() + 300;
    }
  }
  function end(e: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  const playerIndex = (id: string) =>
    Math.max(
      0,
      g.playerStates.findIndex((p) => p.playerId === id),
    );
  const position = (t: { x: number; y: number }): CSSProperties => ({
    left: t.x * size,
    top: t.y * size,
    width: size,
    height: size,
  });
  return (
    <section className="cc-map-panel" aria-label="공동 지도">
      <div className="cc-map-toolbar">
        <div>
          <span className="cc-eyebrow">OUR COUNTRYSIDE</span>
          <strong>함께 만드는 풍경</strong>
        </div>
        <div className="cc-map-tools">
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.25)}
            aria-label="지도 축소"
          >
            −
          </button>
          <output aria-label="지도 확대 비율">
            {Math.round(camera.zoom * 100)}%
          </output>
          <button
            type="button"
            onClick={() => zoomBy(1.25)}
            aria-label="지도 확대"
          >
            +
          </button>
          <button type="button" onClick={fit}>
            전체 보기
          </button>
          <button
            type="button"
            onClick={() => {
              const tile = g.feedback?.tile ?? g.board[0]!;
              focus(tile.x, tile.y, 1.1);
            }}
          >
            최근 타일
          </button>
        </div>
      </div>
      <div
        className="cc-map-viewport"
        ref={viewport}
        onPointerDown={begin}
        onPointerMove={drag}
        onPointerUp={end}
        onPointerCancel={end}
        onClickCapture={(e) => {
          if (performance.now() < suppressClickUntil.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <div className="cc-compass" aria-hidden="true">
          <span>N</span>
          <span>✧</span>
        </div>
        <div
          className="cc-map-world"
          style={{
            transform:
              "translate(" +
              camera.x +
              "px," +
              camera.y +
              "px) scale(" +
              camera.zoom +
              ")",
          }}
        >
          {g.board.map((t) => {
            const tokens = g.meeples
              .filter((m) => m.tileId === t.tileId)
              .map((m) => ({
                regionId: m.regionId,
                color: CARCASSONNE_PLAYER_COLORS[playerIndex(m.playerId)]!,
                number: playerIndex(m.playerId) + 1,
              }));
            return (
              <button
                type="button"
                key={t.tileId}
                className={
                  "cc-map-tile" +
                  (g.feedback?.tile.tileId === t.tileId ? " cc-last-tile" : "")
                }
                style={position(t)}
                aria-label={
                  "배치된 " +
                  CARCASSONNE_CATALOG[t.kind].label +
                  " · " +
                  t.x +
                  ", " +
                  t.y +
                  " · 영역 살펴보기"
                }
                onClick={() => onInspect(t)}
              >
                <CarcassonneTileArt
                  kind={t.kind}
                  rotation={t.rotation}
                  tokens={tokens}
                  highlight={CARCASSONNE_CATALOG[t.kind].regions
                    .filter((r) =>
                      highlight.includes(carcassonneRegionKey(t.tileId, r.id)),
                    )
                    .map((r) => r.id)}
                />
                {g.feedback?.tile.tileId === t.tileId && (
                  <span className="cc-last-mark" aria-hidden="true">
                    ✦
                  </span>
                )}
              </button>
            );
          })}
          {g.phase === "PLAYING" &&
            frontier.map((p) => {
              const selected = draft?.x === p.x && draft.y === p.y,
                allowed = legal.has(p.x + "," + p.y),
                tokens =
                  selected && meepleRegionId
                    ? [
                        {
                          regionId: meepleRegionId,
                          color:
                            CARCASSONNE_PLAYER_COLORS[playerIndex(selfId)]!,
                          number: playerIndex(selfId) + 1,
                        },
                      ]
                    : [];
              return (
                <button
                  type="button"
                  key={p.x + "," + p.y}
                  className={
                    "cc-map-target" +
                    (allowed ? " cc-legal" : "") +
                    (selected ? " cc-draft" : "")
                  }
                  style={position(p)}
                  disabled={!enabled || !allowed}
                  onClick={() => onPlace(p.x, p.y)}
                  aria-label={
                    "빈칸 " +
                    p.x +
                    ", " +
                    p.y +
                    (allowed ? " · 배치 가능" : " · 회전이 필요합니다")
                  }
                  aria-pressed={selected}
                >
                  {selected && draft ? (
                    <CarcassonneTileArt
                      kind={draft.kind}
                      rotation={draft.rotation}
                      tokens={tokens}
                    />
                  ) : allowed ? (
                    <span aria-hidden="true">+</span>
                  ) : (
                    <span className="cc-target-dot" aria-hidden="true" />
                  )}
                </button>
              );
            })}
        </div>
        <div className="cc-map-hint">
          드래그로 이동 · 휠 / 두 손가락으로 확대
        </div>
      </div>
      <div className="cc-map-foot">
        <span>
          <i /> 점선은 현재 방향으로 놓을 수 있는 자리
        </span>
        <span>✦ 마지막 타일 · 타일을 눌러 영역 보기</span>
      </div>
    </section>
  );
}

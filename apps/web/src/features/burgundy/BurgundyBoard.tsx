import { useState, type CSSProperties } from "react";
import {
  burgundyBoard,
  type BurgundyPlayer,
  type BurgundyTile,
} from "@hangul-rummikub/shared";
import { BurgundyDie, BurgundyTileArt } from "./art.js";
import {
  BURGUNDY_COLOR_HEX,
  BURGUNDY_COLOR_LABELS,
  burgundyTileName,
} from "./ui.js";
type Props = {
  player: BurgundyPlayer;
  selectedCell: string | null;
  selectedTile: BurgundyTile | null;
  legalCells: ReadonlySet<string>;
  onCell(id: string): void;
  onInspect(tile: BurgundyTile): void;
  interactive: boolean;
};
export function BurgundyBoard({
  player,
  selectedCell,
  selectedTile,
  legalCells,
  onCell,
  onInspect,
  interactive,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const board = burgundyBoard(player.boardId);
  const coords = board.cells.map((c) => ({
    cell: c,
    x: Math.sqrt(3) * (c.q + c.r / 2) * 31,
    y: c.r * 46.5,
  }));
  const minX = Math.min(...coords.map((c) => c.x)) - 29,
    minY = Math.min(...coords.map((c) => c.y)) - 32,
    width = Math.max(...coords.map((c) => c.x)) - minX + 29,
    height = Math.max(...coords.map((c) => c.y)) - minY + 32;
  return (
    <div className="bu-estate">
      <div className="bu-board-toolbar">
        <span>
          {board.name} · {player.board.length}/37
        </span>
        <div>
          <button
            type="button"
            aria-label="영지 축소"
            onClick={() => setZoom((z) => Math.max(0.8, z - 0.2))}
          >
            −
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            전체
          </button>
          <button
            type="button"
            aria-label="영지 확대"
            onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
          >
            ＋
          </button>
        </div>
      </div>
      <div className="bu-board-scroll">
        <div
          className="bu-board-world"
          style={{ width: width * zoom, height: height * zoom }}
        >
          {coords.map(({ cell, x, y }) => {
            const post = board.borderPostGroups?.findIndex((group) =>
              group.includes(cell.id),
            );
            const placed = player.board.find((p) => p.cellId === cell.id)?.tile;
            const preview =
              selectedCell === cell.id && !placed ? selectedTile : null;
            return (
              <button
                type="button"
                key={cell.id}
                className={
                  "bu-cell" +
                  (placed ? " bu-occupied" : "") +
                  (legalCells.has(cell.id) ? " bu-legal" : "") +
                  (preview ? " bu-preview" : "")
                }
                style={
                  {
                    left: (x - minX - 27) * zoom,
                    top: (y - minY - 31) * zoom,
                    width: 54 * zoom,
                    height: 62 * zoom,
                    "--bu-cell": BURGUNDY_COLOR_HEX[cell.color],
                  } as CSSProperties
                }
                aria-label={`${BURGUNDY_COLOR_LABELS[cell.color]} ${cell.die}번 칸 ${placed ? burgundyTileName(placed) : "빈칸"}${legalCells.has(cell.id) ? " · 배치 가능" : ""}`}
                aria-pressed={selectedCell === cell.id}
                onClick={() =>
                  placed ? onInspect(placed) : interactive && onCell(cell.id)
                }
              >
                {placed || preview ? (
                  <BurgundyTileArt tile={(placed ?? preview)!} small />
                ) : (
                  <>
                    <BurgundyDie value={cell.die} />
                    <span className="bu-cell-label">
                      {BURGUNDY_COLOR_LABELS[cell.color]}
                    </span>
                  </>
                )}
                {post !== undefined && post >= 0 ? (
                  <b
                    className="bu-post-mark"
                    aria-label={`국경 초소 ${post + 1} 접점`}
                  >
                    {["Ⅰ", "Ⅱ", "Ⅲ"][post]}
                  </b>
                ) : null}
                {player.extension.shields.some(
                  (s) => s.castleCellId === cell.id,
                ) ? (
                  <b className="bu-shield-mark">
                    문장{" "}
                    {
                      player.extension.shields.find(
                        (s) => s.castleCellId === cell.id,
                      )?.shieldId
                    }
                  </b>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      {board.borderPostGroups ? (
        <p className="bu-border-help">
          같은 번호의 두 칸 중 한 곳이 초소 접점입니다. 두 초소를 잇고, 세 번째
          초소까지 연결하세요.
        </p>
      ) : null}
      <div className="bu-color-legend">
        {(
          [
            "CASTLE",
            "SHIP",
            "LIVESTOCK",
            "MONASTERY",
            "MINE",
            "BUILDING",
          ] as const
        ).map((c) => (
          <span key={c}>
            <i style={{ background: BURGUNDY_COLOR_HEX[c] }} />
            {BURGUNDY_COLOR_LABELS[c]}{" "}
            {
              player.board.filter(
                (t) =>
                  board.cells.find((cell) => cell.id === t.cellId)?.color === c,
              ).length
            }
            /{board.cells.filter((t) => t.color === c).length}
          </span>
        ))}
      </div>
    </div>
  );
}

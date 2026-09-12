import type { CSSProperties } from "react";
import { burgundyDefinition, type BurgundyTile } from "@hangul-rummikub/shared";
import { burgundySprite, burgundyTileName, BURGUNDY_COLOR_HEX } from "./ui.js";
export function BurgundyTileArt({
  tile,
  small = false,
}: {
  tile: BurgundyTile;
  small?: boolean;
}) {
  const i = burgundySprite(tile),
    d = burgundyDefinition(tile);
  return (
    <span
      className={
        "bu-tile-art" +
        (small ? " bu-small" : "") +
        (d.animal === "GOAT"
          ? " bu-goat"
          : d.animal === "GEESE"
            ? " bu-goose"
            : "")
      }
      style={
        {
          "--bu-tile": BURGUNDY_COLOR_HEX[d.color],
          "--bu-sprite-x": `${((i % 4) * 100) / 3}%`,
          "--bu-sprite-y": `${(Math.floor(i / 4) * 100) / 3}%`,
        } as CSSProperties
      }
      role="img"
      aria-label={burgundyTileName(tile)}
    >
      <span className="bu-illustration" />
      {d.knowledge ? (
        <b className="bu-tile-number">{d.knowledge}</b>
      ) : d.animals ? (
        <b className="bu-tile-number">{d.animals}</b>
      ) : null}
      <span className="bu-tile-name">{burgundyTileName(tile)}</span>
    </span>
  );
}
export function BurgundyDie({
  value,
  used = false,
}: {
  value: number;
  used?: boolean;
}) {
  const positions: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  return (
    <span
      className={"bu-die" + (used ? " bu-used" : "")}
      aria-label={`주사위 ${value}${used ? " 사용됨" : ""}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={positions[value]?.includes(i) ? "bu-pip" : ""} />
      ))}
    </span>
  );
}

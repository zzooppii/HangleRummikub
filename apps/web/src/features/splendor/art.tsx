import type { CSSProperties } from "react";
import { SPLENDOR_TOKENS, type SplendorToken } from "@hangul-rummikub/shared";
import { TOKEN_LABELS } from "./ui.js";
export function Gem({
  color,
  className = "",
}: {
  color: SplendorToken;
  className?: string;
}) {
  const index = SPLENDOR_TOKENS.indexOf(color);
  return (
    <span
      className={`sp-gem sp-gem-${color.toLowerCase()} ${className}`}
      role="img"
      aria-label={TOKEN_LABELS[color]}
      style={{
        backgroundPosition: `${(index % 3) * 50}% ${Math.floor(index / 3) * 100}%`,
      }}
    />
  );
}
export function Portrait({
  index,
  className = "",
}: {
  index: number;
  className?: string;
}) {
  return (
    <span
      className={`sp-portrait ${className}`}
      aria-hidden="true"
      style={{
        backgroundPosition: `${(index % 5) * 25}% ${Math.floor(index / 5) * 100}%`,
      }}
    />
  );
}
export function Scene({
  index,
  className = "",
}: {
  index: number;
  className?: string;
}) {
  return (
    <span
      className={`sp-scene ${className}`}
      aria-hidden="true"
      style={{
        backgroundPosition: `${(index % 3) * 50}% ${Math.floor(index / 3) * 100}%`,
      }}
    />
  );
}
export function TokenBadge({
  color,
  count,
  plus = false,
}: {
  color: SplendorToken;
  count: number;
  plus?: boolean;
}) {
  return (
    <span
      className={`sp-token-badge ${color.toLowerCase()}`}
      aria-label={`${TOKEN_LABELS[color]} ${plus ? "+" : ""}${count}`}
    >
      <Gem color={color} />
      <b>
        {plus ? "+" : ""}
        {count}
      </b>
    </span>
  );
}
type CardStyle = CSSProperties & { "--sp-card-color": string };
export const cardColor = (color: SplendorToken): CardStyle => ({
  "--sp-card-color": {
    WHITE: "#e2eaf1",
    BLUE: "#4e9cd7",
    GREEN: "#4bca9b",
    RED: "#ef6878",
    BLACK: "#9396ab",
    GOLD: "#e8c365",
  }[color],
});

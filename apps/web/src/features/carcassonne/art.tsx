import { useId } from "react";
import {
  CARCASSONNE_CATALOG,
  rotateCarcassonnePoint,
  type CarcassonneTileKind,
  type CarcassonneRotation,
} from "@hangul-rummikub/shared";
export function CarcassonneMeepleArt({
  color,
  farmer = false,
  number,
}: {
  color: string;
  farmer?: boolean;
  number?: number;
}) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="cc-meeple-art">
      <g transform={farmer ? "rotate(90 24 24)" : ""}>
        <ellipse cx="24" cy="42" rx="16" ry="3" fill="#16281c" opacity=".22" />
        <path
          d="M18 15c-4-6-1-12 6-12s10 6 6 12l12 10-5 7-7-5 5 15H13l5-15-7 5-5-7Z"
          fill={color}
          stroke="#fff2cb"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M20 7q4-3 8 0M12 25l7-6M18 36h12"
          stroke="#fff"
          strokeWidth="2"
          fill="none"
          opacity=".3"
        />
        {number !== undefined && (
          <text
            x="24"
            y="29"
            textAnchor="middle"
            fill="#fff"
            fontSize="13"
            fontWeight="800"
          >
            {number}
          </text>
        )}
      </g>
    </svg>
  );
}
export function CarcassonneTileArt({
  kind,
  rotation = 0,
  highlight = [],
  tokens = [],
}: {
  kind: CarcassonneTileKind;
  rotation?: CarcassonneRotation;
  highlight?: readonly string[];
  tokens?: readonly { regionId: string; color: string; number: number }[];
}) {
  const id = useId().replace(/:/g, ""),
    tile = CARCASSONNE_CATALOG[kind],
    cities = tile.regions.filter((r) => r.kind === "CITY"),
    roads = tile.regions.filter((r) => r.kind === "ROAD");
  const speck = kind.charCodeAt(0);
  return (
    <svg
      viewBox="0 0 100 100"
      className="cc-tile-art"
      role="img"
      aria-label={tile.label + " 타일 " + rotation + "도"}
    >
      <defs>
        <linearGradient id={id + "grass"} x2="1" y2="1">
          <stop stopColor="#cad491" />
          <stop offset=".52" stopColor="#a7bf76" />
          <stop offset="1" stopColor="#90ab64" />
        </linearGradient>
        <linearGradient id={id + "stone"} x2=".5" y2="1">
          <stop stopColor="#e2cda3" />
          <stop offset="1" stopColor="#c4a477" />
        </linearGradient>
        <pattern
          id={id + "grain"}
          width="9"
          height="11"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="m2 4 1-2m3 6 2-1"
            stroke="#536f3b"
            strokeWidth=".6"
            opacity=".2"
          />
          <circle cx="7" cy="2" r=".55" fill="#f8f0cc" opacity=".6" />
        </pattern>
        <mask id={id + "field"}>
          <rect width="100" height="100" fill="white" />
          {cities.map((r) => (
            <path
              key={r.id}
              d={r.path}
              fill="black"
              stroke="black"
              strokeWidth="3"
            />
          ))}
          {roads.map((r) => (
            <path
              key={r.id}
              d={r.path}
              stroke="black"
              strokeWidth="8"
              fill="none"
            />
          ))}
          {tile.regions.some((r) => r.kind === "MONASTERY") && (
            <rect x="28" y="25" width="44" height="42" fill="black" />
          )}
        </mask>
        {cities.map((r) => (
          <clipPath key={r.id} id={id + r.id}>
            <path d={r.path} />
          </clipPath>
        ))}
      </defs>
      <g transform={"rotate(" + rotation + " 50 50)"}>
        <rect width="100" height="100" fill={"url(#" + id + "grass)"} />
        <rect width="100" height="100" fill={"url(#" + id + "grain)"} />
        <g mask={"url(#" + id + "field)"}>
          <path
            d="M0 71Q30 59 58 72T100 69M0 75Q30 63 58 76T100 73"
            stroke="#d9dfa4"
            strokeWidth="1"
            opacity=".55"
            fill="none"
          />
          {Array.from({ length: 9 }, (_, i) => {
            const x = ((speck * 7 + i * 31) % 92) + 4,
              y = ((speck * 11 + i * 23) % 92) + 4;
            return (
              <g key={i} transform={"translate(" + x + " " + y + ")"}>
                <ellipse cy="3" rx="3.4" ry="1.6" fill="#476437" opacity=".2" />
                <path d="M0 3v-6" stroke="#705b37" strokeWidth="1" />
                <path d="M-3 0 0-7 3 0Z" fill={i % 2 ? "#547346" : "#6e8c4f"} />
                <path d="M0-6v5" stroke="#93aa65" strokeWidth=".6" />
              </g>
            );
          })}
        </g>
        {cities.map((r) => (
          <g key={r.id}>
            <path
              d={r.path}
              fill={"url(#" + id + "stone)"}
              stroke="#8b7454"
              strokeWidth="3.4"
            />
            <path d={r.path} fill="none" stroke="#f6e7bc" strokeWidth="1.1" />
            <path
              d={r.path}
              fill="none"
              stroke="#897456"
              strokeWidth="4"
              strokeDasharray="2 4"
            />
            <g clipPath={"url(#" + id + r.id + ")"}>
              {Array.from({ length: 16 }, (_, i) => {
                const x = 10 + (i % 4) * 25 + (i % 2 ? 3 : 0),
                  y = 9 + Math.floor(i / 4) * 25;
                return (
                  <g
                    key={i}
                    transform={
                      "translate(" +
                      x +
                      " " +
                      y +
                      ") rotate(" +
                      (i % 2 ? 9 : -7) +
                      ")"
                    }
                  >
                    <rect
                      x="-6"
                      y="-3"
                      width="12"
                      height="12"
                      rx="1"
                      fill="#9a805d"
                      opacity=".25"
                    />
                    <rect x="-6" y="-7" width="10" height="12" fill="#ecd5a4" />
                    <path
                      d="m-8-7 7-6 7 6Z"
                      fill={i % 3 ? "#ad6447" : "#805c43"}
                    />
                    <path d="M-3-2h3v4h-3Z" fill="#716349" />
                    <path d="m-7-8 6-4" stroke="#da9d69" strokeWidth="1" />
                  </g>
                );
              })}
            </g>
            {r.shields > 0 && (
              <g transform={"translate(" + r.point[0] + " " + r.point[1] + ")"}>
                <path
                  d="M-6-8H6V1Q5 6 0 9Q-5 6-6 1Z"
                  fill="#386685"
                  stroke="#f8e5a5"
                  strokeWidth="1.7"
                />
                <path d="M0-6V6M-4-1H4" stroke="#f8e5a5" strokeWidth="1.5" />
              </g>
            )}
          </g>
        ))}
        {roads.map((r) => (
          <g key={r.id}>
            <path d={r.path} stroke="#7e8a59" strokeWidth="9" fill="none" />
            <path d={r.path} stroke="#f5e7bd" strokeWidth="6.5" fill="none" />
            <path
              d={r.path}
              stroke="#d8c299"
              strokeWidth=".9"
              strokeDasharray="2 3"
              fill="none"
            />
          </g>
        ))}
        {roads.length > 1 && (
          <g>
            <circle cx="50" cy="50" r="7" fill="#c9b084" />
            <path d="M43 52V44l7-5 7 5v8Z" fill="#e8cc91" />
            <path d="m41 44 9-7 9 7Z" fill="#a35f41" />
            <path d="M48 52v-6h4v6" fill="#715f44" />
          </g>
        )}
        {tile.regions.some((r) => r.kind === "MONASTERY") && (
          <g>
            <ellipse
              cx="51"
              cy="63"
              rx="24"
              ry="6"
              fill="#566c3e"
              opacity=".3"
            />
            <path d="M30 40H70V63H30Z" fill="#eee0b5" stroke="#a38d66" />
            <path d="m27 40 22-15 25 15Z" fill="#a46848" />
            <path d="M42 24h14v36H42Z" fill="#f5e7bd" stroke="#a38d66" />
            <path d="m39 24 10-12 10 12Z" fill="#80553e" />
            <path
              d="M47 34v-6h4v6M46 61V49q3-6 6 0v12M34 46h4v6h-4M60 46h4v6h-4"
              fill="#736a4e"
            />
            <path d="M49 13V6m-3 3h6" stroke="#826445" strokeWidth="1.5" />
          </g>
        )}
        {tile.regions
          .filter((r) => highlight.includes(r.id))
          .map((r) => (
            <path
              key={r.id}
              d={r.path}
              mask={r.kind === "FIELD" ? "url(#" + id + "field)" : undefined}
              fill={r.kind === "ROAD" ? "none" : "#fff397"}
              fillOpacity=".45"
              stroke="#fff7ba"
              strokeWidth={r.kind === "ROAD" ? 5 : 2.2}
              strokeDasharray={r.kind === "ROAD" ? undefined : "4 2"}
            />
          ))}
        <rect
          x=".6"
          y=".6"
          width="98.8"
          height="98.8"
          fill="none"
          stroke="#f5eac5"
          strokeWidth="1.2"
          opacity=".7"
        />
      </g>
      {tokens.map((token, i) => {
        const region = tile.regions.find((r) => r.id === token.regionId);
        if (!region) return null;
        const [x, y] = rotateCarcassonnePoint(region.point, rotation);
        return (
          <svg
            key={i}
            x={Math.min(72, Math.max(0, x - 14))}
            y={Math.min(72, Math.max(0, y - 14))}
            width="28"
            height="28"
          >
            <CarcassonneMeepleArt
              color={token.color}
              farmer={region.kind === "FIELD"}
              number={token.number}
            />
          </svg>
        );
      })}
    </svg>
  );
}

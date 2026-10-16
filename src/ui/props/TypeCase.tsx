import { useMemo } from "react";
import { seededRandom } from "../../model/sampling";

const ROWS: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1],
  [1, 1, 2, 1, 1, 2, 1, 1, 1, 1],
  [1.5, 2, 1, 2, 1, 1.5, 2],
  [2, 1.5, 3, 1.5, 2, 1],
  [2, 3, 2, 1, 3],
];

// A job case with irregular compartments, like the real thing; purely a prop.
export function TypeCase({ label, width = 500, height = 304 }: { label: string; width?: number; height?: number }) {
  const compartments = useMemo(() => buildCompartments(width, height), [width, height]);
  return (
    <figure className="type-case">
      <svg viewBox={`0 0 ${width} ${height + 24}`} role="img" aria-label={label}>
        <rect x="1" y="1" width={width - 2} height={height - 2} fill="var(--brass-light)" stroke="var(--brass-dark)" strokeWidth="2" />
        <rect x="10" y="10" width={width - 20} height={height - 20} fill="var(--brass-dark)" opacity="0.35" />
        {compartments.map((c, i) => (
          <g key={i}>
            <rect x={c.x} y={c.y} width={c.w} height={c.h} fill="var(--paper-deep)" stroke="var(--brass-dark)" />
            {c.sorts.map((s, j) => (
              <rect key={j} x={s.x} y={s.y} width={s.w} height={s.h} fill="var(--metal)" opacity={s.o} transform={`rotate(${s.r} ${s.x} ${s.y})`} />
            ))}
          </g>
        ))}
        <rect x={width / 2 - 90} y={height - 2} width="180" height="22" fill="var(--brass)" stroke="var(--brass-dark)" />
        <text x={width / 2} y={height + 13} textAnchor="middle" fontSize="10" letterSpacing="1.2" fill="var(--ink)" fontFamily="IBM Plex Mono">
          {label.toUpperCase()}
        </text>
      </svg>
    </figure>
  );
}

function buildCompartments(width: number, height: number) {
  const random = seededRandom(42);
  const rowHeight = (height - 20) / ROWS.length;
  return ROWS.flatMap((row, r) => {
    const units = row.reduce((s, u) => s + u, 0);
    let x = 10;
    return row.map((u) => {
      const w = ((width - 20) * u) / units;
      const cell = { x: x + 3, y: 10 + r * rowHeight + 3, w: w - 6, h: rowHeight - 6 };
      x += w;
      const sorts = Array.from({ length: 3 + Math.floor(random() * 9) }, () => ({
        x: cell.x + 5 + random() * (cell.w - 18),
        y: cell.y + 5 + random() * (cell.h - 18),
        w: 6 + random() * 6,
        h: 7 + random() * 4,
        o: 0.55 + random() * 0.4,
        r: (random() - 0.5) * 50,
      }));
      return { ...cell, sorts };
    });
  });
}

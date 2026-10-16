import type { KeyboardEvent } from "react";
import { fanOpenness, type ShapedCandidate, type ShapedDistribution } from "../../model/sampling";
import { sortFace } from "../../model/tokenizers";

export const FAN_SIZE = 8;
// Wide benches sweep the fan from the caret; phones get a tighter fan with a shorter reach.
export const FAN_LAYOUTS = {
  wide: { width: 720, height: 480, reach: 200, arcTop: 84, rightRoom: 440 },
  compact: { width: 420, height: 400, reach: 110, arcTop: 74, rightRoom: 300 },
} as const;
export type FanLayout = keyof typeof FAN_LAYOUTS;

type TypographicFanProps = {
  readonly distribution: ShapedDistribution;
  readonly originX: number;
  readonly chosenTokenId: number | null;
  readonly onPick: (candidate: ShapedCandidate) => void;
  readonly label: string;
  readonly pulledLabel: string;
  readonly formatPercent: (p: number) => string;
  readonly layout: FanLayout;
};

// Words start on an arc just past the caret; the pivot sits behind it so the fan sweeps down the bench.
const MAX_SWEEP_DEGREES = 76;

export function fanGeometry(distribution: ShapedDistribution, originX: number, layout: FanLayout) {
  const { width, reach, arcTop, rightRoom } = FAN_LAYOUTS[layout];
  const shown = distribution.candidates.slice(0, FAN_SIZE);
  const open = fanOpenness(distribution, FAN_SIZE);
  const sweep = 3 + (MAX_SWEEP_DEGREES - 3) * open;
  const wordsStart = Math.min(Math.max(originX, reach + 10), width - rightRoom);
  const pivot = { x: wordsStart - reach, y: arcTop };
  const blades = shown.map((candidate, index) => ({
    candidate,
    angle: shown.length > 1 ? (sweep * index) / (shown.length - 1) : 0,
    fontSize: 14 + 96 * Math.sqrt(candidate.probability),
    opacity: Math.min(1, Math.max(0.06, candidate.probability * 60)),
  }));
  return { pivot, blades, sweep, reach };
}

export function TypographicFan(props: TypographicFanProps) {
  const { distribution, originX, chosenTokenId, onPick, label, pulledLabel, formatPercent, layout } = props;
  const { pivot, blades, sweep, reach } = fanGeometry(distribution, originX, layout);
  const box = FAN_LAYOUTS[layout];
  const radians = (sweep * Math.PI) / 180;
  const arcRadius = reach - 26;

  const pickWithKeyboard = (event: KeyboardEvent, candidate: ShapedCandidate) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPick(candidate);
    }
  };

  return (
    <svg className="fan" viewBox={`0 0 ${box.width} ${box.height}`} role="group" aria-label={label} data-testid="fan">
      <path
        d={`M${pivot.x + arcRadius} ${pivot.y} A ${arcRadius} ${arcRadius} 0 0 1 ${pivot.x + arcRadius * Math.cos(radians)} ${pivot.y + arcRadius * Math.sin(radians)}`}
        fill="none"
        stroke="var(--slate-light)"
        strokeWidth="0.8"
      />
      <line x1={Math.min(originX, box.width)} y1={0} x2={pivot.x + arcRadius} y2={pivot.y} stroke="var(--vermilion)" strokeWidth="1" strokeDasharray="2 3" />
      {[...blades].reverse().map(({ candidate, angle, fontSize, opacity }) => {
        const chosen = candidate.tokenId === chosenTokenId;
        const pulled = !candidate.inNucleus;
        const word = sortFace(candidate.text);
        const display = word.leadingSpace ? candidate.text.slice(1) : word.label;
        const approximateWidth = Math.max(1, display.length) * fontSize * 0.52;
        const percent = formatPercent(candidate.probability);
        return (
          <g
            key={candidate.tokenId}
            className={`blade${chosen ? " blade--chosen" : ""}${pulled ? " blade--pulled" : ""}`}
            transform={`rotate(${angle} ${pivot.x} ${pivot.y})`}
            role="button"
            tabIndex={pulled ? -1 : 0}
            aria-disabled={pulled}
            aria-label={`${display} ${percent}${pulled ? `, ${pulledLabel}` : ""}`}
            data-token-id={candidate.tokenId}
            data-rank={candidate.rank}
            opacity={chosen ? 1 : opacity}
            onClick={() => !pulled && onPick(candidate)}
            onKeyDown={(event) => !pulled && pickWithKeyboard(event, candidate)}
          >
            <line x1={pivot.x + arcRadius} x2={pivot.x + reach - 6} y1={pivot.y} y2={pivot.y} className="blade__rib" />
            <rect x={pivot.x + reach - 4} y={pivot.y - fontSize * 0.8} width={approximateWidth + 70} height={fontSize * 1.05} fill="transparent" />
            <text x={pivot.x + reach} y={pivot.y + fontSize * 0.08} fontSize={fontSize} className="blade__word">
              {word.leadingSpace && <tspan className="blade__space">·</tspan>}
              {display}
            </text>
            <text x={pivot.x + reach + approximateWidth + 14} y={pivot.y} className="blade__percent">
              {percent}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

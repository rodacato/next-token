import type { KeyboardEvent } from "react";
import { fanOpenness, type ShapedCandidate, type ShapedDistribution } from "../../model/sampling";
import { sortFace } from "../../model/tokenizers";

export const FAN_SIZE = 8;
export const FAN_VIEWBOX = { width: 860, height: 470 };

type TypographicFanProps = {
  readonly distribution: ShapedDistribution;
  readonly originX: number;
  readonly chosenTokenId: number | null;
  readonly onPick: (candidate: ShapedCandidate) => void;
  readonly label: string;
  readonly tailLabel: string;
  readonly pulledLabel: string;
  readonly formatPercent: (p: number) => string;
};

// Words start on an arc just past the caret; the pivot sits behind it so the fan sweeps down the bench.
const REACH = 230;
const ARC_TOP = 34;
const MAX_SWEEP_DEGREES = 82;

export function fanGeometry(distribution: ShapedDistribution, originX: number) {
  const shown = distribution.candidates.slice(0, FAN_SIZE);
  const open = fanOpenness(distribution, FAN_SIZE);
  const sweep = 3 + (MAX_SWEEP_DEGREES - 3) * open;
  const pivot = { x: Math.min(originX, FAN_VIEWBOX.width - 470) - REACH, y: ARC_TOP };
  const blades = shown.map((candidate, index) => ({
    candidate,
    angle: shown.length > 1 ? (sweep * index) / (shown.length - 1) : 0,
    fontSize: 13 + 92 * Math.sqrt(candidate.probability),
  }));
  return { pivot, blades, sweep };
}

export function TypographicFan(props: TypographicFanProps) {
  const { distribution, originX, chosenTokenId, onPick, label, tailLabel, pulledLabel, formatPercent } = props;
  const { pivot, blades, sweep } = fanGeometry(distribution, originX);
  const radians = (sweep * Math.PI) / 180;
  const arcRadius = REACH - 26;

  const pickWithKeyboard = (event: KeyboardEvent, candidate: ShapedCandidate) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPick(candidate);
    }
  };

  return (
    <svg className="fan" viewBox={`0 0 ${FAN_VIEWBOX.width} ${FAN_VIEWBOX.height}`} role="group" aria-label={label} data-testid="fan">
      <path
        d={`M${pivot.x + arcRadius} ${pivot.y} A ${arcRadius} ${arcRadius} 0 0 1 ${pivot.x + arcRadius * Math.cos(radians)} ${pivot.y + arcRadius * Math.sin(radians)}`}
        fill="none"
        stroke="var(--slate-light)"
        strokeWidth="0.8"
      />
      <line x1={originX} y1={0} x2={pivot.x + arcRadius} y2={pivot.y} stroke="var(--vermilion)" strokeWidth="1" strokeDasharray="2 3" />
      {[...blades].reverse().map(({ candidate, angle, fontSize }) => {
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
            onClick={() => !pulled && onPick(candidate)}
            onKeyDown={(event) => !pulled && pickWithKeyboard(event, candidate)}
          >
            <line x1={pivot.x + arcRadius} x2={pivot.x + REACH - 6} y1={pivot.y} y2={pivot.y} className="blade__rib" />
            <rect x={pivot.x + REACH - 4} y={pivot.y - fontSize * 0.8} width={approximateWidth + 70} height={fontSize * 1.05} fill="transparent" />
            <text x={pivot.x + REACH} y={pivot.y + fontSize * 0.08} fontSize={fontSize} className="blade__word">
              {word.leadingSpace && <tspan className="blade__space">·</tspan>}
              {display}
            </text>
            <text x={pivot.x + REACH + approximateWidth + 14} y={pivot.y} className="blade__percent">
              {percent}
            </text>
          </g>
        );
      })}
      <text x={pivot.x + REACH} y={FAN_VIEWBOX.height - 8} className="fan__tail">
        {tailLabel}
      </text>
    </svg>
  );
}

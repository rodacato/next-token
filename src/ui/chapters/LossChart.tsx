import { useI18n } from "../../i18n/I18nProvider";
import type { LossPoint } from "../../trainer/session";

const W = 720;
const H = 240;
const PAD = { left: 44, right: 16, top: 14, bottom: 30 };

// Train in ink, held-out in vermilion; the brass rule marks where held-out loss was lowest.
export function LossChart({ points, steps, lowest, stops }: { points: readonly LossPoint[]; steps: number; lowest: LossPoint | null; stops: readonly number[] }) {
  const { t, formatNumber } = useI18n();
  const top = Math.max(4.5, ...points.map((p) => Math.max(p.train, p.val)));
  const x = (step: number) => PAD.left + ((W - PAD.left - PAD.right) * step) / steps;
  const y = (loss: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - loss / top);
  const line = (key: "train" | "val") => points.map((p, i) => `${i ? "L" : "M"}${x(p.step).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const ticks = Array.from({ length: Math.floor(top) + 1 }, (_, i) => i);
  return (
    <figure className="loss-chart" data-testid="loss-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("trainer.chartLabel")}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="loss-chart__grid" />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="loss-chart__tick">
              {formatNumber(v)}
            </text>
          </g>
        ))}
        {stops.map((s) => (
          <text key={s} x={x(s)} y={H - 10} textAnchor="middle" className="loss-chart__tick">
            {formatNumber(s)}
          </text>
        ))}
        {lowest && (
          <g>
            <line x1={x(lowest.step)} x2={x(lowest.step)} y1={PAD.top} y2={H - PAD.bottom} className="loss-chart__lowest" />
            <text x={x(lowest.step) + 6} y={PAD.top + 12} className="loss-chart__label">
              {t("trainer.lowest", { step: formatNumber(lowest.step) })}
            </text>
          </g>
        )}
        <path d={line("train")} className="loss-chart__train" />
        <path d={line("val")} className="loss-chart__val" />
      </svg>
      <figcaption className="loss-chart__legend">
        <span className="is-train">{t("trainer.trainLoss")}</span>
        <span className="is-val">{t("trainer.valLoss")}</span>
        {points.length > 0 && <span>{t("trainer.now", { step: formatNumber(points.at(-1)?.step ?? 0), train: (points.at(-1)?.train ?? 0).toFixed(2), val: (points.at(-1)?.val ?? 0).toFixed(2) })}</span>}
      </figcaption>
    </figure>
  );
}

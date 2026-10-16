import { useState } from "react";
import type { LoraChapter } from "../../content/schema";
import { useI18n } from "../../i18n/I18nProvider";

type Real = LoraChapter["real"];
type Targets = "attention" | "all";
const ranks = [8, 16, 64] as const;
const GPU_GB = 12;

// Parameter counts from the model's own config; memory as bytes per parameter, activations not included.
export function loraArithmetic(real: Real, rank: number, targets: Targets) {
  const h = real.hiddenSize;
  const q = real.heads * real.headDim;
  const kv = real.kvHeads * real.headDim;
  const matrices: [number, number][] = [
    [h, q],
    [h, kv],
    [h, kv],
    [q, h],
    ...(targets === "all" ? ([[h, real.intermediateSize], [h, real.intermediateSize], [real.intermediateSize, h]] as [number, number][]) : []),
  ];
  const perLayer = h * q + 2 * h * kv + q * h + 3 * h * real.intermediateSize + 2 * h;
  const base = real.vocabSize * h * (real.tiedEmbeddings ? 1 : 2) + real.layers * perLayer + h;
  const adapter = real.layers * matrices.reduce((sum, [i, o]) => sum + rank * (i + o), 0);
  const gb = (bytes: number) => bytes / 1e9;
  return {
    base,
    adapter,
    share: (100 * adapter) / base,
    full: gb(base * 16),
    lora: gb(base * 2 + adapter * 16),
    qlora: gb(base * 0.5 + adapter * 16),
  };
}

export function LoraArithmetic({ real }: { real: Real }) {
  const { t, formatNumber } = useI18n();
  const [rank, setRank] = useState<number>(16);
  const [targets, setTargets] = useState<Targets>("attention");
  const n = loraArithmetic(real, rank, targets);
  const millions = (x: number) => formatNumber(Math.round(x / 1e5) / 10);
  const rows = [
    { id: "full", gb: n.full },
    { id: "lora", gb: n.lora },
    { id: "qlora", gb: n.qlora },
  ] as const;
  return (
    <section className="plate-math" data-testid="lora-arithmetic">
      <div className="plate-math__figure" aria-hidden="true">
        <div className="plate-w">
          <span>W</span>
          <small>{t("lora.frozen")}</small>
        </div>
        <span className="plate-math__op">+</span>
        <div className="plate-b" style={{ width: `${8 + rank / 2}px` }}>
          <span>B</span>
        </div>
        <span className="plate-math__op">·</span>
        <div className="plate-a" style={{ height: `${8 + rank / 2}px` }}>
          <span>A</span>
        </div>
      </div>
      <div className="plate-math__numbers">
        <p className="note">{t("lora.plateBody", { name: real.name, date: real.checkedAt })}</p>
        <div className="rule-plates">
          {ranks.map((r) => (
            <label key={r} className={`rule-plate${r === rank ? " is-chosen" : ""}`}>
              <input type="radio" name="math-rank" checked={r === rank} onChange={() => setRank(r)} />
              {t("lora.rankOption", { rank: r })}
            </label>
          ))}
          {(["attention", "all"] as const).map((x) => (
            <label key={x} className={`rule-plate${x === targets ? " is-chosen" : ""}`}>
              <input type="radio" name="math-targets" checked={x === targets} onChange={() => setTargets(x)} />
              {t(`lora.targets.${x}`)}
            </label>
          ))}
        </div>
        <p className="plate-math__count" data-testid="lora-count">
          {t("lora.realCounts", { adapter: millions(n.adapter), base: millions(n.base), share: n.share.toFixed(2) })}
        </p>
        <table className="galley-table">
          <thead>
            <tr>
              <th>{t("lora.memory.how")}</th>
              <th>{t("lora.memory.gb")}</th>
              <th>{t("lora.memory.fits", { gb: GPU_GB })}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{t(`lora.memory.${row.id}`)}</td>
                <td>{formatNumber(Math.round(row.gb * 10) / 10)}</td>
                <td>{row.gb < GPU_GB ? t("lora.memory.yes") : t("lora.memory.no")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">{t("lora.memory.note")}</p>
      </div>
    </section>
  );
}

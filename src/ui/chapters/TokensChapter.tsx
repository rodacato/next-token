import { useEffect, useMemo, useState } from "react";
import type { TokensChapter as TokensChapterContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import type { LoadProgress } from "../../model/client";
import type { TokenPiece } from "../../model/protocol";
import { findModel } from "../../model/registry";
import { modelTokenizer, o200kTokenizer, sortFace, type BenchTokenizer } from "../../model/tokenizers";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { useDebounced } from "../hooks";
import { ComposingStick } from "../props/ComposingStick";
import { TypeCase } from "../props/TypeCase";
import { measurePairs, monthlyCost, spanishRatio, verdict, type Guess, type TokenizerMeasurement } from "./tokens-measure";

type CaseState =
  | { readonly status: "absent" }
  | { readonly status: "fetching"; readonly progress: LoadProgress | null }
  | { readonly status: "ready" }
  | { readonly status: "failed"; readonly reason: string };

type Props = { readonly chapter: TokensChapterContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };

export function TokensChapter({ chapter, progress, frame }: Props) {
  const { t, formatNumber, formatBytes } = useI18n();
  const { state, updateChapter, update } = useCourse();
  const [copy, setCopy] = useState("");
  const settledCopy = useDebounced(copy, 90);
  const [o200kPieces, setO200kPieces] = useState<readonly TokenPiece[]>([]);
  const [qwenPieces, setQwenPieces] = useState<readonly TokenPiece[]>([]);
  const [qwenCase, setQwenCase] = useState<CaseState>(() => (state.modelOptedIn ? { status: "fetching", progress: null } : { status: "absent" }));
  const [measurements, setMeasurements] = useState<readonly TokenizerMeasurement[]>([]);
  const qwen = useMemo(() => modelTokenizer(state.modelId), [state.modelId]);
  const qwenName = findModel(state.modelId).name;

  const [o200kOpen, setO200kOpen] = useState(false);
  useEffect(() => {
    let current = true;
    void o200kTokenizer.encode(settledCopy).then((pieces) => {
      if (!current) return;
      setO200kPieces(pieces);
      setO200kOpen(true);
    });
    return () => {
      current = false;
    };
  }, [settledCopy]);

  useEffect(() => {
    if (qwenCase.status !== "ready") return;
    let current = true;
    void qwen.encode(settledCopy).then((pieces) => current && setQwenPieces(pieces));
    return () => {
      current = false;
    };
  }, [settledCopy, qwenCase.status, qwen]);

  const fetchCase = () => setQwenCase({ status: "fetching", progress: null });
  const fetching = qwenCase.status === "fetching";

  useEffect(() => {
    if (!fetching) return;
    let current = true;
    qwen
      .encode("", (p) => current && setQwenCase({ status: "fetching", progress: p }))
      .then(() => current && setQwenCase({ status: "ready" }))
      .catch((error: unknown) => current && setQwenCase({ status: "failed", reason: error instanceof Error ? error.message : String(error) }));
    return () => {
      current = false;
    };
  }, [fetching, qwen]);

  const guess = progress.predictions.language as Guess | undefined;
  const measured = measurements.length > 0;
  const runMeasurement = async () => {
    const tokenizers: BenchTokenizer[] = [o200kTokenizer, ...(qwenCase.status === "ready" ? [qwen] : [])];
    setMeasurements(await Promise.all(tokenizers.map((tk) => measurePairs(chapter, tk))));
    updateChapter(chapter.id, { predictions: { ...progress.predictions, measured: 1 } });
  };

  const describePiece = (piece: TokenPiece) =>
    [t("bench.tokenId", { id: piece.tokenId }), sortFace(piece.text).fragment ? t("bench.byteFragment") : null].filter(Boolean).join(" · ");

  const stickCount = (count: number) => t("bench.stickCount", { count: formatNumber(count) });

  const bench = (
    <div className="bench-grid bench-grid--tokens">
      <label className="copy-sheet">
        <span className="kicker">{t("bench.copy")}</span>
        <textarea
          data-testid="copy"
          value={copy}
          rows={2}
          placeholder={t("bench.copyPlaceholder")}
          onChange={(event) => setCopy(event.target.value)}
          autoFocus
          spellCheck={false}
        />
        <span className="note">{copy ? t("bench.space") : t("bench.copyHint")}</span>
      </label>

      <div className="sticks">
        <ComposingStick
          testId="stick-o200k"
          label={`${t("tokenizers.o200k")} · ${t("tokenizers.o200kNote")}`}
          count={o200kOpen ? stickCount(o200kPieces.length) : t("bench.openingCase")}
          pieces={o200kPieces}
          describePiece={describePiece}
        />
        <ComposingStick
          testId="stick-qwen"
          label={`${qwenName} · ${t("tokenizers.qwenNote")}`}
          count={qwenCase.status === "ready" ? stickCount(qwenPieces.length) : undefined}
          pieces={qwenCase.status === "ready" ? qwenPieces : []}
          describePiece={describePiece}
        >
          {qwenCase.status === "absent" && (
            <button className="button button--press stick__fetch" onClick={fetchCase} data-testid="fetch-case">
              {t("tokenizers.fetchCase", { name: qwenName, size: formatBytes(qwen.needsDownloadBytes) })}
            </button>
          )}
          {qwenCase.status === "fetching" && (
            <span className="stick__status">
              {t("tokenizers.fetching", {
                loaded: formatBytes(qwenCase.progress?.loaded ?? 0),
                total: formatBytes(qwenCase.progress?.total ?? qwen.needsDownloadBytes),
              })}
            </span>
          )}
          {qwenCase.status === "failed" && (
            <span className="stick__status stick__status--error">
              {t("model.failed", { reason: qwenCase.reason })}{" "}
              <button className="button button--quiet" onClick={fetchCase}>
                {t("model.retry")}
              </button>
            </span>
          )}
        </ComposingStick>
        <p className="note claude-note">{t("tokenizers.claudeNote")}</p>
      </div>

      <div className="bench__case">
        <TypeCase label={t("bench.caseUnknown")} />
      </div>

      {(progress.stage === "measure" || progress.stage === "debrief") && (
        <MeasurementBench
          chapter={chapter}
          guess={guess}
          onGuess={(g) => updateChapter(chapter.id, { predictions: { ...progress.predictions, language: g } })}
          measurements={measurements}
          onRun={() => void runMeasurement()}
          qwenName={qwenName}
          price={state.pricePerMillion ?? chapter.defaultPricePerMillion}
          volume={state.conversationsPerDay ?? chapter.defaultConversationsPerDay}
          onPrice={(value) => update((s) => ({ ...s, pricePerMillion: value }))}
          onVolume={(value) => update((s) => ({ ...s, conversationsPerDay: value }))}
        />
      )}
    </div>
  );

  const canAdvance = progress.stage === "measure" ? measured || progress.predictions.measured === 1 : progress.stage !== "bench" || copy.length > 0 || o200kPieces.length > 0;
  return frame(canAdvance, bench);
}

type MeasurementBenchProps = {
  readonly chapter: TokensChapterContent;
  readonly guess: Guess | undefined;
  readonly onGuess: (guess: Guess) => void;
  readonly measurements: readonly TokenizerMeasurement[];
  readonly onRun: () => void;
  readonly qwenName: string;
  readonly price: number;
  readonly volume: number;
  readonly onPrice: (value: number) => void;
  readonly onVolume: (value: number) => void;
};

function MeasurementBench(props: MeasurementBenchProps) {
  const { chapter, guess, onGuess, measurements, onRun, qwenName, price, volume, onPrice, onVolume } = props;
  const { t, formatNumber, locale } = useI18n();
  const reference = measurements[0];
  const pairLabel = (pairId: string) => {
    const pair = chapter.pairs.find((p) => p.id === pairId);
    const text = pair ? (locale.startsWith("es") ? pair.es : pair.en) : pairId;
    return text.length > 34 ? `${text.slice(0, 32)}…` : text;
  };
  const ratio = reference ? spanishRatio(reference) : null;
  const tokenizerName = (id: BenchTokenizer["id"]) => (id === "o200k" ? t("tokenizers.o200k") : qwenName);
  const money = (value: number) => formatNumber(value, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const guessLabel = (g: Guess) => t(`chapters.tokens.measure.options.${g}` as MessageKey);

  const english = monthlyCost(chapter.sortsPerConversation, volume, price);
  const spanish = ratio ? monthlyCost(chapter.sortsPerConversation * ratio, volume, price) : null;

  return (
    <section className="measure-sheet" data-testid="measure">
      <fieldset className="prediction" disabled={Boolean(reference)}>
        <legend className="kicker">{t("chapters.tokens.measure.predict")}</legend>
        {(["english", "spanish", "same"] as const).map((option) => (
          <label key={option} className={`prediction__option${guess === option ? " is-chosen" : ""}`}>
            <input type="radio" name="language-guess" value={option} checked={guess === option} onChange={() => onGuess(option)} />
            {guessLabel(option)}
          </label>
        ))}
      </fieldset>

      {!reference && (
        <button className="button button--primary" disabled={!guess} onClick={onRun} data-testid="run-measure">
          {t("chapters.tokens.measure.run")}
        </button>
      )}

      {reference && ratio !== null && guess && (
        <div className="galley-proof">
          <p className="galley-proof__verdict" data-testid="verdict">
            {t(verdict(ratio) === guess ? "chapters.tokens.measure.resultAgree" : "chapters.tokens.measure.resultDisagree", { guess: guessLabel(guess) })}{" "}
            {t("chapters.tokens.measure.ratio", { ratio: formatNumber(ratio, { maximumFractionDigits: 2 }), tokenizer: tokenizerName(reference.tokenizerId) })}
          </p>
          <table className="galley-table">
            <thead>
              <tr>
                <th>{t("chapters.tokens.measure.table.copy")}</th>
                <th>{t("chapters.tokens.measure.table.english")}</th>
                <th>{t("chapters.tokens.measure.table.spanish")}</th>
                <th>{t("chapters.tokens.measure.table.ratio")}</th>
              </tr>
            </thead>
            {measurements.map((m) => (
              <tbody key={m.tokenizerId}>
                <tr className="galley-table__group">
                  <th colSpan={4}>{tokenizerName(m.tokenizerId)}</th>
                </tr>
                {m.pairs.map((pair) => (
                  <tr key={pair.pairId}>
                    <td>{pairLabel(pair.pairId)}</td>
                    <td>{formatNumber(pair.english)}</td>
                    <td>{formatNumber(pair.spanish)}</td>
                    <td>{formatNumber(pair.spanish / pair.english, { maximumFractionDigits: 2 })}×</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>

          <div className="cost-slip">
            <h3 className="kicker">{t("chapters.tokens.measure.cost.heading")}</h3>
            <label>
              <span>{t("chapters.tokens.measure.cost.price")}</span>
              <input type="number" min="0.01" step="0.01" value={price} onChange={(e) => Number(e.target.value) > 0 && onPrice(Number(e.target.value))} />
            </label>
            <span className="note">{t("chapters.tokens.measure.cost.priceNote")}</span>
            <label>
              <span>{t("chapters.tokens.measure.cost.volume")}</span>
              <input type="number" min="1" step="1000" value={volume} onChange={(e) => Number(e.target.value) > 0 && onVolume(Math.round(Number(e.target.value)))} />
            </label>
            <p>{t("chapters.tokens.measure.cost.monthly", { language: t("chapters.tokens.measure.table.english"), cost: money(english) })}</p>
            {spanish !== null && (
              <>
                <p>{t("chapters.tokens.measure.cost.monthly", { language: t("chapters.tokens.measure.table.spanish"), cost: money(spanish) })}</p>
                <p className="cost-slip__difference">{t("chapters.tokens.measure.cost.difference", { difference: money(spanish - english) })}</p>
              </>
            )}
            <span className="note">{t("chapters.tokens.measure.cost.perConversation")}</span>
          </div>
        </div>
      )}
    </section>
  );
}

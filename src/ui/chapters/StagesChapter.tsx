import { useEffect, useMemo, useState } from "react";
import type { StagesChapter as StagesContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { mulberry32 } from "../../trainer/random";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";

type Props = { readonly chapter: StagesContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };
type Completion = { stage: string; promptId: string; locale: string; output: string; outputTokens: number; seconds: number };
type Recording = { recordedAt: string; via: string; machine: string; dtype: string; completions: Completion[] };
const loadRecording = () => import("../../recordings/minicpm/stages.json").then((m) => m.default as Recording);

export function passes(pattern: string | undefined, output: string): boolean | null {
  return pattern ? new RegExp(pattern, "i").test(output) : null;
}

// The four answers to one prompt, in an order fixed per prompt so a reload doesn't reshuffle them.
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function StagesChapter({ chapter, progress, frame }: Props) {
  const { t, locale, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [promptId, setPromptId] = useState(chapter.prompts[0]?.id ?? "");
  const [labels, setLabels] = useState<Record<string, Record<string, string>>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    void loadRecording().then((r) => alive && setRecording(r));
    return () => {
      alive = false;
    };
  }, []);

  const prompt = chapter.prompts.find((p) => p.id === promptId);
  const answers = useMemo(() => {
    const own = recording?.completions.filter((c) => c.promptId === promptId && c.locale === locale) ?? [];
    return shuffled(own, [...promptId].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7));
  }, [recording, promptId, locale]);
  const mine = labels[promptId] ?? {};
  const shown = revealed[promptId] ?? false;
  const sorted = Object.keys(revealed).filter((id) => revealed[id]);
  const guess = typeof progress.predictions.bestStage === "string" ? progress.predictions.bestStage : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const checked = chapter.prompts.filter((p) => p.check);

  const score = (stage: string) =>
    checked.reduce((sum, p) => {
      for (const l of ["en", "es-MX"]) {
        const c = recording?.completions.find((x) => x.stage === stage && x.promptId === p.id && x.locale === l);
        if (c && passes(p.check?.[l], c.output)) sum++;
      }
      return sum;
    }, 0);
  const best = Math.max(...chapter.stages.map((s) => score(s.id)));
  const winners = chapter.stages.filter((s) => score(s.id) === best).map((s) => s.id);

  const bench = (
    <div className="stages-bench">
      <ol className="stage-strip">
        {chapter.stages.map((s) => (
          <li key={s.id}>
            <strong>{t(`stages.names.${s.id}` as MessageKey)}</strong>
            <span>{t(`stages.about.${s.id}` as MessageKey)}</span>
            <code>{s.repo}</code>
          </li>
        ))}
      </ol>
      {recording && <p className="note">{t("stages.recorded", { model: chapter.model, via: recording.via, dtype: recording.dtype, date: recording.recordedAt })}</p>}

      <fieldset className="rule-plates">
        <legend className="kicker">{t("stages.prompt")}</legend>
        {chapter.prompts.map((p) => (
          <label key={p.id} className={`rule-plate${p.id === promptId ? " is-chosen" : ""}`}>
            <input type="radio" name="stage-prompt" checked={p.id === promptId} onChange={() => setPromptId(p.id)} />
            {t(`stages.prompts.${p.id}` as MessageKey)}
            {revealed[p.id] && <span className="rule-plate__done">·</span>}
          </label>
        ))}
      </fieldset>
      {prompt && <p className="stage-prompt">{prompt.text[locale]}</p>}

      <ol className="blind-sort" data-testid="blind-sort">
        {answers.map((a, i) => {
          const chosen = mine[a.stage];
          return (
            <li key={a.stage} className={`blind-slip${shown ? (chosen === a.stage ? " is-matched" : " is-missed") : ""}`}>
              <span className="kicker">{t("stages.answer", { n: i + 1 })}</span>
              <pre>{a.output.trim() || t("stages.empty")}</pre>
              <div className="blind-slip__choose">
                {chapter.stages.map((s) => (
                  <label key={s.id} className={`rule-plate rule-plate--small${chosen === s.id ? " is-chosen" : ""}`}>
                    <input
                      type="radio"
                      name={`slip-${promptId}-${i}`}
                      checked={chosen === s.id}
                      disabled={shown}
                      onChange={() => setLabels((all) => ({ ...all, [promptId]: { ...mine, [a.stage]: s.id } }))}
                    />
                    {t(`stages.names.${s.id}` as MessageKey)}
                  </label>
                ))}
              </div>
              {shown && (
                <p className="blind-slip__truth" data-testid={`truth-${i + 1}`}>
                  {t("stages.truth", { stage: t(`stages.names.${a.stage}` as MessageKey), tokens: formatNumber(a.outputTokens) })}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <div className="actions actions--row">
        <button className="button button--primary" disabled={shown || Object.keys(mine).length < answers.length} onClick={() => setRevealed((r) => ({ ...r, [promptId]: true }))} data-testid="reveal">
          {t("stages.reveal")}
        </button>
        {shown && (
          <p className="note" data-testid="sort-score">
            {t("stages.sortScore", { right: answers.filter((a) => mine[a.stage] === a.stage).length, total: answers.length })}
          </p>
        )}
      </div>

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <fieldset className="rule-plates">
            <legend className="kicker">{t("stages.predict", { count: checked.length * 2 })}</legend>
            {chapter.stages.map((s) => (
              <label key={s.id} className={`rule-plate${guess === s.id ? " is-chosen" : ""}`}>
                <input type="radio" name="stage-predict" checked={guess === s.id} onChange={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, bestStage: s.id } })} />
                {t(`stages.names.${s.id}` as MessageKey)}
              </label>
            ))}
          </fieldset>
          {guess && recording && (
            <>
              <table className="galley-table" data-testid="stage-checks">
                <thead>
                  <tr>
                    <th>{t("stages.check")}</th>
                    {chapter.stages.map((s) => (
                      <th key={s.id}>{t(`stages.names.${s.id}` as MessageKey)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {checked.flatMap((p) =>
                    ["en", "es-MX"].map((l) => (
                      <tr key={`${p.id}-${l}`}>
                        <td>{t(`stages.checks.${p.id}` as MessageKey, { lang: l === "en" ? "EN" : "ES" })}</td>
                        {chapter.stages.map((s) => {
                          const c = recording.completions.find((x) => x.stage === s.id && x.promptId === p.id && x.locale === l);
                          const ok = c ? passes(p.check?.[l], c.output) : null;
                          return (
                            <td key={s.id} className={ok ? "check-pass" : "check-fail"}>
                              {ok ? t("stages.pass") : t("stages.fail")}
                            </td>
                          );
                        })}
                      </tr>
                    )),
                  )}
                  <tr>
                    <td>{t("stages.total")}</td>
                    {chapter.stages.map((s) => (
                      <td key={s.id}>{formatNumber(score(s.id))}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <p className="measure-sheet__finding" data-testid="stages-finding">
                {t(winners.includes(guess) ? "stages.findingMatch" : "stages.findingMiss", {
                  winners: winners.map((w) => t(`stages.names.${w}` as MessageKey)).join(", "),
                  best: formatNumber(best),
                  total: checked.length * 2,
                })}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "bench" ? sorted.length > 0 : progress.stage === "measure" ? guess !== null : true;
  return frame(canAdvance, bench);
}

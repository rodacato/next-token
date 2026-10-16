import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { StickChapter as StickContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import type { TokenPiece } from "../../model/protocol";
import { o200kTokenizer, sortFace } from "../../model/tokenizers";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { NeedleMeasurement } from "./NeedleMeasurement";
import { applyRule, stickRules, type StickRule, type TokenizedTurn } from "./stick-rules";

type Props = { readonly chapter: StickContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };

const FALL_OFF = { y: 90, rotate: -28, opacity: 0, transition: { duration: 0.42, ease: [0.55, 0, 0.9, 0.45] as const } };

export function StickChapter({ chapter, progress, frame }: Props) {
  const { t, locale, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const reduceMotion = useReducedMotion();
  const turns = useMemo(() => chapter.conversation[locale] ?? Object.values(chapter.conversation)[0] ?? [], [chapter, locale]);
  const [tokenized, setTokenized] = useState<TokenizedTurn[] | null>(null);
  const [summary, setSummary] = useState<readonly TokenPiece[]>([]);
  const [setCount, setSetCount] = useState(0);
  const [rule, setRule] = useState<StickRule>("drop-oldest");

  useEffect(() => {
    let current = true;
    const label = (role: string) => t(`stick.roles.${role}` as MessageKey);
    void Promise.all(turns.map(async (turn) => ({ turn, pieces: await o200kTokenizer.encode(`${label(turn.role)}: ${turn.text}\n`) }))).then(
      (result) => current && setTokenized(result),
    );
    void o200kTokenizer.encode(`${chapter.summary[locale] ?? ""}\n`).then((pieces) => current && setSummary(pieces));
    return () => {
      current = false;
    };
  }, [turns, chapter, locale, t]);

  const state = useMemo(
    () => (tokenized ? applyRule(rule, tokenized.slice(0, setCount), chapter.capacity, summary) : null),
    [tokenized, setCount, rule, chapter.capacity, summary],
  );
  const finished = tokenized !== null && setCount >= tokenized.length;
  const missing = state ? [...state.lostFacts].map((fact) => t(`stick.facts.${fact}` as MessageKey)) : [];

  const bench = (
    <div className="stick-bench">
      <fieldset className="rule-plates">
        <legend className="kicker">{t("stick.rule")}</legend>
        {stickRules.map((r) => (
          <label key={r} className={`rule-plate${r === rule ? " is-chosen" : ""}`}>
            <input type="radio" name="stick-rule" value={r} checked={r === rule} onChange={() => setRule(r)} />
            {t(`stick.rules.${r}` as MessageKey)}
          </label>
        ))}
        {rule === "pin-summary" && <p className="note">{t("stick.summaryNote")}</p>}
      </fieldset>

      <div className="stick-actions">
        <button className="button button--primary" disabled={!tokenized || finished} onClick={() => setSetCount((n) => n + 1)} data-testid="next-message">
          {t("stick.nextMessage")}
        </button>
        <button className="button" disabled={!tokenized || finished} onClick={() => setSetCount(tokenized?.length ?? 0)} data-testid="all-messages">
          {t("stick.allMessages")}
        </button>
        <button className="button button--quiet" disabled={setCount === 0} onClick={() => setSetCount(0)}>
          {t("stick.clear")}
        </button>
      </div>

      <figure className="window-stick" data-testid="window-stick">
        <figcaption className="stick__caption">
          <span className="kicker">{t("stick.capacity", { count: chapter.capacity })}</span>
          <span className="stick__count">{t("stick.used", { used: state?.kept.length ?? 0, capacity: chapter.capacity })}</span>
        </figcaption>
        <div className="window-stick__rail">
          <span className="stick__knee" aria-hidden="true" />
          <div className="window-stick__sorts" role="list">
            <AnimatePresence initial={false}>
              {state?.kept.map((sort) => (
                <motion.span
                  key={sort.key}
                  role="listitem"
                  className={`window-sort window-sort--${sort.role}${sort.pinned ? " is-pinned" : ""}`}
                  title={t(`stick.roles.${sort.role === "summary" ? "assistant" : sort.role}` as MessageKey)}
                  initial={reduceMotion ? false : { y: -30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1, transition: { duration: 0.22, ease: [0.55, 0, 0.9, 0.45] } }}
                  exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : FALL_OFF}
                >
                  {sortFace(sort.text).label}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <div className="window-stick__meter" aria-hidden="true">
          <span style={{ width: `${Math.min(100, ((state?.kept.length ?? 0) / chapter.capacity) * 100)}%` }} />
        </div>
        {state && state.fallen > 0 && (
          <p className="window-stick__fallen" data-testid="fallen">
            <strong>{t("stick.full")}</strong> {t("stick.fell", { count: formatNumber(state.fallen) })}
          </p>
        )}
        <p className="note">{t("stick.tokenizerNote")}</p>
      </figure>

      <section className="facts-slip" aria-live="polite">
        <h3 className="kicker">{t("stick.factsHeading")}</h3>
        <ul>
          {turns
            .filter((turn) => turn.fact)
            .map((turn) => {
              const fact = turn.fact ?? "";
              const status = state?.lostFacts.has(fact) ? "off" : state?.survivingFacts.has(fact) ? "on" : "pending";
              return (
                <li key={fact} className={`fact fact--${status}`} data-testid={`fact-${fact}`}>
                  <span>{t(`stick.facts.${fact}` as MessageKey)}</span>
                  <span className="fact__status">{status === "on" ? t("stick.onStick") : status === "off" ? t("stick.offStick") : "—"}</span>
                </li>
              );
            })}
        </ul>
        {finished && (
          <p className={`facts-slip__verdict${missing.length ? " is-unsafe" : ""}`} data-testid="stick-verdict">
            {missing.length ? t("stick.verdict.unsafe", { missing: missing.join(", ") }) : t("stick.verdict.safe")}
          </p>
        )}
      </section>

      {(progress.stage === "measure" || progress.stage === "debrief") && (
        <NeedleMeasurement
          chapter={chapter}
          guess={progress.predictions.needle as string | undefined}
          onGuess={(guess) => updateChapter(chapter.id, { predictions: { ...progress.predictions, needle: guess } })}
          onMeasured={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, measured: 1 } })}
        />
      )}
    </div>
  );

  const canAdvance = progress.stage === "bench" ? finished : progress.stage === "measure" ? progress.predictions.measured === 1 : true;
  return frame(canAdvance, bench);
}

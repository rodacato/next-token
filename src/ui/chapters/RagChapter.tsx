import { useEffect, useMemo, useState } from "react";
import type { RagChapter as RagContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { NoRecordedRunError } from "../../llm/port";
import { inferenceClient, type LoadProgress } from "../../model/client";
import { answerRequest, judgeRequest, readJudgement, topKs, type EmbeddingRecording, type Judgement, type RagTask } from "../../rag/answer";
import { chunk, chunkStrategies, decodeVector, passageText, queryText, rank, type ChunkStrategy, type Ranked } from "../../rag/chunking";
import { embedders } from "../../rag/embedders";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { useLlm } from "../LlmProvider";
import { OutsideWork } from "../OutsideWork";

type Props = { readonly chapter: RagContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };
type Source = { readonly kind: "recorded"; readonly recordedAt: string } | { readonly kind: "live" };
type Answer = { readonly text: string; readonly verdict: Judgement; readonly note: string };
const MEASURE_K = 2;
const CUSTOM = "custom";
const embeddingFiles = import.meta.glob("../../recordings/embeddings/*.json", { import: "default" });
const answerKey = (question: string, strategy: ChunkStrategy, k: number) => `${question}|${k === 0 ? "none" : strategy}|${k}`;

export function RagChapter({ chapter, progress, frame }: Props) {
  const { t, locale, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const llm = useLlm();
  const embedder = embedders.find((e) => e.id === chapter.embedder);
  const handbook = chapter.handbook[locale] ?? "";
  const [strategy, setStrategy] = useState<ChunkStrategy>("fixed");
  const [k, setK] = useState(MEASURE_K);
  const [questionId, setQuestionId] = useState(chapter.questions[0]?.id ?? "");
  const [custom, setCustom] = useState("");
  const [vectors, setVectors] = useState<ReadonlyMap<string, Float32Array>>(new Map());
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState<LoadProgress | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const loader = embeddingFiles[`../../recordings/embeddings/${locale}.json`];
    void loader?.().then((raw) => {
      if (!alive) return;
      const recording = raw as EmbeddingRecording;
      const map = new Map<string, Float32Array>();
      for (const [text, encoded] of Object.entries(recording.passages)) map.set(`p:${text}`, decodeVector(encoded));
      for (const [text, encoded] of Object.entries(recording.queries)) map.set(`q:${text}`, decodeVector(encoded));
      setVectors(map);
      setSource({ kind: "recorded", recordedAt: recording.recordedAt });
    });
    return () => {
      alive = false;
    };
  }, [locale]);

  const task: RagTask = { system: chapter.system[locale] ?? "", template: chapter.template[locale] ?? "", noExcerpts: chapter.noExcerpts[locale] ?? "", maxTokens: chapter.maxTokens };
  const preset = chapter.questions.find((q) => q.id === questionId);
  const question = preset ? (preset.text[locale] ?? "") : custom.trim();
  const chunks = useMemo(() => chunk(handbook, strategy, chapter.fixedSize), [handbook, strategy, chapter.fixedSize]);
  const ranked = useMemo(() => rankWith(vectors, chunks, question), [vectors, chunks, question]);
  const current = answers[answerKey(questionId, strategy, k)];

  const embedLive = async (texts: string[]) => {
    if (!embedder) return;
    const missing = texts.filter((key) => !vectors.has(key));
    if (!missing.length) return vectors;
    const raw = missing.map((key) => (key.startsWith("q:") ? queryText(key.slice(2)) : passageText(key.slice(2))));
    const out = await inferenceClient().embed(embedder.repo, embedder.dtype, raw, setLoading);
    const next = new Map(vectors);
    missing.forEach((key, i) => out[i] && next.set(key, out[i]));
    setVectors(next);
    setLoading(null);
    return next;
  };

  const goLive = async () => {
    setBusy(true);
    setFailure(null);
    try {
      setVectors(new Map());
      const texts = chunkStrategies.flatMap((s) => chunk(handbook, s, chapter.fixedSize)).map((x) => `p:${x}`);
      const embedded = await inferenceClient().embed(embedder?.repo ?? "", "q8", texts.map((x) => passageText(x.slice(2))), setLoading);
      const queries = chapter.questions.map((q) => q.text[locale] ?? "");
      const queryVectors = await inferenceClient().embed(embedder?.repo ?? "", "q8", queries.map(queryText));
      const map = new Map<string, Float32Array>();
      texts.forEach((key, i) => embedded[i] && map.set(key, embedded[i]));
      queries.forEach((q, i) => queryVectors[i] && map.set(`q:${q}`, queryVectors[i]));
      setVectors(map);
      setSource({ kind: "live" });
      setAnswers({});
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(null);
      setBusy(false);
    }
  };

  const answer = async (qId: string, qText: string, s: ChunkStrategy, topK: number, pool: ReadonlyMap<string, Float32Array>) => {
    const r = rankWith(pool, chunk(handbook, s, chapter.fixedSize), qText);
    if (!r) throw new Error(t("rag.notEmbedded"));
    const request = answerRequest(task, qText, r.slice(0, topK).map((x) => x.text));
    const reply = await llm.port.complete({ system: request.system, messages: [{ role: "user", content: request.prompt }], maxTokens: request.maxTokens });
    const key = qId === CUSTOM ? null : chapter.questions.find((q) => q.id === qId)?.answerKey[locale];
    const judged = key ? await judge(qText, key, reply.text) : { verdict: "unreadable" as const, note: "" };
    setAnswers((a) => ({ ...a, [answerKey(qId, s, topK)]: { text: reply.text, ...judged } }));
  };

  const judge = async (qText: string, key: string, reply: string) => {
    const request = judgeRequest({ system: chapter.judge.system[locale] ?? "", template: chapter.judge.template[locale] ?? "" }, qText, key, reply);
    const verdict = await llm.port.complete({ system: request.system, messages: [{ role: "user", content: request.prompt }], maxTokens: request.maxTokens, jsonSchema: request.jsonSchema });
    return readJudgement(verdict.text);
  };

  const run = async (jobs: { qId: string; qText: string; s: ChunkStrategy; topK: number }[]) => {
    setBusy(true);
    setFailure(null);
    try {
      let pool = vectors;
      if (source?.kind === "live") pool = (await embedLive(jobs.map((j) => `q:${j.qText}`))) ?? pool;
      for (const job of jobs) await answer(job.qId, job.qText, job.s, job.topK, pool);
    } catch (error) {
      setFailure(error instanceof NoRecordedRunError ? t("evals.failed.no-recording") : error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const guess = typeof progress.predictions.chunking === "string" ? progress.predictions.chunking : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const grid = chapter.questions.flatMap((q) => chunkStrategies.map((s) => ({ qId: q.id, qText: q.text[locale] ?? "", s, topK: MEASURE_K })));
  const gridDone = grid.every((j) => answers[answerKey(j.qId, j.s, j.topK)]);
  const pulled = new Set(ranked?.slice(0, k).map((r) => r.index));
  const scores = ranked?.map((r) => r.score) ?? [];
  const [low, high] = [Math.min(...scores), Math.max(...scores)];

  const bench = (
    <div className="case-bench">
      <OutsideWork />
      <section className="case-bench__embedder">
        <span className="kicker">{t("rag.embedder")}</span>
        <p data-testid="embedder-source">
          {source?.kind === "live"
            ? t("rag.sourceLive", { model: embedder?.name ?? "" })
            : source
              ? t("rag.sourceRecorded", { model: embedder?.name ?? "", date: source.recordedAt })
              : t("rag.sourceLoading")}
        </p>
        {source?.kind !== "live" && (
          <button className="button" disabled={busy} onClick={() => void goLive()}>
            {t("rag.loadLive", { size: formatNumber(Math.round((embedder?.bytes ?? 0) / 1e6)) })}
          </button>
        )}
        {loading && <p className="note">{t("rag.downloading", { loaded: formatNumber(Math.round(loading.loaded / 1e6)), total: formatNumber(Math.round(loading.total / 1e6)) })}</p>}
      </section>

      <div className="case-bench__controls">
        <fieldset className="rule-plates">
          <legend className="kicker">{t("rag.question")}</legend>
          {chapter.questions.map((q) => (
            <label key={q.id} className={`rule-plate${q.id === questionId ? " is-chosen" : ""}`}>
              <input type="radio" name="rag-question" checked={q.id === questionId} onChange={() => setQuestionId(q.id)} />
              {q.text[locale]}
            </label>
          ))}
          {source?.kind === "live" && (
            <label className={`rule-plate${questionId === CUSTOM ? " is-chosen" : ""}`}>
              <input type="radio" name="rag-question" checked={questionId === CUSTOM} onChange={() => setQuestionId(CUSTOM)} />
              <input type="text" className="rule-plate__text" value={custom} placeholder={t("rag.ownQuestion")} onChange={(e) => {
                  setCustom(e.target.value);
                  setQuestionId(CUSTOM);
                }} />
            </label>
          )}
        </fieldset>
        <fieldset className="rule-plates">
          <legend className="kicker">{t("rag.strategy")}</legend>
          {chunkStrategies.map((s) => (
            <label key={s} className={`rule-plate${s === strategy ? " is-chosen" : ""}`}>
              <input type="radio" name="rag-strategy" checked={s === strategy} onChange={() => setStrategy(s)} />
              {t(`rag.strategies.${s}` as MessageKey, { size: chapter.fixedSize })}
            </label>
          ))}
        </fieldset>
        <fieldset className="rule-plates">
          <legend className="kicker">{t("rag.topK")}</legend>
          {topKs.map((n) => (
            <label key={n} className={`rule-plate${n === k ? " is-chosen" : ""}`}>
              <input type="radio" name="rag-k" checked={n === k} onChange={() => setK(n)} />
              {n === 0 ? t("rag.noRetrieval") : formatNumber(n)}
            </label>
          ))}
        </fieldset>
      </div>

      <section className="case-bench__galley">
        <span className="kicker">{t("rag.chunks", { count: chunks.length })}</span>
        <p className="note">{t("rag.scoreNote")}</p>
        <ol className="slug-case" data-testid="slug-case">
          {chunks.map((text, index) => {
            const hit = ranked?.find((r) => r.index === index);
            const place = ranked ? ranked.findIndex((r) => r.index === index) + 1 : null;
            const width = hit && high > low ? 8 + (92 * (hit.score - low)) / (high - low) : 0;
            return (
              <li key={index} className={`slug${pulled.has(index) && k > 0 ? " is-pulled" : ""}`}>
                <span className="slug__rank">{place}</span>
                <span className="slug__text">{text}</span>
                <span className="slug__score">
                  <span className="slug__bar" style={{ width: `${width}%` }} />
                  {hit ? hit.score.toFixed(3) : "—"}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="actions actions--row">
        <button className="button button--primary" disabled={busy || !question || (measuring && guess === null)} onClick={() => void run([{ qId: questionId, qText: question, s: strategy, topK: k }])} data-testid="ask">
          {busy ? t("rag.asking") : k === 0 ? t("rag.askNone") : t("rag.ask", { count: k })}
        </button>
        {failure && <p className="error-line">{failure}</p>}
      </div>
      {current && <AnswerSlip answer={current} />}

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <fieldset className="rule-plates">
            <legend className="kicker">{t("rag.predict", { k: MEASURE_K })}</legend>
            {[...chunkStrategies, "none"].map((s) => (
              <label key={s} className={`rule-plate${guess === s ? " is-chosen" : ""}`}>
                <input type="radio" name="rag-predict" checked={guess === s} onChange={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, chunking: s } })} />
                {s === "none" ? t("rag.predictNone") : t(`rag.strategies.${s}` as MessageKey, { size: chapter.fixedSize })}
              </label>
            ))}
          </fieldset>
          <button className="button button--primary" disabled={busy || guess === null} onClick={() => void run(grid.filter((j) => !answers[answerKey(j.qId, j.s, j.topK)]))} data-testid="run-grid">
            {t("rag.runGrid", { count: grid.length })}
          </button>
          {gridDone && <VerdictGrid chapter={chapter} answers={answers} guess={guess} />}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "bench" ? Object.keys(answers).length > 0 : progress.stage === "measure" ? gridDone : true;
  return frame(canAdvance, bench);
}

function rankWith(vectors: ReadonlyMap<string, Float32Array>, chunks: readonly string[], question: string): Ranked[] | null {
  const query = vectors.get(`q:${question}`);
  const passages = chunks.map((text) => ({ text, vector: vectors.get(`p:${text}`) }));
  if (!query || passages.some((p) => !p.vector)) return null;
  return rank(query, passages.map((p) => ({ text: p.text, vector: p.vector ?? new Float32Array() })));
}

function AnswerSlip({ answer }: { answer: Answer }) {
  const { t } = useI18n();
  return (
    <div className={`slip slip--reply verdict--${answer.verdict}`} data-testid="rag-answer">
      <span className="kicker">{t("rag.answer")}</span>
      <p>{answer.text}</p>
      {answer.verdict !== "unreadable" && <span className="slip__stamp slip__stamp--inline">{t(`rag.verdicts.${answer.verdict}` as MessageKey)}</span>}
      {answer.note && <p className="note">{t("rag.judgeNote", { quote: answer.note })}</p>}
    </div>
  );
}

function VerdictGrid({ chapter, answers, guess }: { chapter: RagContent; answers: Record<string, Answer>; guess: string | null }) {
  const { t, locale } = useI18n();
  const allRight = chunkStrategies.filter((s) => chapter.questions.every((q) => answers[answerKey(q.id, s, MEASURE_K)]?.verdict === "right"));
  const matched = allRight.length ? allRight.some((s) => s === guess) : guess === "none";
  return (
    <>
      <table className="galley-table" data-testid="verdict-grid">
        <thead>
          <tr>
            <th>{t("rag.strategy")}</th>
            {chapter.questions.map((q) => (
              <th key={q.id}>{q.short[locale]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chunkStrategies.map((s) => (
            <tr key={s}>
              <td>{t(`rag.strategies.${s}` as MessageKey, { size: chapter.fixedSize })}</td>
              {chapter.questions.map((q) => {
                const verdict = answers[answerKey(q.id, s, MEASURE_K)]?.verdict ?? "unreadable";
                return (
                  <td key={q.id} className={`verdict-cell verdict--${verdict}`}>
                    {t(`rag.verdicts.${verdict}` as MessageKey)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="measure-sheet__finding" data-testid="rag-finding">
        {t(matched ? "rag.findingMatch" : "rag.findingMiss", {
          strategies: allRight.length ? allRight.map((s) => t(`rag.strategies.${s}` as MessageKey, { size: chapter.fixedSize })).join(", ") : t("rag.predictNone"),
        })}
      </p>
    </>
  );
}

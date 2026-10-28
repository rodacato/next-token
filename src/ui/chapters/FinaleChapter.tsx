import { useState } from "react";
import type { FinaleChapter as FinaleContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { approves, review, type CaseTag, type Check, type Member, type Submission } from "../../sim/review";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { PromptEditor } from "../evals/PromptEditor";

type Props = { readonly chapter: FinaleContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };
const tags: CaseTag[] = ["normal", "edge", "regression"];
const blank: Submission = { goal: "", users: "", nonGoals: "", metric: "", prompt: "", source: "", whenUnsure: "", maxSentences: 0, couponCeilingMxn: 0, cases: [], graders: [], guardrails: [], firstStagePercent: 0, dailyCapUsd: 0, rollback: "", monitor: "" };

function saved(progress: ChapterProgress): Submission {
  const raw = progress.predictions.finale;
  if (typeof raw !== "string") return blank;
  try {
    return { ...blank, ...(JSON.parse(raw) as Partial<Submission>) };
  } catch {
    return blank;
  }
}

export function FinaleChapter({ chapter, progress, frame }: Props) {
  const { t } = useI18n();
  const { updateChapter } = useCourse();
  const [form, setForm] = useState<Submission>(() => saved(progress));
  const [checks, setChecks] = useState<Check[] | null>(null);
  const guess = typeof progress.predictions.approvals === "number" ? progress.predictions.approvals : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const set = <K extends keyof Submission>(key: K, value: Submission[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key: "graders" | "guardrails", id: string, on: boolean) => set(key, on ? [...form[key], id] : form[key].filter((x) => x !== id));
  const approvals = checks ? chapter.members.filter((m) => approves(checks, m as Member)).length : 0;

  const submit = () => {
    updateChapter(chapter.id, { predictions: { ...progress.predictions, finale: JSON.stringify(form) } });
    setChecks(review(form));
  };

  const bench = (
    <div className="finale-bench">
      <section className="finale-section">
        <h3>{t("finale.sections.spec")}</h3>
        <label>
          <span>{t("finale.fields.goal")}</span>
          <textarea rows={3} value={form.goal} onChange={(e) => set("goal", e.target.value)} data-testid="field-goal" />
        </label>
        <label>
          <span>{t("finale.fields.users")}</span>
          <input type="text" value={form.users} onChange={(e) => set("users", e.target.value)} data-testid="field-users" />
        </label>
        <label>
          <span>{t("finale.fields.nonGoals")}</span>
          <textarea rows={3} value={form.nonGoals} onChange={(e) => set("nonGoals", e.target.value)} data-testid="field-non-goals" />
        </label>
        <label>
          <span>{t("finale.fields.metric")}</span>
          <input type="text" value={form.metric} onChange={(e) => set("metric", e.target.value)} data-testid="field-metric" />
        </label>
      </section>

      <section className="finale-section">
        <h3>{t("finale.sections.prompt")}</h3>
        <p className="note">{t("finale.promptNote")}</p>
        <fieldset className="rule-plates">
          <legend className="kicker">{t("finale.fields.source")}</legend>
          {chapter.sources.map((id) => (
            <label key={id} className={`rule-plate rule-plate--small${form.source === id ? " is-chosen" : ""}`}>
              <input type="radio" name="finale-source" checked={form.source === id} onChange={() => set("source", id)} />
              {t(`finale.sources.${id}` as MessageKey)}
            </label>
          ))}
        </fieldset>
        <fieldset className="rule-plates">
          <legend className="kicker">{t("finale.fields.whenUnsure")}</legend>
          {chapter.whenUnsure.map((id) => (
            <label key={id} className={`rule-plate rule-plate--small${form.whenUnsure === id ? " is-chosen" : ""}`}>
              <input type="radio" name="finale-unsure" checked={form.whenUnsure === id} onChange={() => set("whenUnsure", id)} />
              {t(`finale.whenUnsure.${id}` as MessageKey)}
            </label>
          ))}
        </fieldset>
        <label>
          <span>{t("finale.fields.maxSentences")}</span>
          <input type="number" min={0} value={form.maxSentences} onChange={(e) => set("maxSentences", Number(e.target.value) || 0)} data-testid="field-max-sentences" />
        </label>
        <label>
          <span>{t("finale.fields.couponCeiling")}</span>
          <input type="number" min={0} value={form.couponCeilingMxn} onChange={(e) => set("couponCeilingMxn", Number(e.target.value) || 0)} data-testid="field-coupon-ceiling" />
        </label>
        <PromptEditor label={t("finale.fields.prompt")} readOnly={false} testId="finale-prompt" value={form.prompt} onChange={(v) => set("prompt", v)} />
      </section>

      <section className="finale-section">
        <h3>{t("finale.sections.evals")}</h3>
        <ol className="finale-cases" data-testid="finale-cases">
          {form.cases.map((c, i) => (
            <li key={i}>
              <input type="text" aria-label={t("finale.fields.caseInput", { n: i + 1 })} placeholder={t("finale.fields.caseInputHint")} value={c.input} onChange={(e) => set("cases", form.cases.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)))} />
              <input type="text" aria-label={t("finale.fields.caseExpect", { n: i + 1 })} placeholder={t("finale.fields.caseExpectHint")} value={c.expect} onChange={(e) => set("cases", form.cases.map((x, j) => (j === i ? { ...x, expect: e.target.value } : x)))} />
              <select aria-label={t("finale.fields.caseTag", { n: i + 1 })} value={c.tag} onChange={(e) => set("cases", form.cases.map((x, j) => (j === i ? { ...x, tag: e.target.value as CaseTag } : x)))}>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {t(`finale.tags.${tag}` as MessageKey)}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ol>
        <button className="button" onClick={() => set("cases", [...form.cases, { input: "", expect: "", tag: "normal" }])} data-testid="add-case">
          {t("finale.addCase")}
        </button>
        <div className="rule-plates">
          {chapter.graders.map((g) => (
            <label key={g} className={`rule-plate rule-plate--small${form.graders.includes(g) ? " is-chosen" : ""}`}>
              <input type="checkbox" checked={form.graders.includes(g)} onChange={(e) => toggle("graders", g, e.target.checked)} data-testid={`grader-${g}`} />
              {t(`finale.graders.${g}` as MessageKey)}
            </label>
          ))}
        </div>
      </section>

      <section className="finale-section">
        <h3>{t("finale.sections.guardrails")}</h3>
        <div className="rule-plates">
          {chapter.guardrails.map((g) => (
            <label key={g} className={`rule-plate rule-plate--small${form.guardrails.includes(g) ? " is-chosen" : ""}`}>
              <input type="checkbox" checked={form.guardrails.includes(g)} onChange={(e) => toggle("guardrails", g, e.target.checked)} data-testid={`guardrail-${g}`} />
              {t(`finale.guardrails.${g}` as MessageKey)}
            </label>
          ))}
        </div>
      </section>

      <section className="finale-section">
        <h3>{t("finale.sections.launch")}</h3>
        <label>
          <span>{t("finale.fields.firstStage")}</span>
          <input type="number" min={0} max={100} value={form.firstStagePercent} onChange={(e) => set("firstStagePercent", Number(e.target.value) || 0)} data-testid="field-first-stage" />
        </label>
        <label>
          <span>{t("finale.fields.cap")}</span>
          <input type="number" min={0} value={form.dailyCapUsd} onChange={(e) => set("dailyCapUsd", Number(e.target.value) || 0)} data-testid="field-cap" />
        </label>
        <label>
          <span>{t("finale.fields.rollback")}</span>
          <input type="text" value={form.rollback} onChange={(e) => set("rollback", e.target.value)} data-testid="field-rollback" />
        </label>
        <label>
          <span>{t("finale.fields.monitor")}</span>
          <input type="text" value={form.monitor} onChange={(e) => set("monitor", e.target.value)} data-testid="field-monitor" />
        </label>
      </section>

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <fieldset className="rule-plates">
            <legend className="kicker">{t("finale.predict", { count: chapter.members.length })}</legend>
            {Array.from({ length: chapter.members.length + 1 }, (_, n) => (
              <label key={n} className={`rule-plate${guess === n ? " is-chosen" : ""}`}>
                <input type="radio" name="approvals" checked={guess === n} onChange={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, approvals: n } })} />
                {n}
              </label>
            ))}
          </fieldset>
          <button className="button button--primary" disabled={guess === null} onClick={submit} data-testid="submit-board">
            {checks ? t("finale.resubmit") : t("finale.submit")}
          </button>
          {checks && (
            <>
              <ol className="board" data-testid="board">
                {chapter.members.map((m) => {
                  const mine = checks.filter((c) => c.member === m);
                  const ok = approves(checks, m as Member);
                  return (
                    <li key={m} className={`board__member${ok ? " is-approved" : ""}`} data-testid={`member-${m}`}>
                      <strong>{t(`finale.members.${m}` as MessageKey)}</strong>
                      <span className="board__stamp">{t(ok ? "finale.approved" : "finale.changes")}</span>
                      <ul>
                        {mine.map((c) => (
                          <li key={c.id} className={c.pass ? "check-pass" : "check-fail"}>
                            {t(`finale.checks.${c.id}.${c.pass ? "pass" : "fail"}` as MessageKey)}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ol>
              <p className="measure-sheet__finding" data-testid="finale-finding">
                {t(approvals === chapter.members.length ? "finale.allApproved" : "finale.notYet", { guess: guess ?? 0, approvals, total: chapter.members.length })}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "bench" ? form.goal.trim().length > 0 : progress.stage === "measure" ? approvals === chapter.members.length : true;
  return frame(canAdvance, bench);
}

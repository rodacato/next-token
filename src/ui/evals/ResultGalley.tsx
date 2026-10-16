import type { EvalRun, EvalSet } from "../../evals/types";
import { useI18n } from "../../i18n/I18nProvider";

type Props = {
  readonly set: EvalSet;
  readonly runs: readonly EvalRun[];
  readonly labels: Readonly<Record<string, string>>;
  readonly graderLabels: Readonly<Record<string, string>>;
  readonly caseLabel: (caseId: string) => string;
};

// The eval as a galley proof: one row per case, one column per contender, every grade visible.
export function ResultGalley({ set, runs, labels, graderLabels, caseLabel }: Props) {
  const { t } = useI18n();
  return (
    <div className="result-galley" data-testid="result-galley">
      <table>
        <thead>
          <tr>
            <th>{t("evals.case")}</th>
            {runs.map((run) => (
              <th key={run.contenderId}>
                {labels[run.contenderId]} <span className="result-galley__score">{run.passed}/{run.total}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {set.cases.map((evalCase) => (
            <tr key={evalCase.id}>
              <th scope="row">{caseLabel(evalCase.id)}</th>
              {runs.map((run) => {
                const result = run.results.find((r) => r.caseId === evalCase.id);
                if (!result) return <td key={run.contenderId}>—</td>;
                return (
                  <td key={run.contenderId} className={result.pass ? "is-pass" : "is-fail"}>
                    <p className="result-galley__output">{result.output}</p>
                    <ul className="result-galley__grades">
                      {result.grades.map((g) => (
                        <li key={g.graderId} className={g.pass ? "grade grade--pass" : "grade grade--fail"} title={g.note}>
                          <span className="grade__mark">{g.pass ? t("evals.pass") : t("evals.fail")}</span> {graderLabels[g.graderId] ?? g.graderId}
                          {!g.pass && <span className="grade__note"> · {g.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">{runs.flatMap((r) => r.sources).filter((s, i, all) => all.indexOf(s) === i).map((s) => t("evals.source", { source: s })).join(" · ")}</p>
    </div>
  );
}

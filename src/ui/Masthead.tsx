import { useRef, useState } from "react";
import { chapters } from "../content";
import { availableLocales, localeMeta } from "../i18n/catalog";
import { useI18n } from "../i18n/I18nProvider";
import { useCourse } from "./CourseProvider";
import type { MessageKey } from "../i18n/catalog";

const acts = [...new Set(chapters.map((chapter) => chapter.act))];

export function Masthead({ currentChapterId, onOpenChapter }: { currentChapterId: string; onOpenChapter: (id: string) => void }) {
  const { t, locale } = useI18n();
  const { state, update, reset, progressOf } = useCourse();
  const dialog = useRef<HTMLDialogElement>(null);
  const current = chapters.find((c) => c.id === currentChapterId);
  // On narrow screens one act shows at a time; it follows the open chapter until the reader picks another.
  const [pickedAct, setPickedAct] = useState<string | null>(null);
  const shownAct = pickedAct ?? current?.act ?? acts[0];
  const open = (id: string) => {
    setPickedAct(null);
    onOpenChapter(id);
  };

  return (
    <header className="masthead">
      <a className="skip-link" href="#bench">
        {t("shell.skipToBench")}
      </a>
      <div className="masthead__title">
        <span className="masthead__name">{t("course.title")}</span>
        <span className="kicker">{t("course.subtitle")}</span>
      </div>

      <nav className="ticket" aria-label={t("course.title")}>
        <div className="ticket__acts" role="group" aria-label={t("shell.acts")}>
          {acts.map((act) => (
            <button key={act} className={act === shownAct ? "is-shown" : ""} aria-pressed={act === shownAct} title={t(`course.acts.${act}` as MessageKey)} onClick={() => setPickedAct(act)}>
              {t(`course.actNumerals.${act}` as MessageKey)}
            </button>
          ))}
        </div>
        <div className="ticket__row">
          {acts.map((act) => (
            <div key={act} className={`ticket__act-group${act === shownAct ? " is-shown" : ""}`}>
              <span className="ticket__act" title={t(`course.acts.${act}` as MessageKey)}>
                {t(`course.actNumerals.${act}` as MessageKey)}
              </span>
              <ol>
                {chapters
                  .filter((chapter) => chapter.act === act)
                  .map((chapter) => {
                    const done = Boolean(progressOf(chapter.id).completedAt);
                    const isCurrent = chapter.id === currentChapterId;
                    const title = t(`chapters.${chapter.id}.title` as MessageKey);
                    return (
                      <li key={chapter.id} className="ticket__item">
                        <button
                          className={`ticket__link${isCurrent ? " is-current" : ""}${done ? " is-set" : ""}`}
                          aria-current={isCurrent ? "page" : undefined}
                          aria-label={`${chapter.number} ${title}${done ? ` · ${t("shell.set")}` : ""}`}
                          title={title}
                          onClick={() => open(chapter.id)}
                        >
                          <span className="ticket__number">{chapter.number}</span>
                        </button>
                      </li>
                    );
                  })}
              </ol>
            </div>
          ))}
        </div>
        {current && (
          <p className="ticket__caption" aria-hidden="true">
            <span>{t(`course.acts.${current.act}` as MessageKey)}</span> · {current.number} {t(`chapters.${current.id}.title` as MessageKey)}
          </p>
        )}
      </nav>

      <div className="masthead__tools">
        <div className="locale-switch" role="group" aria-label={t("shell.language")}>
          {availableLocales.map((code) => (
            <button
              key={code}
              className={code === locale ? "is-current" : ""}
              aria-pressed={code === locale}
              lang={localeMeta(code).htmlLang}
              title={localeMeta(code).name}
              onClick={() => update((s) => ({ ...s, locale: code }))}
            >
              {localeMeta(code).short}
            </button>
          ))}
        </div>
        <div className="masthead__quiet-tools">
        <button
          className="sound-toggle"
          aria-pressed={state.pressSound}
          onClick={() => update((s) => ({ ...s, pressSound: !s.pressSound }))}
          data-testid="sound-toggle"
        >
          {t("shell.sound")}: {state.pressSound ? t("shell.soundOn") : t("shell.soundOff")}
        </button>
        <button className="button button--quiet" onClick={() => dialog.current?.showModal()}>
          {t("shell.reset")}
        </button>
        </div>
      </div>

      <dialog ref={dialog} className="reset-dialog" aria-labelledby="reset-title">
        <h2 id="reset-title">{t("shell.resetTitle")}</h2>
        <p>{t("shell.resetBody")}</p>
        <form method="dialog" className="reset-dialog__actions">
          <button className="button" value="cancel" autoFocus>
            {t("shell.resetCancel")}
          </button>
          <button className="button button--primary" value="confirm" onClick={reset}>
            {t("shell.resetConfirm")}
          </button>
        </form>
      </dialog>
    </header>
  );
}

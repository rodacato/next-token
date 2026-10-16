import { useRef } from "react";
import { chapters } from "../content";
import { availableLocales, localeMeta } from "../i18n/catalog";
import { useI18n } from "../i18n/I18nProvider";
import { useCourse } from "./CourseProvider";
import type { MessageKey } from "../i18n/catalog";

const plannedActOneChapters = 4;

export function Masthead({ currentChapterId, onOpenChapter }: { currentChapterId: string; onOpenChapter: (id: string) => void }) {
  const { t, locale } = useI18n();
  const { state, update, reset, progressOf } = useCourse();
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <header className="masthead">
      <a className="skip-link" href="#bench">
        {t("shell.skipToBench")}
      </a>
      <div className="masthead__title">
        <span className="masthead__name">{t("course.title")}</span>
        <span className="kicker">{t("course.subtitle")}</span>
      </div>

      <nav className="ticket" aria-label={t("course.acts.compositor")}>
        <span className="kicker ticket__act">{t("course.acts.compositor")}</span>
        <ol>
          {Array.from({ length: plannedActOneChapters }, (_, index) => {
            const chapter = chapters[index];
            if (!chapter) {
              return (
                <li key={index} className="ticket__item ticket__item--uncast">
                  <span className="ticket__number">{index + 1}</span>
                  <span>{t("shell.notCast")}</span>
                </li>
              );
            }
            const done = Boolean(progressOf(chapter.id).completedAt);
            return (
              <li key={chapter.id} className="ticket__item">
                <button
                  className={`ticket__link${chapter.id === currentChapterId ? " is-current" : ""}`}
                  aria-current={chapter.id === currentChapterId ? "page" : undefined}
                  onClick={() => onOpenChapter(chapter.id)}
                >
                  <span className="ticket__number">{chapter.number}</span>
                  <span>{t(`chapters.${chapter.id}.title` as MessageKey)}</span>
                  {done && <span className="ticket__set">{t("shell.set")}</span>}
                </button>
              </li>
            );
          })}
        </ol>
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

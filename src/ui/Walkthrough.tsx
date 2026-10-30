import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MessageKey } from "../i18n/catalog";
import { useI18n } from "../i18n/I18nProvider";

const steps = [
  { id: "job", target: ".stage-copy" },
  { id: "bench", target: "#bench" },
  { id: "move", target: ".stage-rail" },
] as const;

const GAP = 16;
const RING_PAD = 8;

export type Box = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

export function walkthroughDisabled(search: string): boolean {
  return new URLSearchParams(search).get("walkthrough") === "off";
}

// Beside the target if it fits, else below or above it, and always inside the viewport.
export function placeNote(target: Box, note: { width: number; height: number }, viewport: { width: number; height: number }) {
  const clampX = (x: number) => Math.min(Math.max(GAP, x), viewport.width - note.width - GAP);
  const clampY = (y: number) => Math.min(Math.max(GAP, y), viewport.height - note.height - GAP);
  const right = target.left + target.width;
  const bottom = target.top + target.height;
  if (viewport.width - right >= note.width + 2 * GAP) return { left: right + GAP, top: clampY(target.top) };
  if (target.left >= note.width + 2 * GAP) return { left: target.left - GAP - note.width, top: clampY(target.top) };
  if (viewport.height - bottom >= note.height + 2 * GAP) return { left: clampX(target.left), top: bottom + GAP };
  if (target.top >= note.height + 2 * GAP) return { left: clampX(target.left), top: target.top - GAP - note.height };
  return { left: clampX(target.left), top: viewport.height - note.height - GAP };
}

export function Walkthrough({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const step = steps[index] ?? steps[0];
  const last = index === steps.length - 1;
  const target = useTargetBox(step.target);
  const note = useRef<HTMLElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [noteSize, setNoteSize] = useState({ width: 320, height: 200 });
  const found = target !== null;

  // The chapter's own autofocus runs when it finishes loading, after this mounts.
  useEffect(() => {
    if (found) next.current?.focus();
  }, [found, index]);

  useLayoutEffect(() => {
    if (note.current) setNoteSize({ width: note.current.offsetWidth, height: note.current.offsetHeight });
  }, [index, target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      if (e.key !== "Tab" || !note.current) return;
      const buttons = [...note.current.querySelectorAll("button")];
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const to = at === -1 ? 0 : (at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      e.preventDefault();
      buttons[to]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const ring = target && {
    left: Math.max(0, target.left - RING_PAD),
    top: Math.max(0, target.top - RING_PAD),
    width: Math.min(viewport.width, target.width + 2 * RING_PAD),
    height: Math.min(viewport.height, target.height + 2 * RING_PAD),
  };
  const position = ring ? placeNote(ring, noteSize, viewport) : { left: GAP, top: GAP };
  const key = (suffix: string) => `walkthrough.${suffix}` as MessageKey;

  return (
    <div className="walkthrough" data-testid="walkthrough">
      <svg className="walkthrough__shade" viewBox={`0 0 ${viewport.width} ${viewport.height}`} aria-hidden="true">
        <path
          d={`M0,0 H${viewport.width} V${viewport.height} H0 Z` + (ring ? ` M${ring.left},${ring.top} v${ring.height} h${ring.width} v${-ring.height} Z` : "")}
          fillRule="evenodd"
        />
        {ring && <rect className="walkthrough__ring" x={ring.left} y={ring.top} width={ring.width} height={ring.height} />}
      </svg>
      <section ref={note} className="walkthrough__note" style={{ ...position, visibility: found ? "visible" : "hidden" }} role="dialog" aria-modal="true" aria-labelledby="walkthrough-title">
        <span className="kicker">{t(key("kicker"), { n: index + 1, total: steps.length })}</span>
        <h2 id="walkthrough-title">{t(key(`steps.${step.id}.title`))}</h2>
        <p>{t(key(`steps.${step.id}.body`))}</p>
        <div className="actions actions--row">
          <button type="button" className="button button--quiet" onClick={onDone} data-testid="walkthrough-skip">
            {t(key("skip"))}
          </button>
          {index > 0 && (
            <button type="button" className="button" onClick={() => setIndex(index - 1)}>
              {t(key("back"))}
            </button>
          )}
          <button ref={next} type="button" className="button button--primary" onClick={() => (last ? onDone() : setIndex(index + 1))} data-testid="walkthrough-next">
            {t(key(last ? "done" : "next"))}
          </button>
        </div>
      </section>
    </div>
  );
}

// The chapter loads lazily, so the target may not exist on the first frame.
function useTargetBox(selector: string): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    let frame = 0;
    let scrolled = false;
    const measure = () => {
      const element = document.querySelector(selector);
      if (!element) {
        frame = requestAnimationFrame(measure);
        return;
      }
      if (!scrolled) {
        element.scrollIntoView({ block: "nearest" });
        scrolled = true;
      }
      const { left, top, width, height } = element.getBoundingClientRect();
      setBox({ left, top, width, height });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [selector]);
  return box;
}

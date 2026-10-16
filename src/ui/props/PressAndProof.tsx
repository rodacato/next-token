import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

type PressAndProofProps = {
  readonly impression: ReactNode;
  readonly impressionCount: number;
  readonly pressLabel: string;
  readonly proofLabel: string;
  readonly empty: ReactNode;
};

// The platen drops onto the proof, jolts, and lifts; the newest sort is inked only on contact.
export function PressAndProof({ impression, impressionCount, pressLabel, proofLabel, empty }: PressAndProofProps) {
  const platen = useAnimationControls();
  const reduceMotion = useReducedMotion();
  const [inkedCount, setInkedCount] = useState(impressionCount);
  const stamping = !reduceMotion && impressionCount > inkedCount;

  useEffect(() => {
    if (impressionCount === inkedCount) return;
    let cancelled = false;
    void (async () => {
      if (impressionCount > inkedCount && !reduceMotion) {
        await platen.start({ y: "calc(100% + 18px)", transition: { duration: 0.3, ease: [0.55, 0, 0.9, 0.45] } });
        if (cancelled) return;
        setInkedCount(impressionCount);
        await platen.start({ y: "calc(100% + 20px)", transition: { duration: 0.12 } });
        await platen.start({ y: 0, transition: { duration: 0.45, ease: [0.3, 0, 0.2, 1] } });
      } else {
        await Promise.resolve();
        if (!cancelled) setInkedCount(impressionCount);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [impressionCount, inkedCount, platen, reduceMotion]);

  return (
    <section className="press-proof" aria-label={proofLabel}>
      <motion.div className="platen" animate={platen} aria-hidden="true">
        <span className="platen__lever" />
        <span className="kicker platen__label">{pressLabel}</span>
      </motion.div>
      <div className={`proof${stamping ? " is-stamping" : ""}`}>
        <div className="proof__marks" aria-hidden="true" />
        <span className="kicker proof__label">{proofLabel}</span>
        <div className="proof__impression" aria-live="polite" data-testid="impression">
          {impression ?? <span className="proof__empty">{empty}</span>}
        </div>
      </div>
    </section>
  );
}

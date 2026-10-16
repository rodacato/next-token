import { motion, useReducedMotion } from "motion/react";
import { sortFace } from "../../model/tokenizers";

type SortProps = {
  readonly text: string;
  readonly tokenId: number;
  readonly variant?: "metal" | "chosen";
  readonly size?: "regular" | "small";
  readonly title?: string;
  readonly dropDelay?: number;
};

// Falls with weight and seats with a slight compression; no rebound.
const FALL = { duration: 0.26, ease: [0.55, 0, 0.9, 0.45] as const };

export function Sort({ text, tokenId, variant = "metal", size = "regular", title, dropDelay = 0 }: SortProps) {
  const reduceMotion = useReducedMotion();
  const face = sortFace(text);
  return (
    <motion.span
      className={`sort sort--${variant} sort--${size}${face.fragment ? " sort--fragment" : ""}`}
      data-token-id={tokenId}
      title={title}
      initial={reduceMotion ? false : { y: -46, opacity: 0, scaleY: 1 }}
      animate={reduceMotion ? {} : { y: [-46, 0, 0], opacity: [0, 1, 1], scaleY: [1, 0.94, 1] }}
      transition={reduceMotion ? { duration: 0 } : { ...FALL, delay: dropDelay, times: [0, 0.82, 1] }}
    >
      {face.leadingSpace && <span className="sort__space" aria-hidden="true">·</span>}
      <span className="sort__face">{face.leadingSpace ? face.label.slice(1) : face.label}</span>
    </motion.span>
  );
}

import { forwardRef, type ReactNode } from "react";
import type { TokenPiece } from "../../model/protocol";
import { Sort } from "./Sort";

type ComposingStickProps = {
  readonly label: ReactNode;
  readonly count?: ReactNode;
  readonly pieces: readonly TokenPiece[];
  readonly nextLabel?: string;
  readonly describePiece?: (piece: TokenPiece) => string;
  readonly children?: ReactNode;
  readonly testId?: string;
};

export const ComposingStick = forwardRef<HTMLSpanElement, ComposingStickProps>(function ComposingStick(
  { label, count, pieces, nextLabel, describePiece, children, testId },
  nextSlotRef,
) {
  return (
    <figure className="stick" data-testid={testId}>
      <figcaption className="stick__caption">
        <span className="kicker">{label}</span>
        {count !== undefined && <span className="stick__count">{count}</span>}
      </figcaption>
      <div className="stick__rail">
        <span className="stick__knee" aria-hidden="true" />
        <div className="stick__sorts" role="list">
          {pieces.map((piece, index) => (
            <span role="listitem" key={`${index}-${piece.tokenId}`}>
              <Sort text={piece.text} tokenId={piece.tokenId} {...(describePiece ? { title: describePiece(piece) } : {})} dropDelay={Math.min(index, 12) * 0.018} />
            </span>
          ))}
          {nextLabel !== undefined && (
            <span className="stick__next" ref={nextSlotRef}>
              <span className="stick__next-label">{nextLabel}</span>
            </span>
          )}
          {children}
        </div>
      </div>
      <div className="stick__gauge" aria-hidden="true" />
    </figure>
  );
});

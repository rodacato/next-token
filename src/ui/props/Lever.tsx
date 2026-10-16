import { useId } from "react";

type LeverProps = {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly marks: readonly [string, string];
  readonly onChange: (value: number) => void;
  readonly format?: (value: number) => string;
  readonly testId?: string;
};

export function Lever({ label, value, min, max, step, marks, onChange, format = (v) => v.toFixed(2), testId }: LeverProps) {
  const id = useId();
  return (
    <div className="lever">
      <div className="lever__head">
        <label className="kicker" htmlFor={id}>
          {label}
        </label>
        <output className="lever__value" htmlFor={id}>
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        data-testid={testId}
        className="lever__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="lever__scale" aria-hidden="true">
        <span>{marks[0]}</span>
        <span>{marks[1]}</span>
      </div>
    </div>
  );
}

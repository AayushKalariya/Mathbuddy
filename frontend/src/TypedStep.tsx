import { useEffect, useRef, useState } from "react";
import MathPreview from "./MathPreview";
import type { Step } from "./state";

export default function TypedStep({
  step,
  number,
  onChange,
}: {
  step: Step;
  number: number;
  onChange: (math: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  return (
    <div className="typed-entry">
      {editing || !step.math.trim() ? (
        <>
          <label className="visually-hidden" htmlFor={`typed-${step.id}`}>
            Equation for step {number}
          </label>
          <input
            ref={input}
            id={`typed-${step.id}`}
            className="math-input"
            placeholder="What comes next?"
            value={step.math}
            maxLength={256}
            autoComplete="off"
            spellCheck={false}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            onChange={(event) => onChange(event.target.value)}
          />
        </>
      ) : (
        <button
          className="equation-display"
          aria-label={`Edit equation for step ${number}`}
          title="Edit equation"
          onClick={() => setEditing(true)}
        >
          <MathPreview value={step.math} />
        </button>
      )}
    </div>
  );
}

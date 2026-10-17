import { useMemo } from "react";
import katex from "katex";

export default function MathPreview({ value }: { value: string }) {
  const isTask =
    /\b(?:differentiate|integrate|evaluate|solve|find|prove|show|given|where)\b/i.test(
      value,
    );
  const html = useMemo(() => {
    if (isTask) return undefined;
    try {
      return katex.renderToString(value.replace(/^\$\$?|\$\$?$/g, ""), {
        throwOnError: true,
        trust: false,
        strict: "ignore",
        maxExpand: 500,
        maxSize: 10,
        output: "htmlAndMathml",
      });
    } catch {
      return undefined;
    }
  }, [value, isTask]);
  return html ? (
    <div className="math-preview" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <div className={`math-preview plain ${isTask ? "task-preview" : ""}`}>
      {value}
    </div>
  );
}

import { useMemo } from "react";
import katex from "katex";

export default function MathPreview({ value }: { value: string }) {
  const html = useMemo(() => {
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
  }, [value]);
  return html ? (
    <div className="math-preview" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <div className="math-preview plain">{value}</div>
  );
}

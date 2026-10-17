import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Eraser, PenLine, RotateCcw, Undo2 } from "lucide-react";
import {
  INK_HEIGHT,
  INK_WIDTH,
  inputIntent,
  nearStroke,
  outline,
  polygonPath,
} from "./ink";
import type { Point, Stroke } from "./state";

type Props = {
  strokes: Stroke[];
  touchDrawing: boolean;
  label: string;
  onChange: (strokes: Stroke[]) => void;
};
export default function DrawingPad({
  strokes,
  touchDrawing,
  label,
  onChange,
}: Props) {
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [draft, setDraft] = useState<Stroke | undefined>();
  const active = useRef<{
    id: number;
    points: Point[];
    before: Stroke[];
    remaining: Stroke[];
  } | null>(null);
  const undo = useRef<Stroke[][]>([]);
  const finger = useRef<{ id: number; y: number } | null>(null);
  function point(
    event: PointerEvent<SVGSVGElement> | globalThis.PointerEvent,
    rect: DOMRect,
  ): Point {
    return [
      Math.max(
        0,
        Math.min(
          INK_WIDTH,
          ((event.clientX - rect.left) / rect.width) * INK_WIDTH,
        ),
      ),
      Math.max(
        0,
        Math.min(
          INK_HEIGHT,
          ((event.clientY - rect.top) / rect.height) * INK_HEIGHT,
        ),
      ),
      event.pointerType === "pen" && event.pressure > 0 ? event.pressure : 0.5,
    ];
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    const intent = inputIntent(
      event.pointerType,
      touchDrawing,
      !!active.current,
    );
    if (
      intent === "ignore" ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (intent === "scroll") {
      if (!finger.current)
        finger.current = { id: event.pointerId, y: event.clientY };
      return;
    }
    finger.current = null;
    const p = point(event, event.currentTarget.getBoundingClientRect());
    active.current = {
      id: event.pointerId,
      points: [p],
      before: strokes,
      remaining: strokes,
    };
    // Invalidate feedback at pen-down, before an older request can resolve.
    onChange(strokes);
    if (tool === "eraser") erase(p);
    else setDraft({ points: [p] });
  }
  function erase(p: Point) {
    if (!active.current) return;
    active.current.remaining = active.current.remaining.filter(
      (stroke) => !nearStroke(stroke, p),
    );
    onChange(active.current.remaining);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (finger.current?.id === event.pointerId) {
      event.preventDefault();
      window.scrollBy({
        top: finger.current.y - event.clientY,
        behavior: "auto",
      });
      finger.current.y = event.clientY;
      return;
    }
    if (active.current?.id !== event.pointerId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [
      event.nativeEvent,
    ];
    for (const sample of events.length ? events : [event.nativeEvent]) {
      const p = point(sample, rect);
      active.current.points.push(p);
      if (tool === "eraser") erase(p);
    }
    if (tool === "pen") setDraft({ points: [...active.current.points] });
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    if (finger.current?.id === event.pointerId) {
      finger.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (active.current?.id !== event.pointerId) return;
    const writing = active.current;
    undo.current.push(writing.before);
    onChange(
      tool === "pen"
        ? [...writing.before, { points: writing.points }]
        : writing.remaining,
    );
    active.current = null;
    setDraft(undefined);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function clear() {
    undo.current.push(strokes);
    onChange([]);
  }
  return (
    <div className="drawing-pad">
      <div
        className="ink-toolbar"
        role="toolbar"
        aria-label={`${label} drawing tools`}
      >
        <div className="tool-group">
          <button
            type="button"
            className={tool === "pen" ? "tool active" : "tool"}
            aria-pressed={tool === "pen"}
            onClick={() => setTool("pen")}
            title="Pen"
          >
            <PenLine size={17} />
            <span>Pen</span>
          </button>
          <button
            type="button"
            className={tool === "eraser" ? "tool active" : "tool"}
            aria-pressed={tool === "eraser"}
            onClick={() => setTool("eraser")}
            title="Erase a stroke"
          >
            <Eraser size={17} />
            <span>Eraser</span>
          </button>
          <span className="tool-divider" />
          <button
            type="button"
            className="tool"
            aria-label={`Undo ${label}`}
            title="Undo"
            disabled={!undo.current.length}
            onClick={() => {
              const previous = undo.current.pop();
              if (previous) onChange(previous);
            }}
          >
            <Undo2 size={18} />
          </button>
          <button
            type="button"
            className="tool"
            aria-label={`Clear ${label}`}
            title="Clear writing"
            disabled={!strokes.length}
            onClick={clear}
          >
            <RotateCcw size={17} />
          </button>
        </div>
        <span className="ink-tip">
          {touchDrawing
            ? "Pencil, finger, or mouse"
            : "Pencil or mouse · scroll with a finger"}
        </span>
      </div>
      <div className="paper">
        {!strokes.length && !draft && (
          <span className="paper-placeholder">Write your next step here…</span>
        )}
        <svg
          viewBox={`0 0 ${INK_WIDTH} ${INK_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${label} handwriting area`}
          // Native pan-y can cancel pen strokes too. Route finger drags explicitly.
          // https://www.w3.org/TR/pointerevents/#the-touch-action-css-property
          style={{ touchAction: "none" }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
        >
          {strokes.map((stroke, i) => (
            <path
              key={i}
              d={polygonPath(outline(stroke))}
              fill="currentColor"
            />
          ))}
          {draft && (
            <path d={polygonPath(outline(draft))} fill="currentColor" />
          )}
        </svg>
      </div>
    </div>
  );
}

import { useRef, useState } from "react";
import type { PointerEvent } from "react";
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
  tool: "pen" | "eraser";
  onBegin: () => void;
  onEnd: () => void;
  onChange: (strokes: Stroke[]) => void;
};
export default function DrawingPad({
  strokes,
  touchDrawing,
  label,
  tool,
  onBegin,
  onEnd,
  onChange,
}: Props) {
  const [draft, setDraft] = useState<Stroke | undefined>();
  const active = useRef<{
    id: number;
    points: Point[];
    before: Stroke[];
    remaining: Stroke[];
    tool: "pen" | "eraser";
  } | null>(null);
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
      tool,
    };
    // Invalidate feedback at pen-down, before an older request can resolve.
    onBegin();
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
      if (active.current.tool === "eraser") erase(p);
    }
    if (active.current.tool === "pen")
      setDraft({ points: [...active.current.points] });
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
    onChange(
      writing.tool === "pen"
        ? [...writing.before, { points: writing.points }]
        : writing.remaining,
    );
    active.current = null;
    setDraft(undefined);
    onEnd();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <div className="drawing-pad">
      <div className="paper">
        {!strokes.length && !draft && (
          <span className="paper-placeholder">What comes next?</span>
        )}
        <svg
          viewBox={`0 0 ${INK_WIDTH} ${INK_HEIGHT}`}
          preserveAspectRatio="xMinYMin meet"
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

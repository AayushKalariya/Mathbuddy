import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Crop, ScanLine } from "lucide-react";

type Rect = { x: number; y: number; w: number; h: number };
export async function imageBlob(source: string, crop?: Rect): Promise<Blob> {
  const image = new Image();
  image.src = source;
  await image.decode();
  const area = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * area.w));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * area.h));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the question image.");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    image.naturalWidth * area.x,
    image.naturalHeight * area.y,
    image.naturalWidth * area.w,
    image.naturalHeight * area.h,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not crop this image."))),
      "image/png",
    ),
  );
}
export default function QuestionImage({
  source,
  busy,
  onRead,
}: {
  source: string;
  busy: boolean;
  onRead: (crop?: Rect) => void;
}) {
  const [cropping, setCropping] = useState(false);
  const [crop, setCrop] = useState<Rect | undefined>();
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  function point(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }
  return (
    <div className="question-image">
      <div
        className={`crop-surface ${cropping ? "cropping" : ""}`}
        style={{ touchAction: cropping ? "none" : "auto" }}
        onPointerDown={(event) => {
          if (!cropping) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          origin.current = { ...point(event), id: event.pointerId };
          setCrop(undefined);
        }}
        onPointerMove={(event) => {
          if (!origin.current || origin.current.id !== event.pointerId) return;
          const p = point(event),
            o = origin.current;
          setCrop({
            x: Math.min(p.x, o.x),
            y: Math.min(p.y, o.y),
            w: Math.abs(p.x - o.x),
            h: Math.abs(p.y - o.y),
          });
        }}
        onPointerUp={(event) => {
          if (origin.current?.id !== event.pointerId) return;
          origin.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          origin.current = null;
          setCrop(undefined);
        }}
      >
        <img src={source} alt="Your uploaded math question" draggable={false} />
        {crop && (
          <div
            className="crop-selection"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.w * 100}%`,
              height: `${crop.h * 100}%`,
            }}
          />
        )}
      </div>
      <div className="image-actions">
        <button
          className={`button secondary small ${cropping ? "selected" : ""}`}
          aria-pressed={cropping}
          onClick={() => setCropping(!cropping)}
        >
          <Crop size={15} />
          {cropping ? "Finish selection" : "Select one question"}
        </button>
        {crop && (
          <button className="text-button" onClick={() => setCrop(undefined)}>
            Use full image
          </button>
        )}
        <button
          className="button secondary small"
          disabled={busy || !!(crop && (crop.w < 0.01 || crop.h < 0.01))}
          onClick={() => {
            setCropping(false);
            onRead(crop);
          }}
        >
          <ScanLine size={15} />
          {busy ? "Reading…" : "Read question"}
        </button>
      </div>
      {cropping && (
        <p className="helper">
          Drag a rectangle around the equation, then select Read question.
        </p>
      )}
    </div>
  );
}

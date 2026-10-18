import { getStroke } from "perfect-freehand";
import type { Point, Stroke } from "./state";

export const INK_WIDTH = 1000;
export const INK_HEIGHT = INK_WIDTH;
export function inputIntent(
  pointerType: string,
  touchDrawing: boolean,
  writing: boolean,
): "write" | "scroll" | "ignore" {
  if (writing) return "ignore";
  if (pointerType === "touch" && !touchDrawing) return "scroll";
  return ["pen", "mouse", "touch"].includes(pointerType) ? "write" : "ignore";
}
export function outline(stroke: Stroke): number[][] {
  return getStroke(stroke.points, {
    size: 4.2,
    thinning: 0.25,
    smoothing: 0.5,
    streamline: 0.35,
    simulatePressure: false,
  });
}
export function polygonPath(points: number[][]): string {
  return points.length ? `M${points.map((p) => p.join(",")).join("L")}Z` : "";
}
export function nearStroke(stroke: Stroke, point: Point, radius = 15): boolean {
  const distance = (a: Point, b: Point) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) /
          (dx * dx + dy * dy || 1),
      ),
    );
    return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
  };
  return stroke.points.some(
    (p, i) => distance(p, stroke.points[Math.max(0, i - 1)]) <= radius,
  );
}
export async function rasterize(strokes: Stroke[]): Promise<Blob> {
  if (!strokes.length)
    throw new Error("Write something in this step first, or switch to typing.");
  const canvas = document.createElement("canvas");
  canvas.width = INK_WIDTH * 2;
  canvas.height = INK_HEIGHT * 2;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error(
      "Drawing is unavailable in this browser. Try typing instead.",
    );
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(2, 2);
  context.fillStyle = "#202d35";
  for (const stroke of strokes)
    context.fill(new Path2D(polygonPath(outline(stroke))));
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not read the drawing.")),
      "image/png",
    ),
  );
}

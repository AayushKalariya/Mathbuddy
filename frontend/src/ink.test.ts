import { describe, expect, it } from "vitest";
import { inputIntent, nearStroke, outline } from "./ink";
import type { Stroke } from "./state";

describe("whole-stroke erasing", () => {
  const stroke: Stroke = {
    points: [
      [10, 10, 0.5],
      [210, 210, 0.5],
    ],
  };
  it("hits the middle of a segment, even with sparse pointer samples", () => {
    expect(nearStroke(stroke, [110, 114, 0.5])).toBe(true);
  });
  it("keeps distant strokes", () => {
    expect(nearStroke(stroke, [110, 160, 0.5])).toBe(false);
  });
  it("can erase a single dot without dividing by zero", () => {
    const dot: Stroke = { points: [[15, 20, 0.5]] };
    expect(nearStroke(dot, [16, 21, 0.5])).toBe(true);
    expect(nearStroke(dot, [50, 60, 0.5])).toBe(false);
  });
  it("renders an isolated pen tap as visible ink", () => {
    expect(outline({ points: [[15, 20, 0.5]] }).length).toBeGreaterThan(3);
  });
});

describe("Pencil and finger routing", () => {
  it("writes with Pencil or mouse while fingers scroll by default", () => {
    expect(inputIntent("pen", false, false)).toBe("write");
    expect(inputIntent("mouse", false, false)).toBe("write");
    expect(inputIntent("touch", false, false)).toBe("scroll");
    expect(inputIntent("touch", true, false)).toBe("write");
  });
  it("ignores additional contact while a stroke is active", () => {
    expect(inputIntent("touch", false, true)).toBe("ignore");
    expect(inputIntent("touch", true, true)).toBe("ignore");
  });
});

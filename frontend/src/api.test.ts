import { afterEach, describe, expect, it, vi } from "vitest";
import { check, recognize } from "./api";

afterEach(() => vi.unstubAllGlobals());

const reviewed = {
  status: "verified",
  transition_status: "valid",
  context_status: "consistent",
  message: "The chain rule is applied correctly.",
  warnings: [],
  correction_available: false,
  verification_basis: "AI review",
  reviewer: "gemini",
  model: "gemini-3.8-flash",
  step_id: "one",
  revision: 2,
  context_revision: 0,
};

describe("Gemini workspace API", () => {
  it("sends simple and advanced steps through the same checker endpoint", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(reviewed))));
    vi.stubGlobal("fetch", fetcher);
    for (const problem of [
      "3x+8=20",
      "Differentiate sin(x^2) with respect to x",
    ]) {
      expect(
        (await check({ problem, new_step: "student line" })).reviewer,
      ).toBe("gemini");
    }
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "/api/check-step",
      "/api/check-step",
    ]);
  });

  it("distinguishes question reading from step reading", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ latex: "x=4" }))),
      );
    vi.stubGlobal("fetch", fetcher);
    const image = new Blob(["image"], { type: "image/png" });
    await recognize(image, "question");
    await recognize(image);
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "/api/recognize?purpose=question",
      "/api/recognize?purpose=step",
    ]);
  });

  it("rejects malformed review attribution or verdicts", async () => {
    for (const response of [
      { ...reviewed, reviewer: "other" },
      { ...reviewed, model: 7 },
      { ...reviewed, status: "probably" },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(response))),
      );
      await expect(check({})).rejects.toThrow("Unexpected checker response");
    }
  });

  it("surfaces missing-key and quota errors without a successful verdict", async () => {
    for (const status of [503, 429]) {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ detail: "Gemini needs attention" }), {
              status,
            }),
          ),
      );
      await expect(check({})).rejects.toThrow("Gemini needs attention");
    }
  });
});

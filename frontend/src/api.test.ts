import { afterEach, describe, expect, it, vi } from "vitest";
import { check, recognize, hint } from "./api";

afterEach(() => vi.unstubAllGlobals());

const hinted = {
  kind: "hint",
  hint: "Think about the chain rule.",
  level: 1,
  reviewer: "gemini",
  model: "test",
  step_id: "question",
  revision: 0,
  context_revision: 1,
};

describe("hint API boundary", () => {
  it("posts a hint with a cancellable signal", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(hinted)));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    expect(
      (await hint({ problem: "Differentiate sin(x^2)" }, controller.signal))
        .kind,
    ).toBe("hint");
    expect(fetcher.mock.calls[0][0]).toBe("/api/hint");
    expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);
  });
  it("rejects leaked next steps and malformed progression", async () => {
    for (const reply of [
      { ...hinted, next_step: "answer" },
      { ...hinted, kind: "next_step", next_step: "answer" },
      { ...hinted, level: "1" },
      { ...hinted, hint: "" },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(reply))),
      );
      await expect(hint({})).rejects.toThrow("Unexpected hint response");
    }
  });
});

const reviewed = {
  status: "verified",
  transition_status: "valid",
  context_status: "consistent",
  is_final_answer: false,
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
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(reviewed))),
      );
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
    const controller = new AbortController();
    await recognize(image, "question");
    await recognize(image, "step", controller.signal);
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      "/api/recognize?purpose=question",
      "/api/recognize?purpose=step",
    ]);
    expect(fetcher.mock.calls[1][1].signal).toBe(controller.signal);
  });

  it("rejects malformed review attribution or verdicts", async () => {
    for (const response of [
      { ...reviewed, reviewer: "other" },
      { ...reviewed, model: 7 },
      { ...reviewed, status: "probably" },
      { ...reviewed, is_final_answer: "yes" },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(response))),
      );
      await expect(check({})).rejects.toThrow("Unexpected checker response");
    }
  });

  it("retains a final answer flag and rejects conflicting completion feedback", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ...reviewed, is_final_answer: true })),
        ),
    );
    expect((await check({})).is_final_answer).toBe(true);
    for (const patch of [
      { status: "issue" },
      { transition_status: "unresolved" },
      { context_status: "earlier_issue" },
      { warnings: ["Unresolved restriction"] },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify({ ...reviewed, is_final_answer: true, ...patch }),
            ),
          ),
      );
      await expect(check({})).rejects.toThrow("conflicting completion");
    }
  });

  it("explains when an older server must be restarted for completion detection", async () => {
    const { is_final_answer: _final, ...legacy } = reviewed;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(legacy))),
    );
    await expect(check({})).rejects.toThrow("Restart the laptop server");
  });

  it("surfaces missing-key and quota errors without a successful verdict", async () => {
    for (const status of [503, 429]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ detail: "Gemini needs attention" }), {
            status,
          }),
        ),
      );
      await expect(check({})).rejects.toThrow("Gemini needs attention");
    }
  });
});

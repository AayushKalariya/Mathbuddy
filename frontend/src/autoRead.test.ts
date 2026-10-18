import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_READ_DELAY, AutoReader } from "./autoRead";
import type { ReadSnapshot } from "./autoRead";
import { contextKey, newStep, newWorkspace, reducer } from "./state";
import type { Action, Stroke } from "./state";

const ink = (x: number): Stroke => ({
  points: [
    [x, 20, 0.5],
    [x + 10, 50, 0.5],
  ],
});
const first = [ink(10)],
  second = [...first, ink(40)],
  third = [...second, ink(70)];
function deferred() {
  let resolve!: (math: string) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const readers: AutoReader[] = [];
function setup(initialInk: Stroke[] = []) {
  let state = newWorkspace(),
    enabled = true;
  state = reducer(state, { type: "problem", value: "3x+1=16" });
  state = reducer(state, { type: "confirmProblem" });
  state.steps[0].strokes = initialInk;
  const id = state.steps[0].id;
  const provider = vi.fn(
    async (_snapshot: ReadSnapshot, _signal: AbortSignal) => "3x=15",
  );
  const apply = (action: Action) => {
    state = reducer(state, action);
    reader.observe(state, enabled);
  };
  const read = vi.fn(
    async (snapshot: ReadSnapshot, signal: AbortSignal, cached?: string) => {
      const token = `request-${read.mock.calls.length}`;
      apply({ type: "start", id: snapshot.id, token, kind: "reading" });
      try {
        const math = cached ?? (await provider(snapshot, signal));
        const index = state.steps.findIndex((step) => step.id === snapshot.id);
        if (
          signal.aborted ||
          index < 0 ||
          state.steps[index].drawing ||
          contextKey(state, index) !== snapshot.key
        )
          return;
        apply({
          type: "read",
          id: snapshot.id,
          token,
          key: snapshot.key,
          math,
        });
        return math;
      } catch (error) {
        apply({
          type: "error",
          id: snapshot.id,
          token,
          key: snapshot.key,
          error: String(error),
        });
      }
    },
  );
  const reader = new AutoReader({ latest: () => state, read });
  readers.push(reader);
  reader.observe(state, enabled);
  function begin(target = id) {
    reader.begin(target);
    apply({ type: "beginInk", id: target });
  }
  function finish(strokes: Stroke[], target = id) {
    apply({
      type: "edit",
      id: target,
      patch: { strokes, math: "", confirmed: false },
    });
    apply({ type: "endInk", id: target });
  }
  return {
    id,
    reader,
    provider,
    read,
    apply,
    begin,
    finish,
    state: () => state,
    draw(strokes: Stroke[], target = id) {
      begin(target);
      finish(strokes, target);
    },
    enable(value: boolean) {
      enabled = value;
      reader.observe(state, enabled);
    },
  };
}
const advance = (milliseconds = AUTO_READ_DELAY) =>
  vi.advanceTimersByTimeAsync(milliseconds);
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  readers.splice(0).forEach((reader) => reader.dispose());
  vi.useRealTimers();
});

describe("automatic handwriting reading", () => {
  it("waits 1.5 seconds after the last stroke, restarting on continued writing", async () => {
    const h = setup();
    h.draw(first);
    await advance(1000);
    h.draw(second);
    await advance(1499);
    expect(h.provider).not.toHaveBeenCalled();
    await advance(1);
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.provider.mock.calls[0][0].strokes).toBe(second);
    expect(h.state().steps[0].math).toBe("3x=15");
    expect(h.state().steps[0].confirmed).toBe(false);
    expect(h.state().steps[0].result).toBeUndefined();
    expect(h.state().steps).toHaveLength(1);
  });

  it("never reads while the pen is held, even beyond an earlier deadline", async () => {
    const h = setup();
    h.draw(first);
    await advance(1400);
    h.begin();
    await advance(10000);
    expect(h.provider).not.toHaveBeenCalled();
    h.finish(second);
    await advance(1499);
    expect(h.provider).not.toHaveBeenCalled();
    await advance(1);
    expect(h.provider).toHaveBeenCalledOnce();
  });

  it("coalesces edits during a request, discards its reply, and runs one updated read", async () => {
    const h = setup(),
      old = deferred(),
      updated = deferred();
    h.provider
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(updated.promise);
    h.draw(first);
    await advance();
    h.draw(second);
    await advance(1000);
    h.draw(third);
    await advance(5000);
    expect(h.provider).toHaveBeenCalledOnce();
    old.resolve("old ink");
    await advance(0);
    expect(h.state().steps[0].math).toBe("");
    expect(h.provider).toHaveBeenCalledTimes(2);
    expect(h.provider.mock.calls[1][0].strokes).toBe(third);
    updated.resolve("latest ink");
    await advance(0);
    expect(h.state().steps[0].math).toBe("latest ink");
    await advance(20000);
    expect(h.provider).toHaveBeenCalledTimes(2);
  });

  it("still waits for the full pause when the previous request finishes early", async () => {
    const h = setup(),
      old = deferred();
    h.provider.mockReturnValueOnce(old.promise);
    h.draw(first);
    await advance();
    h.draw(second);
    old.resolve("stale");
    await advance(1499);
    expect(h.provider).toHaveBeenCalledOnce();
    await advance(1);
    expect(h.provider).toHaveBeenCalledTimes(2);
  });

  it("shares the lane across boxes and manual Check/Read actions", async () => {
    const h = setup(),
      pending = deferred();
    h.provider.mockReturnValueOnce(pending.promise);
    const extra = newStep();
    h.apply({
      type: "restore",
      state: { ...h.state(), steps: [...h.state().steps, extra] },
    });
    h.draw(first);
    await advance(1000);
    const manual = h.reader.readNow(h.id);
    await advance(0);
    const sameRequest = h.reader.readNow(h.id);
    h.draw(second, extra.id);
    await advance(5000);
    expect(h.provider).toHaveBeenCalledOnce();
    pending.resolve("3x=15");
    await advance(0);
    await Promise.all([manual, sameRequest]);
    expect(h.provider).toHaveBeenCalledTimes(2);
    expect(h.provider.mock.calls[1][0].id).toBe(extra.id);
  });

  it("leaves editable readings authoritative if an older reply arrives", async () => {
    const h = setup(),
      pending = deferred();
    h.provider.mockReturnValueOnce(pending.promise);
    h.draw(first);
    await advance();
    h.apply({ type: "edit", id: h.id, patch: { math: "3x=12" } });
    pending.resolve("3x=15");
    await advance(10000);
    expect(h.state().steps[0].math).toBe("3x=12");
    expect(h.provider).toHaveBeenCalledOnce();
  });

  it("reuses the current reading for unchanged ink and undo, including manual corrections", async () => {
    const h = setup();
    h.draw(first);
    await advance();
    h.apply({ type: "edit", id: h.id, patch: { math: "corrected reading" } });
    h.draw([...first]); // An eraser gesture that did not hit a stroke.
    await advance();
    expect(h.state().steps[0].math).toBe("corrected reading");
    expect(h.provider).toHaveBeenCalledOnce();
    h.draw(second);
    h.apply({ type: "undoInk", id: h.id });
    await advance();
    expect(h.state().steps[0].math).toBe("corrected reading");
    expect(h.provider).toHaveBeenCalledOnce();
  });

  it("reads a newer revision even when ink returns to the in-flight image", async () => {
    const h = setup(),
      pending = deferred();
    h.provider.mockReturnValueOnce(pending.promise);
    h.draw(first);
    await advance();
    h.draw(second);
    h.apply({ type: "undoInk", id: h.id });
    pending.resolve("discarded old revision");
    await advance();
    expect(h.provider).toHaveBeenCalledTimes(2);
    expect(h.state().steps[0].math).toBe("3x=15");
  });

  it("surfaces an API failure without a retry loop, and supports explicit retry", async () => {
    const h = setup();
    h.provider.mockRejectedValueOnce(new Error("Quota reached"));
    h.draw(first);
    await advance();
    expect(h.state().steps[0].error).toContain("Quota reached");
    await advance(30000);
    expect(h.provider).toHaveBeenCalledOnce();
    const retry = h.reader.readNow(h.id);
    await advance(0);
    await retry;
    expect(h.provider).toHaveBeenCalledTimes(2);
    expect(h.state().steps[0].error).toBeUndefined();
    expect(h.state().steps[0].math).toBe("3x=15");
  });

  it("keeps queued work until automatic reading is available", async () => {
    const h = setup();
    h.enable(false);
    h.draw(first);
    await advance(10000);
    expect(h.provider).not.toHaveBeenCalled();
    h.enable(true);
    await advance(0);
    expect(h.provider).toHaveBeenCalledOnce();
  });

  it("does not spend requests on restored drafts, unrelated state, typed or empty boxes", async () => {
    const h = setup(first);
    h.apply({ type: "touch", value: true });
    await advance(10000);
    expect(h.provider).not.toHaveBeenCalled();
    h.draw(second);
    h.apply({
      type: "edit",
      id: h.id,
      patch: { mode: "typed", math: "3x=15", confirmed: true },
    });
    await advance();
    expect(h.provider).not.toHaveBeenCalled();
    h.apply({
      type: "edit",
      id: h.id,
      patch: { mode: "handwriting", math: "" },
    });
    h.draw(third);
    h.apply({ type: "clearInk", id: h.id });
    await advance();
    expect(h.provider).not.toHaveBeenCalled();
  });

  it("drops queued work on a new question and ignores an old request", async () => {
    const h = setup(),
      pending = deferred();
    h.provider.mockReturnValueOnce(pending.promise);
    h.draw(first);
    await advance();
    h.draw(second);
    h.apply({ type: "restore", state: newWorkspace() });
    pending.resolve("old question");
    await advance(10000);
    expect(h.state().steps[0].math).toBe("");
    expect(h.provider).toHaveBeenCalledOnce();
  });

  it("clears timers and aborts its active fetch when unmounted", async () => {
    const h = setup(),
      pending = deferred();
    h.provider.mockReturnValueOnce(pending.promise);
    h.draw(first);
    const waiting = h.reader.readNow(h.id);
    await advance(0);
    const signal = h.provider.mock.calls[0][1];
    h.draw(second);
    h.reader.dispose();
    await waiting;
    expect(signal.aborted).toBe(true);
    pending.resolve("discarded");
    await advance(10000);
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.state().steps[0].math).toBe("");
  });
});

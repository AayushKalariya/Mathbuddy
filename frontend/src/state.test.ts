import { describe, expect, it } from "vitest";
import {
  checkPayload,
  contextKey,
  newWorkspace,
  persisted,
  reducer,
} from "./state";
import type { CheckResult, Workspace } from "./state";

function fixture(): Workspace {
  let state = newWorkspace();
  state = reducer(state, { type: "problem", value: "3(x+2)=15" });
  state = reducer(state, { type: "confirmProblem" });
  for (const math of ["3x+6=15", "3x=9", "x=3"]) {
    const id = state.steps.at(-1)!.id;
    state = reducer(state, {
      type: "edit",
      id,
      patch: { math, mode: "typed", confirmed: true },
    });
    if (math !== "x=3") state = reducer(state, { type: "add" });
  }
  return state;
}
function result(state: Workspace, index: number): CheckResult {
  return {
    status: "verified",
    transition_status: "valid",
    context_status: "consistent",
    message: "Valid",
    warnings: [],
    verification_basis: "Exact solutions",
    correction_available: false,
    step_id: state.steps[index].id,
    revision: state.steps[index].revision,
    context_revision: state.problemRevision,
  };
}
describe("workspace checks and revisions", () => {
  it("supplies complete ordered history, even when an earlier step is wrong", () => {
    const state = fixture();
    state.steps[0].math = "3x+6=16";
    const payload = checkPayload(state, 2);
    expect(payload.history).toEqual(["3x+6=16"]);
    expect(payload.previous_step).toBe("3x=9");
    expect(payload.new_step).toBe("x=3");
    expect(payload.request_correction).toBe(false);
  });
  it("uses the question as the first premise", () => {
    const state = fixture();
    expect(checkPayload(state, 0).previous_step).toBe(state.problem);
    expect(checkPayload(state, 0).history).toEqual([]);
  });
  it("requires a confirmed reading of earlier writing without requiring a valid verdict", () => {
    const state = fixture();
    state.steps[0].confirmed = false;
    expect(() => checkPayload(state, 1)).toThrow("confirm each earlier");
    state.steps[0].confirmed = true;
    expect(() => checkPayload(state, 1)).not.toThrow();
  });
  it("rejects invalid variable or unconfirmed question before requesting a verdict", () => {
    const state = fixture();
    state.variable = "3";
    expect(() => checkPayload(state, 0)).toThrow("one letter");
    state.problemConfirmed = false;
    expect(() => checkPayload(state, 0)).toThrow("Confirm the question");
  });
  it("invalidates an edited step and every later result, preserving earlier results", () => {
    const state = fixture();
    state.steps.forEach((s, i) => {
      s.result = result(state, i);
    });
    const next = reducer(state, {
      type: "edit",
      id: state.steps[1].id,
      patch: { math: "3x=11" },
    });
    expect(next.steps[0].result?.status).toBe("verified");
    expect(next.steps[1].result).toBeUndefined();
    expect(next.steps[2].result).toBeUndefined();
    expect(next.steps[2].stale).toBe(true);
  });
  it("discards a response after an earlier edit", () => {
    let state = fixture();
    const id = state.steps[2].id,
      key = contextKey(state, 2),
      response = result(state, 2);
    state = reducer(state, {
      type: "start",
      id,
      token: "request",
      kind: "checking",
    });
    state = reducer(state, {
      type: "edit",
      id: state.steps[0].id,
      patch: { math: "3x=11" },
    });
    const unchanged = reducer(state, {
      type: "result",
      id,
      key,
      token: "request",
      result: response,
    });
    expect(unchanged).toBe(state);
    expect(unchanged.steps[2].result).toBeUndefined();
  });
  it("accepts a current response but rejects superseded requests and mismatched metadata", () => {
    let state = fixture();
    const id = state.steps[0].id,
      key = contextKey(state, 0),
      response = result(state, 0);
    state = reducer(state, {
      type: "start",
      id,
      token: "new",
      kind: "checking",
    });
    expect(
      reducer(state, {
        type: "result",
        id,
        key,
        token: "old",
        result: response,
      }),
    ).toBe(state);
    expect(
      reducer(state, {
        type: "result",
        id,
        key,
        token: "new",
        result: { ...response, revision: 999 },
      }),
    ).toBe(state);
    expect(
      reducer(state, {
        type: "result",
        id,
        key,
        token: "new",
        result: response,
      }).steps[0].result,
    ).toEqual(response);
  });
  it("does not let a later edit cancel an earlier step check", () => {
    let state = fixture();
    const id = state.steps[0].id,
      key = contextKey(state, 0),
      response = result(state, 0);
    state = reducer(state, { type: "start", id, token: "a", kind: "checking" });
    state = reducer(state, {
      type: "edit",
      id: state.steps[2].id,
      patch: { math: "3=x" },
    });
    expect(
      reducer(state, { type: "result", id, key, token: "a", result: response })
        .steps[0].result,
    ).toEqual(response);
  });
  it("recognition proposes an unconfirmed reading and discards old readings after edits", () => {
    let state = fixture();
    const id = state.steps[0].id,
      key = contextKey(state, 0);
    state = reducer(state, {
      type: "start",
      id,
      token: "read",
      kind: "reading",
    });
    const read = reducer(state, {
      type: "read",
      id,
      key,
      token: "read",
      math: "3x+6=15",
    });
    expect(read.steps[0].confirmed).toBe(false);
    expect(read.steps[0].pending).toBeUndefined();
    state = reducer(state, {
      type: "edit",
      id,
      patch: { math: "new writing" },
    });
    expect(
      reducer(state, {
        type: "read",
        id,
        key,
        token: "read",
        math: "old reading",
      }),
    ).toBe(state);
  });
  it("preserves ink on network error", () => {
    let state = fixture();
    state.steps[0].strokes = [{ points: [[1, 2, 0.5]] }];
    const id = state.steps[0].id,
      key = contextKey(state, 0);
    state = reducer(state, { type: "start", id, token: "a", kind: "reading" });
    state = reducer(state, {
      type: "error",
      id,
      key,
      token: "a",
      error: "Offline",
    });
    expect(state.steps[0].strokes).toHaveLength(1);
    expect(state.steps[0].error).toBe("Offline");
  });
  it("clears feedback and confirmation when the question changes", () => {
    const state = fixture();
    state.steps[0].result = result(state, 0);
    const next = reducer(state, { type: "problem", value: "x=7" });
    expect(next.problemConfirmed).toBe(false);
    expect(next.steps[0].result).toBeUndefined();
  });
  it("restores draft content without replaying old feedback or pending requests", () => {
    const state = fixture();
    state.steps[0].result = result(state, 0);
    state.steps[0].pending = { token: "a", kind: "checking" };
    const saved = persisted(state);
    expect(saved.steps[0].math).toBe(state.steps[0].math);
    expect(saved.steps[0].result).toBeUndefined();
    expect(saved.steps[0].pending).toBeUndefined();
    expect(saved.steps[0].stale).toBe(true);
  });
});

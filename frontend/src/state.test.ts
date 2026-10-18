import { describe, expect, it } from "vitest";
import {
  checkPayload,
  contextKey,
  completedStep,
  newWorkspace,
  newStep,
  persisted,
  reducer,
} from "./state";
import type { CheckResult, Stroke, Workspace } from "./state";

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
    if (math !== "x=3")
      state = { ...state, steps: [...state.steps, newStep()] };
  }
  return state;
}
function result(state: Workspace, index: number): CheckResult {
  return {
    status: "verified",
    transition_status: "valid",
    context_status: "consistent",
    is_final_answer: false,
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

function reviewed(
  state: Workspace,
  index: number,
  patch: Partial<CheckResult> = {},
) {
  const id = state.steps[index].id;
  const key = contextKey(state, index);
  const pending = reducer(state, {
    type: "start",
    id,
    token: "review",
    kind: "checking",
  });
  return reducer(pending, {
    type: "result",
    id,
    key,
    token: "review",
    result: { ...result(state, index), ...patch },
  });
}

describe("automatic next box", () => {
  it.each(["handwriting", "typed"] as const)(
    "opens exactly one empty box after a correct %s step",
    (mode) => {
      const state = fixture();
      state.steps[2].mode = mode;
      const next = reviewed(state, 2);
      expect(next.steps).toHaveLength(4);
      expect(next.steps[2].result?.status).toBe("verified");
      expect(next.steps[3]).toMatchObject({
        mode,
        strokes: [],
        math: "",
        revision: 0,
      });
      expect(next.steps[3].id).not.toBe(state.steps[2].id);
      expect(reviewed(next, 2).steps).toHaveLength(4);
    },
  );
  it("keeps existing later work when an earlier step is rechecked", () => {
    const state = fixture();
    const next = reviewed(state, 0);
    expect(next.steps).toHaveLength(3);
    expect(next.steps[1]).toBe(state.steps[1]);
  });
  it.each([
    "issue",
    "needs_clarification",
    "incomplete",
    "unsupported",
  ] as const)("does not add a box for %s feedback", (status) => {
    expect(reviewed(fixture(), 2, { status }).steps).toHaveLength(3);
  });
  it.each(["earlier_issue", "unresolved"] as const)(
    "does not advance when the context is %s",
    (context_status) => {
      expect(reviewed(fixture(), 2, { context_status }).steps).toHaveLength(3);
    },
  );
  it("does not advance for an unresolved transition or the reading confirmation alone", () => {
    const state = fixture();
    expect(
      reviewed(state, 2, { transition_status: "unresolved" }).steps,
    ).toHaveLength(3);
    expect(
      reducer(state, { type: "confirmStep", id: state.steps[2].id }).steps,
    ).toHaveLength(3);
  });
  it("rejects stale or duplicate last-step replies without creating extra boxes", () => {
    const state = fixture();
    const id = state.steps[2].id,
      key = contextKey(state, 2),
      response = result(state, 2);
    const pending = reducer(state, {
      type: "start",
      id,
      token: "review",
      kind: "checking",
    });
    const reply = {
      type: "result" as const,
      id,
      key,
      token: "review",
      result: response,
    };
    const next = reducer(pending, reply);
    expect(reducer(next, reply)).toBe(next);
    const edited = reducer(pending, {
      type: "edit",
      id,
      patch: { math: "x=5" },
    });
    expect(reducer(edited, reply)).toBe(edited);
    const wrongMetadata = reducer(pending, {
      ...reply,
      result: { ...response, revision: 999 },
    });
    expect(wrongMetadata).toBe(pending);
    expect(edited.steps).toHaveLength(3);
  });
  it("preserves the workspace limit while still displaying a successful check", () => {
    const state = fixture();
    state.steps.push(...Array.from({ length: 31 }, () => newStep()));
    const next = reviewed(state, 33);
    expect(next.steps).toHaveLength(34);
    expect(next.steps[33].result?.status).toBe("verified");
  });
});

describe("final answer completion", () => {
  it.each(["typed", "handwriting"] as const)(
    "finishes a %s answer without opening another box",
    (mode) => {
      const state = fixture();
      state.steps[2].mode = mode;
      const next = reviewed(state, 2, { is_final_answer: true });
      expect(next.steps).toHaveLength(3);
      expect(completedStep(next)?.id).toBe(state.steps[2].id);
      expect(reviewed(next, 2, { is_final_answer: true }).steps).toHaveLength(
        3,
      );
    },
  );
  it("removes untouched trailing boxes from an older draft, retaining all earlier work", () => {
    const state = fixture();
    state.steps.push(newStep(), newStep());
    const next = reviewed(state, 2, { is_final_answer: true });
    expect(next.steps).toHaveLength(3);
    expect(next.steps[0]).toBe(state.steps[0]);
    expect(completedStep(next)?.math).toBe("x=3");
  });
  it("preserves later writing and does not declare it checked through an earlier final answer", () => {
    let state = fixture();
    const later = newStep();
    state = { ...state, steps: [...state.steps, later] };
    state = reducer(state, {
      type: "edit",
      id: later.id,
      patch: { math: "x=9", confirmed: true },
    });
    const next = reviewed(state, 2, { is_final_answer: true });
    expect(next.steps).toHaveLength(4);
    expect(next.steps[3].math).toBe("x=9");
    expect(completedStep(next)).toBeUndefined();
  });
  it("retains a cleared drawing box with undo history", () => {
    const state = fixture(),
      extra = newStep();
    extra.revision = 2;
    extra.inkHistory = [[{ points: [[1, 2, 0.5]] }]];
    state.steps.push(extra);
    expect(reviewed(state, 2, { is_final_answer: true }).steps.at(-1)).toBe(
      extra,
    );
  });
  it("reopens the flow after editing a completed answer into an intermediate line", () => {
    let state = reviewed(fixture(), 2, { is_final_answer: true });
    const id = state.steps[2].id;
    state = reducer(state, {
      type: "edit",
      id,
      patch: { math: "3x=9", confirmed: true },
    });
    expect(completedStep(state)).toBeUndefined();
    const checked = reviewed(state, 2);
    expect(checked.steps).toHaveLength(4);
    expect(completedStep(checked)).toBeUndefined();
  });
  it("clears completion when the problem, variable, earlier work or final ink changes", () => {
    const state = reviewed(fixture(), 2, { is_final_answer: true });
    for (const action of [
      { type: "problem", value: "x=5" },
      { type: "variable", value: "y" },
      { type: "edit", id: state.steps[0].id, patch: { math: "3x=99" } },
      { type: "beginInk", id: state.steps[2].id },
    ] as const)
      expect(completedStep(reducer(state, action))).toBeUndefined();
  });
  it("does not restore an old completion claim from a saved draft", () => {
    const state = reviewed(fixture(), 2, { is_final_answer: true });
    expect(completedStep(persisted(state))).toBeUndefined();
    expect(persisted(state).steps).toHaveLength(3);
  });
  it("ignores stale final-answer replies after editing and keeps later boxes intact", () => {
    let state = fixture();
    const id = state.steps[2].id,
      key = contextKey(state, 2);
    const response = { ...result(state, 2), is_final_answer: true };
    state.steps.push(newStep());
    state = reducer(state, {
      type: "start",
      id,
      token: "final",
      kind: "checking",
    });
    state = reducer(state, { type: "edit", id, patch: { math: "x=7" } });
    const unchanged = reducer(state, {
      type: "result",
      id,
      key,
      token: "final",
      result: response,
    });
    expect(unchanged).toBe(state);
    expect(unchanged.steps).toHaveLength(4);
    expect(completedStep(unchanged)).toBeUndefined();
  });
  it.each([
    { status: "issue" as const },
    { context_status: "earlier_issue" as const },
    { transition_status: "unresolved" as const },
    { warnings: ["Check a restriction"] },
  ])("does not complete for conflicting flags: %j", (patch) => {
    const state = reviewed(fixture(), 2, { is_final_answer: true, ...patch });
    expect(completedStep(state)).toBeUndefined();
    expect(state.steps).toHaveLength(3);
  });
  it("does not show completion while rechecking or after a failed recheck", () => {
    let state = reviewed(fixture(), 2, { is_final_answer: true });
    const id = state.steps[2].id,
      key = contextKey(state, 2);
    state = reducer(state, {
      type: "start",
      id,
      token: "retry",
      kind: "checking",
    });
    expect(completedStep(state)).toBeUndefined();
    state = reducer(state, {
      type: "error",
      id,
      key,
      token: "retry",
      error: "Offline",
    });
    expect(completedStep(state)).toBeUndefined();
  });
});

describe("shared drawing tools", () => {
  const stroke: Stroke = {
    points: [
      [10, 20, 0.5],
      [100, 50, 0.5],
    ],
  };
  function draw(state: Workspace, index: number, strokes: Stroke[]) {
    const id = state.steps[index].id;
    state = reducer(state, { type: "beginInk", id });
    state = reducer(state, {
      type: "edit",
      id,
      patch: { strokes, math: "", confirmed: false },
    });
    return reducer(state, { type: "endInk", id });
  }
  it("undoes only the selected box and keeps its history across box switches", () => {
    let state = fixture();
    state = draw(state, 0, [stroke]);
    state = draw(state, 1, [stroke, stroke]);
    state = draw(state, 0, [stroke, stroke]);
    const next = reducer(state, { type: "undoInk", id: state.steps[0].id });
    expect(next.steps[0].strokes).toEqual([stroke]);
    expect(next.steps[1].strokes).toEqual([stroke, stroke]);
    expect(next.steps[1].inkHistory).toHaveLength(1);
    expect(
      reducer(next, { type: "undoInk", id: next.steps[1].id }).steps[1].strokes,
    ).toEqual([]);
  });
  it("clears only the selected box, makes clear undoable, and invalidates dependent checks", () => {
    let state = draw(fixture(), 1, [stroke]);
    state.steps.forEach((step, i) => {
      step.result = result(state, i);
    });
    const id = state.steps[1].id;
    const cleared = reducer(state, { type: "clearInk", id });
    expect(cleared.steps[0]).toBe(state.steps[0]);
    expect(cleared.steps[1].strokes).toEqual([]);
    expect(cleared.steps[1].math).toBe("");
    expect(cleared.steps[1].confirmed).toBe(false);
    expect(cleared.steps[1].result).toBeUndefined();
    expect(cleared.steps[2].result).toBeUndefined();
    const restored = reducer(cleared, { type: "undoInk", id });
    expect(restored.steps[1].strokes).toEqual([stroke]);
    expect(restored.steps[1].result).toBeUndefined();
  });
  it("makes a whole eraser gesture one undo, despite intermediate updates", () => {
    let state = draw(fixture(), 0, [stroke, stroke]);
    const id = state.steps[0].id;
    state = reducer(state, { type: "beginInk", id });
    state = reducer(state, { type: "edit", id, patch: { strokes: [stroke] } });
    state = reducer(state, { type: "edit", id, patch: { strokes: [] } });
    expect(reducer(state, { type: "undoInk", id }).steps[0].strokes).toEqual([
      stroke,
      stroke,
    ]);
  });
  it("invalidates feedback at pen-down and never saves undo history into drafts", () => {
    let state = fixture();
    state.steps[0].result = result(state, 0);
    const id = state.steps[0].id;
    state = reducer(state, { type: "beginInk", id });
    expect(state.steps[0].result).toBeUndefined();
    expect(state.steps[0].confirmed).toBe(false);
    expect(state.steps[0].drawing).toBe(true);
    expect(persisted(state).steps[0].drawing).toBeUndefined();
    state = draw(state, 0, [stroke]);
    expect(state.steps[0].drawing).toBe(false);
    expect(persisted(state).steps[0].inkHistory).toBeUndefined();
    expect(persisted(state).steps[0].strokes).toEqual([stroke]);
  });
  it("treats empty undo and clear as no-ops", () => {
    const state = newWorkspace(),
      id = state.steps[0].id;
    expect(reducer(state, { type: "undoInk", id })).toBe(state);
    expect(reducer(state, { type: "clearInk", id })).toBe(state);
  });
});

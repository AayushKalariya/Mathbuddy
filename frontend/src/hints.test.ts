import { describe, expect, it } from "vitest";
import { hintContext, hintPayload, hintReducer } from "./hints";
import type { HintResult, HintStore } from "./hints";
import { newStep, newWorkspace, reducer } from "./state";
import type { Workspace } from "./state";

// Older drafts may already have later boxes, including unchecked work.
const withLaterBox = (state: Workspace): Workspace => ({
  ...state,
  steps: [...state.steps, newStep()],
});

function fixture() {
  let state = reducer(newWorkspace(), {
    type: "problem",
    value: "Differentiate sin(x^2) with respect to x",
  });
  state = reducer(state, { type: "confirmProblem" });
  return state;
}
function result(level: 1 | 2 | 3 = 1): HintResult {
  return {
    kind: "hint",
    hint: `Hint ${level}`,
    level,
    reviewer: "gemini",
    model: "test",
    step_id: "question",
    revision: 0,
    context_revision: 1,
  };
}

describe("progressive hint context", () => {
  it("forwards an existing earlier warning instead of silently trusting the line", () => {
    let state = fixture();
    state.steps[0].mode = "typed";
    state.steps[0].math = "cos(x^2)";
    state.steps[0].confirmed = true;
    state.steps[0].result = {
      status: "issue",
      transition_status: "invalid",
      context_status: "consistent",
      is_final_answer: false,
      message: "Check the chain rule",
      warnings: [],
      correction_available: true,
      verification_basis: "AI review",
      step_id: state.steps[0].id,
      revision: 0,
      context_revision: state.problemRevision,
    };
    state = withLaterBox(state);
    expect(hintPayload(state, state.steps[1].id, 1, [])).toMatchObject({
      earlier_issue_step: 1,
      history: ["cos(x^2)"],
    });
  });
  it("allows question hints before any writing", () => {
    const state = fixture();
    expect(hintContext(state, null).blocker).toBe("");
    expect(hintPayload(state, null, 1, [])).toMatchObject({
      history: [],
      current_step: "",
      request_next_step: false,
    });
  });
  it("does not send hints before question confirmation", () => {
    expect(() => hintPayload(newWorkspace(), null, 1, [])).toThrow(
      "Confirm your question",
    );
  });
  it("requires a reading before a handwritten step hint", () => {
    const state = fixture();
    state.steps[0].strokes = [{ points: [[1, 2, 0.5]] }];
    expect(hintContext(state, state.steps[0].id).unread?.id).toBe(
      state.steps[0].id,
    );
    expect(() => hintPayload(state, state.steps[0].id, 1, [])).toThrow(
      "Confirm the reading",
    );
  });
  it("confirmation enables hints without setting a verdict", () => {
    let state = fixture();
    state.steps[0].math = "cos(x^2)";
    state = reducer(state, { type: "confirmStep", id: state.steps[0].id });
    expect(hintPayload(state, state.steps[0].id, 1, []).current_step).toBe(
      "cos(x^2)",
    );
    expect(state.steps[0].result).toBeUndefined();
  });
  it("allows an empty current box but requires all prior readings", () => {
    let state = withLaterBox(fixture());
    expect(hintContext(state, state.steps[1].id).blocker).toContain(
      "Step 1 is empty",
    );
    state = reducer(state, {
      type: "edit",
      id: state.steps[0].id,
      patch: { math: "d/dx sin(x^2)", confirmed: true, mode: "typed" },
    });
    expect(hintPayload(state, state.steps[1].id, 1, [])).toMatchObject({
      history: ["d/dx sin(x^2)"],
      current_step: "",
    });
  });
  it("passes prior hints and explicitly gates the suggested line", () => {
    const state = fixture();
    expect(hintPayload(state, null, 2, [result()])).toMatchObject({
      previous_hints: ["Hint 1"],
      request_next_step: false,
    });
    expect(hintPayload(state, null, 3, [result(), result(2)])).toMatchObject({
      previous_hints: ["Hint 1", "Hint 2"],
      request_next_step: true,
    });
  });
  it("invalidates hints when a premise is edited but not when a later box changes", () => {
    let state = withLaterBox(fixture());
    const first = hintContext(state, state.steps[0].id).key;
    const second = hintContext(state, state.steps[1].id).key;
    state = reducer(state, {
      type: "edit",
      id: state.steps[1].id,
      patch: { math: "changed" },
    });
    expect(hintContext(state, state.steps[0].id).key).toBe(first);
    expect(hintContext(state, state.steps[1].id).key).not.toBe(second);
    state = reducer(state, {
      type: "edit",
      id: state.steps[0].id,
      patch: { math: "earlier changed" },
    });
    expect(hintContext(state, state.steps[0].id).key).not.toBe(first);
  });
  it("does not reuse a question's hints in a fresh session with identical text", () => {
    expect(hintContext(fixture(), null).key).not.toBe(
      hintContext(fixture(), null).key,
    );
  });
});

describe("hint request cache", () => {
  const start = {
    type: "start" as const,
    scope: "question",
    key: "a",
    token: "one",
    level: 1 as const,
  };
  it("caches hints by scope and preserves entries when requesting more help", () => {
    let store = hintReducer({}, start);
    store = hintReducer(store, {
      type: "success",
      scope: "question",
      key: "a",
      token: "one",
      result: result(),
    });
    expect(store.question.entries).toHaveLength(1);
    const more = hintReducer(store, { ...start, level: 2, token: "two" });
    expect(more.question.entries).toEqual(store.question.entries);
    expect(store.question.pending).toBeUndefined();
  });
  it("ignores stale tokens and responses from an older revision", () => {
    const store = hintReducer(hintReducer({}, start), {
      ...start,
      key: "b",
      token: "new",
    });
    expect(
      hintReducer(store, {
        type: "success",
        scope: "question",
        key: "a",
        token: "one",
        result: result(),
      }),
    ).toBe(store);
  });
  it("retains earlier hints after failure and lets retry clear the error", () => {
    let store: HintStore = { question: { key: "a", entries: [result()] } };
    store = hintReducer(store, { ...start, token: "two", level: 2 });
    store = hintReducer(store, {
      type: "error",
      scope: "question",
      key: "a",
      token: "two",
      error: "Quota",
    });
    expect(store.question.entries).toHaveLength(1);
    expect(store.question.error).toBe("Quota");
    expect(
      hintReducer(store, { ...start, level: 2 }).question.error,
    ).toBeUndefined();
  });
  it("clears outdated entries when the scope's work changes", () => {
    const store: HintStore = { question: { key: "a", entries: [result()] } };
    expect(hintReducer(store, { ...start, key: "b" }).question.entries).toEqual(
      [],
    );
  });
});

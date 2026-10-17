export type Point = [number, number, number];
export type Stroke = { points: Point[] };
export type CheckResult = {
  status:
    "verified" | "issue" | "needs_clarification" | "incomplete" | "unsupported";
  transition_status: "valid" | "invalid" | "unresolved";
  context_status: "consistent" | "earlier_issue" | "unresolved";
  message: string;
  hint?: string;
  correction?: string;
  correction_available: boolean;
  warnings: string[];
  verification_basis: string;
  step_id: string;
  revision: number;
  context_revision: number;
};
export type Step = {
  id: string;
  revision: number;
  strokes: Stroke[];
  math: string;
  mode: "handwriting" | "typed";
  confirmed: boolean;
  result?: CheckResult;
  pending?: { token: string; kind: "reading" | "checking" };
  error?: string;
  stale?: boolean;
};
export type Workspace = {
  version: 1;
  problem: string;
  problemConfirmed: boolean;
  problemRevision: number;
  questionImage?: string;
  variable: string;
  steps: Step[];
  touchDrawing: boolean;
};
export const uniqueId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const newStep = (): Step => ({
  id: uniqueId(),
  revision: 0,
  strokes: [],
  math: "",
  mode: "handwriting",
  confirmed: false,
});
export const newWorkspace = (): Workspace => ({
  version: 1,
  problem: "",
  problemConfirmed: false,
  problemRevision: 0,
  variable: "x",
  steps: [newStep()],
  touchDrawing: false,
});

// Includes every premise, even an unverified/incorrect one, so edits cannot
// leave dependent feedback current. Results are not themselves premises.
export function contextKey(state: Workspace, index: number): string {
  return JSON.stringify([
    state.problem,
    state.problemConfirmed,
    state.problemRevision,
    state.variable,
    state.steps
      .slice(0, index + 1)
      .map((s) => [s.id, s.revision, s.math, s.confirmed]),
  ]);
}
export function checkPayload(
  state: Workspace,
  index: number,
  correction = false,
) {
  if (!state.problemConfirmed || !state.problem.trim())
    throw new Error("Confirm the question first.");
  if (!/^[a-zA-Z]$/.test(state.variable))
    throw new Error("The variable must be one letter, such as x.");
  if (state.problem.length > 256)
    throw new Error("Keep the question to one equation, up to 256 characters.");
  const step = state.steps[index];
  const earlier = state.steps.slice(0, index);
  if (earlier.some((s) => !s.confirmed || !s.math.trim()))
    throw new Error(
      "Read and confirm each earlier step first. A math warning will not block continuing.",
    );
  if (!step.math.trim()) throw new Error("Enter or read this step first.");
  if ([...earlier, step].some((s) => s.math.length > 256))
    throw new Error("Each equation must be 256 characters or fewer.");
  return {
    problem: state.problem,
    previous_step: earlier.at(-1)?.math ?? state.problem,
    history: earlier.slice(0, -1).map((s) => s.math),
    new_step: step.math,
    input_format: "latex",
    variable: state.variable,
    request_correction: correction,
    step_id: step.id,
    revision: step.revision,
    context_revision: state.problemRevision,
  };
}
export type Action =
  | { type: "restore"; state: Workspace }
  | { type: "problem"; value: string }
  | { type: "confirmProblem" }
  | { type: "image"; image: string }
  | { type: "variable"; value: string }
  | { type: "touch"; value: boolean }
  | { type: "add" }
  | {
      type: "edit";
      id: string;
      patch: Partial<Pick<Step, "strokes" | "math" | "mode" | "confirmed">>;
    }
  | { type: "confirmStep"; id: string }
  | { type: "start"; id: string; token: string; kind: "reading" | "checking" }
  | { type: "read"; id: string; key: string; token: string; math: string }
  | {
      type: "result";
      id: string;
      key: string;
      token: string;
      result: CheckResult;
    }
  | { type: "error"; id: string; key: string; token: string; error: string };

function invalidate(steps: Step[], from: number): Step[] {
  return steps.map((s, i) =>
    i < from
      ? s
      : {
          ...s,
          result: undefined,
          pending: undefined,
          error: undefined,
          stale: s.stale || !!s.result,
        },
  );
}
export function reducer(state: Workspace, action: Action): Workspace {
  if (action.type === "restore") return action.state;
  if (action.type === "touch") return { ...state, touchDrawing: action.value };
  if (action.type === "add")
    return state.steps.length >= 34
      ? state
      : { ...state, steps: [...state.steps, newStep()] };
  if (action.type === "confirmProblem")
    return { ...state, problemConfirmed: !!state.problem.trim() };
  if (
    action.type === "problem" ||
    action.type === "image" ||
    action.type === "variable"
  ) {
    return {
      ...state,
      steps: invalidate(state.steps, 0),
      problemRevision: state.problemRevision + 1,
      ...(action.type === "problem"
        ? { problem: action.value, problemConfirmed: false }
        : action.type === "image"
          ? {
              questionImage: action.image,
              problem: "",
              problemConfirmed: false,
            }
          : { variable: action.value }),
    };
  }
  const index = state.steps.findIndex((s) => s.id === action.id);
  if (index < 0) return state;
  const step = state.steps[index];
  if (action.type === "edit") {
    const steps = invalidate(state.steps, index);
    steps[index] = {
      ...steps[index],
      ...action.patch,
      revision: step.revision + 1,
    };
    return { ...state, steps };
  }
  if (action.type === "confirmStep") {
    const steps = [...state.steps];
    steps[index] = { ...step, confirmed: true };
    return { ...state, steps };
  }
  if (action.type === "start") {
    const steps = [...state.steps];
    steps[index] = {
      ...step,
      error: undefined,
      pending: { token: action.token, kind: action.kind },
    };
    return { ...state, steps };
  }
  if (
    action.key !== contextKey(state, index) ||
    step.pending?.token !== action.token
  )
    return state;
  const steps = [...state.steps];
  if (action.type === "read") {
    const invalidated = invalidate(steps, index);
    invalidated[index] = {
      ...invalidated[index],
      math: action.math,
      confirmed: false,
      revision: step.revision + 1,
    };
    return { ...state, steps: invalidated };
  }
  if (action.type === "result") {
    if (
      action.result.step_id !== step.id ||
      action.result.revision !== step.revision ||
      action.result.context_revision !== state.problemRevision
    )
      return state;
    steps[index] = {
      ...step,
      confirmed: true,
      pending: undefined,
      result: action.result,
      stale: false,
    };
  } else steps[index] = { ...step, pending: undefined, error: action.error };
  return { ...state, steps };
}

export function persisted(state: Workspace): Workspace {
  return {
    ...state,
    steps: state.steps.map(
      ({ pending: _pending, error: _error, result: _result, ...s }) => ({
        ...s,
        stale: s.stale || !!_result,
      }),
    ),
  };
}

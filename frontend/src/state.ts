export type Point = [number, number, number];
export type Stroke = { points: Point[] };
export type CheckResult = {
  status:
    "verified" | "issue" | "needs_clarification" | "incomplete" | "unsupported";
  transition_status: "valid" | "invalid" | "unresolved";
  context_status: "consistent" | "earlier_issue" | "unresolved";
  is_final_answer: boolean;
  message: string;
  hint?: string;
  correction?: string;
  correction_available: boolean;
  warnings: string[];
  verification_basis: string;
  reviewer?: "local" | "gemini";
  model?: string;
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
  inkHistory?: Stroke[][];
  drawing?: boolean;
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

export function isFinalAnswer(step: Step): boolean {
  const result = step.result;
  return (
    !!result &&
    result.is_final_answer === true &&
    result.status === "verified" &&
    result.transition_status === "valid" &&
    result.context_status === "consistent" &&
    result.warnings.length === 0 &&
    step.confirmed &&
    !step.pending &&
    !step.error &&
    !step.stale
  );
}

export function completedStep(state: Workspace): Step | undefined {
  const lastWritten = [...state.steps]
    .reverse()
    .find((step) => step.math.trim() || step.strokes.length);
  return lastWritten && isFinalAnswer(lastWritten) ? lastWritten : undefined;
}

function untouchedBox(step: Step): boolean {
  return (
    step.revision === 0 &&
    !step.math.trim() &&
    step.strokes.length === 0 &&
    !step.inkHistory?.length &&
    !step.pending &&
    !step.result &&
    !step.stale
  );
}

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
    throw new Error("Read and confirm each earlier step first.");
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
  | { type: "beginInk"; id: string }
  | { type: "endInk"; id: string }
  | { type: "undoInk"; id: string }
  | { type: "clearInk"; id: string }
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
  if (action.type === "endInk") {
    const steps = [...state.steps];
    steps[index] = { ...step, drawing: false };
    return { ...state, steps };
  }
  if (
    action.type === "edit" ||
    action.type === "beginInk" ||
    action.type === "undoInk" ||
    action.type === "clearInk"
  ) {
    const history = step.inkHistory ?? [];
    if (action.type === "undoInk" && !history.length) return state;
    if (action.type === "clearInk" && !step.strokes.length) return state;
    const patch =
      action.type === "edit"
        ? action.patch
        : {
            math: "",
            confirmed: false,
            strokes:
              action.type === "undoInk"
                ? history.at(-1)!
                : action.type === "clearInk"
                  ? []
                  : step.strokes,
            inkHistory:
              action.type === "undoInk"
                ? history.slice(0, -1)
                : [...history.slice(-49), step.strokes],
          };
    const steps = invalidate(state.steps, index);
    steps[index] = {
      ...steps[index],
      ...patch,
      drawing:
        action.type === "beginInk"
          ? true
          : action.type === "edit" && action.patch.mode
            ? false
            : step.drawing,
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
    if (step.drawing || step.pending?.kind !== "reading") return state;
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
      step.pending?.kind !== "checking" ||
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
    // Older drafts can already have an extra blank box. Never discard edits or ink.
    if (
      isFinalAnswer(steps[index]) &&
      steps.slice(index + 1).every(untouchedBox)
    ) {
      return { ...state, steps: steps.slice(0, index + 1) };
    }
    if (
      index === steps.length - 1 &&
      steps.length < 34 &&
      !action.result.is_final_answer &&
      action.result.status === "verified" &&
      action.result.transition_status === "valid" &&
      action.result.context_status === "consistent"
    ) {
      steps.push({
        ...newStep(),
        mode: step.mode,
        confirmed: step.mode === "typed",
      });
    }
  } else steps[index] = { ...step, pending: undefined, error: action.error };
  return { ...state, steps };
}

export function persisted(state: Workspace): Workspace {
  return {
    ...state,
    steps: state.steps.map(
      ({
        pending: _pending,
        error: _error,
        result: _result,
        inkHistory: _history,
        drawing: _drawing,
        ...s
      }) => ({
        ...s,
        stale: s.stale || !!_result,
      }),
    ),
  };
}

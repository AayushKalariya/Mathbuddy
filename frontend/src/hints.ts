import { contextKey } from "./state";
import type { Step, Workspace } from "./state";

export type HintResult = {
  kind:
    | "hint"
    | "next_step"
    | "needs_clarification"
    | "earlier_issue"
    | "unresolved";
  hint: string;
  next_step?: string;
  focus_step_number?: number;
  level: 1 | 2 | 3;
  reviewer: "gemini";
  model: string;
  step_id: string;
  revision: number;
  context_revision: number;
};

export function hintContext(workspace: Workspace, stepId: string | null) {
  const index = stepId ? workspace.steps.findIndex((s) => s.id === stepId) : -1;
  const step = workspace.steps[index];
  const scope = step?.id ?? "question";
  const prefix = workspace.steps.slice(0, index + 1);
  const key = JSON.stringify([
    workspace.steps[0]?.id,
    contextKey(workspace, index),
    prefix.map((s) => [
      s.result?.status,
      s.result?.context_status,
      s.result?.transition_status,
    ]),
  ]);
  let blocker = "";
  let unread: Step | undefined;
  if (!workspace.problemConfirmed || !workspace.problem.trim())
    blocker = "Confirm your question first, then ask for a hint.";
  else if (!/^[a-zA-Z]$/.test(workspace.variable))
    blocker = "Choose a single variable letter, such as x.";
  else {
    for (const [i, line] of prefix.entries()) {
      if (line.pending) {
        blocker = `Wait for Step ${i + 1} to finish reading or checking.`;
        break;
      }
      if (i < index && !line.math.trim() && !line.strokes.length) {
        blocker = `Step ${i + 1} is empty. Work on that step first, or choose the question for help getting started.`;
        break;
      }
      if ((line.strokes.length || line.math.trim()) && !line.confirmed) {
        unread = line;
        blocker = `Confirm the reading for Step ${i + 1} so the hint uses what you actually wrote.`;
        break;
      }
    }
  }
  return {
    scope,
    key,
    index,
    step,
    unread,
    blocker,
    label: step ? `Help with Step ${index + 1}` : "Help with the question",
  };
}

export function hintPayload(
  workspace: Workspace,
  stepId: string | null,
  level: 1 | 2 | 3,
  entries: HintResult[],
) {
  const context = hintContext(workspace, stepId);
  if (context.blocker) throw new Error(context.blocker);
  const earlier = workspace.steps.slice(0, Math.max(0, context.index));
  const issueIndex = earlier.findIndex((s) => s.result?.status === "issue");
  return {
    problem: workspace.problem,
    variable: workspace.variable,
    history: earlier.map((s) => s.math),
    current_step: context.step?.math ?? "",
    level,
    request_next_step: level === 3,
    previous_hints: entries
      .filter((e) => e.level < level && e.kind === "hint")
      .map((e) => e.hint),
    earlier_issue_step: issueIndex < 0 ? undefined : issueIndex + 1,
    step_id: context.scope,
    revision: context.step?.revision ?? 0,
    context_revision: workspace.problemRevision,
  };
}

export type HintSession = {
  key: string;
  entries: HintResult[];
  pending?: { token: string; level: 1 | 2 | 3 };
  error?: string;
};
export type HintStore = Record<string, HintSession>;
type HintAction =
  | {
      type: "start";
      scope: string;
      key: string;
      token: string;
      level: 1 | 2 | 3;
    }
  | {
      type: "success";
      scope: string;
      key: string;
      token: string;
      result: HintResult;
    }
  | { type: "error"; scope: string; key: string; token: string; error: string }
  | { type: "cancel"; scope: string; key: string; token: string };

export function hintReducer(store: HintStore, action: HintAction): HintStore {
  const old = store[action.scope];
  if (action.type === "start")
    return {
      ...store,
      [action.scope]: {
        key: action.key,
        entries: old?.key === action.key ? old.entries : [],
        pending: { token: action.token, level: action.level },
      },
    };
  if (!old || old.key !== action.key || old.pending?.token !== action.token)
    return store;
  if (action.type === "success") {
    if (
      action.result.level !== old.pending.level ||
      action.result.step_id !== action.scope
    )
      return store;
    return {
      ...store,
      [action.scope]: {
        key: old.key,
        entries: [
          ...old.entries.filter((e) => e.level < action.result.level),
          action.result,
        ],
      },
    };
  }
  return {
    ...store,
    [action.scope]: {
      ...old,
      pending: undefined,
      error: action.type === "error" ? action.error : undefined,
    },
  };
}

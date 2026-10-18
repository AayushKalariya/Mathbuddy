import { useEffect, useReducer, useRef, useState } from "react";
import { ArrowRight, Lightbulb, LoaderCircle, Sparkles, X } from "lucide-react";
import * as api from "./api";
import { hintContext, hintPayload, hintReducer } from "./hints";
import type { HintStore } from "./hints";
import { reducer, uniqueId } from "./state";
import type { Workspace } from "./state";
import MathPreview from "./MathPreview";

type Props = {
  workspace: Workspace;
  selectedStepId: string | null;
  online: boolean | undefined;
  onSelectStep: (id: string | null) => void;
  onReadStep: (id: string) => Promise<void>;
  onConfirmStep: (id: string) => void;
  onEditReading: (id: string, math: string) => void;
};

function HintExplanation({ text }: { text: string }) {
  // Models sometimes use inline LaTeX despite the plain-text instruction.
  const parts = text.split(/(\$[^$\n]+\$|\\\([^\n]*?\\\))/g);
  return (
    <div className="hint-prose">
      {parts.map((part, i) =>
        part.startsWith("$") || part.startsWith("\\(") ? (
          <MathPreview
            key={i}
            value={part.startsWith("$") ? part.slice(1, -1) : part.slice(2, -2)}
          />
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </div>
  );
}

export default function HintPanel({
  workspace,
  selectedStepId,
  online,
  onSelectStep,
  onReadStep,
  onConfirmStep,
  onEditReading,
}: Props) {
  const [open, setOpen] = useState(false);
  const [store, dispatch] = useReducer(hintReducer, {} as HintStore);
  const latest = useRef(workspace);
  latest.current = workspace;
  const request = useRef<{
    controller: AbortController;
    target: string | null;
    scope: string;
    key: string;
    token: string;
  } | null>(null);
  const target =
    selectedStepId && workspace.steps.some((s) => s.id === selectedStepId)
      ? selectedStepId
      : null;
  const context = hintContext(workspace, target);
  const cached = store[context.scope];
  const session = cached?.key === context.key ? cached : undefined;
  const entries = session?.entries ?? [];
  const last = entries.at(-1);
  const busy = Object.values(store).some((s) => !!s.pending);

  useEffect(() => {
    const pending = request.current;
    if (pending && hintContext(workspace, pending.target).key !== pending.key) {
      pending.controller.abort();
      dispatch({ type: "cancel", ...pending });
      request.current = null;
    }
  }, [workspace]);
  useEffect(() => () => request.current?.controller.abort(), []);

  async function ask(level: 1 | 2 | 3, snapshot = workspace) {
    if (request.current || online === false) return;
    const ctx = hintContext(snapshot, target);
    if (ctx.blocker) return;
    const saved = store[ctx.scope];
    const previous = saved?.key === ctx.key ? saved.entries : [];
    const token = uniqueId(),
      controller = new AbortController();
    const pending = {
      target,
      scope: ctx.scope,
      key: ctx.key,
      token,
      controller,
    };
    request.current = pending;
    dispatch({ type: "start", scope: ctx.scope, key: ctx.key, token, level });
    try {
      const payload = hintPayload(snapshot, target, level, previous);
      const result = await api.hint(payload, controller.signal);
      if (
        controller.signal.aborted ||
        hintContext(latest.current, target).key !== ctx.key
      )
        return;
      if (
        result.step_id !== payload.step_id ||
        result.revision !== payload.revision ||
        result.context_revision !== payload.context_revision ||
        result.level !== level
      )
        throw new Error(
          "This hint does not match your current work. Please retry.",
        );
      dispatch({
        type: "success",
        scope: ctx.scope,
        key: ctx.key,
        token,
        result,
      });
    } catch (error) {
      if (
        !controller.signal.aborted &&
        hintContext(latest.current, target).key === ctx.key
      )
        dispatch({
          type: "error",
          scope: ctx.scope,
          key: ctx.key,
          token,
          error: api.errorMessage(error),
        });
    } finally {
      dispatch({ type: "cancel", scope: ctx.scope, key: ctx.key, token });
      if (request.current?.token === token) request.current = null;
    }
  }

  function confirmReading(id: string) {
    const snapshot = reducer(workspace, { type: "confirmStep", id });
    latest.current = snapshot;
    onConfirmStep(id);
    if (!hintContext(snapshot, target).blocker) void ask(1, snapshot);
  }

  const hintCount = entries.filter(
    (e) => e.kind === "hint" && e.level < 3,
  ).length;
  const retryLevel = session?.error
    ? (session.pending?.level ??
      (last?.kind === "hint" ? Math.min(3, hintCount + 1) : last?.level) ??
      1)
    : (last?.level ?? 1);
  const canAsk = !context.blocker && !busy && online !== false;
  return (
    <div className="hint-workspace">
      <button
        className={`hint-toggle ${open ? "is-open" : ""}`}
        aria-label="I need a hint"
        title="I need a hint"
        aria-expanded={open}
        aria-controls="hint-panel"
        onClick={() => {
          setOpen(!open);
          if (!open && !entries.length && !context.blocker) void ask(1);
        }}
      >
        <Lightbulb size={15} />
        <span>Hint</span>
      </button>
      {open && (
        <section
          className="hint-panel"
          id="hint-panel"
          aria-labelledby="hint-heading"
        >
          <div className="hint-panel-heading">
            <div>
              <span className="hint-eyebrow">A LITTLE NUDGE</span>
              <h2 id="hint-heading">{context.label}</h2>
            </div>
            <button
              className="hint-close"
              aria-label="Close hints"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <label className="hint-target-label" htmlFor="hint-target">
            Hint for
          </label>
          <select
            id="hint-target"
            value={target ?? "question"}
            onChange={(event) =>
              onSelectStep(
                event.target.value === "question" ? null : event.target.value,
              )
            }
          >
            <option value="question">
              The question · help getting started
            </option>
            {workspace.steps.map((step, i) => (
              <option key={step.id} value={step.id}>
                Step {i + 1}
              </option>
            ))}
          </select>
          {context.blocker && (
            <div className="hint-preparation">
              <p>{context.blocker}</p>
              {context.unread?.error && (
                <p className="hint-error" role="alert">
                  {context.unread.error}
                </p>
              )}
              {context.unread && !context.unread.math && (
                <button
                  className="button secondary small"
                  disabled={
                    busy || !!context.unread.pending || online === false
                  }
                  onClick={() => void onReadStep(context.unread!.id)}
                >
                  Read Step {workspace.steps.indexOf(context.unread) + 1}
                </button>
              )}
              {context.unread?.math && (
                <>
                  <label className="hint-target-label" htmlFor="hint-reading">
                    Math Buddy read · edit any misread symbols
                  </label>
                  <MathPreview value={context.unread.math} />
                  <input
                    id="hint-reading"
                    className="math-input"
                    value={context.unread.math}
                    maxLength={256}
                    spellCheck={false}
                    onChange={(event) =>
                      onEditReading(context.unread!.id, event.target.value)
                    }
                  />
                  <button
                    className="button primary small"
                    disabled={busy || online === false}
                    onClick={() => confirmReading(context.unread!.id)}
                  >
                    Confirm reading & continue
                  </button>
                </>
              )}
            </div>
          )}
          <div
            className="hint-content"
            aria-live="polite"
            aria-busy={!!session?.pending}
          >
            {busy && !session?.pending && (
              <p className="pending">
                <LoaderCircle className="spin" size={16} />
                Finishing your other hint request…
              </p>
            )}
            {entries.map((entry) => (
              <div
                className={`hint-entry hint-${entry.kind}`}
                key={entry.level}
              >
                <span className="hint-level">
                  {entry.kind === "next_step"
                    ? "SUGGESTED NEXT STEP"
                    : entry.kind === "earlier_issue"
                      ? "REVISIT EARLIER WORK"
                      : `HINT ${entry.level}`}
                </span>
                <HintExplanation text={entry.hint} />
                {entry.next_step && (
                  <div className="hint-suggested-math">
                    <MathPreview value={entry.next_step} />
                  </div>
                )}
                {entry.kind === "earlier_issue" && entry.focus_step_number && (
                  <button
                    className="text-button"
                    onClick={() =>
                      onSelectStep(
                        workspace.steps[entry.focus_step_number! - 1]?.id ??
                          null,
                      )
                    }
                  >
                    Help with Step {entry.focus_step_number}{" "}
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
            ))}
            {session?.pending && (
              <p className="pending">
                <LoaderCircle className="spin" size={16} />
                {session.pending.level === 3
                  ? "Preparing one next step…"
                  : "Thinking of a helpful nudge…"}
              </p>
            )}
            {session?.error && (
              <p className="hint-error" role="alert">
                {session.error}
              </p>
            )}
          </div>
          {!context.blocker && !session?.pending && (
            <div className="hint-actions">
              {session?.error ||
              (last &&
                last.kind !== "hint" &&
                last.kind !== "next_step" &&
                last.kind !== "earlier_issue") ? (
                <button
                  className="button secondary small"
                  disabled={!canAsk}
                  onClick={() => void ask(retryLevel as 1 | 2 | 3)}
                >
                  Retry {retryLevel === 3 ? "next step" : "hint"}
                </button>
              ) : !entries.length ? (
                <button
                  className="button primary small"
                  disabled={!canAsk}
                  onClick={() => void ask(1)}
                >
                  Get first hint <ArrowRight size={14} />
                </button>
              ) : last?.kind === "hint" && hintCount === 1 ? (
                <button
                  className="button secondary small"
                  disabled={!canAsk}
                  onClick={() => void ask(2)}
                >
                  More help <ArrowRight size={14} />
                </button>
              ) : hintCount === 2 &&
                last?.kind !== "next_step" &&
                last?.kind !== "earlier_issue" ? (
                <>
                  <span className="hint-reveal-note">
                    Ready to see one possible next line?
                  </span>
                  <button
                    className="button secondary small"
                    disabled={!canAsk}
                    onClick={() => void ask(3)}
                  >
                    Show one next step <ArrowRight size={14} />
                  </button>
                </>
              ) : null}
            </div>
          )}
          <p className="hint-panel-note">
            <Sparkles size={12} /> Hints by Gemini · use Check for a verdict.
          </p>
        </section>
      )}
    </div>
  );
}

import { useEffect, useReducer, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  ImagePlus,
  Info,
  LoaderCircle,
  Plus,
  Pencil,
  ScanLine,
  Sparkles,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import * as api from "./api";
import { AutoReader } from "./autoRead";
import type { ReadSnapshot } from "./autoRead";
import { loadDraft, saveDraft } from "./draft";
import DrawingPad from "./DrawingPad";
import DrawingToolbar from "./DrawingToolbar";
import HintPanel from "./HintPanel";
import { rasterize } from "./ink";
import MathPreview from "./MathPreview";
import QuestionImage, { imageBlob } from "./QuestionImage";
import TypedStep from "./TypedStep";
import {
  checkPayload,
  contextKey,
  completedStep,
  newWorkspace,
  reducer,
  uniqueId,
} from "./state";
import type { Step, Workspace } from "./state";

const titles = {
  verified: "Step verified",
  issue: "Take another look",
  needs_clarification: "Needs clarification",
  incomplete: "Finish this line",
  unsupported: "Unable to verify this step",
};

function Feedback({
  step,
  isComplete,
  onCorrection,
}: {
  step: Step;
  isComplete: boolean;
  onCorrection: () => void;
}) {
  const result = step.result;
  return (
    <div aria-live="polite" className="feedback-area">
      {step.pending && (
        <div className="pending">
          <LoaderCircle className="spin" size={17} />
          <div>
            <span>
              {step.pending.kind === "reading"
                ? "Reading handwriting…"
                : "Checking step…"}
            </span>
          </div>
        </div>
      )}
      {step.error && (
        <div className="notice error">
          <WifiOff size={18} />
          <span>{step.error}</span>
        </div>
      )}
      {step.stale && !result && !step.pending && (
        <p className="stale">
          <CircleHelp size={13} /> Work changed. Check again.
        </p>
      )}
      {result && !step.pending && !step.error && (
        <div
          className={`feedback ${result.status === "verified" ? "success" : result.status === "issue" ? "warning" : "neutral"}`}
        >
          <div className="feedback-heading">
            {result.status === "verified" ? (
              <Check size={15} />
            ) : result.status === "issue" ? (
              <TriangleAlert size={20} />
            ) : (
              <CircleHelp size={20} />
            )}
            <strong>
              {result.status === "verified"
                ? isComplete
                  ? "Question complete."
                  : "This step looks correct."
                : titles[result.status]}
            </strong>
          </div>
          {result.warnings.map((warning, i) => (
            <p key={i}>{warning}</p>
          ))}
          {result.correction_available && !result.correction && (
            <button
              className="text-button correction-link"
              disabled={!!step.pending}
              onClick={onCorrection}
            >
              Show one correction <ArrowRight size={14} />
            </button>
          )}
          {result.correction && (
            <div className="correction">
              <span>
                {result.reviewer === "gemini"
                  ? "Suggested next step"
                  : "One valid correction"}
              </span>
              <MathPreview value={result.correction} />
            </div>
          )}
          <details className="review-details">
            <summary>
              Details <ChevronDown size={12} />
            </summary>
            <p>{result.message}</p>
            {result.reviewer === "gemini" && (
              <span className="reviewer-label">
                <Sparkles size={12} /> Reviewed by Gemini
              </span>
            )}
            <p>{result.verification_basis}</p>
          </details>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, newWorkspace);
  const current = useRef(state);
  current.current = state;
  const [ready, setReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState("Opening draft…");
  const [online, setOnline] = useState<boolean | undefined>();
  const [recognitionReady, setRecognitionReady] = useState(false);
  const [reviewReady, setReviewReady] = useState(true);
  const [recognitionMessage, setRecognitionMessage] = useState("");
  const [questionBusy, setQuestionBusy] = useState(false);
  const questionToken = useRef("");
  const [questionError, setQuestionError] = useState("");
  const [hintStepId, setHintStepId] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [newWork, setNewWork] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastStep = useRef<HTMLDivElement>(null);
  const previousSteps = useRef(state.steps);
  const saveChain = useRef(Promise.resolve());
  const stepReader = useRef<AutoReader | null>(null);
  const activeStep =
    state.steps.find((step) => step.id === activeStepId) ?? state.steps.at(-1)!;
  function selectStep(id: string) {
    setActiveStepId(id);
    setHintStepId(id);
  }

  useEffect(() => {
    const reader = new AutoReader({
      latest: () => current.current,
      read: performReading,
    });
    stepReader.current = reader;
    return () => {
      reader.dispose();
      stepReader.current = null;
    };
  }, []);
  useEffect(() => {
    if (ready)
      stepReader.current?.observe(
        state,
        online === true && recognitionReady && state.problemConfirmed,
      );
  }, [state, ready, online, recognitionReady]);

  useEffect(() => {
    const previous = previousSteps.current;
    previousSteps.current = state.steps;
    // Only follow an appended box, never a restored draft or an earlier recheck.
    if (
      state.steps.length === previous.length + 1 &&
      state.steps.at(-2)?.id === previous.at(-1)?.id &&
      state.steps.at(-2)?.result?.status === "verified"
    ) {
      const next = state.steps.at(-1)!;
      setActiveStepId(next.id);
      setHintStepId(next.id);
      setTool("pen");
      lastStep.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [state.steps]);

  useEffect(() => {
    let mounted = true;
    loadDraft()
      .then((draft) => {
        if (mounted && draft) dispatch({ type: "restore", state: draft });
      })
      .catch(() => {
        if (mounted) setDraftStatus("Browser draft storage is unavailable");
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    setDraftStatus("Saving draft…");
    let cancelled = false;
    const timer = window.setTimeout(() => {
      // Serialize snapshots so a slower old write cannot replace a newer one.
      saveChain.current = saveChain.current
        .catch(() => undefined)
        .then(() => saveDraft(state));
      saveChain.current
        .then(() => {
          if (!cancelled) setDraftStatus("Draft saved on this device");
        })
        .catch(() => {
          if (!cancelled)
            setDraftStatus("Draft not saved · keep this tab open");
        });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, ready]);
  useEffect(() => {
    const controller = new AbortController();
    async function health() {
      try {
        const response = await fetch("/api/recognition-status", {
          signal: controller.signal,
        });
        const data: unknown = await response.json();
        if (!controller.signal.aborted) {
          setOnline(response.ok);
          setRecognitionReady(
            typeof data === "object" &&
              data !== null &&
              "configured" in data &&
              data.configured === true,
          );
          if (typeof data === "object" && data !== null) {
            setReviewReady(
              !("review_configured" in data) || data.review_configured === true,
            );
            setRecognitionMessage(
              "message" in data && typeof data.message === "string"
                ? data.message
                : "Local GLM-OCR is not ready. Run setup-local-ocr.ps1 on the laptop.",
            );
          }
        }
      } catch {
        if (!controller.signal.aborted) setOnline(false);
      }
    }
    void health();
    const timer = setInterval(() => void health(), 20000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  async function upload(file?: File) {
    if (!file) return;
    setQuestionError("");
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
        throw new Error("Choose a PNG, JPEG, or WebP screenshot.");
      if (file.size > 8 * 1024 * 1024)
        throw new Error(
          "Choose an image under 8 MB. Crop it to one question first.",
        );
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const probe = new Image();
      probe.src = image;
      await probe.decode();
      if (probe.naturalWidth * probe.naturalHeight > 16_000_000)
        throw new Error("Choose an image under 16 megapixels.");
      questionToken.current = "";
      setQuestionBusy(false);
      dispatch({ type: "image", image });
    } catch (error) {
      setQuestionError(api.errorMessage(error));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function readQuestion(crop?: Parameters<typeof imageBlob>[1]) {
    const snapshot = current.current;
    if (!snapshot.questionImage) return;
    const token = uniqueId();
    questionToken.current = token;
    setQuestionBusy(true);
    setQuestionError("");
    try {
      const math = await api.recognize(
        await imageBlob(snapshot.questionImage, crop),
        "question",
      );
      if (
        questionToken.current === token &&
        current.current.problemRevision === snapshot.problemRevision
      )
        dispatch({ type: "problem", value: math });
    } catch (error) {
      if (questionToken.current === token)
        setQuestionError(api.errorMessage(error));
    } finally {
      if (questionToken.current === token) setQuestionBusy(false);
    }
  }
  function readStep(id: string): Promise<void> {
    return stepReader.current?.readNow(id) ?? Promise.resolve();
  }
  async function performReading(
    snapshot: ReadSnapshot,
    signal: AbortSignal,
    cached?: string,
  ) {
    const { id, key } = snapshot,
      token = uniqueId();
    const stillCurrent = () => {
      const workspace = current.current,
        index = workspace.steps.findIndex((step) => step.id === id);
      return (
        !signal.aborted &&
        index >= 0 &&
        !workspace.steps[index].drawing &&
        workspace.steps[index].mode === "handwriting" &&
        contextKey(workspace, index) === key
      );
    };
    if (!stillCurrent()) return;
    dispatch({ type: "start", id, token, kind: "reading" });
    try {
      let math = cached;
      if (math === undefined) {
        const image = await rasterize(snapshot.strokes);
        if (!stillCurrent()) return;
        math = await api.recognize(image, "step", signal);
      }
      if (!stillCurrent()) return;
      dispatch({ type: "read", id, token, key, math });
      return math;
    } catch (error) {
      if (signal.aborted) return;
      dispatch({
        type: "error",
        id,
        token,
        key,
        error: api.errorMessage(error),
      });
    }
  }
  async function checkStep(id: string, correction = false) {
    const before = current.current,
      index = before.steps.findIndex((s) => s.id === id);
    if (index < 0) return;
    // Confirmation and the pending request refer to the same immutable snapshot.
    const snapshot: Workspace = {
      ...before,
      steps: before.steps.map((s, i) =>
        i === index ? { ...s, confirmed: true } : s,
      ),
    };
    const key = contextKey(snapshot, index),
      token = uniqueId();
    dispatch({ type: "confirmStep", id });
    dispatch({ type: "start", id, token, kind: "checking" });
    try {
      const result = await api.check(checkPayload(snapshot, index, correction));
      dispatch({ type: "result", id, key, token, result });
      if (result.status === "verified")
        setExpandedStepId((expanded) => (expanded === id ? null : expanded));
    } catch (error) {
      dispatch({
        type: "error",
        id,
        key,
        token,
        error: api.errorMessage(error),
      });
    }
  }
  const verifiedCount = state.steps.filter(
    (s) => s.result?.status === "verified" && !s.pending && !s.error,
  ).length;
  const complete = completedStep(state);
  if (!ready)
    return (
      <div className="opening">
        <BookOpen size={30} />
        <p>Opening Math Buddy…</p>
      </div>
    );
  return (
    <>
      <main>
        {newWork && (
          <div className="notice reset-prompt">
            <span>
              Start a new question? This replaces the current device draft.
            </span>
            <button
              className="button small primary"
              onClick={() => {
                questionToken.current = "";
                setQuestionBusy(false);
                setQuestionError("");
                setEditingQuestion(false);
                setHintStepId(null);
                setActiveStepId(null);
                setTool("pen");
                dispatch({
                  type: "restore",
                  state: {
                    ...newWorkspace(),
                    touchDrawing: state.touchDrawing,
                  },
                });
                setNewWork(false);
              }}
            >
              Start fresh
            </button>
            <button className="text-button" onClick={() => setNewWork(false)}>
              Keep working
            </button>
          </div>
        )}
        {online === true && !recognitionReady && (
          <div className="notice" role="status">
            <Sparkles size={18} />
            <span>{recognitionMessage}</span>
          </div>
        )}
        {online === true && !reviewReady && (
          <div className="notice" role="status">
            <Sparkles size={18} />
            <span>
              Add your Gemini API key to the laptop’s .env file to enable checks
              and hints. Handwriting is read locally.
            </span>
          </div>
        )}
        {online === false && (
          <div className="notice error" role="status">
            <WifiOff size={18} />
            <span>
              Cannot reach the laptop. Your writing stays here. Keep the laptop
              awake and retry when connected.
            </span>
          </div>
        )}
        <div className="workspace-grid">
          <section
            className="question-column"
            aria-labelledby="question-heading"
          >
            <section className="question-card">
              <div className="question-title-row">
                <h1 id="question-heading">
                  {state.problemConfirmed
                    ? state.problem.includes("=") &&
                      !/\b(?:differentiate|integrate|evaluate|find|prove|given)\b/i.test(
                        state.problem,
                      )
                      ? `Solve for ${state.variable}`
                      : "Your question"
                    : "What are we solving?"}
                </h1>
                {state.problemConfirmed && !editingQuestion && (
                  <button
                    className="text-button edit-question"
                    aria-label="Edit question"
                    title="Edit question"
                    onClick={() => setEditingQuestion(true)}
                  >
                    <Pencil size={15} />
                  </button>
                )}
                <button
                  className="text-button new-question"
                  aria-label="New question"
                  title="New question"
                  onClick={() => setNewWork(true)}
                >
                  <Plus size={17} />
                </button>
              </div>
              {state.problemConfirmed && !editingQuestion ? (
                <>
                  <div className="question-equation">
                    <MathPreview value={state.problem} />
                    <span className="question-caption">
                      Check each step as you go
                    </span>
                  </div>
                  {state.questionImage && (
                    <details className="source-image">
                      <summary>
                        View original question <ChevronDown size={13} />
                      </summary>
                      <img
                        src={state.questionImage}
                        alt="Your uploaded math question"
                      />
                    </details>
                  )}
                </>
              ) : (
                <div className="question-editor">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="visually-hidden"
                    aria-label="Upload question image"
                    onChange={(event) => void upload(event.target.files?.[0])}
                  />
                  {!state.questionImage ? (
                    <button
                      className="upload-zone"
                      onClick={() => fileInput.current?.click()}
                    >
                      <ImagePlus size={24} />
                      <strong>Upload a question</strong>
                      <span>A screenshot or photo · up to 8 MB</span>
                    </button>
                  ) : (
                    <>
                      <QuestionImage
                        key={state.questionImage.slice(-80)}
                        source={state.questionImage}
                        busy={questionBusy}
                        onRead={(crop) => void readQuestion(crop)}
                      />
                      <button
                        className="text-button replace-image"
                        onClick={() => fileInput.current?.click()}
                      >
                        Replace image
                      </button>
                    </>
                  )}
                  {questionBusy && (
                    <p className="pending">
                      <LoaderCircle className="spin" size={16} /> Reading your
                      question…
                    </p>
                  )}
                  {questionError && (
                    <div className="notice error" role="alert">
                      {questionError}
                    </div>
                  )}
                  <div className="problem-entry">
                    <label htmlFor="problem">
                      {state.questionImage
                        ? "Review the equation"
                        : "Or type your equation"}
                    </label>
                    <input
                      id="problem"
                      className="math-input"
                      value={state.problem}
                      placeholder="e.g. Differentiate sin(x²)"
                      maxLength={256}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) =>
                        dispatch({ type: "problem", value: event.target.value })
                      }
                    />
                    {state.problem && <MathPreview value={state.problem} />}
                    <div className="question-settings">
                      <span className="helper">Plain math or LaTeX</span>
                      <label className="variable-label" htmlFor="variable">
                        Variable{" "}
                        <input
                          id="variable"
                          aria-label="Variable letter"
                          maxLength={1}
                          value={state.variable}
                          onChange={(event) =>
                            dispatch({
                              type: "variable",
                              value: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      className="button primary use-question"
                      disabled={!state.problem.trim() || questionBusy}
                      onClick={() => {
                        dispatch({ type: "confirmProblem" });
                        setEditingQuestion(false);
                      }}
                    >
                      Use this question <ArrowRight size={16} />
                    </button>
                    {state.problemConfirmed && (
                      <button
                        className="text-button"
                        onClick={() => setEditingQuestion(false)}
                      >
                        Back to my work
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>
          </section>
          <section className="steps-section" aria-labelledby="steps-heading">
            <div className="steps-heading">
              <h2 id="steps-heading">Show your work</h2>
              <span className="checked-count" aria-live="polite">
                {complete
                  ? "Complete"
                  : `${verifiedCount} of ${state.steps.length} checked`}
              </span>
              <HintPanel
                key={state.steps[0]?.id}
                workspace={state}
                selectedStepId={hintStepId}
                online={online}
                onSelectStep={(id) => {
                  setHintStepId(id);
                  if (id) setActiveStepId(id);
                }}
                onReadStep={readStep}
                onConfirmStep={(id) => dispatch({ type: "confirmStep", id })}
                onEditReading={(id, math) =>
                  dispatch({
                    type: "edit",
                    id,
                    patch: { math, confirmed: false },
                  })
                }
              />
            </div>
            {!state.problemConfirmed && (
              <p className="setup-note">
                <CircleHelp size={14} /> Add and confirm your question to start
                checking.
              </p>
            )}
            <DrawingToolbar
              steps={state.steps}
              selected={activeStep}
              tool={tool}
              touchDrawing={state.touchDrawing}
              onSelect={(id) => {
                selectStep(id);
                setExpandedStepId(id);
                document.getElementById(`step-${id}`)?.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                });
              }}
              onTool={setTool}
              onMode={(mode) => {
                if (activeStep.mode !== mode)
                  dispatch({
                    type: "edit",
                    id: activeStep.id,
                    patch:
                      mode === "handwriting"
                        ? { mode, math: "", confirmed: false }
                        : { mode, confirmed: true },
                  });
              }}
              onUndo={() => dispatch({ type: "undoInk", id: activeStep.id })}
              onClear={() => dispatch({ type: "clearInk", id: activeStep.id })}
              onTouch={(value) => dispatch({ type: "touch", value })}
            />
            <div className="steps-list">
              {state.steps.map((step, index) => {
                const previousStep = state.steps[index - 1];
                const verified = step.result?.status === "verified";
                const canCollapse =
                  step.mode === "handwriting" &&
                  verified &&
                  step.confirmed &&
                  !step.pending &&
                  !step.error &&
                  !step.stale;
                const compact = canCollapse && expandedStepId !== step.id;
                const needsReview =
                  step.mode === "handwriting" && !!step.math && !step.confirmed;
                return (
                  <div
                    key={step.id}
                    ref={
                      index === state.steps.length - 1 ? lastStep : undefined
                    }
                    className="step-wrapper"
                  >
                    <article
                      id={`step-${step.id}`}
                      className={`step-card ${compact ? "is-compact" : ""} ${verified ? "is-verified" : step.result?.status === "issue" ? "has-issue" : ""}`}
                      aria-label={`Step ${index + 1}`}
                      tabIndex={0}
                      data-active={
                        activeStep.id === step.id ? "true" : undefined
                      }
                      data-hint-target={
                        hintStepId === step.id ? "true" : undefined
                      }
                      onPointerDownCapture={() => selectStep(step.id)}
                      onFocusCapture={() => selectStep(step.id)}
                      aria-busy={!!step.pending}
                    >
                      <div className="step-main">
                        <div className="step-header">
                          <h3>Step {index + 1}</h3>
                          {canCollapse && !compact && (
                            <button
                              className="text-button collapse-step"
                              aria-label={`Collapse step ${index + 1}`}
                              title="Collapse step"
                              onClick={() => setExpandedStepId(null)}
                            >
                              <ChevronDown size={14} />
                            </button>
                          )}
                        </div>
                        {!compact &&
                          previousStep?.confirmed &&
                          previousStep.math.trim() && (
                            <aside
                              className="previous-step-reference"
                              aria-label={`Previous step for step ${index + 1}`}
                            >
                              <span>Previous step · Step {index}</span>
                              <MathPreview value={previousStep.math} />
                            </aside>
                          )}
                        {compact ? (
                          <button
                            className="step-summary"
                            aria-label={`Expand step ${index + 1} for editing`}
                            title="Expand to edit your writing"
                            onClick={() => {
                              selectStep(step.id);
                              setExpandedStepId(step.id);
                            }}
                          >
                            <MathPreview value={step.math} />
                          </button>
                        ) : step.mode === "handwriting" ? (
                          <DrawingPad
                            label={`Step ${index + 1}`}
                            strokes={step.strokes}
                            touchDrawing={state.touchDrawing}
                            tool={tool}
                            onBegin={() => {
                              stepReader.current?.begin(step.id);
                              dispatch({ type: "beginInk", id: step.id });
                            }}
                            onEnd={() =>
                              dispatch({ type: "endInk", id: step.id })
                            }
                            onChange={(strokes) =>
                              dispatch({
                                type: "edit",
                                id: step.id,
                                patch: { strokes, math: "", confirmed: false },
                              })
                            }
                          />
                        ) : (
                          <TypedStep
                            step={step}
                            number={index + 1}
                            onChange={(math) =>
                              dispatch({
                                type: "edit",
                                id: step.id,
                                patch: {
                                  math,
                                  confirmed: true,
                                },
                              })
                            }
                          />
                        )}
                        {step.mode === "handwriting" &&
                          step.math &&
                          !compact && (
                            <details className="reading" open={!step.confirmed}>
                              <summary>
                                <ScanLine size={14} />{" "}
                                {step.confirmed ? "Reading" : "Review reading"}{" "}
                                <ChevronDown size={13} />
                              </summary>
                              <div className="label-row">
                                <label htmlFor={`reading-${step.id}`}>
                                  <ScanLine size={14} /> Math Buddy read
                                </label>
                                <span>
                                  {step.confirmed
                                    ? "Confirmed reading"
                                    : "Review, then tap Confirm →"}
                                </span>
                              </div>
                              <MathPreview value={step.math} />
                              <input
                                id={`reading-${step.id}`}
                                className="math-input"
                                value={step.math}
                                maxLength={256}
                                spellCheck={false}
                                autoComplete="off"
                                onChange={(event) =>
                                  dispatch({
                                    type: "edit",
                                    id: step.id,
                                    patch: {
                                      math: event.target.value,
                                      confirmed: false,
                                    },
                                  })
                                }
                              />
                              <div className="reading-footer">
                                <span className="helper">
                                  Edit any misread symbols. Your ink stays here.
                                </span>
                                <button
                                  className="text-button"
                                  disabled={!!step.pending || online === false}
                                  onClick={() => void readStep(step.id)}
                                >
                                  Read again
                                </button>
                              </div>
                            </details>
                          )}
                      </div>
                      <div className="check-rail">
                        <button
                          className="check-button"
                          aria-label={`${needsReview ? "Confirm reading and check" : "Check"} step ${index + 1}`}
                          title={
                            !state.problemConfirmed
                              ? "Confirm your question first"
                              : needsReview
                                ? "Confirm reading and check this step"
                                : `Check step ${index + 1}`
                          }
                          disabled={
                            !state.problemConfirmed ||
                            !!step.pending ||
                            online === false ||
                            (step.mode === "typed"
                              ? !step.math.trim()
                              : !step.strokes.length && !step.math.trim())
                          }
                          onClick={() => {
                            if (step.mode === "handwriting" && !step.math)
                              void readStep(step.id);
                            else void checkStep(step.id);
                          }}
                        >
                          {step.pending ? (
                            <LoaderCircle className="spin" size={21} />
                          ) : (
                            <Check size={22} strokeWidth={2.5} />
                          )}
                        </button>
                        {needsReview && (
                          <span className="check-label">Confirm</span>
                        )}
                      </div>
                    </article>
                    <Feedback
                      step={step}
                      isComplete={complete?.id === step.id}
                      onCorrection={() => void checkStep(step.id, true)}
                    />
                  </div>
                );
              })}
            </div>
            {state.steps.length >= 34 && !complete && (
              <p className="step-flow-note" role="status">
                This workspace has reached its 34-step limit.
              </p>
            )}
          </section>
        </div>
        <footer className="page-footer">
          <span
            className={
              draftStatus.includes("not saved") ||
              draftStatus.includes("unavailable")
                ? "draft-status"
                : "visually-hidden"
            }
            role="status"
          >
            {draftStatus}
          </span>
          <details className="workspace-info">
            <summary
              aria-label="Workspace information"
              title="Workspace information"
            >
              <Info size={15} />
            </summary>
            <p>
              Math Buddy ·{" "}
              {online === false
                ? "Offline"
                : online
                  ? "Connected"
                  : "Connecting…"}
            </p>
            <p>{draftStatus}</p>
            <p>
              Image readings run on the laptop GPU with GLM-OCR. Confirmed math
              and requested hints go to Gemini. Drafts stay on this device.
            </p>
          </details>
        </footer>
      </main>
    </>
  );
}

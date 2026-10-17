import { useEffect, useReducer, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  ImagePlus,
  Keyboard,
  LoaderCircle,
  PenLine,
  Plus,
  ScanLine,
  Sparkles,
  TriangleAlert,
  WifiOff,
  X,
} from "lucide-react";
import * as api from "./api";
import { loadDraft, saveDraft } from "./draft";
import DrawingPad from "./DrawingPad";
import { rasterize } from "./ink";
import MathPreview from "./MathPreview";
import QuestionImage, { imageBlob } from "./QuestionImage";
import {
  checkPayload,
  contextKey,
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
  onCorrection,
}: {
  step: Step;
  onCorrection: () => void;
}) {
  const result = step.result;
  return (
    <div aria-live="polite" className="feedback-area">
      {step.pending && (
        <div className="pending">
          <LoaderCircle className="spin" size={17} />
          <div>
            <strong>
              {step.pending.kind === "reading"
                ? "Gemini is reading your handwriting…"
                : "Gemini is reviewing this step…"}
            </strong>
            {step.pending.kind === "reading" && (
              <span>Your writing stays here while Gemini reads this box.</span>
            )}
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
          <CircleHelp size={15} /> Work changed. Check this step again for
          current feedback.
        </p>
      )}
      {result && (
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
                ? result.reviewer === "gemini"
                  ? "This step looks correct."
                  : "Nice work — this step is correct."
                : titles[result.status]}
            </strong>
          </div>
          {(result.status !== "verified" || result.reviewer === "gemini") && (
            <p>{result.message}</p>
          )}
          {result.reviewer === "gemini" && (
            <span className="reviewer-label">
              <Sparkles size={12} /> Reviewed by Gemini
            </span>
          )}
          {result.hint && <p className="hint">{result.hint}</p>}
          {result.warnings.map((warning, i) => (
            <p key={i}>{warning}</p>
          ))}
          {result.status === "issue" && (
            <span className="continue-note">
              You can continue; this warning stays with your work.
            </span>
          )}
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
              <code>{result.correction}</code>
            </div>
          )}
          <details>
            <summary>
              How this was checked <ChevronDown size={13} />
            </summary>
            {result.status === "verified" && result.reviewer !== "gemini" && (
              <p>{result.message}</p>
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
  const [questionBusy, setQuestionBusy] = useState(false);
  const questionToken = useRef("");
  const [questionError, setQuestionError] = useState("");
  const [help, setHelp] = useState(false);
  const [newWork, setNewWork] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastStep = useRef<HTMLDivElement>(null);
  const saveChain = useRef(Promise.resolve());

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
  async function readStep(id: string) {
    const snapshot = current.current,
      index = snapshot.steps.findIndex((s) => s.id === id),
      step = snapshot.steps[index];
    if (!step) return;
    const key = contextKey(snapshot, index),
      token = uniqueId();
    dispatch({ type: "start", id, token, kind: "reading" });
    try {
      const math = await api.recognize(await rasterize(step.strokes));
      dispatch({ type: "read", id, token, key, math });
    } catch (error) {
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
  function addStep() {
    dispatch({ type: "add" });
    setTimeout(
      () =>
        lastStep.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        }),
      80,
    );
  }
  const verifiedCount = state.steps.filter(
    (s) => s.result?.status === "verified",
  ).length;
  if (!ready)
    return (
      <div className="opening">
        <BookOpen size={30} />
        <p>Opening Math Buddy…</p>
      </div>
    );
  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="Math Buddy workspace">
            <span className="brand-mark">
              <BookOpen size={19} />
            </span>
            <span>
              mathbuddy<span className="brand-dot">.</span>
            </span>
          </a>
          <span className="workspace-label">YOUR THINKING SPACE</span>
          <div className="header-right">
            <span className={`connection ${online === false ? "offline" : ""}`}>
              <i />
              {online === false
                ? "Laptop disconnected"
                : online === true
                  ? "Laptop connected"
                  : "Connecting…"}
            </span>
            <button
              className="button secondary new-question"
              onClick={() => setNewWork(true)}
            >
              <Plus size={16} /> New question
            </button>
          </div>
        </div>
      </header>
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
            <span>
              Add your Gemini API key to the laptop’s .env file to enable image
              reading and checking. Every step uses Gemini.
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
          <aside className="question-column" aria-labelledby="question-heading">
            <div className="question-kicker">
              <span>
                <Sparkles size={14} />
              </span>{" "}
              YOUR QUESTION
            </div>
            <section className="question-card">
              <div className="question-title-row">
                <h1 id="question-heading">
                  {state.problemConfirmed
                    ? "Your question"
                    : "What are we solving?"}
                </h1>
                {state.problemConfirmed && !editingQuestion && (
                  <button
                    className="text-button edit-question"
                    onClick={() => setEditingQuestion(true)}
                  >
                    Edit
                  </button>
                )}
              </div>
              {state.problemConfirmed && !editingQuestion ? (
                <>
                  <div className="question-equation">
                    <MathPreview value={state.problem} />
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
                  <div className="question-note">
                    Show your thinking one step at a time. Gemini reviews each
                    step when you check.
                  </div>
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
            <button
              className="text-button guidance-toggle"
              aria-expanded={help}
              aria-controls="workspace-help"
              onClick={() => setHelp(!help)}
            >
              <CircleHelp size={17} /> A little guidance{" "}
              <ChevronDown className={help ? "rotated" : ""} size={13} />
            </button>
            {help && (
              <section className="help-panel" id="workspace-help">
                <h2>One transformation at a time</h2>
                <p>
                  Write one equation in each box, then tap the check button
                  beside it. Review the handwriting reading and tap again to
                  confirm and check.
                </p>
                <p>
                  A warning gives you a hint. You can ask for a correction or
                  keep going with your own approach.
                </p>
                <p>
                  Use Pen, Eraser, and Undo below each box. With finger drawing
                  off, use your finger to scroll and Apple Pencil to write.
                </p>
                <p>
                  Gemini reviews simple and advanced math. For calculus, include
                  whether you want to differentiate or integrate and the
                  variable. Typing works too.
                </p>
                <button className="text-button" onClick={() => setHelp(false)}>
                  Got it <X size={13} />
                </button>
              </section>
            )}
            <div className="sidebar-footnote">
              <span className="local-dot" /> Drafts stay here. Checks and image
              readings go to Gemini.
            </div>
          </aside>
          <section className="steps-section" aria-labelledby="steps-heading">
            <div className="steps-heading">
              <div>
                <h2 id="steps-heading">Show your work</h2>
                <p>Write one transformation in each box.</p>
              </div>
              <label className="touch-toggle">
                <input
                  type="checkbox"
                  checked={state.touchDrawing}
                  onChange={(event) =>
                    dispatch({ type: "touch", value: event.target.checked })
                  }
                />{" "}
                Finger drawing
              </label>
            </div>
            {!state.problemConfirmed && (
              <p className="setup-note">
                <CircleHelp size={14} /> Add and confirm your question to start
                checking.
              </p>
            )}
            <div className="steps-list">
              {state.steps.map((step, index) => {
                const verified = step.result?.status === "verified";
                const needsReview =
                  step.mode === "handwriting" && !!step.math && !step.confirmed;
                const checkLabel = step.pending
                  ? step.pending.kind === "reading"
                    ? "Reading"
                    : "Checking"
                  : needsReview
                    ? "Confirm"
                    : "Check";
                return (
                  <div
                    key={step.id}
                    ref={
                      index === state.steps.length - 1 ? lastStep : undefined
                    }
                    className="step-wrapper"
                  >
                    <article
                      className={`step-card ${verified ? "is-verified" : step.result?.status === "issue" ? "has-issue" : ""}`}
                      aria-label={`Step ${index + 1}`}
                      aria-busy={!!step.pending}
                    >
                      <div className="step-main">
                        <div className="step-header">
                          <h3>
                            <span
                              className={`step-number ${verified ? "done" : ""}`}
                            >
                              {verified ? <Check size={12} /> : index + 1}
                            </span>{" "}
                            STEP {index + 1}
                          </h3>
                          <div
                            className="mode-switch"
                            role="group"
                            aria-label={`Step ${index + 1} input mode`}
                          >
                            <button
                              className={
                                step.mode === "handwriting" ? "selected" : ""
                              }
                              aria-pressed={step.mode === "handwriting"}
                              onClick={() => {
                                if (step.mode !== "handwriting")
                                  dispatch({
                                    type: "edit",
                                    id: step.id,
                                    patch: {
                                      mode: "handwriting",
                                      math: "",
                                      confirmed: false,
                                    },
                                  });
                              }}
                            >
                              <PenLine size={14} /> Write
                            </button>
                            <button
                              className={
                                step.mode === "typed" ? "selected" : ""
                              }
                              aria-pressed={step.mode === "typed"}
                              onClick={() => {
                                if (step.mode !== "typed")
                                  dispatch({
                                    type: "edit",
                                    id: step.id,
                                    patch: { mode: "typed", confirmed: true },
                                  });
                              }}
                            >
                              <Keyboard size={15} /> Type
                            </button>
                          </div>
                        </div>
                        {step.mode === "handwriting" ? (
                          <DrawingPad
                            label={`Step ${index + 1}`}
                            strokes={step.strokes}
                            touchDrawing={state.touchDrawing}
                            onChange={(strokes) =>
                              dispatch({
                                type: "edit",
                                id: step.id,
                                patch: { strokes, math: "", confirmed: false },
                              })
                            }
                          />
                        ) : (
                          <div className="typed-entry">
                            <label
                              className="visually-hidden"
                              htmlFor={`typed-${step.id}`}
                            >
                              Equation for step {index + 1}
                            </label>
                            <input
                              id={`typed-${step.id}`}
                              className="math-input"
                              placeholder={
                                index === 0
                                  ? "Your first transformation…"
                                  : "What comes next?"
                              }
                              value={step.math}
                              maxLength={256}
                              autoComplete="off"
                              spellCheck={false}
                              onChange={(event) =>
                                dispatch({
                                  type: "edit",
                                  id: step.id,
                                  patch: {
                                    math: event.target.value,
                                    confirmed: true,
                                  },
                                })
                              }
                            />
                            {step.math && <MathPreview value={step.math} />}
                          </div>
                        )}
                        {step.mode === "handwriting" && step.math && (
                          <details className="reading" open={!step.confirmed}>
                            <summary>
                              <ScanLine size={14} />{" "}
                              {step.confirmed
                                ? "View recognized equation"
                                : "Review recognized equation"}{" "}
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
                        <span className="check-label">{checkLabel}</span>
                      </div>
                    </article>
                    <Feedback
                      step={step}
                      onCorrection={() => void checkStep(step.id, true)}
                    />
                  </div>
                );
              })}
            </div>
            <button
              className="add-step"
              disabled={state.steps.length >= 34}
              onClick={addStep}
            >
              <Plus size={17} /> Add next step
            </button>
            <div className="working-summary">
              <span>
                {verifiedCount
                  ? `${verifiedCount} ${verifiedCount === 1 ? "step" : "steps"} reviewed as correct`
                  : "Your pace. Your approach."}
              </span>
              <span>One step at a time.</span>
            </div>
          </section>
        </div>
        <footer className="page-footer">
          <span>
            {recognitionReady
              ? "Gemini reads & reviews every step"
              : "Gemini API key needed"}
          </span>
          <span className="draft-status">{draftStatus}</span>
          <a href="/docs" target="_blank" rel="noreferrer">
            API explorer <ArrowRight size={12} />
          </a>
        </footer>
      </main>
    </>
  );
}

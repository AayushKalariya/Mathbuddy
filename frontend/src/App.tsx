import { useEffect, useReducer, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ImagePlus,
  Keyboard,
  LoaderCircle,
  PenLine,
  Plus,
  ScanLine,
  ShieldCheck,
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
  unsupported: "Outside current support",
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
                ? "Reading your handwriting…"
                : "Checking this step…"}
            </strong>
            {step.pending.kind === "reading" && (
              <span>
                The first reading also loads the local model. You can keep
                writing.
              </span>
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
              <CheckCircle2 size={20} />
            ) : result.status === "issue" ? (
              <TriangleAlert size={20} />
            ) : (
              <CircleHelp size={20} />
            )}
            <strong>{titles[result.status]}</strong>
          </div>
          <p>{result.message}</p>
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
              <span>One valid correction</span>
              <code>{result.correction}</code>
            </div>
          )}
          <details>
            <summary>
              How this was checked <ChevronDown size={13} />
            </summary>
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
              <BookOpen size={21} />
            </span>
            <span>
              math<span className="brand-light">buddy</span>
              <span className="brand-dot">.</span>
            </span>
          </a>
          <span className="header-divider" />
          <span className="workspace-label">WORKSPACE</span>
          <div className="header-right">
            <span className={`connection ${online === false ? "offline" : ""}`}>
              <i />
              {online === false
                ? "Laptop disconnected"
                : online === true
                  ? "Connected locally"
                  : "Connecting…"}
            </span>
            <button
              className="icon-button"
              aria-label="Workspace help"
              onClick={() => setHelp(!help)}
            >
              <CircleHelp size={21} />
            </button>
          </div>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">A LITTLE CLARITY, EVERY STEP</div>
            <h1>Let’s work it out.</h1>
            <p>Your question, your approach. A little help along the way.</p>
          </div>
          <button
            className="button secondary new-question"
            onClick={() => setNewWork(true)}
          >
            <Plus size={16} />
            New question
          </button>
        </div>
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
        {help && (
          <section className="help-panel">
            <button
              className="icon-button"
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <X size={18} />
            </button>
            <h3>One line at a time</h3>
            <p>
              Upload a screenshot, select just the equation if needed, then read
              and confirm the question. Write one equation in each step area.
              Check step reads your handwriting; review that reading, then
              confirm to check the math.
            </p>
            <p>
              Arithmetic and one-variable linear equations are supported.
              Different valid methods are welcome. A valid step need not be the
              fastest approach. Calculus, inequalities, and nonlinear equations
              aren’t supported yet.
            </p>
            <p>
              Work stays local. This tab keeps one device draft; laptop session
              saving and the AI chat sidebar are later features.
            </p>
          </section>
        )}
        {online === false && (
          <div className="notice error">
            <WifiOff size={18} />
            <span>
              Cannot reach the laptop. Your writing stays here. Keep the laptop
              awake and retry checking when connected.
            </span>
          </div>
        )}
        <section
          className="card question-card"
          aria-labelledby="question-heading"
        >
          <div className="section-heading">
            <span className="section-icon">
              <ImagePlus size={20} />
            </span>
            <div>
              <h2 id="question-heading">Your question</h2>
              <p>A screenshot is a good place to start. Typing works too.</p>
            </div>
            <span className="chip">01 / QUESTION</span>
          </div>
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
              <span className="upload-icon">
                <ImagePlus size={25} />
              </span>
              <strong>Bring your question here</strong>
              <span>Upload a screenshot or photo</span>
              <span className="upload-formats">
                PNG, JPG, or WebP · up to 8 MB
              </span>
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
              <LoaderCircle className="spin" size={16} />
              Reading locally… first use loads the model.
            </p>
          )}
          {questionError && (
            <div className="notice error" role="alert">
              {questionError}
            </div>
          )}
          <div className="problem-entry">
            <div className="label-row">
              <label htmlFor="problem">
                {state.questionImage
                  ? "Review the question’s equation"
                  : "Or type the equation"}
              </label>
              <span>Plain math or LaTeX</span>
            </div>
            <div className="problem-input-row">
              <input
                id="problem"
                className="math-input"
                value={state.problem}
                placeholder="e.g. 3(x + 2) = 15"
                maxLength={256}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  dispatch({ type: "problem", value: event.target.value })
                }
              />
              <button
                className={`button ${state.problemConfirmed ? "confirmed" : "primary"}`}
                disabled={!state.problem.trim() || questionBusy}
                onClick={() => dispatch({ type: "confirmProblem" })}
              >
                {state.problemConfirmed ? (
                  <Check size={17} />
                ) : (
                  <ArrowRight size={17} />
                )}
                {state.problemConfirmed ? "Confirmed" : "Use this question"}
              </button>
            </div>
            {state.problem && <MathPreview value={state.problem} />}
            <div className="question-settings">
              <p className="helper">
                Check the reading before solving. For now, use one arithmetic
                expression or linear equation.
              </p>
              <label className="variable-label" htmlFor="variable">
                Variable{" "}
                <input
                  id="variable"
                  aria-label="Variable letter"
                  maxLength={1}
                  value={state.variable}
                  onChange={(event) =>
                    dispatch({ type: "variable", value: event.target.value })
                  }
                />
              </label>
            </div>
          </div>
        </section>
        <div className="flow-connector">
          <span />
          <ArrowDown size={16} />
          <span />
        </div>
        <section className="steps-section" aria-labelledby="steps-heading">
          {state.problemConfirmed && (
            <div className="current-problem">
              <span>WORKING ON</span>
              <MathPreview value={state.problem} />
              <CheckCircle2 size={16} />
            </div>
          )}
          <div className="steps-heading">
            <div>
              <div className="eyebrow">MAKE YOUR THINKING VISIBLE</div>
              <h2 id="steps-heading">Your working</h2>
            </div>
            <label className="touch-toggle">
              <input
                type="checkbox"
                checked={state.touchDrawing}
                onChange={(event) =>
                  dispatch({ type: "touch", value: event.target.checked })
                }
              />
              Finger drawing
            </label>
          </div>
          <p className="steps-intro">
            One step per space. We’ll check the math when you’re ready.
          </p>
          {state.steps.map((step, index) => (
            <div
              key={step.id}
              ref={index === state.steps.length - 1 ? lastStep : undefined}
              className="step-wrapper"
            >
              <div
                className={`step-number ${step.result?.status === "verified" ? "done" : ""}`}
              >
                {step.result?.status === "verified" ? (
                  <Check size={17} />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </div>
              <article
                className="card step-card"
                aria-label={`Step ${index + 1}`}
              >
                <div className="step-header">
                  <div>
                    <h3>Step {index + 1}</h3>
                    <span>
                      {index === 0
                        ? "Start with your first move."
                        : "Keep going from the line above."}
                    </span>
                  </div>
                  <div
                    className="mode-switch"
                    role="group"
                    aria-label={`Step ${index + 1} input mode`}
                  >
                    <button
                      className={step.mode === "handwriting" ? "selected" : ""}
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
                      <PenLine size={15} />
                      Write
                    </button>
                    <button
                      className={step.mode === "typed" ? "selected" : ""}
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
                      <Keyboard size={16} />
                      Type
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
                    <label htmlFor={`typed-${step.id}`}>
                      Write the equation for this step
                    </label>
                    <input
                      id={`typed-${step.id}`}
                      className="math-input"
                      placeholder="e.g. 3x + 6 = 15"
                      value={step.math}
                      maxLength={256}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) =>
                        dispatch({
                          type: "edit",
                          id: step.id,
                          patch: { math: event.target.value, confirmed: true },
                        })
                      }
                    />
                    {step.math && <MathPreview value={step.math} />}
                  </div>
                )}
                {step.mode === "handwriting" && step.math && (
                  <div className="reading">
                    <div className="label-row">
                      <label htmlFor={`reading-${step.id}`}>
                        <ScanLine size={15} />
                        Math Buddy read
                      </label>
                      <span>
                        {step.confirmed
                          ? "Confirmed reading"
                          : "Review before checking"}
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
                          patch: { math: event.target.value, confirmed: false },
                        })
                      }
                    />
                    <p className="helper">
                      Misread a symbol? Edit the line above. Your handwriting
                      stays as you wrote it.
                    </p>
                  </div>
                )}
                <Feedback
                  step={step}
                  onCorrection={() => void checkStep(step.id, true)}
                />
                <div className="step-footer">
                  <span className="step-footer-note">
                    {!state.problemConfirmed
                      ? "Confirm your question above to begin."
                      : step.math && !step.confirmed
                        ? "Does the reading match your writing?"
                        : "Your approach. We check the equivalence."}
                  </span>
                  <div className="step-actions">
                    {step.mode === "handwriting" && step.math && (
                      <button
                        className="text-button"
                        disabled={!!step.pending || online === false}
                        onClick={() => void readStep(step.id)}
                      >
                        Read again
                      </button>
                    )}
                    <button
                      className="button primary"
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
                        <LoaderCircle className="spin" size={17} />
                      ) : (
                        <CheckCircle2 size={17} />
                      )}
                      {step.pending
                        ? step.pending.kind === "reading"
                          ? "Reading…"
                          : "Checking…"
                        : step.mode === "handwriting" &&
                            step.math &&
                            !step.confirmed
                          ? "Confirm & check"
                          : "Check step"}
                    </button>
                  </div>
                </div>
              </article>
            </div>
          ))}
          <button
            className="add-step"
            disabled={state.steps.length >= 34}
            onClick={addStep}
          >
            <Plus size={19} />
            <span>Add next step</span>
            <span className="add-step-note">
              A fresh space for your next move
            </span>
          </button>
          <div className="working-summary">
            <span>
              {verifiedCount
                ? `${verifiedCount} ${verifiedCount === 1 ? "step" : "steps"} verified`
                : "Take it one step at a time."}
            </span>
            <span>Different valid methods are welcome.</span>
          </div>
        </section>
        <footer className="page-footer">
          <span>
            <ShieldCheck size={15} />
            {recognitionReady
              ? "Local recognition & checking"
              : "Local checking · recognition setup needed"}
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

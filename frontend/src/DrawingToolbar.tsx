import {
  Eraser,
  Hand,
  Keyboard,
  PenLine,
  RotateCcw,
  Undo2,
} from "lucide-react";
import type { Step } from "./state";

type Props = {
  steps: Step[];
  selected: Step;
  tool: "pen" | "eraser";
  touchDrawing: boolean;
  onSelect: (id: string) => void;
  onTool: (tool: "pen" | "eraser") => void;
  onMode: (mode: Step["mode"]) => void;
  onUndo: () => void;
  onClear: () => void;
  onTouch: (value: boolean) => void;
};

export default function DrawingToolbar({
  steps,
  selected,
  tool,
  touchDrawing,
  onSelect,
  onTool,
  onMode,
  onUndo,
  onClear,
  onTouch,
}: Props) {
  const handwriting = selected.mode === "handwriting";
  const stepNumber = steps.findIndex((step) => step.id === selected.id) + 1;
  function chooseTool(next: "pen" | "eraser") {
    if (!handwriting) onMode("handwriting");
    onTool(next);
  }
  return (
    <div
      className="workspace-toolbar"
      role="toolbar"
      aria-label="Workspace tools"
    >
      <select
        aria-label="Active step"
        value={selected.id}
        onChange={(event) => onSelect(event.target.value)}
      >
        {steps.map((step, index) => (
          <option key={step.id} value={step.id}>
            Step {index + 1}
          </option>
        ))}
      </select>
      <div
        className="tool-group"
        role="group"
        aria-label="Drawing and input tools"
      >
        <button
          type="button"
          className={handwriting && tool === "pen" ? "tool active" : "tool"}
          aria-label="Pen"
          aria-pressed={handwriting && tool === "pen"}
          title="Pen · write in the selected box"
          onClick={() => chooseTool("pen")}
        >
          <PenLine size={17} />
        </button>
        <button
          type="button"
          className={handwriting && tool === "eraser" ? "tool active" : "tool"}
          aria-label="Eraser"
          aria-pressed={handwriting && tool === "eraser"}
          disabled={!handwriting}
          title="Eraser · remove a whole stroke"
          onClick={() => chooseTool("eraser")}
        >
          <Eraser size={17} />
        </button>
        <button
          type="button"
          className={!handwriting ? "tool active" : "tool"}
          aria-label="Type"
          aria-pressed={!handwriting}
          title="Type an equation"
          onClick={() => onMode("typed")}
        >
          <Keyboard size={17} />
        </button>
        <span className="tool-divider" />
        <button
          type="button"
          className="tool"
          aria-label={`Undo Step ${stepNumber}`}
          title={`Undo drawing in Step ${stepNumber}`}
          disabled={!handwriting || !selected.inkHistory?.length}
          onClick={onUndo}
        >
          <Undo2 size={17} />
        </button>
        <button
          type="button"
          className="tool"
          aria-label={`Clear Step ${stepNumber}`}
          title={`Clear writing in Step ${stepNumber}`}
          disabled={!handwriting || !selected.strokes.length}
          onClick={onClear}
        >
          <RotateCcw size={16} />
        </button>
        <span className="tool-divider" />
        <button
          type="button"
          className={touchDrawing ? "tool active" : "tool"}
          aria-label="Finger drawing"
          aria-pressed={touchDrawing}
          title={
            touchDrawing
              ? "Finger drawing on"
              : "Finger drawing off · use a finger to scroll"
          }
          onClick={() => onTouch(!touchDrawing)}
        >
          <Hand size={17} />
        </button>
      </div>
    </div>
  );
}

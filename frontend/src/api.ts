import type { CheckResult } from "./state";
import type { HintResult } from "./hints";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function responseJson(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok) {
    const message =
      record(data) && typeof data.detail === "string"
        ? data.detail
        : `Request failed (${response.status}). Check your input and retry.`;
    throw new Error(message);
  }
  return data;
}
export async function recognize(
  image: Blob,
  purpose: "question" | "step" = "step",
  signal?: AbortSignal,
): Promise<string> {
  const data = await responseJson(
    await fetch(`/api/recognize?purpose=${purpose}`, {
      method: "POST",
      headers: { "Content-Type": image.type },
      body: image,
      signal,
    }),
  );
  if (!record(data) || typeof data.latex !== "string")
    throw new Error(
      "Unexpected recognition response. Retry or enter the math manually.",
    );
  return data.latex;
}
export async function check(payload: object): Promise<CheckResult> {
  const data = await responseJson(
    await fetch("/api/check-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  const statuses = [
    "verified",
    "issue",
    "needs_clarification",
    "incomplete",
    "unsupported",
  ];
  if (record(data) && data.is_final_answer === undefined)
    throw new Error(
      "Restart the laptop server to enable final-answer detection, then retry. Your writing is preserved.",
    );
  if (
    !record(data) ||
    !statuses.includes(String(data.status)) ||
    typeof data.message !== "string" ||
    typeof data.step_id !== "string" ||
    !Number.isInteger(data.revision) ||
    !Number.isInteger(data.context_revision) ||
    !["valid", "invalid", "unresolved"].includes(
      String(data.transition_status),
    ) ||
    !["consistent", "earlier_issue", "unresolved"].includes(
      String(data.context_status),
    ) ||
    typeof data.correction_available !== "boolean" ||
    typeof data.is_final_answer !== "boolean" ||
    typeof data.verification_basis !== "string" ||
    (data.reviewer !== undefined &&
      !["local", "gemini"].includes(String(data.reviewer))) ||
    (data.model !== undefined && typeof data.model !== "string") ||
    !Array.isArray(data.warnings) ||
    !data.warnings.every((w) => typeof w === "string") ||
    ["hint", "correction"].some(
      (key) => data[key] !== undefined && typeof data[key] !== "string",
    )
  )
    throw new Error("Unexpected checker response. Your writing is preserved.");
  if (
    data.is_final_answer &&
    (data.status !== "verified" ||
      data.transition_status !== "valid" ||
      data.context_status !== "consistent" ||
      data.warnings.length)
  )
    throw new Error(
      "Gemini returned conflicting completion feedback. Your writing is preserved; check again.",
    );
  return data as CheckResult;
}
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Could not connect. Keep the laptop awake and retry; your writing is preserved.";

export async function hint(
  payload: object,
  signal?: AbortSignal,
): Promise<HintResult> {
  const data = await responseJson(
    await fetch("/api/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    }),
  );
  if (
    !record(data) ||
    ![
      "hint",
      "next_step",
      "needs_clarification",
      "earlier_issue",
      "unresolved",
    ].includes(String(data.kind)) ||
    typeof data.hint !== "string" ||
    !data.hint.trim() ||
    data.hint.length > 600 ||
    ![1, 2, 3].includes(Number(data.level)) ||
    typeof data.level !== "number" ||
    data.reviewer !== "gemini" ||
    typeof data.model !== "string" ||
    typeof data.step_id !== "string" ||
    !Number.isInteger(data.revision) ||
    !Number.isInteger(data.context_revision) ||
    (data.next_step !== undefined && typeof data.next_step !== "string") ||
    (data.next_step !== undefined &&
      (data.level !== 3 || data.kind !== "next_step")) ||
    (data.focus_step_number !== undefined &&
      (!Number.isInteger(data.focus_step_number) ||
        Number(data.focus_step_number) < 1)) ||
    (data.kind === "next_step" && (data.level !== 3 || !data.next_step))
  )
    throw new Error(
      "Unexpected hint response. Your work is preserved; please retry.",
    );
  return data as HintResult;
}

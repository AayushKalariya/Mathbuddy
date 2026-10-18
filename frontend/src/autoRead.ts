import { contextKey } from "./state";
import type { Stroke, Workspace } from "./state";

export const AUTO_READ_DELAY = 1500;
const fingerprints = new WeakMap<Stroke[], string>();
export function inkKey(strokes: Stroke[]): string {
  let key = fingerprints.get(strokes);
  if (key === undefined) {
    key = JSON.stringify(strokes);
    fingerprints.set(strokes, key);
  }
  return key;
}

export type ReadSnapshot = {
  id: string;
  revision: number;
  key: string;
  ink: string;
  strokes: Stroke[];
};
type Job = { id: string; due: number; manual: boolean; done: (() => void)[] };
type Options = {
  latest: () => Workspace;
  read: (
    snapshot: ReadSnapshot,
    signal: AbortSignal,
    cached?: string,
  ) => Promise<string | undefined>;
};

// One shared lane for automatic, Check-button, Hint-panel, and retry image reads.
// Writing invalidates replies, but does not abandon a running provider request
// and immediately start another one that could still consume provider quota.
export class AutoReader {
  private seen = new Map<string, { ink: string; drawing: boolean }>();
  private writing = new Set<string>();
  private jobs = new Map<string, Job>();
  private attempted = new Map<string, string>();
  private cache = new Map<string, { ink: string; math: string }>();
  private timer?: ReturnType<typeof setTimeout>;
  private active?: {
    snapshot: ReadSnapshot;
    controller: AbortController;
    job: Job;
  };
  private enabled = false;
  private disposed = false;

  constructor(private options: Options) {}

  begin(id: string) {
    this.writing.add(id);
    this.removeAutomatic(id);
    this.arm();
  }

  observe(state: Workspace, enabled: boolean) {
    if (this.disposed) return;
    this.enabled = enabled;
    const ids = new Set(state.steps.map((step) => step.id));
    for (const id of this.seen.keys()) {
      if (ids.has(id)) continue;
      this.seen.delete(id);
      this.writing.delete(id);
      this.cache.delete(id);
      this.attempted.delete(id);
      this.remove(id);
    }
    for (const step of state.steps) {
      const ink = inkKey(step.strokes),
        previous = this.seen.get(step.id);
      this.seen.set(step.id, { ink, drawing: !!step.drawing });
      if (step.drawing) this.writing.add(step.id);
      else this.writing.delete(step.id);

      if (step.mode === "handwriting" && step.math.trim() && !step.drawing)
        this.cache.set(step.id, { ink, math: step.math });
      if (step.mode !== "handwriting" || !step.strokes.length) {
        this.remove(step.id);
        continue;
      }
      if (step.drawing || step.math.trim()) {
        this.removeAutomatic(step.id);
        continue;
      }
      // Mounting/restoring a draft is not a new writing gesture.
      if (previous && (previous.ink !== ink || previous.drawing)) {
        const job = this.jobs.get(step.id);
        if (!job?.manual)
          this.jobs.set(step.id, {
            id: step.id,
            due: Date.now() + AUTO_READ_DELAY,
            manual: false,
            done: [],
          });
      }
    }
    this.arm();
  }

  readNow(id: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const snapshot = this.snapshot(id);
    if (
      snapshot &&
      this.active?.snapshot.key === snapshot.key &&
      this.active.snapshot.ink === snapshot.ink
    ) {
      return new Promise((resolve) => this.active!.job.done.push(resolve));
    }
    return new Promise((resolve) => {
      const old = this.jobs.get(id);
      this.jobs.set(id, {
        id,
        due: Date.now(),
        manual: true,
        done: [...(old?.done ?? []), resolve],
      });
      this.arm();
    });
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.active?.controller.abort();
    this.active?.job.done.forEach((done) => done());
    for (const id of this.jobs.keys()) this.remove(id);
    this.cache.clear();
    this.seen.clear();
  }

  private snapshot(id: string): ReadSnapshot | undefined {
    const state = this.options.latest(),
      index = state.steps.findIndex((step) => step.id === id);
    const step = state.steps[index];
    if (
      !step ||
      step.mode !== "handwriting" ||
      !step.strokes.length ||
      step.drawing ||
      this.writing.has(id) ||
      step.pending?.kind === "checking"
    )
      return;
    return {
      id,
      revision: step.revision,
      key: contextKey(state, index),
      ink: inkKey(step.strokes),
      strokes: step.strokes,
    };
  }

  private remove(id: string) {
    const job = this.jobs.get(id);
    this.jobs.delete(id);
    job?.done.forEach((done) => done());
  }

  private removeAutomatic(id: string) {
    if (!this.jobs.get(id)?.manual) this.remove(id);
  }

  private next() {
    let next: { job: Job; snapshot: ReadSnapshot; cached?: string } | undefined;
    for (const job of this.jobs.values()) {
      const step = this.options
        .latest()
        .steps.find((item) => item.id === job.id);
      if (!step || step.mode !== "handwriting" || !step.strokes.length) {
        this.remove(job.id);
        continue;
      }
      if (!job.manual && step.math.trim()) {
        this.remove(job.id);
        continue;
      }
      if (!job.manual && !this.enabled) continue;
      const snapshot = this.snapshot(job.id);
      if (!snapshot) continue;
      const cached =
        !job.manual && this.cache.get(job.id)?.ink === snapshot.ink
          ? this.cache.get(job.id)!.math
          : undefined;
      // Failures wait for changed ink or an explicit retry, not an automatic loop.
      if (
        !job.manual &&
        cached === undefined &&
        this.attempted.get(job.id) === snapshot.ink
      ) {
        this.remove(job.id);
        continue;
      }
      if (
        !next ||
        (job.manual && !next.job.manual) ||
        (job.manual === next.job.manual && job.due < next.job.due)
      )
        next = { job, snapshot, cached };
    }
    return next;
  }

  private arm() {
    clearTimeout(this.timer);
    if (this.disposed || this.active) return;
    const next = this.next();
    if (next)
      this.timer = setTimeout(
        () => void this.pump(),
        Math.max(0, next.job.due - Date.now()),
      );
  }

  private async pump() {
    if (this.disposed || this.active) return;
    const next = this.next();
    if (!next || next.job.due > Date.now()) {
      this.arm();
      return;
    }
    const { job, snapshot, cached } = next,
      controller = new AbortController();
    this.jobs.delete(job.id);
    this.active = { snapshot, controller, job };
    if (cached === undefined) this.attempted.set(job.id, snapshot.ink);
    try {
      const math = await this.options.read(snapshot, controller.signal, cached);
      const step = this.options
        .latest()
        .steps.find((item) => item.id === snapshot.id);
      if (
        !this.disposed &&
        math !== undefined &&
        step &&
        inkKey(step.strokes) === snapshot.ink &&
        !step.drawing
      ) {
        // An editable reading already on screen is authoritative over an older reply.
        this.cache.set(snapshot.id, {
          ink: snapshot.ink,
          math: step.math.trim() ? step.math : math,
        });
      }
    } catch {
      // The read callback reports API errors in the workspace. A failed callback
      // must still release this lane for the next edited box or manual retry.
    } finally {
      const state = this.options.latest(),
        index = state.steps.findIndex((step) => step.id === snapshot.id);
      if (
        index >= 0 &&
        contextKey(state, index) !== snapshot.key &&
        this.attempted.get(snapshot.id) === snapshot.ink
      )
        this.attempted.delete(snapshot.id);
      job.done.forEach((done) => done());
      this.active = undefined;
      this.arm();
    }
  }
}

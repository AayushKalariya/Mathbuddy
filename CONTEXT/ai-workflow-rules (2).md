# Math Buddy — Development Workflow

Updated: October 15, 2026.

## Approach

Build incrementally from the confirmed scope and document the actual state. The personal project uses a React/TypeScript interface, Python backend, free local recognition/checking, and the existing Windows/iPad devices.

Context is specification and progress evidence, not a license to invent completed implementation.

## Source of Requirements

- Direct user decisions are authoritative.
- [Project overview](<project-overview (2).md>) records confirmed product behavior.
- [Architecture](<architecture-context (1).md>) records the planned technical boundaries.
- [Code standards](<code-standards (2).md>) records engineering guidance and unselected details.
- [Progress](<progress-tracker (2).md>) records verified completion and the next work.
- [Current issues](current-issues.md) separates confirmed problems from experiments and unknowns.
- MATH_BUDDY_PLAN.md is the retained planning reference. The user explicitly excluded it from this context-replacement task; do not edit it under that authorization.

Where an earlier plan offered alternatives, follow the user's later explicit choice. Do not silently reinterpret an optional proposal as a mandatory feature.

## Confirmed Product Decisions

1. Separate writing areas beneath the uploaded question.
2. A short hint first, with correction available on request.
3. Check step button in the first usable version; automatic checks afterward.
4. Allow continuing after a flagged issue with a visible warning.
5. Retain Python for specialist local tools and the backend.
6. Aim for $0 and remain within a $10 total ceiling for any optional necessary spending.
7. Dedicated local Math Buddy application, used primarily on iPad through the Windows laptop.

## Scoping Rules

- Work on one verifiable feature or subsystem at a time.
- Start with recognition feasibility and typed checking before integrating them.
- Preserve the full curriculum objective while releasing tested topic groups.
- Keep uncertain recognition behavior distinct from missing mathematical support.
- Avoid unrelated cloud, account, collaboration, payment, or native distribution work.
- Do not add compulsory correction gating or automatic answer revelation.
- Do not spend money or add recurring paid dependencies without explicit user authorization.

## When To Split Work

Split work when it mixes independent risks:

- Model/dependency setup and mathematical rule development.
- Writing interaction and recognition integration.
- Mathematical checking and session persistence.
- Home Screen installation and core solving behavior.
- Multiple curriculum groups needing different representations.
- A defined feature and an unresolved product decision.

Integration still requires an end-to-end check once the individual boundaries work.

## Handling Missing Requirements

- Ask concise questions when an unanswered product choice materially affects implementation.
- Fill confirmed parts while awaiting answers.
- Record an unresolved requirement honestly in current-issues.md and progress-tracker (2).md.
- Do not fill it with a guessed user preference.
- Distinguish missing product requirements from engineering choices that can be proposed and verified.
- Missing numerical accuracy/latency targets are not achieved measurements; collect evidence first.
- Unsupported mathematics must produce an honest unresolved/unsupported outcome.

## Foundation and Dependencies

- Do not modify third-party library/model internals casually.
- Prefer application-level adapters and preprocessing.
- Document a concrete need before changing vendor code.
- Preserve a working environment while evaluating model alternatives.
- Use free local tools, isolated environments, compatible pins, and local asset paths.
- Keep downloaded models, personal work, and certificate keys outside ordinary commits.

No generated component library has been selected or installed in this project.

## Keeping Docs In Sync

Update the relevant files when requirements, architecture, storage, conventions, experiments, or implementation status change. Keep filenames and cross-references accurate.

Mark a task complete only after it was performed and meaningfully verified. Include the test/result basis where applicable. Do not copy historical completion claims from unrelated templates.

Do not alter the protected plan as an incidental documentation sync step under the current request. If later user authorization changes that constraint, record it clearly.

## Before Moving To The Next Unit

1. The unit meets its defined behavior.
2. Relevant checks actually ran and their results are recorded.
3. No architecture invariant was violated.
4. Open failures and limitations are recorded without hiding them.
5. Progress reflects actual completion.
6. Any necessary user decision has been answered.

## Implementation Sequence and Current Unit

Set up an isolated Python environment, run the free recognition candidate on real handwriting samples, and record expected/actual transcription and latency. No claim that the model is accurate enough should precede this experiment.

The typed checker and first writing workspace are implemented. The user requested focusing on upload, separate writing areas, and manual Check step, and selected Apple Pencil with finger scrolling for the first workspace. Reversible visual choices use a simple light layout. Broader recognition evaluation and actual iPad interaction remain pending. The external AI API/sidebar is explicitly deferred.

Keep handwriting-to-checker integration, session storage, and the writing interface as separately verified milestones. The protected plan remains unchanged.

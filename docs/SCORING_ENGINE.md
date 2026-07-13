# Scoring Engine

`features/assessments/scoring.ts` grades answers. Scoring definitions live on
each question (`question.scoring`) and are **kept separate from candidate-facing
rendering** — correct answers never reach the public DTO.

## Modes

- `none` — not scored.
- `exact` — full points iff the answer matches a correct value.
- `partial` — multiple-choice partial credit: `points/#correct` per correct
  selection, minus the same per incorrect selection **only if `allowNegative`**,
  clamped to `[0, max]`.
- `weighted` — like exact, scaled by `weight`.
- `per_option` — sum of chosen options' `points`.
- `manual` / `rubric` — awaits a human reviewer; contributes 0 and flags
  `requiresManualReview`.

`weight` scales the question's contribution; `competency` tags the dimension.

## Functions

- `questionMaxPoints(q)` — max attainable for one question.
- `assessmentMaxPoints(a)` — total attainable.
- `gradeQuestion(q, answer)` → `{ raw, max, requiresManualReview }`.
- `gradeAssessment(a, answers)` → `{ raw, max, percentage, passed, perQuestion,
  requiresManualReview }`. `passed` is `null` while manual review is pending or
  when no threshold is set.
- `estimateDuration(sections)` — heuristic reading/answer time.

## Guarantees

- Correct answers are exposed **only** through this layer, never in `publicDto`.
- No automatic employment rejection: results are for human review; `passed` is
  advisory.
- Negative scoring is opt-in per question (`allowNegative`).

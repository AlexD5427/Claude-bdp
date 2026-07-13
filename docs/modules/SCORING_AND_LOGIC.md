# SCORING_AND_LOGIC

## Scoring

`scoring/engine.ts` aggregates per-block scores (via plugin scorers) into
section and assessment totals.

Supported modes (per block `score.mode`):

- `none` — not scored (content, or ungraded questions).
- `exact` — all-or-nothing for choice questions.
- `partial` / `per_option` — sum of selected option scores (clamped ≥ 0).
- `weighted` — points × weight, aggregated with section weights.
- `manual` / `rubric` — flagged for human review (no auto grade).

Assessment-level policy (`scoringPolicy`) chooses `none | sum | weighted |
normalized`, an optional `passThreshold`, and result visibility. `normalized`
maps raw to 0–100; `weighted` combines section ratios by section weight.

**Guarantees**

- **Never auto-rejects.** `autoRejectBelowThreshold` is a literal `false`; the
  engine only reports a `passed: boolean | null` for information.
- **Never exposes answer keys** to the public portal (see the public DTO).
- Manual-review questions set `needsReview`, so a total is never presented as
  final when a human must grade part of it.

## Rubrics & scorecards

`domain/rules.ts` models rubrics: criteria with description, weight, rating
scale, behavioral anchors, reviewer guidance, and required-comment flags. Used
for structured interviews, cases, writing samples, leadership, customer service,
and technical reviews.

## Validation

`scoring/validateContent.ts` produces the builder's errors/warnings and gates
publishing. It checks: at least one section, non-empty sections, question
enunciados, choice questions have ≥2 options and a marked correct answer when
scored, duplicate question codes, and rolls up logic issues. It also estimates
question count, total points, and duration.

Field-level validators (`question-types/helpers.ts`): required, text length,
numeric min/max, and choice min/max selections. Additional constraints (decimal
precision, date ranges, file type/size/count, conditional/cross-field) are
expressed through `validation` and enforced by plugin validators.

## Logic (branching)

`logic/validate.ts` validates visual IF/AND/OR/NOT → THEN/ELSE rules
(`domain/rules.ts`). Conditions reference answers, scores, section scores, and
completion; actions show/hide/require/optional/skip/navigate/message/end.

Detected problems (es-MX messages):

- invalid references (condition/action → missing block/section)
- missing action targets
- unreachable sections (hidden with no rule that shows them)
- contradictory rules (show + hide the same target)
- circular navigation branches (DFS cycle detection)

## Randomization & timing

`randomizationPolicy` supports option/question/section/pool randomization with a
deterministic seed strategy (attempt/candidate/fixed). `timingPolicy` supports
untimed/total/per-section/per-question timers, availability windows, grace
periods, warning thresholds, save/resume, and accessibility extra-time.

## Tests

`scoring/scoring.test.ts` and `logic/logic.test.ts` cover scoring modes, the
no-auto-reject guarantee, manual review, validation rules, and all logic issue
categories.

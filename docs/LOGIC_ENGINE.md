# Logic & Branching Engine

`features/assessments/logic.ts` validates the rule set. Rules are
`when (ConditionGroup) → actions (RuleAction[])`.

## Conditions

`ConditionGroup { combinator: "and"|"or", not?, children }` nests
`Condition { source, operator, value }`. `source` is a `questionId` or a virtual
field (`score`, `section_score`, `completion`). Operators: `equals`,
`not_equals`, `contains`, `greater_than`, `less_than`, `is_answered`,
`is_empty`.

## Actions

`show/hide_question`, `show/skip/go_to_section`, `require_question`,
`make_optional`, `end_assessment`, `display_message`.

## Analysis

`analyzeRules(a)` returns classified `LogicIssue[]`:

- **error** — condition references a missing question; action targets a missing
  question/section; a circular `go_to_section` chain (detected via DFS on the
  jump graph).
- **warning** — rule with no conditions (always fires); empty message.

`hasBlockingLogicErrors(a)` is consulted by the publish dialog to block
publishing while errors exist.

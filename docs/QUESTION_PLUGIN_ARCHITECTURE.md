# Question Plugin Architecture

Question and content types are implemented as **plugins** in a registry
(`features/assessments/question-types/registry.tsx`) instead of giant
conditionals. The builder, preview, validation, scoring and import layers all
consult the registry.

## Plugin shape

```ts
interface QuestionPlugin {
  type: string;                 // stable id, e.g. "single_choice"
  label: string;                // Spanish label
  family: QuestionFamily;       // grouping in the builder sidebar
  icon: LucideIcon;
  description: string;
  capabilities: { options; scoring; correctAnswer; dragBased? };
  available: boolean;           // false → behind a feature flag
  createDefault(): AssessmentQuestion;
}
```

## Registering

```ts
register({
  type: "single_choice",
  label: "Opción única",
  family: "choice",
  icon: CircleDot,
  description: "Selecciona una opción.",
  available: true,
  capabilities: { options: true, scoring: true, correctAnswer: true },
  createDefault: () => base("single_choice", "choice", "Pregunta de opción única", { ... }),
});
```

## Graceful failure

`createQuestion(type)` and `QuestionRenderer` resolve unknown types to a clearly
labelled "unsupported" block rather than crashing. `getPlugin(type)` returns
`undefined` for unknown types and callers handle it.

## Families implemented

`content`, `text`, `numeric`, `datetime`, `choice`, `scale`, `matrix`,
`ordering`, `media`, `file`, `scenario`, `technical`, `banking`.

Common types (short/long text, essay, integer/decimal/percentage/currency,
date/time, single/multiple choice, dropdown, true-false, yes-no-na, Likert,
numeric/star/NPS scales, single-select matrix, ranking/drag-order, image
content, file upload, scenario case, code/SQL) are functional MVP renderers.

Every drag-based type (`ranking`, `drag_order`) ships a keyboard-accessible
up/down alternative in the renderer.

## Feature-flagged (advanced)

Banking simulations (`sim_credit_analysis`, `sim_risk`, `sim_cash`,
`sim_reconciliation`, `sim_customer_service`, `sim_operations`) are registered
with `available: env.enableAdvancedSimulations` (default `false`). They appear in
the library as disabled, clearly-labelled "beta" entries and insert a placeholder
block marked "sin configurar" — they are **not** presented as production-ready.
Enable with `VITE_ENABLE_ADVANCED_SIMULATIONS=true`.

## Adding a new type

1. `register({...})` in the registry with a `createDefault`.
2. Add a render branch in `components/QuestionRenderer.tsx` (with a keyboard
   alternative if drag-based).
3. If it needs bespoke config, extend `builder/QuestionProperties.tsx`
   (`TypeConfig`).
4. Scoring/validation usually need no changes — they read the generic
   `scoring`/`validation`/`options` fields.

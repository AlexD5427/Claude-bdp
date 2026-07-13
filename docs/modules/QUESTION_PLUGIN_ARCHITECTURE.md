# QUESTION_PLUGIN_ARCHITECTURE

Question types are implemented as **plugins in a registry**, not through a
single switch statement. Adding a type means registering a descriptor; existing
code is untouched.

## Plugin descriptor

`question-types/registry.ts` defines `QuestionPlugin`:

```ts
interface QuestionPlugin {
  type: string;
  label: string;
  category: "content" | "answer" | "media" | "logic" | "layout" | "scorecard" | "simulation";
  icon: string;                 // lucide icon name
  isQuestion: boolean;          // collects a candidate answer?
  status: "stable" | "beta" | "contract";
  createDefault(id): AssessmentBlock;
  Editor?: ComponentType<EditorProps>;      // optional; generic inspector otherwise
  Preview?: ComponentType<PreviewProps>;    // optional; generic renderer otherwise
  validate(block, value): ValidationResult;
  score(block, value): ScoreResult;
  a11y: { role: string; needsGroup: boolean };
  migrate?(block): AssessmentBlock;         // upgrade older-schema blocks
}
```

Blocks store type-specific settings in `config` and value rules in `validation`
(passthrough records interpreted by the plugin), so new types never require a
change to the block schema.

## Registration

`question-types/index.ts#bootstrapPlugins()` registers the stable content and
answer plugins unconditionally, and the advanced simulation contracts only when
their feature flags are on. Called once at app start.

## Graceful failure

`resolvePlugin(type)` always returns a plugin: the registered one, or a
**fallback** that renders a safe "tipo no compatible" placeholder and neither
validates nor scores. Authored blocks referencing a disabled/unknown type never
crash the builder or the candidate renderer.

## Stable MVP plugins

- **Content:** título, subtítulo, párrafo, texto enriquecido, instrucciones,
  aviso, separador, salto de página, imagen, video, audio, PDF/recurso.
- **Answers:** texto corto/largo; entero, decimal, porcentaje, moneda; fecha,
  hora, fecha/hora; opción única/múltiple, desplegable, multiselección,
  verdadero/falso, sí/no/N-A; Likert, escala numérica, estrellas; matriz,
  matriz Likert, tabla editable; ranking, ordenamiento, emparejamiento,
  categorización; pregunta con imagen, zona interactiva (base), escenario, caso
  multi-paso, interpretación de tabla/gráfico, respuesta con archivo (contrato).

## Feature-flagged contracts

`advancedContracts.ts` declares typed contracts for code/SQL, spreadsheet
simulation, interactive video, credit/risk analysis, cashier/reconciliation/
customer-service/operations simulations, and financial-statement analysis. They
are `status: "contract"`, registered only when their flag is on, accept any
value, and always require manual review. **No untrusted candidate code is ever
executed** — a real runtime must sandbox server-side.

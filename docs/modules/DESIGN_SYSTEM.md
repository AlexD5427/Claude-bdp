# DESIGN_SYSTEM

ProcessOS and AssessmentOS extend the existing **Liquid Glass** system rather
than replacing it. The base tokens (surfaces, borders, blur, ink, fills, mesh)
remain CSS custom properties in `src/index.css` with dual dark/light themes.

## Semantic tokens

`design-system/tokens.ts` adds a semantic layer:

- **Intents** — `neutral | info | success | warning | danger | accent`, each a
  chip style, a dot, and a text color. State is **never** communicated by color
  alone: every status pairs a tint with a text label (and often an icon).
- **Z-index scale** — kept below the app's existing modal (z-120) and keyboard
  glow (z-130): dropdown 40, drawer 90, dialog 110, toast 140.
- **Radii** and **motion durations** (fast/base/slow).

## Motion

`design-system/motion.ts` provides Framer Motion presets (fadeUp, list
container/item stagger, drawer slide, dialog pop) favoring transform + opacity
with short, productivity-focused timings. `respectMotion(reduce, variants)`
collapses animations to an instant fade when reduced motion is requested.

## Components

`design-system/liquid-glass/`:

- **StatusPill** — label + tint + dot; never color-only.
- **Chip** — filter/tag chip with optional remove.
- **Segmented** — accessible radio-group view/density switcher with a gliding
  active pill (shared layout animation).
- **GlassDrawer** — right-side drawer (Escape/backdrop close, body-scroll lock).
- **GlassDialog** — confirmation for destructive/irreversible actions.
- **toast** — global, portal-rendered, `aria-live` toast stack.
- **fields** — `Field`, `TextInput`, `TextArea`, `Select`, `NumberField`,
  `Switch` with consistent glass styling and focus rings.

These are used to build glass navigation, tables, filter panels, kanban, forms,
drawers, dialogs, the builder canvas, and the inspector so both modules feel
premium, consistent, and information-dense but readable.

## Module-scoped tokens (Documentación)

`src/features/documentacion/ui/documentacion.css` adds a **third** layer, scoped
to `.doc-console` so nothing leaks into the rest of the app: `--doc-surface`,
`--doc-surface-raised`, `--doc-surface-sunken`, `--doc-border`, `--doc-text*`,
the semantic set (`--doc-success|info|warning|extension|danger|offline`), focus
(`--doc-focus`), radii, shadows, and motion (`--doc-duration-fast|normal|slow`,
`--doc-ease-out-expo|quint`, `--doc-ease-in-out`).

Why a module layer instead of more Tailwind classes: the module used fixed
palette classes (`text-cyan-200`, `bg-amber-500/15`) tuned for dark glass, so the
same status was drawn differently in two screens, the light theme was left to
chance, and printed lists lost their meaning (amber at 15 % on white is white).
Each theme — dark, light, `prefers-contrast: more`,
`prefers-reduced-transparency`, and **print** — picks its own values, and
components ask for the token.

Institutional semantics are preserved: green complete, cyan new/initial, peach
observed/in progress, **amber extension** (previously sharing the observation
colour), red critical/terminated. The domain intent sent by the backend is
unchanged; only its rendering is.

Companion sheet `documentacion-motion.css` holds the keyframes: skeleton wave,
value-changed flash, indeterminate save bar, connection pulse (transient states
only), hover marquee for text that does not fit, and the
`::view-transition-group` timings. All of them collapse under
`prefers-reduced-motion` and under the app's `reduce-motion` class.

## Accessibility of the visuals

Readable forms and dense content take priority over transparency. The system
honors `prefers-reduced-motion`, `prefers-reduced-transparency`, and the app's
manual "Reducir movimiento" switch. See ACCESSIBILITY.md.

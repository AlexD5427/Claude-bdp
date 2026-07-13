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

## Accessibility of the visuals

Readable forms and dense content take priority over transparency. The system
honors `prefers-reduced-motion`, `prefers-reduced-transparency`, and the app's
manual "Reducir movimiento" switch. See ACCESSIBILITY.md.

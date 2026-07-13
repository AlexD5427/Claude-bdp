# Liquid Glass Design System

The new modules extend the existing Liquid Glass identity rather than replacing
it. All visual tokens are CSS custom properties (see `src/index.css`), so the UI
flips cleanly between the dark "Midnight" and light "Daylight" themes.

## Tokens

Glass surfaces use `.glass` / `.glass-heavy`; fills use `fill-soft` /
`fill-softer`; text uses `text-ink` / `text-ink-soft` / `text-ink-faint`;
hairlines use `--hairline`. Never hard-code raw colours, blur or shadow values
in components — use the tokens.

## Shared components (`src/design-system`)

- `Drawer` — right-anchored glass drawer with focus trap, focus restoration,
  Escape-to-close, scroll lock; registers as a heavy overlay.
- `Segmented` — spring "liquid pill" tab switcher, arrow-key navigable.
- `StatusChip` — status as **dot + text** (never colour alone).
- `ActionMenu` — portal dropdown "⋯" menu (escapes table/row overflow).
- `Toasts` — ARIA-live notification host.
- `motion.ts` — shared spring/tween presets so every surface feels coherent.

## Motion

Framer Motion drives page/tab/drawer/dialog/card/kanban/toast transitions using
compositor-friendly `transform`/`opacity`. Reduced motion is honoured globally
(the `prefers-reduced-motion` query and the manual "Reducir movimiento" switch
zero out durations). Heavy full-screen surfaces pause the animated WebGL
background (see `SECURITY.md`/`ACCESSIBILITY.md` and the performance notes).

## Readability

Dense forms and tables prioritise legibility over transparency; the print
stylesheet flattens glass to clean bordered cards.

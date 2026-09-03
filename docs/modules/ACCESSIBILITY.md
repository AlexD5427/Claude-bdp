# ACCESSIBILITY

Target: **WCAG 2.2 AA**. ProcessOS and AssessmentOS were built with the
following provisions.

## Keyboard

- All interactive controls are reachable and operable by keyboard with visible
  focus rings (`focus-visible:ring`).
- **Drag-and-drop always has a keyboard alternative:**
  - Process Kanban cards: a grab control (`aria-pressed`); when grabbed, ← / →
    move between columns and Enter/Escape drop. Status changes are announced in
    an `aria-live` region.
  - Builder blocks: a grab handle with ↑ / ↓ to reorder.
- Dialogs and drawers trap Escape and lock body scroll; the confirm button
  receives initial focus.

## Semantics

- Tables use `<caption>` (sr-only), `<th scope="col">`, and sortable headers with
  descriptive `aria-label`s.
- Choice questions render as `fieldset` + `radiogroup`/`group` with proper
  labels; the generic renderer sets appropriate roles.
- Menus use `role="menu"` / `role="menuitem"`; the view switcher is a
  `radiogroup`.
- The toast stack is a `role="region"` with `aria-live="polite"`.
- Form fields pair `<label>` with inputs; required fields expose an accessible
  required marker.

## Perception

- **No color-only status.** Every status/publication indicator shows a text
  label; intents add an optional dot.
- Respects `prefers-reduced-motion`, `prefers-reduced-transparency`, and the
  app's manual "Reducir movimiento" switch (animations collapse to instant).
- Glass surfaces keep sufficient text contrast; readable dense content is
  prioritized over transparency, and print/reduced-transparency paths flatten
  glass.
- Layout is responsive and remains usable at 200% zoom (fluid widths, wrapping
  toolbars, horizontal scroll only where unavoidable such as wide tables/kanban).

## Screen readers

- Accessible labels on icon-only buttons throughout.
- Live regions for kanban moves and toasts.
- Block-level `accessibility.ariaLabel` / `longDescription` fields let authors
  provide screen-reader text per question.

## Documentación console

- **Navigation**: grouped `nav` with `aria-current="page"` plus a left bar on the
  active item (never colour alone). Section counters travel as
  `aria-describedby`, so a tab's accessible name stays stable when the number
  changes. Section changes are announced in an `aria-live` region.
- **Tables**: sticky headers, `caption` (sr-only), `th scope="col"`, and an
  explicit per-row action button — row click is a mouse affordance, the keyboard
  needs a control. Loading shows `aria-busy` skeletons with the final column
  count so nothing shifts when data lands.
- **Drawer**: real focus trap (Tab cycles inside), focus restored on close,
  cannot be dismissed while a write is in flight, and asks for confirmation when
  there are unsaved changes.
- **Tabs** (expediente): `tablist` pattern with ← / → navigation,
  `aria-controls`/`aria-labelledby`, and roving `tabIndex`.
- **Errors** use `role="alert"` and carry the backend's code and hint; everything
  else uses `role="status"`.
- **Motion** honours `prefers-reduced-motion` *and* the app switch; View
  Transitions are feature-detected and skipped when motion is reduced.
- **Touch**: 44 × 44 px minimum targets under `pointer: coarse`, safe-area
  padding on the drawer and the toast stack.
- **Print**: glass flattens, chrome disappears, truncated names expand, and rows
  do not break across pages.

## Measured contrast (Documentación)

Contrast is no longer estimated by eye. `src/design-system/contraste.ts` is a pure
WCAG relative-luminance implementation (19 unit tests), and
`qa/sonda-contraste.mjs` walks seven screens in **both themes** in a real browser,
computes the effective colour of **every text node** against its resolved
background — including alpha compositing — and fails if any node misses AA
(4.5:1, or 3:1 for large text). Around 2 800 nodes per run.

Two fixes came out of it:

- **Solid fills got their own per-theme foreground token.** With a fixed dark ink,
  the primary button in the light theme measured **3.53:1**. `--doc-solido-fg` and
  `--doc-solido-peligro-fg` are theme-scoped now.
- **The faint ink was too faint.** `--ink-faint` went from 0.5 to 0.62 alpha in the
  dark theme, and the light theme's `--ink-soft` / `--ink-faint` became opaque
  (`#33506f`, `#4f6a86`) instead of transparent blacks that composited differently
  on every surface.

The probe measures the theme *loaded from storage*, one page per theme. Forcing the
`light` class without changing React state would paint a light module over a dark
background and measure an intermediate grey that exists on no real screen.

## Overlay surfaces (Documentación)

`HojaCentral` is the module's modal surface. Its invariants are asserted in jsdom
(`__tests__/superficies.test.tsx`) and in a real browser
(`qa/sonda-modal-expediente.mjs`):

- `role="dialog"` + `aria-modal="true"` with the person's name as accessible name.
- Real focus trap; Tab cycles inside and does not reach the background.
- Scroll lock via `lib/scrollLock` (reference-counted), released even when two
  surfaces overlap.
- **Initial focus goes to `[data-foco-inicial]`,** checked *before* the generic
  focusable selectors. `querySelector` with a comma-separated list returns the
  first node in *document order*, so the header's close button used to win and the
  first typed characters were lost.
- **Focus restoration checks its target.** If the captured element is
  `document.body` — which happens when the sheet mounts already open, since nobody
  held focus — or is no longer connected, focus is left alone. Calling
  `body.focus()` *clears* the active focus: the branch meant to preserve the user's
  place was the one destroying it.
- Confirmations stack **above** the sheet (`Z.dialog` = 165 vs 120). They used to
  render underneath at `z-index: 110`, which made "Cerrar y descartar" visible and
  unclickable.
- Never `window.confirm`: it blocks the thread, cannot be styled, and can be
  silenced by the browser.

## Light mode

Configuración › Esta pantalla › *Modo ligero* (auto / always / never) removes the
two properties that force the browser to recompose layers: `backdrop-filter` blurs
and projected box-shadows. Measured effect on a 120-step scroll run with the CPU
throttled 4×: **1 046 ms → 590 ms**. In `auto` it turns itself on from device
signals (`hardwareConcurrency`, `deviceMemory`, `saveData`, `update: slow`) or from
a real dropped-frame measurement taken during the first interaction — never at
idle, since a backgrounded tab drops to 1 fps on purpose.

## Follow-ups

- Full audit with an automated checker (axe) and manual SR testing across the
  builder is recommended before candidate-facing release.

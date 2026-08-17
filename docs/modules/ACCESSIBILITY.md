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

## Follow-ups

- Full audit with an automated checker (axe) and manual SR testing across the
  builder is recommended before candidate-facing release.

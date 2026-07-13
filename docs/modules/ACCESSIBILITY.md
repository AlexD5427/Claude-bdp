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

## Follow-ups

- Full audit with an automated checker (axe) and manual SR testing across the
  builder is recommended before candidate-facing release.

# Accessibility (target WCAG 2.2 AA)

- **Keyboard**: the Segmented control is arrow-navigable; the Drawer traps focus
  and restores it on close; the Kanban offers a keyboard "Mover a…" menu so no
  action is drag-only; the builder moves/duplicates/deletes blocks via buttons
  and supports Ctrl/Cmd+Z undo/redo; drag-based question types (ranking,
  drag-order) include up/down keyboard controls in the renderer.
- **Dialogs**: `role="dialog"`/`alertdialog`, `aria-modal`, labelled, Escape to
  close, backdrop click to dismiss.
- **Status**: communicated by dot **and** text, never colour alone.
- **Live regions**: toasts render in an `aria-live="polite"` region.
- **Labels**: every form control wires `id`/`htmlFor`; errors use `role="alert"`
  and `aria-invalid`.
- **Tables**: semantic `table`/`thead`/`tbody`, sortable headers as buttons.
- **Reduced motion**: honoured globally via `prefers-reduced-motion` and the
  manual switch.
- **Reduced transparency / high contrast**: the preview offers a high-contrast
  mode; dense text prioritises legibility over glass.
- **Zoom / responsive**: layouts reflow; text scales to 200%.
- **Screen-reader outline**: the preview includes a structural outline mode.

Accessibility accommodations on assessments (extra time) are configurable and
recorded in the accessibility policy.

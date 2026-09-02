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

## Catálogo v3 (2026-09)

### Contraste: dos redes, porque una no basta

`__tests__/contraste.test.ts` mide los **tokens** contra el fondo de referencia
que el propio CSS declara (`--doc-medicion-fondo`), en los dos temas, leyendo el
CSS real y recorriendo la cascada como la recorre el navegador. Falla por debajo
de 4,5:1 (texto normal) o 3:1 (texto grande) con el número medido en el mensaje.

`qa/sonda-contraste.mjs` mide el **texto que se pinta**, en Chromium, resolviendo
el color y el fondo efectivos con `getComputedStyle` y componiendo las capas
translúcidas. **1396 textos, 0 incidencias.**

La segunda encontró lo que la primera no podía ver:

| Qué | Dónde | Antes | Después |
| --- | --- | --- | --- |
| `text-ink-faint` / `text-ink-soft` (escala **global**) | 77 usos en 5 componentes del módulo | 4,26:1 | tokens del módulo |
| Color del botón primario escrito a mano (`#04121f`) | «Guardar», «Continuar», «Nuevo expediente» | **3,53:1** en tema claro | `--doc-sobre-info`, por tema |

> **Lección.** Un token correcto no garantiza texto legible. El color se escapa
> por dos vías: una clase de utilidad que apunta a otra escala, y un hexadecimal
> escrito en el componente «porque se veía bien». Las dos existían aquí.

### Teclado

- **El asistente de alta responde a Escape** (con confirmación si hay datos
  escritos). No lo hacía: solo se cerraba con la X o pulsando fuera. Lo detectó la
  sonda de contraste, que se quedaba atascada intentándolo.
  El manejador vive en un `useRef` y el efecto no depende de él: si dependiera, se
  remontaría en cada pulsación del formulario, que es el patrón que en este módulo
  ya causó que en las observaciones «entrara una sola letra».
- **El selector auxiliar** (Agencia, Gerencia, Cargo) navega con flechas,
  `Inicio`/`Fin`, `Página arriba`/`abajo` —imprescindible con trescientos
  cargos—, `Enter` para elegir y `Escape` para cerrar. `Escape` **detiene la
  propagación**: cerrar el desplegable no cierra el asistente con el formulario a
  medio llenar.
- `role="option"` y el `id` van en el **botón**, no en el `<li>`: es lo que exige
  ARIA (la opción es lo seleccionable) y lo que hace que `aria-activedescendant`
  apunte al elemento que de verdad responde al clic.
- **El contador de hojas** se ajusta con flechas arriba/abajo y admite escritura
  directa. No es un `type="number"`: el nativo cambia el valor cuando la rueda del
  ratón pasa por encima, y en una lista de veinticinco requisitos que se recorre
  desplazándose eso altera en silencio un dato ya anotado.

### El color nunca comunica solo

- La forma de entrega lleva **palabra y valor**: «Papel: Sí\*», «Digital: Sí»,
  «Papel: N/A». El asterisco es el estado `CONDICIONAL` del catálogo, con su
  leyenda al pie de la sección — una sola vez, no repetida nueve veces.
- El contador de hojas lleva su icono, su etiqueta accesible («Hojas del documento
  físico: REJAP») y la palabra «hojas» junto al número.
- Los títulos de subsección son **texto**, con su recuento de documentos al lado.

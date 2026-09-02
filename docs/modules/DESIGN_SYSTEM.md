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

## Tokens del módulo de Documentación (2026-09)

### El módulo tiene su propia escala de tinta

Antes `--doc-text-muted` y `--doc-text-faint` heredaban `--ink-soft` y
`--ink-faint` de `src/index.css`. Parecía coherencia con el resto de la
aplicación, y era el origen de un fallo de accesibilidad: la escala global está
pensada para fondo oscuro y en tema claro solo cambia de signo, no de contraste.
`--ink-faint` sobre blanco da **2,99:1**.

```css
/* .doc-console — tema oscuro */
--doc-text-muted: rgba(226, 232, 240, 0.86);
--doc-text-faint: rgba(226, 232, 240, 0.66);
--doc-medicion-fondo: #0b1a2e;

/* .light .doc-console — azules institucionales OPACOS, no el azul al 50 % */
--doc-text-muted: #33506f;
--doc-text-faint: #4a637f;
--doc-medicion-fondo: #ffffff;
```

`--doc-medicion-fondo` no se pinta: existe para que la prueba automática sepa
contra qué medir y no tenga que adivinar el color del lienzo.

> La escala global **sigue intacta**: la usa el resto de la aplicación. Lo que
> cambia es que el módulo declara la suya, y hay una prueba que impide volver a
> escribir `var(--ink-*)` en esos dos tokens.

### Tinta SOBRE un color de estado

Cuando `--doc-info` o `--doc-danger` se usan como **fondo** (botones sólidos,
marcas de selección), el color del texto encima **depende del tema**, porque el
fondo depende del tema:

```css
/* oscuro: los estados son claros → tinta oscura encima */
--doc-sobre-info: #04121f;
--doc-sobre-danger: #1b0710;

/* claro: los estados son oscuros → blanco encima */
--doc-sobre-info: #ffffff;
--doc-sobre-danger: #ffffff;
```

Estaba escrito a mano como `#04121f` en cinco sitios. En tema oscuro sobraba; en
tema claro daba **3,53:1** en «Guardar», «Continuar» y «Nuevo expediente».

### Forma de presentación

`ETIQUETA_PRESENTACION` traduce el vocabulario del backend a lo que el área
escribe en su tabla: `SI` → «Sí», `NO` → «N/A», `CONDICIONAL` → «Sí\*». La
leyenda del asterisco vive en `LEYENDA_PRESENTACION_CONDICIONAL`, en el dominio y
no en un JSX, para que el asistente, el visor y el informe digan lo mismo.

### Animación de listas: CSS, no framer-motion

```css
.doc-fila-entra {
  animation: doc-fila-entra 240ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--doc-fila-retardo, 0ms);
}
.doc-fila-diferida { content-visibility: auto; contain-intrinsic-size: auto 120px; }
```

Un `motion.li` por fila crea un resorte por fila: con los veinticinco requisitos
de un Tipo 2 son veinticinco motores de física con su suscripción y su
`requestAnimationFrame`, para un resultado visual idéntico a doce líneas de CSS.
framer-motion se reserva para lo puntual y coreografiado —la hoja del asistente,
el panel del expediente—, donde su capacidad de interrumpir y reanudar sí aporta.

### Logotipo de carga

`documentacion-motion.css` anima solo `transform`, `opacity` y `filter`. El color
«dinámico» es un `hue-rotate` sobre un degradado **ya pintado**: el ojo ve color en
movimiento, el compositor solo ve una transformación de una capa que no cambia.
Interpolar `stop-color` en cada fotograma repintaría el degradado entero, y esta
animación corre justo mientras el navegador descarga y evalúa el resto del módulo.

La curva es la de las hojas de iOS (`cubic-bezier(0.32, 0.72, 0, 1)`), y los
retardos son **negativos**: la pila nace ya en movimiento en lugar de empezar
junta y separarse, que se lee como un salto.

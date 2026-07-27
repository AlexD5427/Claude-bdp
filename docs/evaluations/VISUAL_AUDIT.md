# Auditoría visual

> Hechos leídos en el código, no impresiones. Cada afirmación indica su archivo.

## 1 · El sistema de diseño existente

El proyecto tiene un sistema propio llamado **Liquid Glass**, definido en
`src/index.css` con *CSS custom properties* y consumido por Tailwind mediante
valores arbitrarios (`bg-[color:var(--glass-bg)]`, `ring-[color:var(--hairline)]`).

### Tokens (`src/index.css`)

| Grupo | Variables | Notas |
| --- | --- | --- |
| Superficies | `--glass-bg`, `--glass-bg-heavy`, `--glass-border`, `--glass-border-heavy`, `--glass-ring`, `--glass-sheen` | Dos densidades: normal y «heavy» (dock, diálogos). |
| Sombras | `--glass-shadow`, `--glass-shadow-heavy`, `--glass-inset-top` | Sombras de baja intensidad + luz interior superior. |
| Tinta | `--ink`, `--ink-soft`, `--ink-faint`, `--ink-shadow` | Tres niveles de jerarquía de texto. |
| Rellenos | `--fill-1`, `--fill-2`, `--hairline` | Píldoras internas, marcadores de posición y líneas de 1 px. |
| Fondo | `--app-base`, `--app-wash-1/2`, `--mesh-base`, `--mesh-1..4`, `--grain-opacity` | Malla de gradientes animada. |
| Puntero | `--spotlight` | Foco de luz que sigue al cursor. |

### Temas

Dos temas completos, conmutados con la clase `.light` / `.dark` en `<html>`
(`tailwind.config.js` usa `darkMode: "class"`):

- **Midnight** (oscuro, por omisión): `--ink: #f8fafc`, `--glass-bg:
  rgba(255,255,255,0.08)` aprox., `--hairline: rgba(255,255,255,0.1)`.
- **Daylight** (claro): `--ink: #0a2747`, `--glass-bg: rgba(255,255,255,0.62)`,
  `--hairline: rgba(8,47,95,0.12)`.

Ambos declaran **el mismo conjunto de variables**, así que un componente que use
tokens funciona en los dos sin código condicional. Además hay un bloque
`@media print` que aplana el vidrio a tarjetas blancas con borde.

### Utilidades de componente (`@layer components`)

| Clase | Qué hace |
| --- | --- |
| `.glass` | Superficie base: `backdrop-blur-3xl`, borde, sombra, anillo y un reflejo especular en `::before`. |
| `.glass-heavy` | `blur(40px) saturate(180%)` y sombra más marcada. Dock, diálogos, menús. |
| `.liquid-streak` | Destello diagonal que recorre la superficie al pasar el cursor (`::after`). |
| `.magnetic` | `transform-gpu` + `ease-spring`: eleva 4 px y escala 1.02 en hover, 0.95 al pulsar. |
| `.fill-soft`, `.fill-softer` | Rellenos internos con `--fill-1` / `--fill-2`. |
| `.text-ink`, `.text-ink-soft`, `.text-ink-faint` | Jerarquía de texto. |
| `.reduce-motion *` | Anula animaciones y transiciones (0,001 ms). Se activa con la clase global o con `prefers-reduced-motion`. |

### Paleta corporativa (`tailwind.config.js`)

`corp.deep #004a8f`, `corp.core #005baa`, `corp.cyan #00b0d8`, `corp.ink #0a2747`.
El degradado de acción primaria del sistema es
`from-[#00b0d8] to-[#005baa]`.

### Tipografía, radios y elevaciones

- Fuente: `Inter` con la pila del sistema como respaldo.
- Radios: el sistema usa `rounded-xl` (12 px), `rounded-2xl` (16 px) y
  `rounded-3xl` (24 px); `design-system/tokens.ts` los expone como `RADIUS.sm/md/lg`.
- Sombras: `shadow-glass`, `shadow-glass-lg`, `shadow-glass-inner`,
  `shadow-glow-cyan`.
- Curva característica: `ease-spring` =
  `cubic-bezier(0.175, 0.885, 0.32, 1.275)`.

### Capa semántica (`src/design-system/tokens.ts`)

`INTENT` define seis intenciones (`neutral`, `info`, `success`, `warning`,
`danger`, `accent`), cada una con `chip`, `dot` y `text`. Su comentario ya
establece la regla que el módulo respeta: **el estado nunca se comunica solo con
color**; cada intención se acompaña de etiqueta y, en los componentes, de icono.

`Z` define la escala de capas: `sticky 10`, `dropdown 40`, `drawer 90`,
`dialog 110`, `toast 140`. `DURATION` define `fast 0.16`, `base 0.28`,
`slow 0.4` segundos.

### Primitivas compartidas (`src/design-system/liquid-glass/`)

`StatusPill`, `Chip`, `Segmented`, `GlassDialog`, `GlassDrawer`, `toast`,
`fields` (`Field`, `TextInput`, `TextArea`, `Select`, `NumberField`, `Switch`).
Más `GlassCard`, `Modal`, `LoadingState`, `ErrorState`, `EmptyState` en
`src/components/`.

**Ninguna de estas primitivas se duplicó.** El módulo de Evaluaciones las usa tal
cual; los componentes nuevos son composiciones específicas del dominio
(índice de preguntas, editor de opciones, panel de revisión…).

## 2 · Módulos de referencia inspeccionados

| Módulo | Patrón que se reutilizó |
| --- | --- |
| **Procesos** (`features/processes/ui/`) | Estructura barra de herramientas → panel de filtros → vistas conmutables → menú de fila; `Segmented` para las vistas; `StatusPill` para estados; reordenamiento por teclado en el Kanban. |
| **Perfiles de Cargo** (`components/perfiles/`) | Formulario a pantalla completa por secciones, autoguardado de borrador con recuperación (`useFormDraft`) y visor separado del editor. Es el módulo con mejor experiencia de formulario del sistema y de él viene el patrón de recuperación de borrador. |
| **Comparador** (`modules/NuevoComparador.tsx`) | Encabezados fijos, secciones contraíbles y ayudante de navegación cuando hay mucho contenido: el origen del índice de preguntas. |
| **Registro de Postulantes** (`modules/RegistrationForm.tsx`) | Confirmación de salida con cambios sin guardar y aviso de borrador recuperado. |
| **Documentación** (`components/doc/`) | Anillo de avance y agrupación de hallazgos por estado: el origen del panel de revisión. |

## 3 · Animación existente

- `framer-motion` es el motor del sistema completo: `listContainer` /
  `listItem` con `staggerChildren: 0.03`, `fadeUp`, `drawerRight`, `dialogPop` y
  `spring` (`stiffness 240`, `damping 24`) en `design-system/motion.ts`.
- `Segmented` usa `layoutId` para deslizar la píldora activa.
- `respectMotion(reduce, variants)` colapsa cualquier variante a un simple
  desvanecimiento cuando hay que reducir el movimiento.
- **GSAP no está instalado.**
- `three` está instalado y se usa **una sola vez**: `components/ThreeBackground.tsx`
  (un único quad con shader de flujo líquido, carga diferida, pausa con la pestaña
  oculta y respaldo CSS `MeshBackground`).

## 4 · Limitaciones del layout general

`src/App.tsx` impone el marco en el que vive el módulo:

- Ancho máximo `max-w-[1640px]` con `px-4 sm:px-6 lg:px-8`.
- El *padding* depende de la posición del dock (`MAIN_PAD`): el dock puede estar
  arriba, abajo, a la izquierda o a la derecha, así que **el módulo no puede
  asumir un borde libre**.
- No hay router: el módulo se monta y desmonta por estado. Por eso la guardia de
  salida del constructor no puede interceptar una navegación de router: intercepta
  el `onBack` propio y usa `beforeunload` para la recarga.
- Los módulos «con resumen propio» (comparador, procesos, evaluaciones) ocultan la
  fila genérica de KPIs.
- Cada módulo se envuelve en `ErrorBoundary` y entra con una animación con clave.

## 5 · Problemas visuales reales encontrados en el módulo (antes)

1. **Barra de tres paneles fija** (`16rem_1fr_20rem`) que ocultaba los paneles
   laterales por completo en `< lg`, dejando el constructor sin inspector ni
   biblioteca en tableta.
2. **Altura fija** `h-[calc(100vh-8rem)]` que no tenía en cuenta que el dock puede
   estar arriba o abajo, produciendo recorte.
3. **Doce botones de icono seguidos** en la barra superior (deshacer, rehacer y
   cuatro variantes de vista previa) sin agrupación ni jerarquía; el botón
   «Publicar» quedaba visualmente al mismo nivel que «Guardar».
4. **`magnetic` en tarjetas del listado**: `-translate-y-1 scale-[1.02]` en hover
   sobre una tarjeta que también es el objetivo del clic, con el menú de acciones
   moviéndose bajo el cursor.
5. **Estado sin jerarquía**: la barra inferior mezclaba preguntas, puntos,
   duración, errores y advertencias en una línea de texto pequeño.
6. **Sin indicación de qué pregunta está incompleta**: había un contador de
   errores, pero ninguna forma de saber cuál.
7. **Todos los editores montados a la vez**: el lienzo renderizaba todas las
   preguntas con su `BlockRenderer`, así que editar una opción re-renderizaba el
   documento completo.
8. **`aria-label` duplicados**: cuatro botones «Vista previa» con el mismo nombre
   accesible.
9. **Filtros inalcanzables**: `AssessmentFilters` existía en el estado y ningún
   componente lo escribía.
10. **Sin origen de datos visible**: nada indicaba si los datos eran de
    demostración o reales.

Cómo se resolvió cada punto: `UX_ARCHITECTURE.md` y `VISUAL_QA.md`.

## 6 · Cómo se extiende el lenguaje visual (sin romperlo)

| Decisión | Detalle |
| --- | --- |
| **Sin tokens nuevos** | Los componentes nuevos usan exclusivamente los tokens y utilidades existentes. No se añadió ninguna variable CSS ni ningún color hexadecimal suelto, salvo el degradado corporativo `#00b0d8 → #005baa` que ya era el estándar de acción primaria. |
| **Translucidez moderada** | `.glass` para contenedores de primer nivel (encabezado, paneles, tarjetas) y `fill-soft` / `fill-softer` para superficies internas. No se anidan tres niveles de vidrio: el texto siempre queda sobre un relleno opaco o casi opaco. |
| **Profundidad por capas, no por brillo** | La jerarquía se construye con `glass` → `fill-soft` → `fill-softer` y anillos de 1 px, no con sombras fuertes ni resplandores. |
| **Foco siempre visible** | Todos los controles nuevos llevan `focus-visible:ring-2 focus-visible:ring-cyan-300`. |
| **Estado con etiqueta e icono** | `StatusPill` y `SaveStatus` siempre muestran texto; el color acompaña, no informa. |
| **Sin efecto magnético en acciones administrativas** | Los botones nuevos responden con `brightness`, borde y superficie, no desplazándose. «Guardar» y «Publicar» no se mueven bajo el cursor. |
| **Jerarquía de la acción principal** | «Publicar» es el único botón con degradado verde-esmeralda; «Guardar borrador» es una superficie neutra. Cuando la publicación está bloqueada, «Publicar» pasa a un gris apagado y expone la razón mediante `aria-describedby`. |

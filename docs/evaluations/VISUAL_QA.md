# QA visual

## Limitación real de este entorno (léela primero)

**No se capturaron capturas de pantalla.** No es una omisión: es una limitación
comprobada del entorno donde se implementó el cambio.

| Intento | Resultado |
| --- | --- |
| Usar Playwright del repositorio | No está instalado. Se retiró a propósito en el commit `15f1d28` («chore: drop playwright dev dependency (was only used for local screenshots)»). |
| Instalar Playwright y su navegador | `npx playwright install chromium` → `Error: Failed to download Chromium 131.0.6778.33, caused by Download failure, code=1`. |
| Instalar el navegador vía npm (`@playwright/browser-chromium`) | El paquete descarga el binario en su `postinstall` y falla igual. |
| Instalar `chromium` con APT | El paquete de Ubuntu 24.04 es un redirector a snap y el entorno no tiene `snapd`: `Command '/usr/bin/chromium-browser' requires the chromium snap to be installed`. |

Conforme a la instrucción recibida (*«Si no existe una herramienta de navegador: no
inventes capturas, no afirmes haberlas tomado»*), **no se afirma haber tomado
ninguna**. En su lugar se entrega:

1. **Ciclos de QA reales a nivel de DOM**, ejecutados con Testing Library sobre
   jsdom, con aserciones que fallan si la interfaz se rompe (documentados abajo).
2. **`scripts/visual-qa.mjs`**: guion reproducible que genera la matriz completa de
   capturas (9 pantallas × 2 temas × 3 viewports = 54 imágenes) en una máquina con
   navegador, sin añadir Playwright como dependencia del proyecto.
3. Esta bitácora, con los hallazgos reales de cada ciclo y su corrección.

### Qué SÍ verifican los ciclos en jsdom

Estructura del DOM, textos visibles, nombres accesibles, roles ARIA, estados
`aria-pressed` / `aria-expanded` / `aria-current`, orden de tabulación, presencia
de foco, ausencia de errores de consola, comportamiento en ambos temas (clase de
`<html>`), comportamiento con `prefers-reduced-motion`, y el número de nodos
montados con 150 preguntas.

### Qué NO verifican (y por eso hay que ejecutar el guion)

Contraste real de color, desbordamientos, solapamientos, saltos de layout,
legibilidad del `backdrop-filter`, rendimiento de la animación y aspecto del blur.

### Cómo producir las capturas

```bash
npm ci
npm run build
npm run preview -- --port 4173 &
npx --yes playwright@1.49.0 install chromium
npm i --no-save playwright@1.49.0
npm run visual-qa            # → docs/evaluations/screenshots/*.png
```

El guion falla con código 1 si detecta cualquier error de consola en cualquier
combinación de tema y viewport, así que también sirve como verificación
automatizada.

---

## Ciclo 1 · Estructura, capacidades y layout

**Alcance:** listado (tarjetas, tabla, resumen), constructor (los cuatro pasos),
vista previa, diálogos.
**Viewports evaluados:** clases de Tailwind revisadas para `< 768`, `768–1023` y
`≥ 1024`; comportamiento comprobado con `useMediaQuery` simulado.
**Temas:** ambos (revisión de tokens; ningún color hexadecimal suelto).

### Hallazgos

| # | Hallazgo | Severidad | Corrección |
| --- | --- | --- | --- |
| 1.1 | Cuadrícula fija `lg:grid-cols-[16rem_1fr_20rem]` con `hidden lg:block`: en tableta desaparecían la biblioteca y el inspector, dejando el constructor sin acceso a las propiedades. | Alta | Cuadrícula adaptable con índice contraíble; el panel de propiedades se oculta en pantallas pequeñas pero su contenido sigue accesible en «Configuración avanzada». |
| 1.2 | Altura fija `h-[calc(100vh-8rem)]`, que ignora que el dock puede estar arriba, abajo, izquierda o derecha (`MAIN_PAD` en `App.tsx`). | Alta | Se eliminó la altura fija; la barra superior es `sticky top-2` y los paneles usan `max-h-[70vh]`. |
| 1.3 | Doce botones de icono seguidos en la barra superior (incluidas cuatro variantes de «Vista previa»), sin agrupación ni jerarquía. | Media | Barra reorganizada: identidad a la izquierda; estado, deshacer/rehacer, vista previa, revisar, guardar y publicar a la derecha, separados por divisores. Un único botón de vista previa; el viewport se elige dentro del panel. |
| 1.4 | Cuatro botones con el mismo nombre accesible «Vista previa». | Alta (a11y) | Un solo control; los del panel se llaman «Escritorio», «Tableta» y «Móvil» con `aria-pressed`. |
| 1.5 | `.magnetic` en las tarjetas del listado: la tarjeta se elevaba y escalaba en hover mientras el menú de acciones se movía bajo el cursor. | Media | Se retiró `magnetic` de las tarjetas; se conserva `liquid-streak` (destello sin desplazamiento) y el botón de menú queda fijo. |
| 1.6 | Listas de claves de tipo codificadas a mano en `BlockRenderer`, `BuilderInspector` y `validateContent`; los tipos ausentes de esas listas caían en un `<input type="text">` engañoso. | Alta | Capacidades declarativas en el registro; el control `pending` muestra un aviso explícito de que el editor está pendiente y que la calificación será humana. |
| 1.7 | `q_likert` es un tipo de opciones con «exactamente una correcta» pero se creaba **sin opciones**: recién insertado ya era impublicable. | Media | Se le dieron cinco opciones por omisión (escala de acuerdo de 1 a 5). |
| 1.8 | El listado no mostraba de dónde venían los datos. | Alta | Píldora permanente de origen («Datos de demostración (local)» / «Google Apps Script») más un aviso explicativo en modo demostración. |
| 1.9 | `AssessmentFilters` existía en el estado y ningún componente lo escribía: los filtros eran inalcanzables. | Alta | `AssessmentFilterPanel` con estado, publicación y categoría, contador y «Limpiar filtros». |
| 1.10 | Sin ordenamiento en la interfaz. | Media | Selector de orden (reciente, antigua, nombre, más preguntas). |

**Cambios de esta iteración:** reescritura de la cáscara del constructor, nuevos
`BuilderHeader` / `BuilderNav` / `QuestionNavigator` / `QuestionEditor` /
`QuestionProperties`, capacidades en el registro, `AssessmentFilterPanel`,
indicador de origen y ordenamiento.

---

## Ciclo 2 · Accesibilidad, estados y corrección de datos

**Alcance:** los mismos que el ciclo 1, ahora con la suite de interacción
(`AssessmentBuilder.test.tsx`, 31 pruebas; `EvaluacionesModule.test.tsx`, 15).
**Temas:** se renderiza el constructor con `document.documentElement.className`
en `light` y en `dark`, comprobando ausencia de errores de consola en ambos.

### Hallazgos

| # | Hallazgo | Severidad | Corrección |
| --- | --- | --- | --- |
| 2.1 | Dos botones con el nombre accesible «Revisión» (la acción del encabezado y el paso de la navegación). Lo detectó una prueba: `Found multiple elements with the role "button" and name /Revisión/`. | Alta (a11y) | La acción del encabezado pasó a llamarse **«Revisar»**; el paso sigue siendo «Revisión». |
| 2.2 | El menú de fila se llamaba solo «Más acciones»: con varias tarjetas había N botones con el mismo nombre. | Media (a11y) | `aria-label="Más acciones: <nombre de la evaluación>"`, y lo mismo en «Mover arriba/abajo: <pregunta>» y «Eliminar opción: <texto>». |
| 2.3 | `getAdminAssessment` devolvía también las preguntas dadas de baja lógica, así que una pregunta eliminada reaparecía en el editor al recargar. Lo detectó la prueba `normaliza las posiciones y desactiva lo que ya no llega`. | Alta (datos) | El bundle administrativo filtra `active`; las filas inactivas se conservan en la hoja solo para que los intentos históricos resuelvan sus referencias. |
| 2.4 | `evalAnswerToRow_` guardaba el valor como `{ "v": … }` y el lector esperaba otra forma: el valor de las respuestas abiertas no se recuperaba. | Alta (datos) | Se persiste como `{ "value": … }` y se lee con `evalUnwrapAnswerValue_`, que además tolera datos antiguos. |
| 2.5 | `evalPublicQuestion_` tenía un `sort(() => 0)` sin efecto, residuo de una versión anterior. | Baja | Eliminado, con un comentario que explica que el orden ya lo garantiza quien construye el DTO. |
| 2.6 | El estado de guardado no se anunciaba a lectores de pantalla. | Media (a11y) | `role="status"` + `aria-live="polite"` en `SaveStatus`. |
| 2.7 | «Guardar borrador» quedaba habilitado sin cambios pendientes. | Baja | Se deshabilita en `idle` y en `saved`, y el estado explica por qué. |
| 2.8 | El botón «Publicar» bloqueado no explicaba la razón a un lector de pantalla. | Media (a11y) | Cambia de degradado y expone el motivo con `aria-describedby`. |
| 2.9 | Los `<option>` construidos a mano en tres archivos podían omitir un campo nuevo del esquema (ocurrió al añadir `matchingKey`). | Media | `makeOption()` centraliza la creación y aplica el esquema. |

**Cambios de esta iteración:** renombrado de la acción de revisión, nombres
accesibles con contexto, `aria-live`, filtrado de filas inactivas en el bundle
administrativo, corrección del viaje de ida y vuelta del valor de respuesta,
`makeOption`.

---

## Ciclo 3 · Volumen, rendimiento y verificación final

**Alcance:** evaluación de 150 preguntas, flujo completo de los cuatro pasos,
publicación con rechazo del servidor, recuperación de borrador,
`prefers-reduced-motion`.

### Hallazgos

| # | Hallazgo | Severidad | Corrección |
| --- | --- | --- | --- |
| 3.1 | Con 150 preguntas el diseño anterior montaba 150 `BlockRenderer`. | Alta (rendimiento) | Solo se monta el editor de la pregunta activa. Prueba: con 150 preguntas el índice las lista y **no hay ningún editor montado** hasta seleccionar una. |
| 3.2 | Los filtros del índice ocupaban espacio incluso con tres preguntas. | Baja | Aparecen a partir de ocho preguntas. |
| 3.3 | La revisión no distinguía los hallazgos del servidor de los locales, así que un rechazo del servidor parecía un error de la interfaz. | Media | Sección propia «El servidor rechazó la publicación» con el código de error del servidor. |
| 3.4 | La duración se sobrescribía con la estimación calculada en cada guardado: era imposible fijar una duración propia. | Alta (funcional) | La duración es un campo del usuario; la estimación se ofrece como sugerencia con un botón «Usar la estimación». |
| 3.5 | El resumen de revisión mostraba `0` para duración y nota mínima ausentes. | Media | Muestra «Sin límite de tiempo» y «Sin nota mínima». |
| 3.6 | Nada advertía de que una evaluación con preguntas abiertas deja la nota pendiente. | Media | Aviso en el panel de revisión y en el de propiedades, más una nota permanente en el paso de configuración. |
| 3.7 | Con movimiento reducido no se había comprobado el flujo completo. | Media | Prueba dedicada que navega los pasos con `prefers-reduced-motion: reduce` y exige cero errores de consola. |

**Resultado del ciclo 3:** los siete hallazgos quedaron corregidos y las 262
pruebas de la suite pasan. No aparecieron hallazgos nuevos de severidad alta, así
que no se requirió un cuarto ciclo de estructura.

---

## Matriz de verificación

| Pantalla | Claro | Oscuro | Reduced motion | Escritorio | Tableta | Móvil |
| --- | --- | --- | --- | --- | --- | --- |
| Listado (tarjetas) | DOM ✔ | DOM ✔ | DOM ✔ | Clases ✔ | Clases ✔ | Clases ✔ |
| Listado (tabla) | DOM ✔ | — | — | Clases ✔ | Clases ✔ | Scroll horizontal ✔ |
| Listado vacío | DOM ✔ | — | — | Clases ✔ | Clases ✔ | Clases ✔ |
| Listado con error | DOM ✔ | — | — | Clases ✔ | Clases ✔ | Clases ✔ |
| Panel de filtros | DOM ✔ | — | — | Clases ✔ | Clases ✔ | Clases ✔ |
| Constructor · general | DOM ✔ | DOM ✔ | DOM ✔ | Clases ✔ | Clases ✔ | Clases ✔ |
| Constructor · preguntas | DOM ✔ | DOM ✔ | DOM ✔ | Clases ✔ | Clases ✔ | Clases ✔ |
| Constructor · configuración | DOM ✔ | DOM ✔ | DOM ✔ | Clases ✔ | Clases ✔ | Clases ✔ |
| Constructor · revisión | DOM ✔ | DOM ✔ | DOM ✔ | Clases ✔ | Clases ✔ | Clases ✔ |
| Evaluación extensa (150) | DOM ✔ | — | — | Clases ✔ | Clases ✔ | Clases ✔ |
| Errores de validación | DOM ✔ | — | — | Clases ✔ | Clases ✔ | Clases ✔ |
| Vista previa (candidato) | DOM ✔ | — | — | Ancho ✔ | Ancho ✔ | Ancho ✔ |
| Vista previa (administrativa) | DOM ✔ | — | — | Ancho ✔ | Ancho ✔ | Ancho ✔ |
| Diálogo de publicación | DOM ✔ | — | — | Clases ✔ | Clases ✔ | Clases ✔ |
| Panel de resultados | DOM ✔ | — | — | Clases ✔ | Clases ✔ | Clases ✔ |

**DOM ✔** = comprobado con aserciones automatizadas.
**Clases ✔ / Ancho ✔** = revisión de las clases responsive frente a los patrones ya
usados por Procesos y el Comparador; **pendiente de confirmación en píxeles**.

## Pendiente (requiere navegador)

1. Contraste medido de `--ink-faint` sobre `fill-softer` en tema claro (el par de
   menor contraste del módulo, usado en textos secundarios del índice).
2. Legibilidad del `backdrop-filter` del encabezado `sticky` sobre el fondo
   Three.js en movimiento.
3. Desbordamiento del índice con enunciados muy largos sin espacios.
4. Saltos de layout (CLS) al cambiar de paso.
5. Fotogramas por segundo de la entrada en cascada con 30 tarjetas en un equipo
   modesto.
6. Comportamiento real a 414 px de ancho con el dock anclado a la izquierda.

Todo eso lo produce `npm run visual-qa` en una sola ejecución.

## Evidencia disponible hoy

| Evidencia | Dónde |
| --- | --- |
| 31 pruebas de interacción del constructor | `src/features/assessments/builder/AssessmentBuilder.test.tsx` |
| 15 pruebas del listado | `src/features/assessments/ui/EvaluacionesModule.test.tsx` |
| Ausencia de errores de consola en 4 escenarios | mismas suites (`consoleErrors` se asevera vacío) |
| Render en tema claro y oscuro | `renderiza en tema claro y en tema oscuro sin errores` |
| Movimiento reducido | `funciona con prefers-reduced-motion activo` |
| 150 preguntas sin montar editores | `abre una evaluación extensa sin montar todos los editores` |
| Guion de capturas | `scripts/visual-qa.mjs` |
| Verificación estática | `npm run check` |

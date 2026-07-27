# Sistema de movimiento

## 1 · Librería elegida: framer-motion (la que ya usa el sistema)

**No se instaló ninguna librería de animación nueva.**

`framer-motion@11.11.17` ya es el motor de animación de toda la aplicación: dock,
comparador, diálogos, cajones, toasts, listas y transiciones de módulo. Sus
presets viven en `src/design-system/motion.ts` y son los que el módulo consume.

### Por qué no GSAP

| Criterio | framer-motion (instalado) | GSAP (habría que instalar) |
| --- | --- | --- |
| ¿Ya está en el bundle? | Sí, en todos los módulos. | No. |
| Animación de layout (reordenar) | `layout` y `layoutId`, declarativo y con FLIP automático. | Habría que calcular posiciones a mano. |
| Entrada/salida de componentes | `AnimatePresence`. | Requiere orquestación manual con el ciclo de vida de React. |
| Orquestación en cascada | `staggerChildren`. | `timeline` con `stagger`. |
| Física de resorte | `type: "spring"`, ya calibrado en el sistema. | `gsap.to` con easing personalizado. |
| Limpieza | Ligada al desmontaje del componente. | Hay que matar las timelines a mano. |
| Coste | 0 kB adicionales. | ~70 kB adicionales para resolver lo mismo. |

Las necesidades reales del módulo son: entrada en cascada de listas, transición
entre pasos, reordenamiento visual, expansión y contracción de paneles,
retroalimentación de guardado, apertura de diálogos y transición de la vista
previa. `framer-motion` cubre las siete. Añadir un segundo motor de animación para
el mismo problema significaría dos APIs, dos modelos mentales y peso duplicado, y
la regla de la tarea es explícita: *«No agregues simultáneamente múltiples
librerías de animación para resolver lo mismo»*.

**Decisión reversible:** si en el futuro apareciera una necesidad que
`framer-motion` no cubra (por ejemplo, animación ligada al desplazamiento con
control fino de progreso), GSAP se podría incorporar aislado en un módulo propio.
Hoy no hay ninguna.

### Por qué no un canvas Three.js dentro del módulo

`three@0.170.0` está instalado y se usa **una sola vez**, en
`components/ThreeBackground.tsx`: un único quad con un shader de flujo líquido que
sirve de fondo global de la aplicación. Ese fondo ya está detrás del módulo de
Evaluaciones y ya aporta la profundidad del Liquid Glass.

Un segundo canvas dentro del módulo:

- competiría por GPU con el fondo global (que además se pausa al ocultar la
  pestaña y respeta `prefers-reduced-motion`);
- añadiría trabajo de limpieza (geometrías, materiales, texturas, listeners,
  `ResizeObserver`) en una pantalla donde el usuario pasa mucho tiempo escribiendo;
- no aportaría información: un decorado abstracto no ayuda a redactar una
  pregunta.

Los usos que el encargo consideraba aceptables (fondo ambiental del encabezado,
elemento decorativo en el estado vacío) **ya los cubre el fondo global**. La
profundidad extra dentro del módulo se logra con CSS: capas `glass` →
`fill-soft` → `fill-softer`, anillos de 1 px, degradados suaves y el destello
`liquid-streak` existente.

**Coste medido de la decisión:** cero. `three` sigue en su propio chunk diferido
(`three.module-*.js`, 688 kB / 177 kB comprimido), cargado solo cuando el motor
gráfico 3D está activo en Configuración; el módulo de Evaluaciones no lo importa.

## 2 · Duraciones y curvas

Todo viene de `design-system/tokens.ts` y `design-system/motion.ts`. **No hay
duraciones arbitrarias repartidas por los componentes.**

| Categoría | Duración | Dónde se usa |
| --- | --- | --- |
| Instantáneo | `0.001 s` | Cualquier transición cuando hay movimiento reducido. |
| Corto — `DURATION.fast` | `0.16 s` | Salida de elementos de lista, cierre de diálogos, hover de botones. |
| Medio — `DURATION.base` | `0.28 s` | Entrada de listas y paneles (`easeOut`), apertura del menú de acciones (`0.15 s`). |
| Largo — `DURATION.slow` | `0.4 s` | Reservado para transiciones de contexto. |
| Resorte | `stiffness 240`, `damping 24` | Cajón lateral, diálogos, píldora del `Segmented` (`320/30`). |
| Transición de progreso | `duration-500` (CSS) | Barra de progreso de configuración: cambia de valor, no de posición. |
| Cascada | `staggerChildren: 0.03`, `delayChildren: 0.02` | Entrada de tarjetas y filas de tabla. |

Curvas: `easeOut` = `cubic-bezier(0.22, 1, 0.36, 1)` para entradas;
`ease-spring` = `cubic-bezier(0.175, 0.885, 0.32, 1.275)` para interacciones
«magnéticas» del resto del sistema.

## 3 · Casos de uso en el módulo

| Interacción | Técnica | Propósito funcional |
| --- | --- | --- |
| Entrada del listado (tarjetas, filas) | `listContainer` + `listItem` | Da orden de lectura y evita que 30 elementos aparezcan de golpe. |
| Cambio de vista (tarjetas / tabla / resumen) | `layoutId` en `Segmented` | Continuidad: la píldora se desliza al destino, no salta. |
| Menú de acciones | `opacity` + `y: -6` + `scale: 0.98` en 0,15 s | Sugiere que el menú «sale» del botón que lo abrió. |
| Diálogos (publicar, archivar, salir) | `dialogPop` (resorte) | Enfoca la atención en la decisión. |
| Panel de resultados | `drawerRight` (resorte) | Indica que es un panel lateral, no un cambio de página. |
| Estado de guardado | Cambio de píldora + spinner | Retroalimentación crítica: debe ser inmediata, sin animación de entrada que la retrase. |
| Barra de progreso | `transition-[width] duration-500` | Muestra el avance sin llamar la atención. |
| Reordenar preguntas | Sin animación de layout | Ver §5. |
| Chevron de «Configuración avanzada» | `transition-transform` | Indica el sentido del despliegue. |
| Hover de botones | `transition-colors` / `transition-[filter,box-shadow]` | Retroalimentación sin desplazamiento. |

## 4 · Cuándo NO se usa movimiento

Esta lista es tan importante como la anterior:

- **En «Guardar borrador» y «Publicar».** No se mueven bajo el cursor. Un botón que
  se desplaza al acercarse es más difícil de pulsar, y estas son las dos acciones
  administrativas más importantes de la pantalla. Responden con brillo, borde y
  superficie.
- **En el cambio de paso.** Cambiar de «Preguntas» a «Revisión» no anima el
  contenido: el usuario ya sabe que cambió de contexto porque pulsó el paso, y una
  transición de 300 ms retrasa la lectura de los errores que fue a buscar.
- **En el reordenamiento de preguntas.** El diseño anterior usaba `layout` en cada
  bloque del lienzo; ahora el índice muestra filas ligeras y el reordenamiento es
  un cambio de posición inmediato. Animar decenas de filas al mover una es trabajo
  de layout costoso sin beneficio informativo.
- **En el indicador de guardado.** Su valor es la inmediatez.
- **En los mensajes de error junto a un campo.** Aparecen al instante.
- **En el estado de carga.** `LoadingState` usa un spinner del sistema, no una
  secuencia de entrada.

## 5 · Movimiento reducido

Tres capas, todas ya existentes en el proyecto:

1. **CSS global** (`src/index.css`): `@media (prefers-reduced-motion: reduce)` y la
   clase `.reduce-motion` (conmutable desde Configuración) fuerzan
   `animation-duration: 0.001ms` y `transition-duration: 0.001ms` en `*`, `::before`
   y `::after`. Esto neutraliza todas las transiciones CSS del módulo sin código
   adicional.
2. **Hook** `usePrefersReducedMotion()` (`shared/hooks.ts`) y
   `respectMotion(reduce, variants)` (`design-system/motion.ts`), que colapsa
   cualquier variante de framer-motion a un desvanecimiento de 0,001 s.
3. **Fondo Three.js global**: ya se desactiva con movimiento reducido y cae al
   respaldo CSS `MeshBackground`.

Con movimiento reducido activo **no se pierde ninguna función**: la
retroalimentación sigue llegando por color, texto, icono y cambio de estado
inmediato. Hay una prueba dedicada (`funciona con prefers-reduced-motion activo`)
que navega el constructor con la preferencia puesta y comprueba que no hay errores
de consola.

## 6 · Rendimiento y limpieza

| Regla | Cómo se cumple |
| --- | --- |
| Animar solo `transform` y `opacity` | Todos los presets del sistema usan `x`, `y`, `scale` y `opacity`. La única excepción es la barra de progreso (`width`), que cambia de valor con baja frecuencia. |
| No animar fuera de pantalla | `framer-motion` no anima componentes desmontados; el índice no anima sus filas. |
| Sin timelines huérfanas | No hay timelines imperativas: toda la animación está ligada al ciclo de vida de un componente. |
| Sin listeners sin limpiar | Los `useEffect` del módulo devuelven su función de limpieza (menú de acciones, `beforeunload`, temporizadores del borrador y del autoguardado, `Escape` de los diálogos). |
| Sin canvas | El módulo no crea ninguno. |
| Sin `layout thrashing` | No se lee `getBoundingClientRect` en bucle; la única lectura es la del menú de fila para posicionarse, en `useLayoutEffect` y una sola vez. |
| Navegación rápida sin estados inconsistentes | Los pasos no dependen de que termine una animación; `AnimatePresence` solo envuelve diálogos y toasts, no el contenido principal. Es la misma razón por la que `App.tsx` documenta que no usa `AnimatePresence mode="wait"` para los módulos. |
| Sin fugas medibles | La prueba «no deja errores de consola en el flujo completo» recorre los cuatro pasos y comprueba que `console.error` no recibió nada; los montajes y desmontajes de tema se hacen con `unmount()` explícito. |

## 7 · Botones reactivos

| Botón | Reposo | Hover | Foco | Pulsado | Ocupado |
| --- | --- | --- | --- | --- | --- |
| Nueva evaluación | Degradado corporativo | `brightness-110` | Anillo cian | `scale-[0.98]` | — |
| Guardar borrador | Superficie neutra + anillo | `fill-soft` | Anillo cian | — | Deshabilitado + «Guardando…» |
| Revisar | Superficie neutra + contador de errores | `fill-soft` | Anillo cian | — | — |
| Publicar (habilitado) | Degradado esmeralda | `brightness-110` | Anillo cian | — | «Publicando…» en el diálogo |
| Publicar (bloqueado) | Degradado gris + `opacity-80` | — | Anillo cian | — | Explica la razón con `aria-describedby` |
| Iconos (deshacer, rehacer, vista previa) | `fill-softer` + anillo | `fill-soft` | Anillo cian | — | `opacity-40` al deshabilitarse |
| Archivar / eliminar | Superficie neutra | Fondo rosa + texto blanco | Anillo cian | — | — |

No hay efectos magnéticos fuertes, ni sonidos, ni acciones críticas escondidas
detrás de una animación.

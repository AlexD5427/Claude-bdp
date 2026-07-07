# Mejoras integrales · Comparador, Postulantes, Documentación, Login y correcciones

> **Resumen de una línea.** Este cambio reescribe la experiencia de tres módulos clave (Comparador, Postulantes y Login), añade metadatos de competencias con un buscador visual, moderniza la navegación asistida por teclado, y corrige tres bugs de fondo (dropdown de perfil recortado, pantalla en blanco al cambiar de módulo, y datos desactualizados) incorporando refresco pasivo continuo.

Este documento explica **qué** cambió, **por qué** y **cómo verificarlo**. Está escrito para que lo entienda tanto alguien nuevo en el proyecto como quien ya conoce el código.

---

## 1. Background

### 1.1 Para quien recién llega (puede saltarse si ya conoce el proyecto)

La aplicación es un **sistema de reclutamiento y selección** para el Banco de Desarrollo Productivo (BDP). Es una SPA construida con **React 18 + TypeScript + Vite**, estilizada con **Tailwind CSS** bajo una filosofía visual llamada **Liquid Glass** (superficies de vidrio esmerilado con reflejos especulares, refracción y profundidad). Las animaciones usan **framer-motion** y hay un fondo 3D en **Three.js** (un shader de flujo "líquido" a pantalla completa).

Los datos viven en una **hoja de Google Sheets** y se exponen mediante un **Google Apps Script** (`docs/backend/Code.gs`) que responde un JSON con:

```
{ candidatos, competencias, arquetipos_disc, auxiliares, perfiles, espejo_base, espejo_ultimo }
```

El front consume ese endpoint desde `TalentDataContext`, que además **cachea** el último payload en `localStorage` (patrón *stale-while-revalidate*: pinta primero desde caché y refresca en segundo plano).

> **Glosario rápido**
> - **Nota CAP**: Coeficiente de Adecuación al Puesto. Es la métrica principal para rankear postulantes.
> - **Comparador**: cuadrícula que pone a varios postulantes lado a lado, ordenados por CAP.
> - **Dock**: el menú flotante de módulos, estilo iOS, anclable a cualquier borde.
> - **`competencias`**: catálogo de competencias que viene de la hoja "Auxiliar".

### 1.2 Contexto directo de este cambio

Antes de este PR:

- El **buscador de competencias** del formulario de registro trataba cada fila del catálogo como un **nombre plano**. La hoja ahora guarda filas enriquecidas con el formato `Competencia,Bajo,Medio,Alto,"Descripción"`, y nada las interpretaba.
- El **chip de datos personales** del Comparador tenía un avatar de iniciales, un nombre que se **desplazaba** (marquee) cuando era largo, y las notas de riesgo se veían con poco contraste.
- La **navegación asistida por teclado** resaltaba tres campos con outlines de colores (dorado/verde/rojo).
- El **login** era funcional pero plano: sólo el fondo de malla CSS y una rejilla de perfiles.
- Había tres bugs conocidos: el **dropdown del perfil** se recortaba, la app a veces quedaba **en blanco al cambiar de módulo**, y los **datos no siempre estaban frescos** (sólo se cargaban una vez al arrancar).

---

## 2. Intuition

La idea central de cada bloque, con ejemplos concretos.

### 2.1 Competencias con "niveles de cargo" y descripción

La hoja pasó de guardar `Liderazgo` a guardar:

```
Liderazgo,0,1,1,"Capacidad de dirigir, motivar y guiar equipos"
```

Leemos eso como *"la competencia **Liderazgo** aplica a cargos de nivel Medio y Alto (1,1) pero no Bajo (0), y esto es lo que significa"*. En pantalla lo traducimos a tres recuadros — **Bajo · Medio · Alto** — que se **rellenan** si el valor es `1`:

```
Liderazgo            Cargo  [Bajo] [▮Medio] [▮Alto]   ⊕
```

Y a un botón **"?"** que abre un pop-up con la descripción (sin comillas). El "?" no es alcanzable con Tab (sólo con mouse), tal como se pidió.

### 2.2 El glow giratorio de teclado

En vez de tres outlines de colores, dibujamos **un anillo azul brillante que gira** alrededor del campo que se está editando. El truco de rendimiento: en lugar de pintar sobre cada `<input>` (que no admite pseudo-elementos de forma fiable y se recorta con `overflow:hidden`), colocamos **capas flotantes** en `document.body`, posicionadas con `transform` sobre el rectángulo del campo. El giro es un único gradiente cónico animado vía la propiedad registrada `@property --kbd-angle`, y el resplandor sale de un `drop-shadow` que sigue el arco brillante (sin teñir el centro del campo). Los campos *siguiente* y *anterior* usan el mismo efecto al ~50 %.

### 2.3 El chip del Comparador, más humano

Quitamos el círculo de iniciales para dar protagonismo al **nombre**, que ahora **envuelve por palabra** (nunca corta letras ni se desplaza). Abajo a la derecha va un **distintivo de puesto por Nota CAP**: **oro con trofeo** para el 1.º y **plata** del 2.º en adelante, con el % de CAP incrustado. Y el perfil interno se muestra como **PERSONAL BDP** (dorado) o, si es externo, **CANDIDATO NUEVO / Postulante Externo** (cian).

### 2.4 El dock que se aparta

Cuando bajas al Comparador y aparecen los **mini-chips** de nombres pegados arriba, un dock superior estorbaría. Así que, en ese instante, el dock **se desliza al borde izquierdo** con una animación, y el contenido se corre a la derecha para que el dock vertical no tape la columna de etiquetas.

---

## 3. Code — recorrido por los cambios

### 3.1 Nuevo: metadatos de competencias

**`src/lib/competencyMeta.ts`** parsea el formato nuevo de forma defensiva (un nombre plano legacy sigue funcionando):

```ts
export function parseCompetencyMeta(raw: unknown): CompetencyMeta {
  const str = String(raw ?? "").trim();
  // La descripción va entre comillas y puede contener comas: se extrae primero.
  let description: string | null = null;
  let head = str;
  const firstQuote = str.indexOf('"');
  if (firstQuote >= 0) {
    const lastQuote = str.lastIndexOf('"');
    if (lastQuote > firstQuote) {
      description = str.slice(firstQuote + 1, lastQuote).trim() || null;
      head = str.slice(0, firstQuote);
    }
  }
  const parts = head.split(",").map((p) => p.trim());
  const name = stripEmoji(parts[0] ?? "");
  const bajo = toFlag(parts[1]); const medio = toFlag(parts[2]); const alto = toFlag(parts[3]);
  // …
}
```

`buildCompetencyCatalog` construye un `Map` por nombre en minúsculas, y `lookupCompetency` resuelve la metadata desde un nombre (así el Comparador, que sólo guarda el nombre por candidato, puede recuperar niveles y descripción).

- **`src/components/CompetencyLevelBoxes.tsx`**: los recuadros `Cargo: Bajo · Medio · Alto`.
- **`src/components/CompetencyInfoButton.tsx`**: el botón "?" (`tabIndex={-1}`, sólo mouse) + su modal en portal (mismo patrón que `DiscInfoModal`).

Se integran en:
- **`CompetencyAutocomplete.tsx`** — busca por nombre pero muestra los recuadros en cada sugerencia.
- **`CompetencyConfigCard.tsx`** — el chip generado tras seleccionar: recuadros + botón "?".
- **`NuevoComparador.tsx`** — el "?" junto a cada competencia en la sección Competencias (vía un nuevo prop `info` en `RowFragment`).

### 3.2 Opciones "Riesgo" e integridad

En **`constants.ts`** se unificó la escala en `NIVEL_RIESGO_ETIQUETADO_OPTIONS = ["N/A","Riesgo Bajo","Riesgo Medio","Riesgo Alto"]`, usada por Integridad, Robo y Mentira en `RegistrationForm.tsx` (las tres con color semántico). En el Comparador, la fila de Integridad pasó a usar `riskTone` (riesgo bajo = bueno = verde).

### 3.3 Contraste de niveles

**`lib/levels.ts`** — `TONE_CLASS` pasó de tintes translúcidos a **gradientes sólidos con texto blanco y sombra**, para que "Riesgo Bajo/Medio/Alto" se lea nítido sobre el vidrio.

### 3.4 Navegación asistida por teclado

**`hooks/useAssistedKeyboardGlow.ts`** se reescribió para gestionar **overlays flotantes** (current/next/prev), reposicionarlos en `focusin`/`keyup`/`scroll`/`resize` (con rAF) y **auto-centrar** el campo enfocado con `scrollIntoView({ block: "center" })`. El CSS del glow (anillo cónico giratorio + `drop-shadow`) vive en `index.css` bajo `.kbd-glow`.

### 3.5 Chip del Comparador

**`CandidateProfileCard.tsx`** se reescribió: sin avatar, nombre con la utilidad `.wrap-words` (envuelve por palabra), tira **PERSONAL BDP / CANDIDATO NUEVO**, y un `CapRankBadge` (oro trofeo #1 / plata resto con % CAP). Las columnas se ensancharon en `NuevoComparador.tsx`.

### 3.6 El dock que se transforma

Un store minúsculo, **`lib/dockOverrideStore.ts`**, expone una posición temporal. El Comparador la fija a `"left"` cuando el strip está pegado (`stuck`) y el dock del usuario está arriba/abajo:

```ts
const moveDock = stuck && tab === "comparativa" &&
  (config.dockPosition === "top" || config.dockPosition === "bottom");
useEffect(() => {
  setDockOverride(moveDock ? "left" : null);
  return () => setDockOverride(null);
}, [moveDock]);
```

**`FloatingDock.tsx`** usa `position = override ?? dockPosition` y envuelve el `nav` en `<AnimatePresence>` con `key` por posición (cross-fade direccional). El contenido del Comparador se corre con `.cmp-shifted.is-shifted` (padding-left en ≥1024px).

### 3.7 KPIs fuera del Comparador + botón de refresco

En **`App.tsx`** el `KpiBar` ya no se renderiza para `comparador`. Se añadió **`RefreshButton.tsx`** (flotante, reposiciona según el dock) y el arreglo de bugs (ver §3.9).

### 3.8 Login reimaginado

**`login/LoginScreen.tsx`** ahora monta `ThreeBackground` (3D) + `LoginAurora` (cónico giratorio + orbes + rejilla parallax), una **consola de vidrio**, tiles con **tilt 3D** hacia el cursor (`useSpring`) y un **halo cónico giratorio** alrededor del avatar enfocado. Todo respeta `reduceMotion`/`prefers-reduced-motion`.

### 3.9 Correcciones de bugs

- **Dropdown de perfil recortado** → `PortalDropdown.tsx` ganó `matchAnchorWidth` y `align`. Antes forzaba el ancho del ancla (un botón diminuto) sobre un panel de 288 px, recortándolo. `DockProfileChip` ahora usa `matchAnchorWidth={false}` con alineación al borde y *clamp* al viewport.

- **Pantalla en blanco al cambiar de módulo** → `App.tsx` dejó de usar `<AnimatePresence mode="wait">`. Ese handshake "sale-y-luego-entra" podía **atascarse**: si la animación de salida de un módulo con animaciones infinitas/de layout no reportaba su fin, el módulo entrante nunca se montaba. Ahora un `motion.section` con `key` intercambia de inmediato y sólo anima la entrada. El `ErrorBoundary` también se re-monta por `key`, así que un módulo que falla se recupera al navegar.

- **Datos desactualizados** → `TalentDataContext.tsx` añadió **polling pasivo** (intervalo configurable) + refresco al recuperar foco/visibilidad/red. `RefreshButton` fuerza una recarga manual. Todo se puede mostrar/ocultar y ajustar desde **Configuración → Integraciones → Sincronización de datos** (`configStore.ts`: `autoRefresh`, `autoRefreshSeconds`, `showRefreshButton`).

---

## 4. Verification

### 4.1 Automática

- `npm run build` (que corre `tsc -b` + `vite build`) pasa sin errores de tipos ni de compilación.
- Prueba de unidad del parser sobre 6 casos (descripción con comas, nombre plano legacy, emojis, campos vacíos, sin descripción): todos correctos.

### 4.2 QA visual (Playwright, con datos sembrados en caché)

Se levantó `vite preview` y se validó en Chromium sembrando `localStorage`/cookies para simular sesión y datos. Sin errores de página en consola (sólo fallos de red esperados hacia el endpoint externo).

| Requerimiento | Evidencia |
| --- | --- |
| Login 3D / Liquid Glass | `docs/mejoras/01-login.png`, `02-login-perfil.png` |
| Comparador (oro/plata, PERSONAL BDP/CANDIDATO NUEVO, nombres completos, sin KPIs, contraste) | `docs/mejoras/03-comparador.png` |
| Pop-up de competencia + recuadros | `docs/mejoras/04-competencia-popup.png` |
| Dock se transforma a la izquierda + mini-chips | `docs/mejoras/05-dock-izquierda.png` |
| Glow de teclado (actual brillante, vecinos tenues) | `docs/mejoras/06-teclado-glow.png` |
| Opciones "Riesgo Bajo/Medio/Alto" | `docs/mejoras/07-riesgo-opciones.png` |
| Recuadros Cargo en el buscador | `docs/mejoras/08-competencia-boxes.png` |
| Dropdown de perfil ya no se recorta | `docs/mejoras/09-perfil-dropdown.png` |
| Config de sincronización | `docs/mejoras/10-config-sync.png` |

### 4.3 Guía de QA manual (paso a paso)

1. **Login**: recarga la app sin sesión. Observa el fondo 3D + aurora, mueve el mouse sobre un perfil (tilt 3D), elige uno (el avatar viaja al centro con halo giratorio), ingresa cualquier contraseña.
2. **Postulantes → Nuevo Postulante**: activa *"Navegación por teclado asistida"*, pulsa Tab por el formulario: el campo actual tiene glow azul giratorio, y el formulario se auto-centra al bajar. En "A3. Competencias", escribe en el buscador y verás los recuadros Cargo; agrega una y prueba el "?".
3. **B · Confiabilidad**: confirma que Integridad, Robo y Mentira muestran "Riesgo Bajo/Medio/Alto".
4. **Comparador**: agrega 3+ postulantes. Verifica trofeo dorado en el 1.º, plata en el resto, PERSONAL BDP vs CANDIDATO NUEVO, nombres largos completos, el "?" junto a competencias, y el contraste de riesgos. Baja: el dock se va a la izquierda y aparece el strip.
5. **Bug dropdown**: abre el chip de perfil en el dock (en cada posición del dock) — no debe recortarse.
6. **Bug módulos**: navega repetidamente entre módulos; nunca debe quedar en blanco.
7. **Datos frescos**: en Configuración activa/desactiva la sincronización y el botón. Cambia de pestaña y vuelve: se refresca.

---

## 5. Alternatives

### 5.1 Glow de teclado: overlays flotantes vs. box-shadow en el propio campo

| Overlays flotantes (elegido) | `box-shadow`/`outline` animado en el campo |
| --- | --- |
| ✅ No se recorta con `overflow:hidden` del vidrio | ❌ El vidrio recorta el resplandor |
| ✅ Funciona sobre `<input>` (que no admite pseudo-elementos) | ❌ Falla o es inconsistente en inputs |
| ✅ Un único gradiente cónico giratorio, GPU-compuesto | ✅ Más simple de escribir |
| ❌ Requiere sincronizar posición en scroll/resize | ✅ No necesita sincronización |

### 5.2 Dock que se transforma: cross-fade direccional vs. morph con `layout`

| Cross-fade con `AnimatePresence` (elegido) | `layout` (morphing del contenedor) |
| --- | --- |
| ✅ Predecible; no distorsiona íconos/labels | ❌ Al pasar de barra horizontal a vertical, los hijos se "estrujan" |
| ✅ `layoutId` únicos por posición evitan tearing | ❌ Riesgo de que `popLayout` pise el `position:fixed` |
| ❌ Existen dos docks montados un instante | ✅ Un solo nodo en el DOM |

---

## 6. Suggested people to talk to

El historial de git muestra que **todos** los archivos tocados fueron escritos por un asistente de IA (autor `Claude`), no por desarrolladores humanos con contexto profundo. Por lo tanto:

- **Akexander (dueño del repositorio, `AlexD5427`)** — es quien conoce el propósito de negocio (procesos de reclutamiento, la hoja "Auxiliar", el flujo con Evaluar.com) y las decisiones de producto. Cualquier duda sobre el formato de `competencias_lista`, la semántica de "Riesgo" en Integridad, o cómo se llenan las hojas, va con él.
- Para el **backend** (`docs/backend/Code.gs`): también mantenido por IA; el contrato del GET/POST y los nombres de columnas de la hoja son el punto de contacto real, así que conviene revisarlos con quien administra el Google Sheet.

---

## 7. Quiz

Pon a prueba tu comprensión. Cada pregunta tiene su explicación en un bloque desplegable.

<details>
<summary><b>1.</b> ¿Por qué el glow de teclado se dibuja en <code>document.body</code> y no sobre el propio campo?</summary>

- **A)** Porque así es más rápido de animar.
- **B)** Porque los `<input>` no admiten pseudo-elementos de forma fiable y las superficies de vidrio recortan con `overflow:hidden`. ✅
- **C)** Porque framer-motion lo exige.
- **D)** Porque el z-index no funciona dentro de un modal.

**Correcto: B.** El anillo necesita rodear el campo (fuera de sus bordes) y aparecer aunque el campo esté dentro de un contenedor con `overflow:hidden`; además los inputs no renderizan `::before/::after` de forma consistente. Un overlay `fixed` en `body` resuelve ambos problemas. (A es un beneficio secundario, no la razón; C y D son falsas.)
</details>

<details>
<summary><b>2.</b> Un catálogo trae la fila <code>Ventas,1,0,1,"Cierra tratos, con foco"</code>. ¿Qué recuadros se rellenan y cuál es la descripción?</summary>

- **A)** Bajo y Alto; descripción `Cierra tratos, con foco`. ✅
- **B)** Medio y Alto; descripción `"Cierra tratos, con foco"`.
- **C)** Los tres; sin descripción.
- **D)** Ninguno; el parser falla por la coma dentro de las comillas.

**Correcto: A.** El parser extrae **primero** la descripción entre comillas (por eso la coma interna no rompe nada) y luego separa `Ventas,1,0,1`: Bajo=1 (relleno), Medio=0 (vacío), Alto=1 (relleno). La descripción se guarda **sin** comillas.
</details>

<details>
<summary><b>3.</b> ¿Cuál era la causa raíz de la "pantalla en blanco al cambiar de módulo"?</summary>

- **A)** El fondo Three.js consumía toda la memoria.
- **B)** `AnimatePresence mode="wait"` esperaba una animación de salida que a veces nunca reportaba su fin, bloqueando el montaje del módulo entrante. ✅
- **C)** El `localStorage` se llenaba.
- **D)** El polling de datos borraba el DOM.

**Correcto: B.** Con `mode="wait"`, el nuevo hijo no se monta hasta que el anterior termina de salir; si esa salida no completa (animaciones infinitas/de layout), la vista queda vacía. La solución fue cambiar módulos con un `motion.section` *keyed* que intercambia de inmediato y sólo anima la entrada.
</details>

<details>
<summary><b>4.</b> En el chip del Comparador, ¿cómo se decide el distintivo dorado vs. plateado?</summary>

- **A)** Por el arquetipo DISC.
- **B)** Por si el postulante trabaja en el BDP.
- **C)** Por la posición en el ranking de Nota CAP: 1.º = oro con trofeo, del 2.º en adelante = plata. ✅
- **D)** Por el nivel de integridad.

**Correcto: C.** El Comparador ordena por Nota CAP descendente; el `rank` resultante determina el distintivo. `rank === 1` → oro + trofeo; el resto → plata. El % de CAP se incrusta en el distintivo.
</details>

<details>
<summary><b>5.</b> ¿Qué dispara que el dock se deslice al borde izquierdo, y por qué el contenido del Comparador se corre a la derecha?</summary>

- **A)** Un temporizador de 5 s; se corre para centrar la tabla.
- **B)** Que el strip de mini-chips quede "pegado" (`stuck`) con el dock en arriba/abajo; se corre para que el dock vertical no tape la columna de etiquetas congelada. ✅
- **C)** El modo compacto; se corre por estética.
- **D)** Hacer clic en el dock; se corre para hacer espacio al buscador.

**Correcto: B.** Cuando el observador detecta que las tarjetas de cabecera pasaron (`stuck`) y el dock está arriba/abajo, se fija `dockOverride = "left"`. Como el dock vertical se sienta en el borde izquierdo, el contenido añade `padding-left` (clase `.cmp-shifted.is-shifted`, ≥1024px) para no quedar tapado por él.
</details>

---

*Documento generado junto con el PR de mejoras integrales. Las capturas viven en `docs/mejoras/`.*

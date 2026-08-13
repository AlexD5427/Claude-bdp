# BDP · Dashboard de Evaluación de Talento — "Liquid Glass"

Dashboard de Recursos Humanos para la evaluación de talento, con una estética
ultra-premium inspirada en iOS (**Advanced Liquid Glassmorphism**), animaciones
físicas (spring) aceleradas por hardware y una integración resiliente con un
backend de Google Apps Script. **Toda la interfaz está en español.**

![Tablero](docs/tablero.png)

## ✨ Características

- **Tema dual claro/oscuro** ("Daylight" / "Midnight") conmutable desde el dock
  y persistente, con todo el sistema de diseño impulsado por *CSS custom
  properties* (sin parpadeo gracias a un script anti-FOUC).
- **Efectos reactivos al cursor**: un foco de luz global sigue el puntero por
  toda la página y las tarjetas tienen un *glow* que persigue al cursor.
- **Liquid Glass** real: volumen, reflejos especulares y refracción fluida sobre
  un fondo *mesh gradient* animado (en ambos temas).
- **Floating Dock** estilo iOS **configurable**: se ancla a cualquier borde
  (superior / inferior / izquierda / derecha), tiene tres tamaños y se
  **contrae** a un botón con el logo (y se expande con un clic). Detecta cambios
  de tamaño/orientación de la pantalla para reubicarse cómodamente (se desplaza
  dentro de sí mismo en pantallas pequeñas). Incluye la píldora activa de física
  de resorte, switch de tema y punto de estado de sincronización.
- **Módulo — Registro de Postulantes:** "Cuestionario" completo en un modal
  protegido con datos personales, **velocímetros analógicos** (arrastre o
  ingreso manual 0–100 %), arquetipo **DISC**, constructores A1/A2/A3
  (conocimientos, herramientas y competencias), escalas de confiabilidad y
  observaciones por etiquetas. Incluye **autoguardado local**, **recuperación de
  borrador** ante caídas y **confirmación de salida**. El guardado es **siempre
  explícito** (botón o `Ctrl/⌘+Intro`): pulsar Intro en un campo ya no envía la
  ficha a medio llenar, que era la causa de que el avance «se reiniciara solo»
  (ver [docs/comparador-postulantes/EXPLICACION.md](docs/comparador-postulantes/EXPLICACION.md)).
  **El alta se declara guardada sólo cuando la hoja lo confirma**: si el script
  responde un error, si el despliegue pide iniciar sesión o si la red del equipo
  bloquea `script.google.com`, el cuestionario **no se cierra**, explica qué pasó
  y conserva todo lo escrito — antes decía «registrado correctamente» y la ficha
  no llegaba a la hoja (ver
  [docs/auditoria-comparador-postulantes/EXPLICACION.md](docs/auditoria-comparador-postulantes/EXPLICACION.md)).
- **Perfil de Postulante (Vista Completa):** panel a pantalla completa que
  **centraliza toda la información de una persona** en un solo lugar, accesible
  desde **cualquier módulo** (comparador, procesos, postulantes, documentación,
  dashboard). Siete pestañas animadas: **Resumen**, **Trayectoria**
  (académica/laboral visual), **Evaluaciones** (anillos + radar + competencias),
  **Currículum 3D** (motor Three.js con tarjeta que sigue al cursor y respaldo
  estático), **Referencias** (panel de referencias laborales con formulario y
  comentarios estructurados), **Documentación** (flujo del expediente) e
  **Historial** (línea de tiempo unificada). Accesibilidad de primer nivel
  (diálogo, Escape, foco) y escalable para enlazar más fuentes de datos.
- **Edición global de postulantes:** un botón **Editar** disponible en todos los
  lugares donde aparece un postulante abre el cuestionario **precargado**, con el
  identificador bloqueado y los **campos modificados resaltados en ámbar**; al
  **Guardar Cambios** se actualiza Google Sheets (`action:"update"`), se refresca
  toda la base y se registra el cambio (quién, cuándo y qué) en la bitácora.
- **Módulo — Dashboard (personalizable):** tablero *bento* editable — el modo
  **Personalizar** permite **añadir/quitar indicadores**, **redimensionar** cada
  bloque (1–4 columnas) y **arrastrarlos** para reordenarlos; la disposición se
  guarda por navegador y los datos siguen calculándose en vivo.
- **Módulo — Comparador:** arranca **vacío** con una pantalla animada Liquid
  Glass que invita a agregar postulantes; la búsqueda *type-ahead* en vivo
  (nombre + identificador) añade columnas una a una — **un clic en el buscador
  siempre abre la lista**, incluso justo después de agregar a alguien, y dos
  filas con el mismo identificador se pueden comparar por separado (la clave
  repetida se marca en la sugerencia). La comparación (candidatos
  y su orden) y las preferencias de vista **se conservan durante la sesión** al
  cambiar de módulo. Se organiza en tres pestañas:
  - **Comparativa:** informe seccionado con encabezados congelados, orden por
    **Nota CAP** con **filtro ascendente/descendente**, **ranking** configurable
    (chapa **dorada** con efectos para el 1.º y **plateada** para el resto) que
    puede mostrarse en la **tarjeta**, en una **fila** dedicada o en **ambas**, y
    un **chip de perfil** rediseñado — nombres **en mayúsculas**, nivel académico
    y su conector en una línea y la **carrera debajo**. La **columna congelada**
    es opaca (sin solapamiento al desplazar) y sus etiquetas largas se **revelan
    con una marquesina** suave, en **un solo bloque** que se adapta al alto de la
    fila. El **puesto se decide por mérito**: mayor Nota CAP y, sólo ante un
    empate exacto, un **Índice de Desempate** ponderado (Conocimientos 40 %,
    Competencias 35 %, Currículum 25 %, renormalizado si falta alguna nota) que
    se muestra en la propia celda; invertir el orden cambia la vista, no los
    puestos. Las filas de **Conocimientos, Herramientas y Observaciones**
    **revelan su texto** al pasar el puntero o el dedo y se abren en un **visor
    ampliado** que nace de la celda y vuelve a ella. Un **ayudante de navegación
    fijo** (d-pad) aparece al comparar muchos candidatos. Cada sección se
    **contrae/despliega** con un plegado escalonado.
  - **Gráficos:** generador **interactivo** — se eligen candidatos y métricas y
    se dibujan **barras agrupadas, barras horizontales, líneas multiserie, radar
    o dona** animados, con leyendas y una tabla de datos de alto contraste.
  - **Configuración (por sesión):** «Ajuste y Brecha», modo compacto, visibilidad
    de **secciones** y **de cada fila por separado** (incluidas las de
    competencias, que son dinámicas; todas empiezan encendidas) y los controles de
    **ranking, orden y ayudante de navegación**.
- **Módulo — Documentación:** expediente editable por persona contratada (ligado
  al identificador), con **checklist de documentos** por estado (presentado /
  pendiente / con observación / no aplica), páginas, observaciones y prórrogas;
  **anillo de avance**, **análisis inteligente** y un **panel de avisos por
  correo** (Gmail/Outlook) totalmente editable con **recordatorios automáticos
  cada 3 días** y copia al auxiliar a cargo.
- **Módulo — Perfiles de Cargo:** creación y gestión completa de los *perfiles de
  cargo* del banco (crear, editar, ver, eliminar) con métricas/KPIs, buscador y
  filtros por gestión y área. Persiste en la hoja `perfil_cargo_bdp` respetando su
  **contrato de texto plano** (viñetas separadas por `" | "`, diez ranuras de
  imagen `link_img_1…10`) para un segundo frontend de sólo lectura. Formulario a
  pantalla completa por secciones con **autocompletado en vivo** (`gerencias_bdp` /
  `cargos_bdp`), **autoguardado de borrador** y recuperación, **verificación humana
  del enlace de Evaluar**, y un gestor de imágenes con carga por URL,
  **reordenamiento por arrastre** y **carrusel de vista previa**. Incluye un **visor
  premium** a pantalla completa (galería + secciones reveladas), distinto del
  formulario. Ver [docs/perfiles-cargo/EXPLICACION.md](docs/perfiles-cargo/EXPLICACION.md).
- **Acceso directo — Herramientas:** botón del dock (entre *Documentación* y
  *Configuración*) que abre un panel translúcido estilo *Quick Settings* de iOS con
  seis utilidades externas (íconos animados, revelado de texto, apertura en pestaña
  nueva). Mientras está abierto, atenúa el resto del dock y restringe la navegación.
- **Módulo — Configuración:** centro de control del sistema — identidad
  institucional, **reglas de evaluación/comparador** (umbral CAP, tolerancia de
  empate, máximo de columnas, orden y ranking), **apariencia y rendimiento**
  (tema y motor gráfico 3D), **dock de accesos directos** (posición, tamaño y
  estado contraído), **integraciones** (Evaluar.com + prueba de conexión)
  y la biblioteca de **Formatos de Correo Activos**, con un formato por etapa del
  proceso; el formato activo de *Documentación* alimenta sus correos automáticos.
- **Diseño responsive integral:** toda la interfaz —dock, KPIs, comparador,
  gráficos, formularios y modales— está optimizada para **móviles y tablets**,
  con cuadrículas que se apilan, controles táctiles y desplazamiento contenido.
- **Motor visual Three.js:** un fondo WebGL optimizado (un solo *quad* con
  *shader* de flujo líquido) que profundiza el Liquid Glass en ambos temas,
  apunta a ~60 fps, se **carga de forma diferida**, se pausa con la pestaña
  oculta y respeta *Reducir movimiento* (con el *mesh* CSS como respaldo).
- **Arquetipo DISC dinámico:** el desplegable y el pop-up de significado se
  alimentan de la hoja «Auxiliar» (columna `arquetipo_disc`); un icono «!» junto
  al arquetipo abre su descripción en todo el sistema (cuestionario y comparador).
- **Impresión institucional** a Carta / Oficio en todos los módulos, con
  banderola de reporte y aplanado de vidrio para máxima legibilidad.
- **Módulo — Procesos (ProcessOS):** gestión completa de la operación de
  reclutamiento con la entidad `RecruitmentProcess` (no solo una vacante).
  Búsqueda, filtros avanzados, vistas de **tabla / tarjetas / Kanban / resumen**
  (Kanban con arrastre y alternativa por teclado), editor de diez secciones,
  contenido público saneado, asignación de evaluaciones, publicación/pausa/
  cierre/archivo y persistencia en la hoja `Procesos`. Ver
  [docs/modules/PROCESS_OS.md](docs/modules/PROCESS_OS.md).
- **Módulo — Evaluaciones (AssessmentOS):** plataforma de autoría de evaluaciones
  estructuradas (preselección, conocimientos, técnicas, juicio situacional,
  competencias, guías de entrevista, scorecards, casos, simulaciones) con
  **persistencia real en Google Sheets a través de un backend propio de Apps
  Script**. El constructor se organiza en cuatro pasos navegables —configuración
  general, preguntas, configuración de evaluación y revisión— con **índice de
  preguntas** buscable y filtrable, editor de la pregunta activa, panel de
  propiedades, **indicador de guardado** con recuperación de borrador local y
  guardia de salida, **panel de revisión que lleva de cada error al campo exacto**
  y vista previa del candidato que pasa por el mismo saneador que el portal
  público. 54 tipos de pregunta con **capacidades declarativas** (opciones,
  mínimos, exactamente una correcta, estrategia de calificación), **versionado**
  mayor/menor con snapshots inmutables, **importación desde Excel/CSV/ODS** y
  listado con filtros, ordenamiento y origen de datos visible.
  La **calificación se calcula exclusivamente en el servidor** con
  `correctas ÷ calificables × 100`; las preguntas abiertas dejan el intento
  *pendiente de revisión* en lugar de otorgar cero. La **API pública nunca expone
  respuestas correctas** (verificado con 14 pruebas dedicadas).
  Backend listo para copiar en [`apps-script/evaluaciones/`](apps-script/evaluaciones/)
  y documentación del módulo en [`docs/evaluaciones/`](docs/evaluaciones/)
  (contrato de API, importación y entrega al portal de candidatos).
- Módulos adicionales: **Tablero**, **Cara a Cara** (1 vs 1).

> Documentación técnica de los módulos ProcessOS + AssessmentOS en
> [`docs/modules/`](docs/modules/) (arquitectura, constructor, plugins,
> versionado, puntuación y lógica, importación, integración Apps Script, esquema
> de hojas, migración a Supabase, diseño, accesibilidad, seguridad y pruebas).

## 🧱 Stack

- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (estricto)
- [Vite 5](https://vite.dev/)
- [Tailwind CSS 3](https://tailwindcss.com/) (valores arbitrarios + utilidades `glass`)
- [Framer Motion](https://www.framer.com/motion/) para transiciones con física
- [Three.js](https://threejs.org/) para el fondo WebGL «Liquid Glass» (carga diferida)
- [lucide-react](https://lucide.dev/) para iconos

## 🚀 Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo
npm run build      # typecheck + build de producción
npm run preview    # previsualizar el build
npm test           # suite de pruebas (Vitest)
npm run typecheck     # solo comprobación de tipos
npm run backend:check # coherencia del backend de Evaluaciones con el frontend
npm run doc:check     # coherencia del backend de Documentación con el frontend
```

> Los módulos **Evaluaciones** y **Documentación** usan **su propio libro** de
> Google Sheets y su propio proyecto de Apps Script, independientes del resto del
> sistema; se configuran desde su propio módulo. Su código está en
> [`apps-script/evaluaciones/`](apps-script/evaluaciones/) y
> [`apps-script/documentacion/`](apps-script/documentacion/), cada uno con su
> README de despliegue. En desarrollo, Evaluaciones arranca con datos de
> demostración.

## 🔌 Backend

El dashboard consume un único endpoint de Google Apps Script (definido en
`src/constants.ts`):

```
GET  →  { candidatos: [...], competencias: [...], arquetipos_disc: [...] }
```

> [!IMPORTANT]
> **Regla de producción (Vercel):** toda llamada `fetch()` a este endpoint debe
> incluir `{ redirect: "follow" }`. Google responde con un `302` y, sin seguir el
> redirect, la app falla con `404` en producción. Ver `useTalentData`.
>
> **Toda escritura verifica la respuesta.** `fetch` sólo rechaza cuando la
> petición no llega: un `500`, la pantalla de acceso de Google o un
> `{"status":"error"}` del script resuelven con normalidad. `postToSheet`
> distingue los tres desenlaces (confirmada / rechazada / sin confirmar) y la
> interfaz sólo refleja en local lo que la hoja confirmó.
>
> **Diagnóstico:** *Configuración → Integraciones → Diagnosticar conexión* prueba
> por separado lectura, escritura y almacenamiento del navegador, y genera un
> informe copiable. Es la forma de saber si un problema está en el sistema o en el
> equipo de quien lo reporta.

El hook global `useTalentData` (Context API) obtiene, normaliza y distribuye los
datos, gestionando estados de carga y error con reintentos de *backoff*.

> El script completo de este libro compartido —el que atiende `SCRIPT_URL`— está
> versionado en [`apps-script/principal/`](apps-script/principal/), con su
> contrato `GET`/`POST`, las hojas que espera y los pasos de despliegue.
>
> El módulo **Documentación** persiste sus expedientes en `localStorage` y los
> sincroniza *best-effort* con este backend (`type: "documentacion"`). Para el
> guardado real en Google Sheets y el **envío automático de correos cada 3 días**,
> despliegue también el trigger `instalarTriggersDocumentacion()` que trae
> [`apps-script/principal/Code.gs`](apps-script/principal/Code.gs).

## 🎨 Sistema de diseño

La paleta corporativa se construye con `#004a8f` (azul profundo), `#005baa`
(azul núcleo) y `#00b0d8` (cian). La utilidad base de Liquid Glass vive en
`src/index.css` como las clases `.glass` y `.glass-heavy`.

## 📁 Estructura

```
src/
├── components/      # Dock, KPIs, chips, tarjetas, modal, diálogos, formulario
│   ├── doc/         # Módulo Documentación: alta, expediente, correo, ajustes
│   ├── perfiles/    # Módulo Perfiles de Cargo: formulario, visor, imágenes, tarjeta
│   ├── tools/       # Panel «Herramientas» (Quick Settings)
│   └── form/        # Campos, velocímetro (GaugeInput), tags, list builders
├── content/locale/  # Catálogo de textos es-MX + formateadores
├── context/         # useTalentData + useTheme (Context API)
├── design-system/   # Tokens semánticos, motion y primitivas Liquid Glass
├── features/        # ProcessOS (processes/) y AssessmentOS (assessments/)
├── infrastructure/  # Proveedores (mock/Apps Script/Supabase), mappers, sync
├── hooks/           # usePointerGlow, useFormDraft (autosave/recuperación)
├── lib/             # cálculos, normalización, niveles, impresión, DISC y docStore
├── modules/         # Tablero, Cara a Cara, Comparador, Postulantes, Perfiles, Documentación
├── shared/          # Result, ids, envelope, sanitize, store, hooks, flags
├── App.tsx          # layout + enrutado de módulos
└── index.css        # sistema de diseño Liquid Glass (dual-theme + print)

apps-script/
├── principal/       # libro compartido: postulantes, comparador, perfiles, procesos…
├── documentacion/   # backend del módulo Documentación (libro propio)
└── evaluaciones/    # backend del módulo Evaluaciones (libro propio)
scripts/
├── evaluaciones-backend-check.mjs  # coherencia backend↔frontend (npm run backend:check)
├── evaluaciones-backend.mjs        # arnés que ejecuta los .gs en Node (pruebas)
└── documentacion-backend-check.mjs # coherencia del backend de Documentación (npm run doc:check)
```

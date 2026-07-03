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
  borrador** ante caídas y **confirmación de salida**.
- **Módulo — Dashboard (personalizable):** tablero *bento* editable — el modo
  **Personalizar** permite **añadir/quitar indicadores**, **redimensionar** cada
  bloque (1–4 columnas) y **arrastrarlos** para reordenarlos; la disposición se
  guarda por navegador y los datos siguen calculándose en vivo.
- **Módulo — Comparador:** arranca **vacío** con una pantalla animada Liquid
  Glass que invita a agregar postulantes; la búsqueda *type-ahead* en vivo
  (nombre + identificador) añade columnas una a una. La comparación (candidatos
  y su orden) y las preferencias de vista **se conservan durante la sesión** al
  cambiar de módulo. Se organiza en tres pestañas:
  - **Comparativa:** informe seccionado con encabezados congelados, orden por
    **Nota CAP**, contorno de **empate**, **ranking** (1.º/2.º/3.º) y un **chip
    de perfil** rediseñado — nivel académico y su conector en una línea y la
    **carrera debajo**. Cada sección (Resultados, Competencias, Conocimientos,
    Herramientas, Integridad, Observaciones) **se contrae/despliega**. Cuadrícula
    con **desplazamiento horizontal** para móviles y la impresión ajusta a una
    hoja.
  - **Gráficos:** generador **interactivo** — se eligen candidatos y métricas
    (notas + ajuste por competencia) y se dibujan **barras agrupadas, radar o
    dona** animados, más una tabla de datos, con una paleta de alto contraste.
  - **Configuración (por sesión):** mostrar/ocultar «Ajuste y Brecha», modo
    compacto y la **visibilidad de cada sección** de la tabla comparativa.
- **Módulo — Documentación:** expediente editable por persona contratada (ligado
  al identificador), con **checklist de documentos** por estado (presentado /
  pendiente / con observación / no aplica), páginas, observaciones y prórrogas;
  **anillo de avance**, **análisis inteligente** y un **panel de avisos por
  correo** (Gmail/Outlook) totalmente editable con **recordatorios automáticos
  cada 3 días** y copia al auxiliar a cargo.
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
- Módulos adicionales: **Tablero**, **Cara a Cara** (1 vs 1) y **Procesos**.

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
```

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

El hook global `useTalentData` (Context API) obtiene, normaliza y distribuye los
datos, gestionando estados de carga y error con reintentos de *backoff*.

> El módulo **Documentación** persiste sus expedientes en `localStorage` y los
> sincroniza *best-effort* con el backend (`type: "documentacion"`). Para el
> guardado real en Google Sheets, la lectura de `arquetipos_disc`/`carrera` y el
> **envío automático de correos cada 3 días**, despliegue
> [`docs/backend/Documentacion.gs`](docs/backend/Documentacion.gs) (ver
> `docs/backend/README.md`).

## 🎨 Sistema de diseño

La paleta corporativa se construye con `#004a8f` (azul profundo), `#005baa`
(azul núcleo) y `#00b0d8` (cian). La utilidad base de Liquid Glass vive en
`src/index.css` como las clases `.glass` y `.glass-heavy`.

## 📁 Estructura

```
src/
├── components/      # Dock, KPIs, chips, tarjetas, modal, diálogos, formulario
│   ├── doc/         # Módulo Documentación: alta, expediente, correo, ajustes
│   └── form/        # Campos, velocímetro (GaugeInput), tags, list builders
├── context/         # useTalentData + useTheme (Context API)
├── hooks/           # usePointerGlow, useFormDraft (autosave/recuperación)
├── lib/             # cálculos, normalización, niveles, impresión, DISC y docStore
├── modules/         # Tablero, Cara a Cara, Comparador, Procesos, Postulantes, Documentación
├── App.tsx          # layout + enrutado de módulos
└── index.css        # sistema de diseño Liquid Glass (dual-theme + print)
```

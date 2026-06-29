# BDP · Dashboard de Evaluación de Talento — "Liquid Glass"

Dashboard de Recursos Humanos para la evaluación de talento, con una estética
ultra-premium inspirada en iOS (**Advanced Liquid Glassmorphism**), animaciones
físicas (spring) aceleradas por hardware y una integración resiliente con un
backend de Google Apps Script. **Toda la interfaz está en español.**

![Tablero](docs/tablero.png)

## ✨ Características

- **Liquid Glass** real: volumen, reflejos especulares y refracción fluida sobre
  un fondo *mesh gradient* animado.
- **Floating Dock** estilo iOS (solo iconos) con píldora activa que se desliza
  con física de resorte y punto de estado de sincronización con la base de datos.
- **Barra de KPIs** flotante con widgets de vidrio que entran en escena de forma
  escalonada.
- **Módulo 1 — Registro de Postulantes:** formulario inteligente con división de
  nombre, identificador con placeholder `CI - Nro Proceso - Año`, *Estado Civil*
  sin "Separado/a" y constructor de competencias 0/7 con cálculo en vivo de
  **Brecha** y **Ajuste**.
- **Módulo 2 — Nuevo Comparador:** cuadrícula de auditoría de talento con
  encabezados *sticky* que colapsan en *lite chips* al hacer scroll y chips de
  competencia de Liquid Glass en cada intersección.
- Módulos adicionales: **Tablero**, **Cara a Cara** (1 vs 1) y **Procesos**.

## 🧱 Stack

- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (estricto)
- [Vite 5](https://vite.dev/)
- [Tailwind CSS 3](https://tailwindcss.com/) (valores arbitrarios + utilidades `glass`)
- [Framer Motion](https://www.framer.com/motion/) para transiciones con física
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
GET  →  { candidatos: [...], competencias: [...] }
```

> [!IMPORTANT]
> **Regla de producción (Vercel):** toda llamada `fetch()` a este endpoint debe
> incluir `{ redirect: "follow" }`. Google responde con un `302` y, sin seguir el
> redirect, la app falla con `404` en producción. Ver `useTalentData`.

El hook global `useTalentData` (Context API) obtiene, normaliza y distribuye los
datos, gestionando estados de carga y error con reintentos de *backoff*.

## 🎨 Sistema de diseño

La paleta corporativa se construye con `#004a8f` (azul profundo), `#005baa`
(azul núcleo) y `#00b0d8` (cian). La utilidad base de Liquid Glass vive en
`src/index.css` como las clases `.glass` y `.glass-heavy`.

## 📁 Estructura

```
src/
├── components/      # Dock, KPIs, chips, tarjetas, estados, formulario
├── context/         # useTalentData (Context API)
├── lib/             # cálculos de competencia y normalización de datos
├── modules/         # Tablero, Cara a Cara, Comparador, Procesos, Postulantes
├── App.tsx          # layout + enrutado de módulos
└── index.css        # sistema de diseño Liquid Glass
```

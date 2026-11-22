import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { MeshBackground } from "./components/MeshBackground";
import { ThreeBackground } from "./components/ThreeBackground";
import { CursorSpotlight } from "./components/CursorSpotlight";
import { LiquidPointer } from "./components/LiquidPointer";
import { ScrollProgress } from "./components/ScrollProgress";
import { ModuleTransition } from "./components/ModuleTransition";
import { AnimatedTitle } from "./components/AnimatedTitle";
import { FloatingDock } from "./components/FloatingDock";
import { BrandHeader } from "./components/BrandHeader";
import { KpiBar } from "./components/KpiBar";
import { FilterBar } from "./components/FilterBar";
import { RefreshButton } from "./components/RefreshButton";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CandidateProfileViewer } from "./components/profile/CandidateProfileViewer";
import { CandidateEditModal } from "./components/CandidateEditModal";
import { LoginScreen } from "./components/login/LoginScreen";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { TalentDataProvider, useTalentData } from "./context/TalentDataContext";
import { useConfig, type DockPosition } from "./lib/configStore";
import { reiniciarBloqueoScroll } from "./lib/scrollLock";
import {
  getBundle,
  logActivity,
  mergeBackendProfiles,
  useProfiles,
} from "./lib/profilesStore";
import { Dashboard } from "./modules/Dashboard";
import { Tablero } from "./modules/Tablero";
import { CaraACara } from "./modules/CaraACara";
import { NuevoComparador } from "./modules/NuevoComparador";
import { ToastViewport } from "./design-system/liquid-glass/toast";
import { LoadingState } from "./components/States";
import { ListaPostulantes } from "./modules/ListaPostulantes";
import { Perfiles } from "./modules/Perfiles";
import { Configuracion } from "./modules/Configuracion";
import { HerramientasPanel } from "./components/tools/HerramientasPanel";
import { DOCK_ITEMS } from "./constants";
import { codigoDesdeHash } from "./features/evaluaciones";
import type { ModuleId } from "./types";

// Route-level code splitting: the heavy ProcessOS/AssessmentOS bundles (builder,
// import parsers, zod schemas) load only when their module is opened.
const ProcesosModule = lazy(() =>
  import("./features/processes").then((m) => ({ default: m.ProcesosModule })),
);
const EvaluacionesModule = lazy(() =>
  import("./features/evaluaciones").then((m) => ({ default: m.EvaluacionesModule })),
);

/**
 * Documentación.
 *
 * También se carga aparte. La consola documental arrastra el cliente del backend,
 * el vocabulario del modelo, el exportador a Excel y trece pantallas: es el módulo
 * más grande de la aplicación y estaba en el paquete inicial, así que alguien que
 * solo entra a ver el tablero pagaba su descarga sin abrirlo nunca.
 */
const Documentacion = lazy(() =>
  import("./modules/Documentacion").then((m) => ({ default: m.Documentacion })),
);

/**
 * Runner del candidato.
 *
 * Se carga aparte y, sobre todo, se monta ANTES del acceso al ATS: el enlace
 * público de una evaluación no puede exigir cuenta, y el candidato no tiene una.
 */
const EvaluacionRunner = lazy(() =>
  import("./features/evaluaciones").then((m) => ({ default: m.Runner })),
);

const SUBTITLES: Record<ModuleId, string> = {
  dashboard: "Panel ejecutivo de selección y reclutamiento.",
  tablero: "Visión general del talento y métricas clave.",
  "cara-a-cara": "Duelo 1 vs 1 entre dos postulantes.",
  comparador: "Auditoría comparativa de competencias.",
  procesos: "Operación completa de reclutamiento y selección.",
  evaluaciones: "Plataforma de autoría de evaluaciones estructuradas.",
  postulantes: "Listado y registro de postulantes.",
  perfiles: "Creación y gestión de perfiles de cargo del banco.",
  documentacion: "Expedientes de documentación de incorporación.",
  configuracion: "Preferencias del sistema, integraciones y formatos de correo.",
};

/** Content padding that keeps the layout clear of the dock, wherever it sits. */
const MAIN_PAD: Record<DockPosition, string> = {
  top: "pt-28 pb-16 sm:pt-32",
  bottom: "pt-16 pb-28 sm:pb-32",
  left: "pt-16 pb-16 pl-24 sm:pl-28",
  right: "pt-16 pb-16 pr-24 sm:pr-28",
};

function AppShell() {
  const [active, setActive] = useState<ModuleId>("dashboard");
  const { status, connection } = useTalentData();
  const { reduceMotion, dockPosition } = useConfig();
  const { current } = useProfiles();
  const { setTheme } = useTheme();
  const synced = status === "success";
  const offline = connection === "sin-conexion";

  // Let the "Reducir movimiento" preference dampen animations app-wide.
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
  }, [reduceMotion]);

  // Apply the logged-in profile's saved theme (the rest of the bundle —
  // appConfig + dashboard layout — is applied by the store on login).
  const appliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!current || appliedFor.current === current.id) return;
    appliedFor.current = current.id;
    const bundle = getBundle(current.id);
    if (bundle.theme) setTheme(bundle.theme);
  }, [current, setTheme]);

  // Trace navigation into the per-profile activity log (best-effort).
  useEffect(() => {
    logActivity({ modulo: active, accion: "Abrió módulo" });
    // Red de seguridad: cambiar de módulo nunca debe dejar el scroll bloqueado.
    // Si un overlay se cerró de forma anómala y dejó el `body` en «hidden», esto
    // devuelve la interfaz a un estado usable sin recargar la página.
    reiniciarBloqueoScroll();
  }, [active]);

  const meta = DOCK_ITEMS.find((d) => d.id === active)!;
  const numeroModulo = String(DOCK_ITEMS.findIndex((d) => d.id === active) + 1).padStart(2, "0");
  const totalModulos = String(DOCK_ITEMS.length).padStart(2, "0");

  return (
    <div className="relative min-h-screen">
      <MeshBackground />
      <ThreeBackground />
      <CursorSpotlight />
      <ScrollProgress />
      <ModuleTransition moduleKey={active} />
      <FloatingDock active={active} onSelect={setActive} synced={synced} offline={offline} />
      <RefreshButton />

      <main className={`mx-auto w-full max-w-[1640px] px-4 sm:px-6 lg:px-8 ${MAIN_PAD[dockPosition]}`}>
        <div className="print-scope-hide">
          <BrandHeader />
        </div>

        <div className="print-scope-hide">
          <FilterBar />
        </div>

        {/* The comparator and the new ProcessOS/AssessmentOS modules provide
            their own summaries, so the generic four-KPI row is hidden there to
            avoid disconnected or duplicated metrics. */}
        {active !== "comparador" && active !== "procesos" && active !== "evaluaciones" && (
          <div className="print-scope-hide">
            <KpiBar module={active} />
          </div>
        )}

        {/* Encabezado del módulo: el título se materializa letra a letra, el
            subtítulo llega detrás y una línea de luz se dibuja debajo. Todo se
            vuelve a reproducir al cambiar de módulo (las piezas van con `key`). */}
        <header className="print-scope-hide mb-5 mt-8">
          <p className="mb-1 inline-flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-accent no-print">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-glow-cyan" />
            </span>
            Módulo
            <span className="tabular-nums text-ink-faint">
              {numeroModulo} / {totalModulos}
            </span>
          </p>
          <h2 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
            <AnimatedTitle key={active} text={meta.label} />
          </h2>
          <motion.p
            key={`subtitulo-${active}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
            className="mt-1 text-sm text-ink-soft"
          >
            {SUBTITLES[active]}
          </motion.p>
          <motion.span
            key={`linea-${active}`}
            aria-hidden
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            className="aurora-line mt-3 block h-px w-full max-w-md origin-left no-print"
          />
        </header>

        {/* A keyed entrance animation — NOT wrapped in <AnimatePresence
            mode="wait">. The old exit-then-enter handshake could deadlock: if an
            exiting module's animation never reported completion (common with
            long-lived infinite/layout animations), the incoming module was never
            mounted and the page went blank until a full reload. Keying a plain
            motion.section makes React swap modules immediately while still
            playing a smooth enter transition. */}
        <ErrorBoundary key={active}>
          <motion.section
            key={active}
            initial={{ opacity: 0, y: 22, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 210, damping: 26, mass: 0.9 }}
          >
            {active === "dashboard" && <Dashboard />}
            {active === "tablero" && <Tablero />}
            {active === "cara-a-cara" && <CaraACara />}
            {active === "comparador" && <NuevoComparador />}
            {(active === "procesos" || active === "evaluaciones" || active === "documentacion") && (
              <Suspense fallback={<LoadingState />}>
                {active === "procesos" && <ProcesosModule />}
                {active === "evaluaciones" && <EvaluacionesModule />}
                {active === "documentacion" && <Documentacion />}
              </Suspense>
            )}
            {active === "postulantes" && <ListaPostulantes />}
            {active === "perfiles" && <Perfiles />}
            {active === "configuracion" && <Configuracion />}
          </motion.section>
        </ErrorBoundary>
      </main>

      {/* Global overlays — reachable from every module. */}
      <CandidateProfileViewer />
      <CandidateEditModal />
      <HerramientasPanel />
      <ToastViewport />
    </div>
  );
}

/** Gate the app behind the profile login while keeping data syncing behind it. */
function Shell() {
  const { current } = useProfiles();
  const { perfiles } = useTalentData();

  // Merge sheet-provided profiles (names, cargos, passwords) into the seed set.
  useEffect(() => {
    mergeBackendProfiles(perfiles);
  }, [perfiles]);

  return (
    <>
      {current && <AppShell />}
      <AnimatePresence>{!current && <LoginScreen key="login" />}</AnimatePresence>
    </>
  );
}

/**
 * Ruta pública del candidato: `#/evaluacion/EV-XXXX-1234`.
 *
 * Se resuelve con el hash y no con un router porque la aplicación no tiene ninguno
 * (ver docs/evaluaciones/ARQUITECTURA.md). Escuchar `hashchange` basta y no añade
 * dependencias.
 */
function useCodigoEvaluacion(): string {
  const [codigo, setCodigo] = useState(() => codigoDesdeHash(window.location.hash));
  useEffect(() => {
    const alCambiar = () => setCodigo(codigoDesdeHash(window.location.hash));
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, []);
  return codigo;
}

export default function App() {
  const codigoEvaluacion = useCodigoEvaluacion();
  // «Reducir movimiento» (Configuración) manda sobre Framer Motion en toda la
  // aplicación; sin él, se respeta la preferencia del sistema operativo.
  const { reduceMotion } = useConfig();
  const politicaMovimiento = reduceMotion ? "always" : "user";

  // El runner vive fuera del acceso al ATS y sin el dock ni los paneles internos:
  // es una página para alguien de fuera de la organización.
  if (codigoEvaluacion) {
    return (
      <MotionConfig reducedMotion={politicaMovimiento}>
        <ThemeProvider>
          <div className="relative min-h-screen">
            <MeshBackground />
            <LiquidPointer />
            <Suspense fallback={<LoadingState />}>
              <EvaluacionRunner codigo={codigoEvaluacion} />
            </Suspense>
            <ToastViewport />
          </div>
        </ThemeProvider>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion={politicaMovimiento}>
      <ThemeProvider>
        <LiquidPointer />
        <TalentDataProvider>
          <Shell />
        </TalentDataProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}

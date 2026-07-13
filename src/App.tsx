import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MeshBackground } from "./components/MeshBackground";
import { ThreeBackground } from "./components/ThreeBackground";
import { CursorSpotlight } from "./components/CursorSpotlight";
import { FloatingDock } from "./components/FloatingDock";
import { BrandHeader } from "./components/BrandHeader";
import { KpiBar } from "./components/KpiBar";
import { FilterBar } from "./components/FilterBar";
import { RefreshButton } from "./components/RefreshButton";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoadingState } from "./components/States";
import { CandidateProfileViewer } from "./components/profile/CandidateProfileViewer";
import { CandidateEditModal } from "./components/CandidateEditModal";
import { LoginScreen } from "./components/login/LoginScreen";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { TalentDataProvider, useTalentData } from "./context/TalentDataContext";
import { useConfig, type DockPosition } from "./lib/configStore";
import {
  getBundle,
  logActivity,
  mergeBackendProfiles,
  useProfiles,
} from "./lib/profilesStore";
import { Toasts } from "./design-system/components/Toasts";
import { DOCK_ITEMS } from "./constants";
import type { ModuleId } from "./types";

// Route-level code splitting: each module is a separate chunk fetched on demand,
// so the first paint no longer downloads (and parses) every module up front.
// This is a direct fix for the "takes a very long time to load" report.
const Dashboard = lazy(() => import("./modules/Dashboard").then((m) => ({ default: m.Dashboard })));
const Tablero = lazy(() => import("./modules/Tablero").then((m) => ({ default: m.Tablero })));
const CaraACara = lazy(() => import("./modules/CaraACara").then((m) => ({ default: m.CaraACara })));
const NuevoComparador = lazy(() =>
  import("./modules/NuevoComparador").then((m) => ({ default: m.NuevoComparador })),
);
const ProcessOSPage = lazy(() =>
  import("./features/processes/pages/ProcessOSPage").then((m) => ({ default: m.ProcessOSPage })),
);
const AssessmentOSPage = lazy(() =>
  import("./features/assessments/pages/AssessmentOSPage").then((m) => ({ default: m.AssessmentOSPage })),
);
const ListaPostulantes = lazy(() =>
  import("./modules/ListaPostulantes").then((m) => ({ default: m.ListaPostulantes })),
);
const Documentacion = lazy(() =>
  import("./modules/Documentacion").then((m) => ({ default: m.Documentacion })),
);
const Configuracion = lazy(() =>
  import("./modules/Configuracion").then((m) => ({ default: m.Configuracion })),
);

const SUBTITLES: Record<ModuleId, string> = {
  dashboard: "Panel ejecutivo de selección y reclutamiento.",
  tablero: "Visión general del talento y métricas clave.",
  "cara-a-cara": "Duelo 1 vs 1 entre dos postulantes.",
  comparador: "Auditoría comparativa de competencias.",
  procesos: "Centro de control de los procesos de reclutamiento.",
  evaluaciones: "Creación y gestión de evaluaciones para selección.",
  postulantes: "Listado y registro de postulantes.",
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
  const { status } = useTalentData();
  const { reduceMotion, dockPosition } = useConfig();
  const { current } = useProfiles();
  const { setTheme } = useTheme();
  const synced = status === "success";

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
  }, [active]);

  const meta = DOCK_ITEMS.find((d) => d.id === active)!;

  // ProcessOS and AssessmentOS render their own headers, toolbars and filters,
  // so the generic module chrome (universal FilterBar + KPI row + module title)
  // is redundant there and is hidden to keep those control centres uncluttered.
  const selfHeaded = active === "procesos" || active === "evaluaciones";

  return (
    <div className="relative min-h-screen">
      <MeshBackground />
      <ThreeBackground />
      <CursorSpotlight />
      <FloatingDock active={active} onSelect={setActive} synced={synced} />
      <RefreshButton />

      <main className={`mx-auto w-full max-w-[1640px] px-4 sm:px-6 lg:px-8 ${MAIN_PAD[dockPosition]}`}>
        <div className="print-scope-hide">
          <BrandHeader />
        </div>

        {!selfHeaded && (
          <div className="print-scope-hide">
            <FilterBar />
          </div>
        )}

        {/* The comparator hides the KPI row entirely (per the redesign): the
            audit grid is the star there, and the four generic KPIs only added
            noise and empty space above it. The new self-headed modules do too. */}
        {active !== "comparador" && !selfHeaded && (
          <div className="print-scope-hide">
            <KpiBar module={active} />
          </div>
        )}

        {!selfHeaded && (
          <header className="print-scope-hide mb-5 mt-8">
            <p className="mb-1 inline-flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-cyan-400 no-print">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-glow-cyan" />
              Módulo
            </p>
            <motion.h2
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.175, 0.885, 0.32, 1.275] }}
              className="text-2xl font-black tracking-tight text-ink sm:text-3xl"
            >
              {meta.label}
            </motion.h2>
            <p className="mt-1 text-sm text-ink-soft">{SUBTITLES[active]}</p>
          </header>
        )}

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
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.175, 0.885, 0.32, 1.275] }}
            className={selfHeaded ? "mt-6" : undefined}
          >
            <Suspense fallback={<LoadingState />}>
              {active === "dashboard" && <Dashboard />}
              {active === "tablero" && <Tablero />}
              {active === "cara-a-cara" && <CaraACara />}
              {active === "comparador" && <NuevoComparador />}
              {active === "procesos" && <ProcessOSPage />}
              {active === "evaluaciones" && <AssessmentOSPage />}
              {active === "postulantes" && <ListaPostulantes />}
              {active === "documentacion" && <Documentacion />}
              {active === "configuracion" && <Configuracion />}
            </Suspense>
          </motion.section>
        </ErrorBoundary>
      </main>

      {/* Global overlays — reachable from every module. */}
      <CandidateProfileViewer />
      <CandidateEditModal />
      <Toasts />
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

export default function App() {
  return (
    <ThemeProvider>
      <TalentDataProvider>
        <Shell />
      </TalentDataProvider>
    </ThemeProvider>
  );
}

import { useEffect, useRef, useState } from "react";
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
import { Dashboard } from "./modules/Dashboard";
import { Tablero } from "./modules/Tablero";
import { CaraACara } from "./modules/CaraACara";
import { NuevoComparador } from "./modules/NuevoComparador";
import { ProcesosModule } from "./features/processes";
import { EvaluacionesModule } from "./features/assessments";
import { ToastViewport } from "./design-system/liquid-glass/toast";
import { bootstrapPlugins } from "./features/assessments/question-types";
import { ListaPostulantes } from "./modules/ListaPostulantes";
import { Documentacion } from "./modules/Documentacion";
import { Configuracion } from "./modules/Configuracion";
import { DOCK_ITEMS } from "./constants";
import type { ModuleId } from "./types";

// Register the assessment question plugins once at module load.
bootstrapPlugins();

const SUBTITLES: Record<ModuleId, string> = {
  dashboard: "Panel ejecutivo de selección y reclutamiento.",
  tablero: "Visión general del talento y métricas clave.",
  "cara-a-cara": "Duelo 1 vs 1 entre dos postulantes.",
  comparador: "Auditoría comparativa de competencias.",
  procesos: "Operación completa de reclutamiento y selección.",
  evaluaciones: "Plataforma de autoría de evaluaciones estructuradas.",
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
          >
            {active === "dashboard" && <Dashboard />}
            {active === "tablero" && <Tablero />}
            {active === "cara-a-cara" && <CaraACara />}
            {active === "comparador" && <NuevoComparador />}
            {active === "procesos" && <ProcesosModule />}
            {active === "evaluaciones" && <EvaluacionesModule />}
            {active === "postulantes" && <ListaPostulantes />}
            {active === "documentacion" && <Documentacion />}
            {active === "configuracion" && <Configuracion />}
          </motion.section>
        </ErrorBoundary>
      </main>

      {/* Global overlays — reachable from every module. */}
      <CandidateProfileViewer />
      <CandidateEditModal />
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

export default function App() {
  return (
    <ThemeProvider>
      <TalentDataProvider>
        <Shell />
      </TalentDataProvider>
    </ThemeProvider>
  );
}

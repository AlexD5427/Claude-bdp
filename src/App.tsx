import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, useReducedMotion } from "framer-motion";
import { ArrowUpRight, CircleCheck, RefreshCw, WifiOff } from "lucide-react";
import { MeshBackground } from "./components/MeshBackground";
import { ThreeBackground } from "./components/ThreeBackground";
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
import { useConfig } from "./lib/configStore";
import { reiniciarBloqueoScroll } from "./lib/scrollLock";
import { getBundle, logActivity, mergeBackendProfiles, useProfiles } from "./lib/profilesStore";
import { useToolsOpen } from "./lib/toolsStore";
import { ToastViewport } from "./design-system/liquid-glass/toast";
import { LoadingState } from "./components/States";
import { HerramientasPanel } from "./components/tools/HerramientasPanel";
import { DOCK_ITEMS } from "./constants";
import { codigoDesdeHash } from "./features/evaluaciones";
import type { ModuleId } from "./types";
import "./workspace.css";

// El acceso no necesita cargar la interfaz de cada módulo interno.
const MODULES = {
  dashboard: lazy(() => import("./modules/Dashboard").then((m) => ({ default: m.Dashboard }))),
  tablero: lazy(() => import("./modules/Tablero").then((m) => ({ default: m.Tablero }))),
  "cara-a-cara": lazy(() => import("./modules/CaraACara").then((m) => ({ default: m.CaraACara }))),
  comparador: lazy(() => import("./modules/NuevoComparador").then((m) => ({ default: m.NuevoComparador }))),
  procesos: lazy(() => import("./features/processes").then((m) => ({ default: m.ProcesosModule }))),
  evaluaciones: lazy(() => import("./features/evaluaciones").then((m) => ({ default: m.EvaluacionesModule }))),
  postulantes: lazy(() => import("./modules/ListaPostulantes").then((m) => ({ default: m.ListaPostulantes }))),
  perfiles: lazy(() => import("./modules/Perfiles").then((m) => ({ default: m.Perfiles }))),
  documentacion: lazy(() => import("./modules/Documentacion").then((m) => ({ default: m.Documentacion }))),
  configuracion: lazy(() => import("./modules/Configuracion").then((m) => ({ default: m.Configuracion }))),
};

// El enlace de un candidato se resuelve antes de montar el acceso interno.
const EvaluacionRunner = lazy(() =>
  import("./features/evaluaciones").then((m) => ({ default: m.Runner })),
);

const SUBTITLES: Record<ModuleId, string> = {
  dashboard: "Revisa los indicadores de selección y entra a las tareas del día desde un solo lugar.",
  tablero: "Consulta las métricas y la distribución de tu banco de talento.",
  "cara-a-cara": "Contrasta las fortalezas de dos postulantes, lado a lado.",
  comparador: "Compara perfiles, competencias y resultados en una sola vista.",
  procesos: "Da seguimiento a las vacantes y a cada etapa del proceso de selección.",
  evaluaciones: "Diseña, revisa y administra las evaluaciones de selección.",
  postulantes: "Busca, registra y consulta a las personas de tu banco de talento.",
  perfiles: "Define y consulta los perfiles de cargo del banco.",
  documentacion: "Revisa el avance de los expedientes de incorporación.",
  configuracion: "Ajusta tu espacio de trabajo, las integraciones y los formatos de correo.",
};

const QUICK_LINKS: { id: ModuleId; label: string; detail: string }[] = [
  { id: "postulantes", label: "Buscar postulantes", detail: "Abre el banco de talento" },
  { id: "comparador", label: "Comparar perfiles", detail: "Consulta competencias y resultados" },
  { id: "procesos", label: "Revisar procesos", detail: "Continúa el seguimiento de vacantes" },
];

function AppShell() {
  const [active, setActive] = useState<ModuleId>("dashboard");
  const { status, connection, syncing } = useTalentData();
  const { dockPosition, reduceMotion } = useConfig();
  const { current } = useProfiles();
  const { setTheme } = useTheme();
  const toolsOpen = useToolsOpen();
  const systemReduced = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const navigationRequested = useRef(false);
  const offline = connection === "sin-conexion" || status === "error";
  const synced = status === "success" && !syncing && !offline;
  const syncState = offline ? "offline" : synced ? "online" : "busy";
  const SyncIcon = offline ? WifiOff : synced ? CircleCheck : RefreshCw;
  const syncLabel = offline ? "Sin conexión" : synced ? "Base sincronizada" : "Sincronizando datos";

  const appliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!current || appliedFor.current === current.id) return;
    appliedFor.current = current.id;
    const bundle = getBundle(current.id);
    if (bundle.theme) setTheme(bundle.theme);
  }, [current, setTheme]);

  useEffect(() => {
    logActivity({ modulo: active, accion: "Abrió módulo" });
    // Un overlay cerrado al navegar no debe dejar el documento inmóvil.
    reiniciarBloqueoScroll();
    if (!navigationRequested.current) return;
    navigationRequested.current = false;
    window.scrollTo({ top: 0, behavior: "instant" });
    heading.current?.focus({ preventScroll: true });
  }, [active]);

  function selectModule(id: ModuleId) {
    if (id === active || toolsOpen) return;
    navigationRequested.current = true;
    setActive(id);
  }

  const position = DOCK_ITEMS.findIndex((item) => item.id === active);
  const meta = DOCK_ITEMS[position];
  const ModuleIcon = meta.icon;
  const ActiveModule = MODULES[active];
  const showKpis = active !== "dashboard" && active !== "comparador" && active !== "procesos" && active !== "evaluaciones";

  return (
    <div className="bdp-workspace relative min-h-screen">
      <div className="bdp-atmosphere no-print" aria-hidden="true" />
      {!reduceMotion && !systemReduced && <ThreeBackground />}
      <FloatingDock active={active} onSelect={selectModule} synced={synced} offline={offline} />
      <RefreshButton />

      <main className="bdp-stage" data-dock={dockPosition}>
        <div className="bdp-masthead print-scope-hide">
          <div className="bdp-masthead__brand"><BrandHeader /></div>
          <span className="bdp-state no-print" data-state={syncState} role="status">
            <SyncIcon aria-hidden="true" />
            {syncLabel}
          </span>
        </div>

        <header className="bdp-hero print-scope-hide" key={active}>
          <div className="bdp-prism no-print" aria-hidden="true"><span /></div>
          <div className="bdp-hero__copy">
            <div className="bdp-hero__meta no-print">
              <span className="bdp-mark"><ModuleIcon aria-hidden="true" /></span>
              <span className="bdp-eyebrow">{active === "dashboard" ? "Panel ejecutivo" : "Reclutamiento · BDP"}</span>
              <span className="bdp-position" aria-hidden="true">{String(position + 1).padStart(2, "0")} / {DOCK_ITEMS.length}</span>
            </div>
            <h2 id="bdp-module-title" ref={heading} tabIndex={-1}>{meta.label}</h2>
            <p>{SUBTITLES[active]}</p>
          </div>
        </header>

        {active === "dashboard" && (
          <div className="bdp-quick-links no-print" role="group" aria-label="Accesos rápidos del panel">
            {QUICK_LINKS.map(({ id, label, detail }) => {
              const Icon = DOCK_ITEMS.find((item) => item.id === id)!.icon;
              return (
                <button key={id} type="button" className="bdp-quick-link" disabled={toolsOpen} onClick={() => selectModule(id)}>
                  <span className="bdp-mark"><Icon aria-hidden="true" /></span>
                  <span><strong>{label}</strong><small>{detail}</small></span>
                  <ArrowUpRight aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}

        <div className="print-scope-hide"><FilterBar /></div>
        {showKpis && <div className="print-scope-hide"><KpiBar module={active} /></div>}

        {/* Monta el destino de inmediato: jamás espera la salida de otro módulo. */}
        <ErrorBoundary key={active}>
          <section className="bdp-module" data-module={active} aria-labelledby="bdp-module-title">
            <Suspense fallback={<LoadingState />}><ActiveModule /></Suspense>
          </section>
        </ErrorBoundary>
      </main>

      <CandidateProfileViewer />
      <CandidateEditModal />
      <HerramientasPanel />
      <ToastViewport />
    </div>
  );
}

function Shell() {
  const { current } = useProfiles();
  const { perfiles } = useTalentData();

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
  const { reduceMotion } = useConfig();

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
    return () => document.documentElement.classList.remove("reduce-motion");
  }, [reduceMotion]);

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      <ThemeProvider>
        {codigoEvaluacion ? (
          <div className="relative min-h-screen">
            <MeshBackground />
            <Suspense fallback={<LoadingState />}><EvaluacionRunner codigo={codigoEvaluacion} /></Suspense>
            <ToastViewport />
          </div>
        ) : (
          <TalentDataProvider><Shell /></TalentDataProvider>
        )}
      </ThemeProvider>
    </MotionConfig>
  );
}

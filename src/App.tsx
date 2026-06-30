import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MeshBackground } from "./components/MeshBackground";
import { CursorSpotlight } from "./components/CursorSpotlight";
import { FloatingDock } from "./components/FloatingDock";
import { KpiBar } from "./components/KpiBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./context/ThemeContext";
import { TalentDataProvider, useTalentData } from "./context/TalentDataContext";
import { Tablero } from "./modules/Tablero";
import { CaraACara } from "./modules/CaraACara";
import { NuevoComparador } from "./modules/NuevoComparador";
import { Procesos } from "./modules/Procesos";
import { ListaPostulantes } from "./modules/ListaPostulantes";
import { DOCK_ITEMS } from "./constants";
import type { ModuleId } from "./types";

const SUBTITLES: Record<ModuleId, string> = {
  tablero: "Visión general del talento y métricas clave.",
  "cara-a-cara": "Duelo 1 vs 1 entre dos postulantes.",
  comparador: "Auditoría comparativa de competencias.",
  procesos: "Postulantes agrupados por proceso.",
  postulantes: "Listado y registro de postulantes.",
};

function Dashboard() {
  const [active, setActive] = useState<ModuleId>("tablero");
  const { status } = useTalentData();
  const synced = status === "success";

  const meta = DOCK_ITEMS.find((d) => d.id === active)!;

  return (
    <div className="relative min-h-screen">
      <MeshBackground />
      <CursorSpotlight />
      <FloatingDock active={active} onSelect={setActive} synced={synced} />

      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-28 sm:px-6 sm:pt-32">
        <KpiBar />

        <header className="mb-5 mt-8 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 inline-flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-cyan-400 no-print">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-glow-cyan" />
              Banco · Evaluación de Talento
            </p>
            <motion.h1
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.175, 0.885, 0.32, 1.275] }}
              className="text-2xl font-black tracking-tight text-ink sm:text-3xl"
            >
              {meta.label}
            </motion.h1>
            <p className="mt-1 text-sm text-ink-soft">{SUBTITLES[active]}</p>
          </div>
        </header>

        <ErrorBoundary>
          <AnimatePresence mode="wait">
            <motion.section
              key={active}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: [0.175, 0.885, 0.32, 1.275] }}
            >
              {active === "tablero" && <Tablero />}
              {active === "cara-a-cara" && <CaraACara />}
              {active === "comparador" && <NuevoComparador />}
              {active === "procesos" && <Procesos />}
              {active === "postulantes" && <ListaPostulantes />}
            </motion.section>
          </AnimatePresence>
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <TalentDataProvider>
        <Dashboard />
      </TalentDataProvider>
    </ThemeProvider>
  );
}

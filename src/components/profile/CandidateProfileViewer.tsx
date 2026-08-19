import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { bloquearScroll } from "../../lib/scrollLock";
import {
  Award,
  Briefcase,
  FileText,
  Fingerprint,
  GraduationCap,
  History,
  IdCard,
  MessageSquareQuote,
  Pencil,
  ShieldCheck,
  Sparkles,
  UserRound,
  Workflow,
  X,
} from "lucide-react";
import { useTalentData } from "../../context/TalentDataContext";
import { useProfileViewer, closeProfile } from "../../lib/profileViewerStore";
import { openEdit } from "../../lib/candidateEditStore";
import { logActivity } from "../../lib/profilesStore";
import { avatarGradient, extractProceso, initials } from "../../lib/candidates";
import { overallScore } from "../../lib/profileData";
import { upperName, worksAtBdp, bdpRole } from "../../lib/candidateDisplay";
import { discAccent } from "../../lib/discAccent";
import { extractDiscCode } from "../../lib/disc";
import { useHiring, HIRING_LABELS, type HiringStatus } from "../../lib/hiringStore";
import type { Candidate } from "../../types";
import { ResumenTab } from "./ResumenTab";
import { TrayectoriaTab } from "./TrayectoriaTab";
import { EvaluacionesTab } from "./EvaluacionesTab";
import { CurriculumTab } from "./CurriculumTab";
import { ReferenciasTab } from "./ReferenciasTab";
import { DocumentacionTab } from "./DocumentacionTab";
import { HistorialTab } from "./HistorialTab";

type TabId =
  | "resumen"
  | "trayectoria"
  | "evaluaciones"
  | "curriculum"
  | "referencias"
  | "documentacion"
  | "historial";

const TABS: { id: TabId; label: string; icon: typeof Award }[] = [
  { id: "resumen", label: "Resumen", icon: IdCard },
  { id: "trayectoria", label: "Trayectoria", icon: GraduationCap },
  { id: "evaluaciones", label: "Evaluaciones", icon: Award },
  { id: "curriculum", label: "Currículum", icon: FileText },
  { id: "referencias", label: "Referencias", icon: MessageSquareQuote },
  { id: "documentacion", label: "Documentación", icon: Briefcase },
  { id: "historial", label: "Historial", icon: History },
];

const HIRING_TONE: Record<HiringStatus, string> = {
  en_proceso: "bg-white/20 text-white ring-white/40",
  contratado: "bg-emerald-400/90 text-emerald-950 ring-white/50",
  baja: "bg-rose-400/90 text-rose-950 ring-white/50",
};

/**
 * The full candidate profile — a centralised, tabbed panel that gathers a
 * person's every data point in one place. Mounted once at the app root and
 * opened from anywhere via {@link ../../lib/profileViewerStore}.
 */
export function CandidateProfileViewer() {
  const openId = useProfileViewer();
  const { candidatos } = useTalentData();
  const candidate = openId ? candidatos.find((c) => c.id === openId) ?? null : null;

  return createPortal(
    <AnimatePresence>
      {openId && <Viewer key="profile-viewer" candidate={candidate} />}
    </AnimatePresence>,
    document.body,
  );
}

function Viewer({ candidate }: { candidate: Candidate | null }) {
  const [tab, setTab] = useState<TabId>("resumen");
  const closeRef = useRef<HTMLButtonElement>(null);
  const hiring = useHiring();

  // Reset to the first tab whenever a new candidate opens.
  useEffect(() => {
    setTab("resumen");
  }, [candidate?.id]);

  // Trace the profile view into the activity log (best-effort).
  useEffect(() => {
    if (candidate) {
      logActivity({
        modulo: "perfil",
        accion: "Abrió perfil",
        detalle: candidate.identificador ?? candidate.id,
      });
    }
  }, [candidate]);

  // Escape closes; lock the page scroll while open; focus the close button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeProfile();
    };
    document.addEventListener("keydown", onKey);
    const liberarScroll = bloquearScroll();
    const t = window.setTimeout(() => closeRef.current?.focus(), 120);
    return () => {
      document.removeEventListener("keydown", onKey);
      liberarScroll();
      window.clearTimeout(t);
    };
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[110] overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="dialog"
      aria-modal="true"
      aria-label={candidate ? `Perfil de ${candidate.fullName}` : "Perfil de postulante"}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md" onClick={() => closeProfile()} />

      <motion.div
        className="relative z-10 mx-auto my-4 w-full max-w-6xl px-3 sm:px-5"
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
      >
        {candidate ? (
          <div className="glass-heavy overflow-hidden rounded-[2rem] shadow-glass-lg">
            <Hero
              candidate={candidate}
              status={hiring[candidate.id]?.status ?? "en_proceso"}
              closeRef={closeRef}
            />

            {/* Tab bar */}
            <div className="sticky top-0 z-20 border-b border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-3 py-2 backdrop-blur-xl sm:px-5">
              <div className="flex items-center gap-1 overflow-x-auto">
                {TABS.map(({ id, label, icon: Icon }) => {
                  const active = tab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTab(id)}
                      className="relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-colors sm:text-sm"
                    >
                      {active && (
                        <motion.span
                          layoutId="profile-tab-pill"
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                          className="absolute inset-0 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glow-cyan"
                        />
                      )}
                      <span className={`relative ${active ? "text-white" : "text-ink-soft"}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className={`relative ${active ? "text-white" : "text-ink-soft"}`}>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab content */}
            <div className="max-h-[calc(100vh-16rem)] overflow-y-auto px-3 py-5 sm:px-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  {tab === "resumen" && <ResumenTab candidate={candidate} />}
                  {tab === "trayectoria" && <TrayectoriaTab candidate={candidate} />}
                  {tab === "evaluaciones" && <EvaluacionesTab candidate={candidate} />}
                  {tab === "curriculum" && <CurriculumTab candidate={candidate} />}
                  {tab === "referencias" && <ReferenciasTab candidate={candidate} />}
                  {tab === "documentacion" && <DocumentacionTab candidate={candidate} />}
                  {tab === "historial" && <HistorialTab candidate={candidate} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <NotFound closeRef={closeRef} />
        )}
      </motion.div>
    </motion.div>
  );
}

function Hero({
  candidate: c,
  status,
  closeRef,
}: {
  candidate: Candidate;
  status: HiringStatus;
  closeRef: React.RefObject<HTMLButtonElement>;
}) {
  const overall = overallScore(c);
  const disc = String(c.perfil_disc || "").trim();
  const hasDisc = disc && disc.toUpperCase() !== "N/A";
  const accent = discAccent(extractDiscCode(disc));
  const empleado = worksAtBdp(c.trabaja_bdp);

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#004a8f] via-[#005baa] to-[#00b0d8] px-5 py-6 sm:px-7">
      {/* Floating orb */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full bg-white/10 blur-3xl"
        animate={{ x: [0, 20, 0], y: [0, 16, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />

      {/* Top actions */}
      <div className="relative mb-4 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-white ring-1 ring-white/25 backdrop-blur">
          <UserRound className="h-3.5 w-3.5" /> Perfil de postulante
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openEdit(c.id)}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-2 text-xs font-bold text-white ring-1 ring-white/30 backdrop-blur transition-all hover:bg-white/30 active:scale-95"
          >
            <Pencil className="h-4 w-4" /> Editar
          </button>
          <button
            ref={closeRef}
            type="button"
            aria-label="Cerrar perfil"
            onClick={() => closeProfile()}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white ring-1 ring-white/30 backdrop-blur transition-all hover:bg-rose-500/80 active:scale-90"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className={`grid h-24 w-24 shrink-0 place-items-center rounded-3xl bg-gradient-to-br ${avatarGradient(
            c.id,
          )} text-3xl font-black text-white shadow-glass ring-2 ring-white/50`}
        >
          {initials(c.fullName)}
        </motion.div>

        <div className="min-w-0 flex-1">
          <h2 className="wrap-words text-2xl font-black uppercase leading-tight tracking-tight text-white drop-shadow sm:text-3xl">
            {upperName(c.fullName)}
          </h2>
          <p className="mt-0.5 text-sm font-semibold text-cyan-100">
            {empleado ? bdpRole(c.cargo_bdp) ?? "Personal BDP" : "Postulante externo"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip icon={<Fingerprint className="h-3 w-3" />}>{c.identificador || "Sin ID"}</Chip>
            <Chip icon={<Workflow className="h-3 w-3" />}>Proceso {extractProceso(c.identificador)}</Chip>
            {hasDisc && (
              <span
                className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-br ${accent.gradient} px-2.5 py-1 text-[0.7rem] font-bold text-white ring-1 ring-white/40`}
              >
                <Sparkles className="h-3 w-3" /> {disc}
              </span>
            )}
            {c.nivel_general_confiabilidad && (
              <Chip icon={<ShieldCheck className="h-3 w-3" />}>{c.nivel_general_confiabilidad}</Chip>
            )}
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.7rem] font-bold ring-1 ${HIRING_TONE[status]}`}>
              {HIRING_LABELS[status]}
            </span>
          </div>
        </div>

        {overall !== null && (
          <div className="relative shrink-0 self-start rounded-3xl bg-white/15 px-5 py-3 text-center ring-1 ring-white/30 backdrop-blur sm:self-center">
            <div className="text-3xl font-black leading-none text-white drop-shadow">{overall}%</div>
            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-cyan-100">Puntaje general</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[0.7rem] font-semibold text-white ring-1 ring-white/25 backdrop-blur">
      {icon}
      <span className="wrap-words">{children}</span>
    </span>
  );
}

function NotFound({ closeRef }: { closeRef: React.RefObject<HTMLButtonElement> }) {
  return (
    <div className="glass-heavy rounded-[2rem] p-10 text-center shadow-glass-lg">
      <UserRound className="mx-auto h-12 w-12 text-ink-faint" />
      <h3 className="mt-4 text-lg font-black text-ink">Postulante no encontrado</h3>
      <p className="mt-1 text-sm text-ink-soft">
        No se pudo cargar la información de este postulante. Es posible que ya no esté en la base de datos.
      </p>
      <button
        ref={closeRef}
        type="button"
        onClick={() => closeProfile()}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95"
      >
        Cerrar
      </button>
    </div>
  );
}

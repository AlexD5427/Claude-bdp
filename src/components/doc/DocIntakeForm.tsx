import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  FileStack,
  FolderPlus,
  IdCard,
  Info,
  Search,
  ScrollText,
  ShieldQuestion,
  X,
} from "lucide-react";
import { Modal } from "../Modal";
import { PortalDropdown } from "../PortalDropdown";
import { TextField, DateField } from "../form/Fields";
import { Avatar } from "../Avatar";
import { useTalentData } from "../../context/TalentDataContext";
import { createDossier, useDocStore } from "../../lib/docStore";
import { autofillFromCandidate } from "../../lib/docPerson";
import { extractProceso } from "../../lib/candidates";
import { DOC_TEMPLATE } from "../../lib/docTemplate";
import { docYearSheetName } from "../../lib/doc/docSchema";
import { CountUp, ProgressBar, useDocMotion } from "./DocMotion";
import type { Candidate } from "../../types";

interface DocIntakeFormProps {
  open: boolean;
  onClose: () => void;
  onCreated: (identificador: string) => void;
}

/** Cuenta base: los documentos que se piden siempre. */
const TOTAL_PERSONAL = DOC_TEMPLATE.filter((d) => d.group === "personal").length;
const TOTAL_GARANTIA = DOC_TEMPLATE.filter((d) => d.group === "garantia").length;
const TOTAL_CUMPLIMIENTO = DOC_TEMPLATE.filter((d) => d.group === "cumplimiento").length;

/** Comprobación deliberadamente laxa: solo detecta erratas evidentes. */
function correoDudoso(correo: string): boolean {
  const c = correo.trim();
  if (!c) return false;
  return !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);
}

/**
 * «Registrar documentación» — abre el expediente de una persona contratada.
 *
 * Se busca por identificador o nombre y los datos se completan desde la base de
 * candidatos; lo que no esté ahí se escribe a mano. Dos interruptores deciden si
 * se incluyen los documentos de garante y los de cumplimiento/UIF, porque no
 * todos los cargos los requieren.
 *
 * -- Por qué hay un resumen antes de confirmar --------------------------------
 * Los conjuntos opcionales mueven la cuenta de 18 a 31 documentos y el año de la
 * fecha de ingreso decide en qué pestaña del libro cae el registro. Ambas cosas
 * son difíciles de deshacer después, así que se muestran antes de crear nada.
 */
export function DocIntakeForm({ open, onClose, onCreated }: DocIntakeFormProps) {
  const { candidatos } = useTalentData();
  const { dossiers } = useDocStore();
  const m = useDocMotion();

  const [query, setQuery] = useState("");
  const [openList, setOpenList] = useState(false);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [guardando, setGuardando] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    identificador: "",
    nombre: "",
    cargo: "",
    agencia: "",
    gerencia: "",
    correo: "",
    fechaIngreso: "",
  });
  const [includeGarantia, setIncludeGarantia] = useState(false);
  const [includeCumplimiento, setIncludeCumplimiento] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? candidatos.filter(
          (c) =>
            c.fullName.toLowerCase().includes(q) ||
            (c.identificador ?? "").toLowerCase().includes(q) ||
            (c.cargo_bdp ?? "").toLowerCase().includes(q),
        )
      : candidatos;
    return pool.slice(0, 12);
  }, [candidatos, query]);

  const exists = form.identificador.trim() !== "" && !!dossiers[form.identificador.trim()];

  const totalDocs =
    TOTAL_PERSONAL +
    (includeGarantia ? TOTAL_GARANTIA : 0) +
    (includeCumplimiento ? TOTAL_CUMPLIMIENTO : 0);

  const pestanaDestino = useMemo(() => {
    const f = form.fechaIngreso ? new Date(form.fechaIngreso) : new Date();
    const anio = Number.isNaN(f.getTime()) ? new Date().getFullYear() : f.getFullYear();
    return docYearSheetName(anio);
  }, [form.fechaIngreso]);

  const avisoCorreo = correoDudoso(form.correo);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (feedback) setFeedback(null);
  }

  function choose(c: Candidate) {
    const fill = autofillFromCandidate(c);
    setPicked(c);
    setForm({
      identificador: fill.identificador,
      nombre: fill.nombre,
      cargo: fill.cargo,
      agencia: fill.agencia,
      gerencia: fill.gerencia,
      correo: fill.correo,
      fechaIngreso: fill.fechaIngreso || new Date().toISOString().slice(0, 10),
    });
    setQuery("");
    setOpenList(false);
    setFeedback(null);
  }

  function reset() {
    setPicked(null);
    setQuery("");
    setForm({
      identificador: "",
      nombre: "",
      cargo: "",
      agencia: "",
      gerencia: "",
      correo: "",
      fechaIngreso: "",
    });
    setIncludeGarantia(false);
    setIncludeCumplimiento(false);
    setFeedback(null);
    setGuardando(false);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const id = form.identificador.trim();
    if (!id) {
      setFeedback("Ingrese o seleccione un identificador.");
      return;
    }
    if (!form.nombre.trim()) {
      setFeedback("El nombre de la persona es obligatorio.");
      return;
    }
    if (dossiers[id]) {
      setFeedback("Ya existe un expediente para este identificador.");
      return;
    }

    setGuardando(true);
    try {
      createDossier({
        identificador: id,
        nombre: form.nombre.trim(),
        cargo: form.cargo.trim(),
        agencia: form.agencia.trim(),
        gerencia: form.gerencia.trim(),
        correo: form.correo.trim(),
        fechaIngreso: form.fechaIngreso || new Date().toISOString().slice(0, 10),
        seed: { includeGarantia, includeCumplimiento },
      });
    } catch (err) {
      setGuardando(false);
      setFeedback(
        err instanceof Error ? err.message : "No se pudo crear el expediente. Intente de nuevo.",
      );
      return;
    }

    onCreated(id);
    reset();
    onClose();
  }

  return (
    <Modal open={open} onRequestClose={onClose} size="max-w-2xl" ariaLabel="Registrar documentación">
      <form onSubmit={handleCreate}>
        {/* Cabecera */}
        <div className="relative flex items-center gap-3 rounded-t-3xl border-b border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
          <motion.div
            initial={m.activo ? { scale: 0.8, rotate: -8 } : false}
            animate={{ scale: 1, rotate: 0 }}
            transition={m.spring}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glass ring-1 ring-white/30"
          >
            <FolderPlus className="h-6 w-6 text-white drop-shadow-md" />
          </motion.div>
          <div className="min-w-0 flex-1 pr-10">
            <h2 className="truncate text-lg font-black tracking-tight text-ink sm:text-xl">
              Registrar documentación
            </h2>
            <p className="text-xs text-ink-soft">
              Abra el expediente de una persona contratada e inicie el seguimiento.
            </p>
          </div>
          {guardando && <ProgressBar indeterminado className="absolute inset-x-0 bottom-0" />}
        </div>

        <div className="doc-scroll-suave max-h-[calc(100vh-14rem)] space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
          {/* Buscador de persona */}
          <div ref={searchRef} className="relative">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Buscar persona por identificador o nombre
            </span>
            <div className="glass flex items-center gap-2 rounded-2xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-cyan-400/70">
              <Search className="h-4 w-4 shrink-0 text-ink-soft" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpenList(true);
                }}
                onFocus={() => setOpenList(true)}
                placeholder="Ej. 8456872-105-2026 o Nombre…"
                className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none"
                autoComplete="off"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Limpiar">
                  <X className="h-3.5 w-3.5 text-ink-faint hover:text-ink" />
                </button>
              )}
            </div>
            <PortalDropdown
              open={openList && suggestions.length > 0}
              anchorRef={searchRef}
              onClose={() => setOpenList(false)}
              maxHeight={300}
            >
              <ul className="glass-heavy w-full rounded-2xl p-1.5">
                {suggestions.map((c, i) => {
                  const taken = !!dossiers[c.identificador || c.id];
                  return (
                    <motion.li
                      key={c.id}
                      initial={m.activo ? { opacity: 0, x: -6 } : false}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...m.suave, delay: m.activo ? Math.min(i * 0.02, 0.2) : 0 }}
                    >
                      <button
                        type="button"
                        onClick={() => choose(c)}
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:fill-soft"
                      >
                        <Avatar name={c.fullName} seed={c.id} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-ink">
                            {c.fullName}
                          </div>
                          <div className="truncate text-xs text-ink-faint">
                            {c.identificador || "Sin ID"} · Proceso{" "}
                            {extractProceso(c.identificador)}
                          </div>
                        </div>
                        {taken && (
                          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-500 ring-1 ring-emerald-400/30">
                            Con expediente
                          </span>
                        )}
                      </button>
                    </motion.li>
                  );
                })}
              </ul>
            </PortalDropdown>
          </div>

          <AnimatePresence>
            {picked && (
              <motion.div
                initial={m.activo ? { opacity: 0, height: 0 } : false}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={m.suave}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 rounded-2xl fill-soft px-3 py-2 ring-1 ring-[color:var(--hairline)]">
                  <Avatar name={picked.fullName} seed={picked.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-ink">{picked.fullName}</div>
                    <div className="truncate text-xs text-ink-faint">
                      <IdCard className="mr-1 inline h-3 w-3" />
                      Datos autocompletados desde la base de datos
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={reset}
                    className="shrink-0 rounded-full px-2 py-1 text-[0.7rem] font-bold text-ink-faint transition hover:text-ink"
                  >
                    Quitar
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Campos */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Identificador"
              hint="CI - Nro Proceso - Año"
              value={form.identificador}
              onChange={(v) => set("identificador", v)}
              placeholder="CI - Nro Proceso - Año"
            />
            <TextField
              label="Nombre completo"
              required
              value={form.nombre}
              onChange={(v) => set("nombre", v)}
              placeholder="Nombre de la persona"
            />
            <TextField
              label="Cargo"
              value={form.cargo}
              onChange={(v) => set("cargo", v)}
              placeholder="Cargo a ocupar"
            />
            <TextField
              label="Correo electrónico"
              hint={avisoCorreo ? "Revise el formato del correo" : "Para los avisos"}
              value={form.correo}
              onChange={(v) => set("correo", v)}
              placeholder="persona@correo.com"
            />
            <TextField
              label="Agencia"
              value={form.agencia}
              onChange={(v) => set("agencia", v)}
              placeholder="Agencia / sucursal"
            />
            <TextField
              label="Gerencia"
              value={form.gerencia}
              onChange={(v) => set("gerencia", v)}
              placeholder="Gerencia / área"
            />
            <DateField
              label="Fecha de ingreso"
              hint="Inicia la cuenta de alertas"
              value={form.fechaIngreso}
              onChange={(v) => set("fechaIngreso", v)}
            />
          </div>

          {/* Conjuntos opcionales */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Conjuntos de documentos a incluir
            </span>
            <ToggleRow
              icon={<ShieldQuestion className="h-4 w-4" />}
              title="Documentación de garante"
              subtitle={`CI, bien inmueble, folios, garantes familiares… (${TOTAL_GARANTIA} documentos)`}
              checked={includeGarantia}
              onChange={setIncludeGarantia}
            />
            <ToggleRow
              icon={<ScrollText className="h-4 w-4" />}
              title="Cumplimiento y UIF"
              subtitle={`Impedimento Auditor, LGI/FT, examen UIF… (${TOTAL_CUMPLIMIENTO} documentos)`}
              checked={includeCumplimiento}
              onChange={setIncludeCumplimiento}
            />
          </div>

          {/* Resumen previo */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-gradient-to-r from-[#00b0d8]/10 to-[#005baa]/10 px-4 py-3 ring-1 ring-cyan-400/25">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-ink">
              <FileStack className="h-4 w-4 text-[#00b0d8]" />
              <CountUp value={totalDocs} /> documentos por solicitar
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
              <Info className="h-3.5 w-3.5" />
              Se guardará en la pestaña <strong className="text-ink">{pestanaDestino}</strong>
            </span>
          </div>

          {/* Avisos */}
          <AnimatePresence>
            {(feedback || exists) && (
              <motion.div
                initial={m.activo ? { opacity: 0, y: -6 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={m.suave}
                className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-500 ring-1 ring-amber-400/30"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {feedback ?? "Ya existe un expediente para este identificador."}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Pie */}
        <div className="flex items-center justify-end gap-3 rounded-b-3xl border-t border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full fill-softer px-5 py-3 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
          >
            Cancelar
          </button>
          <motion.button
            type="submit"
            disabled={exists || guardando}
            whileHover={m.activo && !exists && !guardando ? { y: -3, scale: 1.03 } : undefined}
            whileTap={m.activo && !exists && !guardando ? { scale: 0.96 } : undefined}
            transition={m.spring}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-6 py-3 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            {guardando ? "Abriendo…" : "Abrir expediente"}
          </motion.button>
        </div>
      </form>
    </Modal>
  );
}

function ToggleRow({
  icon,
  title,
  subtitle,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left ring-1 transition-all active:scale-[0.99]",
        checked
          ? "bg-gradient-to-br from-[#00b0d8]/15 to-[#005baa]/15 ring-cyan-400/40"
          : "fill-softer ring-[color:var(--hairline)] hover:fill-soft",
      ].join(" ")}
    >
      <span
        className={[
          "grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1",
          checked
            ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/30"
            : "fill-soft text-ink-soft ring-[color:var(--hairline)]",
        ].join(" ")}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-ink">{title}</div>
        <div className="text-xs text-ink-faint wrap-words">{subtitle}</div>
      </div>
      <span
        className={[
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked
            ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa]"
            : "fill-soft ring-1 ring-[color:var(--hairline)]",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-all",
            checked ? "left-[1.4rem]" : "left-0.5",
          ].join(" ")}
        />
      </span>
    </button>
  );
}

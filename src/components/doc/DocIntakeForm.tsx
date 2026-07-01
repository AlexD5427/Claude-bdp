import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  IdCard,
  FolderPlus,
  CheckCircle2,
  AlertTriangle,
  ShieldQuestion,
  ScrollText,
} from "lucide-react";
import { Modal } from "../Modal";
import { PortalDropdown } from "../PortalDropdown";
import { TextField, DateField } from "../form/Fields";
import { Avatar } from "../Avatar";
import { useTalentData } from "../../context/TalentDataContext";
import { createDossier, useDocStore } from "../../lib/docStore";
import { autofillFromCandidate } from "../../lib/docPerson";
import { extractProceso } from "../../lib/candidates";
import type { Candidate } from "../../types";

interface DocIntakeFormProps {
  open: boolean;
  onClose: () => void;
  onCreated: (identificador: string) => void;
}

/**
 * "Registrar documentación" — opens a dossier for a hired person. The operator
 * searches by identificador (or name), and the person's data is auto-filled
 * from the live candidate database; anything the sheet doesn't have can be typed
 * in. Two toggles decide whether the garante and UIF/compliance document sets
 * are seeded, since those depend on the type of funcionario.
 */
export function DocIntakeForm({ open, onClose, onCreated }: DocIntakeFormProps) {
  const { candidatos } = useTalentData();
  const { dossiers } = useDocStore();

  const [query, setQuery] = useState("");
  const [openList, setOpenList] = useState(false);
  const [picked, setPicked] = useState<Candidate | null>(null);
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

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
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
    setForm({ identificador: "", nombre: "", cargo: "", agencia: "", gerencia: "", correo: "", fechaIngreso: "" });
    setIncludeGarantia(false);
    setIncludeCumplimiento(false);
    setFeedback(null);
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
    onCreated(id);
    reset();
    onClose();
  }

  return (
    <Modal open={open} onRequestClose={onClose} size="max-w-2xl" ariaLabel="Registrar documentación">
      <form onSubmit={handleCreate}>
        <div className="flex items-center gap-3 rounded-t-3xl border-b border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glass ring-1 ring-white/30">
            <FolderPlus className="h-6 w-6 text-white drop-shadow-md" />
          </div>
          <div className="min-w-0 flex-1 pr-10">
            <h2 className="truncate text-lg font-black tracking-tight text-ink sm:text-xl">
              Registrar documentación
            </h2>
            <p className="text-xs text-ink-soft">
              Abra el expediente de una persona contratada e inicie el seguimiento de sus documentos.
            </p>
          </div>
        </div>

        <div className="max-h-[calc(100vh-14rem)] space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
          {/* Person search */}
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
            </div>
            <PortalDropdown
              open={openList && suggestions.length > 0}
              anchorRef={searchRef}
              onClose={() => setOpenList(false)}
              maxHeight={300}
            >
              <ul className="glass-heavy w-full rounded-2xl p-1.5">
                {suggestions.map((c) => {
                  const taken = !!dossiers[c.identificador || c.id];
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => choose(c)}
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:fill-soft"
                      >
                        <Avatar name={c.fullName} seed={c.id} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-ink">{c.fullName}</div>
                          <div className="truncate text-xs text-ink-faint">
                            {c.identificador || "Sin ID"} · Proceso {extractProceso(c.identificador)}
                          </div>
                        </div>
                        {taken && (
                          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-500 ring-1 ring-emerald-400/30">
                            Con expediente
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </PortalDropdown>
          </div>

          {picked && (
            <div className="flex items-center gap-3 rounded-2xl fill-soft px-3 py-2 ring-1 ring-[color:var(--hairline)]">
              <Avatar name={picked.fullName} seed={picked.id} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-ink">{picked.fullName}</div>
                <div className="truncate text-xs text-ink-faint">
                  <IdCard className="mr-1 inline h-3 w-3" />
                  Datos autocompletados desde la base de datos
                </div>
              </div>
            </div>
          )}

          {/* Editable auto-filled fields */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField label="Identificador" hint="CI - Nro Proceso - Año" value={form.identificador} onChange={(v) => set("identificador", v)} placeholder="CI - Nro Proceso - Año" />
            <TextField label="Nombre completo" required value={form.nombre} onChange={(v) => set("nombre", v)} placeholder="Nombre de la persona" />
            <TextField label="Cargo" value={form.cargo} onChange={(v) => set("cargo", v)} placeholder="Cargo a ocupar" />
            <TextField label="Correo electrónico" hint="Para los avisos" value={form.correo} onChange={(v) => set("correo", v)} placeholder="persona@correo.com" />
            <TextField label="Agencia" value={form.agencia} onChange={(v) => set("agencia", v)} placeholder="Agencia / sucursal" />
            <TextField label="Gerencia" value={form.gerencia} onChange={(v) => set("gerencia", v)} placeholder="Gerencia / área" />
            <DateField label="Fecha de ingreso" hint="Inicia la cuenta de alertas" value={form.fechaIngreso} onChange={(v) => set("fechaIngreso", v)} />
          </div>

          {/* Optional document sets */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Conjuntos de documentos a incluir
            </span>
            <ToggleRow
              icon={<ShieldQuestion className="h-4 w-4" />}
              title="Documentación de garante"
              subtitle="CI, bien inmueble, folios, garantes familiares…"
              checked={includeGarantia}
              onChange={setIncludeGarantia}
            />
            <ToggleRow
              icon={<ScrollText className="h-4 w-4" />}
              title="Cumplimiento y UIF"
              subtitle="Impedimento Auditor, LGI/FT, examen UIF…"
              checked={includeCumplimiento}
              onChange={setIncludeCumplimiento}
            />
          </div>

          <AnimatePresence>
            {(feedback || exists) && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-500 ring-1 ring-amber-400/30"
              >
                <AlertTriangle className="h-4 w-4" />
                {feedback ?? "Ya existe un expediente para este identificador."}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-end gap-3 rounded-b-3xl border-t border-[color:var(--hairline)] bg-[color:var(--glass-bg-heavy)] px-5 py-4 backdrop-blur-xl sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full fill-softer px-5 py-3 text-sm font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={exists}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-6 py-3 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            Abrir expediente
          </button>
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
          checked ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/30" : "fill-soft text-ink-soft ring-[color:var(--hairline)]",
        ].join(" ")}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-ink">{title}</div>
        <div className="truncate text-xs text-ink-faint">{subtitle}</div>
      </div>
      <span
        className={[
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa]" : "fill-soft ring-1 ring-[color:var(--hairline)]",
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

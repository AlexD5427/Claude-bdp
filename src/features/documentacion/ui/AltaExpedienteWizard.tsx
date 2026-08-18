/**
 * Asistente de «Nuevo expediente».
 *
 * ── Qué resuelve ────────────────────────────────────────────────────────────
 * El alta anterior era un único panel con desplegables. El proceso real del área
 * es un CAMINO: primero la identidad de la persona, luego los documentos
 * generales, luego el TIPO DE FUNCIONARIO —el punto de inflexión que decide qué
 * documentos especiales se exigen— y, para el área comercial, el tipo de garantía.
 * Cada categoría es única y excluyente: el expediente ve SOLO los documentos de su
 * rama, de principio a fin.
 *
 * ── De dónde salen los documentos ───────────────────────────────────────────
 * De una sola fuente: el catálogo del backend (`documentacion.catalogo`), con su
 * mapa de aplicabilidad por rama. El asistente NO inventa la lista: pinta la que
 * el backend va a crear. Así el formulario y el expediente no pueden discrepar.
 *
 * ── Cómo se guarda ──────────────────────────────────────────────────────────
 * 1) se crea el expediente con su identidad y su rama (el backend genera los
 *    requisitos en PENDIENTE); 2) se leen sus requisitos para conocer el id de
 *    cada uno; 3) se aplican en un solo lote los estados y observaciones que se
 *    marcaron; 4) se registran las prórrogas indicadas. Es idempotente: una
 *    `idempotencyKey` por apertura evita el alta doble ante un doble clic.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  FolderPlus,
  HardHat,
  MessageSquarePlus,
  ShieldQuestion,
  Timer,
  X,
} from "lucide-react";
import { docApi } from "../api/acciones";
import { useConsola } from "../state/consola";
import { DURACION, CURVA, resorte, useMovimientoReducido } from "./DocMotion";
import { Aviso, Boton, Campo, Confirmacion, Entrada, TONO } from "./piezas";
import { CampoFecha, diasDesdeHoy, fechaLegible } from "./CampoFecha";
import { SelectorAuxiliar } from "./SelectorAuxiliar";
import { bloquearScroll } from "../../../lib/scrollLock";
import { useFormDraft } from "../../../hooks/useFormDraft";
import {
  CATEGORIAS,
  CATEGORIA_GENERAL,
  GARANTIAS_COMERCIAL,
  categoriaDe,
  estiloCategoria,
  hexAlpha,
  type Categoria,
} from "../domain/categorias";
import {
  INTENCION_DOCUMENTO,
  ETIQUETA_DOCUMENTO,
  type EstadoDocumento,
} from "../domain/vocabulario";
import { hoy } from "../domain/progreso";
import type { CatalogoCliente, CatalogoDocumento } from "../api/acciones";

/* ------------------------------------------------------------------ */
/* Tipos y utilidades                                                  */
/* ------------------------------------------------------------------ */

interface EstadoDoc {
  estado: EstadoDocumento;
  observaciones: string;
  prorrogaActiva: boolean;
  prorrogaFecha: string;
  prorrogaMotivo: string;
}

function docInicial(): EstadoDoc {
  return { estado: "PENDIENTE", observaciones: "", prorrogaActiva: false, prorrogaFecha: "", prorrogaMotivo: "" };
}

type PasoId = "identidad" | "generales" | "categoria" | "especificos" | "revision";

interface Paso {
  id: PasoId;
  titulo: string;
  descripcion: string;
}

const IDENTIFICADOR_RE = /^\s*\d{5,}\s*[-–]\s*\d+\s*[-–]\s*\d{4}\s*$/;

interface Identidad {
  identificador: string;
  nombre: string;
  cargo: string;
  agencia: string;
  gerencia: string;
  fechaIngreso: string;
  responsableId: string;
}

const IDENTIDAD_VACIA: Identidad = {
  identificador: "",
  nombre: "",
  cargo: "",
  agencia: "",
  gerencia: "",
  fechaIngreso: "",
  responsableId: "",
};

/**
 * Borrador del asistente.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Llenar un expediente son entre veinte y treinta decisiones. Perderlas por una
 * pestaña cerrada, un navegador que se recarga o un clic fuera del panel es la
 * clase de fricción que hace que la gente vuelva al Excel. El borrador se guarda
 * en este equipo mientras se escribe y se ofrece al volver a abrir el asistente:
 * continuar o empezar de cero, decidido siempre por la persona.
 *
 * Solo se guarda lo que la persona escribió; nada llega al libro hasta que pulsa
 * «Guardar y abrir expediente». Al guardar con éxito, el borrador se borra.
 */
const CLAVE_BORRADOR = "bdp-documentacion-alta-borrador";

interface BorradorAlta {
  form: Identidad;
  categoria: string;
  garantia: string;
  docs: Record<string, EstadoDoc>;
  paso: PasoId;
}

/** ¿Tiene el borrador algo que valga la pena recuperar? */
function borradorConContenido(b: BorradorAlta): boolean {
  return (
    b.form.identificador.trim() !== "" ||
    b.form.nombre.trim() !== "" ||
    b.categoria !== "" ||
    Object.keys(b.docs).length > 0
  );
}

/* ------------------------------------------------------------------ */
/* Componente principal                                                */
/* ------------------------------------------------------------------ */

export function AltaExpedienteWizard({
  abierta,
  onCerrar,
  onCreado,
  onError,
  onAviso,
}: {
  abierta: boolean;
  onCerrar: () => void;
  onCreado: (expedienteId: string, requisitos: number) => void;
  onError: (mensaje: string, pista?: string) => void;
  /** Avisos no bloqueantes (por ejemplo, un valor añadido al catálogo auxiliar). */
  onAviso?: (intencion: "info" | "exito" | "aviso" | "peligro", texto: string, pista?: string) => void;
}) {
  return (
    <AnimatePresence>
      {abierta && <WizardCuerpo onCerrar={onCerrar} onCreado={onCreado} onError={onError} onAviso={onAviso} />}
    </AnimatePresence>
  );
}

function WizardCuerpo({
  onCerrar,
  onCreado,
  onError,
  onAviso,
}: {
  onCerrar: () => void;
  onCreado: (expedienteId: string, requisitos: number) => void;
  onError: (mensaje: string, pista?: string) => void;
  onAviso?: (intencion: "info" | "exito" | "aviso" | "peligro", texto: string, pista?: string) => void;
}) {
  const { catalogo } = useConsola();
  const reducido = useMovimientoReducido();

  const [paso, setPaso] = useState<PasoId>("identidad");
  const [form, setForm] = useState(IDENTIDAD_VACIA);
  const [categoria, setCategoria] = useState<string>("");
  const [garantia, setGarantia] = useState<string>("");
  const [docs, setDocs] = useState<Record<string, EstadoDoc>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [pidiendoCierre, setPidiendoCierre] = useState(false);
  const [clave] = useState(() => `alta_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);

  const borradorActual: BorradorAlta = { form, categoria, garantia, docs, paso };
  const { recoveredDraft, savedAt, clearDraft } = useFormDraft<BorradorAlta>(
    CLAVE_BORRADOR,
    borradorActual,
    borradorConContenido,
  );
  const [ofreciendoBorrador, setOfreciendoBorrador] = useState(Boolean(recoveredDraft));

  function retomarBorrador() {
    if (!recoveredDraft) return;
    setForm({ ...IDENTIDAD_VACIA, ...recoveredDraft.form });
    setCategoria(recoveredDraft.categoria ?? "");
    setGarantia(recoveredDraft.garantia ?? "");
    setDocs(recoveredDraft.docs ?? {});
    setPaso(recoveredDraft.paso ?? "identidad");
    setOfreciendoBorrador(false);
  }

  function descartarBorrador() {
    clearDraft();
    setOfreciendoBorrador(false);
  }

  useEffect(() => bloquearScroll(), []);

  const cat: Categoria | null = categoria ? categoriaDe(categoria) : null;
  const esComercial = categoria === "COMERCIAL";
  const enConstruccion = Boolean(cat && !cat.activa);

  const documentos = catalogo?.documentos ?? [];
  const generales = useMemo(() => documentos.filter((d) => d.seccion === "generales"), [documentos]);

  /** Códigos aplicables a la rama elegida, según el backend. */
  const codigosAplicables = useMemo(() => {
    if (!catalogo || !categoria) return [] as string[];
    const objetivoGarantia = esComercial ? garantia : "NINGUNA";
    const rama = catalogo.aplicabilidad.find(
      (a) => a.tipoFuncionario === categoria && a.tipoGarantia === objetivoGarantia,
    );
    return rama?.codigos ?? [];
  }, [catalogo, categoria, esComercial, garantia]);

  /** Documentos específicos de la categoría (los que no son generales). */
  const especificos = useMemo(() => {
    const generalesSet = new Set(generales.map((d) => d.codigo));
    return codigosAplicables
      .filter((c) => !generalesSet.has(c))
      .map((c) => documentos.find((d) => d.codigo === c))
      .filter((d): d is CatalogoDocumento => Boolean(d));
  }, [codigosAplicables, documentos, generales]);

  const hayDatos =
    form.identificador.trim() !== "" || form.nombre.trim() !== "" || categoria !== "" || Object.keys(docs).length > 0;

  const pasos: Paso[] = [
    { id: "identidad", titulo: "Identidad", descripcion: "Quién es y de dónde viene." },
    { id: "generales", titulo: "Documentos generales", descripcion: "Requisitos de toda incorporación." },
    { id: "categoria", titulo: "Tipo de funcionario", descripcion: "El punto de inflexión del expediente." },
    { id: "especificos", titulo: "Requisitos de la categoría", descripcion: "Solo los de su rama." },
    { id: "revision", titulo: "Revisión y guardado", descripcion: "Confirma y abre el expediente." },
  ];
  const indice = pasos.findIndex((p) => p.id === paso);

  function poner(campo: keyof typeof form, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    setErrores((prev) => {
      if (!prev[campo]) return prev;
      const s = { ...prev };
      delete s[campo];
      return s;
    });
  }

  function ponerDoc(codigo: string, patch: Partial<EstadoDoc>) {
    setDocs((prev) => ({ ...prev, [codigo]: { ...docInicial(), ...prev[codigo], ...patch } }));
  }

  /* --- Validación por paso --- */
  function validarIdentidad(): boolean {
    const e: Record<string, string> = {};
    if (!form.identificador.trim()) e.identificador = "Escribe el identificador (CI - N.º de proceso - año).";
    else if (!IDENTIFICADOR_RE.test(form.identificador)) e.identificador = "Formato esperado: 1234567 - 45 - 2026.";
    if (!form.nombre.trim()) e.nombre = "Escribe el nombre completo.";
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  function puedeAvanzar(): boolean {
    if (paso === "identidad") return validarIdentidad();
    if (paso === "categoria") {
      if (!categoria) {
        setErrores({ categoria: "Elige el tipo de funcionario." });
        return false;
      }
      if (enConstruccion) {
        setErrores({ categoria: "Esta categoría aún no admite expedientes." });
        return false;
      }
      if (esComercial && !garantia) {
        setErrores({ garantia: "Elige el tipo de garantía." });
        return false;
      }
    }
    return true;
  }

  function avanzar() {
    if (!puedeAvanzar()) return;
    setErrores({});
    setPaso(pasos[Math.min(indice + 1, pasos.length - 1)].id);
  }

  function retroceder() {
    setErrores({});
    setPaso(pasos[Math.max(indice - 1, 0)].id);
  }

  function irA(destino: PasoId) {
    const idxDestino = pasos.findIndex((p) => p.id === destino);
    // Solo se puede saltar hacia atrás, o hacia adelante si los pasos previos son válidos.
    if (idxDestino <= indice) {
      setErrores({});
      setPaso(destino);
      return;
    }
    if (paso === "identidad" && !validarIdentidad()) return;
    setErrores({});
    setPaso(destino);
  }

  async function guardar() {
    if (!validarIdentidad()) {
      setPaso("identidad");
      return;
    }
    if (!categoria || enConstruccion || (esComercial && !garantia)) {
      setPaso("categoria");
      setErrores(esComercial && !garantia ? { garantia: "Elige el tipo de garantía." } : { categoria: "Elige el tipo de funcionario." });
      return;
    }

    setGuardando(true);
    try {
      const creado = await docApi.crearExpediente({
        identificador: form.identificador.trim(),
        nombre: form.nombre.trim(),
        cargo: form.cargo.trim(),
        agencia: form.agencia.trim(),
        gerencia: form.gerencia.trim(),
        fechaIngreso: form.fechaIngreso,
        responsableId: form.responsableId.trim(),
        tipoFuncionario: categoria,
        tipoGarantia: esComercial ? garantia : "NINGUNA",
        idempotencyKey: clave,
      });

      // Segundo paso: aplicar los estados/observaciones marcados en el asistente.
      // Se lee el expediente recién creado para conocer el id de cada requisito.
      const detalle = await docApi.obtenerExpediente(creado.expedienteId);
      const porCodigo = new Map(detalle.requisitos.map((r) => [r.codigo, r]));

      const cambios: { expedienteDocumentoId: string; version?: number; estado?: string; observaciones?: string }[] = [];
      for (const [codigo, ed] of Object.entries(docs)) {
        const req = porCodigo.get(codigo);
        if (!req) continue; // no aplica a esta rama: se ignora en silencio
        const cambioEstado = ed.estado !== "PENDIENTE";
        const cambioObs = ed.observaciones.trim() !== "";
        if (cambioEstado || cambioObs) {
          cambios.push({
            expedienteDocumentoId: req.expedienteDocumentoId,
            version: req.version,
            ...(cambioEstado ? { estado: ed.estado } : {}),
            ...(cambioObs ? { observaciones: ed.observaciones.trim() } : {}),
          });
        }
      }
      if (cambios.length) await docApi.guardarRequisitos(creado.expedienteId, cambios);

      // Tercer paso: registrar prórrogas indicadas (una por una: cada una audita).
      for (const [codigo, ed] of Object.entries(docs)) {
        if (!ed.prorrogaActiva || !ed.prorrogaFecha) continue;
        const req = porCodigo.get(codigo);
        if (!req || !req.permiteProrroga) continue;
        try {
          await docApi.crearProrroga({
            expedienteDocumentoId: req.expedienteDocumentoId,
            fechaProrroga: ed.prorrogaFecha,
            motivo: ed.prorrogaMotivo.trim() || "Prórroga registrada al abrir el expediente.",
          });
        } catch (e) {
          // Una prórroga que falla no debe tumbar el alta: se avisa y se sigue.
          const f = e as { message?: string };
          onError(`El expediente se creó, pero una prórroga no se registró: ${f.message ?? ""}`);
        }
      }

      clearDraft();
      onCreado(creado.expedienteId, creado.requisitos ?? codigosAplicables.length);
    } catch (error) {
      const fallo = error as { message?: string; pista?: string; campos?: Record<string, string> };
      if (fallo.campos && Object.keys(fallo.campos).length) {
        setErrores(fallo.campos);
        if (fallo.campos.identificador || fallo.campos.nombre) setPaso("identidad");
      }
      onError(fallo.message ?? "No se pudo crear el expediente.", fallo.pista);
    } finally {
      setGuardando(false);
    }
  }

  function intentarCerrar() {
    if (guardando) return;
    // Confirmación de la propia interfaz: `window.confirm` bloquea el hilo y, si
    // alguien marca «no volver a mostrar estos diálogos», deja de poder cerrarse.
    if (hayDatos) {
      setPidiendoCierre(true);
      return;
    }
    onCerrar();
  }

  /* Cinta de estado del borrador: dice que nada se está perdiendo mientras se
     escribe, y ofrece retomar el que quedó de la última vez. */
  const cintaBorrador = ofreciendoBorrador && recoveredDraft ? (
    <div className="mx-auto mb-4 w-full max-w-3xl">
      <Aviso intencion="info" titulo="Hay un expediente a medio llenar">
        <span className="block">
          Se guardó en este equipo {savedAt ? `el ${new Date(savedAt).toLocaleString("es-BO")}` : "en la sesión anterior"}
          {recoveredDraft.form.nombre ? ` · ${recoveredDraft.form.nombre}` : ""}.
        </span>
        <span className="mt-2 flex flex-wrap gap-2">
          <Boton variante="primario" onClick={retomarBorrador}>
            Continuar donde lo dejé
          </Boton>
          <Boton variante="suave" onClick={descartarBorrador}>
            Empezar de cero
          </Boton>
        </span>
      </Aviso>
    </div>
  ) : null;

  const contenido = (
    <motion.div
      key={paso}
      initial={reducido ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reducido ? undefined : { opacity: 0, x: -18, transition: { duration: DURACION.rapida, ease: CURVA.salidaQuint } }}
      transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo }}
      className="mx-auto w-full max-w-3xl"
    >
      {paso === "identidad" && (
        <PasoIdentidad form={form} poner={poner} errores={errores} catalogo={catalogo} reducido={reducido} onAviso={onAviso} />
      )}
      {paso === "generales" && (
        <PasoDocumentos
          titulo="Documentos generales"
          descripcion="Requisitos de toda incorporación. Puedes marcarlos ahora o dejarlos pendientes y completarlos en el expediente."
          documentos={generales}
          docs={docs}
          onDoc={ponerDoc}
          reducido={reducido}
        />
      )}
      {paso === "categoria" && (
        <PasoCategoria
          categoria={categoria}
          garantia={garantia}
          onCategoria={(c) => {
            setCategoria(c);
            setErrores({});
            if (c !== "COMERCIAL") setGarantia("");
          }}
          onGarantia={(g) => {
            setGarantia(g);
            setErrores({});
          }}
          errores={errores}
          reducido={reducido}
        />
      )}
      {paso === "especificos" && (
        <PasoEspecificos
          categoria={cat ?? CATEGORIA_GENERAL}
          garantia={garantia}
          documentos={especificos}
          enConstruccion={enConstruccion}
          docs={docs}
          onDoc={ponerDoc}
          reducido={reducido}
        />
      )}
      {paso === "revision" && (
        <PasoRevision
          form={form}
          categoria={cat ?? CATEGORIA_GENERAL}
          garantia={garantia}
          generales={generales}
          especificos={especificos}
          docs={docs}
          onIr={irA}
        />
      )}
    </motion.div>
  );

  const overlay = (
    <>
      <motion.div
        className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm"
        initial={reducido ? undefined : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reducido ? undefined : { opacity: 0 }}
        transition={{ duration: reducido ? 0 : DURACION.rapida }}
        onClick={intentarCerrar}
        aria-hidden
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo expediente documental"
        className="doc-console fixed inset-0 z-[101] flex flex-col sm:inset-3 sm:rounded-[var(--doc-radius-lg,20px)] glass-heavy sm:border sm:border-[color:var(--doc-border)]"
        initial={reducido ? undefined : { opacity: 0, y: 24, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reducido ? undefined : { opacity: 0, y: 16, scale: 0.99, transition: { duration: DURACION.rapida, ease: CURVA.salidaQuint } }}
        transition={resorte(reducido)}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <Encabezado pasos={pasos} indice={indice} onIr={irA} onCerrar={intentarCerrar} />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {cintaBorrador}
          {/* Sin `mode="wait"`: si un paso no reporta el fin de su salida, el
              siguiente no se montaría nunca y el asistente quedaría en blanco. */}
          {contenido}
        </div>

        <Pie
          indice={indice}
          total={pasos.length}
          enConstruccion={enConstruccion}
          guardando={guardando}
          onRetroceder={retroceder}
          onAvanzar={avanzar}
          onGuardar={guardar}
        />
      </motion.div>

      <Confirmacion
        abierta={pidiendoCierre}
        titulo="¿Cerrar el asistente?"
        detalle="Hay datos escritos. Se guarda un borrador en este equipo, así que podrás continuar donde lo dejaste al volver a abrirlo."
        textoConfirmar="Cerrar"
        onConfirmar={() => {
          setPidiendoCierre(false);
          onCerrar();
        }}
        onCancelar={() => setPidiendoCierre(false)}
      />
    </>
  );

  return createPortal(overlay, document.body);
}

/* ------------------------------------------------------------------ */
/* Encabezado con indicador de pasos                                   */
/* ------------------------------------------------------------------ */

function Encabezado({
  pasos,
  indice,
  onIr,
  onCerrar,
}: {
  pasos: Paso[];
  indice: number;
  onIr: (id: PasoId) => void;
  onCerrar: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-[color:var(--doc-border)] px-4 py-3 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: "var(--doc-info-bg)", color: "var(--doc-info-fg)" }}>
              <FolderPlus className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="doc-balance text-sm font-semibold text-[color:var(--doc-text)]">Nuevo expediente documental</h2>
              <p className="doc-prose truncate text-[11px] text-[color:var(--doc-text-muted)]">{pasos[indice]?.descripcion}</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="doc-tap rounded-xl p-2 text-[color:var(--doc-text-muted)] transition-colors hover:bg-[color:var(--doc-surface-raised)] hover:text-[color:var(--doc-text)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Pasos: navegación cómoda hacia atrás, con progreso animado. */}
      <ol className="mt-3 flex items-center gap-1 overflow-x-auto pb-1" aria-label="Pasos del asistente">
        {pasos.map((p, i) => {
          const hecho = i < indice;
          const activo = i === indice;
          return (
            <li key={p.id} className="flex items-center">
              <button
                type="button"
                onClick={() => onIr(p.id)}
                aria-current={activo ? "step" : undefined}
                className="doc-tap group flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
                style={{
                  color: activo ? "var(--doc-info-fg)" : hecho ? "var(--doc-success-fg)" : "var(--doc-text-faint)",
                  background: activo ? "var(--doc-info-bg)" : hecho ? "var(--doc-success-bg)" : "transparent",
                }}
              >
                <span
                  className="grid h-4 w-4 place-items-center rounded-full text-[9px]"
                  style={{
                    background: activo ? "var(--doc-info)" : hecho ? "var(--doc-success)" : "var(--doc-surface-sunken)",
                    color: activo || hecho ? "#04121f" : "var(--doc-text-faint)",
                  }}
                >
                  {hecho ? <Check className="h-2.5 w-2.5" aria-hidden /> : i + 1}
                </span>
                <span className="hidden sm:inline">{p.titulo}</span>
              </button>
              {i < pasos.length - 1 && <ChevronRight className="h-3 w-3 shrink-0 text-[color:var(--doc-text-faint)]" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Pie con navegación                                                  */
/* ------------------------------------------------------------------ */

function Pie({
  indice,
  total,
  enConstruccion,
  guardando,
  onRetroceder,
  onAvanzar,
  onGuardar,
}: {
  indice: number;
  total: number;
  enConstruccion: boolean;
  guardando: boolean;
  onRetroceder: () => void;
  onAvanzar: () => void;
  onGuardar: () => void;
}) {
  const esUltimo = indice === total - 1;
  return (
    <footer className="shrink-0 border-t border-[color:var(--doc-border)] bg-[color:var(--doc-surface)] px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <Boton variante="suave" onClick={onRetroceder} disabled={indice === 0 || guardando}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Atrás
        </Boton>
        {esUltimo ? (
          <Boton variante="primario" onClick={onGuardar} cargando={guardando}>
            <FolderPlus className="h-3.5 w-3.5" aria-hidden /> Guardar y abrir expediente
          </Boton>
        ) : (
          <Boton variante="primario" onClick={onAvanzar} disabled={enConstruccion || guardando}>
            Continuar <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Boton>
        )}
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Paso 1 — Identidad                                                  */
/* ------------------------------------------------------------------ */

function PasoIdentidad({
  form,
  poner,
  errores,
  catalogo,
  reducido,
  onAviso,
}: {
  form: { identificador: string; nombre: string; cargo: string; agencia: string; gerencia: string; fechaIngreso: string; responsableId: string };
  poner: (campo: keyof typeof form, valor: string) => void;
  errores: Record<string, string>;
  catalogo: CatalogoCliente | null;
  reducido: boolean;
  onAviso?: (intencion: "info" | "exito" | "aviso" | "peligro", texto: string, pista?: string) => void;
}) {
  const agencias = catalogo?.auxiliares.agencia_bdp ?? [];
  const gerencias = catalogo?.auxiliares.gerencia_bdp ?? [];

  return (
    <div className="space-y-5">
      <Encabezadillo titulo="¿Quién ingresa?" detalle="El identificador y el nombre son obligatorios; el resto ayuda a clasificar y a reportar." />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Identificador" requerido error={errores.identificador} ayuda="Formato del área: CI - número de proceso - año.">
          <Entrada
            value={form.identificador}
            onChange={(e) => poner("identificador", e.target.value)}
            placeholder="1234567 - 45 - 2026"
            data-foco-inicial
            autoFocus
          />
        </Campo>
        <Campo etiqueta="Nombre completo" requerido error={errores.nombre}>
          <Entrada value={form.nombre} onChange={(e) => poner("nombre", e.target.value)} placeholder="Nombres y apellidos" />
        </Campo>
        <Campo etiqueta="Cargo">
          <Entrada value={form.cargo} onChange={(e) => poner("cargo", e.target.value)} placeholder="Ej. Oficial de Negocios" />
        </Campo>
        <Campo etiqueta="Agencia" ayuda="Del libro: hoja Auxiliar, columna agencia_bdp. Se puede añadir una nueva.">
          <SelectorAuxiliar
            valor={form.agencia}
            onChange={(v) => poner("agencia", v)}
            opciones={agencias}
            columna="agencia_bdp"
            placeholder={agencias.length ? "Elige una agencia" : "Escribe la agencia y añádela"}
            onAviso={onAviso}
          />
        </Campo>
        <Campo etiqueta="Gerencia" ayuda="Del libro: hoja Auxiliar, columna gerencia_bdp. Se puede añadir una nueva.">
          <SelectorAuxiliar
            valor={form.gerencia}
            onChange={(v) => poner("gerencia", v)}
            opciones={gerencias}
            columna="gerencia_bdp"
            placeholder={gerencias.length ? "Elige una gerencia" : "Escribe la gerencia y añádela"}
            onAviso={onAviso}
          />
        </Campo>
        <Campo etiqueta="Responsable del proceso" ayuda="Quien persigue la documentación.">
          <Entrada value={form.responsableId} onChange={(e) => poner("responsableId", e.target.value)} placeholder="Nombre o correo" />
        </Campo>
      </div>

      <SelectorFecha valor={form.fechaIngreso} onChange={(v) => poner("fechaIngreso", v)} reducido={reducido} />
    </div>
  );
}

/**
 * Fecha de ingreso.
 *
 * Usa el calendario propio del módulo (`CampoFecha`): rejilla mensual, atajos al
 * pasado, teclado completo y eco legible. El máximo es hoy —no se registra un
 * ingreso futuro— y el año elegido es el que decide en qué pestaña anual del libro
 * aterriza el expediente, así que se dice en voz alta.
 */
function SelectorFecha({ valor, onChange, reducido }: { valor: string; onChange: (v: string) => void; reducido: boolean }) {
  const anio = valor ? valor.slice(0, 4) : "";
  return (
    <div className="doc-sunken rounded-[var(--doc-radius,14px)] p-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4" style={{ color: "var(--doc-info)" }} aria-hidden />
        <span className="text-xs font-semibold text-[color:var(--doc-text)]">Fecha de ingreso</span>
      </div>
      <p className="doc-prose mt-0.5 text-[11px] text-[color:var(--doc-text-faint)]">
        Decide el año del libro y la antigüedad de la persona.
      </p>
      <div className="mt-3 max-w-xs">
        <CampoFecha
          valor={valor}
          onChange={onChange}
          max={hoy()}
          sentido="pasado"
          etiquetaAccesible="Fecha de ingreso"
        />
      </div>
      <AnimatePresence initial={false}>
        {anio && (
          <motion.p
            key={anio}
            initial={reducido ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducido ? undefined : { opacity: 0 }}
            className="mt-2 text-[11px] text-[color:var(--doc-text-muted)]"
          >
            El expediente se escribirá en la pestaña <strong>CONTROL INGRESOS {anio}</strong>.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pasos 2 y 4 — listas de documentos con chips                        */
/* ------------------------------------------------------------------ */

function PasoDocumentos({
  titulo,
  descripcion,
  documentos,
  docs,
  onDoc,
  reducido,
  acento,
}: {
  titulo: string;
  descripcion: string;
  documentos: CatalogoDocumento[];
  docs: Record<string, EstadoDoc>;
  onDoc: (codigo: string, patch: Partial<EstadoDoc>) => void;
  reducido: boolean;
  acento?: string;
}) {
  return (
    <div className="space-y-4">
      <Encabezadillo titulo={titulo} detalle={descripcion} acento={acento} />
      <ul className="space-y-2.5">
        {documentos.map((doc, i) => (
          <FilaDocumento key={doc.codigo} doc={doc} estado={docs[doc.codigo] ?? docInicial()} onDoc={onDoc} reducido={reducido} orden={i} />
        ))}
      </ul>
    </div>
  );
}

const ESTADOS_CHIP: EstadoDocumento[] = ["ENTREGADO", "PENDIENTE", "NO_ENTREGADO"];

function FilaDocumento({
  doc,
  estado,
  onDoc,
  reducido,
  orden,
}: {
  doc: CatalogoDocumento;
  estado: EstadoDoc;
  onDoc: (codigo: string, patch: Partial<EstadoDoc>) => void;
  reducido: boolean;
  orden: number;
}) {
  const [obsAbierta, setObsAbierta] = useState(false);
  const opciones: EstadoDocumento[] = doc.permiteNoAplica ? [...ESTADOS_CHIP, "NO_APLICA"] : ESTADOS_CHIP;
  const mostrarObs = obsAbierta || estado.observaciones.trim() !== "";
  const diasProrroga = estado.prorrogaActiva && estado.prorrogaFecha ? diasDesdeHoy(estado.prorrogaFecha) : null;

  return (
    <motion.li
      initial={reducido ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo, delay: Math.min(orden * 0.02, 0.2) }}
      className="doc-raised rounded-[var(--doc-radius,14px)] p-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[color:var(--doc-text)]">
            {doc.nombre}
            {doc.obligatorio ? <span className="ml-1 align-super text-[10px]" style={{ color: "var(--doc-danger)" }} aria-hidden>*</span> : null}
          </p>
          {doc.descripcion && <p className="doc-prose mt-0.5 text-[11px] text-[color:var(--doc-text-faint)]">{doc.descripcion}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {opciones.map((op) => (
            <ChipEstadoSeleccionable key={op} estado={op} activo={estado.estado === op} onClick={() => onDoc(doc.codigo, { estado: op })} />
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setObsAbierta((v) => !v)}
          className="doc-tap inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--doc-text-muted)] transition-colors hover:text-[color:var(--doc-text)]"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
          {mostrarObs ? "Observación" : "Añadir observación"}
        </button>
        {doc.permiteProrroga && (
          <button
            type="button"
            onClick={() => onDoc(doc.codigo, { prorrogaActiva: !estado.prorrogaActiva })}
            className="doc-tap inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors"
            style={
              estado.prorrogaActiva
                ? { background: TONO.aviso.fondo, color: TONO.aviso.texto, boxShadow: `inset 0 0 0 1px ${TONO.aviso.borde}` }
                : { color: "var(--doc-text-muted)", boxShadow: "inset 0 0 0 1px var(--doc-border)" }
            }
          >
            <Timer className="h-3.5 w-3.5" aria-hidden />
            {estado.prorrogaActiva ? "Prórroga activa" : "Conceder prórroga"}
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {mostrarObs && (
          <motion.div
            initial={reducido ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reducido ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: reducido ? 0 : DURACION.normal, ease: CURVA.salidaQuint }}
            className="overflow-hidden"
          >
            <textarea
              value={estado.observaciones}
              onChange={(e) => onDoc(doc.codigo, { observaciones: e.target.value })}
              placeholder={`Observaciones (${doc.nombre})`}
              rows={2}
              className="mt-2 w-full resize-y rounded-[var(--doc-radius-sm)] border border-[color:var(--doc-border)] bg-[color:var(--doc-surface)] px-3 py-2 text-sm text-[color:var(--doc-text)] outline-none transition-colors placeholder:text-[color:var(--doc-text-faint)] focus:border-[color:var(--doc-focus)]"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {estado.prorrogaActiva && (
          <motion.div
            initial={reducido ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reducido ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: reducido ? 0 : DURACION.normal, ease: CURVA.salidaQuint }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-[var(--doc-radius-sm)] p-3" style={{ background: TONO.aviso.fondo, boxShadow: `inset 0 0 0 1px ${TONO.aviso.borde}` }}>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="mb-1 block text-[11px] font-medium" style={{ color: TONO.aviso.texto }}>
                    Fecha límite de la prórroga
                  </span>
                  <CampoFecha
                    valor={estado.prorrogaFecha}
                    onChange={(v) => onDoc(doc.codigo, { prorrogaFecha: v })}
                    min={hoy()}
                    sentido="futuro"
                    etiquetaAccesible={`Fecha límite de la prórroga de ${doc.nombre}`}
                  />
                </div>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium" style={{ color: TONO.aviso.texto }}>
                    Motivo
                  </span>
                  <Entrada value={estado.prorrogaMotivo} onChange={(e) => onDoc(doc.codigo, { prorrogaMotivo: e.target.value })} placeholder="Por qué se concede el plazo" />
                </label>
              </div>
              {diasProrroga !== null && <CuentaRegresiva dias={diasProrroga} fecha={estado.prorrogaFecha} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function ChipEstadoSeleccionable({ estado, activo, onClick }: { estado: EstadoDocumento; activo: boolean; onClick: () => void }) {
  const tono = TONO[INTENCION_DOCUMENTO[estado]];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className="doc-tap relative inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-150 active:scale-95"
      style={
        activo
          ? { background: tono.fondo, color: tono.texto, boxShadow: `inset 0 0 0 1.5px ${tono.borde}` }
          : { background: "var(--doc-surface)", color: "var(--doc-text-faint)", boxShadow: "inset 0 0 0 1px var(--doc-border)" }
      }
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: activo ? tono.punto : "var(--doc-text-faint)" }} aria-hidden />
      {ETIQUETA_DOCUMENTO[estado]}
      {activo && <Check className="h-3 w-3" aria-hidden />}
    </button>
  );
}

function CuentaRegresiva({ dias, fecha }: { dias: number; fecha: string }) {
  const vencida = dias < 0;
  const porVencer = dias >= 0 && dias <= 3;
  const intencion = vencida ? "peligro" : porVencer ? "aviso" : "exito";
  const tono = TONO[intencion];
  /* La barra representa un plazo típico de 30 días; se recorta en los extremos
     para que un plazo de 90 días no la deje siempre llena ni un vencido negativa. */
  const pct = Math.max(0, Math.min(100, Math.round((dias / 30) * 100)));
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]" style={{ color: tono.texto }}>
        <span className="inline-flex items-center gap-1 capitalize">
          <Timer className="h-3 w-3" aria-hidden /> {fechaLegible(fecha)}
        </span>
        <span>
          {vencida
            ? `Fuera de plazo por ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`
            : dias === 0
              ? "Vence hoy"
              : `${dias} día${dias === 1 ? "" : "s"} restantes`}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--doc-surface-sunken)" }}>
        <motion.div className="h-full rounded-full" style={{ background: tono.borde }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Paso 3 — Categoría (tipo de funcionario) + garantía                 */
/* ------------------------------------------------------------------ */

function PasoCategoria({
  categoria,
  garantia,
  onCategoria,
  onGarantia,
  errores,
  reducido,
}: {
  categoria: string;
  garantia: string;
  onCategoria: (c: string) => void;
  onGarantia: (g: string) => void;
  errores: Record<string, string>;
  reducido: boolean;
}) {
  const cat = categoria ? categoriaDe(categoria) : null;
  const esComercial = categoria === "COMERCIAL";
  return (
    <div className="space-y-5">
      <Encabezadillo
        titulo="Tipo de funcionario"
        detalle="Elige la categoría. Cada una exige documentos distintos y el expediente mostrará solo los suyos. Una persona pertenece a una sola categoría."
      />
      {errores.categoria && <Aviso intencion="peligro" titulo="Falta elegir">{errores.categoria}</Aviso>}

      <div className="grid gap-3 sm:grid-cols-2">
        {CATEGORIAS.map((c, i) => (
          <TarjetaCategoria key={c.codigo} categoria={c} activa={categoria === c.codigo} onSelect={() => onCategoria(c.codigo)} reducido={reducido} orden={i} />
        ))}
      </div>

      <AnimatePresence initial={false}>
        {esComercial && cat && (
          <motion.div
            initial={reducido ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reducido ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: reducido ? 0 : DURACION.lenta, ease: CURVA.salidaQuint }}
            className="overflow-hidden"
          >
            <div className="doc-sunken rounded-[var(--doc-radius,14px)] p-4" style={estiloCategoria("COMERCIAL")}>
              <div className="flex items-center gap-2">
                <ShieldQuestion className="h-4 w-4" style={{ color: "var(--cat-color)" }} aria-hidden />
                <span className="text-xs font-semibold text-[color:var(--doc-text)]">Seleccione tipo de garantía</span>
              </div>
              {errores.garantia && <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--doc-danger-fg)" }}>{errores.garantia}</p>}
              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                {GARANTIAS_COMERCIAL.map((g) => (
                  <TarjetaGarantia key={g.codigo} garantia={g} activa={garantia === g.codigo} onSelect={() => onGarantia(g.codigo)} color={cat.color} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {cat && !cat.activa && (
        <Aviso intencion="aviso" titulo="En construcción">
          <span className="inline-flex items-center gap-1">
            <HardHat className="h-3.5 w-3.5" aria-hidden /> {cat.descripcion}
          </span>{" "}
          El sistema ya reserva esta categoría; podrás abrir estos expedientes cuando el área defina sus requisitos.
        </Aviso>
      )}
    </div>
  );
}

function TarjetaCategoria({
  categoria,
  activa,
  onSelect,
  reducido,
  orden,
}: {
  categoria: Categoria;
  activa: boolean;
  onSelect: () => void;
  reducido: boolean;
  orden: number;
}) {
  const Icono = categoria.Icono;
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-pressed={activa}
      initial={reducido ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo, delay: Math.min(orden * 0.04, 0.24) }}
      whileHover={reducido ? undefined : { y: -3 }}
      whileTap={reducido ? undefined : { scale: 0.98 }}
      className="doc-tap relative flex items-start gap-3 rounded-[var(--doc-radius,16px)] p-4 text-left transition-shadow"
      style={{
        background: activa ? hexAlpha(categoria.color, 0.16) : "var(--doc-surface-raised)",
        boxShadow: activa ? `inset 0 0 0 1.5px ${categoria.color}, 0 8px 24px -12px ${hexAlpha(categoria.color, 0.7)}` : "inset 0 0 0 1px var(--doc-border)",
      }}
    >
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
        style={{ background: hexAlpha(categoria.color, activa ? 0.28 : 0.16), color: categoria.color }}
      >
        <Icono className="h-6 w-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[color:var(--doc-text)]">{categoria.etiqueta}</span>
        <span className="doc-prose mt-0.5 block text-[11px] leading-relaxed text-[color:var(--doc-text-muted)]">{categoria.descripcion}</span>
        {!categoria.activa && (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "var(--doc-warning-bg)", color: "var(--doc-warning-fg)" }}>
            <HardHat className="h-3 w-3" aria-hidden /> En construcción
          </span>
        )}
      </span>
      {activa && (
        <motion.span layoutId="cat-check" className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full" style={{ background: categoria.color, color: "#04121f" }}>
          <Check className="h-3 w-3" aria-hidden />
        </motion.span>
      )}
    </motion.button>
  );
}

function TarjetaGarantia({
  garantia,
  activa,
  onSelect,
  color,
}: {
  garantia: (typeof GARANTIAS_COMERCIAL)[number];
  activa: boolean;
  onSelect: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={activa}
      className="doc-tap flex flex-col rounded-[var(--doc-radius,14px)] p-3 text-left transition-all duration-150 active:scale-[0.98]"
      style={{
        background: activa ? hexAlpha(color, 0.16) : "var(--doc-surface)",
        boxShadow: activa ? `inset 0 0 0 1.5px ${color}` : "inset 0 0 0 1px var(--doc-border)",
      }}
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold" style={{ color: activa ? color : "var(--doc-text-muted)" }}>
        <span className="grid h-5 w-5 place-items-center rounded-full text-[10px]" style={{ background: activa ? color : "var(--doc-surface-sunken)", color: activa ? "#04121f" : "var(--doc-text-faint)" }}>
          {garantia.etiqueta.replace("Tipo ", "")}
        </span>
        {garantia.etiqueta}
      </span>
      <span className="mt-1 text-xs font-semibold text-[color:var(--doc-text)]">{garantia.titulo}</span>
      <ul className="mt-1 space-y-0.5">
        {garantia.caracteristicas.map((c) => (
          <li key={c} className="doc-prose text-[11px] leading-snug text-[color:var(--doc-text-faint)]">
            · {c}
          </li>
        ))}
      </ul>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Paso 4 — Requisitos de la categoría                                 */
/* ------------------------------------------------------------------ */

function PasoEspecificos({
  categoria,
  garantia,
  documentos,
  enConstruccion,
  docs,
  onDoc,
  reducido,
}: {
  categoria: Categoria;
  garantia: string;
  documentos: CatalogoDocumento[];
  enConstruccion: boolean;
  docs: Record<string, EstadoDoc>;
  onDoc: (codigo: string, patch: Partial<EstadoDoc>) => void;
  reducido: boolean;
}) {
  const Icono = categoria.Icono;
  const garantiaCard = GARANTIAS_COMERCIAL.find((g) => g.codigo === garantia);

  if (enConstruccion) {
    return (
      <div className="space-y-4">
        <Aviso intencion="aviso" titulo="Categoría en construcción">
          Esta categoría todavía no registra documentos. Elige otra categoría para continuar.
        </Aviso>
      </div>
    );
  }

  return (
    <div className="space-y-4" style={estiloCategoria(categoria.codigo)}>
      <div className="flex items-center gap-3 rounded-[var(--doc-radius,16px)] p-4" style={{ background: "var(--cat-tinte)", boxShadow: "inset 0 0 0 1px var(--cat-borde)" }}>
        <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: "var(--cat-tinte-fuerte)", color: "var(--cat-color)" }}>
          <Icono className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[color:var(--doc-text)]">
            {categoria.etiqueta}
            {garantiaCard ? ` · ${garantiaCard.etiqueta} (${garantiaCard.titulo})` : ""}
          </p>
          <p className="doc-prose text-[11px] text-[color:var(--doc-text-muted)]">
            {documentos.length} documento{documentos.length === 1 ? "" : "s"} propio{documentos.length === 1 ? "" : "s"} de esta categoría.
          </p>
        </div>
      </div>

      {documentos.length === 0 ? (
        <Aviso intencion="info" titulo="Sin documentos adicionales">
          Esta categoría no añade requisitos a los generales.
        </Aviso>
      ) : (
        <ul className="space-y-2.5">
          {documentos.map((doc, i) => (
            <FilaDocumento key={doc.codigo} doc={doc} estado={docs[doc.codigo] ?? docInicial()} onDoc={onDoc} reducido={reducido} orden={i} />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Paso 5 — Revisión                                                   */
/* ------------------------------------------------------------------ */

function PasoRevision({
  form,
  categoria,
  garantia,
  generales,
  especificos,
  docs,
  onIr,
}: {
  form: { identificador: string; nombre: string; cargo: string; agencia: string; gerencia: string; fechaIngreso: string; responsableId: string };
  categoria: Categoria;
  garantia: string;
  generales: CatalogoDocumento[];
  especificos: CatalogoDocumento[];
  docs: Record<string, EstadoDoc>;
  onIr: (id: PasoId) => void;
}) {
  const Icono = categoria.Icono;
  const garantiaCard = GARANTIAS_COMERCIAL.find((g) => g.codigo === garantia);
  const total = generales.length + especificos.length;
  const cuenta = (estado: EstadoDocumento) =>
    [...generales, ...especificos].filter((d) => (docs[d.codigo]?.estado ?? "PENDIENTE") === estado).length;
  const prorrogas = Object.values(docs).filter((d) => d.prorrogaActiva && d.prorrogaFecha).length;

  return (
    <div className="space-y-4" style={estiloCategoria(categoria.codigo)}>
      <Encabezadillo titulo="Revisión" detalle="Confirma que todo está en orden. Al guardar, el expediente se crea y se abre para seguir trabajando." />

      <div className="doc-raised rounded-[var(--doc-radius,16px)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: "var(--cat-tinte-fuerte)", color: "var(--cat-color)" }}>
              <Icono className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[color:var(--doc-text)]">{form.nombre || "Sin nombre"}</p>
              <p className="text-[11px] text-[color:var(--doc-text-muted)]">{form.identificador || "Sin identificador"}</p>
            </div>
          </div>
          <button type="button" onClick={() => onIr("identidad")} className="doc-tap text-[11px] font-semibold" style={{ color: "var(--doc-info-fg)" }}>
            Editar identidad
          </button>
        </div>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
          <DatoRev etiqueta="Cargo" valor={form.cargo || "—"} />
          <DatoRev etiqueta="Agencia" valor={form.agencia || "—"} />
          <DatoRev etiqueta="Gerencia" valor={form.gerencia || "—"} />
          <DatoRev etiqueta="Fecha de ingreso" valor={form.fechaIngreso || "—"} />
          <DatoRev etiqueta="Responsable" valor={form.responsableId || "—"} />
          <DatoRev
            etiqueta="Categoría"
            valor={`${categoria.etiquetaCorta}${garantiaCard ? ` · ${garantiaCard.etiqueta}` : ""}`}
          />
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TarjetaCuenta etiqueta="Requisitos" valor={total} intencion="info" />
        <TarjetaCuenta etiqueta="Entregados" valor={cuenta("ENTREGADO")} intencion="exito" />
        <TarjetaCuenta etiqueta="Pendientes" valor={cuenta("PENDIENTE") + cuenta("NO_ENTREGADO")} intencion="aviso" />
        <TarjetaCuenta etiqueta="Prórrogas" valor={prorrogas} intencion="acento" />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onIr("generales")} className="doc-tap rounded-full px-3 py-1.5 text-[11px] font-semibold" style={{ background: "var(--doc-surface-raised)", boxShadow: "inset 0 0 0 1px var(--doc-border)", color: "var(--doc-text-muted)" }}>
          Revisar documentos generales
        </button>
        <button type="button" onClick={() => onIr("especificos")} className="doc-tap rounded-full px-3 py-1.5 text-[11px] font-semibold" style={{ background: "var(--doc-surface-raised)", boxShadow: "inset 0 0 0 1px var(--doc-border)", color: "var(--doc-text-muted)" }}>
          Revisar requisitos de la categoría
        </button>
      </div>
    </div>
  );
}

function DatoRev({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-[color:var(--doc-text-faint)]">{etiqueta}</dt>
      <dd className="truncate text-[color:var(--doc-text)]" title={valor}>
        {valor}
      </dd>
    </div>
  );
}

function TarjetaCuenta({ etiqueta, valor, intencion }: { etiqueta: string; valor: number; intencion: keyof typeof TONO }) {
  const tono = TONO[intencion];
  return (
    <div className="rounded-[var(--doc-radius,14px)] p-3 text-center" style={{ background: tono.fondo, boxShadow: `inset 0 0 0 1px ${tono.borde}` }}>
      <div className="text-lg font-bold" style={{ color: tono.texto }}>
        {valor}
      </div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: tono.texto }}>
        {etiqueta}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Piezas menores                                                      */
/* ------------------------------------------------------------------ */

function Encabezadillo({ titulo, detalle, acento }: { titulo: string; detalle: string; acento?: string }) {
  return (
    <div>
      <h3 className="doc-balance text-base font-semibold text-[color:var(--doc-text)]" style={acento ? { color: acento } : undefined}>
        {titulo}
      </h3>
      <p className="doc-prose mt-0.5 max-w-prose text-xs leading-relaxed text-[color:var(--doc-text-muted)]">{detalle}</p>
    </div>
  );
}

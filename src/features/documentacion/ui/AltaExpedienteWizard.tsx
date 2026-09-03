/**
 * Asistente de «Nuevo expediente».
 *
 * ── Qué resuelve ────────────────────────────────────────────────────────────
 * El proceso real del área es un CAMINO: primero la identidad de la persona,
 * luego los documentos generales, luego el TIPO DE FUNCIONARIO —el punto de
 * inflexión que decide qué documentos especiales se exigen— y, para el área
 * comercial, el tipo de garantía. Cada categoría es única y excluyente: el
 * expediente ve SOLO los documentos de su rama, de principio a fin.
 *
 * ── De dónde salen los documentos ───────────────────────────────────────────
 * De una sola fuente: el catálogo del backend (`documentacion.catalogo`), con su
 * mapa de aplicabilidad y sus SUBSECCIONES por rama. El asistente NO inventa la
 * lista ni cablea qué documento lleva contador de hojas: pinta lo que el backend
 * va a crear. Así el formulario y el expediente no pueden discrepar.
 *
 * ── Cómo se guarda ──────────────────────────────────────────────────────────
 * En UNA sola llamada. `documentacion.expediente.crear` acepta la identidad, la
 * rama, los estados, las observaciones, las hojas físicas y las prórrogas, y lo
 * resuelve todo dentro del mismo bloqueo del libro. Antes eran cuatro viajes
 * seguidos (crear → obtener → guardar requisitos → N prórrogas), que en Apps
 * Script son cuatro arranques de contenedor: entre ocho y veinte segundos con el
 * botón aparentemente colgado. Si el backend desplegado todavía no conoce la
 * forma ampliada —lo detectamos porque su respuesta no trae `completa: true`—, se
 * completa por la ruta antigua sin que nadie note nada.
 *
 * Es idempotente: una `idempotencyKey` por apertura evita el alta doble ante un
 * doble clic o un reintento.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  FileText,
  Files,
  FolderOpen,
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
import { Aviso, Boton, Campo, Confirmacion, ContadorHojas, Entrada, TONO } from "./piezas";
import { CampoFecha, diasDesdeHoy, fechaLegible } from "./CampoFecha";
import { TextoRevelado } from "./DocTexto";
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
import type { CatalogoCliente, CatalogoDocumento, RamaAplicabilidad } from "../api/acciones";

/* ------------------------------------------------------------------ */
/* Tipos y utilidades                                                  */
/* ------------------------------------------------------------------ */

interface EstadoDoc {
  estado: EstadoDocumento;
  observaciones: string;
  hojasFisicas: number;
  prorrogaActiva: boolean;
  prorrogaFecha: string;
  prorrogaMotivo: string;
}

function docInicial(): EstadoDoc {
  return {
    estado: "PENDIENTE",
    observaciones: "",
    hojasFisicas: 0,
    prorrogaActiva: false,
    prorrogaFecha: "",
    prorrogaMotivo: "",
  };
}

type PasoId = "identidad" | "generales" | "categoria" | "especificos" | "revision";

interface Paso {
  id: PasoId;
  titulo: string;
  descripcion: string;
}

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

/**
 * Carnet reducido a lo que lo identifica: dígitos y letras, en mayúsculas.
 *
 * En el libro del área el mismo documento aparece como «1234567 LP»,
 * «1234567-LP», «1234567lp» y con espacios de más. Para AVISAR de un duplicado
 * hay que reconocerlos como el mismo número; el valor que se guarda, en cambio,
 * es el que la persona escribió, tal cual.
 */
function soloAlfanumerico(texto: string): string {
  return String(texto ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
}

/**
 * Agrupa una lista de documentos por su subsección, resuelta para la rama.
 *
 * El orden de los bloques es el de aparición en el catálogo: el catálogo ya los
 * ordena como el área los pide, y reordenarlos alfabéticamente pondría «2
 * Garantes Familiares» antes que «1 Garante que demuestre ingresos».
 */
export function agruparPorBloque(
  documentos: CatalogoDocumento[],
  rama: RamaAplicabilidad | undefined,
): { titulo: string; documentos: CatalogoDocumento[] }[] {
  const bloques = new Map<string, CatalogoDocumento[]>();
  for (const doc of documentos) {
    const titulo = rama?.subsecciones?.[doc.codigo] ?? doc.subseccion?.["*"] ?? "";
    const lista = bloques.get(titulo) ?? [];
    lista.push(doc);
    bloques.set(titulo, lista);
  }
  return [...bloques.entries()].map(([titulo, lista]) => ({ titulo, documentos: lista }));
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
  onAbrirExistente,
}: {
  abierta: boolean;
  onCerrar: () => void;
  onCreado: (expedienteId: string, requisitos: number) => void;
  onError: (mensaje: string, pista?: string) => void;
  /** Avisos no bloqueantes (por ejemplo, un valor añadido al catálogo auxiliar). */
  onAviso?: (intencion: "info" | "exito" | "aviso" | "peligro", texto: string, pista?: string) => void;
  /** Abre un expediente que ya existía, sin perder lo escrito en el formulario. */
  onAbrirExistente?: (expedienteId: string) => void;
}) {
  return (
    <AnimatePresence>
      {abierta && (
        <WizardCuerpo
          onCerrar={onCerrar}
          onCreado={onCreado}
          onError={onError}
          onAviso={onAviso}
          onAbrirExistente={onAbrirExistente}
        />
      )}
    </AnimatePresence>
  );
}

function WizardCuerpo({
  onCerrar,
  onCreado,
  onError,
  onAviso,
  onAbrirExistente,
}: {
  onCerrar: () => void;
  onCreado: (expedienteId: string, requisitos: number) => void;
  onError: (mensaje: string, pista?: string) => void;
  onAviso?: (intencion: "info" | "exito" | "aviso" | "peligro", texto: string, pista?: string) => void;
  onAbrirExistente?: (expedienteId: string) => void;
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
  const [progreso, setProgreso] = useState("");
  const [pidiendoCierre, setPidiendoCierre] = useState(false);
  /** Expediente que ya existía con ese carnet. Se ofrece abrirlo. */
  const [duplicado, setDuplicado] = useState<{ expedienteId: string; nombre: string } | null>(null);
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

  /**
   * ¿Ese carnet ya tiene expediente? Se pregunta MIENTRAS se escribe.
   *
   * El backend es la autoridad y rechaza el duplicado al guardar, pero descubrirlo
   * ahí significa rellenar cinco pasos para nada. Se consulta al libro en cuanto
   * el número parece completo, con retardo para no llamar en cada tecla.
   *
   * La consulta es `expediente.porCarnet`, que compara por la CLAVE DE IDENTIDAD
   * —solo dígitos y letras— y no por texto: en el libro el mismo documento vive
   * como «1234567 LP», «1234567 - 45 - 2026» o «1234567-lp», y una búsqueda por
   * subcadena no reconoce ninguna de las otras dos.
   *
   * Si la consulta falla —sin red, o un backend anterior que no conoce la
   * acción— no pasa nada: el guardado lo volverá a comprobar contra el libro.
   */
  useEffect(() => {
    const escrito = form.identificador.trim();
    if (soloAlfanumerico(escrito).length < 5) return;
    const controlador = new AbortController();
    const temporizador = setTimeout(() => {
      void docApi
        .expedientePorCarnet(escrito, { signal: controlador.signal })
        .then((respuesta) => {
          if (!respuesta.encontrado || !respuesta.expedienteId) return;
          setDuplicado({ expedienteId: respuesta.expedienteId, nombre: respuesta.nombre ?? "" });
        })
        .catch(() => {
          /* sin red, sin permiso o backend anterior: el guardado lo comprobará */
        });
    }, 700);
    return () => {
      clearTimeout(temporizador);
      controlador.abort();
    };
  }, [form.identificador]);

  const cat: Categoria | null = categoria ? categoriaDe(categoria) : null;
  const esComercial = categoria === "COMERCIAL";
  const enConstruccion = Boolean(cat && !cat.activa);

  const documentos = catalogo?.documentos ?? [];
  /** Solo los generales VIGENTES: los retirados no se piden nunca más. */
  const generales = useMemo(
    () => documentos.filter((d) => d.seccion === "generales" && d.retirado !== true),
    [documentos],
  );

  /** Rama elegida, tal como la describe el backend (códigos y subsecciones). */
  const rama: RamaAplicabilidad | undefined = useMemo(() => {
    if (!catalogo || !categoria) return undefined;
    const objetivoGarantia = esComercial ? garantia : "NINGUNA";
    return catalogo.aplicabilidad.find((a) => a.tipoFuncionario === categoria && a.tipoGarantia === objetivoGarantia);
  }, [catalogo, categoria, esComercial, garantia]);

  /** Documentos específicos de la categoría (los que no son generales). */
  const especificos = useMemo(() => {
    const generalesSet = new Set(generales.map((d) => d.codigo));
    return (rama?.codigos ?? [])
      .filter((c) => !generalesSet.has(c))
      .map((c) => documentos.find((d) => d.codigo === c))
      .filter((d): d is CatalogoDocumento => Boolean(d));
  }, [rama, documentos, generales]);

  const hayDatos =
    form.identificador.trim() !== "" || form.nombre.trim() !== "" || categoria !== "" || Object.keys(docs).length > 0;

  const pasos: Paso[] = [
    { id: "identidad", titulo: "Identidad", descripcion: "Quién es y de dónde viene." },
    { id: "generales", titulo: "Documentos generales", descripcion: "Los 16 requisitos de toda incorporación." },
    { id: "categoria", titulo: "Tipo de funcionario", descripcion: "El punto de inflexión del expediente." },
    { id: "especificos", titulo: "Requisitos de la categoría", descripcion: "Solo los de su rama." },
    { id: "revision", titulo: "Revisión y guardado", descripcion: "Confirma y abre el expediente." },
  ];
  const indice = pasos.findIndex((p) => p.id === paso);

  function poner(campo: keyof typeof form, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    if (campo === "identificador") setDuplicado(null);
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

  /* --- Validación por paso ---
     El identificador ya NO tiene formato impuesto: es el carnet de identidad tal
     como aparece en el documento. Solo se exige que no esté vacío. */
  function validarIdentidad(): boolean {
    const e: Record<string, string> = {};
    if (!form.identificador.trim()) e.identificador = "Escribe el carnet de identidad.";
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

  /**
   * Prepara lo que el asistente sabe, en la forma que espera el backend.
   *
   * Los requisitos se referencian por CÓDIGO de catálogo: el cliente todavía no
   * conoce los identificadores de fila —los va a crear el servidor en esta misma
   * llamada—, y eso era justamente lo que forzaba el segundo viaje de red.
   */
  function cargaDeRequisitos() {
    const aplicables = new Set([...generales, ...especificos].map((d) => d.codigo));
    const conteoHojas = new Map([...generales, ...especificos].map((d) => [d.codigo, d.requiereConteoHojas]));
    const requisitos: Record<string, unknown>[] = [];
    const prorrogas: Record<string, unknown>[] = [];

    for (const [codigo, ed] of Object.entries(docs)) {
      if (!aplicables.has(codigo)) continue; // no aplica a esta rama
      const cambio: Record<string, unknown> = { codigo };
      let algo = false;
      if (ed.estado !== "PENDIENTE") {
        cambio.estado = ed.estado;
        algo = true;
      }
      if (ed.observaciones.trim()) {
        cambio.observaciones = ed.observaciones.trim();
        algo = true;
      }
      // El conteo de hojas solo viaja si el requisito lo admite: mandarlo en un
      // digital hace que el backend lo rechace, y con razón.
      if (conteoHojas.get(codigo) && ed.hojasFisicas > 0) {
        cambio.hojasFisicas = ed.hojasFisicas;
        algo = true;
      }
      if (algo) requisitos.push(cambio);
      if (ed.prorrogaActiva && ed.prorrogaFecha) {
        prorrogas.push({ codigo, fechaProrroga: ed.prorrogaFecha, motivo: ed.prorrogaMotivo.trim() || "Prórroga registrada al abrir el expediente." });
      }
    }
    return { requisitos, prorrogas };
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
    setProgreso("Creando el expediente…");
    const { requisitos, prorrogas } = cargaDeRequisitos();

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
        requisitos,
        prorrogas,
      });

      if (creado.completa !== true && (requisitos.length || prorrogas.length)) {
        // ── Recaída automática ────────────────────────────────────────────
        // El backend desplegado es anterior a la acción ampliada: ignoró las
        // listas. Se completa por la ruta de cuatro pasos, que sigue funcionando.
        setProgreso("Aplicando los estados marcados…");
        await completarPorRutaAntigua(creado.expedienteId, requisitos, prorrogas, onError);
      } else if (creado.fallidos?.length) {
        onAviso?.(
          "aviso",
          `El expediente se creó, pero ${creado.fallidos.length} marca(s) no se aplicaron.`,
          creado.fallidos[0]?.motivo,
        );
      }

      clearDraft();
      onCreado(creado.expedienteId, creado.requisitos ?? rama?.total ?? 0);
    } catch (error) {
      const fallo = error as {
        message?: string;
        pista?: string;
        codigo?: string;
        campos?: Record<string, string>;
        detalle?: { expedienteId?: string; nombre?: string };
      };
      // ── Duplicado ──────────────────────────────────────────────────────
      // El carnet ya tiene expediente. NO se pierde nada de lo escrito: se
      // ofrece abrir el que existe, y si son dos personas distintas, corregir el
      // número y volver a guardar.
      if (fallo.codigo === "CONFLICTO" && fallo.detalle?.expedienteId) {
        setDuplicado({ expedienteId: String(fallo.detalle.expedienteId), nombre: String(fallo.detalle.nombre ?? "") });
        setErrores({ identificador: "Ese carnet ya tiene expediente." });
        setPaso("identidad");
      } else if (fallo.campos && Object.keys(fallo.campos).length) {
        setErrores(fallo.campos);
        if (fallo.campos.identificador || fallo.campos.nombre) setPaso("identidad");
      }
      onError(fallo.message ?? "No se pudo crear el expediente.", fallo.pista);
    } finally {
      setGuardando(false);
      setProgreso("");
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
      initial={reducido ? false : { opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reducido ? undefined : { opacity: 0, x: -14, transition: { duration: DURACION.rapida, ease: CURVA.salidaQuint } }}
      transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo }}
      className="mx-auto w-full max-w-3xl"
    >
      {paso === "identidad" && (
        <PasoIdentidad
          form={form}
          poner={poner}
          errores={errores}
          catalogo={catalogo}
          reducido={reducido}
          onAviso={onAviso}
          duplicado={duplicado}
          onAbrirExistente={onAbrirExistente}
        />
      )}
      {paso === "generales" && (
        <PasoDocumentos
          titulo="Documentos generales"
          descripcion="Los 16 requisitos de toda incorporación. Puedes marcarlos ahora o dejarlos pendientes y completarlos en el expediente."
          bloques={[{ titulo: "", documentos: generales }]}
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
          bloques={agruparPorBloque(especificos, rama)}
          total={especificos.length}
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
          errores={errores}
          onIr={irA}
        />
      )}
    </motion.div>
  );

  const overlay = (
    <>
      <motion.div
        className="doc-velo fixed inset-0 z-[100]"
        initial={reducido ? undefined : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reducido ? undefined : { opacity: 0 }}
        transition={{ duration: reducido ? 0 : DURACION.rapida }}
        onClick={intentarCerrar}
        aria-hidden
      />
      {/*
        ── Por qué ya no ocupa toda la pantalla ──────────────────────────────
        El asistente era `inset-0`: tapaba la aplicación entera, sin aire, y con
        el contenido pegado a los bordes. Una hoja centrada con ancho máximo
        generoso deja ver que hay un módulo detrás —no se ha «ido» a otro
        sitio—, concentra la lectura en el centro y respeta la línea de texto.
        En móvil sigue ocupando todo, que ahí es lo correcto.
      */}
      <div className="doc-console pointer-events-none fixed inset-0 z-[101] flex items-stretch justify-center p-0 sm:items-center sm:p-4 md:p-8">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Nuevo expediente documental"
          className="doc-hoja pointer-events-auto flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-none sm:rounded-[26px]"
          initial={reducido ? undefined : { opacity: 0, y: 20, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducido ? undefined : { opacity: 0, y: 14, scale: 0.99, transition: { duration: DURACION.rapida, ease: CURVA.salidaQuint } }}
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
            progreso={progreso}
            onRetroceder={retroceder}
            onAvanzar={avanzar}
            onGuardar={guardar}
          />
        </motion.div>
      </div>

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

/**
 * Completa el alta por la ruta antigua de cuatro pasos.
 *
 * Solo se usa cuando el backend desplegado no conoce la acción ampliada. Se
 * mantiene porque el frontend se despliega en Vercel al fusionar y el backend se
 * publica a mano en Apps Script: entre las dos cosas hay minutos u horas, y en
 * ese hueco el asistente tiene que seguir funcionando.
 */
async function completarPorRutaAntigua(
  expedienteId: string,
  requisitos: Record<string, unknown>[],
  prorrogas: Record<string, unknown>[],
  onError: (mensaje: string, pista?: string) => void,
): Promise<void> {
  const detalle = await docApi.obtenerExpediente(expedienteId);
  const porCodigo = new Map(detalle.requisitos.map((r) => [r.codigo, r]));

  const cambios: Record<string, unknown>[] = [];
  for (const cambio of requisitos) {
    const requisito = porCodigo.get(String(cambio.codigo));
    if (!requisito) continue;
    const { codigo: _codigo, ...resto } = cambio;
    cambios.push({ expedienteDocumentoId: requisito.expedienteDocumentoId, version: requisito.version, ...resto });
  }
  if (cambios.length) await docApi.guardarRequisitos(expedienteId, cambios);

  for (const prorroga of prorrogas) {
    const requisito = porCodigo.get(String(prorroga.codigo));
    if (!requisito || !requisito.permiteProrroga) continue;
    try {
      await docApi.crearProrroga({
        expedienteDocumentoId: requisito.expedienteDocumentoId,
        fechaProrroga: prorroga.fechaProrroga,
        motivo: prorroga.motivo,
      });
    } catch (error) {
      // Una prórroga que falla no debe tumbar el alta: se avisa y se sigue.
      const fallo = error as { message?: string };
      onError(`El expediente se creó, pero una prórroga no se registró: ${fallo.message ?? ""}`);
    }
  }
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
  const avance = Math.round((indice / (pasos.length - 1)) * 100);
  return (
    <header className="shrink-0 border-b border-[color:var(--doc-border)] px-4 py-3 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl"
            style={{ background: "var(--doc-info-bg)", color: "var(--doc-info-fg)" }}
          >
            <FolderPlus className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="doc-titulo">Nuevo expediente documental</h2>
            <p className="doc-prose truncate text-[11px] text-[color:var(--doc-text-muted)]">{pasos[indice]?.descripcion}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="doc-tap doc-presion rounded-xl p-2 text-[color:var(--doc-text-muted)] transition-colors hover:bg-[color:var(--doc-surface)] hover:text-[color:var(--doc-text)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Indicador de avance: una barra continua además de los pasos. Con cinco
          pasos, «3 de 5» se entiende antes que contar círculos. */}
      <div className="mt-3 flex items-center gap-3">
        <ol className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-1" aria-label="Pasos del asistente">
          {pasos.map((p, i) => {
            const hecho = i < indice;
            const activo = i === indice;
            return (
              <li key={p.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => onIr(p.id)}
                  aria-current={activo ? "step" : undefined}
                  className="doc-tap doc-presion group flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
                  style={{
                    color: activo ? "var(--doc-info-fg)" : hecho ? "var(--doc-success-fg)" : "var(--doc-text-faint)",
                    background: activo ? "var(--doc-info-bg)" : hecho ? "var(--doc-success-bg)" : "transparent",
                  }}
                >
                  {/* El par fondo/tinta lo decide el tema: una tinta oscura
                      fija sobre el cian del tema claro caía a 3.5:1. */}
                  <span
                    className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold"
                    style={{
                      background: activo
                        ? "var(--doc-primario-bg)"
                        : hecho
                          ? "var(--doc-success)"
                          : "var(--doc-surface-sunken)",
                      color: activo ? "var(--doc-primario-fg)" : hecho ? "var(--doc-success-bg)" : "var(--doc-text-faint)",
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
        <div className="hidden w-24 shrink-0 sm:block">
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--doc-surface-sunken)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${avance}%`, background: "var(--doc-primario-bg)" }}
            />
          </div>
          <p className="doc-metric mt-1 text-right text-[10px] text-[color:var(--doc-text-faint)]">
            {indice + 1} de {pasos.length}
          </p>
        </div>
      </div>
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
  progreso,
  onRetroceder,
  onAvanzar,
  onGuardar,
}: {
  indice: number;
  total: number;
  enConstruccion: boolean;
  guardando: boolean;
  progreso: string;
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
        {/* Progreso REAL del guardado, no un girador genérico: decir en qué paso
            va es la diferencia entre «está trabajando» y «se ha colgado». */}
        {progreso && (
          <p className="doc-prose hidden text-[11px] text-[color:var(--doc-text-muted)] sm:block" role="status" aria-live="polite">
            {progreso}
          </p>
        )}
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
  duplicado,
  onAbrirExistente,
}: {
  form: Identidad;
  poner: (campo: keyof Identidad, valor: string) => void;
  errores: Record<string, string>;
  catalogo: CatalogoCliente | null;
  reducido: boolean;
  onAviso?: (intencion: "info" | "exito" | "aviso" | "peligro", texto: string, pista?: string) => void;
  duplicado: { expedienteId: string; nombre: string } | null;
  onAbrirExistente?: (expedienteId: string) => void;
}) {
  const agencias = catalogo?.auxiliares.agencia_bdp ?? [];
  const gerencias = catalogo?.auxiliares.gerencia_bdp ?? [];
  const cargos = catalogo?.auxiliares.cargo_bdp ?? [];

  return (
    <div className="space-y-5">
      <Encabezadillo titulo="¿Quién ingresa?" detalle="El carnet de identidad y el nombre son obligatorios; el resto ayuda a clasificar y a reportar." />

      {/* Duplicado: no se pierde nada de lo escrito. Se ofrece abrir el que
          existe, o corregir el número si son dos personas distintas. */}
      {duplicado && (
        <Aviso intencion="aviso" titulo="Ya existe un expediente con ese carnet">
          <span className="block">
            {duplicado.nombre ? `Pertenece a ${duplicado.nombre}.` : "Ya hay un expediente registrado con ese número."} Lo
            que has escrito aquí no se ha perdido: sigue en el formulario.
          </span>
          <span className="mt-2 flex flex-wrap gap-2">
            {onAbrirExistente && (
              <Boton variante="primario" onClick={() => onAbrirExistente(duplicado.expedienteId)}>
                <FolderOpen className="h-3.5 w-3.5" aria-hidden /> Abrir el expediente existente
              </Boton>
            )}
            <span className="doc-nota text-[11px]">Si son dos personas distintas, revisa el número del carnet.</span>
          </span>
        </Aviso>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Carnet de identidad"
          requerido
          error={errores.identificador}
          ayuda="Escríbelo como aparece en el documento; se admite cualquier formato."
        >
          <Entrada
            value={form.identificador}
            onChange={(e) => poner("identificador", e.target.value)}
            placeholder="Ej. 1234567 LP"
            autoComplete="off"
            data-foco-inicial
            autoFocus
          />
        </Campo>
        <Campo etiqueta="Nombre completo" requerido error={errores.nombre}>
          <Entrada value={form.nombre} onChange={(e) => poner("nombre", e.target.value)} placeholder="Nombres y apellidos" />
        </Campo>
        <Campo etiqueta="Cargo" ayuda="Del libro: hoja Auxiliar, columna cargo_bdp. Se puede añadir uno nuevo.">
          <SelectorAuxiliar
            valor={form.cargo}
            onChange={(v) => poner("cargo", v)}
            opciones={cargos}
            columna="cargo_bdp"
            placeholder={cargos.length ? "Elige un cargo" : "Escribe el cargo y añádelo"}
            onAviso={onAviso}
          />
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
        <span className="doc-subtitulo">Fecha de ingreso</span>
      </div>
      <p className="doc-prose mt-0.5 text-[11px] text-[color:var(--doc-text-muted)]">
        Decide el año del libro y la antigüedad de la persona.
      </p>
      <div className="mt-3 max-w-xs">
        <CampoFecha valor={valor} onChange={onChange} max={hoy()} sentido="pasado" etiquetaAccesible="Fecha de ingreso" />
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

interface BloqueDocumentos {
  titulo: string;
  documentos: CatalogoDocumento[];
}

function PasoDocumentos({
  titulo,
  descripcion,
  bloques,
  docs,
  onDoc,
  reducido,
}: {
  titulo: string;
  descripcion: string;
  bloques: BloqueDocumentos[];
  docs: Record<string, EstadoDoc>;
  onDoc: (codigo: string, patch: Partial<EstadoDoc>) => void;
  reducido: boolean;
}) {
  const hayCondicionales = bloques.some((b) => b.documentos.some((d) => d.presentacionFisica === "CONDICIONAL"));
  return (
    <div className="space-y-4">
      <Encabezadillo titulo={titulo} detalle={descripcion} />
      {bloques.map((bloque) => (
        <div key={bloque.titulo || "sin-bloque"} className="space-y-2.5">
          {bloque.titulo && (
            <div className="flex items-center gap-2 pt-1">
              <h4 className="doc-subseccion">{bloque.titulo}</h4>
              <span className="h-px flex-1" style={{ background: "var(--doc-border)" }} aria-hidden />
              <span className="doc-metric text-[10px] text-[color:var(--doc-text-faint)]">
                {bloque.documentos.length} doc.
              </span>
            </div>
          )}
          <ul className="doc-lista-virtual space-y-2.5">
            {bloque.documentos.map((doc, i) => (
              <FilaDocumento
                key={doc.codigo}
                doc={doc}
                estado={docs[doc.codigo] ?? docInicial()}
                onDoc={onDoc}
                reducido={reducido}
                orden={i}
              />
            ))}
          </ul>
        </div>
      ))}
      {hayCondicionales && (
        <p className="doc-nota text-[11px]">
          <span aria-hidden>SÍ*</span> La copia física se pide solo en los casos que indique el área; el escaneado es
          obligatorio siempre.
        </p>
      )}
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
    <li
      className={`doc-raised rounded-[var(--doc-radius,14px)] p-3.5 ${reducido ? "" : "doc-fila-entra"}`}
      style={reducido ? undefined : { animationDelay: `${Math.min(orden * 22, 220)}ms` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* El texto completo del requisito, tal como lo escribe el área. */}
          <p className="doc-requisito">
            {doc.nombre}
            {doc.obligatorio ? (
              <span className="ml-1 align-super text-[10px] font-bold" style={{ color: "var(--doc-danger-fg)" }} aria-hidden>
                *
              </span>
            ) : null}
          </p>
          {doc.descripcion && <p className="doc-prose mt-0.5 text-[11px] text-[color:var(--doc-text-faint)]">{doc.descripcion}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ color: "var(--doc-text-muted)", boxShadow: "inset 0 0 0 1px var(--doc-border)" }}
            >
              {doc.requiereConteoHojas ? (
                <>
                  <Files className="h-2.5 w-2.5" aria-hidden /> Físico
                  {doc.presentacionFisica === "CONDICIONAL" ? "*" : ""} y digital
                </>
              ) : (
                <>
                  <FileText className="h-2.5 w-2.5" aria-hidden /> Digital o escaneado
                </>
              )}
            </span>
            {!doc.obligatorio && (
              <span className="text-[10px] uppercase tracking-wide text-[color:var(--doc-text-faint)]">opcional</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Contador de hojas SOLO en los físicos: en un digital no existe. */}
          {doc.requiereConteoHojas && (
            <ContadorHojas
              valor={estado.hojasFisicas}
              etiqueta={doc.nombre}
              deshabilitado={estado.estado === "NO_APLICA"}
              onChange={(n) => onDoc(doc.codigo, { hojasFisicas: n })}
            />
          )}
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
            <ObservacionDocumento
              codigo={doc.codigo}
              nombre={doc.nombre}
              valor={estado.observaciones}
              onCambio={(texto) => onDoc(doc.codigo, { observaciones: texto })}
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
                  <span className="mb-1 block text-[11px] font-semibold" style={{ color: TONO.aviso.texto }}>
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
                  <span className="mb-1 block text-[11px] font-semibold" style={{ color: TONO.aviso.texto }}>
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
    </li>
  );
}

/**
 * Área de observación de un documento.
 *
 * ── Por qué el estado del texto vive aquí ───────────────────────────────────
 * Si el `textarea` escribiera directamente en el mapa de documentos del
 * asistente, cada tecla provocaría un renderizado del asistente COMPLETO —los
 * dieciséis generales, sus chips y sus contadores—. En un equipo modesto eso son
 * treinta o cuarenta milisegundos por letra: se escribe y las letras llegan
 * tarde. El texto se mantiene local y solo sube al soltar el campo o cuando se
 * deja de teclear, que es cuando el valor importa.
 *
 * El campo controlado NO se reescribe mientras se teclea: solo se sincroniza
 * cuando el valor cambia desde fuera.
 */
function ObservacionDocumento({
  codigo,
  nombre,
  valor,
  onCambio,
}: {
  codigo: string;
  nombre: string;
  valor: string;
  onCambio: (texto: string) => void;
}) {
  const [texto, setTexto] = useState(valor);
  const ultimoExterno = useRef(valor);
  const cambioRef = useRef(onCambio);
  cambioRef.current = onCambio;

  useEffect(() => {
    if (ultimoExterno.current === valor) return;
    ultimoExterno.current = valor;
    setTexto(valor);
  }, [valor]);

  /* Se sube con retardo. El efecto depende solo del texto y de un manejador en
     referencia: si dependiera de `onCambio` —una función nueva en cada
     renderizado del padre— se remontaría en cada tecla. */
  useEffect(() => {
    if (texto === ultimoExterno.current) return;
    const t = setTimeout(() => {
      ultimoExterno.current = texto;
      cambioRef.current(texto);
    }, 260);
    return () => clearTimeout(t);
  }, [texto]);

  return (
    <textarea
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        ultimoExterno.current = texto;
        cambioRef.current(texto);
      }}
      placeholder={`Observaciones (${nombre.slice(0, 60)}${nombre.length > 60 ? "…" : ""})`}
      aria-label={`Observaciones de ${nombre}`}
      data-codigo={codigo}
      rows={2}
      className="mt-2 w-full resize-y rounded-[var(--doc-radius-sm)] border border-[color:var(--doc-border)] bg-[color:var(--doc-surface)] px-3 py-2 text-sm text-[color:var(--doc-text)] outline-none transition-colors placeholder:text-[color:var(--doc-text-faint)] focus:border-[color:var(--doc-focus)]"
    />
  );
}

function ChipEstadoSeleccionable({ estado, activo, onClick }: { estado: EstadoDocumento; activo: boolean; onClick: () => void }) {
  const tono = TONO[INTENCION_DOCUMENTO[estado]];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className="doc-tap doc-presion relative inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-[background-color,color,box-shadow] duration-150"
      style={
        activo
          ? { background: tono.fondo, color: tono.texto, boxShadow: `inset 0 0 0 1.5px ${tono.borde}` }
          : { background: "var(--doc-surface)", color: "var(--doc-text-muted)", boxShadow: "inset 0 0 0 1px var(--doc-border)" }
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

/**
 * Tipo de funcionario, rediseñado.
 *
 * ── Qué se buscaba ──────────────────────────────────────────────────────────
 * Es la decisión más importante del alta: define qué documentos existen para esa
 * persona, y equivocarse significa un expediente mal clasificado para siempre.
 * Antes eran cuatro tarjetas pequeñas indistinguibles de cualquier otro botón.
 * Ahora son tarjetas GRANDES con jerarquía tipográfica fuerte, esquinas
 * continuas, material translúcido sutil y una marca de selección que no depende
 * del color —una casilla con visto—, porque el color no comunica solo.
 *
 * ── Accesibilidad y rendimiento ─────────────────────────────────────────────
 * Es un `radiogroup` de verdad: se recorre con las flechas, Home y End, y
 * anuncia la opción marcada. Los objetivos táctiles pasan de 44 px. Toda la
 * animación son `transform` y `opacity` con la curva de las hojas de iOS
 * (`cubic-bezier(0.32, 0.72, 0, 1)`), y se apaga entera con
 * `prefers-reduced-motion` o con el interruptor de la aplicación.
 */
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
  const grupo = useRef<HTMLDivElement | null>(null);

  /** Flechas, Home y End dentro del radiogrupo, como manda el patrón ARIA. */
  function alPulsar(evento: React.KeyboardEvent<HTMLDivElement>) {
    const teclas = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!teclas.includes(evento.key)) return;
    evento.preventDefault();
    const actual = CATEGORIAS.findIndex((c) => c.codigo === categoria);
    let siguiente = actual;
    if (evento.key === "Home") siguiente = 0;
    else if (evento.key === "End") siguiente = CATEGORIAS.length - 1;
    else if (evento.key === "ArrowRight" || evento.key === "ArrowDown") siguiente = (actual + 1 + CATEGORIAS.length) % CATEGORIAS.length;
    else siguiente = (actual - 1 + CATEGORIAS.length) % CATEGORIAS.length;
    const elegida = CATEGORIAS[Math.max(0, siguiente)];
    onCategoria(elegida.codigo);
    grupo.current?.querySelector<HTMLElement>(`[data-codigo="${elegida.codigo}"]`)?.focus();
  }

  return (
    <div className="space-y-5">
      <Encabezadillo
        titulo="Tipo de funcionario"
        detalle="Elige la categoría. Cada una exige documentos distintos y el expediente mostrará solo los suyos. Una persona pertenece a una sola categoría."
      />
      {errores.categoria && (
        <Aviso intencion="peligro" titulo="Falta elegir">
          {errores.categoria}
        </Aviso>
      )}

      <div
        ref={grupo}
        role="radiogroup"
        aria-label="Tipo de funcionario"
        aria-required
        onKeyDown={alPulsar}
        className="grid gap-3 sm:grid-cols-2"
      >
        {CATEGORIAS.map((c, i) => (
          <TarjetaCategoria
            key={c.codigo}
            categoria={c}
            activa={categoria === c.codigo}
            primera={i === 0}
            algunaActiva={Boolean(categoria)}
            onSelect={() => onCategoria(c.codigo)}
            reducido={reducido}
            orden={i}
          />
        ))}
      </div>

      <AnimatePresence initial={false}>
        {esComercial && cat && (
          <motion.div
            initial={reducido ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reducido ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: reducido ? 0 : DURACION.lenta, ease: CURVA.iOS }}
            className="overflow-hidden"
          >
            <div className={`doc-cat doc-sunken rounded-[20px] p-4 ${reducido ? "" : "doc-revelar"}`} style={estiloCategoria("COMERCIAL")}>
              <div className="flex items-center gap-2">
                <ShieldQuestion className="h-4 w-4" style={{ color: "var(--cat-texto)" }} aria-hidden />
                <span className="doc-subtitulo">Seleccione el tipo de garantía</span>
              </div>
              {errores.garantia && (
                <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--doc-danger-fg)" }} role="alert">
                  {errores.garantia}
                </p>
              )}
              <div className="mt-3 grid gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de garantía comercial">
                {GARANTIAS_COMERCIAL.map((g) => (
                  <TarjetaGarantia key={g.codigo} garantia={g} activa={garantia === g.codigo} onSelect={() => onGarantia(g.codigo)} categoria={cat} />
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
  primera,
  algunaActiva,
  onSelect,
  reducido,
  orden,
}: {
  categoria: Categoria;
  activa: boolean;
  primera: boolean;
  algunaActiva: boolean;
  onSelect: () => void;
  reducido: boolean;
  orden: number;
}) {
  const Icono = categoria.Icono;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      data-codigo={categoria.codigo}
      /* Un radiogrupo tiene UN solo punto de tabulación: el marcado, o el
         primero si no hay ninguno. Tabular por las cuatro tarjetas para llegar
         al pie del asistente es lo que hace que nadie use el teclado. */
      tabIndex={activa || (!algunaActiva && primera) ? 0 : -1}
      onClick={onSelect}
      className={`doc-cat doc-tap doc-presion relative flex items-start gap-3.5 rounded-[22px] p-4 text-left ${
        reducido ? "" : "doc-fila-entra"
      }`}
      style={{
        // Las dos versiones del acento viajan aquí; `doc-cat` elige según el tema.
        "--cat-color": categoria.color,
        "--cat-color-claro": categoria.colorClaro,
        animationDelay: reducido ? undefined : `${Math.min(orden * 45, 200)}ms`,
        background: activa ? hexAlpha(categoria.color, 0.16) : "var(--doc-surface-raised)",
        boxShadow: activa
          ? `inset 0 0 0 2px ${categoria.color}, 0 12px 32px -18px ${hexAlpha(categoria.color, 0.8)}`
          : "inset 0 0 0 1px var(--doc-border)",
      } as CSSProperties}
    >
      <span
        className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px]"
        style={{ background: hexAlpha(categoria.color, activa ? 0.3 : 0.16), color: "var(--cat-texto)" }}
      >
        <Icono className="h-7 w-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="doc-subtitulo block">{categoria.etiqueta}</span>
        <span className="doc-prose mt-1 block text-[11.5px] leading-relaxed text-[color:var(--doc-text-muted)]">
          {categoria.descripcion}
        </span>
        {!categoria.activa && (
          <span
            className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: "var(--doc-warning-bg)", color: "var(--doc-warning-fg)" }}
          >
            <HardHat className="h-3 w-3" aria-hidden /> En construcción
          </span>
        )}
      </span>
      {/* Marca de selección: casilla con visto, no solo color. */}
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full transition-[background-color,box-shadow] duration-200"
        style={
          activa
            ? {
                background: "var(--cat-texto)",
                color: "var(--doc-sobre-relleno)",
                boxShadow: `0 0 0 3px ${hexAlpha(categoria.color, 0.25)}`,
              }
            : { boxShadow: "inset 0 0 0 1.5px var(--doc-border)" }
        }
        aria-hidden
      >
        {activa && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

function TarjetaGarantia({
  garantia,
  activa,
  onSelect,
  categoria,
}: {
  garantia: (typeof GARANTIAS_COMERCIAL)[number];
  activa: boolean;
  onSelect: () => void;
  categoria: Categoria;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      onClick={onSelect}
      className="doc-cat doc-tap doc-presion flex flex-col rounded-[18px] p-3.5 text-left"
      style={
        {
          "--cat-color": categoria.color,
          "--cat-color-claro": categoria.colorClaro,
          background: activa ? hexAlpha(categoria.color, 0.16) : "var(--doc-surface)",
          boxShadow: activa ? `inset 0 0 0 2px ${categoria.color}` : "inset 0 0 0 1px var(--doc-border)",
        } as CSSProperties
      }
    >
      <span
        className="inline-flex items-center gap-1.5 text-[11px] font-bold"
        style={{ color: activa ? "var(--cat-texto)" : "var(--doc-text-muted)" }}
      >
        <span
          className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold"
          style={{
            background: activa ? "var(--cat-texto)" : "var(--doc-surface-sunken)",
            color: activa ? "var(--doc-sobre-relleno)" : "var(--doc-text-faint)",
          }}
        >
          {garantia.etiqueta.replace("Tipo ", "")}
        </span>
        {garantia.etiqueta}
      </span>
      <span className="doc-subtitulo mt-1.5 block">{garantia.titulo}</span>
      <ul className="mt-1.5 space-y-1">
        {garantia.caracteristicas.map((c) => (
          <li key={c} className="doc-prose flex gap-1.5 text-[11px] leading-snug text-[color:var(--doc-text-muted)]">
            <span aria-hidden style={{ color: activa ? "var(--cat-texto)" : "var(--doc-text-faint)" }}>
              ·
            </span>
            {c}
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
  bloques,
  total,
  enConstruccion,
  docs,
  onDoc,
  reducido,
}: {
  categoria: Categoria;
  garantia: string;
  bloques: BloqueDocumentos[];
  total: number;
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
    <div className="doc-cat space-y-4" style={estiloCategoria(categoria.codigo)}>
      <div className="flex items-center gap-3 rounded-[20px] p-4" style={{ background: "var(--cat-tinte)", boxShadow: "inset 0 0 0 1px var(--cat-borde)" }}>
        <span className="grid h-12 w-12 place-items-center rounded-[16px]" style={{ background: "var(--cat-tinte-fuerte)", color: "var(--cat-texto)" }}>
          <Icono className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="doc-subtitulo">
            {categoria.etiqueta}
            {garantiaCard ? ` · ${garantiaCard.etiqueta} (${garantiaCard.titulo})` : ""}
          </p>
          <p className="doc-prose text-[11px] text-[color:var(--doc-text-muted)]">
            {total} documento{total === 1 ? "" : "s"} propio{total === 1 ? "" : "s"} de esta categoría
            {bloques.filter((b) => b.titulo).length > 1 ? `, en ${bloques.length} bloques` : ""}.
          </p>
        </div>
      </div>

      {total === 0 ? (
        <Aviso intencion="info" titulo="Sin documentos adicionales">
          Esta categoría no añade requisitos a los generales.
        </Aviso>
      ) : (
        <PasoDocumentos
          titulo="Requisitos de la categoría"
          descripcion="Se piden además de los 16 generales. Cada bloque con título es una persona o una situación distinta."
          bloques={bloques}
          docs={docs}
          onDoc={onDoc}
          reducido={reducido}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Paso 5 — Revisión                                                   */
/* ------------------------------------------------------------------ */

/**
 * Resumen honesto antes de guardar.
 *
 * Dice lo que hay y lo que falta, y cada aviso lleva ENLACE al paso y al campo:
 * un resumen que informa de un problema sin llevar hasta él obliga a buscarlo, y
 * con cinco pasos y treinta campos eso es exactamente lo que la gente no hace.
 */
function PasoRevision({
  form,
  categoria,
  garantia,
  generales,
  especificos,
  docs,
  errores,
  onIr,
}: {
  form: Identidad;
  categoria: Categoria;
  garantia: string;
  generales: CatalogoDocumento[];
  especificos: CatalogoDocumento[];
  docs: Record<string, EstadoDoc>;
  errores: Record<string, string>;
  onIr: (id: PasoId) => void;
}) {
  const Icono = categoria.Icono;
  const garantiaCard = GARANTIAS_COMERCIAL.find((g) => g.codigo === garantia);
  const todos = useMemo(() => [...generales, ...especificos], [generales, especificos]);
  const total = todos.length;

  const cuenta = (estado: EstadoDocumento) => todos.filter((d) => (docs[d.codigo]?.estado ?? "PENDIENTE") === estado).length;

  const fisicos = todos.filter((d) => d.requiereConteoHojas);
  const conHojas = fisicos
    .map((d) => ({ doc: d, hojas: docs[d.codigo]?.hojasFisicas ?? 0 }))
    .filter((f) => f.hojas > 0);
  const hojasTotales = conHojas.reduce((suma, f) => suma + f.hojas, 0);

  const observaciones = todos
    .map((d) => ({ doc: d, texto: (docs[d.codigo]?.observaciones ?? "").trim() }))
    .filter((o) => o.texto !== "");

  const prorrogas = todos
    .map((d) => ({ doc: d, estado: docs[d.codigo] }))
    .filter((p) => p.estado?.prorrogaActiva && p.estado.prorrogaFecha);

  /** Problemas que conviene resolver antes de guardar, con su enlace. */
  const problemas: { texto: string; paso: PasoId }[] = [];
  if (!form.identificador.trim()) problemas.push({ texto: "Falta el carnet de identidad.", paso: "identidad" });
  if (!form.nombre.trim()) problemas.push({ texto: "Falta el nombre completo.", paso: "identidad" });
  if (!form.fechaIngreso) problemas.push({ texto: "Sin fecha de ingreso: el expediente no sabrá en qué año del libro va.", paso: "identidad" });
  if (!form.cargo.trim()) problemas.push({ texto: "Sin cargo: los reportes por cargo no lo contarán.", paso: "identidad" });
  for (const clave of Object.keys(errores)) {
    problemas.push({ texto: errores[clave], paso: clave === "categoria" || clave === "garantia" ? "categoria" : "identidad" });
  }
  const prorrogasSinFecha = todos.filter((d) => docs[d.codigo]?.prorrogaActiva && !docs[d.codigo]?.prorrogaFecha);
  for (const doc of prorrogasSinFecha) {
    problemas.push({ texto: `La prórroga de «${doc.nombre.slice(0, 48)}…» no tiene fecha límite.`, paso: doc.seccion === "generales" ? "generales" : "especificos" });
  }

  return (
    <div className="doc-cat space-y-4" style={estiloCategoria(categoria.codigo)}>
      <Encabezadillo titulo="Revisión" detalle="Confirma que todo está en orden. Al guardar, el expediente se crea y se abre para seguir trabajando." />

      {problemas.length > 0 && (
        <Aviso intencion="aviso" titulo={`${problemas.length} cosa(s) que conviene revisar`}>
          <ul className="space-y-1">
            {problemas.map((p, i) => (
              <li key={`${p.paso}-${i}`} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">{p.texto}</span>
                <button
                  type="button"
                  onClick={() => onIr(p.paso)}
                  className="doc-tap shrink-0 text-[11px] font-semibold underline-offset-2 hover:underline"
                >
                  Ir
                </button>
              </li>
            ))}
          </ul>
        </Aviso>
      )}

      <div className="doc-raised rounded-[20px] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-[16px]" style={{ background: "var(--cat-tinte-fuerte)", color: "var(--cat-texto)" }}>
              <Icono className="h-6 w-6" />
            </span>
            <div>
              <p className="doc-subtitulo">{form.nombre || "Sin nombre"}</p>
              <p className="doc-metric text-[11px] text-[color:var(--doc-text-muted)]">{form.identificador || "Sin carnet"}</p>
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
          <DatoRev etiqueta="Categoría" valor={`${categoria.etiquetaCorta}${garantiaCard ? ` · ${garantiaCard.etiqueta}` : ""}`} />
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TarjetaCuenta etiqueta="Requisitos" valor={total} intencion="info" />
        <TarjetaCuenta etiqueta="Entregados" valor={cuenta("ENTREGADO")} intencion="exito" />
        <TarjetaCuenta etiqueta="Pendientes" valor={cuenta("PENDIENTE") + cuenta("NO_ENTREGADO")} intencion="aviso" />
        <TarjetaCuenta etiqueta="No aplica" valor={cuenta("NO_APLICA")} intencion="neutral" />
      </div>

      {/* Documentos físicos con sus hojas: lo que va a pesar la carpeta. */}
      <div className="doc-surface rounded-[18px] p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="doc-subtitulo inline-flex items-center gap-1.5">
            <Files className="h-3.5 w-3.5" aria-hidden /> Documentos en físico
          </h4>
          <span className="doc-metric text-[11px] text-[color:var(--doc-text-muted)]">
            {hojasTotales} hoja{hojasTotales === 1 ? "" : "s"} en {conHojas.length} de {fisicos.length} documento(s)
          </span>
        </div>
        {conHojas.length === 0 ? (
          <p className="doc-nota mt-1 text-[11px]">
            Todavía no se ha anotado ninguna hoja. Se puede completar en el expediente.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {conHojas.map((f) => (
              <li key={f.doc.codigo} className="flex items-baseline justify-between gap-3 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-[color:var(--doc-text)]" title={f.doc.nombre}>
                  {f.doc.nombre}
                </span>
                <span className="doc-metric shrink-0 font-semibold text-[color:var(--doc-text-muted)]">{f.hojas} hj</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {observaciones.length > 0 && (
        <div className="doc-surface rounded-[18px] p-3.5">
          <h4 className="doc-subtitulo">Observaciones escritas ({observaciones.length})</h4>
          <ul className="mt-2 space-y-1.5">
            {observaciones.map((o) => (
              <li key={o.doc.codigo} className="text-[11px]">
                <span className="block font-semibold text-[color:var(--doc-text)]">{o.doc.nombre}</span>
                <span className="doc-prose block text-[color:var(--doc-text-muted)]">{o.texto}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {prorrogas.length > 0 && (
        <div className="doc-surface rounded-[18px] p-3.5">
          <h4 className="doc-subtitulo">Prórrogas ({prorrogas.length})</h4>
          <ul className="mt-2 space-y-1.5">
            {prorrogas.map((p) => (
              <li key={p.doc.codigo} className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-[color:var(--doc-text)]">{p.doc.nombre}</span>
                <span className="doc-metric shrink-0" style={{ color: TONO.aviso.texto }}>
                  hasta {p.estado!.prorrogaFecha}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Boton variante="suave" onClick={() => onIr("generales")}>
          Revisar documentos generales
        </Boton>
        <Boton variante="suave" onClick={() => onIr("especificos")}>
          Revisar requisitos de la categoría
        </Boton>
      </div>
    </div>
  );
}

function DatoRev({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="doc-eyebrow">{etiqueta}</dt>
      <dd className="truncate text-[color:var(--doc-text)]" title={valor}>
        {valor}
      </dd>
    </div>
  );
}

function TarjetaCuenta({ etiqueta, valor, intencion }: { etiqueta: string; valor: number; intencion: keyof typeof TONO }) {
  const tono = TONO[intencion];
  return (
    <div className="rounded-[16px] p-3 text-center" style={{ background: tono.fondo, boxShadow: `inset 0 0 0 1px ${tono.borde}` }}>
      <div className="doc-cifra text-xl" style={{ color: tono.texto }}>
        {valor}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: tono.texto }}>
        {etiqueta}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Piezas menores                                                      */
/* ------------------------------------------------------------------ */

function Encabezadillo({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div>
      <TextoRevelado como="h3" texto={titulo} className="doc-titulo block" />
      <TextoRevelado
        como="p"
        texto={detalle}
        retardo={0.04}
        className="doc-prose mt-1 block max-w-prose text-xs leading-relaxed text-[color:var(--doc-text-muted)]"
      />
    </div>
  );
}

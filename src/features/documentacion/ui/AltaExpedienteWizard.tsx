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
 * mapa de aplicabilidad y sus subsecciones por rama. El asistente NO inventa la
 * lista ni cablea qué documentos son físicos: pinta lo que el backend va a crear.
 * Así el formulario y el expediente no pueden discrepar.
 *
 * ── Cómo se guarda ──────────────────────────────────────────────────────────
 * En UNA sola llamada. `documentacion.expediente.crear` acepta la identidad, la
 * rama, los estados y observaciones de los requisitos, las hojas físicas y las
 * prórrogas, de forma idempotente y con reversión si algo falla a medias. Si el
 * backend desplegado todavía no conoce el alta ampliada —lo dice al no devolver
 * `altaCompleta`—, se cae **automáticamente** a la ruta antigua de cuatro pasos.
 * El asistente funciona con las dos.
 *
 * ── Superficie ──────────────────────────────────────────────────────────────
 * Ya no ocupa la pantalla entera: es una hoja central grande (`HojaCentral`) con
 * aire alrededor. En móvil ocupa todo, que ahí es lo correcto.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  FileQuestion,
  FolderOpen,
  FolderPlus,
  HardHat,
  IdCard,
  Layers,
  MessageSquarePlus,
  ShieldQuestion,
  Timer,
  User,
} from "lucide-react";
import { docApi } from "../api/acciones";
import { useConsola } from "../state/consola";
import { guardarEnCache } from "../state/cacheExpedientes";
import { DURACION, CURVA, useMovimientoReducido } from "./DocMotion";
import { Aviso, Boton, Campo, Confirmacion, Entrada, TONO } from "./piezas";
import { CampoFecha, diasDesdeHoy, fechaLegible } from "./CampoFecha";
import { TextoRevelado } from "./DocTexto";
import { SelectorAuxiliar } from "./SelectorAuxiliar";
import {
  CampoNombreLibre,
  ContadorHojas,
  ContadorHojasRevelado,
  LeyendaCondicional,
  SelectorPresentacion,
  SelloPresentacion,
  modoDesdePresentacion,
  modoLlevaHojas,
  type ModoPresentacion,
} from "./ContadorHojas";
import { AnilloProgreso } from "./AnilloProgreso";
import { CURVA_HOJA, HojaCentral } from "./HojaCentral";
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
import { INTENCION_DOCUMENTO, ETIQUETA_DOCUMENTO, type EstadoDocumento } from "../domain/vocabulario";
import { hoy } from "../domain/progreso";
import type { CatalogoCliente, CatalogoDocumento } from "../api/acciones";

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
  /** Solo en los requisitos de nombre libre («Otros»). */
  nombrePersonalizado: string;
  /**
   * Presentación elegida en los requisitos que la admiten.
   *
   * `null` significa «la que diga el catálogo». No se inicializa con el valor
   * heredado a propósito: así el asistente solo manda la presentación cuando la
   * persona la tocó de verdad, y el historial del expediente no se llena de
   * cambios que nadie hizo.
   */
  presentacion: ModoPresentacion | null;
}

function docInicial(estadoInicial: EstadoDocumento = "PENDIENTE"): EstadoDoc {
  return {
    estado: estadoInicial,
    observaciones: "",
    hojasFisicas: 0,
    prorrogaActiva: false,
    prorrogaFecha: "",
    prorrogaMotivo: "",
    nombrePersonalizado: "",
    presentacion: null,
  };
}

/**
 * Estado inicial de un documento según el catálogo.
 *
 * `otros-documento` nace `NO_APLICA` para no arrastrar un pendiente eterno. El
 * dato viene del catálogo (`estadoInicial`), no cableado por código: si el área
 * decide mañana que otro requisito opcional nazca igual, no hay nada que tocar
 * aquí.
 */
function estadoInicialDe(doc: CatalogoDocumento): EstadoDocumento {
  const declarado = String(doc.estadoInicial ?? "").toUpperCase();
  const validos: EstadoDocumento[] = ["PENDIENTE", "ENTREGADO", "NO_ENTREGADO", "NO_APLICA"];
  return (validos as string[]).includes(declarado) ? (declarado as EstadoDocumento) : "PENDIENTE";
}

/** Presentación efectiva de un documento en el asistente. */
function modoEfectivo(doc: CatalogoDocumento, estado: EstadoDoc): ModoPresentacion {
  if (estado.presentacion) return estado.presentacion;
  return modoDesdePresentacion(doc.presentacionFisica, doc.presentacionDigital);
}

/** ¿Hay que mostrar el contador de hojas de este documento, aquí y ahora? */
function llevaHojas(doc: CatalogoDocumento, estado: EstadoDoc): boolean {
  if (doc.presentacionEditable) return modoLlevaHojas(modoEfectivo(doc, estado));
  return doc.requiereConteoHojas;
}

type PasoId = "identidad" | "generales" | "categoria" | "especificos" | "revision";

/**
 * Un cambio de requisito listo para viajar.
 *
 * `presentacion` y `nombrePersonalizado` solo se aceptan en los requisitos que
 * el catálogo marca como personalizables; el backend rechaza el resto con un
 * mensaje explícito, y esta capa no intenta adivinarlo: manda lo que la persona
 * tocó y deja que la regla viva en un solo sitio.
 */
interface CambioRequisito {
  codigo: string;
  estado?: string;
  observaciones?: string;
  hojasFisicas?: number;
  nombrePersonalizado?: string;
  presentacion?: ModoPresentacion;
}

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

/** Subsección del documento para la rama elegida. Contrato del catálogo. */
function subseccionDe(doc: CatalogoDocumento, garantia: string): string {
  const mapa = doc.subsecciones ?? {};
  return mapa[garantia] ?? mapa["*"] ?? doc.subseccion ?? "";
}

/** Agrupa documentos por subsección conservando el orden del catálogo. */
function porSubseccion(documentos: CatalogoDocumento[], garantia: string): { titulo: string; docs: CatalogoDocumento[] }[] {
  const bloques = new Map<string, CatalogoDocumento[]>();
  for (const doc of documentos) {
    const titulo = subseccionDe(doc, garantia);
    const lista = bloques.get(titulo) ?? [];
    lista.push(doc);
    bloques.set(titulo, lista);
  }
  return [...bloques.entries()].map(([titulo, docs]) => ({ titulo, docs }));
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
  /**
   * El cuerpo se monta y desmonta con `abierta`, sin `AnimatePresence` alrededor.
   *
   * La animación de entrada y salida la hace `HojaCentral`, que tiene su propio
   * `AnimatePresence` interno. Envolver además aquí produciría dos apretones de
   * manos anidados y, si el interior no reporta el fin de su salida, el asistente
   * no se volvería a abrir nunca.
   */
  if (!abierta) return null;
  return <WizardCuerpo onCerrar={onCerrar} onCreado={onCreado} onError={onError} onAviso={onAviso} />;
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
  const [progreso, setProgreso] = useState("");
  const [pidiendoCierre, setPidiendoCierre] = useState(false);
  /** Duplicado detectado por el backend, con el expediente al que apunta. */
  const [duplicado, setDuplicado] = useState<{ expedienteId: string; nombre: string; identificador: string } | null>(null);
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

  const cat: Categoria | null = categoria ? categoriaDe(categoria) : null;
  const esComercial = categoria === "COMERCIAL";
  const enConstruccion = Boolean(cat && !cat.activa);
  const garantiaEfectiva = esComercial ? garantia : "NINGUNA";

  const documentos = catalogo?.documentos ?? [];
  /** Solo los vigentes: un requisito retirado no se pide en un alta nueva. */
  const generales = useMemo(
    () => documentos.filter((d) => d.seccion === "generales" && d.activo && !d.retirado),
    [documentos],
  );

  /** Códigos aplicables a la rama elegida, según el backend. */
  const codigosAplicables = useMemo(() => {
    if (!catalogo || !categoria) return [] as string[];
    const rama = catalogo.aplicabilidad.find(
      (a) => a.tipoFuncionario === categoria && a.tipoGarantia === garantiaEfectiva,
    );
    return rama?.codigos ?? [];
  }, [catalogo, categoria, garantiaEfectiva]);

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

  /**
   * Avance documental, con la MISMA regla que el backend.
   *
   * Entregados sobre exigibles, donde «exigibles» son todos menos los marcados
   * «no aplica». Repetir la regla aquí no es duplicarla por gusto: el asistente
   * tiene que poder mostrar el avance mientras se marca, antes de que exista
   * expediente contra el que preguntar. La prueba `dominio.test.ts` compara las
   * dos implementaciones para que no se separen.
   *
   * Mientras no hay categoría elegida, los exigibles son los generales: es lo
   * que hay, y decir 0 % con dieciséis documentos marcados sería mentir.
   */
  const avanceDocumental = useMemo(() => {
    const aplicables = categoria && !enConstruccion ? [...generales, ...especificos] : generales;
    if (!aplicables.length) return 0;
    let entregados = 0;
    let noAplica = 0;
    for (const doc of aplicables) {
      const estado = docs[doc.codigo]?.estado ?? estadoInicialDe(doc);
      if (estado === "ENTREGADO") entregados += 1;
      else if (estado === "NO_APLICA") noAplica += 1;
    }
    const denominador = aplicables.length - noAplica;
    if (denominador <= 0) return 100;
    return Math.round((entregados / denominador) * 100);
  }, [categoria, enConstruccion, generales, especificos, docs]);

  /**
   * ¿Añade esta rama requisitos propios?
   *
   * Se pregunta al catálogo, en dos niveles y por ese orden:
   *
   *   1. `aplicabilidad[].propios` — el recuento que calcula el backend. Es la
   *      verdad, porque sale del mismo motor que va a crear los requisitos.
   *   2. La lista de específicos ya resuelta, si el backend desplegado es
   *      anterior a este cambio y no manda `propios`.
   *
   * Y solo si no hay catálogo todavía se usa la pista de la categoría
   * (`sinRequisitosPropios`), que existe para poder decir «no pide más
   * documentos» en la tarjeta antes de que llegue la red.
   *
   * Nada de esto compara con `"ADMINISTRATIVO"`. Es deliberado: el día que el
   * área defina los requisitos de Ejecutivo —o quite los de Cumplimiento— el
   * asistente se adapta sin que nadie recuerde que había un `if` con un nombre
   * de rama dentro.
   */
  const ramaSinRequisitosPropios = useMemo(() => {
    if (!categoria || enConstruccion) return false;
    const rama = catalogo?.aplicabilidad.find(
      (a) => a.tipoFuncionario === categoria && a.tipoGarantia === garantiaEfectiva,
    );
    if (rama) {
      if (typeof rama.propios === "number") return rama.propios === 0;
      return especificos.length === 0;
    }
    return cat?.sinRequisitosPropios === true;
  }, [catalogo, categoria, garantiaEfectiva, enConstruccion, especificos.length, cat]);

  /**
   * El camino del asistente, que NO siempre tiene cinco pasos.
   *
   * Cuando la rama elegida no añade documentación —el área administrativa, hoy—
   * el paso de requisitos específicos desaparece del recorrido: el indicador
   * pasa a decir «Paso 3 de 4» y «Continuar» lleva directo a la revisión.
   * Mostrarlo vacío con un cartel de «esta categoría no añade requisitos» era
   * una pantalla entera para no decir nada.
   */
  const pasos: Paso[] = useMemo(() => {
    const camino: Paso[] = [
      { id: "identidad", titulo: "Identidad", descripcion: "Quién es y de dónde viene." },
      { id: "generales", titulo: "Documentos generales", descripcion: "Los requisitos de toda incorporación." },
      { id: "categoria", titulo: "Tipo de funcionario", descripcion: "El punto de inflexión del expediente." },
      { id: "especificos", titulo: "Requisitos de la categoría", descripcion: "Solo los de su rama." },
      { id: "revision", titulo: "Revisión y guardado", descripcion: "Confirma y abre el expediente." },
    ];
    return ramaSinRequisitosPropios ? camino.filter((p) => p.id !== "especificos") : camino;
  }, [ramaSinRequisitosPropios]);

  /**
   * El paso que se pinta de verdad.
   *
   * Si alguien estaba en «requisitos de la categoría» y vuelve atrás a elegir el
   * área administrativa, ese paso deja de existir. Sin esta corrección el índice
   * sería −1 y «Continuar» devolvería al primer paso, que es el peor resultado
   * posible: parece que el formulario se reinició.
   */
  const pasoVigente: PasoId = pasos.some((p) => p.id === paso) ? paso : "revision";
  useEffect(() => {
    if (pasoVigente !== paso) setPaso(pasoVigente);
  }, [pasoVigente, paso]);

  const indice = Math.max(0, pasos.findIndex((p) => p.id === pasoVigente));

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
    setDocs((prev) => {
      const doc = documentos.find((d) => d.codigo === codigo);
      const base = docInicial(doc ? estadoInicialDe(doc) : "PENDIENTE");
      return { ...prev, [codigo]: { ...base, ...prev[codigo], ...patch } };
    });
  }

  /* --- Validación por paso --- */
  function validarIdentidad(): boolean {
    const e: Record<string, string> = {};
    /**
     * El identificador es el CARNET DE IDENTIDAD, sin formato impuesto.
     *
     * La versión anterior exigía «CI - número de proceso - año» con una expresión
     * regular, y eso rechazaba carnets perfectamente válidos: los que llevan
     * complemento alfanumérico (`1234567 1K`), los extranjeros y los que el área
     * escribe con puntos. Lo único obligatorio es que no esté vacío.
     */
    if (!form.identificador.trim()) e.identificador = "Escribe el carnet de identidad.";
    if (!form.nombre.trim()) e.nombre = "Escribe el nombre completo.";
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  function puedeAvanzar(): boolean {
    if (pasoVigente === "identidad") return validarIdentidad();
    if (pasoVigente === "categoria") {
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
    /* Un destino que no está en el camino actual —«requisitos de la categoría»
       cuando la rama no los tiene— se resuelve a la revisión en lugar de no
       hacer nada: un botón que no responde parece roto. */
    const existe = pasos.some((p) => p.id === destino);
    const objetivo: PasoId = existe ? destino : "revision";
    const idxDestino = pasos.findIndex((p) => p.id === objetivo);
    // Solo se puede saltar hacia atrás, o hacia adelante si los pasos previos son válidos.
    if (idxDestino <= indice) {
      setErrores({});
      setPaso(objetivo);
      return;
    }
    if (pasoVigente === "identidad" && !validarIdentidad()) return;
    setErrores({});
    setPaso(objetivo);
  }

  /**
   * Cambios de requisito listos para viajar.
   *
   * Se envía solo lo que la persona tocó de verdad: un estado distinto de
   * PENDIENTE, una observación escrita o un conteo de hojas mayor que cero.
   * Mandar los veinticinco requisitos con su valor por defecto llenaría el
   * historial de cambios que nunca ocurrieron.
   */
  function cambiosDeRequisitos(): CambioRequisito[] {
    const salida: CambioRequisito[] = [];
    const aplicables = new Set(codigosAplicables);
    const porCodigo = new Map(documentos.map((d) => [d.codigo, d]));
    for (const [codigo, ed] of Object.entries(docs)) {
      if (!aplicables.has(codigo)) continue; // no aplica a esta rama: se ignora
      const doc = porCodigo.get(codigo);
      /**
       * «Tocado» se compara contra el estado INICIAL del catálogo, no contra
       * `PENDIENTE`.
       *
       * Es el matiz que trajo «Otros»: ese requisito nace `NO_APLICA`, así que
       * comparar con `PENDIENTE` lo consideraba modificado siempre y mandaba un
       * cambio —`estado: NO_APLICA`— por cada expediente creado. El backend lo
       * aceptaba sin hacer nada y el historial se llenaba de líneas que no
       * registran ninguna decisión.
       */
      const inicial = doc ? estadoInicialDe(doc) : "PENDIENTE";
      const cambioEstado = ed.estado !== inicial;
      const cambioObs = ed.observaciones.trim() !== "";
      const cambioHojas = ed.hojasFisicas > 0;
      const cambioNombre = Boolean(doc?.permiteNombreLibre) && ed.nombrePersonalizado.trim() !== "";
      const cambioPresentacion = Boolean(doc?.presentacionEditable) && ed.presentacion !== null;
      if (!cambioEstado && !cambioObs && !cambioHojas && !cambioNombre && !cambioPresentacion) continue;
      salida.push({
        codigo,
        ...(cambioEstado ? { estado: ed.estado } : {}),
        ...(cambioObs ? { observaciones: ed.observaciones.trim() } : {}),
        ...(cambioHojas ? { hojasFisicas: ed.hojasFisicas } : {}),
        ...(cambioNombre ? { nombrePersonalizado: ed.nombrePersonalizado.trim() } : {}),
        ...(cambioPresentacion ? { presentacion: ed.presentacion as ModoPresentacion } : {}),
      });
    }
    return salida;
  }

  function prorrogasARegistrar(): { codigo: string; fechaProrroga: string; motivo: string }[] {
    const aplicables = new Set(codigosAplicables);
    return Object.entries(docs)
      .filter(([codigo, ed]) => aplicables.has(codigo) && ed.prorrogaActiva && ed.prorrogaFecha)
      .map(([codigo, ed]) => ({
        codigo,
        fechaProrroga: ed.prorrogaFecha,
        motivo: ed.prorrogaMotivo.trim() || "Prórroga registrada al abrir el expediente.",
      }));
  }

  async function guardar() {
    if (!validarIdentidad()) {
      setPaso("identidad");
      return;
    }
    if (!categoria || enConstruccion || (esComercial && !garantia)) {
      setPaso("categoria");
      setErrores(
        esComercial && !garantia ? { garantia: "Elige el tipo de garantía." } : { categoria: "Elige el tipo de funcionario." },
      );
      return;
    }

    setGuardando(true);
    setProgreso("Creando el expediente…");
    const cambios = cambiosDeRequisitos();
    const prorrogas = prorrogasARegistrar();

    try {
      const identidad = {
        identificador: form.identificador.trim(),
        nombre: form.nombre.trim(),
        cargo: form.cargo.trim(),
        agencia: form.agencia.trim(),
        gerencia: form.gerencia.trim(),
        fechaIngreso: form.fechaIngreso,
        responsableId: form.responsableId.trim(),
        tipoFuncionario: categoria,
        tipoGarantia: garantiaEfectiva,
        idempotencyKey: clave,
      };

      // Camino rápido: identidad, requisitos y prórrogas en UNA llamada.
      const creado = await docApi.crearExpediente({ ...identidad, requisitos: cambios, prorrogas });

      if (creado.altaCompleta) {
        if (creado.requisitosFallidos?.length) {
          onAviso?.(
            "aviso",
            `El expediente se creó, pero ${creado.requisitosFallidos.length} marca no se aplicó.`,
            creado.requisitosFallidos[0]?.motivo,
          );
        }
        if (creado.prorrogasFallidas?.length) {
          onAviso?.(
            "aviso",
            `El expediente se creó, pero ${creado.prorrogasFallidas.length} prórroga no se registró.`,
            creado.prorrogasFallidas[0]?.motivo,
          );
        }
        // El detalle viene de vuelta: el visor se abre sin esperar otra red.
        if (creado.detalle) guardarEnCache(creado.detalle);
        clearDraft();
        onCreado(creado.expedienteId, creado.requisitos ?? codigosAplicables.length);
        return;
      }

      /**
       * Recaída automática a la ruta antigua de cuatro pasos.
       *
       * Un backend desplegado antes de este cambio ignora `requisitos` y
       * `prorrogas` y no devuelve `altaCompleta`. En lugar de fallar —o de
       * perder en silencio lo que la persona marcó—, se aplica el camino de
       * siempre. Es lo que permite desplegar el frontend sin haber publicado
       * todavía la versión nueva del Apps Script.
       */
      if (cambios.length || prorrogas.length) {
        setProgreso("El backend es de una versión anterior: aplicando las marcas paso a paso…");
        const detalle = await docApi.obtenerExpediente(creado.expedienteId);
        const porCodigo = new Map(detalle.requisitos.map((r) => [r.codigo, r]));

        const lote = cambios
          .map((c) => {
            const req = porCodigo.get(c.codigo);
            if (!req) return null;
            return { expedienteDocumentoId: req.expedienteDocumentoId, version: req.version, ...c };
          })
          .filter((c): c is NonNullable<typeof c> => Boolean(c));
        if (lote.length) await docApi.guardarRequisitos(creado.expedienteId, lote);

        for (const prorroga of prorrogas) {
          const req = porCodigo.get(prorroga.codigo);
          if (!req || !req.permiteProrroga) continue;
          try {
            await docApi.crearProrroga({
              expedienteDocumentoId: req.expedienteDocumentoId,
              fechaProrroga: prorroga.fechaProrroga,
              motivo: prorroga.motivo,
            });
          } catch (e) {
            // Una prórroga que falla no debe tumbar el alta: se avisa y se sigue.
            const f = e as { message?: string };
            onError(`El expediente se creó, pero una prórroga no se registró: ${f.message ?? ""}`);
          }
        }
      }

      clearDraft();
      onCreado(creado.expedienteId, creado.requisitos ?? codigosAplicables.length);
    } catch (error) {
      const fallo = error as {
        message?: string;
        pista?: string;
        campos?: Record<string, string>;
        codigo?: string;
        detalle?: Record<string, unknown>;
      };
      /**
       * Duplicado: el trabajo del formulario NO se pierde.
       *
       * El backend devuelve el expediente existente en `detalle`. Se muestra en
       * una cinta con acceso directo, el asistente sigue abierto con todo lo
       * escrito y la persona decide: abrir el que existe o corregir el carnet.
       */
      if (fallo.codigo === "CONFLICTO" && fallo.detalle?.expedienteId) {
        setDuplicado({
          expedienteId: String(fallo.detalle.expedienteId),
          nombre: String(fallo.detalle.nombre ?? ""),
          identificador: String(fallo.detalle.identificador ?? form.identificador),
        });
        setPaso("identidad");
        setErrores({ identificador: "Ya hay un expediente con este carnet." });
        return;
      }
      if (fallo.campos && Object.keys(fallo.campos).length) {
        setErrores(fallo.campos);
        if (fallo.campos.identificador || fallo.campos.nombre) setPaso("identidad");
      }
      onError(fallo.message ?? "No se pudo crear el expediente.", fallo.pista);
    } finally {
      setGuardando(false);
      setProgreso("");
    }
  }

  /* Cinta de estado del borrador: dice que nada se está perdiendo mientras se
     escribe, y ofrece retomar el que quedó de la última vez. */
  const cintaBorrador =
    ofreciendoBorrador && recoveredDraft ? (
      <div className="mb-4">
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

  const cintaDuplicado = duplicado ? (
    <div className="mb-4">
      <Aviso intencion="aviso" titulo="Ya existe un expediente con ese carnet">
        <span className="block">
          <strong>{duplicado.nombre || "Expediente existente"}</strong> · {duplicado.identificador}. Nada de lo que
          escribiste se ha perdido: puedes abrir el que existe o corregir el número del carnet y volver a guardar.
        </span>
        <span className="mt-2 flex flex-wrap gap-2">
          <Boton variante="primario" onClick={() => onCreado(duplicado.expedienteId, 0)}>
            <FolderOpen className="h-3.5 w-3.5" aria-hidden /> Abrir el expediente existente
          </Boton>
          <Boton variante="suave" onClick={() => setDuplicado(null)}>
            Corregir el carnet
          </Boton>
        </span>
      </Aviso>
    </div>
  ) : null;

  return (
    <>
      <HojaCentral
        abierta
        onCerrar={onCerrar}
        etiqueta="Nuevo expediente documental"
        ancho="media"
        bloqueada={guardando}
        pideConfirmacion={hayDatos}
        onPedirConfirmacion={() => setPidiendoCierre(true)}
        encabezado={
          <Encabezado
            pasos={pasos}
            indice={indice}
            onIr={irA}
            identidad={form}
            categoria={cat}
            avance={avanceDocumental}
            reducido={reducido}
          />
        }
        pie={
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
        }
      >
        {cintaBorrador}
        {cintaDuplicado}
        {/* Sin `mode="wait"`: si un paso no reporta el fin de su salida, el
            siguiente no se montaría nunca y el asistente quedaría en blanco. */}
        <motion.div
          key={pasoVigente}
          initial={reducido ? false : { opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reducido ? { duration: 0 } : { duration: 0.42, ease: CURVA_HOJA }}
        >
          {pasoVigente === "identidad" && (
            <PasoIdentidad form={form} poner={poner} errores={errores} catalogo={catalogo} reducido={reducido} onAviso={onAviso} />
          )}
          {pasoVigente === "generales" && (
            <PasoDocumentos
              titulo="Documentos generales"
              descripcion={`Los ${generales.length} requisitos de toda incorporación. Puedes marcarlos ahora o dejarlos pendientes y completarlos en el expediente.`}
              documentos={generales}
              garantia={garantiaEfectiva}
              docs={docs}
              onDoc={ponerDoc}
              reducido={reducido}
            />
          )}
          {pasoVigente === "categoria" && (
            <PasoCategoria
              categoria={categoria}
              garantia={garantia}
              catalogo={catalogo}
              sinRequisitosPropios={ramaSinRequisitosPropios}
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
          {pasoVigente === "especificos" && (
            <PasoEspecificos
              categoria={cat ?? CATEGORIA_GENERAL}
              garantia={garantiaEfectiva}
              documentos={especificos}
              enConstruccion={enConstruccion}
              docs={docs}
              onDoc={ponerDoc}
              reducido={reducido}
            />
          )}
          {pasoVigente === "revision" && (
            <PasoRevision
              form={form}
              categoria={cat ?? CATEGORIA_GENERAL}
              garantia={garantiaEfectiva}
              generales={generales}
              especificos={especificos}
              docs={docs}
              errores={errores}
              onIr={irA}
              sinRequisitosPropios={ramaSinRequisitosPropios}
            />
          )}
        </motion.div>
      </HojaCentral>

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
}

/* ------------------------------------------------------------------ */
/* Encabezado con indicador de pasos                                   */
/* ------------------------------------------------------------------ */

/**
 * Cabecera del asistente: quién, dónde va y cuánto lleva.
 *
 * ── El fallo que corrige ────────────────────────────────────────────────────
 * Antes decía «Nuevo expediente documental / Paso 4 de 5 · Requisitos de la
 * categoría» y nada más. En el paso cuatro, quien llena el expediente lleva
 * tres pantallas sin ver a QUIÉN pertenece: si se equivocó de persona en el
 * paso uno, se enteraba al guardar. Ahora los tres datos que identifican el
 * expediente —nombre, carnet y agencia— viajan en la cabecera, y el anillo dice
 * cuánta documentación hay resuelta.
 *
 * ── Contraste ───────────────────────────────────────────────────────────────
 * El texto del paso estaba en `--doc-text-muted`, que en el tema claro es un
 * gris azulado (#33506f) sobre cristal blanco: cumple AA pero se lee mal con
 * brillo bajo, y era exactamente la queja. El nombre y el número del paso pasan
 * a `--doc-text` (#0a2747, casi negro, 13:1) y solo el conector queda atenuado.
 *
 * ── Animación ───────────────────────────────────────────────────────────────
 * Discreta y una sola por cambio: el título del paso entra con un
 * desplazamiento de 4 px y el anillo interpola su arco. Nada de rebotes: esta
 * cabecera se mira treinta veces por expediente.
 */
function Encabezado({
  pasos,
  indice,
  onIr,
  identidad,
  categoria,
  avance,
  reducido,
}: {
  pasos: Paso[];
  indice: number;
  onIr: (id: PasoId) => void;
  identidad: Identidad;
  categoria: Categoria | null;
  avance: number;
  reducido: boolean;
}) {
  const nombre = identidad.nombre.trim();
  const carnet = identidad.identificador.trim();
  const agencia = identidad.agencia.trim();
  const hayIdentidad = Boolean(nombre || carnet || agencia);
  const color = categoria?.color;

  return (
    <div>
      <div className="flex items-start gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
          style={{ background: "var(--doc-info-bg)", color: "var(--doc-info-fg)" }}
        >
          <FolderPlus className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="doc-balance text-[15px] font-bold tracking-tight text-[color:var(--doc-text)]">
            Nuevo expediente documental
          </h2>
          {/* El número del paso en tinta plena; el conector, atenuado. */}
          <p className="doc-prose text-xs text-[color:var(--doc-text)]">
            <span className="doc-metric font-bold">
              Paso {indice + 1} de {pasos.length}
            </span>
            <span className="mx-1 text-[color:var(--doc-text-faint)]" aria-hidden>
              ·
            </span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.em
                key={pasos[indice]?.id ?? indice}
                className="not-italic font-bold"
                initial={reducido ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducido ? undefined : { opacity: 0, y: -4 }}
                transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo }}
                style={{ display: "inline-block" }}
              >
                {pasos[indice]?.titulo}
              </motion.em>
            </AnimatePresence>
          </p>

          {/* Identidad en contexto. Aparece en cuanto hay algo que mostrar y no
              antes: tres chips vacíos serían ruido en el primer paso. */}
          <AnimatePresence initial={false}>
            {hayIdentidad && (
              <motion.div
                className="doc-identidad mt-2"
                initial={reducido ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reducido ? undefined : { opacity: 0, height: 0 }}
                transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaQuint }}
              >
                {nombre && (
                  <span className="doc-identidad-dato doc-identidad-nombre" title={nombre}>
                    <User className="h-3.5 w-3.5" aria-hidden />
                    {nombre}
                  </span>
                )}
                {carnet && (
                  <span className="doc-identidad-dato doc-metric" title={`Carnet de identidad ${carnet}`}>
                    <IdCard className="h-3.5 w-3.5" aria-hidden />
                    {carnet}
                  </span>
                )}
                {agencia ? (
                  <span className="doc-identidad-dato" title={`Agencia ${agencia}`}>
                    <Building2 className="h-3.5 w-3.5" aria-hidden />
                    {agencia}
                  </span>
                ) : (
                  <span className="doc-identidad-dato" data-vacio="si">
                    <Building2 className="h-3.5 w-3.5" aria-hidden />
                    Sin agencia
                  </span>
                )}
                {categoria && (
                  <span
                    className="doc-identidad-dato"
                    style={{ boxShadow: `inset 0 0 0 1.5px ${hexAlpha(categoria.color, 0.55)}` }}
                    title={categoria.etiqueta}
                  >
                    <categoria.Icono className="h-3.5 w-3.5" style={{ color: categoria.color }} />
                    {categoria.etiquetaCorta}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Anillo de avance documental. Se actualiza en el mismo fotograma en
            que se marca un documento: no espera al backend, porque el dato es
            el de la pantalla. */}
        <span className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
          <AnilloProgreso valor={avance} etiqueta="Avance documental" color={color} reducido={reducido} />
          <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--doc-text-faint)]">
            avance
          </span>
        </span>
      </div>

      {/* Pasos: navegación cómoda hacia atrás, con progreso animado. */}
      <ol className="mt-3 flex items-center gap-1 overflow-x-auto pb-0.5" aria-label="Pasos del asistente">
        {pasos.map((p, i) => {
          const hecho = i < indice;
          const activo = i === indice;
          return (
            <li key={p.id} className="flex items-center">
              <button
                type="button"
                onClick={() => onIr(p.id)}
                aria-current={activo ? "step" : undefined}
                className="doc-tap group flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold transition-colors"
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
    </div>
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
    <div className="flex items-center justify-between gap-3">
      <Boton variante="suave" onClick={onRetroceder} disabled={indice === 0 || guardando}>
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Atrás
      </Boton>
      {/* Progreso real, no un girador: dice en qué paso está el guardado. */}
      {guardando && progreso && (
        <p className="doc-prose min-w-0 flex-1 truncate text-center text-[11px] text-[color:var(--doc-text-muted)]" role="status">
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
  form: Identidad;
  poner: (campo: keyof Identidad, valor: string) => void;
  errores: Record<string, string>;
  catalogo: CatalogoCliente | null;
  reducido: boolean;
  onAviso?: (intencion: "info" | "exito" | "aviso" | "peligro", texto: string, pista?: string) => void;
}) {
  const agencias = catalogo?.auxiliares.agencia_bdp ?? [];
  const gerencias = catalogo?.auxiliares.gerencia_bdp ?? [];
  const cargos = catalogo?.auxiliares.cargo_bdp ?? [];

  return (
    <div className="space-y-6">
      <Encabezadillo
        titulo="¿Quién ingresa?"
        detalle="El carnet de identidad y el nombre son obligatorios; el resto ayuda a clasificar y a reportar."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo
            etiqueta="Carnet de identidad"
            requerido
            error={errores.identificador}
            ayuda="Escríbelo como aparece en el documento; se admite cualquier formato."
          >
            <div className="relative">
              <IdCard
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--doc-text-faint)" }}
                aria-hidden
              />
              <Entrada
                value={form.identificador}
                onChange={(e) => poner("identificador", e.target.value)}
                placeholder="Ej. 1234567 1K"
                className="pl-9 font-semibold"
                data-foco-inicial
                autoFocus
              />
            </div>
          </Campo>
        </div>
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
        <span className="text-[13px] font-bold text-[color:var(--doc-text)]">Fecha de ingreso</span>
      </div>
      <p className="doc-prose mt-0.5 text-[11px] italic text-[color:var(--doc-text-faint)]">
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

function PasoDocumentos({
  titulo,
  descripcion,
  documentos,
  garantia,
  docs,
  onDoc,
  reducido,
}: {
  titulo: string;
  descripcion: string;
  documentos: CatalogoDocumento[];
  garantia: string;
  docs: Record<string, EstadoDoc>;
  onDoc: (codigo: string, patch: Partial<EstadoDoc>) => void;
  reducido: boolean;
}) {
  const hayCondicional = documentos.some((d) => d.presentacionFisica === "CONDICIONAL");
  return (
    <div className="space-y-4">
      <Encabezadillo titulo={titulo} detalle={descripcion} />
      <ul className="space-y-2.5">
        {documentos.map((doc, i) => (
          <FilaDocumento
            key={doc.codigo}
            doc={doc}
            garantia={garantia}
            estado={docs[doc.codigo] ?? docInicial(estadoInicialDe(doc))}
            onDoc={onDoc}
            reducido={reducido}
            orden={i}
          />
        ))}
      </ul>
      {hayCondicional && <LeyendaCondicional />}
    </div>
  );
}

const ESTADOS_CHIP: EstadoDocumento[] = ["ENTREGADO", "PENDIENTE", "NO_ENTREGADO"];

function FilaDocumento({
  doc,
  garantia,
  estado,
  onDoc,
  reducido,
  orden,
}: {
  doc: CatalogoDocumento;
  garantia: string;
  estado: EstadoDoc;
  onDoc: (codigo: string, patch: Partial<EstadoDoc>) => void;
  reducido: boolean;
  orden: number;
}) {
  const [obsAbierta, setObsAbierta] = useState(false);
  const opciones: EstadoDocumento[] = doc.permiteNoAplica ? [...ESTADOS_CHIP, "NO_APLICA"] : ESTADOS_CHIP;
  const mostrarObs = obsAbierta || estado.observaciones.trim() !== "";
  const diasProrroga = estado.prorrogaActiva && estado.prorrogaFecha ? diasDesdeHoy(estado.prorrogaFecha) : null;
  const noAplica = estado.estado === "NO_APLICA";
  /* La presentación efectiva y el nombre efectivo se resuelven aquí y se pasan a
     los hijos: así el contador, el selector y las etiquetas accesibles hablan
     todos del mismo documento, incluso cuando la persona acaba de renombrarlo. */
  const modo = modoEfectivo(doc, estado);
  const pideHojas = llevaHojas(doc, estado);
  const nombreVisible = estado.nombrePersonalizado.trim() || doc.nombre;

  /**
   * Escribir el nombre de «Otros» lo pone EN USO; borrarlo lo saca.
   *
   * ── Por qué hace falta ────────────────────────────────────────────────────
   * Este requisito nace `NO_APLICA` para no arrastrar un pendiente eterno en
   * todos los expedientes del banco. Pero el «no aplica» apaga los chips y el
   * contador, así que sin esta promoción automática la persona escribía el
   * nombre y se encontraba una fila muerta: tenía que adivinar que primero hay
   * que pulsar «Pendiente».
   *
   * La vuelta atrás es igual de importante y solo ocurre cuando no hay nada que
   * perder: si alguien ya marcó «Entregado», contó hojas o escribió una
   * observación, borrar el nombre NO saca el requisito del expediente. Sería
   * descontar trabajo hecho por una tecla de borrar.
   */
  function escribirNombre(valor: string) {
    const inicial = estadoInicialDe(doc);
    const patch: Partial<EstadoDoc> = { nombrePersonalizado: valor };
    const hayNombre = valor.trim() !== "";
    if (inicial === "NO_APLICA") {
      if (hayNombre && estado.estado === "NO_APLICA") patch.estado = "PENDIENTE";
      else if (
        !hayNombre &&
        estado.estado === "PENDIENTE" &&
        estado.hojasFisicas === 0 &&
        estado.observaciones.trim() === ""
      ) {
        patch.estado = "NO_APLICA";
      }
    }
    onDoc(doc.codigo, patch);
  }

  return (
    /* Entrada en CSS, no con framer-motion: son dieciséis filas en los generales
       y hasta nueve más en la rama, y un resorte por fila se nota en un equipo
       modesto. Ver `.doc-fila-entra` en `documentacion.css`. */
    <li
      className={`doc-raised rounded-[var(--doc-radius,14px)] p-3.5 ${reducido ? "" : "doc-fila-entra"}`}
      style={reducido ? undefined : ({ "--doc-fila": orden } as React.CSSProperties)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* El texto completo, sin recortar: los nombres de esta lista son
              frases enteras y un nombre con puntos suspensivos obliga a pasar el
              puntero para saber qué documento es. */}
          {doc.permiteNombreLibre ? (
            /* Requisito de nombre libre: el nombre del catálogo queda como
               rótulo del bloque y el campo es el que manda. Se muestran los dos
               porque hacen falta los dos: el rótulo dice qué es esta fila y el
               campo dice qué documento concreto se está registrando. */
            <div className="space-y-1.5">
              <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--doc-text-faint)]">
                <FileQuestion className="h-3.5 w-3.5" aria-hidden />
                {doc.nombre}
              </p>
              {/* El campo de nombre NUNCA se deshabilita.
                  Es la puerta de entrada del requisito: si se apagara con el
                  «no aplica» con el que nace, nadie podría llegar a usarlo. */}
              <CampoNombreLibre valor={estado.nombrePersonalizado} onChange={escribirNombre} />
              {estado.nombrePersonalizado.trim() === "" && (
                <p className="doc-prose text-[11px] text-[color:var(--doc-text-faint)]">
                  Déjalo vacío si no hay ningún documento extra. Al escribir un nombre, el requisito entra en el
                  expediente.
                </p>
              )}
            </div>
          ) : (
            <p className="doc-prose doc-wrap-name text-[13px] font-medium leading-snug text-[color:var(--doc-text)]">
              {doc.nombre}
              {doc.obligatorio ? (
                <span className="ml-1 align-super text-[10px]" style={{ color: "var(--doc-danger)" }} title="Obligatorio">
                  *
                </span>
              ) : null}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {doc.presentacionEditable ? (
              /* La presentación es CONFIGURACIÓN del documento, no un dato
                 operativo: se puede elegir aunque el requisito todavía no esté
                 en uso. Deshabilitarla con el «no aplica» inicial dejaba el
                 control muerto justo cuando hacía falta. */
              <SelectorPresentacion
                valor={modo}
                onChange={(m) => onDoc(doc.codigo, { presentacion: m })}
                nombreDocumento={nombreVisible}
                reducido={reducido}
              />
            ) : (
              <SelloPresentacion fisica={doc.presentacionFisica} digital={doc.presentacionDigital} />
            )}
            {/* El contador aparece y desaparece con la presentación elegida. En
                los documentos de presentación fija no hay nada que revelar, así
                que se pinta directo y no se paga una animación por fila. */}
            {doc.presentacionEditable ? (
              <ContadorHojasRevelado visible={pideHojas} reducido={reducido}>
                <ContadorHojas
                  valor={estado.hojasFisicas}
                  onChange={(v) => onDoc(doc.codigo, { hojasFisicas: v })}
                  deshabilitado={noAplica}
                  nombreDocumento={nombreVisible}
                  condicional={false}
                />
              </ContadorHojasRevelado>
            ) : (
              pideHojas && (
                <ContadorHojas
                  valor={estado.hojasFisicas}
                  onChange={(v) => onDoc(doc.codigo, { hojasFisicas: v })}
                  deshabilitado={noAplica}
                  nombreDocumento={nombreVisible}
                  condicional={doc.presentacionFisica === "CONDICIONAL"}
                />
              )
            )}
          </div>
          {doc.descripcion && <p className="doc-prose mt-1 text-[11px] text-[color:var(--doc-text-faint)]">{doc.descripcion}</p>}
          {doc.permiteNombreLibre && doc.textoObservacion && (
            <p className="doc-prose mt-1 text-[11px] italic text-[color:var(--doc-text-faint)]">{doc.textoObservacion}</p>
          )}
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
          className="doc-tap inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--doc-text-muted)] transition-colors hover:text-[color:var(--doc-text)]"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
          {mostrarObs ? "Observación" : "Añadir observación"}
        </button>
        {doc.permiteProrroga && (
          <button
            type="button"
            onClick={() => onDoc(doc.codigo, { prorrogaActiva: !estado.prorrogaActiva })}
            className="doc-tap inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold transition-colors"
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
              placeholder={`Observaciones (${nombreVisible.slice(0, 48)}${nombreVisible.length > 48 ? "…" : ""})`}
              aria-label={`Observaciones de ${nombreVisible}`}
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
                  <span className="mb-1 block text-[11px] font-semibold" style={{ color: TONO.aviso.texto }}>
                    Fecha límite de la prórroga
                  </span>
                  <CampoFecha
                    valor={estado.prorrogaFecha}
                    onChange={(v) => onDoc(doc.codigo, { prorrogaFecha: v })}
                    min={hoy()}
                    sentido="futuro"
                    etiquetaAccesible={`Fecha límite de la prórroga de ${nombreVisible}`}
                  />
                </div>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold" style={{ color: TONO.aviso.texto }}>
                    Motivo
                  </span>
                  <Entrada
                    value={estado.prorrogaMotivo}
                    onChange={(e) => onDoc(doc.codigo, { prorrogaMotivo: e.target.value })}
                    placeholder="Por qué se concede el plazo"
                  />
                </label>
              </div>
              {diasProrroga !== null && <CuentaRegresiva dias={diasProrroga} fecha={estado.prorrogaFecha} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* La subsección se pinta en el encabezado del bloque, no por fila: aquí
          solo se usa para agrupar. `garantia` viaja para eso. */}
      <span className="hidden" data-subseccion={subseccionDe(doc, garantia)} aria-hidden />
    </li>
  );
}

function ChipEstadoSeleccionable({ estado, activo, onClick }: { estado: EstadoDocumento; activo: boolean; onClick: () => void }) {
  const tono = TONO[INTENCION_DOCUMENTO[estado]];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className="doc-tap relative inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all duration-150 active:scale-95"
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
      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-medium" style={{ color: tono.texto }}>
        <span className="inline-flex items-center gap-1 capitalize">
          <Timer className="h-3 w-3" aria-hidden /> {fechaLegible(fecha)}
        </span>
        <span className="doc-metric">
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
 * Elección del tipo de funcionario.
 *
 * ── Por qué es un radiogrupo y no una lista de botones ──────────────────────
 * Porque es una elección única y excluyente, y eso tiene un patrón: `radiogroup`
 * con `radio`. Se recorre con las flechas, anuncia cuál está marcada y no
 * obliga a tabular por las cinco tarjetas para llegar a la última. La marca de
 * selección es un círculo con visto, no solo un cambio de color.
 */
function PasoCategoria({
  categoria,
  garantia,
  catalogo,
  sinRequisitosPropios,
  onCategoria,
  onGarantia,
  errores,
  reducido,
}: {
  categoria: string;
  garantia: string;
  catalogo: CatalogoCliente | null;
  sinRequisitosPropios: boolean;
  onCategoria: (c: string) => void;
  onGarantia: (g: string) => void;
  errores: Record<string, string>;
  reducido: boolean;
}) {
  const cat = categoria ? categoriaDe(categoria) : null;
  const esComercial = categoria === "COMERCIAL";
  const grupo = useRef<HTMLDivElement | null>(null);

  /** Total de requisitos de una rama, según el mapa del backend. */
  function totalDe(codigo: string, garantiaRama: string): number | null {
    const rama = catalogo?.aplicabilidad.find((a) => a.tipoFuncionario === codigo && a.tipoGarantia === garantiaRama);
    return rama?.habilitada ? rama.total : null;
  }

  function moverFoco(actual: string, direccion: 1 | -1) {
    const activas = CATEGORIAS;
    const i = activas.findIndex((c) => c.codigo === actual);
    const siguiente = activas[(i + direccion + activas.length) % activas.length];
    onCategoria(siguiente.codigo);
    grupo.current?.querySelector<HTMLElement>(`[data-codigo="${siguiente.codigo}"]`)?.focus();
  }

  return (
    <div className="space-y-6">
      <Encabezadillo
        titulo="Tipo de funcionario"
        detalle="Elige la categoría. Cada una exige documentos distintos y el expediente mostrará solo los suyos. Una persona pertenece a una sola categoría."
      />
      {errores.categoria && <Aviso intencion="peligro" titulo="Falta elegir">{errores.categoria}</Aviso>}

      <div ref={grupo} role="radiogroup" aria-label="Tipo de funcionario" className="grid gap-3.5 sm:grid-cols-2">
        {CATEGORIAS.map((c, i) => (
          <TarjetaCategoria
            key={c.codigo}
            categoria={c}
            activa={categoria === c.codigo}
            total={totalDe(c.codigo, c.codigo === "COMERCIAL" ? garantia || "COMERCIAL_1" : "NINGUNA")}
            onSelect={() => onCategoria(c.codigo)}
            onMover={(d) => moverFoco(c.codigo, d)}
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
            /* La curva de las hojas de iOS: el revelado de la garantía es el
               momento más importante del asistente y tiene que sentirse fluido. */
            transition={{ duration: reducido ? 0 : 0.52, ease: CURVA_HOJA }}
            className="overflow-hidden"
          >
            <div className="doc-sunken rounded-[20px] p-4" style={estiloCategoria("COMERCIAL")}>
              <div className="flex items-center gap-2">
                <ShieldQuestion className="h-4 w-4" style={{ color: "var(--cat-color)" }} aria-hidden />
                <span className="text-[13px] font-bold text-[color:var(--doc-text)]">Selecciona el tipo de garantía</span>
              </div>
              {errores.garantia && (
                <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--doc-danger-fg)" }}>
                  {errores.garantia}
                </p>
              )}
              <div role="radiogroup" aria-label="Tipo de garantía comercial" className="mt-3 grid gap-2.5 sm:grid-cols-3">
                {GARANTIAS_COMERCIAL.map((g) => (
                  <TarjetaGarantia
                    key={g.codigo}
                    garantia={g}
                    activa={garantia === g.codigo}
                    total={totalDe("COMERCIAL", g.codigo)}
                    onSelect={() => onGarantia(g.codigo)}
                    color={cat.color}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rama sin requisitos propios: se anuncia el atajo ANTES de pulsar
          «Continuar». Que el asistente pase de cuatro pantallas a tres sin
          decirlo se lee como un paso que se saltó por error. */}
      <AnimatePresence initial={false}>
        {cat && cat.activa && sinRequisitosPropios && (
          <motion.div
            initial={reducido ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reducido ? undefined : { opacity: 0, height: 0 }}
            transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaQuint }}
            className="overflow-hidden"
          >
            <Aviso intencion="exito" titulo="Esta categoría no pide documentación adicional">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" aria-hidden />
                Con los documentos generales el expediente queda completo. Al continuar se va directo a{" "}
                <strong>Revisión y guardado</strong>.
              </span>
            </Aviso>
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
  total,
  onSelect,
  onMover,
  reducido,
  orden,
}: {
  categoria: Categoria;
  activa: boolean;
  total: number | null;
  onSelect: () => void;
  onMover: (direccion: 1 | -1) => void;
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
      /* Solo la tarjeta marcada es tabulable; dentro del grupo se mueve con las
         flechas. Es el patrón de `radiogroup` y evita cinco paradas de tabulador. */
      tabIndex={activa || (orden === 0 && !activa) ? 0 : -1}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          onMover(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          onMover(-1);
        }
      }}
      className={`doc-categoria doc-tap ${reducido ? "" : "doc-fila-entra"}`}
      style={{ ...estiloCategoria(categoria.codigo), ...(reducido ? {} : ({ "--doc-fila": orden * 3 } as React.CSSProperties)) }}
    >
      <span className="flex items-start gap-3.5">
        <span
          className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px]"
          style={{ background: hexAlpha(categoria.color, activa ? 0.3 : 0.16), color: categoria.color }}
        >
          <Icono className="h-8 w-8" />
        </span>
        <span className="min-w-0 pt-0.5">
          <span className="block text-[15px] font-bold leading-tight tracking-tight text-[color:var(--doc-text)]">
            {categoria.etiqueta}
          </span>
          <span className="doc-prose mt-1 block text-xs leading-relaxed text-[color:var(--doc-text-muted)]">
            {categoria.descripcion}
          </span>
        </span>
      </span>

      <span className="flex flex-wrap items-center gap-2">
        {total !== null && (
          <span
            className="doc-metric inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-[color:var(--doc-text)]"
            style={{ background: hexAlpha(categoria.color, 0.16) }}
          >
            {/* El color de la rama va en el ícono; el texto, en tinta del módulo:
                un gris azulado como texto no llega a 4.5:1 en ningún tema. */}
            <Layers className="h-3 w-3" style={{ color: categoria.color }} aria-hidden /> {total} requisitos
          </span>
        )}
        {!categoria.activa && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: "var(--doc-warning-bg)", color: "var(--doc-warning-fg)" }}
          >
            <HardHat className="h-3 w-3" aria-hidden /> En construcción
          </span>
        )}
      </span>

      <span className="doc-categoria-marca" aria-hidden>
        <Check className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

function TarjetaGarantia({
  garantia,
  activa,
  total,
  onSelect,
  color,
}: {
  garantia: (typeof GARANTIAS_COMERCIAL)[number];
  activa: boolean;
  total: number | null;
  onSelect: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      onClick={onSelect}
      className="doc-tap doc-categoria !gap-2 !p-3.5"
      style={{ "--cat-color": color, "--cat-tinte": hexAlpha(color, 0.14), "--cat-borde": hexAlpha(color, 0.5) } as React.CSSProperties}
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[color:var(--doc-text)]">
        <span
          className="grid h-6 w-6 place-items-center rounded-full text-[11px]"
          style={{ background: activa ? color : "var(--doc-surface-sunken)", color: activa ? "#04121f" : "var(--doc-text-faint)" }}
        >
          {garantia.etiqueta.replace("Tipo ", "")}
        </span>
        {garantia.etiqueta}
      </span>
      <span className="block text-[13px] font-bold leading-tight text-[color:var(--doc-text)]">{garantia.titulo}</span>
      <ul className="space-y-0.5">
        {garantia.caracteristicas.map((c) => (
          <li key={c} className="doc-prose text-[11px] leading-snug text-[color:var(--doc-text-muted)]">
            · {c}
          </li>
        ))}
      </ul>
      {total !== null && (
        <span className="doc-metric text-[11px] font-bold text-[color:var(--doc-text-muted)]">
          {total} requisitos en total
        </span>
      )}
      <span className="doc-categoria-marca" aria-hidden>
        <Check className="h-3.5 w-3.5" />
      </span>
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
  const bloques = useMemo(() => porSubseccion(documentos, garantia), [documentos, garantia]);
  const hayCondicional = documentos.some((d) => d.presentacionFisica === "CONDICIONAL");

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
      <div className="flex items-center gap-3.5 rounded-[20px] p-4" style={{ background: "var(--cat-tinte)", boxShadow: "inset 0 0 0 1px var(--cat-borde)" }}>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px]" style={{ background: "var(--cat-tinte-fuerte)", color: "var(--cat-color)" }}>
          <Icono className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-bold tracking-tight text-[color:var(--doc-text)]">
            {categoria.etiqueta}
            {garantiaCard ? ` · ${garantiaCard.etiqueta} (${garantiaCard.titulo})` : ""}
          </p>
          <p className="doc-prose text-[11px] text-[color:var(--doc-text-muted)]">
            {documentos.length} documento{documentos.length === 1 ? "" : "s"} propio{documentos.length === 1 ? "" : "s"} de esta
            categoría
            {bloques.filter((b) => b.titulo).length > 1 ? `, en ${bloques.filter((b) => b.titulo).length} bloques` : ""}.
          </p>
        </div>
      </div>

      {documentos.length === 0 ? (
        <Aviso intencion="info" titulo="Sin documentos adicionales">
          Esta categoría no añade requisitos a los generales.
        </Aviso>
      ) : (
        bloques.map((bloque) => (
          <section key={bloque.titulo || "sin-subseccion"} className="space-y-2.5">
            {bloque.titulo && (
              <header className="flex items-center gap-2 pt-1">
                <span className="h-4 w-1 rounded-full" style={{ background: "var(--cat-color)" }} aria-hidden />
                <h4 className="doc-balance text-[13px] font-bold tracking-tight text-[color:var(--doc-text)]">{bloque.titulo}</h4>
                <span className="doc-metric text-[11px] text-[color:var(--doc-text-faint)]">
                  {bloque.docs.length} documento{bloque.docs.length === 1 ? "" : "s"}
                </span>
              </header>
            )}
            <ul className="space-y-2.5">
              {bloque.docs.map((doc, i) => (
                <FilaDocumento
                  key={doc.codigo}
                  doc={doc}
                  garantia={garantia}
                  estado={docs[doc.codigo] ?? docInicial(estadoInicialDe(doc))}
                  onDoc={onDoc}
                  reducido={reducido}
                  orden={i}
                />
              ))}
            </ul>
          </section>
        ))
      )}
      {hayCondicional && <LeyendaCondicional />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Paso 5 — Revisión                                                   */
/* ------------------------------------------------------------------ */

/**
 * Resumen honesto antes de guardar.
 *
 * Muestra identidad, rama, recuento por situación, documentos físicos con sus
 * hojas, observaciones escritas, prórrogas y lo que queda pendiente. Si algo
 * falta o es inválido se señala CON ENLACE al paso y al campo exacto: un resumen
 * que dice «hay un error» y no dónde obliga a recorrer el formulario entero.
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
  sinRequisitosPropios,
}: {
  form: Identidad;
  categoria: Categoria;
  garantia: string;
  generales: CatalogoDocumento[];
  especificos: CatalogoDocumento[];
  docs: Record<string, EstadoDoc>;
  errores: Record<string, string>;
  onIr: (id: PasoId) => void;
  sinRequisitosPropios: boolean;
}) {
  const Icono = categoria.Icono;
  const garantiaCard = GARANTIAS_COMERCIAL.find((g) => g.codigo === garantia);
  const todos = [...generales, ...especificos];
  const total = todos.length;
  const estadoDe = (d: CatalogoDocumento) => docs[d.codigo]?.estado ?? estadoInicialDe(d);
  const cuenta = (estado: EstadoDocumento) => todos.filter((d) => estadoDe(d) === estado).length;
  const nombreDe = (d: CatalogoDocumento) => (docs[d.codigo]?.nombrePersonalizado ?? "").trim() || d.nombre;

  /* «Físico» aquí es la presentación EFECTIVA, no la del catálogo: un «Otros»
     marcado como digital no debe aparecer en la lista de documentos físicos ni
     contar en el total de hojas del legajo. */
  const fisicos = todos.filter((d) => llevaHojas(d, docs[d.codigo] ?? docInicial(estadoInicialDe(d))));
  const hojas = fisicos.reduce((suma, d) => suma + (docs[d.codigo]?.hojasFisicas ?? 0), 0);
  const sinContar = fisicos.filter((d) => (docs[d.codigo]?.hojasFisicas ?? 0) <= 0);
  const conObservacion = todos.filter((d) => (docs[d.codigo]?.observaciones ?? "").trim() !== "");
  const conProrroga = todos.filter((d) => docs[d.codigo]?.prorrogaActiva && docs[d.codigo]?.prorrogaFecha);
  const prorrogasSinFecha = todos.filter((d) => docs[d.codigo]?.prorrogaActiva && !docs[d.codigo]?.prorrogaFecha);

  /** Avisos con enlace al paso y al campo exacto. */
  const problemas: { texto: string; paso: PasoId }[] = [];
  if (!form.identificador.trim()) problemas.push({ texto: "Falta el carnet de identidad.", paso: "identidad" });
  if (!form.nombre.trim()) problemas.push({ texto: "Falta el nombre completo.", paso: "identidad" });
  if (errores.identificador) problemas.push({ texto: errores.identificador, paso: "identidad" });
  if (!form.fechaIngreso)
    problemas.push({ texto: "Sin fecha de ingreso: el expediente no tendrá antigüedad ni pestaña anual.", paso: "identidad" });
  for (const doc of prorrogasSinFecha) {
    /* El paso de destino depende del documento: los generales están en el paso
       dos y los propios de la rama en el cuatro —que puede no existir—. Mandar
       a todos a «especificos» llevaba al sitio equivocado en la mitad de los
       casos, y con el área administrativa a un paso que no está en el camino. */
    const destino: PasoId = generales.some((g) => g.codigo === doc.codigo) ? "generales" : "especificos";
    problemas.push({ texto: `La prórroga de «${nombreDe(doc).slice(0, 40)}…» no tiene fecha límite.`, paso: destino });
  }
  /* Un «Otros» en uso sin nombre es el único dato que el backend aceptaría y el
     legajo no podría interpretar: una fila con hojas contadas y sin título. */
  for (const doc of todos) {
    if (!doc.permiteNombreLibre) continue;
    const ed = docs[doc.codigo];
    if (!ed) continue;
    const enUso = ed.estado !== "NO_APLICA" || ed.hojasFisicas > 0 || ed.observaciones.trim() !== "";
    if (enUso && !ed.nombrePersonalizado.trim()) {
      problemas.push({ texto: "El documento «Otros» está en uso pero no tiene nombre.", paso: "generales" });
    }
  }

  return (
    <div className="space-y-4" style={estiloCategoria(categoria.codigo)}>
      <Encabezadillo
        titulo="Revisión"
        detalle="Confirma que todo está en orden. Al guardar, el expediente se crea y se abre para seguir trabajando."
      />

      {problemas.length > 0 && (
        <Aviso intencion="aviso" titulo={`${problemas.length} cosa${problemas.length === 1 ? "" : "s"} por revisar`}>
          <ul className="space-y-1">
            {problemas.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span>{p.texto}</span>
                <button
                  type="button"
                  onClick={() => onIr(p.paso)}
                  className="doc-tap font-bold underline decoration-dotted underline-offset-2"
                >
                  Ir al paso
                </button>
              </li>
            ))}
          </ul>
        </Aviso>
      )}

      <div className="doc-raised rounded-[20px] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 place-items-center rounded-[16px]" style={{ background: "var(--cat-tinte-fuerte)", color: "var(--cat-color)" }}>
              <Icono className="h-7 w-7" />
            </span>
            <div>
              <p className="text-[15px] font-bold tracking-tight text-[color:var(--doc-text)]">{form.nombre || "Sin nombre"}</p>
              <p className="doc-metric text-xs text-[color:var(--doc-text-muted)]">{form.identificador || "Sin carnet"}</p>
            </div>
          </div>
          <button type="button" onClick={() => onIr("identidad")} className="doc-tap text-[11px] font-bold" style={{ color: "var(--doc-info-fg)" }}>
            Editar identidad
          </button>
        </div>
        <dl className="mt-3.5 grid gap-x-4 gap-y-2.5 text-xs sm:grid-cols-3">
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
        <TarjetaCuenta etiqueta="Por conseguir" valor={cuenta("PENDIENTE") + cuenta("NO_ENTREGADO")} intencion="aviso" />
        <TarjetaCuenta etiqueta="No aplican" valor={cuenta("NO_APLICA")} intencion="neutral" />
      </div>

      {/* Documentos físicos y sus hojas: es lo que el área necesita para armar
          el legajo, y lo que hasta ahora no existía en ningún sitio. */}
      {fisicos.length > 0 && (
        <div className="doc-sunken rounded-[16px] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[13px] font-bold tracking-tight text-[color:var(--doc-text)]">Documentos físicos</h4>
            <span className="doc-metric text-xs font-bold" style={{ color: "var(--doc-accent-fg)" }}>
              {hojas} hoja{hojas === 1 ? "" : "s"} en total
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {fisicos.map((doc) => {
              const n = docs[doc.codigo]?.hojasFisicas ?? 0;
              return (
                <li key={doc.codigo} className="flex items-baseline justify-between gap-3 text-[11px]">
                  <span className="doc-prose min-w-0 flex-1 text-[color:var(--doc-text-muted)]">{nombreDe(doc).slice(0, 72)}</span>
                  <span className="doc-metric shrink-0 font-bold" style={{ color: n > 0 ? "var(--doc-text)" : "var(--doc-text-faint)" }}>
                    {n > 0 ? `${n} hoja${n === 1 ? "" : "s"}` : "sin contar"}
                  </span>
                </li>
              );
            })}
          </ul>
          {sinContar.length > 0 && (
            <p className="doc-prose mt-2 text-[11px] italic text-[color:var(--doc-text-faint)]">
              {sinContar.length} documento{sinContar.length === 1 ? "" : "s"} físico{sinContar.length === 1 ? "" : "s"} sin
              contar. No impide guardar: se puede anotar después en el expediente.
            </p>
          )}
        </div>
      )}

      {conObservacion.length > 0 && (
        <div className="doc-sunken rounded-[16px] p-3.5">
          <h4 className="text-[13px] font-bold tracking-tight text-[color:var(--doc-text)]">
            Observaciones escritas ({conObservacion.length})
          </h4>
          <ul className="mt-2 space-y-1.5">
            {conObservacion.map((doc) => (
              <li key={doc.codigo} className="text-[11px]">
                <span className="font-semibold text-[color:var(--doc-text-muted)]">{nombreDe(doc).slice(0, 56)}: </span>
                <span className="doc-prose italic text-[color:var(--doc-text-muted)]">{docs[doc.codigo]?.observaciones}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {conProrroga.length > 0 && (
        <div className="doc-sunken rounded-[16px] p-3.5">
          <h4 className="text-[13px] font-bold tracking-tight text-[color:var(--doc-text)]">Prórrogas ({conProrroga.length})</h4>
          <ul className="mt-2 space-y-1">
            {conProrroga.map((doc) => (
              <li key={doc.codigo} className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
                <span className="doc-prose text-[color:var(--doc-text-muted)]">{nombreDe(doc).slice(0, 56)}</span>
                <span className="doc-metric font-bold" style={{ color: TONO.aviso.texto }}>
                  hasta {fechaLegible(docs[doc.codigo]?.prorrogaFecha ?? "")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onIr("generales")}
          className="doc-tap rounded-full px-3 py-1.5 text-[11px] font-bold"
          style={{ background: "var(--doc-surface-raised)", boxShadow: "inset 0 0 0 1px var(--doc-border)", color: "var(--doc-text-muted)" }}
        >
          Revisar documentos generales
        </button>
        {!sinRequisitosPropios && (
          <button
            type="button"
            onClick={() => onIr("especificos")}
            className="doc-tap rounded-full px-3 py-1.5 text-[11px] font-bold"
            style={{ background: "var(--doc-surface-raised)", boxShadow: "inset 0 0 0 1px var(--doc-border)", color: "var(--doc-text-muted)" }}
          >
            Revisar requisitos de la categoría
          </button>
        )}
      </div>
    </div>
  );
}

function DatoRev({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--doc-text-faint)]">{etiqueta}</dt>
      <dd className="truncate font-medium text-[color:var(--doc-text)]" title={valor}>
        {valor}
      </dd>
    </div>
  );
}

function TarjetaCuenta({ etiqueta, valor, intencion }: { etiqueta: string; valor: number; intencion: keyof typeof TONO }) {
  const tono = TONO[intencion];
  return (
    <div className="rounded-[16px] p-3 text-center" style={{ background: tono.fondo, boxShadow: `inset 0 0 0 1px ${tono.borde}` }}>
      <div className="doc-metric text-2xl font-bold leading-none" style={{ color: tono.texto }}>
        {valor}
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: tono.texto }}>
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
      <TextoRevelado
        como="h3"
        texto={titulo}
        className="doc-balance block text-lg font-bold tracking-tight text-[color:var(--doc-text)]"
      />
      <TextoRevelado
        como="p"
        texto={detalle}
        retardo={0.04}
        className="doc-prose mt-1 block max-w-prose text-xs leading-relaxed text-[color:var(--doc-text-muted)]"
      />
    </div>
  );
}

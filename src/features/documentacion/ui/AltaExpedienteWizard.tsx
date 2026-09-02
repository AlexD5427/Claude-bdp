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

import { useEffect, useMemo, useRef, useState } from "react";
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
  ETIQUETA_PRESENTACION,
  LEYENDA_PRESENTACION_CONDICIONAL,
  type EstadoDocumento,
} from "../domain/vocabulario";
import { hoy } from "../domain/progreso";
import { ContadorHojas } from "./ContadorHojas";
import {
  subseccionPara,
  type CatalogoCliente,
  type CatalogoDocumento,
  type ExpedienteOperativo,
} from "../api/acciones";

/* ------------------------------------------------------------------ */
/* Tipos y utilidades                                                  */
/* ------------------------------------------------------------------ */

interface EstadoDoc {
  estado: EstadoDocumento;
  observaciones: string;
  /** Hojas del documento en papel. `null` = sin contar (distinto de cero). */
  hojasFisicas: number | null;
  prorrogaActiva: boolean;
  prorrogaFecha: string;
  prorrogaMotivo: string;
}

function docInicial(): EstadoDoc {
  return {
    estado: "PENDIENTE",
    observaciones: "",
    hojasFisicas: null,
    prorrogaActiva: false,
    prorrogaFecha: "",
    prorrogaMotivo: "",
  };
}

type PasoId = "identidad" | "generales" | "categoria" | "especificos" | "revision";

/**
 * Expediente que ya existe con el mismo carnet.
 *
 * El backend lo manda dentro del error de conflicto para que esta pantalla pueda
 * ofrecer «abrirlo» en vez de dejar a la persona con un mensaje y un formulario
 * lleno que no lleva a ninguna parte.
 */
export interface ExpedienteDuplicado {
  expedienteId: string;
  identificador: string;
  nombre: string;
  cargo: string;
  agencia: string;
  estado: string;
  fechaIngreso: string;
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
  onAbrirExistente,
}: {
  abierta: boolean;
  onCerrar: () => void;
  /**
   * `detalle` llega relleno cuando el backend resolvió el alta en una sola
   * llamada: permite abrir el expediente SIN volver a esperar a la red.
   */
  onCreado: (expedienteId: string, requisitos: number, detalle: ExpedienteOperativo | null) => void;
  onError: (mensaje: string, pista?: string) => void;
  /** Avisos no bloqueantes (por ejemplo, un valor añadido al catálogo auxiliar). */
  onAviso?: (intencion: "info" | "exito" | "aviso" | "peligro", texto: string, pista?: string) => void;
  /** Abre un expediente que ya existía, cuando el carnet está repetido. */
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
  onCreado: (expedienteId: string, requisitos: number, detalle: ExpedienteOperativo | null) => void;
  onError: (mensaje: string, pista?: string) => void;
  onAviso?: (intencion: "info" | "exito" | "aviso" | "peligro", texto: string, pista?: string) => void;
  onAbrirExistente?: (expedienteId: string) => void;
}) {
  const { catalogo, estado } = useConsola();
  /* Se pregunta al backend qué sabe hacer. `undefined` (backend anterior a esta
     versión) cuenta como «no», que es la lectura segura. */
  const soportaAltaCompleta = estado?.soporta?.altaCompleta === true;
  const reducido = useMovimientoReducido();

  const [paso, setPaso] = useState<PasoId>("identidad");
  const [form, setForm] = useState(IDENTIDAD_VACIA);
  const [categoria, setCategoria] = useState<string>("");
  const [garantia, setGarantia] = useState<string>("");
  const [docs, setDocs] = useState<Record<string, EstadoDoc>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [pidiendoCierre, setPidiendoCierre] = useState(false);
  const [duplicado, setDuplicado] = useState<ExpedienteDuplicado | null>(null);
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
   * Escape cierra el asistente.
   *
   * ── Por qué faltaba y por qué importa ─────────────────────────────────────
   * El asistente solo se podía cerrar con la X o pulsando fuera. Es un diálogo
   * modal (`aria-modal="true"`) y la convención —y lo que espera cualquiera que
   * trabaja con teclado— es que Escape lo cierre. Lo detectó
   * `qa/sonda-contraste.mjs`, que se quedaba atascada intentándolo.
   *
   * ── El detalle de los dos `useRef` ────────────────────────────────────────
   * El manejador vive en una referencia y el efecto NO depende de él. Si
   * dependiera, se volvería a montar en cada pulsación de tecla del formulario
   * —el manejador se recrea al cambiar `docs` o `form`— y añadir y quitar un
   * escuchador global cuarenta veces por frase es exactamente el patrón que en
   * este módulo ya causó que en las observaciones «entrara una sola letra».
   *
   * Los componentes de dentro (el selector auxiliar, el calendario) detienen la
   * propagación de su propio Escape, así que cerrar un desplegable no cierra el
   * asistente entero con el formulario a medio llenar.
   */
  const alEscape = useRef<() => void>(() => {});
  alEscape.current = intentarCerrar;
  useEffect(() => {
    const escuchar = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      alEscape.current();
    };
    document.addEventListener("keydown", escuchar);
    return () => document.removeEventListener("keydown", escuchar);
  }, []);

  const cat: Categoria | null = categoria ? categoriaDe(categoria) : null;
  const esComercial = categoria === "COMERCIAL";
  const enConstruccion = Boolean(cat && !cat.activa);

  const documentos = catalogo?.documentos ?? [];
  /**
   * Los generales VIGENTES.
   *
   * ── El fallo que corrige el `d.activo` ────────────────────────────────────
   * El catálogo devuelve las 39 filas, inactivas incluidas: la administración del
   * catálogo necesita verlas todas. Filtrar solo por sección dejaba dieciocho
   * generales en el asistente, con «Certificados de trabajo» y el RC-IVA entre
   * ellos: exactamente los dos que el área retiró. Alguien los habría seguido
   * pidiendo, que es lo contrario de lo que la retirada buscaba.
   *
   * Se filtra además por vigencia, porque un requisito puede estar activo y con
   * fecha de fin pasada, y el motor del backend ya lo descarta: si aquí no se
   * hiciera lo mismo, el formulario pediría algo que el expediente no va a tener.
   */
  const generales = useMemo(() => {
    const hoyISO = hoy();
    return documentos.filter(
      (d) =>
        d.seccion === "generales" &&
        d.activo &&
        (!d.vigenciaHasta || d.vigenciaHasta >= hoyISO) &&
        (!d.vigenciaDesde || d.vigenciaDesde <= hoyISO),
    );
  }, [documentos]);

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
  /**
   * Validación de la identidad.
   *
   * ── Por qué el carnet no tiene formato ────────────────────────────────────
   * Antes se exigía «CI - número de proceso - año». Los carnets reales no caben
   * en ese molde: hay complementos alfanuméricos («1234567-1A»), extensiones de
   * departamento, puntos de millar y espacios. El único efecto de la validación
   * era que quien registraba escribía cualquier cosa que pasara el patrón para
   * poder continuar, y el dato quedaba peor que sin validar.
   *
   * Sigue siendo obligatorio, porque de él dependen la detección de duplicados y
   * la búsqueda; lo que no se impone es su forma.
   */
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
   * Guarda el expediente.
   *
   * ── Una llamada en vez de cuatro (con recaída automática) ─────────────────
   * El alta hacía `crear` → `obtener` → `requisitos.guardar` → N × `prorroga.crear`.
   * Cada una es un `POST` a Apps Script con su arranque de contenedor y su
   * `LockService`: con veinticinco requisitos eran seis viajes y el botón se
   * quedaba «guardando» ocho o diez segundos, tiempo suficiente para que alguien
   * lo volviera a pulsar.
   *
   * Ahora todo va en la MISMA llamada, y el backend lo aplica dentro de la misma
   * ejecución (con reversión si algo falla a medias). Pero el frontend de Vercel
   * se despliega al fusionar y el backend solo cuando una persona publica una
   * versión nueva de la implementación: hay una ventana en la que esta pantalla
   * habla con un backend anterior. Por eso se PREGUNTA (`estado.soporta.altaCompleta`)
   * en vez de suponer, y si la respuesta es no, se recorre la ruta antigua.
   *
   * La ruta antigua se conserva completa a propósito. No es código muerto: es la
   * que se ejecuta el día del despliegue, antes de que alguien publique el `.gs`.
   */
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
    setDuplicado(null);
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
        tipoGarantia: esComercial ? garantia : "NINGUNA",
        idempotencyKey: clave,
      };

      /* Solo viaja lo que la persona TOCÓ. Mandar los veinticinco requisitos en
         PENDIENTE sería mandar el estado por defecto que el backend ya escribe. */
      const requisitos = Object.entries(docs)
        .map(([codigo, ed]) => {
          const cambios: Record<string, unknown> = { codigo };
          let algo = false;
          if (ed.estado !== "PENDIENTE") {
            cambios.estado = ed.estado;
            algo = true;
          }
          if (ed.observaciones.trim() !== "") {
            cambios.observaciones = ed.observaciones.trim();
            algo = true;
          }
          if (ed.hojasFisicas !== null && ed.hojasFisicas !== undefined) {
            cambios.hojasFisicas = ed.hojasFisicas;
            algo = true;
          }
          return algo ? cambios : null;
        })
        .filter((c): c is Record<string, unknown> => c !== null);

      const prorrogas = Object.entries(docs)
        .filter(([, ed]) => ed.prorrogaActiva && ed.prorrogaFecha)
        .map(([codigo, ed]) => ({
          codigo,
          fechaProrroga: ed.prorrogaFecha,
          motivo: ed.prorrogaMotivo.trim() || "Prórroga registrada al abrir el expediente.",
        }));

      if (soportaAltaCompleta) {
        const creado = await docApi.crearExpediente({ ...identidad, requisitos, prorrogas });
        avisarFallidosParciales(creado.aplicado?.fallidos);
        clearDraft();
        onCreado(creado.expedienteId, creado.requisitos ?? codigosAplicables.length, creado.detalle ?? null);
        return;
      }

      await guardarPorRutaAntigua(identidad, requisitos, prorrogas);
    } catch (error) {
      const fallo = error as {
        message?: string;
        pista?: string;
        campos?: Record<string, string>;
        detalle?: { duplicado?: ExpedienteDuplicado };
      };
      /* Un duplicado NO es un error cualquiera: hay un expediente que la persona
         probablemente quiere abrir, y un formulario lleno que no se puede perder.
         Se ofrece el atajo y el formulario se queda intacto. */
      if (fallo.detalle?.duplicado) {
        setDuplicado(fallo.detalle.duplicado);
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
    }
  }

  /** Avisa de las prórrogas o los requisitos que el backend no pudo aplicar. */
  function avisarFallidosParciales(fallidos: unknown[] | undefined) {
    if (!fallidos || !fallidos.length) return;
    const primero = fallidos[0] as { motivo?: string };
    onAviso?.(
      "aviso",
      `El expediente se creó, pero ${fallidos.length} dato${fallidos.length === 1 ? "" : "s"} no se pudo guardar: ${primero.motivo ?? ""}`,
      "Revísalo en el expediente y vuelve a marcarlo.",
    );
  }

  /**
   * Alta por la ruta de cuatro pasos.
   *
   * Es la que existía y sigue funcionando contra un backend anterior a esta
   * versión. Traduce los códigos de catálogo a `expedienteDocumentoId` leyendo el
   * expediente recién creado, que es lo que obligaba al segundo viaje.
   */
  async function guardarPorRutaAntigua(
    identidad: Record<string, unknown>,
    requisitos: Record<string, unknown>[],
    prorrogas: { codigo: string; fechaProrroga: string; motivo: string }[],
  ) {
    const creado = await docApi.crearExpediente(identidad);
    const detalle = await docApi.obtenerExpediente(creado.expedienteId);
    const porCodigo = new Map(detalle.requisitos.map((r) => [r.codigo, r]));

    const cambios: Record<string, unknown>[] = [];
    for (const cambio of requisitos) {
      const req = porCodigo.get(String(cambio.codigo));
      if (!req) continue; // no aplica a esta rama: se ignora en silencio
      const { codigo: _codigo, ...resto } = cambio;
      cambios.push({ expedienteDocumentoId: req.expedienteDocumentoId, version: req.version, ...resto });
    }
    if (cambios.length) await docApi.guardarRequisitos(creado.expedienteId, cambios);

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

    clearDraft();
    onCreado(creado.expedienteId, creado.requisitos ?? codigosAplicables.length, null);
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

  /* Aviso de carnet repetido: lleva el atajo para abrir el expediente que ya
     existe. El formulario NO se limpia —lo que se escribió sigue ahí— porque un
     duplicado suele ser «esta persona ya estaba registrada», no «has escrito
     algo mal», y perder veinte decisiones por eso es inaceptable. */
  const cintaDuplicado = duplicado ? (
    <div className="mx-auto mb-4 w-full max-w-3xl">
      <Aviso intencion="aviso" titulo="Ya existe un expediente con ese carnet">
        <span className="block">
          <strong className="font-bold">{duplicado.nombre || duplicado.identificador}</strong>
          {duplicado.cargo ? ` · ${duplicado.cargo}` : ""}
          {duplicado.agencia ? ` · ${duplicado.agencia}` : ""}
          {duplicado.fechaIngreso ? ` · ingreso ${fechaLegible(duplicado.fechaIngreso)}` : ""}.
        </span>
        <span className="mt-1 block italic">
          Nada de lo que has escrito se ha perdido: sigue en el formulario por si el carnet estaba mal.
        </span>
        <span className="mt-2 flex flex-wrap gap-2">
          {onAbrirExistente && (
            <Boton variante="primario" onClick={() => onAbrirExistente(duplicado.expedienteId)}>
              Abrir el expediente existente
            </Boton>
          )}
          <Boton variante="suave" onClick={() => setDuplicado(null)}>
            Corregir el carnet
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
      {/*
        Superficie CENTRAL, no pantalla completa.
        ─────────────────────────────────────────
        El asistente ocupaba `inset-0` (todo) y en escritorio eso hace tres cosas
        malas: pierde el contexto de la lista que había detrás, estira las líneas
        de texto a mil quinientos píxeles —ilegibles— y hace creer que se ha
        cambiado de pantalla en lugar de abrir un formulario. Ahora es una hoja
        centrada con aire alrededor, ancho máximo generoso y altura acotada, que
        se desplaza dentro de sí misma.

        En móvil sí ocupa todo: ahí el aire alrededor es espacio robado.
      */}
      <div className="pointer-events-none fixed inset-0 z-[101] flex items-stretch justify-center p-0 sm:items-center sm:p-6 md:p-10">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Nuevo expediente documental"
          className="doc-console glass-heavy pointer-events-auto flex w-full max-w-[68rem] flex-col overflow-hidden sm:rounded-[28px] sm:border sm:border-[color:var(--doc-border)] sm:shadow-[0_40px_120px_-40px_rgba(2,12,28,0.7)]"
          initial={reducido ? undefined : { opacity: 0, y: 24, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducido ? undefined : { opacity: 0, y: 16, scale: 0.99, transition: { duration: DURACION.rapida, ease: CURVA.salidaQuint } }}
          transition={resorte(reducido)}
          style={{ height: "100%", maxHeight: "min(56rem, 100%)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <Encabezado pasos={pasos} indice={indice} onIr={irA} onCerrar={intentarCerrar} />

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7">
          {cintaBorrador}
          {cintaDuplicado}
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
                    color: activo || hecho ? "var(--doc-sobre-info)" : "var(--doc-text-faint)",
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
  // `cargo_bdp` puede no venir si el backend desplegado es anterior a esta
  // versión: se degrada a lista vacía y el campo sigue admitiendo escritura libre.
  const cargos = catalogo?.auxiliares.cargo_bdp ?? [];

  return (
    <div className="space-y-5">
      <Encabezadillo
        titulo="¿Quién ingresa?"
        detalle="El carnet de identidad y el nombre son obligatorios; el resto ayuda a clasificar y a reportar."
      />

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
            placeholder="Por ejemplo 1234567 o 1234567-1A"
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
            placeholder={cargos.length ? "Busca el cargo" : "Escribe el cargo y añádelo"}
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

/**
 * Parte una lista de documentos del catálogo en sus subsecciones.
 *
 * Usa `subseccionPara`, la misma función que resuelve la subsección en el visor y
 * en los reportes. Los que no declaran subsección —los dieciséis generales— caen
 * en un bloque de título vacío que se pinta sin cabecera.
 *
 * El orden es el de aparición en el catálogo, que es el de la lista de papel del
 * área: reordenar aquí obligaría a leer buscando.
 */
function porSubseccion(
  documentos: CatalogoDocumento[],
  tipoGarantia: string,
): { titulo: string; bloques: { subgrupo: string; documentos: CatalogoDocumento[] }[] }[] {
  const orden: string[] = [];
  const mapa = new Map<string, CatalogoDocumento[]>();
  for (const doc of documentos) {
    const titulo = subseccionPara(doc, tipoGarantia);
    if (!mapa.has(titulo)) {
      mapa.set(titulo, []);
      orden.push(titulo);
    }
    mapa.get(titulo)!.push(doc);
  }
  return orden.map((titulo) => {
    const lista = mapa.get(titulo)!;
    const ordenBloques: string[] = [];
    const bloques = new Map<string, CatalogoDocumento[]>();
    for (const doc of lista) {
      const subgrupo = doc.subgrupo || "";
      if (!bloques.has(subgrupo)) {
        bloques.set(subgrupo, []);
        ordenBloques.push(subgrupo);
      }
      bloques.get(subgrupo)!.push(doc);
    }
    return { titulo, bloques: ordenBloques.map((subgrupo) => ({ subgrupo, documentos: bloques.get(subgrupo)! })) };
  });
}

function PasoDocumentos({
  titulo,
  descripcion,
  documentos,
  docs,
  onDoc,
  reducido,
  tipoGarantia = "NINGUNA",
}: {
  titulo: string;
  descripcion: string;
  documentos: CatalogoDocumento[];
  docs: Record<string, EstadoDoc>;
  onDoc: (codigo: string, patch: Partial<EstadoDoc>) => void;
  reducido: boolean;
  tipoGarantia?: string;
}) {
  const grupos = useMemo(() => porSubseccion(documentos, tipoGarantia), [documentos, tipoGarantia]);
  // La leyenda del asterisco solo aparece si hay algún «Sí*» a la vista: una
  // nota al pie que explica algo que no está en pantalla es ruido.
  const hayCondicional = documentos.some((d) => d.presentacionFisica === "CONDICIONAL");
  let contador = 0;

  return (
    <div className="space-y-4">
      {/* Sin título cuando la lista se reutiliza dentro de otro paso que ya tiene
          su propia cabecera (los requisitos de la categoría). */}
      {titulo && <Encabezadillo titulo={titulo} detalle={descripcion} />}
      {grupos.map((grupo) => (
        <section key={grupo.titulo || "__sueltos"} className="space-y-2.5">
          {grupo.titulo && <TituloSubseccion titulo={grupo.titulo} total={grupo.bloques.reduce((n, b) => n + b.documentos.length, 0)} />}
          {grupo.bloques.map((bloque) => (
            <div key={bloque.subgrupo || "__unico"} className={bloque.subgrupo ? "doc-sunken rounded-[var(--doc-radius,14px)] p-3" : ""}>
              {bloque.subgrupo && (
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--doc-text-muted)" }}>
                  {bloque.subgrupo}
                </p>
              )}
              <ul className="space-y-2.5">
                {bloque.documentos.map((doc) => (
                  <FilaDocumento
                    key={doc.codigo}
                    doc={doc}
                    estado={docs[doc.codigo] ?? docInicial()}
                    onDoc={onDoc}
                    reducido={reducido}
                    orden={contador++}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
      {hayCondicional && (
        <p className="doc-prose border-t border-[color:var(--doc-border)] pt-3 text-[11px] italic" style={{ color: "var(--doc-text-muted)" }}>
          {LEYENDA_PRESENTACION_CONDICIONAL}
        </p>
      )}
    </div>
  );
}

/** Cabecera de una subsección de garantía o de cumplimiento. */
function TituloSubseccion({ titulo, total }: { titulo: string; total: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:var(--doc-border)] pb-1.5">
      <h4 className="doc-balance text-sm font-bold text-[color:var(--doc-text)]">{titulo}</h4>
      <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--doc-text-muted)" }}>
        {total} documento{total === 1 ? "" : "s"}
      </span>
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
    /*
     * `<li>` normal con animación CSS, no `motion.li`.
     *
     * Un expediente Tipo 2 tiene veinticinco requisitos: veinticinco resortes de
     * framer-motion corriendo a la vez para una entrada escalonada que el
     * compositor resuelve solo. `content-visibility` remata la jugada saltándose
     * el diseño de las filas que están fuera de la ventana.
     */
    <li
      className={`doc-raised doc-fila-diferida rounded-[var(--doc-radius,14px)] p-3.5${reducido ? "" : " doc-fila-entra"}`}
      style={reducido ? undefined : { ["--doc-fila-retardo" as string]: `${Math.min(orden * 20, 200)}ms` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* El nombre completo, sin recortar: los textos del área tienen
              doscientas cincuenta letras y son la definición del requisito.
              Truncarlos con puntos suspensivos obliga a adivinar qué se pide. */}
          <p className="doc-prose text-sm font-semibold leading-snug text-[color:var(--doc-text)]">
            {doc.nombre}
            {doc.obligatorio ? (
              <span className="ml-1 align-super text-[10px] font-bold" style={{ color: "var(--doc-danger)" }} aria-hidden>
                *
              </span>
            ) : null}
          </p>
          {doc.descripcion && (
            <p className="doc-prose mt-0.5 text-[11px] italic text-[color:var(--doc-text-muted)]">{doc.descripcion}</p>
          )}
          <EtiquetasPresentacion doc={doc} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* El contador aparece porque el CATÁLOGO dice que este documento se
              entrega en papel. La interfaz no tiene ninguna lista de códigos
              físicos: declarar un requisito físico nuevo le da su contador. */}
          {doc.requiereConteoHojas && (
            <ContadorHojas
              valor={estado.hojasFisicas}
              onChange={(hojas) => onDoc(doc.codigo, { hojasFisicas: hojas })}
              nombreDocumento={doc.nombre}
              deshabilitado={estado.estado === "NO_APLICA"}
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
    </li>
  );
}

/**
 * Cómo se entrega el documento: física y digital.
 *
 * Sale del catálogo, no de una tabla escrita en el código. El «Sí*» de la tabla
 * del área es el estado `CONDICIONAL`, y su explicación va una sola vez al pie de
 * la sección: repetirla en las nueve filas la convierte en ruido.
 *
 * El color no comunica solo: cada etiqueta lleva su palabra («Papel», «Digital»)
 * y su valor («Sí», «Sí*», «N/A»).
 */
function EtiquetasPresentacion({ doc }: { doc: CatalogoDocumento }) {
  const fisica = doc.presentacionFisica;
  const digital = doc.presentacionDigital;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
      <span
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
        style={
          fisica === "NO"
            ? { background: "var(--doc-surface-sunken)", color: "var(--doc-text-muted)" }
            : { background: "var(--doc-accent-bg)", color: "var(--doc-accent-fg)" }
        }
      >
        Papel: {ETIQUETA_PRESENTACION[fisica]}
      </span>
      <span
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
        style={
          digital === "NO"
            ? { background: "var(--doc-surface-sunken)", color: "var(--doc-text-muted)" }
            : { background: "var(--doc-info-bg)", color: "var(--doc-info-fg)" }
        }
      >
        Digital: {ETIQUETA_PRESENTACION[digital]}
      </span>
    </p>
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
        <motion.span layoutId="cat-check" className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full" style={{ background: categoria.color, color: "var(--doc-sobre-info)" }}>
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
      className="doc-tap doc-elevar flex flex-col rounded-[var(--doc-radius,14px)] p-3 text-left"
      style={{
        background: activa ? hexAlpha(color, 0.16) : "var(--doc-surface)",
        boxShadow: activa ? `inset 0 0 0 1.5px ${color}` : "inset 0 0 0 1px var(--doc-border)",
      }}
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold" style={{ color: activa ? color : "var(--doc-text-muted)" }}>
        <span className="grid h-5 w-5 place-items-center rounded-full text-[10px]" style={{ background: activa ? color : "var(--doc-surface-sunken)", color: activa ? "var(--doc-sobre-info)" : "var(--doc-text-faint)" }}>
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
        <PasoDocumentos
          titulo=""
          descripcion=""
          documentos={documentos}
          docs={docs}
          onDoc={onDoc}
          reducido={reducido}
          tipoGarantia={garantia || "NINGUNA"}
        />
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

function Encabezadillo({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div>
      <TextoRevelado
        como="h3"
        texto={titulo}
        className="doc-balance block text-base font-semibold text-[color:var(--doc-text)]"
      />
      <TextoRevelado
        como="p"
        texto={detalle}
        retardo={0.04}
        className="doc-prose mt-0.5 block max-w-prose text-xs leading-relaxed text-[color:var(--doc-text-muted)]"
      />
    </div>
  );
}

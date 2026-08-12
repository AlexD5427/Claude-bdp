/**
 * Estado del asistente de expedientes: valores, validacion por seccion, avance
 * y persistencia del borrador.
 *
 * Es logica pura (sin React y sin `google.script.run`) para poder probarla sola
 * y para que el backend pueda reutilizar las mismas reglas. La autoridad final
 * sigue siendo el backend; esto evita viajes inutiles y da respuesta inmediata.
 */

import {
  CATALOGO_DOCUMENTAL,
  estadoGeneralDe,
  puedeRegistrarse,
  requisitoPorCodigo,
  requisitosEspeciales,
  requisitosGenerales,
  resumenAvance,
  type DocEstado,
  type DocEstadoGeneral,
  type EntradaAvance,
  type RequisitoDef,
  type ResumenAvance,
  type TipoFuncionario,
  type TipoGarantia,
} from "./docCatalog";
import { analizarIdentificador } from "./docIdentificador";

/* ------------------------------------------------------------------ */
/* Forma del borrador                                                 */
/* ------------------------------------------------------------------ */

export interface ValorRequisito {
  estado: DocEstado;
  observacion: string;
  /** Fecha ISO `yyyy-MM-dd`; `null` cuando no hay prorroga. */
  prorroga: string | null;
  prorrogaMotivo: string;
}

export interface BorradorExpediente {
  identificador: string;
  nombre: string;
  cargo: string;
  agencia: string;
  gerencia: string;
  /** ISO `yyyy-MM-dd`. Canonico, sin hora, para no arrastrar husos horarios. */
  fechaIngreso: string;
  tipoFuncionario: TipoFuncionario | null;
  tipoGarantia: TipoGarantia | null;
  valores: Record<string, ValorRequisito>;
  actualizadoEn: string;
}

export const VALOR_INICIAL: Readonly<ValorRequisito> = {
  estado: "PENDIENTE",
  observacion: "",
  prorroga: null,
  prorrogaMotivo: "",
};

export function valorInicial(): ValorRequisito {
  return { ...VALOR_INICIAL };
}

export function borradorVacio(): BorradorExpediente {
  return {
    identificador: "",
    nombre: "",
    cargo: "",
    agencia: "",
    gerencia: "",
    fechaIngreso: "",
    tipoFuncionario: null,
    tipoGarantia: null,
    valores: {},
    actualizadoEn: new Date().toISOString(),
  };
}

export function valorDe(borrador: BorradorExpediente, codigo: string): ValorRequisito {
  const guardado = borrador.valores[codigo];
  return guardado ? guardado : valorInicial();
}

/** Devuelve un borrador nuevo con un requisito modificado. Nunca muta. */
export function conValor(
  borrador: BorradorExpediente,
  codigo: string,
  parcial: Partial<ValorRequisito>,
): BorradorExpediente {
  const actual = valorDe(borrador, codigo);
  const siguiente: ValorRequisito = { ...actual, ...parcial };
  const def = requisitoPorCodigo(codigo);

  // Coherencia: un requisito que no admite N/A no puede quedar en N/A, y una
  // prorroga solo sobrevive donde el catalogo la permite.
  if (def) {
    if (siguiente.estado === "NO_APLICA" && !def.permiteNA) siguiente.estado = "PENDIENTE";
    if (!def.permiteProrroga) {
      siguiente.prorroga = null;
      siguiente.prorrogaMotivo = "";
    }
  }

  return {
    ...borrador,
    valores: { ...borrador.valores, [codigo]: siguiente },
    actualizadoEn: new Date().toISOString(),
  };
}

export function conCampo<K extends keyof BorradorExpediente>(
  borrador: BorradorExpediente,
  campo: K,
  valor: BorradorExpediente[K],
): BorradorExpediente {
  return { ...borrador, [campo]: valor, actualizadoEn: new Date().toISOString() };
}

/* ------------------------------------------------------------------ */
/* Secciones del asistente                                            */
/* ------------------------------------------------------------------ */

export const SECCIONES = [
  "generales",
  "documentos",
  "tipo",
  "garantia",
  "especiales",
  "revision",
] as const;

export type SeccionId = (typeof SECCIONES)[number];

export const SECCION_TITULO: Record<SeccionId, string> = {
  generales: "Datos generales",
  documentos: "Documentos generales",
  tipo: "Tipo de funcionario",
  garantia: "Tipo de garantia",
  especiales: "Requisitos especiales",
  revision: "Revision y guardado",
};

export const SECCION_DESCRIPCION: Record<SeccionId, string> = {
  generales: "Identificacion del postulante y su puesto.",
  documentos: "Los 18 documentos exigidos a todo ingreso.",
  tipo: "Determina que requisitos adicionales corresponden.",
  garantia: "Solo para el area comercial.",
  especiales: "Requisitos propios de la rama elegida.",
  revision: "Compruebe el resumen antes de guardar.",
};

/**
 * Secciones realmente visibles. La de garantia solo aparece en la rama
 * comercial, de modo que el paso no existe cuando no corresponde en lugar de
 * mostrarse deshabilitado.
 */
export function seccionesActivas(borrador: BorradorExpediente): SeccionId[] {
  return SECCIONES.filter((s) => s !== "garantia" || borrador.tipoFuncionario === "COMERCIAL");
}

/* ------------------------------------------------------------------ */
/* Validacion                                                         */
/* ------------------------------------------------------------------ */

export type ErroresCampo = Record<string, string>;

const LIMITE_NOMBRE = 160;
const LIMITE_CARGO = 160;

export function esFechaValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) return false;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Fecha en palabras, construida a mano para no depender del huso del navegador. */
export function fechaLegible(iso: string): string {
  if (!esFechaValida(iso)) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const mes = MESES[Number(m[2]) - 1];
  return mes ? `${Number(m[3])} de ${mes} de ${m[1]}` : "";
}

export function validarGenerales(borrador: BorradorExpediente): ErroresCampo {
  const errores: ErroresCampo = {};

  const analisis = analizarIdentificador(borrador.identificador);
  if (!analisis.ok && analisis.error) errores.identificador = analisis.error;

  if (!borrador.nombre.trim()) errores.nombre = "El nombre es obligatorio.";
  else if (borrador.nombre.trim().length > LIMITE_NOMBRE)
    errores.nombre = `Maximo ${LIMITE_NOMBRE} caracteres.`;

  if (!borrador.cargo.trim()) errores.cargo = "El cargo es obligatorio.";
  else if (borrador.cargo.trim().length > LIMITE_CARGO)
    errores.cargo = `Maximo ${LIMITE_CARGO} caracteres.`;

  if (!borrador.agencia.trim()) errores.agencia = "Elija una agencia.";
  if (!borrador.gerencia.trim()) errores.gerencia = "Elija una gerencia.";

  if (!borrador.fechaIngreso.trim()) errores.fechaIngreso = "La fecha de ingreso es obligatoria.";
  else if (!esFechaValida(borrador.fechaIngreso))
    errores.fechaIngreso = "La fecha no existe. Revise dia, mes y anio.";

  return errores;
}

/**
 * Avisos que no bloquean el guardado. Un valor historico ausente del catalogo
 * se advierte pero jamas se borra ni impide continuar.
 */
export function avisosGenerales(
  borrador: BorradorExpediente,
  catalogos: { agencias: readonly string[]; gerencias: readonly string[] },
): string[] {
  const avisos: string[] = [];
  const clave = (v: string) => v.trim().toLocaleUpperCase("es");
  const dentro = (v: string, lista: readonly string[]) =>
    lista.some((o) => clave(o) === clave(v));

  if (borrador.agencia.trim() && catalogos.agencias.length > 0 && !dentro(borrador.agencia, catalogos.agencias)) {
    avisos.push(`La agencia «${borrador.agencia}» no figura en el catalogo actual. Se conserva tal cual.`);
  }
  if (borrador.gerencia.trim() && catalogos.gerencias.length > 0 && !dentro(borrador.gerencia, catalogos.gerencias)) {
    avisos.push(`La gerencia «${borrador.gerencia}» no figura en el catalogo actual. Se conserva tal cual.`);
  }
  return avisos;
}

export function validarSeccion(borrador: BorradorExpediente, seccion: SeccionId): ErroresCampo {
  switch (seccion) {
    case "generales":
      return validarGenerales(borrador);
    case "documentos":
      return {};
    case "tipo": {
      if (!borrador.tipoFuncionario) return { tipoFuncionario: "Elija el tipo de funcionario." };
      if (!puedeRegistrarse(borrador.tipoFuncionario)) {
        return {
          tipoFuncionario:
            "Este tipo esta en construccion: sus requisitos aun no estan definidos, por lo que no puede registrarse.",
        };
      }
      return {};
    }
    case "garantia": {
      if (borrador.tipoFuncionario !== "COMERCIAL") return {};
      return borrador.tipoGarantia ? {} : { tipoGarantia: "Elija el tipo de garantia." };
    }
    case "especiales":
      return {};
    case "revision": {
      const errores: ErroresCampo = {
        ...validarGenerales(borrador),
        ...validarSeccion(borrador, "tipo"),
        ...validarSeccion(borrador, "garantia"),
      };
      return errores;
    }
    default:
      return {};
  }
}

export function seccionCompleta(borrador: BorradorExpediente, seccion: SeccionId): boolean {
  return Object.keys(validarSeccion(borrador, seccion)).length === 0;
}

/** Primera seccion con errores; sirve para llevar el foco al problema real. */
export function primeraSeccionIncompleta(borrador: BorradorExpediente): SeccionId | null {
  for (const seccion of seccionesActivas(borrador)) {
    if (seccion !== "revision" && !seccionCompleta(borrador, seccion)) return seccion;
  }
  return null;
}

export function puedeGuardar(borrador: BorradorExpediente): boolean {
  return Object.keys(validarSeccion(borrador, "revision")).length === 0;
}

/* ------------------------------------------------------------------ */
/* Avance                                                             */
/* ------------------------------------------------------------------ */

export function requisitosDelBorrador(borrador: BorradorExpediente): RequisitoDef[] {
  return [
    ...requisitosGenerales(),
    ...requisitosEspeciales(borrador.tipoFuncionario, borrador.tipoGarantia),
  ];
}

export function entradasAvance(borrador: BorradorExpediente): EntradaAvance[] {
  return requisitosDelBorrador(borrador).map((req) => {
    const valor = valorDe(borrador, req.codigo);
    const entrada: EntradaAvance = { codigo: req.codigo, estado: valor.estado };
    if (valor.prorroga) entrada.prorroga = valor.prorroga;
    return entrada;
  });
}

export function resumenDe(borrador: BorradorExpediente, hoy: Date = new Date()): ResumenAvance {
  return resumenAvance(
    entradasAvance(borrador),
    borrador.tipoFuncionario,
    borrador.tipoGarantia,
    hoy,
  );
}

export function estadoGeneral(
  borrador: BorradorExpediente,
  opciones: { borrador?: boolean; enRevision?: boolean } = {},
  hoy: Date = new Date(),
): DocEstadoGeneral {
  return estadoGeneralDe(resumenDe(borrador, hoy), opciones);
}

/* ------------------------------------------------------------------ */
/* Cambio de tipo de garantia                                         */
/* ------------------------------------------------------------------ */

function esValorTocado(valor: ValorRequisito): boolean {
  return (
    valor.estado !== VALOR_INICIAL.estado ||
    valor.observacion.trim() !== "" ||
    valor.prorroga !== null ||
    valor.prorrogaMotivo.trim() !== ""
  );
}

/** Codigos con datos capturados que pertenecen a garantias distintas de la nueva. */
export function codigosDeOtrasGarantias(
  borrador: BorradorExpediente,
  nueva: TipoGarantia | null,
): string[] {
  return Object.keys(borrador.valores).filter((codigo) => {
    const def = requisitoPorCodigo(codigo);
    if (!def || !def.tipoGarantia) return false;
    if (def.tipoGarantia === nueva) return false;
    const valor = borrador.valores[codigo];
    return valor ? esValorTocado(valor) : false;
  });
}

/**
 * Cambia el tipo de garantia archivando lo capturado en la modalidad anterior.
 * No se borra en silencio: la interfaz debe pedir confirmacion antes y el
 * backend registra el cambio en auditoria si el expediente ya estaba guardado.
 */
export function conGarantia(
  borrador: BorradorExpediente,
  nueva: TipoGarantia,
): BorradorExpediente {
  const valores: Record<string, ValorRequisito> = {};
  for (const codigo of Object.keys(borrador.valores)) {
    const def = requisitoPorCodigo(codigo);
    if (def && def.tipoGarantia && def.tipoGarantia !== nueva) continue;
    const valor = borrador.valores[codigo];
    if (valor) valores[codigo] = valor;
  }
  return { ...borrador, tipoGarantia: nueva, valores, actualizadoEn: new Date().toISOString() };
}

/**
 * Cambia de rama. Los requisitos especiales de la rama anterior se descartan
 * porque no aplican; los 18 generales se conservan intactos.
 */
export function conTipoFuncionario(
  borrador: BorradorExpediente,
  nuevo: TipoFuncionario,
): BorradorExpediente {
  const especialesDeOtras = new Set(
    CATALOGO_DOCUMENTAL.filter(
      (r) => r.seccion === "REQUISITOS_ESPECIALES" && r.tipoFuncionario !== nuevo,
    ).map((r) => r.codigo),
  );
  const valores: Record<string, ValorRequisito> = {};
  for (const codigo of Object.keys(borrador.valores)) {
    if (especialesDeOtras.has(codigo)) continue;
    const valor = borrador.valores[codigo];
    if (valor) valores[codigo] = valor;
  }
  return {
    ...borrador,
    tipoFuncionario: nuevo,
    tipoGarantia: nuevo === "COMERCIAL" ? borrador.tipoGarantia : null,
    valores,
    actualizadoEn: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Persistencia del borrador                                          */
/* ------------------------------------------------------------------ */

export const CLAVE_BORRADOR = "bdp-documentacion-borrador";

function almacen(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function guardarBorrador(borrador: BorradorExpediente): boolean {
  const store = almacen();
  if (!store) return false;
  try {
    store.setItem(CLAVE_BORRADOR, JSON.stringify(borrador));
    return true;
  } catch {
    return false;
  }
}

/** Lee el borrador tolerando estructuras antiguas o corruptas. */
export function leerBorrador(): BorradorExpediente | null {
  const store = almacen();
  if (!store) return null;
  try {
    const crudo = store.getItem(CLAVE_BORRADOR);
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as Partial<BorradorExpediente> | null;
    if (!dato || typeof dato !== "object") return null;
    const base = borradorVacio();
    const valores: Record<string, ValorRequisito> = {};
    const crudoValores = dato.valores;
    if (crudoValores && typeof crudoValores === "object") {
      for (const codigo of Object.keys(crudoValores)) {
        const v = crudoValores[codigo] as Partial<ValorRequisito> | undefined;
        if (!v) continue;
        valores[codigo] = {
          estado: v.estado ?? "PENDIENTE",
          observacion: typeof v.observacion === "string" ? v.observacion : "",
          prorroga: typeof v.prorroga === "string" ? v.prorroga : null,
          prorrogaMotivo: typeof v.prorrogaMotivo === "string" ? v.prorrogaMotivo : "",
        };
      }
    }
    return {
      ...base,
      identificador: dato.identificador ?? "",
      nombre: dato.nombre ?? "",
      cargo: dato.cargo ?? "",
      agencia: dato.agencia ?? "",
      gerencia: dato.gerencia ?? "",
      fechaIngreso: dato.fechaIngreso ?? "",
      tipoFuncionario: dato.tipoFuncionario ?? null,
      tipoGarantia: dato.tipoGarantia ?? null,
      valores,
      actualizadoEn: dato.actualizadoEn ?? base.actualizadoEn,
    };
  } catch {
    return null;
  }
}

export function borrarBorrador(): void {
  const store = almacen();
  if (!store) return;
  try {
    store.removeItem(CLAVE_BORRADOR);
  } catch {
    // Un almacenamiento lleno o bloqueado no debe romper el formulario.
  }
}

export function hayBorrador(): boolean {
  return leerBorrador() !== null;
}

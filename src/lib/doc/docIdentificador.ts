/**
 * Analisis del identificador institucional «CI - Nro Proceso - Anio».
 *
 * Se interpreta SIEMPRE desde el final: el ultimo segmento es el anio y el
 * penultimo el numero de proceso. Todo lo anterior es el carnet, que en Bolivia
 * puede llevar guiones internos (extension, complemento alfanumerico), de modo
 * que partir por el primer guion daria resultados incorrectos.
 */

export interface IdentificadorPartes {
  ci: string;
  proceso: string;
  anio: number;
}

export interface AnalisisIdentificador {
  ok: boolean;
  /** Texto con separadores homogeneizados a « - ». */
  normalizado: string;
  partes: IdentificadorPartes | null;
  error: string | null;
}

const ANIO_MINIMO = 1990;
const ANIO_MAXIMO = 2100;
const FORMATO = "Use el formato CI - Nro Proceso - Anio, por ejemplo 8456872 - 105 - 2026.";

/**
 * Homogeneiza separadores y espacios sin alterar el contenido. Convierte los
 * guiones tipograficos (que llegan al pegar desde Word) en guion simple y deja
 * exactamente « - » entre segmentos, para que dos capturas del mismo dato no
 * generen expedientes distintos.
 */
export function normalizarIdentificador(texto: unknown): string {
  return String(texto ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave de comparacion para detectar duplicados sin depender de espacios. */
export function claveIdentificador(texto: unknown): string {
  return normalizarIdentificador(texto).replace(/\s+/g, "").toUpperCase();
}

export function mismoIdentificador(a: unknown, b: unknown): boolean {
  const ca = claveIdentificador(a);
  return ca.length > 0 && ca === claveIdentificador(b);
}

export function formatearIdentificador(partes: IdentificadorPartes): string {
  return `${partes.ci} - ${partes.proceso} - ${partes.anio}`;
}

export function analizarIdentificador(
  texto: unknown,
  hoy: Date = new Date(),
): AnalisisIdentificador {
  const normalizado = normalizarIdentificador(texto);
  const fallo = (error: string): AnalisisIdentificador => ({
    ok: false,
    normalizado,
    partes: null,
    error,
  });

  if (!normalizado) return fallo("El identificador es obligatorio.");

  const trozos = normalizado
    .split(" - ")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (trozos.length < 3) return fallo(FORMATO);

  const anioTexto = trozos[trozos.length - 1];
  const procesoTexto = trozos[trozos.length - 2];
  // El CI conserva su forma compacta (`1234567-1A`, no `1234567 - 1A`): sus
  // guiones internos son parte del dato institucional, no separadores del
  // identificador, y no deben reescribirse.
  const ciTexto = trozos
    .slice(0, trozos.length - 2)
    .join("-")
    .replace(/\s*-\s*/g, "-");

  if (!/^\d{4}$/.test(anioTexto)) {
    return fallo("El ultimo segmento debe ser el anio con cuatro digitos.");
  }
  const anio = Number(anioTexto);
  const techo = Math.min(ANIO_MAXIMO, hoy.getFullYear() + 1);
  if (anio < ANIO_MINIMO || anio > techo) {
    return fallo(`El anio debe estar entre ${ANIO_MINIMO} y ${techo}.`);
  }

  if (!/^\d{1,6}$/.test(procesoTexto)) {
    return fallo("El numero de proceso debe ser numerico, de uno a seis digitos.");
  }

  if (!/^[0-9A-Za-z][0-9A-Za-z\- ]*$/.test(ciTexto) || ciTexto.replace(/\D/g, "").length < 4) {
    return fallo("El carnet de identidad no parece valido. " + FORMATO);
  }

  const partes: IdentificadorPartes = {
    ci: ciTexto,
    proceso: String(Number(procesoTexto)),
    anio,
  };

  return {
    ok: true,
    // Forma canonica: CI compacto y separadores espaciados. Es la que se guarda
    // y la que se compara al abrir un expediente existente.
    normalizado: formatearIdentificador(partes),
    partes,
    error: null,
  };
}

/** Anio del expediente segun su identificador; util para elegir la pestania. */
export function anioDeIdentificador(texto: unknown): number | null {
  const analisis = analizarIdentificador(texto);
  return analisis.partes ? analisis.partes.anio : null;
}

/**
 * docApi.ts - cliente del backend de Apps Script.
 *
 * -- Tres decisiones que conviene explicar ----------------------------------
 *
 * 1. El cuerpo se envia como `text/plain`. No es un descuido. Con
 *    `application/json` el navegador manda una peticion OPTIONS previa que Apps
 *    Script no responde, y la llamada muere por CORS. Con `text/plain` no hay
 *    preflight. Ademas Apps Script contesta con un 302, asi que hace falta
 *    `redirect: "follow"`.
 *
 * 2. Cada escritura lleva un `solicitudId`. Si la red va mal y reintentamos, el
 *    servidor reconoce el identificador y devuelve el resultado de la primera
 *    ejecucion en lugar de repetirla. Sin esto, un reintento crea un expediente
 *    duplicado, que es peor que el error original.
 *
 * 3. Lo que no se puede enviar se guarda en una cola en disco. Trabajar sin
 *    conexion no puede significar perder lo escrito; significa enviarlo mas
 *    tarde.
 */

import { SCRIPT_URL } from "../../constants"

/* --------------------------------- Tipos ---------------------------------- */

export type DocApiError = {
	codigo: string
	mensaje: string
	pista?: string
	detalle?: unknown
}

export type DocApiMeta = {
	traza?: string
	horaServidor?: string
	milisegundos?: number
	backend?: string
	esquema?: number
	instalado?: boolean
	contadores?: Record<string, number>
}

export type DocApiResponse<T = unknown> = {
	ok: boolean
	accion: string
	solicitudId?: string
	datos?: T
	error?: DocApiError
	avisos?: string[]
	meta?: DocApiMeta
}

export type DocHallazgo = {
	severidad: "critico" | "aviso" | "info"
	codigo: string
	titulo: string
	detalle: string
	accion: string
	datos?: Record<string, unknown>
}

export type DocDiagnostico = {
	ok: boolean
	criticos: number
	hallazgos: DocHallazgo[]
	resumen: {
		instalado: boolean
		esquema: number
		backend: string
		libro: string
		libroId: string
		anios: number[]
		expedientes: number
		historicas: number
		auditoria: number
		respaldos: number
		ultimoRespaldo: string
	}
	ms?: number
}

export type DocEstado = {
	backend: string
	esquema: number
	instalado: boolean
	anios: number[]
	anioActual: number
	horaServidor: string
	libro?: string
	libroUrl?: string
	problema?: string
}

export type DocRespaldoInfo = {
	id: string
	momento: string
	motivo: string
	anios: string
	expedientes: number
	bytes: number
	huella: string
}

export type DocEventoAuditoria = {
	id: string
	momento: string
	accion: string
	entidad: string
	referencia: string
	expediente: string
	nombre: string
	campo: string
	anterior: string
	nuevo: string
	actor: string
	origen: string
	resultado: string
	anio: number | string
}

/* -------------------------------- Ajustes --------------------------------- */

const TIMEOUT_MS = 30000
const REINTENTOS = 3
const COLA_KEY = "bdp-documentacion-cola"
const COLA_MAX = 200

/** Acciones que modifican datos: llevan identificador y entran en la cola. */
const ACCIONES_ESCRITURA = new Set([
	"instalar",
	"reparar",
	"crear-anio",
	"expediente.guardar",
	"expediente.borrar",
	"expedientes.importar",
	"aviso.registrar",
	"configuracion.guardar",
	"catalogo.guardar",
	"mantenimiento.autoreparar",
	"mantenimiento.respaldar",
	"mantenimiento.restaurar",
	"mantenimiento.deduplicar",
	"mantenimiento.recalcular",
	"mantenimiento.recolorear",
	"mantenimiento.compactar",
	"entrega.registrar",
])

export function esEscritura(accion: string): boolean {
	return ACCIONES_ESCRITURA.has(accion)
}

let urlActiva = SCRIPT_URL

/** Permite apuntar a otro despliegue desde la configuracion del modulo. */
export function setDocScriptUrl(url: string): void {
	urlActiva = (url || "").trim() || SCRIPT_URL
}

export function getDocScriptUrl(): string {
	return urlActiva
}

export function hayBackendConfigurado(): boolean {
	return /^https:\/\/script\.google\.com\//.test(urlActiva)
}

export function nuevoSolicitudId(): string {
	const azar = Math.random().toString(36).slice(2, 10)
	return `req_${Date.now().toString(36)}_${azar}`
}

function esperar(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ------------------------------ Llamada base ------------------------------ */

export type DocCallOptions = {
	solicitudId?: string
	timeoutMs?: number
	reintentos?: number
	signal?: AbortSignal
	/** Si falla, guardar en la cola para reenviar mas tarde. */
	encolar?: boolean
	origen?: string
}

export class DocApiFallo extends Error {
	readonly codigo: string
	readonly pista?: string
	readonly detalle?: unknown
	readonly red: boolean
	readonly encolado: boolean

	constructor(
		mensaje: string,
		opts: { codigo?: string; pista?: string; detalle?: unknown; red?: boolean; encolado?: boolean } = {},
	) {
		super(mensaje)
		this.name = "DocApiFallo"
		this.codigo = opts.codigo || "ERROR"
		this.pista = opts.pista
		this.detalle = opts.detalle
		this.red = opts.red === true
		this.encolado = opts.encolado === true
	}
}

/**
 * Una peticion, sin reintentos.
 *
 * `AbortController` se ocupa del tiempo maximo: Apps Script puede quedarse
 * pensando varios minutos y una interfaz que espera indefinidamente parece rota.
 */
async function peticionUnica<T>(
	accion: string,
	params: Record<string, unknown>,
	timeoutMs: number,
	signalExterno?: AbortSignal,
): Promise<DocApiResponse<T>> {
	const controlador = new AbortController()
	const temporizador = setTimeout(() => controlador.abort(), timeoutMs)

	const cancelarPorExterno = () => controlador.abort()
	if (signalExterno) {
		if (signalExterno.aborted) controlador.abort()
		else signalExterno.addEventListener("abort", cancelarPorExterno)
	}

	try {
		const respuesta = await fetch(urlActiva, {
			method: "POST",
			redirect: "follow",
			headers: { "Content-Type": "text/plain;charset=utf-8" },
			body: JSON.stringify({ accion, ...params }),
			signal: controlador.signal,
		})

		const texto = await respuesta.text()

		let cuerpo: DocApiResponse<T> | null = null
		try {
			cuerpo = JSON.parse(texto) as DocApiResponse<T>
		} catch {
			cuerpo = null
		}

		if (!cuerpo) {
			// Casi siempre es la pagina de inicio de sesion de Google: la
			// implementacion no esta abierta a cualquier usuario.
			const pareceLogin = /accounts\.google\.com|iniciar sesión|sign in/i.test(texto)
			throw new DocApiFallo(
				pareceLogin
					? "El backend pide iniciar sesión en Google."
					: "El backend respondió algo que no es JSON.",
				{
					codigo: pareceLogin ? "AUTENTICACION" : "RESPUESTA_INVALIDA",
					pista: pareceLogin
						? 'Vuelve a implementar la aplicación web con acceso "Cualquier usuario".'
						: "Comprueba que la URL termine en /exec y que la implementación esté publicada.",
					detalle: texto.slice(0, 400),
				},
			)
		}

		return cuerpo
	} finally {
		clearTimeout(temporizador)
		if (signalExterno) signalExterno.removeEventListener("abort", cancelarPorExterno)
	}
}

/**
 * Llamada con reintentos.
 *
 * Se reintenta ante fallo de red y ante libro ocupado, siempre con el MISMO
 * `solicitudId`: es lo que hace que reintentar sea seguro. Un error de
 * validacion no se reintenta, porque volver a enviar lo mismo dara el mismo
 * resultado.
 */
export async function llamarDoc<T = unknown>(
	accion: string,
	params: Record<string, unknown> = {},
	opciones: DocCallOptions = {},
): Promise<T> {
	if (!hayBackendConfigurado()) {
		throw new DocApiFallo("No hay un backend configurado.", {
			codigo: "SIN_BACKEND",
			pista: "Pega la URL de la aplicación web en Configuración › Conexión.",
		})
	}

	const escritura = esEscritura(accion)
	const solicitudId = opciones.solicitudId || (escritura ? nuevoSolicitudId() : "")
	const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS
	const maxIntentos = opciones.reintentos ?? REINTENTOS

	const cuerpo: Record<string, unknown> = { ...params, origen: opciones.origen || "web" }
	if (solicitudId) cuerpo.solicitudId = solicitudId

	let ultimoFallo: unknown = null

	for (let intento = 1; intento <= maxIntentos; intento++) {
		try {
			const respuesta = await peticionUnica<T>(accion, cuerpo, timeoutMs, opciones.signal)

			if (respuesta.ok) return (respuesta.datos ?? null) as T

			const error = respuesta.error
			const reintentable = error?.codigo === "BUSY" || error?.codigo === "TIMEOUT"
			if (reintentable && intento < maxIntentos) {
				await esperar(600 * intento)
				continue
			}

			throw new DocApiFallo(error?.mensaje || "El backend rechazó la operación.", {
				codigo: error?.codigo || "ERROR",
				pista: error?.pista,
				detalle: error?.detalle,
			})
		} catch (e) {
			ultimoFallo = e

			if (e instanceof DocApiFallo && !e.red) {
				const recuperable = e.codigo === "BUSY" || e.codigo === "TIMEOUT"
				if (!recuperable) {
					if (escritura && opciones.encolar !== false) {
						// Un error del servidor no se encola: repetirlo fallaria igual.
						if (e.codigo === "SIN_BACKEND" || e.codigo === "AUTENTICACION") {
							encolar(accion, cuerpo, solicitudId)
							throw new DocApiFallo(e.message, {
								codigo: e.codigo,
								pista: e.pista,
								detalle: e.detalle,
								encolado: true,
							})
						}
					}
					throw e
				}
			}

			if (intento < maxIntentos) {
				await esperar(600 * intento)
				continue
			}
		}
	}

	const abortado = ultimoFallo instanceof Error && ultimoFallo.name === "AbortError"
	const mensaje = abortado
		? "El backend tardó demasiado en responder."
		: "No se pudo contactar con el backend."

	if (escritura && opciones.encolar !== false) {
		encolar(accion, cuerpo, solicitudId)
		throw new DocApiFallo(mensaje, {
			codigo: abortado ? "TIMEOUT" : "SIN_RED",
			pista: "El cambio quedó guardado aquí y se enviará en cuanto vuelva la conexión.",
			red: true,
			encolado: true,
		})
	}

	throw new DocApiFallo(mensaje, {
		codigo: abortado ? "TIMEOUT" : "SIN_RED",
		pista: "Revisa tu conexión y vuelve a intentarlo.",
		red: true,
	})
}

/* ------------------------------ Cola sin conexion ------------------------- */

export type DocPendiente = {
	id: string
	accion: string
	params: Record<string, unknown>
	solicitudId: string
	creado: string
	intentos: number
	ultimoError?: string
}

export function leerCola(): DocPendiente[] {
	try {
		const crudo = localStorage.getItem(COLA_KEY)
		if (!crudo) return []
		const lista = JSON.parse(crudo)
		return Array.isArray(lista) ? (lista as DocPendiente[]) : []
	} catch {
		return []
	}
}

function escribirCola(lista: DocPendiente[]): void {
	try {
		localStorage.setItem(COLA_KEY, JSON.stringify(lista.slice(-COLA_MAX)))
	} catch {
		/* almacenamiento lleno: la cola es una ayuda, no un requisito */
	}
}

/**
 * Guarda una operacion para reenviarla.
 *
 * Si ya hay una entrada con el mismo `solicitudId` se reemplaza en lugar de
 * anadirse: de lo contrario, tres reintentos fallidos dejarian tres copias en la
 * cola y la sincronizacion posterior mandaria lo mismo tres veces.
 */
function encolar(accion: string, params: Record<string, unknown>, solicitudId: string): void {
	if (!solicitudId) return
	const cola = leerCola()
	const indice = cola.findIndex((p) => p.solicitudId === solicitudId)
	const entrada: DocPendiente = {
		id: solicitudId,
		accion,
		params,
		solicitudId,
		creado: new Date().toISOString(),
		intentos: indice >= 0 ? cola[indice].intentos + 1 : 1,
	}
	if (indice >= 0) cola[indice] = entrada
	else cola.push(entrada)
	escribirCola(cola)
}

export function quitarDeCola(solicitudId: string): void {
	escribirCola(leerCola().filter((p) => p.solicitudId !== solicitudId))
}

export function vaciarCola(): void {
	escribirCola([])
}

/**
 * Reenvia lo pendiente, en orden.
 *
 * Se para en el primer fallo de red: si la conexion sigue caida, insistir con el
 * resto solo alarga la espera. Un elemento que ya ha fallado ocho veces se
 * descarta, porque a esas alturas el problema no es la red.
 */
export async function drenarCola(
	onProgreso?: (hechos: number, total: number) => void,
): Promise<{ enviados: number; fallidos: number; restantes: number }> {
	const cola = leerCola()
	if (!cola.length) return { enviados: 0, fallidos: 0, restantes: 0 }

	let enviados = 0
	let fallidos = 0
	const quedan: DocPendiente[] = []

	for (let i = 0; i < cola.length; i++) {
		const pendiente = cola[i]

		if (pendiente.intentos > 8) {
			fallidos++
			continue
		}

		try {
			await llamarDoc(pendiente.accion, pendiente.params, {
				solicitudId: pendiente.solicitudId,
				reintentos: 1,
				encolar: false,
			})
			enviados++
			onProgreso?.(enviados, cola.length)
		} catch (e) {
			const fallo = e as DocApiFallo
			if (fallo?.red) {
				// Sigue sin haber conexion: se guarda todo lo que falta tal cual.
				quedan.push(
					{ ...pendiente, intentos: pendiente.intentos + 1, ultimoError: fallo.message },
					...cola.slice(i + 1),
				)
				break
			}
			fallidos++
			quedan.push({
				...pendiente,
				intentos: pendiente.intentos + 1,
				ultimoError: fallo?.message || "Error desconocido",
			})
		}
	}

	escribirCola(quedan)
	return { enviados, fallidos, restantes: quedan.length }
}

/* ---------------------------- Atajos por accion --------------------------- */

export const docApi = {
	estado: (opts?: DocCallOptions) =>
		llamarDoc<DocEstado>("estado", {}, { reintentos: 1, timeoutMs: 12000, ...opts }),

	diagnostico: (opts?: DocCallOptions) => llamarDoc<DocDiagnostico>("diagnostico", {}, opts),

	instalar: (anios?: number[], opts?: DocCallOptions) =>
		llamarDoc("instalar", { anios: anios || [] }, { timeoutMs: 120000, ...opts }),

	reparar: (opts?: DocCallOptions) => llamarDoc("reparar", {}, { timeoutMs: 120000, ...opts }),

	listar: (params: { anio?: number; todos?: boolean; detalle?: boolean } = {}, opts?: DocCallOptions) =>
		llamarDoc<{ total: number; anios: number[]; expedientes: unknown[] }>(
			"expedientes.listar",
			{ detalle: true, todos: true, ...params },
			{ timeoutMs: 60000, ...opts },
		),

	obtener: (identificador: string, opts?: DocCallOptions) =>
		llamarDoc("expediente.obtener", { identificador }, opts),

	guardar: (expediente: unknown, opts?: DocCallOptions) =>
		llamarDoc("expediente.guardar", { expediente }, opts),

	borrar: (identificador: string, opts?: DocCallOptions) =>
		llamarDoc("expediente.borrar", { identificador }, opts),

	importar: (expedientes: unknown[], opts?: DocCallOptions) =>
		llamarDoc<{ creados: number; actualizados: number; fallidos: unknown[] }>(
			"expedientes.importar",
			{ expedientes },
			{ timeoutMs: 180000, ...opts },
		),

	exportar: (opts?: DocCallOptions) =>
		llamarDoc<{ total: number; expedientes: unknown[] }>(
			"expedientes.exportar",
			{ todos: true },
			{ timeoutMs: 90000, ...opts },
		),

	registrarAviso: (identificador: string, evento: unknown, opts?: DocCallOptions) =>
		llamarDoc("aviso.registrar", { identificador, evento }, opts),

	auditoria: (filtros: Record<string, unknown> = {}, opts?: DocCallOptions) =>
		llamarDoc<{ total: number; devueltos: number; eventos: DocEventoAuditoria[] }>(
			"auditoria.consultar",
			filtros,
			opts,
		),

	metricas: (dias = 30, opts?: DocCallOptions) => llamarDoc("auditoria.metricas", { dias }, opts),

	autoreparar: (opts?: DocCallOptions) =>
		llamarDoc("mantenimiento.autoreparar", {}, { timeoutMs: 180000, ...opts }),

	respaldar: (motivo = "manual", opts?: DocCallOptions) =>
		llamarDoc<{ id: string; expedientes: number; bytes: number }>(
			"mantenimiento.respaldar",
			{ motivo },
			{ timeoutMs: 120000, ...opts },
		),

	respaldos: (opts?: DocCallOptions) =>
		llamarDoc<{ respaldos: DocRespaldoInfo[] }>("mantenimiento.respaldos", {}, opts),

	restaurar: (respaldoId: string, opts?: DocCallOptions) =>
		llamarDoc("mantenimiento.restaurar", { respaldoId }, { timeoutMs: 180000, ...opts }),

	duplicados: (aplicar = false, opts?: DocCallOptions) =>
		llamarDoc<{ grupos: unknown[]; eliminados: number }>(
			"mantenimiento.deduplicar",
			{ aplicar },
			{ timeoutMs: 120000, ...opts },
		),

	recalcular: (opts?: DocCallOptions) =>
		llamarDoc("mantenimiento.recalcular", {}, { timeoutMs: 180000, ...opts }),

	recolorear: (opts?: DocCallOptions) =>
		llamarDoc("mantenimiento.recolorear", {}, { timeoutMs: 180000, ...opts }),

	compactar: (opts?: DocCallOptions) =>
		llamarDoc("mantenimiento.compactar", {}, { timeoutMs: 120000, ...opts }),

	configuracion: (opts?: DocCallOptions) => llamarDoc("configuracion.obtener", {}, opts),

	guardarConfiguracion: (configuracion: Record<string, unknown>, opts?: DocCallOptions) =>
		llamarDoc("configuracion.guardar", { configuracion }, opts),
}

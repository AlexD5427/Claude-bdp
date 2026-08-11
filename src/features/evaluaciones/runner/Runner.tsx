/**
 * Runner del candidato — la prueba, tal como la ve quien la responde.
 *
 * Se abre con el enlace público (`#/evaluacion/EV-XXXX-1234`) y NO exige cuenta:
 * la única credencial es el enlace, tal como pidió el encargo.
 *
 * ── Lo que este componente garantiza ─────────────────────────────────────────
 *  · El reloj es del SERVIDOR. El navegador solo cuenta hacia atrás entre latidos;
 *    cada latido y cada guardado recalculan los segundos restantes en el servidor.
 *    Cambiar la hora del equipo o recargar no regala tiempo.
 *  · Autoguardado periódico. Una caída de red pierde, como mucho, el intervalo
 *    configurado (20 s por omisión).
 *  · Autoenvío al agotarse el tiempo, con la marca de «envío automático».
 *  · Rastro de integridad: cambios de pestaña, foco, copiar y pegar, navegación y
 *    tiempos. Se anuncia al candidato ANTES de empezar; una vigilancia silenciosa
 *    no es aceptable y además no sirve como evidencia.
 *  · Sirve además como implementación de referencia para el segundo frontend
 *    (ver `docs/evaluaciones/CONTRATO_FRONTEND.md`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { abrirEvaluacion, enviarIntento, guardarProgreso, iniciarIntento, latido } from "../api/client";
import { RichText } from "../richtext/RichText";
import { isRichEmpty } from "../domain/richText";
import { tipoSpec } from "../domain/questionTypes";
import type {
  EventoEnviado,
  InicioIntento,
  PortadaPublica,
  PreguntaPublica,
  RespuestaEnviada,
  ResultadoCandidato,
} from "../domain/model";
import { AnswerField, type ValorRespuesta } from "./AnswerField";
import { useIntegridad } from "./useIntegridad";
import { formatearReloj } from "../ui/pieces";

type Fase = "cargando" | "portada" | "prueba" | "enviado" | "error";

/** Código de la evaluación en el hash: `#/evaluacion/EV-XXXX-1234`. */
export function codigoDesdeHash(hash: string): string {
  const coincidencia = /#\/?evaluacion\/([A-Za-z0-9-]+)/.exec(hash);
  return coincidencia ? coincidencia[1].toUpperCase() : "";
}

export function Runner({ codigo }: { codigo: string }) {
  const [fase, setFase] = useState<Fase>("cargando");
  const [portada, setPortada] = useState<PortadaPublica | null>(null);
  const [error, setError] = useState<{ mensaje: string; pista: string } | null>(null);
  const [inicio, setInicio] = useState<InicioIntento | null>(null);
  const [resultado, setResultado] = useState<ResultadoCandidato | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const res = await abrirEvaluacion(codigo);
      if (!vivo) return;
      if (!res.ok) {
        setError({ mensaje: res.error.message, pista: res.error.pista ?? "" });
        setFase("error");
        return;
      }
      setPortada(res.value);
      setFase("portada");
    })();
    return () => {
      vivo = false;
    };
  }, [codigo]);

  return (
    <div className="relative min-h-screen">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <AnimatePresence mode="wait">
          {fase === "cargando" && (
            <motion.div key="cargando" className="grid place-items-center py-24" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
            </motion.div>
          )}

          {fase === "error" && error && (
            <motion.div key="error" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-3xl p-6">
              <XCircle className="tone-text-peligro mb-3 h-8 w-8" />
              <h1 className="text-xl font-black text-ink">No se pudo abrir la evaluación</h1>
              <p className="mt-2 text-sm text-ink-soft">{error.mensaje}</p>
              {error.pista && <p className="mt-1 text-xs text-ink-faint">{error.pista}</p>}
            </motion.div>
          )}

          {fase === "portada" && portada && (
            <Portada
              key="portada"
              portada={portada}
              onIniciado={(datos) => {
                setInicio(datos);
                setFase("prueba");
              }}
            />
          )}

          {fase === "prueba" && inicio && portada && (
            <Prueba
              key="prueba"
              inicio={inicio}
              onEnviado={(res) => {
                setResultado(res);
                setFase("enviado");
              }}
            />
          )}

          {fase === "enviado" && resultado && <Resultado key="enviado" resultado={resultado} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* --------------------------------- Portada -------------------------------- */

function Portada({ portada, onIniciado }: { portada: PortadaPublica; onIniciado: (inicio: InicioIntento) => void }) {
  const [datos, setDatos] = useState<Record<string, string>>({});
  const [consentimiento, setConsentimiento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});

  if (!portada.disponible) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-3xl p-6 text-center">
        <Clock className="tone-text-aviso mx-auto mb-3 h-8 w-8" />
        <h1 className="text-xl font-black text-ink">{portada.titulo}</h1>
        <p className="mt-2 text-sm text-ink-soft">{portada.mensaje}</p>
      </motion.div>
    );
  }

  const campos = portada.participante?.campos.filter((campo) => campo.activo !== false) ?? [];

  const empezar = async () => {
    const nuevos: Record<string, string> = {};
    for (const campo of campos) {
      if (campo.obligatorio && !(datos[campo.clave] ?? "").trim()) {
        nuevos[campo.clave] = "Este dato es obligatorio.";
      }
    }
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setEnviando(true);
    const res = await iniciarIntento(portada.codigo, datos, {
      consentimiento,
      agenteUsuario: navigator.userAgent.slice(0, 280),
      zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setEnviando(false);
    if (!res.ok) {
      const issues = res.error.issues ?? [];
      if (issues.length > 0) {
        const mapa: Record<string, string> = {};
        for (const issue of issues) {
          const clave = issue.path.replace("participante.", "");
          mapa[clave] = issue.message;
        }
        setErrores(mapa);
      } else {
        setErrores({ general: `${res.error.message}${res.error.pista ? ` ${res.error.pista}` : ""}` });
      }
      return;
    }
    onIniciado(res.value);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
      <div className="glass rounded-3xl p-6">
        {portada.tema?.logoUrl && (
          <img src={portada.tema.logoUrl} alt="" className="mb-4 h-10 w-auto object-contain" />
        )}
        <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-accent">Evaluación</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-ink sm:text-3xl">{portada.titulo}</h1>
        {portada.descripcion && <p className="mt-2 text-sm text-ink-soft">{portada.descripcion}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {portada.duracionMinutos != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-bold text-accent ring-1 ring-cyan-400/30">
              <Clock className="h-3.5 w-3.5" /> {portada.duracionMinutos} minutos
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3 py-1 text-xs font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]">
            {portada.totalPreguntas} preguntas
          </span>
          {portada.intentosMaximos === 1 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold tone-text-aviso ring-1 ring-amber-400/30">
              Un solo intento
            </span>
          )}
        </div>

        {portada.instrucciones && !isRichEmpty(portada.instrucciones) && (
          <div className="mt-4 rounded-2xl fill-softer p-4 ring-1 ring-[color:var(--hairline)]">
            <RichText doc={portada.instrucciones} />
          </div>
        )}

        {/* Se anuncia el registro ANTES de empezar. */}
        {portada.integridad && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-cyan-400/25 bg-cyan-500/5 px-4 py-3 text-xs text-accent">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Durante la prueba se registran, para verificar su integridad: los cambios de pestaña, la pérdida de foco de
              la ventana y las acciones de copiar y pegar (solo su longitud, nunca el contenido), además del tiempo
              dedicado a cada pregunta. No se toman capturas de pantalla ni se accede a la cámara.
              {portada.integridad.bloquearPegado && " En esta prueba, pegar texto está deshabilitado."}
            </span>
          </div>
        )}
      </div>

      <div className="glass rounded-3xl p-6">
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-ink">Tus datos</h2>
        <p className="mt-1 text-xs text-ink-soft">Necesarios para identificar tu resultado.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {campos.map((campo) => (
            <div key={campo.clave} className="flex flex-col gap-1.5">
              <label htmlFor={`c-${campo.clave}`} className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                {campo.etiqueta}
                {campo.obligatorio && <span className="tone-text-peligro ml-1">*</span>}
              </label>
              <input
                id={`c-${campo.clave}`}
                value={datos[campo.clave] ?? ""}
                onChange={(e) => setDatos((previo) => ({ ...previo, [campo.clave]: e.target.value }))}
                autoComplete={campo.clave === "correo" ? "email" : campo.clave === "nombre" ? "name" : "off"}
                className="w-full rounded-2xl fill-soft px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
              />
              {errores[campo.clave] && <p className="text-xs font-semibold tone-text-peligro">{errores[campo.clave]}</p>}
            </div>
          ))}
        </div>

        {portada.participante?.requiereConsentimiento && (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-2xl fill-softer p-3 text-xs text-ink-soft ring-1 ring-[color:var(--hairline)]">
            <input
              type="checkbox"
              checked={consentimiento}
              onChange={(e) => setConsentimiento(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-500"
            />
            <span>{portada.participante.textoConsentimiento}</span>
          </label>
        )}

        {errores.general && (
          <p className="mt-3 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-2.5 text-xs tone-text-peligro">
            {errores.general}
          </p>
        )}

        <button
          type="button"
          onClick={() => void empezar()}
          disabled={enviando || (portada.participante?.requiereConsentimiento === true && !consentimiento)}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-6 py-3 text-sm font-black text-white shadow-glass ring-1 ring-white/25 transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Comenzar la evaluación
        </button>
        <p className="mt-2 text-center text-[0.7rem] text-ink-faint">
          El tiempo empieza a contar al pulsar el botón.
        </p>
      </div>
    </motion.div>
  );
}

/* ---------------------------------- Prueba -------------------------------- */

function Prueba({ inicio, onEnviado }: { inicio: InicioIntento; onEnviado: (resultado: ResultadoCandidato) => void }) {
  const prueba = inicio.prueba;
  const preguntas = useMemo(
    () => prueba.secciones.flatMap((seccion) => seccion.preguntas.map((pregunta) => ({ seccion, pregunta }))),
    [prueba.secciones],
  );
  const contestables = useMemo(() => preguntas.filter(({ pregunta }) => tipoSpec(pregunta.tipo)?.kind === "pregunta"), [preguntas]);

  const [respuestas, setRespuestas] = useState<Record<string, ValorRespuesta>>(() => {
    const inicial: Record<string, ValorRespuesta> = {};
    for (const previa of inicio.respuestasPrevias) {
      inicial[previa.preguntaId] = { opciones: previa.opciones ?? [], valor: previa.valor };
    }
    return inicial;
  });
  const [restantes, setRestantes] = useState<number | null>(inicio.segundosRestantes);
  const [indicePagina, setIndicePagina] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ultimoGuardado, setUltimoGuardado] = useState<string>("");
  const [aviso, setAviso] = useState<string>("");
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);

  const integridad = useIntegridad({
    politica: prueba.integridad,
    iniciadoEn: inicio.iniciadoEn,
  });
  const cambios = useRef<Record<string, { visitas: number; cambios: number; segundos: number }>>({});
  const enviado = useRef(false);

  /** Paginación según la navegación configurada. */
  const paginas = useMemo(() => {
    if (prueba.aplicacion.navegacion === "una_por_pagina") {
      return preguntas.map((entrada) => [entrada]);
    }
    if (prueba.aplicacion.navegacion === "secuencial") {
      return prueba.secciones.map((seccion) => seccion.preguntas.map((pregunta) => ({ seccion, pregunta })));
    }
    return [preguntas];
  }, [preguntas, prueba.aplicacion.navegacion, prueba.secciones]);

  const cuerpoRespuestas = useCallback((): RespuestaEnviada[] => {
    return Object.entries(respuestas).map(([preguntaId, valor]) => ({
      preguntaId,
      opciones: valor.opciones,
      valor: valor.valor,
      segundos: cambios.current[preguntaId]?.segundos ?? 0,
      visitas: cambios.current[preguntaId]?.visitas ?? 0,
      cambios: cambios.current[preguntaId]?.cambios ?? 0,
    }));
  }, [respuestas]);

  const enviar = useCallback(
    async (automatico: boolean) => {
      if (enviado.current) return;
      enviado.current = true;
      setEnviando(true);
      const res = await enviarIntento(
        inicio.intentoId,
        inicio.token,
        cuerpoRespuestas(),
        integridad.tomarEventos(),
        automatico,
      );
      setEnviando(false);
      if (!res.ok) {
        enviado.current = false;
        setAviso(`${res.error.message} ${res.error.pista ?? ""}`.trim());
        return;
      }
      onEnviado(res.value);
    },
    [cuerpoRespuestas, inicio.intentoId, inicio.token, integridad, onEnviado],
  );

  /* Cuenta atrás local entre latidos. */
  useEffect(() => {
    if (restantes === null) return;
    const timer = setInterval(() => {
      setRestantes((previo) => (previo === null ? null : Math.max(0, previo - 1)));
    }, 1000);
    return () => clearInterval(timer);
  }, [restantes === null]);

  /* Autoenvío al llegar a cero. */
  useEffect(() => {
    if (restantes !== 0 || enviado.current) return;
    if (prueba.aplicacion.autoenviarAlExpirar) {
      setAviso("Se agotó el tiempo. Enviando tus respuestas…");
      void enviar(true);
    }
  }, [restantes, enviar, prueba.aplicacion.autoenviarAlExpirar]);

  /* Latido: el servidor es el dueño del reloj. */
  useEffect(() => {
    const intervalo = setInterval(() => {
      void (async () => {
        const res = await latido(inicio.intentoId, inicio.token);
        if (!res.ok) return;
        setRestantes(res.value.segundosRestantes);
        if (res.value.expirado && !enviado.current && prueba.aplicacion.autoenviarAlExpirar) {
          void enviar(true);
        }
      })();
    }, 20000);
    return () => clearInterval(intervalo);
  }, [enviar, inicio.intentoId, inicio.token, prueba.aplicacion.autoenviarAlExpirar]);

  /* Autoguardado. */
  const segundosAutoguardado = prueba.aplicacion.guardadoAutomaticoSegundos;
  useEffect(() => {
    if (segundosAutoguardado <= 0) return;
    const intervalo = setInterval(() => {
      void (async () => {
        if (enviado.current) return;
        setGuardando(true);
        const res = await guardarProgreso(
          inicio.intentoId,
          inicio.token,
          cuerpoRespuestas(),
          integridad.tomarEventos(),
        );
        setGuardando(false);
        if (res.ok) {
          setUltimoGuardado(res.value.guardadoEn);
          setRestantes(res.value.segundosRestantes);
        }
      })();
    }, segundosAutoguardado * 1000);
    return () => clearInterval(intervalo);
  }, [cuerpoRespuestas, inicio.intentoId, inicio.token, integridad, segundosAutoguardado]);

  const responder = (preguntaId: string, valor: ValorRespuesta) => {
    setRespuestas((previo) => {
      const contador = cambios.current[preguntaId] ?? { visitas: 1, cambios: 0, segundos: 0 };
      cambios.current[preguntaId] = { ...contador, cambios: contador.cambios + 1 };
      return { ...previo, [preguntaId]: valor };
    });
    integridad.registrar("pregunta_respondida", { preguntaId });
  };

  const respondidas = contestables.filter(({ pregunta }) => estaRespondida(respuestas[pregunta.id])).length;
  const faltanObligatorias = contestables.filter(
    ({ pregunta }) => pregunta.obligatoria && !estaRespondida(respuestas[pregunta.id]),
  );
  const paginaActual = paginas[Math.min(indicePagina, paginas.length - 1)] ?? [];
  const critico = restantes !== null && restantes <= 60;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
      {/* Barra fija con el reloj y el progreso */}
      <div className="glass sticky top-3 z-20 rounded-3xl p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-ink">{prueba.titulo}</p>
            {prueba.aplicacion.mostrarProgreso && (
              <p className="text-[0.7rem] text-ink-soft">
                {respondidas} de {contestables.length} respondidas
                {guardando && <span className="ml-2 text-accent">guardando…</span>}
                {!guardando && ultimoGuardado && <span className="ml-2 tone-text-exito">progreso guardado</span>}
              </p>
            )}
          </div>
          {restantes !== null && (
            <motion.div
              animate={critico ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={critico ? { repeat: Infinity, duration: 1.6 } : { duration: 0.2 }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-mono text-lg font-black tabular-nums ring-1 ${
                critico
                  ? "bg-rose-500/20 tone-text-peligro ring-rose-400/40"
                  : "bg-cyan-500/15 text-accent ring-cyan-400/30"
              }`}
            >
              <Clock className="h-4 w-4" />
              {formatearReloj(restantes)}
            </motion.div>
          )}
        </div>
        {prueba.aplicacion.mostrarProgreso && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--fill-2)]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#00b0d8] to-[#005baa]"
              animate={{ width: `${contestables.length > 0 ? (respondidas / contestables.length) * 100 : 0}%` }}
              transition={{ type: "spring", stiffness: 140, damping: 22 }}
            />
          </div>
        )}
      </div>

      {aviso && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs tone-text-aviso">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {aviso}
        </div>
      )}

      {/* Preguntas de la página */}
      <motion.ol
        key={indicePagina}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col gap-4"
      >
        {paginaActual.map(({ seccion, pregunta }, indice) => (
          <BloquePregunta
            key={pregunta.id}
            pregunta={pregunta}
            seccion={seccion.titulo}
            numero={
              prueba.tema.mostrarNumeracion
                ? contestables.findIndex((entrada) => entrada.pregunta.id === pregunta.id) + 1
                : 0
            }
            primeraDeSeccion={indice === 0 || paginaActual[indice - 1].seccion.id !== seccion.id}
            descripcionSeccion={seccion.descripcion}
            valor={respuestas[pregunta.id]}
            onChange={(valor) => responder(pregunta.id, valor)}
            onVer={() => {
              const contador = cambios.current[pregunta.id] ?? { visitas: 0, cambios: 0, segundos: 0 };
              cambios.current[pregunta.id] = { ...contador, visitas: contador.visitas + 1 };
              integridad.registrar("pregunta_vista", { preguntaId: pregunta.id });
            }}
            bloquearPegado={prueba.integridad.bloquearPegado}
            onPegar={(caracteres) => integridad.registrar("pegar", { preguntaId: pregunta.id, detalle: { caracteres } })}
            onCopiar={() => integridad.registrar("copiar", { preguntaId: pregunta.id })}
          />
        ))}
      </motion.ol>

      {/* Navegación y envío */}
      <div className="glass sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-3xl p-3 sm:p-4">
        <div className="flex items-center gap-2">
          {paginas.length > 1 && (
            <>
              <button
                type="button"
                disabled={indicePagina === 0 || !prueba.aplicacion.permitirRetroceso}
                onClick={() => {
                  setIndicePagina((i) => Math.max(0, i - 1));
                  integridad.registrar("seccion_cambiada");
                }}
                className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3.5 py-2 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" /> Anterior
              </button>
              <span className="text-xs text-ink-faint">
                {indicePagina + 1} / {paginas.length}
              </span>
              <button
                type="button"
                disabled={indicePagina >= paginas.length - 1}
                onClick={() => {
                  setIndicePagina((i) => Math.min(paginas.length - 1, i + 1));
                  integridad.registrar("seccion_cambiada");
                }}
                className="inline-flex items-center gap-1.5 rounded-full fill-softer px-3.5 py-2 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] disabled:opacity-40"
              >
                Siguiente <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setConfirmarEnvio(true)}
          disabled={enviando}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-black text-white shadow-glass ring-1 ring-white/25 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar la evaluación
        </button>
      </div>

      {/* Confirmación de envío */}
      <AnimatePresence>
        {confirmarEnvio && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] flex items-center justify-center p-4"
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirmar envío"
          >
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md" onClick={() => setConfirmarEnvio(false)} />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="glass-heavy relative z-10 w-full max-w-md rounded-3xl p-6"
            >
              <h3 className="text-lg font-black text-ink">¿Enviar la evaluación?</h3>
              <p className="mt-2 text-sm text-ink-soft">
                Has respondido {respondidas} de {contestables.length} preguntas. Una vez enviada no podrás modificarla.
              </p>
              {faltanObligatorias.length > 0 && (
                <p className="mt-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs tone-text-aviso">
                  Faltan {faltanObligatorias.length} pregunta(s) obligatoria(s) sin responder.
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmarEnvio(false)}
                  className="rounded-full fill-softer px-4 py-2 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)]"
                >
                  Seguir respondiendo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmarEnvio(false);
                    void enviar(false);
                  }}
                  className="rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 px-5 py-2 text-sm font-bold text-white ring-1 ring-white/25"
                >
                  Enviar ahora
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function BloquePregunta({
  pregunta,
  seccion,
  numero,
  primeraDeSeccion,
  descripcionSeccion,
  valor,
  onChange,
  onVer,
  bloquearPegado,
  onPegar,
  onCopiar,
}: {
  pregunta: PreguntaPublica;
  seccion: string;
  numero: number;
  primeraDeSeccion: boolean;
  descripcionSeccion: unknown;
  valor: ValorRespuesta | undefined;
  onChange: (valor: ValorRespuesta) => void;
  onVer: () => void;
  bloquearPegado: boolean;
  onPegar: (caracteres: number) => void;
  onCopiar: () => void;
}) {
  const spec = tipoSpec(pregunta.tipo);
  const visto = useRef(false);
  const contenedor = useRef<HTMLLIElement>(null);

  // Se marca «vista» cuando entra en el viewport: es la señal honesta de que el
  // candidato la tuvo delante, y de ahí sale el tiempo por pregunta.
  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo || visto.current) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting && !visto.current) {
            visto.current = true;
            onVer();
          }
        }
      },
      { threshold: 0.4 },
    );
    observador.observe(nodo);
    return () => observador.disconnect();
  }, [onVer]);

  if (pregunta.tipo === "contenido_separador") {
    return <li className="h-px bg-[color:var(--hairline)]" />;
  }

  return (
    <li ref={contenedor} className="flex flex-col gap-2">
      {primeraDeSeccion && seccion && (
        <div className="mb-1">
          <h2 className="text-sm font-black uppercase tracking-[0.14em] text-accent">{seccion}</h2>
          <RichText doc={descripcionSeccion} compacto />
        </div>
      )}
      <div className="glass rounded-3xl p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          {numero > 0 && spec?.kind === "pregunta" && (
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-cyan-500/15 text-[0.7rem] font-black text-accent">
              {numero}
            </span>
          )}
          {/* El asterisco de obligatoria va junto al enunciado en la misma línea:
              como el renderizador devuelve bloques, ponerlo detrás lo dejaba
              flotando en un renglón propio, como si fuera parte de la pregunta. */}
          <div className="relative min-w-0 flex-1">
            <RichText doc={pregunta.enunciado} />
            {pregunta.obligatoria && (
              <span className="tone-text-peligro absolute -left-2.5 top-0 font-black" title="Respuesta obligatoria">
                *
              </span>
            )}
          </div>
          {pregunta.puntos !== undefined && pregunta.puntos > 0 && (
            <span className="shrink-0 rounded-full fill-softer px-2 py-0.5 text-[0.65rem] font-bold text-ink-faint">
              {pregunta.puntos} pt{pregunta.puntos === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {pregunta.ayuda && (
          <div className="mt-1.5 pl-8 text-xs text-ink-faint">
            <RichText doc={pregunta.ayuda} compacto />
          </div>
        )}

        {Boolean(pregunta.configuracion.imagenUrl) && (
          <img
            src={String(pregunta.configuracion.imagenUrl)}
            alt=""
            className="mt-3 max-h-72 w-full rounded-2xl object-contain ring-1 ring-[color:var(--hairline)]"
          />
        )}

        {spec?.kind === "pregunta" && (
          <div className="mt-3">
            <AnswerField
              pregunta={pregunta}
              valor={valor}
              onChange={onChange}
              bloquearPegado={bloquearPegado}
              onPegar={onPegar}
              onCopiar={onCopiar}
            />
          </div>
        )}
      </div>
    </li>
  );
}

/* -------------------------------- Resultado -------------------------------- */

function Resultado({ resultado }: { resultado: ResultadoCandidato }) {
  const aprobado = resultado.aprobado;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
      className="glass rounded-3xl p-8 text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 16, delay: 0.1 }}
        className={`mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl ${
          aprobado === false ? "bg-gradient-to-br from-rose-500 to-red-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"
        } ring-1 ring-white/30`}
      >
        <CheckCircle2 className="h-8 w-8 text-white" />
      </motion.div>
      <h1 className="text-2xl font-black tracking-tight text-ink">Evaluación enviada</h1>
      <p className="mt-2 text-sm text-ink-soft">
        {resultado.envioAutomatico
          ? "Se envió automáticamente al agotarse el tiempo, con las respuestas registradas hasta ese momento."
          : "Tus respuestas quedaron registradas correctamente."}
      </p>
      <p className="mt-1 font-mono text-[0.7rem] text-ink-faint">Comprobante: {resultado.intentoId}</p>

      {resultado.calificacionPendiente && (
        <p className="mx-auto mt-4 max-w-md rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-xs text-accent">
          Hay preguntas abiertas que revisará una persona del equipo evaluador, así que la nota final todavía no está
          disponible.
        </p>
      )}

      {resultado.nota !== undefined && resultado.nota !== null && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-ink-faint">Tu resultado</span>
          <span className="text-5xl font-black tabular-nums text-ink">{resultado.nota}</span>
          {aprobado !== null && aprobado !== undefined && (
            <span
              className={`rounded-full px-4 py-1 text-sm font-black ring-1 ${
                aprobado
                  ? "bg-emerald-500/20 tone-text-exito ring-emerald-400/40"
                  : "bg-rose-500/20 tone-text-peligro ring-rose-400/40"
              }`}
            >
              {aprobado ? "Aprobado" : "No aprobado"}
            </span>
          )}
          {resultado.correctas !== undefined && (
            <span className="text-xs text-ink-soft">
              {resultado.correctas} correctas · {resultado.incorrectas} incorrectas · {resultado.sinResponder} sin
              responder
            </span>
          )}
        </div>
      )}

      <p className="mt-8 text-xs text-ink-faint">Ya puedes cerrar esta ventana.</p>
    </motion.div>
  );
}

function estaRespondida(valor: ValorRespuesta | undefined): boolean {
  if (!valor) return false;
  if (valor.opciones && valor.opciones.length > 0) return true;
  const contenido = valor.valor;
  if (contenido === null || contenido === undefined || contenido === "") return false;
  if (Array.isArray(contenido)) return contenido.length > 0;
  if (typeof contenido === "object") return Object.keys(contenido).length > 0;
  return true;
}

export type { EventoEnviado };

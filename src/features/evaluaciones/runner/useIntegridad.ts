/**
 * Registro de integridad en el navegador.
 *
 * Escucha los eventos que documentan cómo se hizo la prueba y los acumula en una
 * cola con número de secuencia. El runner los envía en cada guardado y en el
 * envío final; el servidor los deduplica por secuencia, así que reenviar el mismo
 * lote tras una reconexión no duplica nada.
 *
 * ── Qué se registra y qué NO ─────────────────────────────────────────────────
 * Se registra: visibilidad de la pestaña, foco de la ventana, copiar, cortar,
 * pegar (solo la LONGITUD del texto), menú contextual, intento de imprimir,
 * pantalla completa, redimensionado, recargas, intentos de salir e inactividad.
 *
 * No se registra: el contenido del portapapeles, capturas de pantalla, la cámara,
 * el micrófono ni nada del resto del equipo. Aparte de ser lo correcto, es lo único
 * que un navegador puede hacer sin permisos explícitos, y prometer más sería
 * mentir.
 */

import { useCallback, useEffect, useRef } from "react";
import type { EventoEnviado, PoliticaIntegridad } from "../domain/model";

/** Segundos de quietud a partir de los cuales se anota inactividad. */
const INACTIVIDAD_SEGUNDOS = 90;
/** Segundos fuera de la pestaña a partir de los cuales el evento sube de nivel. */
const AUSENCIA_PROLONGADA_SEGUNDOS = 60;

export interface RegistroIntegridad {
  /** Anota un evento a mano (lo usa el runner para la navegación y las respuestas). */
  registrar: (tipo: string, extra?: { preguntaId?: string; detalle?: Record<string, number | string> }) => void;
  /** Devuelve los eventos acumulados y los conserva hasta que el servidor confirma. */
  tomarEventos: () => EventoEnviado[];
}

export function useIntegridad({
  politica,
  iniciadoEn,
}: {
  politica: PoliticaIntegridad;
  iniciadoEn: string;
}): RegistroIntegridad {
  const cola = useRef<EventoEnviado[]>([]);
  const secuencia = useRef(0);
  const inicioMs = useRef(Date.parse(iniciadoEn) || Date.now());
  const ocultaDesde = useRef<number | null>(null);
  const sinFocoDesde = useRef<number | null>(null);
  const ultimaActividad = useRef(Date.now());

  const registrar = useCallback(
    (tipo: string, extra: { preguntaId?: string; detalle?: Record<string, number | string>; duracionMs?: number } = {}) => {
      secuencia.current += 1;
      const ahora = Date.now();
      cola.current.push({
        tipo,
        secuencia: secuencia.current,
        ocurridoEn: new Date(ahora).toISOString(),
        segundosDesdeInicio: Math.max(0, Math.round((ahora - inicioMs.current) / 1000)),
        ...(extra.preguntaId ? { preguntaId: extra.preguntaId } : {}),
        ...(extra.duracionMs ? { duracionMs: extra.duracionMs } : {}),
        ...(extra.detalle ? { detalle: extra.detalle } : {}),
      });
      // Tope defensivo: una prueba muy larga con mucho movimiento no debe llenar
      // la memoria ni mandar megabytes de eventos.
      if (cola.current.length > 400) cola.current = cola.current.slice(-400);
    },
    [],
  );

  const tomarEventos = useCallback((): EventoEnviado[] => {
    const lote = cola.current;
    cola.current = [];
    return lote;
  }, []);

  /* ------------------------------ Suscripciones ---------------------------- */

  useEffect(() => {
    registrar("inicio");

    const alCambiarVisibilidad = () => {
      if (!politica.registrarCambioPestana) return;
      if (document.hidden) {
        ocultaDesde.current = Date.now();
        return;
      }
      const desde = ocultaDesde.current;
      ocultaDesde.current = null;
      if (desde === null) return;
      const duracionMs = Date.now() - desde;
      const segundos = Math.round(duracionMs / 1000);
      registrar(segundos >= AUSENCIA_PROLONGADA_SEGUNDOS ? "ausencia_prolongada" : "pestana_oculta", {
        duracionMs,
        detalle: { segundos },
      });
      registrar("pestana_visible");
    };

    const alPerderFoco = () => {
      if (!politica.registrarCambioPestana) return;
      sinFocoDesde.current = Date.now();
    };

    const alRecuperarFoco = () => {
      if (!politica.registrarCambioPestana) return;
      const desde = sinFocoDesde.current;
      sinFocoDesde.current = null;
      if (desde === null) return;
      const duracionMs = Date.now() - desde;
      // Un parpadeo de foco (cambiar de campo, abrir un desplegable) no es un
      // evento: solo se anota si duró algo.
      if (duracionMs < 1500) return;
      registrar("foco_perdido", { duracionMs, detalle: { segundos: Math.round(duracionMs / 1000) } });
      registrar("foco_recuperado");
    };

    const alCopiar = () => {
      if (politica.registrarCopiaPegado) registrar("copiar");
    };
    const alCortar = () => {
      if (politica.registrarCopiaPegado) registrar("cortar");
    };
    const alMenuContextual = (evento: MouseEvent) => {
      registrar("menu_contextual");
      if (politica.bloquearMenuContextual) evento.preventDefault();
    };
    const alImprimir = () => registrar("impresion");
    const alRedimensionar = () => {
      registrar("ventana_redimensionada", {
        detalle: { ancho: window.innerWidth, alto: window.innerHeight },
      });
    };
    const alPantallaCompleta = () => {
      registrar(document.fullscreenElement ? "pantalla_completa_on" : "pantalla_completa_off");
    };
    const alSalir = (evento: BeforeUnloadEvent) => {
      registrar("salida_intentada");
      if (politica.avisarAlSalir) {
        evento.preventDefault();
        evento.returnValue = "";
      }
    };
    const alTeclado = (evento: KeyboardEvent) => {
      ultimaActividad.current = Date.now();
      // Combinaciones habituales de captura de pantalla. Detectarlas no las impide
      // (el navegador no puede), pero deja constancia.
      if (evento.key === "PrintScreen" || (evento.metaKey && evento.shiftKey && /[34567]/.test(evento.key))) {
        registrar("captura_sospechosa");
      }
    };
    const alMover = () => {
      ultimaActividad.current = Date.now();
    };

    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    window.addEventListener("blur", alPerderFoco);
    window.addEventListener("focus", alRecuperarFoco);
    document.addEventListener("copy", alCopiar);
    document.addEventListener("cut", alCortar);
    document.addEventListener("contextmenu", alMenuContextual);
    window.addEventListener("beforeprint", alImprimir);
    window.addEventListener("resize", alRedimensionar);
    document.addEventListener("fullscreenchange", alPantallaCompleta);
    window.addEventListener("beforeunload", alSalir);
    document.addEventListener("keydown", alTeclado);
    document.addEventListener("mousemove", alMover);

    const vigilante = setInterval(() => {
      if (!politica.registrarTiempos) return;
      const quieto = Math.round((Date.now() - ultimaActividad.current) / 1000);
      if (quieto >= INACTIVIDAD_SEGUNDOS) {
        registrar("inactividad", { detalle: { segundos: quieto } });
        ultimaActividad.current = Date.now();
      }
    }, 30000);

    return () => {
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.removeEventListener("blur", alPerderFoco);
      window.removeEventListener("focus", alRecuperarFoco);
      document.removeEventListener("copy", alCopiar);
      document.removeEventListener("cut", alCortar);
      document.removeEventListener("contextmenu", alMenuContextual);
      window.removeEventListener("beforeprint", alImprimir);
      window.removeEventListener("resize", alRedimensionar);
      document.removeEventListener("fullscreenchange", alPantallaCompleta);
      window.removeEventListener("beforeunload", alSalir);
      document.removeEventListener("keydown", alTeclado);
      document.removeEventListener("mousemove", alMover);
      clearInterval(vigilante);
    };
  }, [politica, registrar]);

  return { registrar, tomarEventos };
}

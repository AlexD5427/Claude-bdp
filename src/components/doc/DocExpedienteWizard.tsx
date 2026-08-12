/**
 * Asistente de captura y edicion de un expediente documental.
 *
 * Recorre las secciones acordadas (datos generales, documentos generales, tipo
 * de funcionario, tipo de garantia solo en la rama comercial, requisitos
 * especiales y revision) conservando el estado al ir y volver. La validacion de
 * aqui es de cortesia para dar respuesta inmediata; la autoridad final es el
 * backend, que revalida todo antes de escribir.
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import "./doc-expediente.css";
import {
  cargarOpcionesAuxiliar,
  estadoDe,
  invalidarAuxiliar,
  OPCIONES_VACIAS,
  type OpcionesAuxiliar,
} from "../../lib/doc/docAuxiliar";
import {
  DOC_ESTADO_GENERAL_LABEL,
  requisitosEspeciales,
  requisitosGenerales,
  type DocEstado,
  type RequisitoDef,
  type TipoFuncionario,
  type TipoGarantia,
} from "../../lib/doc/docCatalog";
import {
  avisosGenerales,
  borradorVacio,
  borrarBorrador,
  codigosDeOtrasGarantias,
  conCampo,
  conGarantia,
  conTipoFuncionario,
  conValor,
  estadoGeneral,
  guardarBorrador,
  leerBorrador,
  primeraSeccionIncompleta,
  puedeGuardar,
  resumenDe,
  SECCION_DESCRIPCION,
  SECCION_TITULO,
  seccionCompleta,
  seccionesActivas,
  validarSeccion,
  valorDe,
  type BorradorExpediente,
  type ErroresCampo,
  type SeccionId,
  type ValorRequisito,
} from "../../lib/doc/docBorrador";
import { analizarIdentificador } from "../../lib/doc/docIdentificador";
import { DocGarantiaSelector } from "./DocGarantiaSelector";
import { DocRequisitoCard } from "./DocRequisitoCard";
import { DocSelectorCatalogo } from "./DocSelectorCatalogo";
import { DocTipoFuncionario } from "./DocTipoFuncionario";
import { IconoAlerta, IconoFlechaDerecha, IconoFlechaIzquierda, IconoGuardar } from "./DocIconos";

/** Retardo del autoguardado del borrador. */
const RETARDO_BORRADOR = 900;

type Filtro = "todos" | "faltantes" | "observados" | "resueltos";

const FILTRO_ETIQUETA: Record<Filtro, string> = {
  todos: "Todos",
  faltantes: "Solo pendientes",
  observados: "Solo no entregados",
  resueltos: "Solo resueltos",
};

function pasaFiltro(estado: DocEstado, filtro: Filtro): boolean {
  switch (filtro) {
    case "faltantes":
      return estado === "PENDIENTE";
    case "observados":
      return estado === "NO_ENTREGADO";
    case "resueltos":
      return estado === "ENTREGADO" || estado === "NO_APLICA";
    default:
      return true;
  }
}

/** Agrupa por el encabezado de contexto del catalogo, conservando el orden. */
function agrupar(requisitos: RequisitoDef[]): Array<{ contexto: string; items: RequisitoDef[] }> {
  const grupos: Array<{ contexto: string; items: RequisitoDef[] }> = [];
  for (const req of requisitos) {
    const contexto = req.contexto ?? "";
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.contexto === contexto) ultimo.items.push(req);
    else grupos.push({ contexto, items: [req] });
  }
  return grupos;
}

export interface DocExpedienteWizardProps {
  /**
   * Persiste el expediente. Recibe la clave de idempotencia para que un
   * reintento tras un fallo de red no cree un segundo expediente.
   */
  onGuardar: (borrador: BorradorExpediente, claveIdempotencia: string) => Promise<void>;
  onCancelar: () => void;
  /** Expediente existente cuando se abre en modo edicion. */
  inicial?: BorradorExpediente | null;
  /** Comprueba si el identificador ya existe. Debe ser sincrono y barato. */
  identificadorExistente?: (identificador: string) => boolean;
  onAbrirExistente?: (identificador: string) => void;
  hoy?: Date;
}

export function DocExpedienteWizard({
  onGuardar,
  onCancelar,
  inicial = null,
  identificadorExistente,
  onAbrirExistente,
  hoy,
}: DocExpedienteWizardProps) {
  const [borrador, setBorrador] = useState<BorradorExpediente>(() => inicial ?? borradorVacio());
  const [seccion, setSeccion] = useState<SeccionId>("generales");
  const [intentadas, setIntentadas] = useState<Record<string, boolean>>({});
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  const [recuperable, setRecuperable] = useState<BorradorExpediente | null>(null);

  const [opciones, setOpciones] = useState<OpcionesAuxiliar | null>(null);
  const [cargandoOpciones, setCargandoOpciones] = useState(false);
  const [recarga, setRecarga] = useState(0);

  // La clave sobrevive a los reintentos: el backend descarta el duplicado.
  const clave = useRef<string>(
    `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  );
  const temporizador = useRef<number | null>(null);
  const edicion = inicial !== null;

  /* ---------------- Catalogos de la hoja Auxiliar ---------------- */

  useEffect(() => {
    let vivo = true;
    setCargandoOpciones(true);
    cargarOpcionesAuxiliar(recarga > 0)
      .then((datos) => {
        if (vivo) setOpciones(datos);
      })
      .catch(() => {
        if (vivo) setOpciones(OPCIONES_VACIAS);
      })
      .finally(() => {
        if (vivo) setCargandoOpciones(false);
      });
    return () => {
      vivo = false;
    };
  }, [recarga]);

  /* ---------------- Borrador recuperable ---------------- */

  useEffect(() => {
    if (edicion) return;
    const previo = leerBorrador();
    if (previo && (previo.identificador.trim() || previo.nombre.trim())) {
      setRecuperable(previo);
    }
  }, [edicion]);

  /* ---------------- Autoguardado con retardo ---------------- */

  useEffect(() => {
    if (edicion) return;
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => {
      guardarBorrador(borrador);
      temporizador.current = null;
    }, RETARDO_BORRADOR);
    return () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    };
  }, [borrador, edicion]);

  /* ---------------- Derivados ---------------- */

  const secciones = useMemo(() => seccionesActivas(borrador), [borrador]);
  const resumen = useMemo(() => resumenDe(borrador, hoy ?? new Date()), [borrador, hoy]);
  const generales = useMemo(() => requisitosGenerales(), []);
  const especiales = useMemo(
    () => requisitosEspeciales(borrador.tipoFuncionario, borrador.tipoGarantia),
    [borrador.tipoFuncionario, borrador.tipoGarantia],
  );

  const erroresSeccion: ErroresCampo = validarSeccion(borrador, seccion);
  const mostrar = intentadas[seccion] === true;
  const errores: ErroresCampo = mostrar ? erroresSeccion : {};

  const analisis = analizarIdentificador(borrador.identificador);
  const duplicado =
    analisis.ok && identificadorExistente ? identificadorExistente(analisis.normalizado) : false;

  const avisos = useMemo(
    () =>
      avisosGenerales(borrador, {
        agencias: opciones?.agencias ?? [],
        gerencias: opciones?.gerencias ?? [],
      }),
    [borrador, opciones],
  );

  const indiceActual = Math.max(0, secciones.indexOf(seccion));
  const esUltima = indiceActual === secciones.length - 1;

  /* ---------------- Acciones ---------------- */

  function marcarIntento(id: SeccionId) {
    setIntentadas((previo) => ({ ...previo, [id]: true }));
  }

  function irA(destino: SeccionId) {
    setSeccion(destino);
    setFallo(null);
  }

  function siguiente() {
    marcarIntento(seccion);
    if (Object.keys(erroresSeccion).length > 0) return;
    const destino = secciones[indiceActual + 1];
    if (destino) irA(destino);
  }

  function anterior() {
    const destino = secciones[indiceActual - 1];
    if (destino) irA(destino);
  }

  function cambiarValor(codigo: string, parcial: Partial<ValorRequisito>) {
    setBorrador((previo) => conValor(previo, codigo, parcial));
  }

  function cambiarTipo(tipo: TipoFuncionario) {
    setBorrador((previo) => conTipoFuncionario(previo, tipo));
  }

  function cambiarGarantia(tipo: TipoGarantia) {
    setBorrador((previo) => conGarantia(previo, tipo));
  }

  async function guardar() {
    marcarIntento("revision");
    if (guardando) return;
    if (!puedeGuardar(borrador) || duplicado) {
      const destino = primeraSeccionIncompleta(borrador);
      if (destino) {
        marcarIntento(destino);
        irA(destino);
      }
      return;
    }
    setGuardando(true);
    setFallo(null);
    try {
      await onGuardar(borrador, clave.current);
      if (!edicion) borrarBorrador();
    } catch (error) {
      const mensaje =
        error instanceof Error && error.message
          ? error.message
          : "No se pudo guardar el expediente. Sus datos siguen en pantalla; puede reintentar.";
      setFallo(mensaje);
    } finally {
      setGuardando(false);
    }
  }

  function descartar() {
    if (!edicion) borrarBorrador();
    setConfirmandoSalida(false);
    onCancelar();
  }

  /* ---------------- Fragmentos de interfaz ---------------- */

  function listaRequisitos(requisitos: RequisitoDef[], desde: number) {
    const visibles = requisitos.filter((req) =>
      pasaFiltro(valorDe(borrador, req.codigo).estado, filtro),
    );

    if (visibles.length === 0) {
      return (
        <p className="doc-vacio">
          Ningun requisito coincide con el filtro «{FILTRO_ETIQUETA[filtro]}».
        </p>
      );
    }

    return (
      <div className="doc-bloque">
        {visibles.map((req) => (
          <DocRequisitoCard
            key={req.codigo}
            requisito={req}
            numero={desde + requisitos.indexOf(req)}
            valor={valorDe(borrador, req.codigo)}
            onChange={(parcial) => cambiarValor(req.codigo, parcial)}
            hoy={hoy}
          />
        ))}
      </div>
    );
  }

  function selectorFiltro() {
    return (
      <div className="doc-grupo">
        <label className="doc-etiqueta" htmlFor="doc-filtro">
          Mostrar
        </label>
        <select
          id="doc-filtro"
          className="doc-campo doc-campo--select"
          value={filtro}
          onChange={(evento: ChangeEvent<HTMLSelectElement>) =>
            setFiltro(evento.target.value as Filtro)
          }
        >
          {(Object.keys(FILTRO_ETIQUETA) as Filtro[]).map((clave2) => (
            <option key={clave2} value={clave2}>
              {FILTRO_ETIQUETA[clave2]}
            </option>
          ))}
        </select>
      </div>
    );
  }

  function panelGenerales() {
    return (
      <div className="doc-rejilla">
        <div className="doc-grupo">
          <label className="doc-etiqueta" htmlFor="doc-identificador">
            Identificador<span className="doc-obligatorio" aria-hidden="true"> *</span>
          </label>
          <input
            id="doc-identificador"
            className="doc-campo"
            type="text"
            value={borrador.identificador}
            autoComplete="off"
            placeholder="8456872 - 105 - 2026"
            aria-invalid={errores.identificador || duplicado ? true : undefined}
            aria-describedby="doc-identificador-ayuda"
            onChange={(evento: ChangeEvent<HTMLInputElement>) =>
              setBorrador((previo) => conCampo(previo, "identificador", evento.target.value))
            }
          />
          <p className="doc-ayuda" id="doc-identificador-ayuda">
            Formato CI - Nro Proceso - Anio. El carnet puede llevar guiones.
            {analisis.partes
              ? ` Se leyo CI ${analisis.partes.ci}, proceso ${analisis.partes.proceso}, anio ${analisis.partes.anio}.`
              : ""}
          </p>
          {errores.identificador ? (
            <p className="doc-error" role="alert">
              {errores.identificador}
            </p>
          ) : null}
          {duplicado ? (
            <p className="doc-aviso doc-aviso--warn" role="alert">
              <IconoAlerta className="doc-aviso__icono" />
              <span>Ya existe un expediente con este identificador.</span>
              {onAbrirExistente ? (
                <button
                  type="button"
                  className="doc-boton doc-boton--suave"
                  onClick={() => onAbrirExistente(analisis.normalizado)}
                >
                  Abrir el existente
                </button>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="doc-grupo">
          <label className="doc-etiqueta" htmlFor="doc-nombre">
            Nombre<span className="doc-obligatorio" aria-hidden="true"> *</span>
          </label>
          <input
            id="doc-nombre"
            className="doc-campo"
            type="text"
            value={borrador.nombre}
            aria-invalid={errores.nombre ? true : undefined}
            onChange={(evento: ChangeEvent<HTMLInputElement>) =>
              setBorrador((previo) => conCampo(previo, "nombre", evento.target.value))
            }
          />
          {errores.nombre ? (
            <p className="doc-error" role="alert">
              {errores.nombre}
            </p>
          ) : null}
        </div>

        <div className="doc-grupo">
          <label className="doc-etiqueta" htmlFor="doc-cargo">
            Cargo<span className="doc-obligatorio" aria-hidden="true"> *</span>
          </label>
          <input
            id="doc-cargo"
            className="doc-campo"
            type="text"
            value={borrador.cargo}
            aria-invalid={errores.cargo ? true : undefined}
            onChange={(evento: ChangeEvent<HTMLInputElement>) =>
              setBorrador((previo) => conCampo(previo, "cargo", evento.target.value))
            }
          />
          {errores.cargo ? (
            <p className="doc-error" role="alert">
              {errores.cargo}
            </p>
          ) : null}
        </div>

        <DocSelectorCatalogo
          id="doc-agencia"
          etiqueta="Agencia"
          valor={borrador.agencia}
          opciones={opciones?.agencias ?? []}
          estado={estadoDe(opciones, cargandoOpciones, "agencias")}
          requerido
          error={errores.agencia}
          onChange={(valor) => setBorrador((previo) => conCampo(previo, "agencia", valor))}
          onReintentar={() => {
            invalidarAuxiliar();
            setRecarga((n) => n + 1);
          }}
        />

        <DocSelectorCatalogo
          id="doc-gerencia"
          etiqueta="Gerencia"
          valor={borrador.gerencia}
          opciones={opciones?.gerencias ?? []}
          estado={estadoDe(opciones, cargandoOpciones, "gerencias")}
          requerido
          error={errores.gerencia}
          onChange={(valor) => setBorrador((previo) => conCampo(previo, "gerencia", valor))}
          onReintentar={() => {
            invalidarAuxiliar();
            setRecarga((n) => n + 1);
          }}
        />

        <div className="doc-grupo">
          <label className="doc-etiqueta" htmlFor="doc-fecha">
            Fecha de ingreso<span className="doc-obligatorio" aria-hidden="true"> *</span>
          </label>
          <input
            id="doc-fecha"
            className="doc-campo doc-campo--fecha"
            type="date"
            value={borrador.fechaIngreso}
            aria-invalid={errores.fechaIngreso ? true : undefined}
            onChange={(evento: ChangeEvent<HTMLInputElement>) =>
              setBorrador((previo) => conCampo(previo, "fechaIngreso", evento.target.value))
            }
          />
          {errores.fechaIngreso ? (
            <p className="doc-error" role="alert">
              {errores.fechaIngreso}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  function panelEspeciales() {
    if (!borrador.tipoFuncionario) {
      return <p className="doc-vacio">Elija primero el tipo de funcionario.</p>;
    }
    if (especiales.length === 0) {
      return (
        <p className="doc-vacio">
          Esta rama no anade requisitos especiales. Puede continuar a la revision.
        </p>
      );
    }
    return (
      <>
        {selectorFiltro()}
        {agrupar(especiales).map((grupo, indiceGrupo) => (
          <section className="doc-bloque" key={grupo.contexto || `grupo-${indiceGrupo}`}>
            {grupo.contexto ? (
              <h3 className="doc-bloque__titulo">{grupo.contexto}</h3>
            ) : null}
            {grupo.items
              .filter((req) => pasaFiltro(valorDe(borrador, req.codigo).estado, filtro))
              .map((req) => (
                <DocRequisitoCard
                  key={req.codigo}
                  requisito={req}
                  numero={grupo.items.indexOf(req) + 1}
                  valor={valorDe(borrador, req.codigo)}
                  onChange={(parcial) => cambiarValor(req.codigo, parcial)}
                  hoy={hoy}
                />
              ))}
          </section>
        ))}
      </>
    );
  }

  function panelRevision() {
    const faltantes = Object.values(validarSeccion(borrador, "revision"));
    const general = estadoGeneral(borrador, { borrador: !edicion }, hoy ?? new Date());

    return (
      <>
        <div className="doc-resumen">
          <div className="doc-resumen__dato">
            <span className="doc-resumen__valor">{resumen.porcentajeResuelto}%</span>
            <span className="doc-resumen__rotulo">Resuelto</span>
          </div>
          <div className="doc-resumen__dato">
            <span className="doc-resumen__valor">{resumen.totalAplicable}</span>
            <span className="doc-resumen__rotulo">Aplicables</span>
          </div>
          <div className="doc-resumen__dato">
            <span className="doc-resumen__valor">{resumen.entregados}</span>
            <span className="doc-resumen__rotulo">Entregados</span>
          </div>
          <div className="doc-resumen__dato">
            <span className="doc-resumen__valor">{resumen.pendientes}</span>
            <span className="doc-resumen__rotulo">Pendientes</span>
          </div>
          <div className="doc-resumen__dato">
            <span className="doc-resumen__valor">{resumen.noEntregados}</span>
            <span className="doc-resumen__rotulo">No entregados</span>
          </div>
          <div className="doc-resumen__dato">
            <span className="doc-resumen__valor">{resumen.noAplica}</span>
            <span className="doc-resumen__rotulo">N/A</span>
          </div>
          <div className="doc-resumen__dato">
            <span className="doc-resumen__valor">{resumen.conProrroga}</span>
            <span className="doc-resumen__rotulo">Con prorroga</span>
          </div>
          <div className="doc-resumen__dato">
            <span className="doc-resumen__valor">{resumen.prorrogasVencidas}</span>
            <span className="doc-resumen__rotulo">Prorrogas vencidas</span>
          </div>
        </div>

        <p className="doc-progreso__texto">
          Estado general: <strong>{DOC_ESTADO_GENERAL_LABEL[general]}</strong>
        </p>

        {avisos.length > 0 ? (
          <div className="doc-aviso doc-aviso--warn" role="status">
            <IconoAlerta className="doc-aviso__icono" />
            <span>{avisos.join(" ")}</span>
          </div>
        ) : null}

        {faltantes.length > 0 ? (
          <div className="doc-aviso doc-aviso--warn" role="alert">
            <IconoAlerta className="doc-aviso__icono" />
            <div>
              <p className="doc-confirmar__titulo">Falta completar antes de guardar</p>
              <ul className="doc-lista-errores">
                {faltantes.map((texto) => (
                  <li key={texto}>{texto}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="doc-ayuda">
            Todo lo obligatorio esta completo. Los requisitos pendientes no impiden guardar: el
            expediente queda abierto para seguir gestionandolos.
          </p>
        )}

        {fallo ? (
          <div className="doc-aviso doc-aviso--warn" role="alert">
            <IconoAlerta className="doc-aviso__icono" />
            <span>{fallo}</span>
          </div>
        ) : null}
      </>
    );
  }

  function panelActual() {
    switch (seccion) {
      case "generales":
        return panelGenerales();
      case "documentos":
        return (
          <>
            {selectorFiltro()}
            {listaRequisitos(generales, 1)}
          </>
        );
      case "tipo":
        return (
          <DocTipoFuncionario
            valor={borrador.tipoFuncionario}
            onChange={cambiarTipo}
            error={errores.tipoFuncionario}
          />
        );
      case "garantia":
        return (
          <DocGarantiaSelector
            valor={borrador.tipoGarantia}
            onChange={cambiarGarantia}
            contarArchivables={(destino) => codigosDeOtrasGarantias(borrador, destino).length}
            error={errores.tipoGarantia}
          />
        );
      case "especiales":
        return panelEspeciales();
      case "revision":
        return panelRevision();
      default:
        return null;
    }
  }

  /* ---------------- Render ---------------- */

  return (
    <div className="doc-asistente">
      {recuperable ? (
        <div className="doc-confirmar" role="alertdialog" aria-label="Borrador sin terminar">
          <p className="doc-confirmar__titulo">
            <IconoAlerta className="doc-confirmar__icono" />
            Hay un borrador sin terminar
          </p>
          <p className="doc-confirmar__texto">
            {recuperable.nombre.trim() || recuperable.identificador.trim() || "Sin identificar"} ·
            guardado el {new Date(recuperable.actualizadoEn).toLocaleString("es-BO")}.
          </p>
          <div className="doc-confirmar__acciones">
            <button
              type="button"
              className="doc-boton doc-boton--principal"
              onClick={() => {
                setBorrador(recuperable);
                setRecuperable(null);
              }}
            >
              Reanudar
            </button>
            <button
              type="button"
              className="doc-boton doc-boton--suave"
              onClick={() => {
                borrarBorrador();
                setRecuperable(null);
              }}
            >
              Empezar de cero
            </button>
          </div>
        </div>
      ) : null}

      <nav aria-label="Secciones del expediente">
        <ul className="doc-pasos">
          {secciones.map((id, indice) => {
            const completa = seccionCompleta(borrador, id);
            const clases = [
              "doc-paso",
              id === seccion ? "is-actual" : "",
              completa && id !== seccion ? "is-completo" : "",
            ]
              .filter((c) => c.length > 0)
              .join(" ");
            return (
              <li key={id}>
                <button
                  type="button"
                  className={clases}
                  aria-current={id === seccion ? "step" : undefined}
                  onClick={() => irA(id)}
                >
                  <span className="doc-paso__indice" aria-hidden="true">
                    {indice + 1}
                  </span>
                  {SECCION_TITULO[id]}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="doc-progreso">
        <div
          className="doc-progreso__barra"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={resumen.porcentajeResuelto}
          aria-label="Avance del expediente"
        >
          <div
            className="doc-progreso__relleno"
            style={{ width: `${resumen.porcentajeResuelto}%` }}
          />
        </div>
        <p className="doc-progreso__texto">
          {resumen.porcentajeResuelto}% resuelto · {resumen.entregados} de{" "}
          {resumen.totalAplicable} requisitos aplicables
        </p>
      </div>

      <section className="doc-panel" aria-labelledby="doc-panel-titulo">
        <header>
          <h2 className="doc-panel__titulo" id="doc-panel-titulo">
            {SECCION_TITULO[seccion]}
          </h2>
          <p className="doc-panel__descripcion">{SECCION_DESCRIPCION[seccion]}</p>
        </header>

        {panelActual()}
      </section>

      <div className="doc-acciones">
        <button
          type="button"
          className="doc-boton doc-boton--suave"
          disabled={indiceActual === 0}
          onClick={anterior}
        >
          <IconoFlechaIzquierda className="doc-boton__icono" />
          Anterior
        </button>

        {!edicion ? (
          <button
            type="button"
            className="doc-boton doc-boton--suave"
            onClick={() => guardarBorrador(borrador)}
          >
            Guardar borrador
          </button>
        ) : null}

        <span className="doc-acciones__separador" />

        <button
          type="button"
          className="doc-boton doc-boton--suave"
          onClick={() => setConfirmandoSalida(true)}
        >
          Cancelar
        </button>

        {esUltima ? (
          <button
            type="button"
            className="doc-boton doc-boton--principal"
            disabled={guardando}
            onClick={guardar}
          >
            <IconoGuardar className="doc-boton__icono" />
            {guardando ? "Guardando…" : "GUARDAR Y ABRIR EXPEDIENTE"}
          </button>
        ) : (
          <button type="button" className="doc-boton doc-boton--principal" onClick={siguiente}>
            Siguiente
            <IconoFlechaDerecha className="doc-boton__icono" />
          </button>
        )}
      </div>

      {confirmandoSalida ? (
        <div className="doc-confirmar" role="alertdialog" aria-label="Cancelar la captura">
          <p className="doc-confirmar__texto">
            {edicion
              ? "Se descartaran los cambios no guardados de este expediente."
              : "Se descartara el borrador y todo lo capturado hasta ahora."}
          </p>
          <div className="doc-confirmar__acciones">
            <button
              type="button"
              className="doc-boton doc-boton--suave"
              onClick={() => setConfirmandoSalida(false)}
            >
              Seguir editando
            </button>
            <button type="button" className="doc-boton doc-boton--peligro" onClick={descartar}>
              Descartar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DocExpedienteWizard;

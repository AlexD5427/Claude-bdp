/**
 * El enlace público: que abra en el equipo de otra persona.
 *
 * ── El fallo que estas pruebas fijan para siempre ───────────────────────────
 * El enlace era `…#/evaluacion/EV-XXXX-1234` y nada más. Quien lo abría resolvía
 * el backend leyendo SU navegador, y la configuración del módulo vive en
 * `localStorage`: el reclutador la tiene, un postulante no. Su navegador caía en
 * el modo demostración —almacén vacío— y contestaba «No existe ninguna
 * evaluación con ese código». El enlace servía para quien lo generaba y para
 * nadie más.
 *
 * Lo que se comprueba aquí:
 *
 *   1. el enlace lleva dentro la referencia del despliegue;
 *   2. esa referencia solo puede reconstruir direcciones de `script.google.com`
 *      —un parámetro manipulado no puede desviar los datos del postulante a un
 *      servidor ajeno—;
 *   3. la resolución respeta el orden enlace → compilación → navegador → nada, y
 *      NO cae en la demostración en silencio;
 *   4. la llave de administración nunca sale hacia un destino que impuso un
 *      enlace;
 *   5. un enlace de modo demostración se reconoce como no portátil, para poder
 *      advertirlo antes de enviarlo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leer } from "../api/transport";
import { DESPLIEGUE_POR_OMISION } from "../api/despliegue";
import {
  conexionEsDeEnlace,
  conexionStore,
  despliegueDeUrl,
  despliegueEnEnlace,
  diagnosticoEnlace,
  enlacePublico,
  fijarConexionDeEnlace,
  guardarConexion,
  hayConfiguracionGuardada,
  olvidarConexionDeEnlace,
  resolverConexionPublica,
  urlDeDespliegue,
} from "../api/connection";

const ID = "AKfycbz1234567890abcdefghijklmnopqrstuvwxyz";
const URL_EXEC = `https://script.google.com/macros/s/${ID}/exec`;
const CLAVE = "bdp-evaluaciones-conexion";

beforeEach(() => {
  window.localStorage.clear();
  olvidarConexionDeEnlace();
  conexionStore.set({ modo: "demostracion", url: "", llave: "", cliente: "cli_pruebas", verificadoEn: "" });
  window.localStorage.removeItem(CLAVE);
});

afterEach(() => {
  olvidarConexionDeEnlace();
  window.localStorage.clear();
});

describe("evaluaciones · referencia del despliegue", () => {
  it("extrae el identificador de una URL /exec normal", () => {
    expect(despliegueDeUrl(URL_EXEC)).toEqual({ id: ID, dominio: "" });
  });

  it("extrae dominio e identificador de un despliegue de Workspace", () => {
    const url = `https://script.google.com/a/macros/bdp.gob.bo/s/${ID}/exec`;
    expect(despliegueDeUrl(url)).toEqual({ id: ID, dominio: "bdp.gob.bo" });
  });

  it("no acepta nada que no sea un despliegue de Apps Script", () => {
    for (const url of [
      "",
      "no-una-url",
      "https://example.com/exec",
      `https://script.google.com/macros/s/${ID}/dev`,
      `http://script.google.com.malicioso.io/macros/s/${ID}/exec`,
      `https://script.googleusercontent.com/macros/s/${ID}/exec`,
    ]) {
      expect(despliegueDeUrl(url), url).toBeNull();
    }
  });

  it("reconstruye la URL, y SIEMPRE en script.google.com", () => {
    expect(urlDeDespliegue({ id: ID, dominio: "" })).toBe(URL_EXEC);
    expect(urlDeDespliegue({ id: ID, dominio: "bdp.gob.bo" })).toBe(
      `https://script.google.com/a/macros/bdp.gob.bo/s/${ID}/exec`,
    );
    // Basura dentro, cadena vacía fuera: nunca una URL a medio construir.
    expect(urlDeDespliegue({ id: "corto", dominio: "" })).toBe("");
    expect(urlDeDespliegue({ id: ID, dominio: "otro dominio con espacios" })).toBe("");
  });

  it("un identificador con caracteres extraños se rechaza al leer el enlace", () => {
    expect(despliegueEnEnlace("#/evaluacion/EV-1?b=../../etc/passwd")).toBeNull();
    expect(despliegueEnEnlace("#/evaluacion/EV-1?b=https://malo.io/x")).toBeNull();
    expect(despliegueEnEnlace(`#/evaluacion/EV-1?b=${ID}&bd=malo.io/x`)).toBeNull();
    expect(despliegueEnEnlace(`#/evaluacion/EV-1?b=${ID}`)).toEqual({ id: ID, dominio: "" });
  });
});

describe("evaluaciones · el enlace que se comparte", () => {
  it("con backend configurado, lleva la referencia dentro", () => {
    guardarConexion({ modo: "apps-script", url: URL_EXEC, llave: "llave" });
    const enlace = enlacePublico("EV-PRUE-38U5");
    expect(enlace).toContain("#/evaluacion/EV-PRUE-38U5");
    expect(enlace).toContain(`b=${ID}`);
    // Y lo que lleva dentro se puede volver a leer.
    expect(despliegueEnEnlace(enlace)).toEqual({ id: ID, dominio: "" });
  });

  it("en modo demostración se reconoce como NO portátil, con motivo y remedio", () => {
    guardarConexion({ modo: "demostracion", url: "", llave: "" });
    const d = diagnosticoEnlace("EV-PRUE-38U5");
    expect(d.portatil).toBe(false);
    expect(d.motivo).toMatch(/solo en este navegador|modo demostración/i);
    expect(d.remedio).toMatch(/Conexión/);
    // Se genera igualmente: sirve para probar en este equipo.
    expect(d.enlace).toContain("EV-PRUE-38U5");
    expect(d.enlace).not.toContain("b=");
  });

  it("con una dirección que no es un despliegue, avisa en lugar de fabricar un enlace muerto", () => {
    guardarConexion({ modo: "apps-script", url: "https://mi-proxy.interno/api/exec", llave: "" });
    const d = diagnosticoEnlace("EV-PRUE-38U5");
    expect(d.portatil).toBe(false);
    expect(d.motivo).toMatch(/despliegue de Apps Script/);
  });

  it("con backend configurado el enlace es portátil", () => {
    guardarConexion({ modo: "apps-script", url: URL_EXEC, llave: "" });
    expect(diagnosticoEnlace("EV-PRUE-38U5").portatil).toBe(true);
  });
});

describe("evaluaciones · de dónde sale el backend al abrir un enlace", () => {
  it("el enlace manda, aunque este navegador tenga otra configuración", () => {
    guardarConexion({ modo: "demostracion", url: "", llave: "secreta" });
    const otro = "AKfycbOTRODESPLIEGUE1234567890abcdefghijkl";
    const res = resolverConexionPublica(`#/evaluacion/EV-1?b=${otro}`);
    expect(res.origen).toBe("enlace");
    expect(res.conexion?.url).toBe(`https://script.google.com/macros/s/${otro}/exec`);
    // Y va sin llave: un enlace no puede sacar la llave de este navegador.
    expect(res.conexion?.llave).toBe("");
    expect(conexionEsDeEnlace()).toBe(true);
  });

  it("sin referencia en el enlace, usa la configuración de este navegador", () => {
    guardarConexion({ modo: "apps-script", url: URL_EXEC, llave: "secreta" });
    expect(hayConfiguracionGuardada()).toBe(true);
    const res = resolverConexionPublica("#/evaluacion/EV-1");
    expect(res.origen).toBe("navegador");
    expect(res.conexion?.url).toBe(URL_EXEC);
  });

  it("sin referencia y sin configuración, NO cae en la demostración: no devuelve nada", () => {
    // Es el caso del postulante con un enlace de la versión anterior. Antes se
    // resolvía contra el almacén local vacío y el mensaje era «no existe ninguna
    // evaluación con ese código», que manda a buscar el problema donde no está.
    expect(hayConfiguracionGuardada()).toBe(false);
    const res = resolverConexionPublica("#/evaluacion/EV-1", "EV-1");
    expect(res.origen).toBe("ninguno");
    expect(res.conexion).toBeNull();
  });

  it("pero si la evaluación SÍ está en la demostración de este navegador, se abre", () => {
    // Quien prueba el módulo sin configurar nada tiene que poder abrir su propio
    // enlace. Se abre, y el runner avisa de que es una vista local.
    window.localStorage.setItem(
      "bdp-evaluaciones-demo",
      JSON.stringify({ documentos: { ev_1: { evaluacion: { codigo: "EV-DEMO-1" } } } }),
    );
    const res = resolverConexionPublica("#/evaluacion/EV-DEMO-1", "EV-DEMO-1");
    expect(res.origen).toBe("demostracion");
    expect(res.conexion).not.toBeNull();
    // Y con otro código, no se inventa nada.
    expect(resolverConexionPublica("#/evaluacion/EV-OTRA-9", "EV-OTRA-9").origen).toBe("ninguno");
  });

  it("una referencia inválida no se acepta y se sigue buscando", () => {
    expect(resolverConexionPublica("#/evaluacion/EV-1?b=corto").origen).toBe("ninguno");
  });
});

describe("evaluaciones · la llave nunca viaja a un destino impuesto por un enlace", () => {
  it("fijar la conexión de un enlace la deja sin llave", () => {
    guardarConexion({ modo: "apps-script", url: URL_EXEC, llave: "llave-de-administracion" });
    expect(fijarConexionDeEnlace({ id: ID, dominio: "" })).toBe(true);
    expect(conexionEsDeEnlace()).toBe(true);
  });

  it("olvidarla devuelve la conexión del navegador", () => {
    guardarConexion({ modo: "apps-script", url: URL_EXEC, llave: "llave-de-administracion" });
    fijarConexionDeEnlace({ id: ID, dominio: "" });
    olvidarConexionDeEnlace();
    expect(conexionEsDeEnlace()).toBe(false);
  });
});

describe("evaluaciones · lo que sale por la red", () => {
  /** Cuerpos enviados en la última tanda de llamadas. */
  let cuerpos: Record<string, unknown>[] = [];

  beforeEach(() => {
    cuerpos = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      cuerpos.push(JSON.parse(String(init.body)));
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ ok: true, accion: "openAssessment", solicitudId: "", datos: {}, error: null, avisos: [], meta: {} }),
      } as unknown as Response;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("la llave NO viaja cuando el destino lo impuso un enlace público", async () => {
    guardarConexion({ modo: "apps-script", url: URL_EXEC, llave: "llave-de-administracion" });
    const otro = "AKfycbOTRODESPLIEGUE1234567890abcdefghijkl";
    resolverConexionPublica(`#/evaluacion/EV-1?b=${otro}`);

    await leer("openAssessment", { codigo: "EV-1" });

    expect(cuerpos).toHaveLength(1);
    expect(cuerpos[0].llaveAdmin).toBeUndefined();
    // Y se habló con el despliegue del enlace, no con el configurado.
    expect(conexionEsDeEnlace()).toBe(true);
  });

  it("la llave SÍ viaja en una acción administrativa normal", async () => {
    guardarConexion({ modo: "apps-script", url: URL_EXEC, llave: "llave-de-administracion" });
    await leer("listEvaluations", {});
    expect(cuerpos[0].llaveAdmin).toBe("llave-de-administracion");
  });

  it("la comprobación del enlace se hace sin llave y contra el despliegue del enlace", async () => {
    guardarConexion({ modo: "apps-script", url: URL_EXEC, llave: "llave-de-administracion" });
    await leer("openAssessment", { codigo: "EV-1" }, { conLlave: false, destino: { url: URL_EXEC } });
    expect(cuerpos[0].llaveAdmin).toBeUndefined();
  });
});

describe("evaluaciones · el respaldo del repositorio", () => {
  it("viene vacío, para que nadie herede el despliegue de otra instalación", () => {
    // Si algún día se rellena, será una decisión consciente de esa instalación.
    // Dejarlo escrito en el repositorio compartido apuntaría a los enlaces de una
    // instalación hacia el libro de otra.
    expect(DESPLIEGUE_POR_OMISION).toBe("");
  });
});

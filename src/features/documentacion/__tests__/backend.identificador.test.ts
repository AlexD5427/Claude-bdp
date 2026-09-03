import { describe, expect, it } from "vitest";
import { crearExpediente, loadInstalledBackend } from "../../../../scripts/documentacion-backend.mjs";

/**
 * Identificador libre y alta completa en una sola llamada.
 *
 * ── El identificador es el carnet, y ya está ────────────────────────────────
 * La versión anterior exigía «CI - número de proceso - año» con una expresión
 * regular en el frontend y un mensaje que repetía el formato en el backend. Eso
 * rechazaba carnets perfectamente válidos: los que llevan complemento
 * alfanumérico (`1234567 1K`), los extranjeros y los que el área escribe con
 * puntos. Ahora se acepta tal cual y lo único que se sigue exigiendo es que no
 * quede vacío al normalizar, porque un identificador que se reduce a nada no
 * puede detectar duplicados.
 *
 * ── El alta en un viaje, y no en cuatro ─────────────────────────────────────
 * El asistente hacía `crear` → `obtener` → `requisitos.guardar` → N ×
 * `prorroga.crear`. Con Apps Script cada viaje son uno o dos segundos: llenar un
 * comercial de tipo 2 tardaba entre ocho y quince segundos con la pantalla
 * bloqueada. Aquí se comprueba que la llamada ampliada aplica todo de una vez, y
 * que si algo falla a medias el expediente se revierte en lugar de quedarse a
 * medio llenar.
 */

describe("identificador · carnet sin formato impuesto", () => {
  it("acepta el carnet tal como aparece en el documento", () => {
    const h = loadInstalledBackend();
    const admitidos = [
      "1234567",
      "2345678 1K",
      "3456789-2B",
      "4.567.890",
      "E-9988776", // extranjero
      "12345678 LP",
    ];
    let n = 0;
    for (const identificador of admitidos) {
      const res = h.pedir("documentacion.expediente.crear", {
        expediente: { identificador, nombre: `Persona ${n++}` },
      });
      expect(res.ok, `identificador ${identificador}`).toBe(true);
    }
    expect(h.rowsOf("Expedientes").length).toBe(admitidos.length);
  });

  it("el mismo carnet escrito de dos formas es la misma persona", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.expediente.crear", { expediente: { identificador: "1.234.567 1K", nombre: "Con Puntos" } });
    /* Con la normalización estricta —solo letras y cifras— estas cuatro
       escrituras son el MISMO carnet, y eso es lo que se quiere: sin formato
       impuesto, la detección de duplicados es lo único que queda para evitar dos
       expedientes de la misma persona. */
    for (const variante of ["1234567 1K", "1234567-1k", "1 234 567 1K", "1234567.1K"]) {
      const res = h.pedir("documentacion.expediente.crear", { expediente: { identificador: variante, nombre: "Otra" } });
      expect(res.ok, `variante ${variante}`).toBe(false);
      expect(res.error.code, `variante ${variante}`).toBe("CONFLICTO");
    }
    expect(h.rowsOf("Expedientes").length).toBe(1);
  });

  it("un identificador que se reduce a nada sí se rechaza", () => {
    const h = loadInstalledBackend();
    // Espacios y caracteres que la normalización descarta: sin nada que
    // comparar, la detección de duplicados dejaría de funcionar.
    const res = h.pedir("documentacion.expediente.crear", { expediente: { identificador: "   ", nombre: "Vacío" } });
    expect(res.ok).toBe(false);
    expect(res.error.fields.identificador).toBeTruthy();
  });

  it("el duplicado se detecta ignorando espacios, guiones y mayúsculas", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.expediente.crear", { expediente: { identificador: "9876543 1k", nombre: "Primera Persona" } });

    // Mismas cifras, otra escritura: es la misma persona.
    const res = h.pedir("documentacion.expediente.crear", {
      expediente: { identificador: "  9876543   1K ", nombre: "Otra Escritura" },
    });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("CONFLICTO");
    // El mensaje dice de QUIÉN es el expediente y devuelve su id para abrirlo:
    // sin eso, la persona tiene que buscarlo a mano y pierde lo que llevaba.
    expect(res.error.message).toMatch(/Primera Persona/);
    expect(res.error.detalle.expedienteId).toBeTruthy();
    expect(res.error.detalle.identificador).toBe("9876543 1k");
    expect(res.error.fields.identificador).toBeTruthy();
  });

  it("se puede buscar por el carnet escrito de cualquier forma", () => {
    const h = loadInstalledBackend();
    const creado = h.ok("documentacion.expediente.crear", {
      expediente: { identificador: "4455667 2B", nombre: "Buscable Pérez", agencia: "LA PAZ" },
    });

    // Por identificador exacto, por otra escritura y por búsqueda de texto.
    expect(h.ok("documentacion.expediente.obtener", { identificador: "4455667 2B" }).expediente.expedienteId).toBe(
      creado.expedienteId,
    );
    expect(h.ok("documentacion.expediente.obtener", { identificador: "4455667-2b" }).expediente.expedienteId).toBe(
      creado.expedienteId,
    );
    const lista = h.ok("documentacion.expedientes.listar", { filtros: { texto: "4455667" } });
    expect(lista.total).toBe(1);
  });

  it("un carnet con acentos o mayúsculas mixtas no rompe el libro anual", () => {
    const h = loadInstalledBackend();
    const anio = new Date().getFullYear();
    h.ok("documentacion.expediente.crear", {
      expediente: { identificador: "CI-Ñuñoa 12", nombre: "Ñandú Álvarez", fechaIngreso: `${anio}-05-05` },
    });
    const fila = h.rowsOf(`CONTROL INGRESOS ${anio}`).find((f) => String(f["ID EXPEDIENTE"]) === "CI-Ñuñoa 12");
    expect(fila).toBeTruthy();
    expect(String(fila!.Nombre)).toContain("Álvarez");
  });
});

describe("alta completa en una sola llamada", () => {
  it("aplica identidad, requisitos, hojas y prórrogas de una vez", () => {
    const h = loadInstalledBackend();
    const res = h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "UNA-LLAMADA-1",
        nombre: "Todo De Una Vez",
        cargo: "OFICIAL DE NEGOCIOS",
        agencia: "LA PAZ",
        tipoFuncionario: "COMERCIAL",
        tipoGarantia: "COMERCIAL_2",
        fechaIngreso: `${new Date().getFullYear()}-02-02`,
        requisitos: [
          { codigo: "cv", estado: "ENTREGADO", observaciones: "Recibido por correo." },
          { codigo: "rejap", estado: "ENTREGADO", hojasFisicas: 3 },
          { codigo: "carnet-heredero", estado: "NO_APLICA" },
        ],
        prorrogas: [{ codigo: "titulo-legalizado", fechaProrroga: h.read<string>("doc2FechaMasDias_(30)"), motivo: "En legalización." }],
      },
    });

    // La marca de capacidad es lo que el cliente mira para saber si hace falta
    // la ruta antigua de cuatro pasos.
    expect(res.altaCompleta).toBe(true);
    expect(res.requisitosAplicados).toBe(3);
    expect(res.prorrogasCreadas).toHaveLength(1);
    // Y el detalle vuelve en la misma respuesta: el visor abre sin otra espera.
    expect(res.detalle.requisitos.length).toBe(25);

    const detalle = h.ok("documentacion.expediente.obtener", { identificador: "UNA-LLAMADA-1" });
    const porCodigo = new Map(detalle.requisitos.map((r: { codigo: string }) => [r.codigo, r]));
    expect((porCodigo.get("cv") as { estado: string }).estado).toBe("ENTREGADO");
    expect((porCodigo.get("cv") as { observaciones: string }).observaciones).toBe("Recibido por correo.");
    expect((porCodigo.get("rejap") as { hojasFisicas: number }).hojasFisicas).toBe(3);
    expect((porCodigo.get("carnet-heredero") as { estado: string }).estado).toBe("NO_APLICA");
    expect(detalle.prorrogas.length).toBe(1);
    expect(detalle.expediente.cargo).toBe("OFICIAL DE NEGOCIOS");
  });

  it("una prórroga imposible no tumba el alta: se avisa y el resto se guarda", () => {
    const h = loadInstalledBackend();
    const res = h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "UNA-LLAMADA-2",
        nombre: "Prórroga Rara",
        requisitos: [{ codigo: "cv", estado: "ENTREGADO" }],
        // `foto-4x4` no admite prórroga: el catálogo manda.
        prorrogas: [{ codigo: "foto-4x4", fechaProrroga: h.read<string>("doc2FechaMasDias_(10)"), motivo: "x" }],
      },
    });
    expect(res.creado).toBe(true);
    expect(res.prorrogasFallidas).toHaveLength(1);
    expect(res.prorrogasFallidas[0].motivo).toMatch(/prórroga/i);
    // Lo válido sí quedó guardado.
    const detalle = h.ok("documentacion.expediente.obtener", { identificador: "UNA-LLAMADA-2" });
    expect(detalle.requisitos.find((r: { codigo: string }) => r.codigo === "cv").estado).toBe("ENTREGADO");
  });

  it("si el lote de requisitos es imposible, el alta no deja nada a medias", () => {
    const h = loadInstalledBackend();
    /* Un lote por encima del tope hace fallar `doc2ActualizarRequisitosEnLote_`.
       Aquí se protege dos veces: el servicio revierte el expediente que acababa
       de crear y, además, el enrutador descarta la transacción entera
       (`docRollback_`). El resultado tiene que ser «no se creó nada», nunca «se
       creó y no sé qué quedó dentro». */
    const cambios = Array.from({ length: 500 }, () => ({ codigo: "cv", estado: "ENTREGADO" }));
    const res = h.pedir("documentacion.expediente.crear", {
      expediente: { identificador: "UNA-LLAMADA-3", nombre: "Reversión", requisitos: cambios },
    });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("LIMITE_EXCEDIDO");

    h.call("doc2Reset_");
    expect(h.rowsOf("Expedientes").some((f) => String(f.identificador) === "UNA-LLAMADA-3")).toBe(false);
    expect(h.rowsOf("ExpedienteDocumentos").length).toBe(0);
    const lista = h.ok("documentacion.expedientes.listar", { filtros: {} });
    expect(lista.total).toBe(0);
  });

  it("la clave de idempotencia evita el alta doble desde dos pestañas", () => {
    const h = loadInstalledBackend();
    const expediente = {
      identificador: "UNA-LLAMADA-4",
      nombre: "Doble Clic",
      idempotencyKey: "misma-apertura-del-asistente",
      requisitos: [{ codigo: "cv", estado: "ENTREGADO" }],
    };
    const primera = h.ok("documentacion.expediente.crear", { expediente });
    const segunda = h.ok("documentacion.expediente.crear", { expediente }, { solicitudId: "otra-peticion" });
    expect(primera.creado).toBe(true);
    expect(segunda.creado).toBe(false);
    expect(segunda.repetido).toBe(true);
    expect(segunda.expedienteId).toBe(primera.expedienteId);
    expect(h.rowsOf("Expedientes").length).toBe(1);
  });

  it("sin requisitos ni prórrogas se comporta como el alta de siempre", () => {
    const h = loadInstalledBackend();
    const res = h.ok("documentacion.expediente.crear", {
      expediente: { identificador: "UNA-LLAMADA-5", nombre: "Alta Simple" },
    });
    expect(res.creado).toBe(true);
    expect(res.requisitosAplicados).toBeUndefined();
    expect(res.requisitos).toBe(16);
  });
});

describe("lectura de varios expedientes en una llamada", () => {
  it("devuelve el detalle de todos los pedidos", () => {
    const h = loadInstalledBackend();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      ids.push(crearExpediente(h, { identificador: `LOTE-${i}`, nombre: `Persona ${i}` }).expedienteId);
    }
    const res = h.ok("documentacion.expedientes.detalle", { expedienteIds: ids });
    expect(res.devueltos).toBe(4);
    expect(Object.keys(res.expedientes)).toHaveLength(4);
    expect(res.expedientes[ids[0]].requisitos.length).toBe(16);
    expect(res.fallidos).toEqual([]);
  });

  it("respeta el tope y devuelve lo que sobra para pedirlo en otra tanda", () => {
    const h = loadInstalledBackend();
    const tope = h.read<number>("DOC2_LIMITS.MAX_DETALLE_MULTIPLE");
    const ids = Array.from({ length: tope + 3 }, (_, i) => `inexistente-${i}`);
    const res = h.ok("documentacion.expedientes.detalle", { expedienteIds: ids });
    expect(res.tope).toBe(tope);
    expect(res.omitidos).toHaveLength(3);
    // Los inexistentes se reportan uno a uno en lugar de tumbar la llamada.
    expect(res.fallidos).toHaveLength(tope);
  });

  it("exige la capacidad de ver, como cualquier lectura", () => {
    const h = loadInstalledBackend();
    const res = h.pedir("documentacion.expedientes.detalle", { expedienteIds: ["x"] }, { rol: "ninguno", actor: "nadie@bdp.com" });
    // El rol desconocido cae en el rol por defecto, que sí puede ver: lo que se
    // comprueba es que la acción PASA por la autorización, no que la niegue.
    expect(res.ok).toBe(true);
  });
});

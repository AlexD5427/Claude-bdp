/**
 * Mock del backend de Google Apps Script para las pruebas de QA.
 *
 * Reproduce el contrato que consume `TalentDataContext`: un GET que devuelve el
 * payload completo del libro y un POST que crea / actualiza filas. Se puede
 * poner en modo "fallo" para reproducir el equipo del usuario que reporta que
 * no puede registrar postulantes.
 */
import { createServer } from "node:http";

const state = {
  mode: "ok", // "ok" | "500" | "html" | "hang" | "reject"
  posts: [],
};

function competencias(pairs) {
  return JSON.stringify(
    pairs.map(([name, esperado, obtenido]) => ({
      name,
      esperado,
      obtenido,
      brecha: Math.min(0, Math.round((obtenido - esperado) * 10) / 10),
      ajuste: Math.min(100, Math.round((obtenido / esperado) * 100)),
    })),
  );
}

const candidatos = [
  {
    identificador: "8456872-105-2026",
    nombres: "Jorge Andrés",
    apellido_paterno: "Mendoza",
    apellido_materno: "Quiroga",
    edad: 34,
    departamento_residencia: "La Paz",
    localidad_residencia: "Sopocachi",
    estado_civil: "Casado/a",
    nivel_academico: "Licenciatura",
    carrera: "Ingeniería Comercial",
    trabaja_bdp: "Sí",
    cargo_bdp: "Analista de Crédito",
    nota_cap: 88,
    nota_curriculum: 78,
    nota_conocimiento: 90,
    nota_competencias: 85,
    perfil_disc: "D - Dominante",
    conocimientos_tecnicos: JSON.stringify([
      { nombre: "Análisis de estados financieros", nivel: "Alto", detalle: "Domina el análisis horizontal y vertical, ratios de liquidez y solvencia, y construye proyecciones de flujo de caja a cinco años con escenarios de sensibilidad." },
      { nombre: "Normativa ASFI", nivel: "Medio", detalle: "Conoce la recopilación de normas para servicios financieros y su aplicación a la cartera de crédito productivo." },
      { nombre: "Evaluación de riesgo crediticio", nivel: "Alto", detalle: "Construye matrices de riesgo y calibra scorings internos." },
    ]),
    herramientas: JSON.stringify([
      { nombre: "Excel avanzado", nivel: "Alto" },
      { nombre: "Power BI", nivel: "Medio" },
      { nombre: "SQL", nivel: "Bajo" },
    ]),
    competencias: competencias([
      ["Liderazgo", 80, 76],
      ["Comunicación efectiva", 75, 75],
      ["Orientación a resultados", 85, 70],
    ]),
    nivel_general_confiabilidad: "Confiable",
    nivel_integridad: "Riesgo Bajo",
    riesgo_robo: "Riesgo Bajo",
    riesgo_mentira: "Riesgo Medio",
    observaciones: "Disponibilidad inmediata, Requiere inducción normativa, Excelentes referencias",
  },
  {
    identificador: "7112334-105-2026",
    nombres: "Andrea",
    apellido_paterno: "Villarroel",
    apellido_materno: "Salinas",
    edad: 29,
    departamento_residencia: "Cochabamba",
    localidad_residencia: "Cercado",
    estado_civil: "Soltero/a",
    nivel_academico: "Licenciatura",
    carrera: "Administración de Empresas",
    trabaja_bdp: "No",
    cargo_bdp: "",
    nota_cap: 88,
    nota_curriculum: 78,
    nota_conocimiento: 90,
    nota_competencias: 79,
    perfil_disc: "I - Influyente",
    conocimientos_tecnicos: JSON.stringify([
      { nombre: "Gestión de procesos", nivel: "Alto", detalle: "Levanta y documenta procesos con BPMN." },
    ]),
    herramientas: JSON.stringify([{ nombre: "Bizagi", nivel: "Medio" }]),
    competencias: competencias([
      ["Liderazgo", 80, 68],
      ["Trabajo en equipo", 70, 70],
    ]),
    nivel_general_confiabilidad: "Confiabilidad Media",
    nivel_integridad: "Riesgo Medio",
    riesgo_robo: "Riesgo Bajo",
    riesgo_mentira: "Riesgo Bajo",
    observaciones: "Pretensión salarial por encima de la banda",
  },
  {
    identificador: "9008771-105-2026",
    nombres: "María Fernanda",
    apellido_paterno: "Ticona",
    apellido_materno: "",
    edad: 41,
    departamento_residencia: "Santa Cruz",
    localidad_residencia: "Equipetrol",
    estado_civil: "Divorciado/a",
    nivel_academico: "Técnico Superior",
    carrera: "Contabilidad",
    trabaja_bdp: "No",
    cargo_bdp: "",
    nota_cap: 88,
    nota_curriculum: 92,
    nota_conocimiento: 74,
    nota_competencias: 81,
    perfil_disc: "S - Estable",
    conocimientos_tecnicos: JSON.stringify([
      { nombre: "Tributación", nivel: "Alto", detalle: "IVA, IT, IUE y regímenes especiales." },
    ]),
    herramientas: JSON.stringify([{ nombre: "SIAT", nivel: "Alto" }]),
    competencias: competencias([["Comunicación efectiva", 75, 74]]),
    nivel_general_confiabilidad: "Confiable",
    nivel_integridad: "Riesgo Bajo",
    riesgo_robo: "Riesgo Bajo",
    riesgo_mentira: "Riesgo Bajo",
    observaciones: "",
  },
  {
    identificador: "5544332-106-2026",
    nombres: "Luis",
    apellido_paterno: "Paredes",
    apellido_materno: "Rocha",
    edad: 26,
    nivel_academico: "Egresado Técnico Superior",
    carrera: "Sistemas",
    trabaja_bdp: "No",
    nota_cap: 61,
    nota_curriculum: 55,
    nota_conocimiento: 64,
    nota_competencias: 60,
    perfil_disc: "C - Concienzudo",
    conocimientos_tecnicos: "",
    herramientas: "",
    competencias: "",
    nivel_general_confiabilidad: "No Confiable",
    nivel_integridad: "Riesgo Alto",
    riesgo_robo: "Riesgo Alto",
    riesgo_mentira: "Riesgo Alto",
    observaciones: "Antecedentes por verificar",
  },
  // Fila SIN identificador: reproduce el `cand-<index>` inestable.
  {
    identificador: "",
    nombres: "Registro",
    apellido_paterno: "Sin",
    apellido_materno: "Identificador",
    nota_cap: 70,
    perfil_disc: "N/A",
    conocimientos_tecnicos: "",
    herramientas: "",
    competencias: "",
  },
  // Identificador DUPLICADO del primero: reproduce las claves repetidas.
  {
    identificador: "8456872-105-2026",
    nombres: "Jorge Andrés (duplicado)",
    apellido_paterno: "Mendoza",
    apellido_materno: "Quiroga",
    nota_cap: 40,
    perfil_disc: "N/A",
    conocimientos_tecnicos: "",
    herramientas: "",
    competencias: "",
  },
];

function payload() {
  return {
    candidatos,
    competencias: [
      "Liderazgo,Bajo,Medio,Alto,Capacidad de guiar equipos",
      "Comunicación efectiva,Bajo,Medio,Alto,Transmite ideas con claridad",
      "Orientación a resultados,Bajo,Medio,Alto,Cumple metas",
      "Trabajo en equipo,Bajo,Medio,Alto,Colabora",
      "Pensamiento analítico,Bajo,Medio,Alto,Descompone problemas",
    ],
    arquetipos_disc: [
      "D - Dominante|Directo, decidido y orientado al resultado.",
      "I - Influyente|Sociable, persuasivo y entusiasta.",
      "S - Estable|Paciente, constante y colaborador.",
      "C - Concienzudo|Analítico, preciso y metódico.",
    ],
    auxiliares: {
      cargos_bdp: ["Analista de Crédito", "Analista de Riesgos", "Auxiliar Administrativo"],
      gerencias_bdp: ["Gerencia de Negocios", "Gerencia de Riesgos"],
      agencias_bdp: ["La Paz", "Santa Cruz"],
      modalidad_reclutamiento: ["Interna", "Externa"],
      estado_proceso: ["Abierto", "Cerrado"],
    },
    perfiles: [],
    perfiles_cargo: [],
    espejo_base: [],
    espejo_ultimo: [],
  };
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/__mode") {
    state.mode = url.searchParams.get("mode") ?? "ok";
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ mode: state.mode }));
    return;
  }
  if (url.pathname === "/__posts") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(state.posts));
    return;
  }

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if (state.mode === "hang") return; // never answers

  if (state.mode === "500") {
    res.writeHead(500, { ...cors, "Content-Type": "text/html" });
    res.end("<html><body>Error interno del script</body></html>");
    return;
  }
  if (state.mode === "html") {
    // Lo que devuelve Apps Script cuando el despliegue perdió permisos.
    res.writeHead(200, { ...cors, "Content-Type": "text/html" });
    res.end("<html><body>Se requiere autorización para ejecutar el script</body></html>");
    return;
  }

  if (req.method === "GET") {
    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify(payload()));
    return;
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { __unparsed: body };
    }
    state.posts.push(parsed);
    if (parsed && parsed.type === "perfil_login") {
      res.writeHead(200, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "success", perfil: {} }));
      return;
    }
    if (parsed && parsed.action === "update") {
      const id = String(parsed.identificador ?? "").trim();
      const row = candidatos.find((c) => String(c.identificador).trim() === id);
      if (row) Object.assign(row, parsed);
    } else if (parsed && parsed.identificador && !parsed.type) {
      candidatos.unshift({ ...parsed });
    }
    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "success", message: "OK" }));
  });
});

server.listen(8787, () => console.log("mock apps script en http://127.0.0.1:8787"));

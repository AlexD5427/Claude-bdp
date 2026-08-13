/**
 * Datos de prueba del arnés de QA.
 *
 * Imitan lo que devuelve el Apps Script de producción: campos "flojos" (números
 * como texto, JSON dentro de una celda, columnas ausentes) porque es exactamente
 * lo que una hoja de cálculo llenada a mano produce. El escenario `stress`
 * añade, encima, los casos que rompen la aplicación en la vida real:
 * identificadores repetidos, filas sin nombre y celdas con basura.
 */

const competencia = (name, esperado, obtenido) => ({
  name,
  esperado,
  obtenido,
  brecha: obtenido === null || esperado === null ? null : Math.min(0, Math.round((obtenido - esperado) * 10) / 10),
  ajuste:
    obtenido === null || esperado === null || esperado === 0
      ? null
      : Math.min(100, Math.round((obtenido / esperado) * 100)),
});

function candidato(over = {}) {
  return {
    identificador: "8456872-105-2026",
    nombres: "María Fernanda",
    apellido_paterno: "Quispe",
    apellido_materno: "Rojas",
    edad: "29",
    departamento_residencia: "La Paz",
    localidad_residencia: "Zona Sur",
    estado_civil: "Soltero/a",
    nivel_academico: "Licenciatura",
    carrera: "Ingeniería Comercial",
    trabaja_bdp: "No",
    cargo_bdp: "",
    nota_cap: "88",
    perfil_disc: "Impulsor (D)",
    nota_curriculum: "92",
    nota_conocimiento: "74",
    nota_competencias: "81",
    conocimientos_tecnicos: JSON.stringify([
      {
        nombre: "Análisis de crédito productivo",
        nivel: "Alto",
        detalle:
          "Evalúa carpetas de crédito rural con garantía no convencional y sustenta el dictamen ante comité. Domina el flujo de caja proyectado y la lectura de estados financieros de microempresa.",
      },
      { nombre: "Normativa ASFI", nivel: "Medio", detalle: "Recopilación de normas, libro 3." },
      { nombre: "Gestión de cartera en mora", nivel: "Medio" },
    ]),
    herramientas: JSON.stringify([
      { nombre: "Excel avanzado", nivel: "Alto" },
      { nombre: "Power BI", nivel: "Medio" },
      { nombre: "SAP FI", nivel: "Bajo" },
    ]),
    competencias: JSON.stringify([
      competencia("Orientación a resultados", 80, 78),
      competencia("Trabajo en equipo", 80, 84),
      competencia("Comunicación efectiva", 75, 60),
      competencia("Pensamiento analítico", 85, 85),
    ]),
    nivel_general_confiabilidad: "Confiable",
    nivel_integridad: "Riesgo Bajo",
    riesgo_robo: "Riesgo Bajo",
    riesgo_mentira: "Riesgo Medio",
    observaciones: "Disponibilidad inmediata, Requiere viajar a provincias, Referencias verificadas",
    ...over,
  };
}

const BASE = [
  candidato(),
  candidato({
    identificador: "9123456-105-2026",
    nombres: "Jorge Andrés",
    apellido_paterno: "Mamani",
    apellido_materno: "Choque",
    edad: 34,
    nota_cap: 88,
    nota_curriculum: 78,
    nota_conocimiento: 90,
    nota_competencias: 85,
    perfil_disc: "Analítico (C)",
    nivel_academico: "Técnico Superior",
    carrera: "Contaduría General",
    trabaja_bdp: "Sí",
    cargo_bdp: "Analista de Crédito",
    nivel_general_confiabilidad: "Confiabilidad Media",
    nivel_integridad: "Riesgo Medio",
    riesgo_robo: "Riesgo Bajo",
    riesgo_mentira: "Riesgo Bajo",
    observaciones: "Postuló en dos procesos anteriores",
    competencias: JSON.stringify([
      competencia("Orientación a resultados", 80, 88),
      competencia("Trabajo en equipo", 80, 70),
      competencia("Liderazgo de equipos", 90, 62),
    ]),
  }),
  candidato({
    identificador: "7788990-105-2026",
    nombres: "Andrea",
    apellido_paterno: "Vargas",
    apellido_materno: "",
    edad: "41",
    nota_cap: "88",
    nota_curriculum: "78",
    nota_conocimiento: "90",
    nota_competencias: "79",
    perfil_disc: "Estable (S)",
    observaciones: "",
    conocimientos_tecnicos: "",
    herramientas: "",
    competencias: "",
  }),
  candidato({
    identificador: "6655443-106-2026",
    nombres: "Luis Alberto",
    apellido_paterno: "Condori",
    apellido_materno: "Flores",
    nota_cap: "95",
    nota_curriculum: "88",
    nota_conocimiento: "91",
    nota_competencias: "93",
    perfil_disc: "Influyente (I)",
    nivel_general_confiabilidad: "No Confiable",
    nivel_integridad: "Riesgo Alto",
    riesgo_robo: "Riesgo Alto",
    riesgo_mentira: "Riesgo Alto",
  }),
  candidato({
    identificador: "5544332-106-2026",
    nombres: "Gabriela",
    apellido_paterno: "Suárez",
    apellido_materno: "Peña",
    nota_cap: "",
    nota_curriculum: "",
    nota_conocimiento: "",
    nota_competencias: "",
    perfil_disc: "N/A",
    nivel_general_confiabilidad: "",
    nivel_integridad: "",
    riesgo_robo: "",
    riesgo_mentira: "",
    observaciones: "",
    competencias: "[]",
  }),
];

/** Casos que sólo aparecen con datos reales de la hoja. */
const STRESS = [
  ...BASE,
  // Identificador repetido: dos personas distintas con la misma clave.
  candidato({
    identificador: "8456872-105-2026",
    nombres: "Rodrigo",
    apellido_paterno: "Ledezma",
    apellido_materno: "Ortiz",
    nota_cap: "71",
    nota_curriculum: "70",
    nota_conocimiento: "69",
    nota_competencias: "72",
    perfil_disc: "Impulsor (D)",
  }),
  // Fila sin identificador ni nombre (celda vaciada a mano en la hoja).
  candidato({
    identificador: "",
    nombres: "",
    apellido_paterno: "",
    apellido_materno: "",
    nota_cap: "60",
  }),
  // Segunda fila sin identificador: comparte el `cand-N` de respaldo.
  candidato({
    identificador: "   ",
    nombres: "Sin",
    apellido_paterno: "Clave",
    apellido_materno: "",
    nota_cap: "61",
  }),
  // Celdas con basura: JSON roto, números con coma, texto donde va un número.
  candidato({
    identificador: "1122334-107-2026",
    nombres: "Pedro",
    apellido_paterno: "Aliaga",
    apellido_materno: "Nina",
    edad: "treinta",
    nota_cap: "77,5",
    nota_curriculum: "n/d",
    nota_conocimiento: 0,
    nota_competencias: "80%",
    conocimientos_tecnicos: "{roto:",
    herramientas: "Excel, Word, Sistema propio",
    competencias: "no-es-json",
    observaciones: ",,,",
    perfil_disc: "",
  }),
];

const COMPETENCIAS = [
  "Orientación a resultados,60,80,100,Enfoca su trabajo al logro de metas",
  "Trabajo en equipo,60,80,100,Colabora y comparte información",
  "Comunicación efectiva,55,75,95,Transmite ideas con claridad",
  "Pensamiento analítico,65,85,100,Descompone problemas complejos",
  "Liderazgo de equipos,70,90,100,Guía y desarrolla a su equipo",
  "Adaptabilidad al cambio,60,80,100,Se ajusta a nuevos escenarios",
];

const ARQUETIPOS = [
  "Impulsor (D), Directo y decidido; busca resultados rápidos y asume el control.",
  "Influyente (I), Sociable y persuasivo; motiva al grupo y genera entusiasmo.",
  "Estable (S), Paciente y constante; sostiene el clima y la continuidad del equipo.",
  "Analítico (C), Preciso y prudente; trabaja con datos, normas y detalle.",
];

export function payload(scenario = "base") {
  const candidatos = scenario === "stress" ? STRESS : BASE;
  return {
    candidatos,
    competencias: COMPETENCIAS,
    arquetipos_disc: ARQUETIPOS,
    auxiliares: {
      cargos_bdp: ["Analista de Crédito", "Oficial de Negocios", "Auxiliar Administrativo"],
      gerencias_bdp: ["Gerencia de Negocios", "Gerencia de Operaciones"],
      agencias_bdp: ["Agencia Central", "Agencia El Alto"],
      modalidad_reclutamiento: ["Externa", "Interna"],
      estado_proceso: ["En curso", "Cerrado"],
    },
    perfiles: [],
    perfiles_cargo: [],
    espejo_base: [],
    espejo_ultimo: [],
  };
}

export { BASE, STRESS };

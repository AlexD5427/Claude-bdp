/**
 * Datos de prueba del arnés de QA.
 *
 * El libro real no se toca nunca desde las pruebas: este módulo reproduce la
 * *forma* exacta de la respuesta del backend de Apps Script (con sus rarezas
 * incluidas) para que el navegador ejercite el mismo código que en producción.
 *
 * Los casos límite están puestos a propósito, porque son los que rompen:
 *   · notas que llegan como texto ("88", "7,5") y notas ausentes,
 *   · `competencias` como cadena JSON, y una fila con JSON corrupto,
 *   · dos postulantes con el MISMO identificador (ocurre al cargar dos veces),
 *   · una fila sin identificador y sin nombres,
 *   · empates exactos de Nota CAP, que es lo que ejercita el desempate,
 *   · textos largos en conocimientos y observaciones.
 */

const comp = (name, esperado, obtenido) => ({ name, esperado, obtenido });

/** `competencias` viaja como cadena JSON, tal cual la escribe la hoja. */
const compJson = (entries) => JSON.stringify(entries);

export function candidatos() {
  return [
    {
      identificador: "5033853-163-2026",
      nombres: "Jorge Luis",
      apellido_paterno: "Mamani",
      apellido_materno: "Quispe",
      edad: 34,
      departamento_residencia: "La Paz",
      localidad_residencia: "El Alto",
      estado_civil: "Casado/a",
      nivel_academico: "Licenciatura",
      carrera: "Ingeniería Comercial",
      trabaja_bdp: "Sí",
      cargo_bdp: "Analista de Créditos",
      nota_cap: 88,
      perfil_disc: "Impulsor (D)",
      nota_curriculum: 78,
      nota_conocimiento: 90,
      nota_competencias: 85,
      conocimientos_tecnicos: JSON.stringify([
        {
          nombre: "Evaluación de riesgo crediticio",
          nivel: "Alto",
          detalle:
            "Maneja el ciclo completo de análisis: capacidad de pago, garantías, comité y seguimiento de mora temprana en cartera productiva.",
        },
        { nombre: "Normativa ASFI", nivel: "Medio", detalle: "Recopilación de normas, títulos I al VI." },
        { nombre: "Excel avanzado", nivel: "Alto" },
      ]),
      herramientas: JSON.stringify([
        { nombre: "Excel", nivel: "Alto" },
        { nombre: "Power BI", nivel: "Medio" },
      ]),
      competencias: compJson([
        comp("Trabajo en Equipo", 80, 76),
        comp("Orientación a Resultados", 85, 85),
        comp("Comunicación Efectiva", 75, 60),
      ]),
      nivel_general_confiabilidad: "Confiable",
      nivel_integridad: "Riesgo Bajo",
      riesgo_robo: "Riesgo Bajo",
      riesgo_mentira: "Riesgo Medio",
      observaciones:
        "Disponibilidad inmediata, Requiere inducción normativa, Excelente referencia del jefe anterior",
    },
    {
      // Mismo CAP que Jorge: fuerza el Índice de Desempate.
      identificador: "7841299-163-2026",
      nombres: "Andrea",
      apellido_paterno: "Villarroel",
      apellido_materno: "Sánchez",
      edad: "29",
      departamento_residencia: "Cochabamba",
      localidad_residencia: "Cercado",
      estado_civil: "Soltero/a",
      nivel_academico: "Egresado Técnico Superior",
      carrera: "Contaduría",
      trabaja_bdp: "No",
      cargo_bdp: "",
      nota_cap: "88",
      perfil_disc: "Analítico (C)",
      nota_curriculum: 78,
      nota_conocimiento: "90",
      nota_competencias: 79,
      conocimientos_tecnicos: JSON.stringify([
        { nombre: "Contabilidad general", nivel: "Alto" },
        { nombre: "Tributación", nivel: "Medio" },
      ]),
      herramientas: JSON.stringify([{ nombre: "SIAT", nivel: "Alto" }]),
      competencias: compJson([
        comp("Trabajo en Equipo", 80, 80),
        comp("Orientación a Resultados", 85, 70),
        comp("Adaptabilidad", 70, 68),
      ]),
      nivel_general_confiabilidad: "Confiabilidad Media",
      nivel_integridad: "Riesgo Medio",
      riesgo_robo: "Riesgo Bajo",
      riesgo_mentira: "Riesgo Bajo",
      observaciones: "Pendiente verificar referencias",
    },
    {
      identificador: "3390115-163-2026",
      nombres: "María Fernanda",
      apellido_paterno: "Cortez",
      apellido_materno: "",
      edad: 41,
      departamento_residencia: "Santa Cruz",
      localidad_residencia: "Warnes",
      estado_civil: "Divorciado/a",
      nivel_academico: "Licenciatura",
      carrera: "Psicología",
      trabaja_bdp: "no",
      nota_cap: 88,
      perfil_disc: "Estable (S)",
      nota_curriculum: 92,
      nota_conocimiento: 74,
      nota_competencias: 81,
      conocimientos_tecnicos: "Selección por competencias, Entrevista BEI",
      herramientas: "",
      competencias: compJson([comp("Comunicación Efectiva", 75, 75)]),
      nivel_general_confiabilidad: "Confiable",
      nivel_integridad: "Riesgo Bajo",
      riesgo_robo: "N/A",
      riesgo_mentira: "N/A",
      observaciones: "",
    },
    {
      identificador: "9982004-170-2026",
      nombres: "Pedro",
      apellido_paterno: "Rojas",
      apellido_materno: "Ergueta",
      edad: "",
      nivel_academico: "Bachiller",
      carrera: "",
      trabaja_bdp: "",
      nota_cap: "",
      perfil_disc: "N/A",
      nota_curriculum: "",
      nota_conocimiento: "",
      nota_competencias: "",
      // JSON corrupto: la fila NO debe romper el módulo.
      competencias: '[{"name":"Liderazgo","esperado":80,',
      conocimientos_tecnicos: "{malformado",
      herramientas: "[]",
      nivel_general_confiabilidad: "",
      nivel_integridad: "",
      riesgo_robo: "",
      riesgo_mentira: "",
      observaciones: "",
    },
    {
      // Identificador DUPLICADO (mismo que Jorge): ocurre cuando se carga la
      // misma ficha dos veces en la hoja.
      identificador: "5033853-163-2026",
      nombres: "Jorge Luis",
      apellido_paterno: "Mamani",
      apellido_materno: "Quispe",
      edad: 34,
      nivel_academico: "Licenciatura",
      carrera: "Ingeniería Comercial",
      trabaja_bdp: "Sí",
      cargo_bdp: "Analista de Créditos",
      nota_cap: 91,
      perfil_disc: "Impulsor (D)",
      nota_curriculum: 80,
      nota_conocimiento: 92,
      nota_competencias: 88,
      competencias: compJson([comp("Trabajo en Equipo", 80, 79)]),
      conocimientos_tecnicos: "[]",
      herramientas: "[]",
      nivel_general_confiabilidad: "Confiable",
      nivel_integridad: "Riesgo Bajo",
      riesgo_robo: "Riesgo Bajo",
      riesgo_mentira: "Riesgo Bajo",
      observaciones: "Registro duplicado en la hoja",
    },
    {
      // Sin identificador y sin nombre: el peor registro posible.
      identificador: "",
      nombres: "",
      apellido_paterno: "",
      apellido_materno: "",
      nota_cap: 55,
      competencias: "",
      conocimientos_tecnicos: "",
      herramientas: "",
      observaciones: "",
    },
  ];
}

export function payload(extra = {}) {
  return {
    candidatos: candidatos(),
    competencias: [
      "Trabajo en Equipo,60,75,90,Colabora y comparte información",
      "Orientación a Resultados,60,75,90,Cumple metas con calidad",
      "Comunicación Efectiva,60,75,90,Transmite ideas con claridad",
      "Adaptabilidad,60,75,90,Se ajusta a los cambios",
      "Liderazgo,60,75,90,Moviliza equipos",
    ],
    arquetipos_disc: [
      "Impulsor (D), Directo y orientado a la acción; decide rápido.",
      "Influyente (I), Sociable y persuasivo; motiva al equipo.",
      "Estable (S), Paciente y constante; sostiene el clima.",
      "Analítico (C), Preciso y metódico; cuida la norma.",
    ],
    auxiliares: {
      cargos_bdp: ["Analista de Créditos", "Oficial de Negocios", "Cajero", "Auditor Interno"],
      gerencias_bdp: ["Gerencia de Negocios", "Gerencia de Riesgos"],
      agencias_bdp: ["Central La Paz", "Sucursal Cochabamba"],
      modalidad_reclutamiento: ["Externa", "Interna"],
      estado_proceso: ["Abierto", "Cerrado"],
    },
    perfiles: [],
    perfiles_cargo: [],
    espejo_base: [],
    espejo_ultimo: [],
    ...extra,
  };
}

/**
 * Genera `n` postulantes sintéticos para probar la comparativa a tope de
 * columnas (tira congelada, ayudante de navegación, impresión a una hoja).
 */
export function relleno(n) {
  const nombres = ["Ana", "Luis", "Carla", "Diego", "Elena", "Fabio", "Gaby", "Hugo", "Iris", "Julio", "Karen", "Luca"];
  return Array.from({ length: n }, (_, i) => ({
    identificador: `100000${i}-200-2026`,
    nombres: nombres[i % nombres.length],
    apellido_paterno: `Apellido${i}`,
    apellido_materno: "",
    edad: 25 + (i % 20),
    nivel_academico: "Licenciatura",
    carrera: "Administración de Empresas",
    trabaja_bdp: i % 3 === 0 ? "Sí" : "No",
    cargo_bdp: i % 3 === 0 ? "Oficial de Negocios" : "",
    nota_cap: 60 + ((i * 7) % 40),
    perfil_disc: ["Impulsor (D)", "Influyente (I)", "Estable (S)", "Analítico (C)"][i % 4],
    nota_curriculum: 55 + ((i * 5) % 45),
    nota_conocimiento: 50 + ((i * 11) % 50),
    nota_competencias: 58 + ((i * 3) % 42),
    conocimientos_tecnicos: JSON.stringify([
      { nombre: "Atención al cliente", nivel: "Alto", detalle: "Cartera de 300 clientes en agencia." },
    ]),
    herramientas: JSON.stringify([{ nombre: "Excel", nivel: "Medio" }]),
    competencias: JSON.stringify([
      { name: "Trabajo en Equipo", esperado: 80, obtenido: 60 + (i % 30) },
      { name: "Orientación a Resultados", esperado: 85, obtenido: 55 + (i % 40) },
    ]),
    nivel_general_confiabilidad: i % 4 === 0 ? "No Confiable" : "Confiable",
    nivel_integridad: "Riesgo Bajo",
    riesgo_robo: "Riesgo Bajo",
    riesgo_mentira: "Riesgo Bajo",
    observaciones: "Referencias verificadas, Disponibilidad inmediata",
  }));
}

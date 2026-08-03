/**
 * 00_Manifest.gs — identidad y ESQUEMA DECLARATIVO del backend de Evaluaciones.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Este archivo es la fuente única de verdad del modelo de datos. Todo lo demás
 * se deriva de aquí:
 *
 *   · la instalación crea las hojas y los encabezados leyendo `EV_SCHEMA`;
 *   · la reparación añade lo que falte comparando la hoja con `EV_SCHEMA`;
 *   · el diagnóstico compara ambos y explica la diferencia;
 *   · la capa de almacenamiento convierte celda ↔ valor con el códec del tipo
 *     declarado en cada columna, así que ninguna lectura tiene que adivinar si
 *     un `TRUE` de la hoja es texto o booleano.
 *
 * Añadir un campo es añadir una entrada aquí y volver a ejecutar «Reparar».
 * Nadie tiene que tocar el resto del backend, y no hay dos listas de columnas
 * que puedan desincronizarse (ese era el defecto del backend anterior: los
 * encabezados vivían en un objeto y los tipos, implícitos, en cada mapeador).
 *
 * Tipos de columna admitidos (ver 04_Store.gs):
 *   id     identificador opaco               text   texto corto saneado
 *   long   texto largo (hasta el techo)      int    entero
 *   num    número decimal                    bool   TRUE/FALSE
 *   iso    marca de tiempo ISO-8601 UTC      json   JSON serializado
 *
 * NO uses este archivo para secretos: viven en Script Properties.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Identidad del backend. Se devuelve en cada respuesta (`meta.backend`). */
var EV_BACKEND = {
  name: 'evaluaciones',
  /** Versión del código. Súbela al cambiar el comportamiento observable. */
  version: '2.0.0',
  /** Versión del esquema de hojas. La instalación la graba en `_Meta`. */
  schemaVersion: 2,
  /** Versión del formato de los snapshots publicados. */
  snapshotVersion: 2,
  /** Versión del modelo de texto enriquecido (documentado en RICH_TEXT.md). */
  richTextVersion: 1
};

/** Nombres de las hojas. Se usan por constante, nunca por literal disperso. */
var EV_SHEET = {
  META: '_Meta',
  EVALUACIONES: 'Evaluaciones',
  SECCIONES: 'Secciones',
  PREGUNTAS: 'Preguntas',
  OPCIONES: 'Opciones',
  VERSIONES: 'Versiones',
  BLOQUES: 'VersionesBloques',
  INTENTOS: 'Intentos',
  RESPUESTAS: 'Respuestas',
  INTEGRIDAD: 'Integridad',
  SOLICITUDES: 'Solicitudes',
  AUDITORIA: 'Auditoria',
  REGISTRO: 'Registro',
  METRICAS: 'Metricas'
};

/** Claves de Script Properties reconocidas. */
var EV_PROP = {
  /** Id del libro. Vacío ⇒ se usa el libro contenedor del script. */
  SPREADSHEET_ID: 'EV_SPREADSHEET_ID',
  /**
   * Llave de administración. Si está definida, toda acción administrativa debe
   * enviarla. Si NO está definida, el backend funciona en modo abierto y lo
   * anuncia en `ping` y en el diagnóstico (nunca en silencio).
   */
  ADMIN_KEY: 'EV_ADMIN_KEY',
  /** Llave siguiente, para rotar sin cortar el servicio. */
  ADMIN_KEY_NEXT: 'EV_ADMIN_KEY_NEXT',
  /** Secreto con el que se firman los tokens de intento. Se genera al instalar. */
  ATTEMPT_SECRET: 'EV_ATTEMPT_SECRET',
  /** Nivel mínimo que llega a la hoja `Registro`: debug|info|warn|error. */
  LOG_LEVEL: 'EV_LOG_LEVEL',
  /** 'false' para no escribir métricas por acción. */
  METRICS_ENABLED: 'EV_METRICS_ENABLED',
  /** Zona horaria de referencia para los informes (informativa). */
  TIMEZONE: 'EV_TIMEZONE'
};

/** Límites, casi todos impuestos por la plataforma. */
var EV_LIMITS = {
  /** Techo duro de Google Sheets: 50 000 caracteres por celda. */
  CELL_CHARS: 50000,
  /**
   * Tamaño de cada bloque de snapshot. Deja margen sobre el techo de celda para
   * que el troceado nunca quede al borde.
   */
  SNAPSHOT_CHUNK_CHARS: 40000,
  /** Espera máxima del ScriptLock antes de responder BUSY. */
  LOCK_MS: 25000,
  /** Cuerpo POST máximo aceptado. */
  BODY_CHARS: 6000000,
  TEXT: 12000,
  SHORT_TEXT: 400,
  TITLE: 240,
  CODE: 40,
  SECTIONS: 100,
  QUESTIONS: 600,
  OPTIONS_PER_QUESTION: 100,
  ANSWERS_PER_ATTEMPT: 600,
  EVENTS_PER_REQUEST: 400,
  /** Eventos de integridad conservados por intento (los más antiguos se resumen). */
  EVENTS_PER_ATTEMPT: 2000,
  /** Filas de `Registro` conservadas; el mantenimiento poda por encima. */
  LOG_ROWS: 4000,
  /**
   * Margen (segundos) que el mantenimiento espera tras el límite antes de cerrar
   * un intento por su cuenta. No es una prórroga para el candidato: en cuanto se
   * pasa del límite el intento se marca como expirado. Este margen solo evita que
   * el barrido automático cierre un intento mientras su envío está viajando.
   */
  SWEEP_GRACE_SECONDS: 120,
  /** Intentos de inicio permitidos por código y minuto. */
  START_RATE_PER_MINUTE: 12,
  /** Vida del caché del payload público de una versión, en segundos. */
  PUBLIC_CACHE_SECONDS: 1800
};

/** Enumeraciones cerradas. El almacenamiento las valida al escribir. */
var EV_ENUM = {
  /** Estado del ciclo de vida. Único eje de estado: no hay dos que discrepen. */
  ESTADO: ['borrador', 'publicada', 'pausada', 'cerrada', 'archivada', 'papelera'],
  CATEGORIA: [
    'preseleccion', 'conocimientos', 'tecnica', 'numerica', 'situacional',
    'competencias', 'entrevista', 'caso', 'simulacion', 'desempeno', 'otra'
  ],
  NAVEGACION: ['libre', 'secuencial', 'una_por_pagina'],
  VISIBILIDAD_RESULTADO: ['nada', 'solo_envio', 'nota', 'nota_y_detalle'],
  CALIFICACION: ['automatica', 'pendiente_revision', 'revisada'],
  ESTADO_INTENTO: ['en_curso', 'enviado', 'expirado', 'abandonado', 'anulado'],
  ESTADO_VERSION: ['vigente', 'reemplazada'],
  MODO_PUNTAJE: ['ninguno', 'exacto', 'parcial', 'por_opcion', 'manual'],
  SEVERIDAD_EVENTO: ['info', 'aviso', 'alerta']
};

/**
 * ESQUEMA. Cada hoja declara su clave primaria y sus columnas en orden.
 *
 * `key` es el campo que identifica la fila. El número de fila NUNCA es identidad.
 */
var EV_SCHEMA = {
  _Meta: {
    key: 'clave',
    describe: 'Metadatos de instalación del backend.',
    columns: [
      { name: 'clave', type: 'text' },
      { name: 'valor', type: 'long' },
      { name: 'actualizado_en', type: 'iso' }
    ]
  },

  Evaluaciones: {
    key: 'id',
    describe: 'Una fila por evaluación. El borrador vive aquí; lo publicado, en Versiones.',
    columns: [
      { name: 'id', type: 'id' },
      { name: 'codigo', type: 'text' },
      { name: 'titulo', type: 'text' },
      { name: 'descripcion', type: 'long' },
      { name: 'categoria', type: 'text', enum: 'CATEGORIA' },
      { name: 'estado', type: 'text', enum: 'ESTADO' },
      { name: 'revision', type: 'int' },
      /**
       * Quién guardó por última vez y desde qué cliente. La detección de
       * conflictos usa el CLIENTE, no solo el número de revisión: guardar dos
       * veces desde la misma pestaña no es un conflicto, y el backend anterior
       * lo trataba como tal («otro usuario actualizó este registro»).
       */
      { name: 'ultimo_cliente', type: 'text' },
      { name: 'creado_en', type: 'iso' },
      { name: 'creado_por', type: 'text' },
      { name: 'actualizado_en', type: 'iso' },
      { name: 'actualizado_por', type: 'text' },
      { name: 'publicado_en', type: 'iso' },
      { name: 'publicado_por', type: 'text' },
      { name: 'archivado_en', type: 'iso' },
      { name: 'eliminado_en', type: 'iso' },
      { name: 'version_mayor', type: 'int' },
      { name: 'version_menor', type: 'int' },
      { name: 'version_vigente_id', type: 'id' },
      { name: 'preguntas', type: 'int' },
      { name: 'preguntas_calificables', type: 'int' },
      { name: 'puntos_totales', type: 'num' },
      /* Presentación e instrucciones (texto enriquecido + espejo en plano). */
      { name: 'instrucciones_json', type: 'json' },
      { name: 'instrucciones_texto', type: 'long' },
      { name: 'notas_internas', type: 'long' },
      /* Aplicación. */
      { name: 'duracion_minutos', type: 'int' },
      { name: 'duracion_segundos_extra', type: 'int' },
      { name: 'puntaje_aprobacion', type: 'num' },
      { name: 'criterio_aprobacion', type: 'text' },
      { name: 'intentos_maximos', type: 'int' },
      { name: 'ventana_inicio', type: 'iso' },
      { name: 'ventana_fin', type: 'iso' },
      { name: 'navegacion', type: 'text', enum: 'NAVEGACION' },
      { name: 'permitir_retroceso', type: 'bool' },
      { name: 'mostrar_progreso', type: 'bool' },
      { name: 'mezclar_preguntas', type: 'bool' },
      { name: 'mezclar_opciones', type: 'bool' },
      { name: 'autoenviar_al_expirar', type: 'bool' },
      { name: 'guardado_automatico_segundos', type: 'int' },
      /* Identificación del participante y privacidad. */
      { name: 'campos_participante_json', type: 'json' },
      { name: 'requiere_consentimiento', type: 'bool' },
      { name: 'texto_consentimiento', type: 'long' },
      { name: 'visibilidad_resultado', type: 'text', enum: 'VISIBILIDAD_RESULTADO' },
      /* Integridad. */
      { name: 'integridad_json', type: 'json' },
      /* Apariencia y extensiones. */
      { name: 'tema_json', type: 'json' },
      { name: 'etiquetas_json', type: 'json' },
      { name: 'procesos_json', type: 'json' },
      { name: 'reglas_json', type: 'json' },
      { name: 'extras_json', type: 'json' },
      { name: 'esquema_version', type: 'int' }
    ]
  },

  Secciones: {
    key: 'id',
    describe: 'Secciones del borrador. Baja lógica con activo = FALSE.',
    columns: [
      { name: 'id', type: 'id' },
      { name: 'evaluacion_id', type: 'id' },
      { name: 'titulo', type: 'text' },
      { name: 'descripcion_json', type: 'json' },
      { name: 'descripcion_texto', type: 'long' },
      { name: 'orden', type: 'int' },
      { name: 'limite_segundos', type: 'int' },
      { name: 'mezclar', type: 'bool' },
      { name: 'tomar_n', type: 'int' },
      { name: 'peso', type: 'num' },
      { name: 'activo', type: 'bool' },
      { name: 'creado_en', type: 'iso' },
      { name: 'actualizado_en', type: 'iso' }
    ]
  },

  Preguntas: {
    key: 'id',
    describe: 'Preguntas y bloques de contenido del borrador.',
    columns: [
      { name: 'id', type: 'id' },
      { name: 'evaluacion_id', type: 'id' },
      { name: 'seccion_id', type: 'id' },
      { name: 'tipo', type: 'text' },
      { name: 'orden', type: 'int' },
      { name: 'enunciado_json', type: 'json' },
      { name: 'enunciado_texto', type: 'long' },
      { name: 'ayuda_json', type: 'json' },
      { name: 'ayuda_texto', type: 'long' },
      { name: 'obligatoria', type: 'bool' },
      { name: 'modo_puntaje', type: 'text', enum: 'MODO_PUNTAJE' },
      { name: 'puntos', type: 'num' },
      { name: 'penalizacion', type: 'num' },
      { name: 'competencia', type: 'text' },
      { name: 'codigo', type: 'text' },
      { name: 'respuesta_esperada_json', type: 'json' },
      { name: 'configuracion_json', type: 'json' },
      { name: 'validacion_json', type: 'json' },
      { name: 'retroalimentacion_json', type: 'json' },
      { name: 'medios_json', type: 'json' },
      { name: 'accesibilidad_json', type: 'json' },
      { name: 'etiquetas_json', type: 'json' },
      { name: 'activo', type: 'bool' },
      { name: 'creado_en', type: 'iso' },
      { name: 'actualizado_en', type: 'iso' }
    ]
  },

  Opciones: {
    key: 'id',
    describe: 'Opciones de las preguntas cerradas.',
    columns: [
      { name: 'id', type: 'id' },
      { name: 'pregunta_id', type: 'id' },
      { name: 'evaluacion_id', type: 'id' },
      { name: 'texto_json', type: 'json' },
      { name: 'texto_plano', type: 'long' },
      { name: 'valor', type: 'text' },
      { name: 'orden', type: 'int' },
      { name: 'correcta', type: 'bool' },
      { name: 'puntos', type: 'num' },
      { name: 'clave_emparejamiento', type: 'text' },
      { name: 'grupo', type: 'text' },
      { name: 'imagen_url', type: 'text' },
      { name: 'retroalimentacion', type: 'long' },
      { name: 'activo', type: 'bool' },
      { name: 'creado_en', type: 'iso' },
      { name: 'actualizado_en', type: 'iso' }
    ]
  },

  Versiones: {
    key: 'id',
    describe: 'Metadatos de cada publicación. El contenido va troceado en VersionesBloques.',
    columns: [
      { name: 'id', type: 'id' },
      { name: 'evaluacion_id', type: 'id' },
      { name: 'etiqueta', type: 'text' },
      { name: 'mayor', type: 'int' },
      { name: 'menor', type: 'int' },
      { name: 'estado', type: 'text', enum: 'ESTADO_VERSION' },
      { name: 'notas', type: 'long' },
      { name: 'bloques', type: 'int' },
      { name: 'caracteres', type: 'int' },
      { name: 'huella', type: 'text' },
      { name: 'preguntas', type: 'int' },
      { name: 'preguntas_calificables', type: 'int' },
      { name: 'puntos_totales', type: 'num' },
      { name: 'snapshot_version', type: 'int' },
      { name: 'publicado_en', type: 'iso' },
      { name: 'publicado_por', type: 'text' },
      { name: 'creado_en', type: 'iso' }
    ]
  },

  VersionesBloques: {
    key: 'id',
    describe: 'Trozos del snapshot inmutable. Trocear evita el techo de 50 000 caracteres por celda.',
    columns: [
      { name: 'id', type: 'id' },
      { name: 'version_id', type: 'id' },
      { name: 'evaluacion_id', type: 'id' },
      { name: 'indice', type: 'int' },
      { name: 'contenido', type: 'long' },
      { name: 'creado_en', type: 'iso' }
    ]
  },

  Intentos: {
    key: 'id',
    describe: 'Un intento por participante y evaluación.',
    columns: [
      { name: 'id', type: 'id' },
      { name: 'evaluacion_id', type: 'id' },
      { name: 'version_id', type: 'id' },
      { name: 'version_etiqueta', type: 'text' },
      { name: 'solicitud_inicio', type: 'text' },
      { name: 'participante_nombre', type: 'text' },
      { name: 'participante_documento', type: 'text' },
      { name: 'participante_correo', type: 'text' },
      { name: 'participante_json', type: 'json' },
      { name: 'estado', type: 'text', enum: 'ESTADO_INTENTO' },
      { name: 'iniciado_en', type: 'iso' },
      { name: 'limite_en', type: 'iso' },
      { name: 'ultimo_guardado_en', type: 'iso' },
      { name: 'enviado_en', type: 'iso' },
      { name: 'envio_automatico', type: 'bool' },
      { name: 'segundos_usados', type: 'int' },
      { name: 'puntos_obtenidos', type: 'num' },
      { name: 'puntos_posibles', type: 'num' },
      { name: 'nota', type: 'num' },
      { name: 'nota_automatica', type: 'num' },
      { name: 'correctas', type: 'int' },
      { name: 'incorrectas', type: 'int' },
      { name: 'sin_responder', type: 'int' },
      { name: 'calificables', type: 'int' },
      { name: 'pendientes_revision', type: 'int' },
      { name: 'estado_calificacion', type: 'text', enum: 'CALIFICACION' },
      { name: 'aprobado', type: 'bool' },
      { name: 'calificado_en', type: 'iso' },
      { name: 'calificado_por', type: 'text' },
      { name: 'riesgo_integridad', type: 'int' },
      { name: 'eventos_integridad', type: 'int' },
      { name: 'resumen_integridad_json', type: 'json' },
      { name: 'agente_usuario', type: 'text' },
      { name: 'zona_horaria', type: 'text' },
      { name: 'proceso_id', type: 'id' },
      { name: 'notas_revision', type: 'long' }
    ]
  },

  Respuestas: {
    key: 'id',
    describe: 'Una fila por pregunta respondida. Se reescribe al guardar progreso.',
    columns: [
      { name: 'id', type: 'id' },
      { name: 'intento_id', type: 'id' },
      { name: 'evaluacion_id', type: 'id' },
      { name: 'pregunta_id', type: 'id' },
      { name: 'tipo', type: 'text' },
      { name: 'orden', type: 'int' },
      { name: 'opciones_json', type: 'json' },
      { name: 'valor_json', type: 'json' },
      { name: 'valor_texto', type: 'long' },
      { name: 'correcta', type: 'bool' },
      { name: 'puntos_obtenidos', type: 'num' },
      { name: 'puntos_posibles', type: 'num' },
      { name: 'requiere_revision', type: 'bool' },
      { name: 'comentario_revisor', type: 'long' },
      { name: 'segundos_en_pregunta', type: 'int' },
      { name: 'visitas', type: 'int' },
      { name: 'cambios', type: 'int' },
      { name: 'respondida_en', type: 'iso' }
    ]
  },

  Integridad: {
    key: 'id',
    describe: 'Rastro de eventos del navegador durante el intento.',
    columns: [
      { name: 'id', type: 'id' },
      { name: 'intento_id', type: 'id' },
      { name: 'evaluacion_id', type: 'id' },
      { name: 'secuencia', type: 'int' },
      { name: 'tipo', type: 'text' },
      { name: 'severidad', type: 'text', enum: 'SEVERIDAD_EVENTO' },
      { name: 'pregunta_id', type: 'id' },
      { name: 'ocurrido_en', type: 'iso' },
      { name: 'segundos_desde_inicio', type: 'int' },
      { name: 'duracion_ms', type: 'int' },
      { name: 'detalle_json', type: 'json' },
      { name: 'registrado_en', type: 'iso' }
    ]
  },

  Solicitudes: {
    key: 'solicitud_id',
    describe: 'Registro de idempotencia: una escritura por requestId, y solo una.',
    columns: [
      { name: 'solicitud_id', type: 'text' },
      { name: 'accion', type: 'text' },
      { name: 'referencia', type: 'text' },
      { name: 'actor', type: 'text' },
      { name: 'resultado_json', type: 'json' },
      { name: 'procesado_en', type: 'iso' }
    ]
  },

  Auditoria: {
    key: 'id',
    describe: 'Quién hizo qué, cuándo y con qué resultado. Sin datos sensibles.',
    columns: [
      { name: 'id', type: 'id' },
      { name: 'traza_id', type: 'text' },
      { name: 'solicitud_id', type: 'text' },
      { name: 'accion', type: 'text' },
      { name: 'entidad', type: 'text' },
      { name: 'entidad_id', type: 'id' },
      { name: 'actor', type: 'text' },
      { name: 'cliente', type: 'text' },
      { name: 'resultado', type: 'text' },
      { name: 'codigo_error', type: 'text' },
      { name: 'milisegundos', type: 'int' },
      { name: 'metadatos_json', type: 'json' },
      { name: 'ocurrido_en', type: 'iso' }
    ]
  },

  Registro: {
    key: 'id',
    describe: 'Diario de diagnóstico. Es lo que se lee cuando algo falla.',
    columns: [
      { name: 'id', type: 'id' },
      { name: 'ocurrido_en', type: 'iso' },
      { name: 'nivel', type: 'text' },
      { name: 'traza_id', type: 'text' },
      { name: 'accion', type: 'text' },
      { name: 'mensaje', type: 'long' },
      { name: 'contexto_json', type: 'json' },
      { name: 'pila', type: 'long' }
    ]
  },

  Metricas: {
    key: 'id',
    describe: 'Una fila por acción ejecutada: duración, filas leídas y escritas.',
    columns: [
      { name: 'id', type: 'id' },
      { name: 'ocurrido_en', type: 'iso' },
      { name: 'accion', type: 'text' },
      { name: 'resultado', type: 'text' },
      { name: 'milisegundos', type: 'int' },
      { name: 'hojas_leidas', type: 'int' },
      { name: 'filas_leidas', type: 'int' },
      { name: 'filas_escritas', type: 'int' },
      { name: 'lecturas_cache', type: 'int' }
    ]
  }
};

/** Orden de creación de las hojas (deja las operativas primero). */
var EV_SHEET_ORDER = [
  EV_SHEET.EVALUACIONES,
  EV_SHEET.SECCIONES,
  EV_SHEET.PREGUNTAS,
  EV_SHEET.OPCIONES,
  EV_SHEET.VERSIONES,
  EV_SHEET.BLOQUES,
  EV_SHEET.INTENTOS,
  EV_SHEET.RESPUESTAS,
  EV_SHEET.INTEGRIDAD,
  EV_SHEET.SOLICITUDES,
  EV_SHEET.AUDITORIA,
  EV_SHEET.REGISTRO,
  EV_SHEET.METRICAS,
  EV_SHEET.META
];

/** Nombres de columna de una hoja, en orden. */
function evColumnNames_(sheetName) {
  var schema = EV_SCHEMA[sheetName];
  if (!schema) throw new Error('Hoja desconocida en el esquema: ' + sheetName);
  var names = [];
  for (var i = 0; i < schema.columns.length; i++) names.push(schema.columns[i].name);
  return names;
}

/** Declaración de una columna concreta, o `null`. */
function evColumnSpec_(sheetName, columnName) {
  var schema = EV_SCHEMA[sheetName];
  if (!schema) return null;
  for (var i = 0; i < schema.columns.length; i++) {
    if (schema.columns[i].name === columnName) return schema.columns[i];
  }
  return null;
}

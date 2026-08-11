# Módulo de Documentación

Seguimiento de la documentación que debe entregar cada persona que ingresa al
banco. Sustituye el libro de Excel `REGISTRO INGRESOS` sin obligar a abandonarlo:
la hoja de cálculo sigue siendo la base de datos real y el frontend es una forma
más cómoda de escribir en ella.

---

## 1. Por qué el libro manda

La decisión de fondo de este módulo es que **Google Sheets es la base de datos**,
no una copia de seguridad ni un informe generado.

La persona de reclutamiento lleva años trabajando sobre ese libro y conoce sus
colores de memoria. Si el sistema guardara los datos en otro sitio y volcara un
resumen al libro, cualquier corrección hecha a mano en la hoja se perdería en la
siguiente sincronización. Al revés funciona: quien quiera puede seguir editando
directamente en Sheets, y el frontend lee lo que encuentre.

De ahí se derivan tres reglas que atraviesan todo el código:

1. **Lo escrito a mano gana.** Si una celda de documento tiene un valor puesto
   por una persona (`dossier.sheet[clave]`), el sistema no lo recalcula.
2. **El formato es información, no decoración.** Los colores codifican estado; se
   reproducen exactamente y se vuelven a aplicar tras cada escritura.
3. **Ninguna operación asume que el libro está bien.** Cada escritura verifica la
   estructura y la repara si hace falta.

---

## 2. Estructura del libro

### Pestañas anuales

Una por año, generadas automáticamente: `CONTROL INGRESOS 2026`, `2025`, `2024`…
El año sale de la fecha de ingreso, no de la fecha de registro.

**Columnas A–W** — copia exacta del libro original, incluidos los espacios finales
de `Tipo de Empleado ` y `CORREO CARTA DE PRORROGA `, que se conservan porque
cambiarlos rompería las fórmulas que la persona pueda tener en sus copias.

| Col | Cabecera | Origen |
|-----|----------|--------|
| A | Nombre | manual |
| B | Tipo de Empleado | manual |
| C | Responsable de Proceso | manual |
| D | Fecha Ingreso | manual |
| E | Cargo | manual |
| F | Oficina | manual |
| G | Gerencia | manual |
| H | Observacion | manual |
| I | Proceso | derivada: `COMPLETO` / `FALTA` |
| J | PERFIL | manual |
| K | MF Y MEMO | manual |
| L | CONSENTIMIENTO DE USO DE IMAGEN | manual |
| M | CONTRATO DE FIANZA | derivada del checklist de garante |
| N | COMUNICACIÓN INTERNA | manual |
| O | CONOZCA A SU FUNCIONARIO (LISTAS LEC) | derivada de `lgi-ft` |
| P | REJAP | derivada de `rejap` |
| Q | TITULO LEGALIZADO | derivada de `titulo-legalizado` |
| R | CONTRATO DE FIANZA (2ª) | espejo de M |
| S | VISTA O INFORMACION RAPIDA | derivada de folio + boletas + form. 200/400 |
| T | SEGUROS ALIANZA | derivada de `seguro-accidentes` |
| U | CREDISEGURO | derivada de `seguro-vida` |
| V | DJJ NO CODIFICACION | derivada de `djj-no-vinculacion` |
| W | CORREO CARTA DE PRORROGA | derivada del estado de prórroga |

**Columnas X–AM** — añadidas por el sistema, con cabecera en azul `#005BAA` para
que se distingan de un vistazo de las originales: `id`, `correo`, `avance`,
`presentados`, `pendientes`, `observados`, `paginas`, `estado`, `prorroga_hasta`,
`ultimo_aviso`, `avisos`, `detalle_json`, `creado_en`, `actualizado_en`,
`actualizado_por`, `huella`.

`detalle_json` guarda el checklist completo de los 31 documentos. Es la única
columna que no conviene editar a mano.

### Otras pestañas

- **`ENTREGA COM+SEGUROS`** — se conserva del libro original y se le añaden
  `EXPEDIENTE` y `REGISTRADO EN`.
- **`AUDITORIA`** — toda apertura, edición, envío de aviso y tarea de
  mantenimiento, con fecha, actor, acción, expediente, campo, valor anterior y
  valor nuevo.
- **`CONFIG`**, **`CATALOGO`** y **`RESPALDOS`** — parámetros, listas de valores
  y copias comprimidas.

---

## 3. Lógica de colores

Los colores no se inventaron: se dedujeron leyendo los 941 registros del libro
original.

| Color | Significado |
|-------|-------------|
| `#92D050` verde | Documentación completa |
| `#73DCF5` celeste | Ingreso nuevo, aún sin documentos |
| `#FFFF00` amarillo | Hay una observación que atender |
| `#FF0000` rojo | Crítico o persona desvinculada |
| `#ED7D31` naranja | En gestión |
| `#FFC000` ámbar | Prórroga concedida |
| `#C5E0B4` verde claro | Avance parcial |

**Precedencia** (la aplica `rowTone`): completo → prórroga → sin documentos →
observados → parcial. La prórroga pesa más que el atraso a propósito: una persona
con prórroga vigente no está incumpliendo, y pintarla de rojo genera llamadas
innecesarias.

Además se conserva el formato condicional del original: `FALTA` en rojo sobre
rosa, `COMPLETO` en verde, `NO TIENE` en rojo, y se añaden `PRORROGA` en ámbar y
`TIENE` en verde.

El vocabulario tolera las erratas que ya existen en el libro (`TENE`, `TINE`,
`TIENES`) porque son datos reales y descartarlos perdería registros.

---

## 4. Backend (Apps Script)

`apps-script/documentacion/` — trece archivos.

| Archivo | Responsabilidad |
|---------|-----------------|
| `00_Manifest.gs` | Versión del esquema y constantes |
| `01_Core.gs` | Utilidades, bloqueo, respuestas, trazas |
| `02_Store.gs` | Acceso a hojas, lectura y escritura por lotes |
| `03_Schema.gs` | Cabeceras, anchos, colores, formato condicional |
| `04_Year.gs` | Creación y migración de pestañas anuales |
| `05_Audit.gs` | Bitácora de auditoría |
| `06_Dossiers.gs` | Alta, edición, borrado e importación |
| `07_Maintenance.gs` | Diagnóstico, autorreparación, respaldos |
| `08_Router.gs` | Reparto de las 28 acciones HTTP |
| `09_Menu.gs` | Menú propio dentro de la hoja |
| `10_Tests.gs` | Pruebas ejecutables desde el editor |

### Resistencia a errores

- **Bloqueo de escritura** (`LockService`) para evitar que dos guardados
  simultáneos se pisen.
- **Huella por fila**: detecta ediciones externas y evita sobrescribir a ciegas.
- **Reintentos con espera creciente** en las llamadas a Sheets, que fallan de
  forma intermitente bajo carga.
- **Diagnóstico** que devuelve hallazgos con severidad y una acción concreta para
  resolverlos desde el frontend.
- **Respaldos** comprimidos antes de cualquier operación destructiva.

---

## 5. Frontend

```
src/lib/doc/
  docSchema.ts    Esquema, colores, columnas, normalización
  docApi.ts       Pasarela HTTP, cola de reintentos
  docBackup.ts    Exportación espejo, CSV e importación
src/lib/docStore.ts   Estado, sincronización, API pública
src/components/doc/
  DocMotion.tsx           Primitivas de movimiento
  doc-motion.css          Shimmer y scroll suave
  DocSyncIndicator.tsx    Estado de conexión
  DocBackupPanel.tsx      Copias e importación
  DocMaintenancePanel.tsx Diagnóstico y herramientas
  DocDossierDetail.tsx    Panel de expediente
  DocSettingsModal.tsx    Configuración en cinco pestañas
  DocIntakeForm.tsx       Alta de expediente
src/modules/Documentacion.tsx  Listado con tres vistas
```

### Movimiento

Todo el movimiento pasa por `useDocMotion()`. Hay tres niveles —completas,
suaves, mínimas— y `prefers-reduced-motion` del sistema tiene la última palabra
sin importar lo configurado: este módulo se usa durante horas seguidas y el mareo
por movimiento es un problema real.

El escalonado de listas reparte los retardos dentro de un presupuesto fijo, así
que cien expedientes tardan lo mismo en aparecer que diez.

---

## 6. Verificación

```bash
npm run doc:check    # coherencia backend ↔ frontend
npm run typecheck    # tipos
npm run build        # compilación
```

`doc:check` detecta el fallo más caro de Apps Script: dos funciones con el mismo
nombre en archivos distintos se pisan en silencio, porque todos los `.gs`
comparten un único espacio global. También contrasta las acciones que el
frontend invoca con las que el router atiende.

---

## 7. Puesta en marcha

El procedimiento completo está en `apps-script/documentacion/README.md`.

Resumen: crear la hoja de cálculo, pegar los trece archivos en Apps Script,
guardar el `DOC_SPREADSHEET_ID` en las propiedades del script, ejecutar
`docMenuInstalar`, publicar como aplicación web con acceso «Cualquier usuario» y
pegar la URL en Configuración › Conexión.

Si ya había datos guardados en el navegador, recuperarlos desde
Configuración › Datos → «Rescatar del navegador» antes de nada.

# Backend de Evaluaciones · Apps Script

Copia estos archivos a un proyecto de Apps Script **creado desde el libro de
cálculo** que va a alojar las evaluaciones. El orden numérico de los nombres es el
orden de carga: respétalo.

| Archivo | Responsabilidad |
| --- | --- |
| `00_Manifest.gs` | Identidad, límites, enumeraciones y **el esquema declarativo**. Fuente única del modelo de datos. |
| `01_Errors.gs` | Errores tipados con código, mensaje, pista accionable y detalle. |
| `02_Util.gs` | Coerciones, identificadores, tiempo y hashes. |
| `03_Log.gs` | Diario de diagnóstico con trazas correlacionadas. |
| `04_Store.gs` | Unidad de trabajo sobre Sheets: una lectura por hoja, escrituras por lotes. |
| `05_Schema.gs` | Instalación, verificación y reparación no destructiva. |
| `06_Security.gs` | Llave de administración y tokens de intento. |
| `07_RichText.gs` | Modelo de texto enriquecido y saneamiento. |
| `08_Types.gs` | Catálogo de los 39 tipos de bloque y pregunta. |
| `09_Mapper.gs` | Traducción fila ↔ objeto de la API. |
| `10_Validate.gs` | Validación de entrada y de publicación. |
| `11_Assessments.gs` | CRUD y ciclo de vida. |
| `12_Publish.gs` | Publicación, versiones inmutables y reversión. |
| `13_Public.gs` | Proyección pública (la clave de respuestas no sale de aquí). |
| `14_Scoring.gs` | La única autoridad de calificación. |
| `15_Integrity.gs` | Rastro de integridad y riesgo ponderado. |
| `16_Attempts.gs` | Intentos: inicio, progreso, latido y envío. |
| `17_Results.gs` | Resultados, calificación manual y exportación. |
| `18_Audit.gs` | Auditoría, métricas e idempotencia. |
| `19_Router.gs` | Único camino de entrada: autoriza, bloquea, ejecuta, audita. |
| `20_Diagnostics.gs` | Diagnóstico con hallazgos, severidades y remedios. |
| `21_Maintenance.gs` | Menú del libro y tareas de autocuidado. |
| `22_Tests.gs` | Suite que corre dentro del proyecto, contra el libro real. |
| `Main.gs` | `doGet` y `doPost`. Nada más. |
| `appsscript.json.example` | Manifiesto: runtime V8 y despliegue como aplicación web. |

## Puesta en marcha

1. Extensiones → Apps Script en el libro nuevo.
2. Copia los 24 archivos y pega `appsscript.json.example` en el manifiesto
   (⚙️ Configuración → «Mostrar archivo appsscript.json»).
3. Recarga el libro y usa el menú **⚙️ Evaluaciones**:
   - *Instalar o reparar estructura* — crea las trece hojas y el secreto de firma.
   - *Generar llave de administración* — cópiala; no se vuelve a mostrar.
   - *Ejecutar pruebas del backend* — 15 pruebas contra el libro real.
4. Implementar → Nueva implementación → *Aplicación web*, ejecutando «como yo» y
   con acceso «cualquier usuario». Copia la URL `…/exec`.
5. En el ATS: **Evaluaciones → Conexión**, pega la URL y la llave, y pulsa
   «Guardar y probar».

## Propiedades del script

Ninguna es obligatoria para arrancar; todas se pueden dejar en blanco.

| Propiedad | Para qué |
| --- | --- |
| `EV_ADMIN_KEY` | Llave de administración. Sin ella el backend opera en modo abierto y lo anuncia. |
| `EV_ADMIN_KEY_NEXT` | Llave siguiente, para rotar sin cortar el servicio. |
| `EV_ATTEMPT_SECRET` | Secreto de firma de los tokens de intento. Se genera al instalar. |
| `EV_SPREADSHEET_ID` | Solo si el script NO está creado desde el libro. Acepta el id o la URL. |
| `EV_LOG_LEVEL` | `debug` · `info` (por omisión) · `warn` · `error`. |
| `EV_METRICS_ENABLED` | `false` para no escribir métricas. |

## Autocuidado

`instalarDisparadorDiario()` instala un disparador que, cada día a las 03:00,
cierra los intentos vencidos que nadie envió (calificando lo que hubiera), poda el
diario y las métricas, y deja el diagnóstico registrado.

## Contrato completo

`docs/evaluaciones/CONTRATO_FRONTEND.md`. Ese documento está escrito para que otra
IA o otro frontend puedan integrarse sin leer el código.

# Backend de Evaluaciones (Google Apps Script)

Estos archivos se copian **tal cual** a un proyecto de Google Apps Script.
No hay pasos de compilación ni dependencias.

## Orden de copiado

Apps Script concatena todos los archivos en un único ámbito global, así que el
orden no afecta al funcionamiento. Aun así conviene copiarlos en este orden para
que el proyecto se lea bien:

| # | Archivo | Responsabilidad |
| --- | --- | --- |
| 1 | `Config.gs` | Nombres de hoja, encabezados, límites, propiedades de script. |
| 2 | `Response.gs` | Envoltorio `{ ok, requestId, data, error, warnings }` y errores tipados. |
| 3 | `IdService.gs` | Identificadores estables, códigos públicos y checksums. |
| 4 | `SheetRepository.gs` | Lectura por encabezado, escritura por lotes, bajas lógicas, verificación de esquema. |
| 5 | `Sanitize.gs` | Proyección pública (lista blanca campo por campo). |
| 6 | `Validation.gs` | Catálogo de tipos, validación de guardado y de publicación, descarte de puntajes del cliente. |
| 7 | `Auth.gs` | Autorización administrativa. |
| 8 | `RequestService.gs` | Idempotencia + `LockService`. |
| 9 | `AuditService.gs` | Bitácora sin datos sensibles. |
| 10 | `AssessmentService.gs` | CRUD, duplicar, publicar, transiciones, resultados. |
| 11 | `PublicAssessmentService.gs` | Listado y detalle públicos. |
| 12 | `AttemptService.gs` | Intentos y respuestas. |
| 13 | `ScoringService.gs` | Calificación (única autoridad). |
| 14 | `Router.gs` | Enrutado y orquestación. |
| 15 | `Code.gs` | `doGet` / `doPost`. |
| 16 | `Setup.gs` | Inicialización, verificación, datos de prueba y migración. |
| 17 | `Tests.gs` | Pruebas ejecutables desde el editor. |
| 18 | `appsscript.json` | Copiar el contenido de `appsscript.json.example`. |

## Puesta en marcha resumida

```
1. configurarEvaluaciones()          → crea las nueve hojas
2. verificarEsquemaEvaluaciones()    → debe responder ok:true
3. ejecutarPruebasEvaluaciones()     → todas las líneas deben empezar con "OK"
4. Implementar → Nueva implementación → Aplicación web
5. Copiar la URL /exec en VITE_EVALUATIONS_API_URL
```

El detalle completo (propiedades de script, identidad de ejecución, permisos,
versiones, `curl` de prueba y rollback) está en
[`docs/evaluations/APPS_SCRIPT_SETUP.md`](../../docs/evaluations/APPS_SCRIPT_SETUP.md).

## Relación con `docs/backend/Code.gs`

`docs/backend/Code.gs` es el Web App **existente** del resto del sistema
(postulantes, KPIs, documentación, perfiles de cargo, Procesos y la hoja
heredada `Evaluaciones`). **No se modifica.** Este backend es un proyecto
independiente con su propia URL, de modo que un fallo aquí no puede afectar a
los demás módulos. Ambos pueden apuntar a la misma hoja de cálculo: los nombres
de hoja no colisionan.

## Estas mismas pruebas se ejecutan en el repositorio

`scripts/run-apps-script.mjs` carga estos archivos `.gs` en Node con
`SpreadsheetApp`, `LockService`, `PropertiesService`, `Utilities`, `Session` y
`ContentService` simulados. Las suites
`src/features/assessments/__tests__/appsScript.*.test.ts` ejercitan el backend
completo (idempotencia, bloqueo, saneamiento, calificación, conflictos de
versión) con `npm test`, sin necesidad de desplegar nada.

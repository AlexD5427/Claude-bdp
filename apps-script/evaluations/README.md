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
| 7 | `Signature.gs` | HMAC-SHA256, ventana de frescura y anti-repetición de las credenciales. |
| 8 | `AuthProviders.gs` | Proveedores de autorización (`server_secret`, `google_identity`, `open_admin`). |
| 9 | `Auth.gs` | Clasificación de acciones y frontera de autorización. |
| 10 | `RequestService.gs` | Idempotencia + `LockService`. |
| 11 | `AuditService.gs` | Bitácora sin datos sensibles. |
| 12 | `AssessmentService.gs` | CRUD, duplicar, publicar, transiciones, resultados. |
| 13 | `PublicAssessmentService.gs` | Listado y detalle públicos. |
| 14 | `AttemptService.gs` | Intentos y respuestas. |
| 15 | `ScoringService.gs` | Calificación (única autoridad). |
| 16 | `Router.gs` | Enrutado y orquestación. |
| 17 | `Code.gs` | `doGet` / `doPost`. |
| 18 | `Setup.gs` | Inicialización, verificación, datos de prueba y migración. |
| 19 | `Tests.gs` | Pruebas ejecutables desde el editor. |
| 20 | `appsscript.json` | Copiar el contenido de `appsscript.json.example`. |

## Puesta en marcha resumida

```
1. configurarEvaluaciones()          → crea las nueve hojas
2. verificarEsquemaEvaluaciones()    → debe responder ok:true
3. Propiedad EVALUATIONS_ADMIN_SHARED_SECRET (≥32 caracteres)
4. ejecutarPruebasEvaluaciones()     → todas las líneas deben empezar con "OK"
5. Implementar → Nueva implementación → Aplicación web
6. Copiar la URL /exec en EVALUATIONS_APPS_SCRIPT_URL (Vercel) y en
   VITE_EVALUATIONS_API_URL (solo para las acciones públicas)
```

> **Las operaciones administrativas llegan firmadas.** El modo por omisión es
> `server_secret`: quien firma es el backend intermedio de `api/evaluations/`, que
> custodia el secreto. Sin la propiedad `EVALUATIONS_ADMIN_SHARED_SECRET` ninguna
> acción administrativa se autoriza (falla cerrado); las funciones del editor
> (`Setup.gs`) siguen funcionando porque pasan por `evalHandleTrustedRequest_()`.

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

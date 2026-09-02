# SECURITY

## Answer-key protection

The Candidate Portal must never receive answer keys. `infrastructure/mappers/
publicDto.ts` projects a **published** assessment version into a candidate-safe
DTO, removing per-option `score`/`correct`/`feedback`, block `score`, scoring
rules, and internal instructions; only presentation config is forwarded. Drafts
are never public (the DTO returns `null` when there is no published version).
Covered by `mappers.test.ts`.

## Content sanitization

- No backend-provided HTML, CSS, or JavaScript is ever rendered. Rich content is
  stored as sanitized structured text and rendered by React (auto-escaped).
- Public-content URLs are constrained to `http(s)` (`publicContent.ts`
  `safeUrlSchema`).
- Untrusted SVG is not rendered inline.
- `shared/sanitize.ts` strips control chars, caps lengths, and can strip HTML.

## Spreadsheet import

- Parsers read **literal cell values only** — no formula/macro/HTML/script
  evaluation.
- File size, worksheet, row, and column limits guard against resource
  exhaustion.
- Future CSV exports are guarded against **formula injection** (`guardCsvCell`,
  `csvField`).

## Untrusted code

Advanced code/SQL/simulation types are **contracts only**; the browser never
evaluates candidate submissions. A real runtime must sandbox execution
server-side.

## Authorization

- Frontend permission guards (`features/shared/permissions.ts`) improve UX
  (hiding actions) but **do not replace backend authorization**, which must
  independently enforce every write.
- Roles map to view/create/edit/publish/close/archive/import/manage/analytics.

## Secrets

- No Apps Script secret is read, printed, or logged by the client; the endpoint
  URL is the only configuration.
- No service-role or R2 keys exist in the frontend; `.env.example` documents that
  privileged secrets must never be `VITE_`-prefixed.
- Errors shown to users are normalized, human messages — never stack traces.
- Answer keys and sensitive payloads are never logged (audit log stores only
  non-sensitive summaries/metadata).

## Synchronization safety

Writes carry `expectedEntityVersion`; the backend rejects stale updates with a
`conflict` code and the UI surfaces the conflict instead of silently
overwriting.

## Datos personales guardados en el navegador (módulo de Documentación)

Desde el catálogo v3 el módulo guarda expedientes en el equipo de cada persona
para que abrirlos sea instantáneo. Son **datos personales de terceros** —nombre,
carnet de identidad, cargo, agencia y el estado de su documentación— y por eso
están acotados con reglas explícitas.

### Qué se guarda

| Almacén | Clave | Qué contiene | Caducidad |
| --- | --- | --- | --- |
| IndexedDB | `bdp-documentacion-cache` / `expedientes` | Hasta **60** expedientes con su cabecera, sus requisitos, sus prórrogas y **12** entradas de historial | **30 min** (TTL) + desalojo del menos usado |
| `localStorage` | `bdp-documentacion-cache-expedientes` | Solo **cabeceras**, cuando IndexedDB está bloqueado (modo privado de algunos Safari) | igual |
| `localStorage` | `bdp-documentacion-outbox` | Escrituras pendientes de confirmar, con su `solicitudId` | hasta confirmarse o descartarse |
| `localStorage` | `bdp-documentacion-catalogo` | El catálogo: nombres de documentos, agencias, gerencias y cargos | sin caducidad |
| `localStorage` | `bdp-documentacion-alta-borrador` | El expediente a medio llenar del asistente | hasta guardar o descartar |

### Qué NO se guarda, y por qué

- **La auditoría técnica** (`AuditoriaDocumentacion`). Es lo más pesado del
  payload y lo menos útil para pintar una ficha: nadie abre un expediente para
  leer su bitácora. Se recorta a cero al guardar y se pide cuando hace falta.
- **El historial completo.** Se conservan 12 entradas; el resto se pide.
- **Las capacidades del actor.** Guardarlas haría que al cambiar de perfil la
  interfaz mostrara los botones del rol anterior hasta la primera respuesta del
  servidor.

### Cuándo se borra todo

- **Al cambiar de perfil o cerrar sesión.** `DocumentacionConsola` llama a
  `vaciar()` y a `vaciarCola()` cuando cambia el identificador del perfil. No es
  una optimización: son datos de terceros y no pueden sobrevivir al cambio de
  quien usa el equipo.
- **Al caducar el TTL.** Una copia de hace dos días no sirve para nada y sí es un
  riesgo.
- **A petición**, desde el autodiagnóstico del módulo («Vaciar caché local»).

### Por qué se guarda, si envejece

La objeción original era correcta: «una copia en memoria envejece en segundos».
La conclusión no lo era. De «una copia envejece» se sigue «la copia no puede
presentarse como fresca», no «no hay copia». La caché es de **revalidación**: se
pinta al instante lo guardado con su antigüedad a la vista, se pregunta al backend
en paralelo, y si la versión cambió se reconcilia. Si la persona está editando ese
requisito, la revalidación **no** lo pisa: se ofrece.

> **La cola de salida no miente.** Un elemento solo sale de ella con una respuesta
> afirmativa del backend. Lo que quedó «enviando» al recargar vuelve a
> «pendiente», nunca a «guardado»: no se sabe si llegó, y darlo por bueno sería
> exactamente mentir.

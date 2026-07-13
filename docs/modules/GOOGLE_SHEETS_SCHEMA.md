# GOOGLE_SHEETS_SCHEMA

Two new worksheets back ProcessOS and AssessmentOS. One row per entity; nested
structures are stored as **validated JSON strings** — a documented transitional
strategy until a relational backend (Supabase) exists. The mappers
(`infrastructure/mappers`) are the only place that reads/writes these shapes.

## Worksheet `Procesos`

| Column | Notes |
| --- | --- |
| ID | Stable entity id (primary key) |
| ReferenciaExterna | External reference |
| Codigo | Human code (e.g. `PRC-ANAL-1A2B`) |
| Nombre | Title |
| Slug | URL slug |
| Descripcion | Internal description |
| Area, Departamento, UnidadNegocio, Ubicacion | Org/job info |
| Modalidad | `onsite` \| `hybrid` \| `remote` |
| TipoContrato | employment type |
| NivelExperiencia | experience level |
| Vacantes | integer |
| ReclutadoresJson, ResponsablesJson, GerentesJson | JSON string arrays |
| PropietarioId | owner |
| Estado | process status |
| EstadoPublicacion | publication status |
| Visibilidad | `internal` \| `external` \| `both` |
| FechaApertura, FechaCierre | ISO dates (nullable) |
| EvaluacionesJson | JSON string array of assessment ids |
| FormularioJson | JSON string `{ id }` (application form) |
| ContenidoPublicoJson | JSON string of public content blocks |
| ConfiguracionJson | JSON string of internal config |
| VersionEsquema, VersionEntidad | schema + entity versions |
| CreadoPor, FechaCreacion, ActualizadoPor, FechaActualizacion | audit |
| EstadoSincronizacion | sync status |

## Worksheet `Evaluaciones`

| Column | Notes |
| --- | --- |
| ID | Stable entity id (primary key) |
| ReferenciaExterna, Codigo, Nombre | identity |
| Categoria | assessment category |
| Proposito | purpose |
| Version, VersionMayor, VersionMenor | draft version label + numbers |
| Estado | lifecycle |
| EstadoPublicacion | publication |
| ProcesosJson | JSON string array of linked process ids |
| DuracionEstimada | minutes |
| PoliticaIntentosJson, PoliticaTiempoJson, PoliticaNavegacionJson, PoliticaPuntuacionJson, PoliticaMonitoreoJson, PoliticaConsentimientoJson | policy JSON strings |
| SeccionesJson | JSON string of the draft sections/blocks |
| ReglasJson | JSON string of branching rules |
| TemaJson | JSON string of theme |
| ConfiguracionJson | JSON string of remaining config (tags, rubrics, resume/randomization/result/accessibility policies, instructions) |
| VersionesPublicadasJson | JSON string array of immutable published versions |
| VersionPublicadaActual | id of the served published version |
| VersionEsquema, VersionEntidad | schema + entity versions |
| CreadoPor, FechaCreacion, ActualizadoPor, FechaActualizacion, FechaPublicacion | audit |
| EstadoSincronizacion | sync status |

## Compatibility & mapping

- If an existing sheet differs, the mapper reads compatible fields and coerces
  unknown enum values to safe defaults (`rowTo*` uses Zod `safeParse` then a
  defaulted retry). Missing columns are simply absent — document and add them.
- Published versions have **independent identities** inside
  `VersionesPublicadasJson`; they are never overwritten.
- Answer keys live in `SeccionesJson`/`VersionesPublicadasJson` but are stripped
  by the public DTO mapper before anything reaches a candidate.

## Answer-key safety

`infrastructure/mappers/publicDto.ts` projects a published version into a
candidate-safe DTO: per-option `score`/`correct`/`feedback`, block `score`, and
internal instructions are removed; only presentation config is forwarded.

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

## Worksheet `perfil_cargo_bdp`

Backs the **Perfiles de Cargo** module. Unlike the ProcessOS/AssessmentOS sheets,
this one is a **fixed, plain-text contract** shared with a second read-only
frontend, so column names (including the two accented ones) must not change and
there is **no `id` column**. Multi-value cells store entries separated by `" | "`
(space-pipe-space) — each segment becomes a bullet in the reader. Rows are
addressed by their real sheet row (the backend injects `_fila` on read; edits and
deletes target that row, and `deleteRow` shifts rows up so no blank gaps remain).

| Column | Notes |
| --- | --- |
| area_cargo | Área/gerencia (autocompleta con `gerencias_bdp`) |
| puesto_bdp | Puesto (autocompleta con `cargos_bdp`) |
| gestion_bdp | Año de gestión (4 dígitos, p. ej. `2026`) |
| formacion_principal | Texto; viñetas separadas por `" | "` |
| formación_complementaria | Texto; viñetas separadas por `" | "` (con tilde) |
| experiencia_general | Texto; viñetas separadas por `" | "` |
| experiencia_especifica | Texto; viñetas separadas por `" | "` |
| conocimientos_tecnicos | Texto; viñetas separadas por `" | "` |
| conocimientos_genéricos | Texto; viñetas separadas por `" | "` (con tilde) |
| conductas_requeridas | Texto; viñetas separadas por `" | "` |
| competencias_requeridas | Texto; viñetas separadas por `" | "` |
| link_evaluar | URL de la convocatoria (patrón `https://<sub>.evaluar.com/trabajo/<slug>/`) |
| link_img_1 … link_img_10 | Diez ranuras de imagen ordenadas; vacías al final |

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

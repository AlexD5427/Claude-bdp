# Google Sheets Schema (transitional)

Google Sheets is the **transitional** persistence layer. Complex structures are
stored as validated JSON strings in `*Json` columns and pass through mappers
before reaching the UI. Do not treat Sheets as the permanent architecture.

Worksheet names are used exactly (no accents): `Procesos`, `Evaluaciones`.

## `Procesos`

`ID, ReferenciaExterna, Codigo, Nombre, Slug, Descripcion, Area, Departamento,
UnidadNegocio, Region, Ciudad, Agencia, Modalidad, TipoContrato, Vacantes,
ReclutadoresJson, ResponsablesJson, Estado, EstadoPublicacion, Visibilidad,
FechaApertura, FechaCierre, EvaluacionesJson, FormularioJson,
ContenidoPublicoJson, ConfiguracionJson, VersionEsquema, CreadoPor,
FechaCreacion, ActualizadoPor, FechaActualizacion, SincronizacionEstado`

- `ReclutadoresJson` — `string[]`.
- `ResponsablesJson` — `{ hiringManagerIds: string[], ownerId: string }`.
- `EvaluacionesJson` — linked assessment ids `string[]`.
- `ContenidoPublicoJson` — validated public content blocks.
- `ConfiguracionJson` — configuration + fields without a dedicated column
  (experienceLevel, mission, shortDescription, location, dates, audit trail,
  internal metadata).

Upsert by `ID`. Mapper: `features/processes/mappers.ts`.

## `Evaluaciones`

`ID, ReferenciaExterna, Codigo, Nombre, Categoria, Proposito, Version,
VersionMayor, VersionMenor, Estado, EstadoPublicacion, ProcesosJson,
DuracionEstimada, PoliticaIntentosJson, PoliticaTiempoJson,
PoliticaNavegacionJson, PoliticaPuntuacionJson, PoliticaMonitoreoJson,
PoliticaConsentimientoJson, SeccionesJson, ReglasJson, TemaJson,
ConfiguracionJson, VersionEsquema, CreadoPor, FechaCreacion, ActualizadoPor,
FechaActualizacion, FechaPublicacion, SincronizacionEstado`

- `SeccionesJson` / `ReglasJson` — sections/questions and logic rules.
- `ConfiguracionJson` — remaining policies, instructions, versions[] and audit.
- **Versioning**: the live draft is upserted by `ID`; each published version is
  a **separate row** with composite identity `ID + Version` (never overwritten).

Mapper: `features/assessments/mappers.ts`.

## Migration policy

If a sheet already exists with a different schema, the backend preserves
compatible columns and appends missing ones (non-destructive — see
`hojaConEncabezados_` in `Code.gs`). Never assume a destructive rewrite.

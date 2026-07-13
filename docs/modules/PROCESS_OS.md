# PROCESS_OS

ProcessOS is the rebuilt **Procesos** module. The old implementation grouped
candidates by the middle segment of their identifier; the new module manages a
first-class `RecruitmentProcess` entity representing the full recruitment
operation.

> **Migration, not duplication.** `src/modules/Procesos.tsx` was removed and the
> dock now points at `features/processes`. There is no `/processes-v2`.

## Domain model

`RecruitmentProcess` (`features/processes/domain/models.ts`) is validated with
Zod and carries: identity (`id`, `externalReference`, `code`, `title`, `slug`),
job info (`area`, `department`, `businessUnit`, `location`, `workMode`,
`employmentType`, `experienceLevel`, `vacancies`), team (`recruiterIds`,
`hiringManagerIds`, `ownerId`), lifecycle (`processStatus`, `publicationStatus`,
`visibility`), linkage (`applicationFormId`, `assessmentIds`), dates, public
content blocks, configuration, versioning (`schemaVersion`, `entityVersion`),
audit timestamps, and `sourceProvider` / `synchronizationStatus`.

### Statuses

Internal status and publication status are intentionally separate:

- **Process status:** Borrador, En configuración, Pendiente de aprobación,
  Aprobado, Programado, Publicado, Recepción activa, Pausado, Cerrado,
  Finalizado, Archivado, Cancelado.
- **Publication status:** No publicado, Programado, Publicado, Pausado, Cerrado,
  Archivado.

Each value has an es-MX label and a semantic intent (never color alone).

## List & views

`ProcesosModule` provides search, advanced filters (drawer), active-filter
count, sorting, density, and four views:

- **Table** — sticky header, sortable columns, per-row action menu.
- **Cards** — denser visual grid.
- **Kanban** — status columns with drag-and-drop **and** a keyboard alternative
  (grab handle → ←/→ to move, Enter/Esc to drop) plus a live region.
- **Summary** — counts and distributions by status/area.

List state (search, filters, view, density, sort, columns, saved views) lives in
a persisted store (`ui/listState.ts`) and filtering is pure + unit-tested.

## Editor

`ProcessEditor` is a glass drawer with ten sections: Resumen, Información del
cargo, Publicación, Formulario de postulación, Evaluaciones, Equipo responsable,
Comunicaciones, Configuración, Reportes, Historial. It supports draft saving,
unsaved-change warnings, a validation summary, publish/pause/close/archive
(confirmed), and duplicate. Assessment linking is done in the Evaluaciones
section and persisted on the process.

## Public content

`PublicContentEditor` edits schema-driven blocks (hero, summary, rich text,
responsibilities, requirements, benefits, location, image, gallery, video, FAQ,
application instructions, assessment information, privacy notice, contact/help).
Content is stored as **sanitized structured data** — never raw HTML/CSS/JS — and
URLs are constrained to http(s). The future Candidate Portal renders these with
React, so nothing backend-provided is ever executed.

## Persistence

Writes go through `application/processService.ts` → repository → provider. The
Apps Script adapter maps to the `Procesos` worksheet (see
GOOGLE_SHEETS_SCHEMA.md). `entityVersion` drives stale-update detection.

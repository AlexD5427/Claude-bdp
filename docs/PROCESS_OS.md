# ProcessOS — the redesigned *Procesos* module

ProcessOS turns the old read-only "candidates grouped by process" screen into a
full administrative control centre for recruitment processes, while **preserving
that original view** as one of its modes.

## Domain entity

`RecruitmentProcess` (`features/processes/types.ts`) models an entire recruitment
operation — general info, job info, publication, application form, linked
assessments, responsible team, dates, visibility, configuration, public content
blocks, internal metadata and an audit trail. A cheap `ProcessSummary`
projection powers the list views so large lists stay fast.

## Statuses

Internal status and public publication status are **separate** on purpose —
closing a publication never deletes or closes the process itself.

- Internal: `borrador`, `en_configuracion`, `pendiente_aprobacion`, `aprobado`,
  `programado`, `publicado`, `recepcion_activa`, `pausado`, `cerrado`,
  `finalizado`, `archivado`, `cancelado`.
- Publication: `no_publicado`, `programado`, `publicado`, `pausado`, `cerrado`,
  `archivado`.

Allowed transitions are declared in `statuses.ts` (`canTransition`,
`allowedTransitions`) and enforced by the editor and Kanban.

## Screens

The main screen (`pages/ProcessOSPage.tsx`) offers:

- **Table** — sortable, selectable, bulk actions, row action menu, density
  toggle, sticky header.
- **Cards** — glass cards with status chips.
- **Kanban** — grouped by status, drag-and-drop **plus** a keyboard-accessible
  "Mover a…" menu on every card (no drag-only operation). Moves are optimistic
  and roll back on failure.
- **Postulantes por proceso** — the original candidate-grouping view, migrated
  intact and wired to the real backend candidates + profile viewer.
- **Resumen analítico** — real, derived metrics (active, published, closing
  soon, without assessments, by area/status). Metrics needing data the backend
  does not yet capture are omitted rather than faked.

Advanced filters (status, publication, visibility, area, assessments-with/
without, sort) are combinable and persisted per browser profile (`prefs.ts`).

## Editor

`components/ProcessEditor.tsx` is a multi-section glass drawer: Resumen,
Información del cargo, Publicación, Evaluaciones, Equipo responsable,
Configuración and Historial. It supports draft saving, an unsaved-changes guard,
a validation summary, assessment linking and the publish/pause/close/archive
lifecycle. Public content is stored as validated JSON blocks; no arbitrary
HTML/CSS/JS is ever accepted.

## Persistence

`mappers.ts` serialises a process to the `Procesos` worksheet contract (complex
structures as validated JSON in `*Json` columns) and back. `repository.ts`
exposes `listSummaries / get / create / update / transition / duplicate / remove`
over the mock or Apps Script provider. See `GOOGLE_SHEETS_SCHEMA.md`.

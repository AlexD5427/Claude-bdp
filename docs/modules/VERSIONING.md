# VERSIONING

Assessments support **major/minor versioning** with controlled live updates.
Candidates who started a version stay pinned to it; new assignments receive the
current published version. Historical attempts are never mutated.

## Model

`AssessmentDefinition` holds a `draftVersion` (always editable) and immutable
`publishedVersions[]`. `currentPublishedVersionId` marks the version served to
new candidates. `publishDraft` deep-clones content into the published snapshot
**and** into the new working draft, so later draft edits can never leak into a
published version.

## Change classification

`versioning/classify.ts#classifyContentChange(prev, next)` compares two content
snapshots and returns `none | safe | structural` with es-MX reasons.

**Safe (non-structural)** — audited minor revision (v1.2 → v1.3):

- spelling / label wording, help-text, description
- accessibility-description updates
- decorative-media replacement
- instruction wording that doesn't change meaning or scoring
- theme changes

**Structural** — a new version (v1.x → v2.0):

- add / remove / reorder scored questions
- change options, correct answers, per-option scores
- change points or weights
- change validation rules
- change section timers, randomization, or pool size
- change branching rules

## Operations (non-destructive)

`versioning/operations.ts`:

- `publishDraft(def, by, notes)` — snapshots the draft as an immutable published
  version. Numbering: first publish is v1.0; afterwards the classification vs.
  the last published version decides major (+1, minor 0) vs. minor (+1).
- `cloneVersionIntoDraft(def, versionId, by)` — copies any version's content into
  the draft without touching the source.
- `rollbackToVersion(def, versionId, by)` — re-points `currentPublishedVersionId`
  to an earlier version for **future** assignments; nothing is deleted, in-flight
  attempts stay pinned.
- `currentServedVersion(def)` — the version new candidates receive.

## In the builder

The status area shows whether pending changes are a minor revision or a new
version. Publishing shows a confirmation that explains the consequence and
reassures that existing attempts are unaffected.

## Tests

`versioning/versioning.test.ts` covers classification (none/safe/structural),
version numbering, immutability of published content, rollback, and cloning.

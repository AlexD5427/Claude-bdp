# Assessment Versioning & Live Update

A published assessment is a contract with candidates in flight, so it is never
mutated destructively. The rules live in `features/assessments/lifecycle.ts`.

## Edit classification

`classifyEdit(before, after)` returns:

- `none` — no meaningful change.
- `non_structural` — wording, instructions, help text, descriptions, option
  *labels*, decorative media. Safe to publish as a **minor** revision (audited).
- `structural` — add/remove/reorder scored questions, change correct answers,
  points, options *values*, branching rules, required flags, timing,
  randomisation or thresholds. Requires a **new major** version.

It compares two fingerprints:

- `structuralSignature(a)` — ids, order, scoring, option values/points/correct,
  validation, rules, timing, randomisation. Any change → structural.
- soft signature — labels and copy only. Change with an unchanged structural
  signature → non-structural.

## Version numbers

`nextVersion(current, classification)`:

- structural → `major+1 . 0`
- non_structural → `major . minor+1`
- none → unchanged

## Publishing

`snapshotVersion(a, version, actor, notes)` deep-clones the current sections and
rules into an immutable `AssessmentVersion` (`status: "published"`). The store's
`publish` appends it to `versions`, sets `currentVersion`, and records an audit
entry. Historical versions are never mutated.

On the `Evaluaciones` sheet, published versions are written as **their own rows**
with composite identity `ID + Version` (`publish_version` action), so history is
preserved. The live draft is upserted by `ID`.

## Candidate pinning (contract)

Candidates who started an attempt remain on the version they began; new
candidates receive the newly published version. Attempt storage is a backend
responsibility (documented in `MIGRATION_NOTES.md`); the frontend never mutates
historical submissions.

## Publish dialog

`builder/PublishDialog.tsx` shows the classification, the resulting version
number and blocks publishing while logic errors exist, capturing version notes.

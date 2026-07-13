# Excel / CSV / ODS Import

The import wizard (`features/assessments/components/ImportWizard.tsx`) turns a
spreadsheet into an assessment **draft** (never published on import).

## Parsing (safe by design)

`imports/parser.ts` avoids heavyweight parsers with known advisories. It:

- parses **CSV/TSV** with a quote-aware tokenizer;
- unzips **XLSX/ODS** with `fflate` and reads cached cell **values** via the
  browser `DOMParser`.

Formula cells contribute only their last cached value (`<v>` / `office:value`);
formulas are **never evaluated or executed**. Limits: 5 MB, 2000 rows.

## Workflow

Select file → choose sheet (if several) → map columns → preview + validate →
convert to draft. A stepper shows progress; the draft opens in the builder.

## Standard template

`standardTemplateCsv()` provides a downloadable template with columns:
`evaluation_name, evaluation_code, section, section_order, question_code,
question_text, question_type, question_order, required, options,
correct_answer, points, weight, difficulty, competency, help_text, feedback,
time_limit_seconds, tags`.

Technical headers stay English for interoperability; Spanish aliases
(`pregunta`, `tipo`, `opciones`, `respuesta_correcta`, …) are auto-detected and
the mapping screen can override any column. Options use `A | B | C`.

## Validation report

`imports/mapping.ts#validateRows` classifies every issue as **error / warning /
info** with row, column, original value, problem and suggestion:

- missing question text; unsupported type; duplicate question code; invalid
  option; correct answer not among options; invalid score/weight/time; invalid
  boolean; non-standard difficulty.

Nothing invalid is silently discarded — rows can be excluded explicitly, and the
report is shown before conversion.

## Security

- Extension + size + row-count checks before parsing.
- No formula execution, no imported HTML/script execution.
- CSV export (the template) is static; dynamic CSV export must quote fields
  beginning with `= + - @` to prevent CSV injection (documented for the future
  export feature).

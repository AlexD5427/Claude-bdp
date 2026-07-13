# SPREADSHEET_IMPORT

The import wizard turns an `.xlsx`, `.csv`, or `.ods` file into a **reviewable
assessment draft**. It never publishes automatically.

## Flow

`ui/ImportWizard.tsx`: select file → (choose worksheet) → map columns → review &
validate → create draft. The created draft opens in the builder for review; the
author publishes separately.

## Parsing

`imports/parse.ts`:

- **CSV** — a hand-written parser honoring quoted fields and escaped quotes.
- **XLSX** — unzipped with `fflate`; sheet XML + shared strings are read for
  literal cell values only.
- **ODS** — `content.xml` tables are read for cell text.

**No formulas, macros, HTML, or scripts are evaluated** — only literal values.
Limits guard resources: 10 MB file, 20 worksheets, 5000 rows, 100 columns.

## Column mapping

`imports/convert.ts` auto-maps detected headers (Spanish **and** English aliases)
to the standard interoperable columns:

```
evaluation_name, evaluation_code, section, section_order, question_code,
question_text, question_type, question_order, required, options,
correct_answer, points, weight, difficulty, competency, help_text, feedback,
time_limit_seconds, tags
```

Question-type tokens are mapped too (e.g. `opcion_unica`/`single_choice` →
`q_single_choice`). Options are split on `|` or `;`; correct answers are matched
against option text.

## Validation & issues

Each row is validated and problems are reported with severity, row, column,
original value, problem, and suggested correction:

- missing question text (error)
- unsupported question type (error)
- duplicate question code (error)
- choice question with < 2 options (error)
- correct answer absent from options (warning)
- invalid points/weight/order/time (warning)
- invalid boolean for `required` (warning)

Rows with errors are omitted; the reviewer can additionally exclude/include any
row from the issues table. Valid rows are grouped into sections and converted
into a draft assessment.

## Export safety

Future CSV exports are protected from formula injection: `shared/sanitize.ts#
guardCsvCell` prefixes cells starting with `= + - @` (and control chars) with an
apostrophe, and `csvField` quotes/escapes separators.

## Tests

`imports/imports.test.ts` covers CSV parsing, Spanish header mapping, conversion
to a draft (never published), each issue category, section grouping, row
exclusion, and the CSV injection guard.

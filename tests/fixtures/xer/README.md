# XER Test Fixtures

All files use real tab characters as field delimiters (as required by the XER format).

## Files

| File | Description | Expected confidence |
|------|-------------|-------------------|
| `minimal-valid.xer` | Simplest valid XER: all 5 required tables, 2 activities, 1 relationship | `full` |
| `empty-schedule.xer` | ERMHDR + PROJECT only — no TASK/CALENDAR/PROJWBS/TASKPRED | `failed` |
| `missing-taskpred.xer` | PROJECT, CALENDAR, PROJWBS, TASK present but no TASKPRED | `partial` |
| `missing-calendar.xer` | PROJECT, PROJWBS, TASK, TASKPRED present but no CALENDAR | `partial` |
| `field-mismatch.xer` | One TASK row has too few fields → skipped, other row parsed | varies |
| `unknown-tables.xer` | minimal-valid + FINTMPL, POBS, SCHEDOPTIONS extra tables | `full` |
| `no-terminator.xer` | Same as minimal-valid but missing the `%E` line | `full` + warning |
| `multi-project.xer` | Two PROJECT rows, one task each | `partial` |

## File Details

### `minimal-valid.xer`
The simplest possible valid XER file. Contains all five required tables (PROJECT, CALENDAR,
PROJWBS, TASK, TASKPRED) with minimal data: 2 activities (TASK-001, TASK-002) and 1 FS
relationship. Ends with %E. Expected parse confidence: `full`.

### `empty-schedule.xer`
ERMHDR + PROJECT table only. No TASK, TASKPRED, CALENDAR, or PROJWBS tables. Produces
MISSING_TABLE_TASK, MISSING_TABLE_TASKPRED, MISSING_TABLE_CALENDAR, MISSING_TABLE_PROJWBS
errors. Since no activities are parsed, confidence is `failed`.

### `missing-taskpred.xer`
Has PROJECT, CALENDAR, PROJWBS, and TASK tables but no TASKPRED table. Produces
MISSING_TABLE_TASKPRED error. Confidence: `partial`.

### `missing-calendar.xer`
Has PROJECT, PROJWBS, TASK, and TASKPRED tables but no CALENDAR table. The TASKPRED
relationship references task 3002 which does not exist in the TASK table (only 3001 is
present), so ORPHAN_PRED_TASK errors are also expected. Confidence: `partial`.

### `field-mismatch.xer`
Contains a TASK row with fewer fields than the header defines (only 8 fields instead of 13).
That row is skipped with a ROW_FIELD_COUNT_MISMATCH error. The second row is valid and parsed.
Expected: 1 activity parsed, 1 skipped.

### `unknown-tables.xer`
Based on minimal-valid.xer but with three extra unknown tables appended before %E: FINTMPL,
POBS, and SCHEDOPTIONS. These are stored in raw.tables but do not cause errors. Used to
verify that the parser passes through unknown tables.

### `no-terminator.xer`
Identical to minimal-valid.xer but without the trailing `%E` line. The parser finishes
gracefully, parses all data, and adds a MISSING_TERMINATOR warning (not error).

### `multi-project.xer`
Contains two PROJECT rows (PROJ1 and PROJ2) and one TASK per project. Used to verify
multi-project parsing and activity filtering by proj_id.

## Known Limitations

**TEST-2.B1 (Windows-1252 encoding)**: Requires a binary fixture file with actual
Windows-1252 encoded bytes. This test is skipped because generating binary fixtures with
specific byte sequences portably in shell is not reliable. The parser supports Windows-1252
via iconv-lite; the coverage gap is documented here.

## Adding real-world XER files

1. Export from your P6 installation (File → Export → XER)
2. Copy the .xer file here
3. Rename to `real-world-[project-name].xer`
4. Document the P6 version and project type in this table
5. Run tests to verify the parser handles it

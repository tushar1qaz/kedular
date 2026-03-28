export type ParseErrorSeverity = 'fatal' | 'data_loss' | 'recoverable';

export interface ParseError {
  code: string;           // machine-readable: 'MISSING_TABLE', 'INVALID_DATE', etc.
  message: string;        // human-readable
  table?: string;         // which XER table
  row?: number;           // which row in the file
  field?: string;         // which field
  severity: ParseErrorSeverity;
}

export interface ParseWarning {
  code: string;
  message: string;
  table?: string;
  field?: string;
}

export const XER_ERRORS = {
  // Fatal — parse cannot continue
  FILE_EMPTY:              { severity: 'fatal' as const, message: 'File is empty or contains no data' },
  NO_ERMHDR:               { severity: 'fatal' as const, message: 'Missing ERMHDR — this may not be a valid XER file' },
  NO_TABLE_MARKERS:        { severity: 'fatal' as const, message: 'No %T table markers found — this is not an XER file' },
  ENCODING_UNREADABLE:     { severity: 'fatal' as const, message: 'File encoding could not be determined — file may be binary or corrupted' },

  // Data loss — parse continues but some data is lost
  MISSING_TABLE_PROJECT:   { severity: 'data_loss' as const, message: 'Missing PROJECT table — cannot determine project metadata' },
  MISSING_TABLE_TASK:      { severity: 'data_loss' as const, message: 'Missing TASK table — no activities will be imported' },
  MISSING_TABLE_TASKPRED:  { severity: 'data_loss' as const, message: 'Missing TASKPRED table — no relationships will be imported' },
  MISSING_TABLE_CALENDAR:  { severity: 'data_loss' as const, message: 'Missing CALENDAR table — will use default 5-day calendar' },
  MISSING_TABLE_PROJWBS:   { severity: 'data_loss' as const, message: 'Missing PROJWBS table — no WBS hierarchy will be imported' },
  ROW_FIELD_COUNT_MISMATCH:{ severity: 'data_loss' as const, message: 'Row has {actual} fields but header defines {expected} — row skipped' },
  INVALID_DATE_FORMAT:     { severity: 'data_loss' as const, message: 'Date "{value}" in field {field} could not be parsed — stored as null' },
  INVALID_NUMBER_FORMAT:   { severity: 'data_loss' as const, message: 'Number "{value}" in field {field} could not be parsed — stored as 0' },
  DUPLICATE_TASK_CODE:     { severity: 'data_loss' as const, message: 'Duplicate task_code "{value}" found — second occurrence skipped' },

  // Recoverable — parse continues with reasonable defaults
  MISSING_TABLE_RSRC:      { severity: 'recoverable' as const, message: 'Missing RSRC table — no resources will be imported' },
  MISSING_TABLE_TASKRSRC:  { severity: 'recoverable' as const, message: 'Missing TASKRSRC table — no resource assignments will be imported' },
  MISSING_TABLE_CALDATA:   { severity: 'recoverable' as const, message: 'Missing CALDATA table — calendars will use default work patterns' },
  ORPHAN_TASK_WBS:         { severity: 'recoverable' as const, message: 'Activity "{code}" references WBS "{wbs_id}" which does not exist' },
  ORPHAN_TASK_CALENDAR:    { severity: 'recoverable' as const, message: 'Activity "{code}" references calendar "{clndr_id}" which does not exist' },
  ORPHAN_PRED_TASK:        { severity: 'recoverable' as const, message: 'Relationship references task_id "{id}" which does not exist — skipped' },
  UNKNOWN_TASK_TYPE:       { severity: 'recoverable' as const, message: 'Unknown task_type "{value}" — defaulting to task_dependent' },
  UNKNOWN_STATUS_CODE:     { severity: 'recoverable' as const, message: 'Unknown status_code "{value}" — defaulting to not_started' },
  UNKNOWN_PRED_TYPE:       { severity: 'recoverable' as const, message: 'Unknown pred_type "{value}" — defaulting to PR_FS' },
  EMPTY_TASK_NAME:         { severity: 'recoverable' as const, message: 'Activity "{code}" has empty task_name — using task_code as name' },
  NEGATIVE_DURATION:       { severity: 'recoverable' as const, message: 'Activity "{code}" has negative remaining duration — set to 0' },
  FUTURE_ACTUAL_DATE:      { severity: 'recoverable' as const, message: 'Activity "{code}" has actual date in the future relative to data date' },
} as const;

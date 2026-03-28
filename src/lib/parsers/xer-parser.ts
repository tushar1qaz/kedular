import iconv from 'iconv-lite';
import { ParseError, ParseWarning, XER_ERRORS } from './xer-errors';

// ── Typed row interfaces ─────────────────────────────────────────────────────

export interface XerProject {
  proj_id: string;
  proj_short_name: string;
  proj_name: string;
  data_date: string;
  plan_start_date?: string;
  scd_end_date?: string;
  [key: string]: string | undefined;
}

export interface XerActivity {
  task_id: string;
  proj_id: string;
  wbs_id: string;
  clndr_id: string;
  task_code: string;
  task_name: string;
  task_type: string;
  status_code: string;
  target_start_date: string;
  target_end_date: string;
  act_start_date?: string;
  act_end_date?: string;
  remain_drtn_hr_cnt: string;
  total_float_hr_cnt: string;
  phys_complete_pct: string;
  _raw: Record<string, string>;
  [key: string]: string | Record<string, string> | undefined;
}

export interface XerRelationship {
  task_pred_id: string;
  task_id: string;
  pred_task_id: string;
  proj_id: string;
  pred_type: string;
  lag_hr_cnt: string;
  _raw: Record<string, string>;
  [key: string]: string | Record<string, string> | undefined;
}

export interface XerCalendar {
  clndr_id: string;
  clndr_name: string;
  day_hr_cnt: string;
  _raw: Record<string, string>;
  [key: string]: string | Record<string, string> | undefined;
}

export interface XerWbsNode {
  wbs_id: string;
  proj_id: string;
  parent_wbs_id: string;
  wbs_short_name: string;
  wbs_name: string;
  seq_num: string;
  _raw: Record<string, string>;
  [key: string]: string | Record<string, string> | undefined;
}

// ── Raw table shape ──────────────────────────────────────────────────────────

export interface XerRawTable {
  fields: string[];
  rows: string[][];
}

export interface XerRawTables {
  ermhdr: { fields: string[]; rows: string[][] };
  tables: { [tableName: string]: XerRawTable };
  encoding: string;
  version: string;
}

// ── Top-level result ─────────────────────────────────────────────────────────

export interface ParseStats {
  tablesFound: number;
  tablesExpected: number;
  tablesParsed: string[];
  tablesMissing: string[];
  tablesUnknown: string[];
  totalRows: number;
  rowsSkipped: number;
  activitiesParsed: number;
  relationshipsParsed: number;
  resourcesParsed: number;
  calendarsParsed: number;
  wbsNodesParsed: number;
  encodingDetected: string;
  p6VersionDetected: string;
  parseTimeMs: number;
}

export interface ParsedXer {
  raw: XerRawTables;
  ermhdr: {
    exportDate: Date | null;
    exportUser: string;
    p6Version: string;
  };
  projects: XerProject[];
  calendars: XerCalendar[];
  wbsNodes: XerWbsNode[];
  activities: XerActivity[];
  relationships: XerRelationship[];
  resources: Record<string, string>[];
  assignments: Record<string, string>[];
  errors: ParseError[];
  warnings: ParseWarning[];
  stats: ParseStats;
}

// ── Required tables for health checks ───────────────────────────────────────

const REQUIRED_TABLES: { name: string; errorKey: keyof typeof XER_ERRORS }[] = [
  { name: 'PROJECT',  errorKey: 'MISSING_TABLE_PROJECT' },
  { name: 'TASK',     errorKey: 'MISSING_TABLE_TASK' },
  { name: 'TASKPRED', errorKey: 'MISSING_TABLE_TASKPRED' },
  { name: 'CALENDAR', errorKey: 'MISSING_TABLE_CALENDAR' },
  { name: 'PROJWBS',  errorKey: 'MISSING_TABLE_PROJWBS' },
];

// Date fields by table
const DATE_FIELDS: Record<string, string[]> = {
  PROJECT:  ['data_date', 'plan_start_date', 'scd_end_date', 'last_recalc_date'],
  TASK:     ['target_start_date', 'target_end_date', 'act_start_date', 'act_end_date',
             'early_start_date', 'early_end_date', 'late_start_date', 'late_end_date',
             'restart_date', 'reend_date'],
  TASKPRED: [],
  CALENDAR: [],
  PROJWBS:  [],
};

// Numeric fields by table
const NUMERIC_FIELDS: Record<string, string[]> = {
  TASK:     ['remain_drtn_hr_cnt', 'total_float_hr_cnt', 'phys_complete_pct',
             'target_drtn_hr_cnt', 'cstr_date', 'free_float_hr_cnt'],
  TASKPRED: ['lag_hr_cnt'],
  CALENDAR: ['day_hr_cnt'],
  PROJWBS:  ['seq_num'],
};

// ── Main parser ──────────────────────────────────────────────────────────────

export function parseXer(
  fileContent: Buffer | string,
  encoding?: string
): ParsedXer {
  const startTime = Date.now();
  const errors: ParseError[] = [];
  const warnings: ParseWarning[] = [];
  let detectedEncoding = 'utf-8';

  // ── 1. Decode buffer ───────────────────────────────────────────────────────
  let content: string;
  if (Buffer.isBuffer(fileContent)) {
    if (fileContent[0] === 0xEF && fileContent[1] === 0xBB && fileContent[2] === 0xBF) {
      content = fileContent.slice(3).toString('utf8');
      detectedEncoding = 'utf-8-bom';
    } else if (encoding) {
      detectedEncoding = encoding;
      content = iconv.decode(fileContent, encoding);
    } else {
      const hasHighBytes = Array.from(fileContent).some((b: number) => b > 127);
      detectedEncoding = hasHighBytes ? 'windows-1252' : 'utf-8';
      content = iconv.decode(fileContent, detectedEncoding);
    }
  } else {
    content = fileContent;
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
      detectedEncoding = 'utf-8-bom';
    }
  }

  // ── 2. Handle empty ────────────────────────────────────────────────────────
  if (!content || content.trim() === '') {
    errors.push({ ...XER_ERRORS.FILE_EMPTY, code: 'FILE_EMPTY' });
    return createEmptyParsedXer(errors, warnings, detectedEncoding, startTime);
  }

  // ── 3. Normalise line endings ──────────────────────────────────────────────
  const lines = content.split(/\r\n|\r|\n/);

  const raw: XerRawTables = {
    ermhdr: { fields: [], rows: [] },
    tables: {},
    encoding: detectedEncoding,
    version: '',
  };

  // ── 4. Parse ERMHDR (first non-empty line) ─────────────────────────────────
  let startLineIdx = 0;
  while (startLineIdx < lines.length && lines[startLineIdx].trim() === '') {
    startLineIdx++;
  }

  const firstLine = lines[startLineIdx] || '';
  if (!firstLine.startsWith('ERMHDR')) {
    errors.push({ ...XER_ERRORS.NO_ERMHDR, code: 'NO_ERMHDR' });
  } else {
    const ermhdrValues = firstLine.split('\t');
    raw.ermhdr.fields = ['type', 'version', 'export_date', 'db_name', 'user_name'];
    raw.ermhdr.rows = [ermhdrValues];
    raw.version = ermhdrValues[1] || '';
  }

  // ── 5. Parse tables ────────────────────────────────────────────────────────
  let currentTableName = '';
  let currentFields: string[] = [];
  let hasTerminator = false;
  let rowsSkipped = 0;
  let fileRowNumber = startLineIdx + 1; // 1-based

  for (let i = startLineIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    fileRowNumber = i + 1;

    if (line === '' || line === '\r') continue;

    if (line.startsWith('%T\t') || line === '%T') {
      currentTableName = line.substring(3).trim();
      if (!raw.tables[currentTableName]) {
        raw.tables[currentTableName] = { fields: [], rows: [] };
      }
      currentFields = [];
    } else if (line.startsWith('%F\t') || line === '%F') {
      currentFields = line.substring(3).split('\t');
      if (raw.tables[currentTableName]) {
        raw.tables[currentTableName].fields = currentFields;
      }
    } else if (line.startsWith('%R\t') || line === '%R') {
      const rowValues = line.substring(3).split('\t');
      if (raw.tables[currentTableName]) {
        const expectedCount = currentFields.length;
        const actualCount = rowValues.length;
        if (actualCount < expectedCount) {
          // Skip row with too few fields
          errors.push({
            ...XER_ERRORS.ROW_FIELD_COUNT_MISMATCH,
            code: 'ROW_FIELD_COUNT_MISMATCH',
            message: `Row has ${actualCount} fields but header defines ${expectedCount} — row skipped`,
            table: currentTableName,
            row: fileRowNumber,
          });
          rowsSkipped++;
        } else {
          // Extra fields: silently truncate (extra values ignored per spec)
          raw.tables[currentTableName].rows.push(rowValues.slice(0, expectedCount));
        }
      }
    } else if (line.startsWith('%E')) {
      hasTerminator = true;
      break;
    }
    // Lines that don't match any marker are silently ignored
  }

  if (!hasTerminator) {
    warnings.push({
      code: 'MISSING_TERMINATOR',
      message: 'XER file does not end with %E terminator — file may be truncated',
    });
  }

  // ── 6. Check required tables ───────────────────────────────────────────────
  const tablesMissing: string[] = [];
  for (const { name, errorKey } of REQUIRED_TABLES) {
    if (!raw.tables[name]) {
      tablesMissing.push(name);
      errors.push({ ...XER_ERRORS[errorKey], code: errorKey });
    }
  }

  // ── 7. Validate and map tables ─────────────────────────────────────────────
  const activities = mapTable<XerActivity>(raw, 'TASK', errors, warnings);
  const relationships = mapTable<XerRelationship>(raw, 'TASKPRED', errors, warnings);
  const wbsNodes = mapTable<XerWbsNode>(raw, 'PROJWBS', errors, warnings);
  const calendars = mapTable<XerCalendar>(raw, 'CALENDAR', errors, warnings);
  const projects = mapTable<XerProject>(raw, 'PROJECT', errors, warnings);
  const resources = mapTable<Record<string, string>>(raw, 'RSRC', errors, warnings);
  const assignments = mapTable<Record<string, string>>(raw, 'TASKRSRC', errors, warnings);

  // ── 8. Duplicate task_code detection ──────────────────────────────────────
  const seenCodes = new Set<string>();
  for (const act of activities) {
    const code = act.task_code;
    if (code) {
      if (seenCodes.has(code)) {
        errors.push({
          ...XER_ERRORS.DUPLICATE_TASK_CODE,
          code: 'DUPLICATE_TASK_CODE',
          message: `Duplicate task_code "${code}" found — second occurrence skipped`,
          table: 'TASK',
          field: 'task_code',
        });
      } else {
        seenCodes.add(code);
      }
    }
  }

  // ── 9. Orphan reference checks ─────────────────────────────────────────────
  const taskIds = new Set(activities.map(a => a.task_id));
  const wbsIds = new Set(wbsNodes.map(w => w.wbs_id));
  const calendarIds = new Set(calendars.map(c => c.clndr_id));

  for (const act of activities) {
    if (act.wbs_id && !wbsIds.has(act.wbs_id)) {
      warnings.push({
        code: 'ORPHAN_TASK_WBS',
        message: `Activity "${act.task_code}" references WBS "${act.wbs_id}" which does not exist`,
        table: 'TASK',
        field: 'wbs_id',
      });
    }
    if (act.clndr_id && !calendarIds.has(act.clndr_id)) {
      warnings.push({
        code: 'ORPHAN_TASK_CALENDAR',
        message: `Activity "${act.task_code}" references calendar "${act.clndr_id}" which does not exist`,
        table: 'TASK',
        field: 'clndr_id',
      });
    }
  }

  const validRelationships: XerRelationship[] = [];
  for (const rel of relationships) {
    let orphan = false;
    if (rel.task_id && !taskIds.has(rel.task_id)) {
      errors.push({
        ...XER_ERRORS.ORPHAN_PRED_TASK,
        code: 'ORPHAN_PRED_TASK',
        message: `Relationship references task_id "${rel.task_id}" which does not exist — skipped`,
        table: 'TASKPRED',
        field: 'task_id',
      });
      orphan = true;
    }
    if (rel.pred_task_id && !taskIds.has(rel.pred_task_id)) {
      errors.push({
        ...XER_ERRORS.ORPHAN_PRED_TASK,
        code: 'ORPHAN_PRED_TASK',
        message: `Relationship references pred_task_id "${rel.pred_task_id}" which does not exist — skipped`,
        table: 'TASKPRED',
        field: 'pred_task_id',
      });
      orphan = true;
    }
    if (!orphan) validRelationships.push(rel);
  }

  // ── 10. Compute stats ──────────────────────────────────────────────────────
  const knownTables = new Set(REQUIRED_TABLES.map(t => t.name).concat(['RSRC', 'TASKRSRC', 'CALDATA']));
  const tablesFound = Object.keys(raw.tables);
  const tablesUnknown = tablesFound.filter(t => !knownTables.has(t));

  let totalRows = 0;
  for (const t of Object.values(raw.tables)) {
    totalRows += t.rows.length;
  }

  const stats: ParseStats = {
    tablesFound: tablesFound.length,
    tablesExpected: REQUIRED_TABLES.length,
    tablesParsed: tablesFound,
    tablesMissing,
    tablesUnknown,
    totalRows,
    rowsSkipped,
    activitiesParsed: activities.length,
    relationshipsParsed: validRelationships.length,
    resourcesParsed: resources.length,
    calendarsParsed: calendars.length,
    wbsNodesParsed: wbsNodes.length,
    encodingDetected: detectedEncoding,
    p6VersionDetected: raw.version,
    parseTimeMs: Date.now() - startTime,
  };

  return {
    raw,
    ermhdr: {
      exportDate: parseXerDate(raw.ermhdr.rows[0]?.[2]),
      exportUser: raw.ermhdr.rows[0]?.[4] || '',
      p6Version: raw.version,
    },
    projects,
    calendars,
    wbsNodes,
    activities,
    relationships: validRelationships,
    resources,
    assignments,
    errors,
    warnings,
    stats,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createEmptyParsedXer(
  errors: ParseError[],
  warnings: ParseWarning[],
  encoding: string,
  startTime: number
): ParsedXer {
  const stats: ParseStats = {
    tablesFound: 0,
    tablesExpected: REQUIRED_TABLES.length,
    tablesParsed: [],
    tablesMissing: REQUIRED_TABLES.map(t => t.name),
    tablesUnknown: [],
    totalRows: 0,
    rowsSkipped: 0,
    activitiesParsed: 0,
    relationshipsParsed: 0,
    resourcesParsed: 0,
    calendarsParsed: 0,
    wbsNodesParsed: 0,
    encodingDetected: encoding,
    p6VersionDetected: '',
    parseTimeMs: Date.now() - startTime,
  };
  return {
    raw: { ermhdr: { fields: [], rows: [] }, tables: {}, encoding, version: '' },
    ermhdr: { exportDate: null, exportUser: '', p6Version: '' },
    projects: [],
    calendars: [],
    wbsNodes: [],
    activities: [],
    relationships: [],
    resources: [],
    assignments: [],
    errors,
    warnings,
    stats,
  };
}

function mapTable<T extends Record<string, unknown>>(
  raw: XerRawTables,
  tableName: string,
  errors: ParseError[],
  warnings: ParseWarning[]
): T[] {
  const table = raw.tables[tableName];
  if (!table) return [];

  const dateFields = DATE_FIELDS[tableName] || [];
  const numericFields = NUMERIC_FIELDS[tableName] || [];

  return table.rows.map((row, rowIdx) => {
    const obj: Record<string, unknown> = { _raw: {} };
    table.fields.forEach((field, index) => {
      const val = row[index] !== undefined ? row[index] : '';
      (obj._raw as Record<string, string>)[field] = val;

      if (dateFields.includes(field)) {
        // Always preserve raw string — empty stays '', invalid gets an error but value kept
        if (val !== '' && val !== undefined) {
          const parsed = parseXerDate(val);
          if (parsed === null) {
            errors.push({
              ...XER_ERRORS.INVALID_DATE_FORMAT,
              code: 'INVALID_DATE_FORMAT',
              message: `Date "${val}" in field ${field} could not be parsed — stored as null`,
              table: tableName,
              row: rowIdx + 1,
              field,
            });
          }
        }
        obj[field] = val; // Raw string preserved; normaliser handles conversion
      } else if (numericFields.includes(field)) {
        if (val !== '' && val !== undefined && isNaN(parseFloat(val))) {
          errors.push({
            ...XER_ERRORS.INVALID_NUMBER_FORMAT,
            code: 'INVALID_NUMBER_FORMAT',
            message: `Number "${val}" in field ${field} could not be parsed — stored as 0`,
            table: tableName,
            row: rowIdx + 1,
            field,
          });
          obj[field] = '0';
        } else {
          obj[field] = val;
        }
      } else {
        obj[field] = val;
      }
    });
    return obj as T;
  });
}

export function parseXerDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  // XER dates: "YYYY-MM-DD HH:mm" or "YYYY-MM-DD"
  const normalised = dateStr.trim().replace(' ', 'T');
  const date = new Date(normalised);
  return isNaN(date.getTime()) ? null : date;
}

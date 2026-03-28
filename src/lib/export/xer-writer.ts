import iconv from 'iconv-lite';
import { XerRawTables } from '../parsers/xer-parser';

// ScheduleChange shape from the DB schema (schedule_changes table)
export interface ScheduleChange {
  id?: string;
  project_id?: string | null;
  user_id?: string | null;
  created_at?: Date | null;
  session_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  change_type?: string | null;
  field?: string | null;
  old_value?: unknown;
  new_value?: unknown;
  reverted?: boolean | null;
}

// Field mapping: canonical field → XER field name
export const ACTIVITY_FIELD_MAP: Record<string, string> = {
  name: 'task_name',
  code: 'task_code',
  planned_start: 'target_start_date',
  planned_finish: 'target_end_date',
  actual_start: 'act_start_date',
  actual_finish: 'act_end_date',
  remaining_duration: 'remain_drtn_hr_cnt', // days × hoursPerDay → hours
  total_float: 'total_float_hr_cnt',
  percent_complete: 'phys_complete_pct',
  status: 'status_code',   // 'not_started'→'TK_NotStart', 'in_progress'→'TK_Active', 'complete'→'TK_Complete'
  type: 'task_type',       // 'task_dependent'→'TT_Task', 'task_milestone'→'TT_Mile', 'LOE'→'TT_LOE', 'WBS_summary'→'TT_WBS'
};

export const RELATIONSHIP_FIELD_MAP: Record<string, string> = {
  type: 'pred_type',       // 'FS'→'PR_FS', 'SS'→'PR_SS', 'FF'→'PR_FF', 'SF'→'PR_SF'
  lag_days: 'lag_hr_cnt',  // days × hoursPerDay → hours
};

export interface XerWriterOptions {
  encoding?: string;     // default 'windows-1252'
  hoursPerDay?: number;  // default 8
  exportUser?: string;   // for ERMHDR
}

// Status mapping: canonical → XER
const STATUS_MAP: Record<string, string> = {
  not_started: 'TK_NotStart',
  in_progress: 'TK_Active',
  complete: 'TK_Complete',
};

// Type mapping: canonical → XER
const TASK_TYPE_MAP: Record<string, string> = {
  task_dependent: 'TT_Task',
  task_milestone: 'TT_Mile',
  LOE: 'TT_LOE',
  WBS_summary: 'TT_WBS',
};

// Relationship type mapping: canonical → XER
const REL_TYPE_MAP: Record<string, string> = {
  FS: 'PR_FS',
  SS: 'PR_SS',
  FF: 'PR_FF',
  SF: 'PR_SF',
};

// Map from entity_type to XER table name and ID field
const ENTITY_TABLE_MAP: Record<string, { table: string; idField: string }> = {
  activity: { table: 'TASK', idField: 'task_id' },
  relationship: { table: 'TASKPRED', idField: 'task_pred_id' },
  resource: { table: 'RSRC', idField: 'rsrc_id' },
  wbs: { table: 'PROJWBS', idField: 'wbs_id' },
  calendar: { table: 'CALENDAR', idField: 'clndr_id' },
};

function formatXerDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function convertValue(
  xerField: string,
  canonicalField: string,
  value: unknown,
  hoursPerDay: number
): string {
  if (value === null || value === undefined) return '';

  // Duration/float fields: days → hours
  if (
    canonicalField === 'remaining_duration' ||
    canonicalField === 'total_float' ||
    canonicalField === 'lag_days'
  ) {
    const days = typeof value === 'number' ? value : parseFloat(String(value));
    return String(isNaN(days) ? 0 : days * hoursPerDay);
  }

  // Status mapping
  if (canonicalField === 'status') {
    return STATUS_MAP[String(value)] ?? String(value);
  }

  // Task type mapping
  if (canonicalField === 'type' && xerField === 'task_type') {
    return TASK_TYPE_MAP[String(value)] ?? String(value);
  }

  // Relationship type mapping
  if (canonicalField === 'type' && xerField === 'pred_type') {
    return REL_TYPE_MAP[String(value)] ?? String(value);
  }

  // Date fields
  if (value instanceof Date) {
    return formatXerDate(value);
  }

  return String(value);
}

/**
 * Deep-clone XerRawTables, preserving all table rows.
 */
function cloneRawTables(raw: XerRawTables): XerRawTables {
  return {
    ermhdr: {
      fields: [...raw.ermhdr.fields],
      rows: raw.ermhdr.rows.map(r => [...r]),
    },
    tables: Object.fromEntries(
      Object.entries(raw.tables).map(([name, table]) => [
        name,
        {
          fields: [...table.fields],
          rows: table.rows.map(r => [...r]),
        },
      ])
    ),
    encoding: raw.encoding,
    version: raw.version,
  };
}

/**
 * Find a row in a table by matching the ID field.
 * Returns the row index, or -1 if not found.
 */
function findRowIndex(
  fields: string[],
  rows: string[][],
  idField: string,
  idValue: string
): number {
  const fieldIdx = fields.indexOf(idField);
  if (fieldIdx < 0) return -1;
  return rows.findIndex(row => row[fieldIdx] === idValue);
}

/**
 * Apply a single ScheduleChange to the cloned raw tables.
 */
function applyChange(
  tables: XerRawTables['tables'],
  change: ScheduleChange,
  hoursPerDay: number
): void {
  const entityType = change.entity_type ?? '';
  const entityId = change.entity_id ?? '';
  const changeType = change.change_type ?? '';

  const mapping = ENTITY_TABLE_MAP[entityType];
  if (!mapping) return; // Unknown entity type — skip

  const { table: tableName, idField } = mapping;
  const table = tables[tableName];

  if (changeType === 'update') {
    if (!table) return;
    const rowIdx = findRowIndex(table.fields, table.rows, idField, entityId);
    if (rowIdx < 0) return;

    const canonicalField = change.field ?? '';
    // Determine the XER field name
    let xerField: string;
    if (entityType === 'activity') {
      xerField = ACTIVITY_FIELD_MAP[canonicalField] ?? canonicalField;
    } else if (entityType === 'relationship') {
      xerField = RELATIONSHIP_FIELD_MAP[canonicalField] ?? canonicalField;
    } else {
      xerField = canonicalField;
    }

    const fieldIdx = table.fields.indexOf(xerField);
    if (fieldIdx < 0) return; // Field not in this table

    const converted = convertValue(xerField, canonicalField, change.new_value, hoursPerDay);
    table.rows[rowIdx][fieldIdx] = converted;
  } else if (changeType === 'create') {
    // new_value should be an object with field values
    if (!change.new_value || typeof change.new_value !== 'object') return;
    const newValues = change.new_value as Record<string, unknown>;

    // Ensure the table exists
    if (!tables[tableName]) {
      tables[tableName] = { fields: [], rows: [] };
    }
    const t = tables[tableName];

    // Build a new row aligned with the existing fields
    const newRow: string[] = t.fields.map(f => {
      // Try to find the canonical equivalent
      let canonicalField = f;
      // Reverse-map XER field → canonical
      for (const [canon, xer] of Object.entries(ACTIVITY_FIELD_MAP)) {
        if (xer === f) { canonicalField = canon; break; }
      }
      for (const [canon, xer] of Object.entries(RELATIONSHIP_FIELD_MAP)) {
        if (xer === f) { canonicalField = canon; break; }
      }
      const val = newValues[canonicalField] ?? newValues[f] ?? '';
      return convertValue(f, canonicalField, val, hoursPerDay);
    });
    t.rows.push(newRow);
  } else if (changeType === 'delete') {
    if (!table) return;
    const rowIdx = findRowIndex(table.fields, table.rows, idField, entityId);
    if (rowIdx < 0) return;
    table.rows.splice(rowIdx, 1);
  }
}

/**
 * Serialize XerRawTables back to XER text format.
 */
function serializeRawTables(raw: XerRawTables, exportUser?: string): string {
  const lines: string[] = [];

  // ERMHDR line: update export_date (index 2), preserve everything else
  if (raw.ermhdr.rows.length > 0) {
    const ermRow = [...raw.ermhdr.rows[0]];
    // Index 2 is export_date
    ermRow[2] = formatXerDate(new Date());
    if (exportUser && ermRow.length > 4) {
      ermRow[4] = exportUser;
    }
    lines.push(ermRow.join('\t'));
  } else {
    // No ERMHDR — write a minimal one
    lines.push(`ERMHDR\t${raw.version || '19.12.0.0'}\t${formatXerDate(new Date())}\teppm\t${exportUser ?? 'admin'}`);
  }

  // Write each table
  for (const [tableName, table] of Object.entries(raw.tables)) {
    lines.push(`%T\t${tableName}`);
    lines.push(`%F\t${table.fields.join('\t')}`);
    for (const row of table.rows) {
      lines.push(`%R\t${row.join('\t')}`);
    }
  }

  lines.push('%E');
  return lines.join('\n') + '\n';
}

/**
 * Round-trip XER writer.
 * 1. Deep-clone rawTables
 * 2. Apply each change in order
 * 3. Update ERMHDR export date
 * 4. Serialize and encode
 */
export function writeXerRoundTrip(
  rawTables: XerRawTables,
  changes: ScheduleChange[],
  options?: XerWriterOptions
): Buffer {
  const encoding = options?.encoding ?? 'windows-1252';
  const hoursPerDay = options?.hoursPerDay ?? 8;
  const exportUser = options?.exportUser;

  // 1. Deep-clone
  const cloned = cloneRawTables(rawTables);

  // 2. Apply changes ordered by created_at
  const sorted = [...changes].sort((a, b) => {
    const ta = a.created_at ? a.created_at.getTime() : 0;
    const tb = b.created_at ? b.created_at.getTime() : 0;
    return ta - tb;
  });

  for (const change of sorted) {
    if (!change.reverted) {
      applyChange(cloned.tables, change, hoursPerDay);
    }
  }

  // 3 & 4. Serialize and encode
  const text = serializeRawTables(cloned, exportUser);
  return iconv.encode(text, encoding);
}

import { ParseError, XER_ERRORS } from './xer-errors';

export interface XerRawTables {
  ermhdr: { fields: string[]; rows: string[][] };
  tables: {
    [tableName: string]: {
      fields: string[];
      rows: string[][];
    };
  };
  encoding: string;
  version: string;
}

export interface ParsedXer {
  raw: XerRawTables;
  ermhdr: {
    exportDate: Date | null;
    exportUser: string;
    p6Version: string;
  };
  projects: any[];
  calendars: any[];
  wbsNodes: any[];
  activities: any[];
  relationships: any[];
  resources: any[];
  assignments: any[];
  errors: ParseError[];
}

export function parseXer(content: string): ParsedXer {
  const lines = content.split(/\r?\n/);
  const errors: ParseError[] = [];
  
  if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
    errors.push({ ...XER_ERRORS.FILE_EMPTY, code: 'FILE_EMPTY' });
    return createEmptyParsedXer(errors);
  }

  const raw: XerRawTables = {
    ermhdr: { fields: [], rows: [] },
    tables: {},
    encoding: 'windows-1252',
    version: '',
  };

  let currentTableName = '';
  let currentFields: string[] = [];

  // Parse ERMHDR
  const firstLine = lines[0];
  if (!firstLine.startsWith('ERMHDR')) {
    errors.push({ ...XER_ERRORS.NO_ERMHDR, code: 'NO_ERMHDR' });
  } else {
    const ermhdrValues = firstLine.split('\t');
    raw.ermhdr.fields = ['type', 'version', 'export_date', 'db_name', 'user_name']; // Standard P6 header fields
    raw.ermhdr.rows = [ermhdrValues];
    raw.version = ermhdrValues[1] || '';
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('%T')) {
      currentTableName = line.substring(3).trim();
      raw.tables[currentTableName] = { fields: [], rows: [] };
    } else if (line.startsWith('%F')) {
      currentFields = line.substring(3).split('\t');
      if (raw.tables[currentTableName]) {
        raw.tables[currentTableName].fields = currentFields;
      }
    } else if (line.startsWith('%R')) {
      const rowValues = line.substring(3).split('\t');
      if (raw.tables[currentTableName]) {
        raw.tables[currentTableName].rows.push(rowValues);
      }
    } else if (line.startsWith('%E')) {
      break;
    }
  }

  // Basic validation
  if (Object.keys(raw.tables).length === 0) {
    errors.push({ ...XER_ERRORS.NO_TABLE_MARKERS, code: 'NO_TABLE_MARKERS' });
  }

  const parsed: ParsedXer = {
    raw,
    ermhdr: {
      exportDate: parseXerDate(raw.ermhdr.rows[0]?.[2]),
      exportUser: raw.ermhdr.rows[0]?.[4] || '',
      p6Version: raw.version,
    },
    projects: mapTable(raw, 'PROJECT'),
    calendars: mapTable(raw, 'CALENDAR'),
    wbsNodes: mapTable(raw, 'PROJWBS'),
    activities: mapTable(raw, 'TASK'),
    relationships: mapTable(raw, 'TASKPRED'),
    resources: mapTable(raw, 'RSRC'),
    assignments: mapTable(raw, 'TASKRSRC'),
    errors,
  };

  return parsed;
}

function createEmptyParsedXer(errors: ParseError[]): ParsedXer {
  return {
    raw: { ermhdr: { fields: [], rows: [] }, tables: {}, encoding: '', version: '' },
    ermhdr: { exportDate: null, exportUser: '', p6Version: '' },
    projects: [],
    calendars: [],
    wbsNodes: [],
    activities: [],
    relationships: [],
    resources: [],
    assignments: [],
    errors,
  };
}

function mapTable(raw: XerRawTables, tableName: string): any[] {
  const table = raw.tables[tableName];
  if (!table) return [];

  return table.rows.map(row => {
    const obj: any = { _raw: {} };
    table.fields.forEach((field, index) => {
      const val = row[index] || '';
      obj[field] = val;
      obj._raw[field] = val;
    });
    return obj;
  });
}

function parseXerDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  // XER dates are usually YYYY-MM-DD or YYYY-MM-DD HH:mm
  const date = new Date(dateStr.replace(' ', 'T'));
  return isNaN(date.getTime()) ? null : date;
}

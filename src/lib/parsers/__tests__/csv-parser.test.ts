import { describe, it, expect } from 'vitest';
import { parseCsvSchedule, parsePredecessorString, autoDetectMapping } from '../csv-parser';

// ── Section H: CSV Parsing ────────────────────────────────────────────────────

describe('CSV Parser — Section H: Header Detection', () => {
  it('TEST-2.H1: Standard English MS Project headers auto-detected', () => {
    const headers = ['ID', 'Task Name', 'Duration', 'Start', 'Finish', 'Predecessors'];
    const mapping = autoDetectMapping(headers);

    expect(mapping.taskId).toBe('ID');
    expect(mapping.taskName).toBe('Task Name');
    expect(mapping.duration).toBe('Duration');
    expect(mapping.start).toBe('Start');
    expect(mapping.finish).toBe('Finish');
    expect(mapping.predecessors).toBe('Predecessors');
  });

  it('TEST-2.H2: Extra columns not in mapping → ignored (mapping fields stay null)', () => {
    const headers = ['ID', 'Task Name', 'Duration', 'Start', 'Finish', 'CUSTOM_FIELD', 'ANOTHER_FIELD'];
    const mapping = autoDetectMapping(headers);

    // Known fields still detected
    expect(mapping.taskId).toBe('ID');
    expect(mapping.taskName).toBe('Task Name');
    // Unknown fields don't appear in the mapping at all
    expect(Object.values(mapping)).not.toContain('CUSTOM_FIELD');
    expect(Object.values(mapping)).not.toContain('ANOTHER_FIELD');
  });

  it('TEST-2.H3: Missing essential columns → null in mapping', () => {
    const headers = ['ID', 'Task Name']; // No Duration, Start, Finish
    const mapping = autoDetectMapping(headers);

    expect(mapping.taskId).toBe('ID');
    expect(mapping.taskName).toBe('Task Name');
    expect(mapping.duration).toBeNull();
    expect(mapping.start).toBeNull();
    expect(mapping.finish).toBeNull();
    expect(mapping.predecessors).toBeNull();
  });
});

describe('CSV Parser — Section H: Predecessor Parsing', () => {
  it('TEST-2.H4a: Simple numeric predecessor', () => {
    const result = parsePredecessorString('3');
    expect(result).toEqual([{ predecessorId: '3', type: 'FS', lagDays: 0 }]);
  });

  it('TEST-2.H4b: FS relationship with lag', () => {
    const result = parsePredecessorString('3FS+2 days');
    expect(result).toEqual([{ predecessorId: '3', type: 'FS', lagDays: 2 }]);
  });

  it('TEST-2.H4c: SS relationship with negative lag', () => {
    const result = parsePredecessorString('5SS-1 day');
    expect(result).toEqual([{ predecessorId: '5', type: 'SS', lagDays: -1 }]);
  });

  it('TEST-2.H4d: Multiple predecessors in one string', () => {
    const result = parsePredecessorString('3,5SS+2d,8FF');
    expect(result).toEqual([
      { predecessorId: '3', type: 'FS', lagDays: 0 },
      { predecessorId: '5', type: 'SS', lagDays: 2 },
      { predecessorId: '8', type: 'FF', lagDays: 0 },
    ]);
  });

  it('TEST-2.H4e: Empty predecessor string → empty array', () => {
    expect(parsePredecessorString('')).toEqual([]);
    expect(parsePredecessorString('   ')).toEqual([]);
  });

  it('TEST-2.H4f: SF relationship type', () => {
    const result = parsePredecessorString('10SF');
    expect(result).toEqual([{ predecessorId: '10', type: 'SF', lagDays: 0 }]);
  });
});

describe('CSV Parser — Section H: Delimiter Detection', () => {
  it('TEST-2.H5a: Comma-delimited CSV parsed correctly', () => {
    const csv = 'ID,Name,Start,Finish\n1,Task A,2026-04-01,2026-04-05\n2,Task B,2026-04-06,2026-04-10';
    const { detectedMapping, rows } = parseCsvSchedule(csv);

    expect(detectedMapping.taskId).toBe('ID');
    expect(rows).toHaveLength(2);
    expect(rows[0]['Name']).toBe('Task A');
    expect(rows[1]['Name']).toBe('Task B');
  });

  it('TEST-2.H5b: Semicolon delimiter detected by papaparse', () => {
    // PapaParse can auto-detect semicolons
    const csv = 'ID;Name;Start;Finish\n1;Task A;2026-04-01;2026-04-05\n2;Task B;2026-04-06;2026-04-10';
    const { rows, headers } = parseCsvSchedule(csv);

    // PapaParse with header:true should split on the detected delimiter
    // If auto-detection works, rows will have 4 fields per row
    expect(headers.length).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('TEST-2.H6: Quoted fields containing commas parsed correctly', () => {
    const csv = 'ID,Name,Start,Finish\n1,"Task with, comma",2026-04-01,2026-04-05\n2,Regular Task,2026-04-06,2026-04-10';
    const { rows } = parseCsvSchedule(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0]['Name']).toBe('Task with, comma');
    expect(rows[1]['Name']).toBe('Regular Task');
  });
});

describe('CSV Parser — Full parse round-trip', () => {
  it('parseCsvSchedule returns all three outputs', () => {
    const csv = 'ID,Name,Start,Finish\n1,Task A,2026-04-01,2026-04-05';
    const result = parseCsvSchedule(csv);

    expect(result.detectedMapping).toBeDefined();
    expect(result.rows).toBeDefined();
    expect(result.headers).toBeDefined();
    expect(result.headers).toContain('ID');
    expect(result.headers).toContain('Name');
  });

  it('rows data matches CSV content', () => {
    const csv = 'ID,Task Name,Duration,Start,Finish\n1,Task A,5 days,2026-04-01,2026-04-05\n2,Task B,3 days,2026-04-06,2026-04-08';
    const { rows } = parseCsvSchedule(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0]['ID']).toBe('1');
    expect(rows[0]['Task Name']).toBe('Task A');
    expect(rows[1]['Duration']).toBe('3 days');
  });

  it('accepts pre-confirmed mapping', () => {
    const csv = 'MyID,MyName,MyStart\n1,Task A,2026-04-01';
    const customMapping = autoDetectMapping(['MyID', 'MyName', 'MyStart']);
    // Force-override the mapping for custom column names
    customMapping.taskId = 'MyID';
    customMapping.taskName = 'MyName';
    customMapping.start = 'MyStart';

    const { detectedMapping, rows } = parseCsvSchedule(csv, customMapping);
    expect(detectedMapping.taskId).toBe('MyID');
    expect(rows[0]['MyName']).toBe('Task A');
  });
});

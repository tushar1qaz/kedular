import { describe, it, expect } from 'vitest';
import { parseCsvSchedule, parsePredecessorString, autoDetectMapping } from '../csv-parser';

describe('CSV Parser', () => {
  it('should auto-detect standard English headers', () => {
    const headers = ['ID', 'Task Name', 'Duration', 'Start', 'Finish', 'Predecessors'];
    const mapping = autoDetectMapping(headers);
    
    expect(mapping.taskId).toBe('ID');
    expect(mapping.taskName).toBe('Task Name');
    expect(mapping.duration).toBe('Duration');
    expect(mapping.start).toBe('Start');
    expect(mapping.finish).toBe('Finish');
    expect(mapping.predecessors).toBe('Predecessors');
  });

  it('should parse MS Project predecessor strings', () => {
    const cases = [
      { input: '3', expected: [{ predecessorId: '3', type: 'FS', lagDays: 0 }] },
      { input: '3FS+2 days', expected: [{ predecessorId: '3', type: 'FS', lagDays: 2 }] },
      { input: '5SS-1 day', expected: [{ predecessorId: '5', type: 'SS', lagDays: -1 }] },
      { input: '3,5SS+2d,8FF', expected: [
        { predecessorId: '3', type: 'FS', lagDays: 0 },
        { predecessorId: '5', type: 'SS', lagDays: 2 },
        { predecessorId: '8', type: 'FF', lagDays: 0 }
      ]},
    ];

    for (const { input, expected } of cases) {
      expect(parsePredecessorString(input)).toEqual(expected);
    }
  });

  it('should parse a CSV content using Papa Parse', () => {
    const csvContent = `ID,Name,Start,Finish\n1,Task A,2026-04-01,2026-04-05\n2,Task B,2026-04-06,2026-04-10`;
    const { detectedMapping, rows } = parseCsvSchedule(csvContent);

    expect(detectedMapping.taskId).toBe('ID');
    expect(detectedMapping.taskName).toBe('Name');
    expect(rows).toHaveLength(2);
    expect(rows[0]['Name']).toBe('Task A');
  });
});

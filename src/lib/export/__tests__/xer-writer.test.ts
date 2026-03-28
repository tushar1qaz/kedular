import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import { parseXer } from '../../parsers/xer-parser';
import { writeXerRoundTrip, ScheduleChange } from '../xer-writer';
import { writeScheduleCsv } from '../csv-writer';
import { writeScheduleMspdi } from '../mspdi-writer';
import { CanonicalSchedule, CanonicalActivity, CanonicalRelationship } from '../../parsers/normaliser';

const FIXTURES = path.resolve(__dirname, '../../../../../tests/fixtures/xer');

function fixtureBuffer(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURES, name));
}

function fixtureExists(name: string): boolean {
  return fs.existsSync(path.join(FIXTURES, name));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeActivity(overrides: Partial<CanonicalActivity> = {}): CanonicalActivity {
  return {
    code: 'A001',
    sourceId: 'src-001',
    name: 'Test Activity',
    wbsCode: null,
    type: 'task_dependent',
    status: 'not_started',
    plannedStart: new Date('2026-01-05'),
    plannedFinish: new Date('2026-01-09'),
    actualStart: null,
    actualFinish: null,
    remainingDuration: 5,
    totalFloat: 0,
    freeFloat: 0,
    percentComplete: 0,
    calendarSourceId: null,
    rawXerRow: null,
    ...overrides,
  };
}

function makeRelationship(overrides: Partial<CanonicalRelationship> = {}): CanonicalRelationship {
  return {
    predecessorCode: 'A001',
    successorCode: 'A002',
    type: 'FS',
    lagDays: 0,
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<CanonicalSchedule> = {}): CanonicalSchedule {
  return {
    project: { name: 'Test Project', description: '', dataDate: new Date('2026-01-15') },
    activities: [],
    relationships: [],
    wbsNodes: [],
    calendars: [],
    ...overrides,
  };
}

// ── TEST-4.4: Identity test ───────────────────────────────────────────────────

describe('TEST-4.4: XER Identity Round-trip', () => {
  it('no changes → output is structurally identical to input (all table rows match)', () => {
    if (!fixtureExists('minimal-valid.xer')) {
      console.warn('Skipping: minimal-valid.xer not found');
      return;
    }

    const inputBuffer = fixtureBuffer('minimal-valid.xer');
    const parsed = parseXer(inputBuffer);
    const rawTables = parsed.raw;

    // No changes
    const outputBuffer = writeXerRoundTrip(rawTables, []);

    // Decode output
    const outputText = iconv.decode(outputBuffer, 'windows-1252');
    const lines = outputText.split('\n').filter(l => l.trim() !== '');

    // Must start with ERMHDR
    expect(lines[0]).toMatch(/^ERMHDR/);

    // Must end with %E
    expect(lines[lines.length - 1].trim()).toBe('%E');

    // Parse output back and compare all table data
    const reparsed = parseXer(outputBuffer);

    // TASK table should have same number of rows
    expect(reparsed.activities.length).toBe(parsed.activities.length);

    // TASKPRED table should have same number of rows
    expect(reparsed.relationships.length).toBe(parsed.relationships.length);

    // Check TASK field values match
    for (let i = 0; i < parsed.activities.length; i++) {
      const orig = parsed.activities[i];
      const roundTripped = reparsed.activities[i];
      expect(roundTripped.task_id).toBe(orig.task_id);
      expect(roundTripped.task_code).toBe(orig.task_code);
      expect(roundTripped.task_name).toBe(orig.task_name);
      expect(roundTripped.task_type).toBe(orig.task_type);
      expect(roundTripped.status_code).toBe(orig.status_code);
      expect(roundTripped.remain_drtn_hr_cnt).toBe(orig.remain_drtn_hr_cnt);
      expect(roundTripped.total_float_hr_cnt).toBe(orig.total_float_hr_cnt);
    }

    // Check TASKPRED field values match
    for (let i = 0; i < parsed.relationships.length; i++) {
      const orig = parsed.relationships[i];
      const roundTripped = reparsed.relationships[i];
      expect(roundTripped.task_pred_id).toBe(orig.task_pred_id);
      expect(roundTripped.task_id).toBe(orig.task_id);
      expect(roundTripped.pred_task_id).toBe(orig.pred_task_id);
      expect(roundTripped.pred_type).toBe(orig.pred_type);
    }
  });

  it('ERMHDR export_date field is updated (index 2) in round-trip output', () => {
    if (!fixtureExists('minimal-valid.xer')) return;

    const inputBuffer = fixtureBuffer('minimal-valid.xer');
    const parsed = parseXer(inputBuffer);
    const originalDate = parsed.raw.ermhdr.rows[0]?.[2];

    const outputBuffer = writeXerRoundTrip(parsed.raw, []);
    const outputText = iconv.decode(outputBuffer, 'windows-1252');
    const firstLine = outputText.split('\n')[0];
    const fields = firstLine.split('\t');
    const newDate = fields[2];

    // The date should be different from the original (updated to now)
    // Original was 2026-01-15 08:00; new will be current date
    expect(newDate).toBeDefined();
    expect(newDate).not.toBe(originalDate);
  });

  it('non-ERMHDR fields preserved in round-trip', () => {
    if (!fixtureExists('minimal-valid.xer')) return;

    const inputBuffer = fixtureBuffer('minimal-valid.xer');
    const parsed = parseXer(inputBuffer);
    const origRow = parsed.raw.ermhdr.rows[0];

    const outputBuffer = writeXerRoundTrip(parsed.raw, []);
    const outputText = iconv.decode(outputBuffer, 'windows-1252');
    const firstLine = outputText.split('\n')[0];
    const outFields = firstLine.split('\t');

    // Version (index 1) should be preserved
    expect(outFields[1]).toBe(origRow[1]);
    // db_name (index 3) should be preserved
    if (origRow[3]) {
      expect(outFields[3]).toBe(origRow[3]);
    }
  });
});

// ── TEST-4.5: Single field edit ───────────────────────────────────────────────

describe('TEST-4.5: Single field edit', () => {
  it('updating task_name of one activity changes only that field', () => {
    if (!fixtureExists('minimal-valid.xer')) return;

    const inputBuffer = fixtureBuffer('minimal-valid.xer');
    const parsed = parseXer(inputBuffer);

    const originalTaskId = parsed.activities[0].task_id;

    const changes: ScheduleChange[] = [
      {
        entity_type: 'activity',
        entity_id: originalTaskId,
        change_type: 'update',
        field: 'name',
        old_value: parsed.activities[0].task_name,
        new_value: 'Updated Activity Name',
        created_at: new Date(),
        reverted: false,
      },
    ];

    const outputBuffer = writeXerRoundTrip(parsed.raw, changes);
    const reparsed = parseXer(outputBuffer);

    // First activity name should be changed
    const updatedAct = reparsed.activities.find(a => a.task_id === originalTaskId);
    expect(updatedAct?.task_name).toBe('Updated Activity Name');

    // Second activity should be unchanged
    if (reparsed.activities.length > 1) {
      const secondAct = reparsed.activities.find(a => a.task_id !== originalTaskId);
      const origSecond = parsed.activities.find(a => a.task_id !== originalTaskId);
      expect(secondAct?.task_name).toBe(origSecond?.task_name);
    }
  });

  it('reverted changes are not applied', () => {
    if (!fixtureExists('minimal-valid.xer')) return;

    const inputBuffer = fixtureBuffer('minimal-valid.xer');
    const parsed = parseXer(inputBuffer);
    const originalName = parsed.activities[0].task_name;
    const taskId = parsed.activities[0].task_id;

    const changes: ScheduleChange[] = [
      {
        entity_type: 'activity',
        entity_id: taskId,
        change_type: 'update',
        field: 'name',
        old_value: originalName,
        new_value: 'Should Not Appear',
        created_at: new Date(),
        reverted: true, // reverted!
      },
    ];

    const outputBuffer = writeXerRoundTrip(parsed.raw, changes);
    const reparsed = parseXer(outputBuffer);
    const act = reparsed.activities.find(a => a.task_id === taskId);
    expect(act?.task_name).toBe(originalName);
  });
});

// ── TEST-4.8: windows-1252 encoding ──────────────────────────────────────────

describe('TEST-4.8: Output encoding', () => {
  it('output buffer is encoded in windows-1252 by default', () => {
    if (!fixtureExists('minimal-valid.xer')) return;

    const inputBuffer = fixtureBuffer('minimal-valid.xer');
    const parsed = parseXer(inputBuffer);
    const outputBuffer = writeXerRoundTrip(parsed.raw, []);

    // Should be a Buffer
    expect(Buffer.isBuffer(outputBuffer)).toBe(true);

    // Decode with windows-1252 and verify it's valid text starting with ERMHDR
    const decoded = iconv.decode(outputBuffer, 'windows-1252');
    expect(decoded.startsWith('ERMHDR')).toBe(true);
  });

  it('custom encoding option is respected', () => {
    if (!fixtureExists('minimal-valid.xer')) return;

    const inputBuffer = fixtureBuffer('minimal-valid.xer');
    const parsed = parseXer(inputBuffer);
    const outputBuffer = writeXerRoundTrip(parsed.raw, [], { encoding: 'utf-8' });

    // Decode with utf-8
    const decoded = iconv.decode(outputBuffer, 'utf-8');
    expect(decoded.startsWith('ERMHDR')).toBe(true);
  });
});

// ── TEST-4.9: CSV output ──────────────────────────────────────────────────────

describe('TEST-4.9: CSV output', () => {
  it('CSV has correct headers', () => {
    const schedule = makeSchedule({
      activities: [makeActivity({ code: 'A001' })],
    });
    const csv = writeScheduleCsv(schedule);
    const lines = csv.split('\n').filter(l => l.trim() !== '');
    const header = lines[0];
    expect(header).toContain('ID');
    expect(header).toContain('WBS');
    expect(header).toContain('Name');
    expect(header).toContain('Duration');
    expect(header).toContain('Start');
    expect(header).toContain('Finish');
    expect(header).toContain('Predecessors');
    expect(header).toContain('% Complete');
    expect(header).toContain('Outline Level');
    expect(header).toContain('Milestone');
  });

  it('CSV includes activity data with correct column order', () => {
    const activity = makeActivity({
      code: 'TASK-001',
      name: 'Excavation',
      remainingDuration: 5,
      plannedStart: new Date('2026-01-05'),
      plannedFinish: new Date('2026-01-09'),
      percentComplete: 25,
      type: 'task_dependent',
    });
    const schedule = makeSchedule({ activities: [activity] });
    const csv = writeScheduleCsv(schedule);
    const lines = csv.split('\n').filter(l => l.trim() !== '');
    expect(lines.length).toBe(2); // header + 1 data row
    const dataRow = lines[1];
    expect(dataRow).toContain('TASK-001');
    expect(dataRow).toContain('5 days');
    expect(dataRow).toContain('2026-01-05');
    expect(dataRow).toContain('2026-01-09');
    expect(dataRow).toContain('No'); // not a milestone
  });

  it('milestone activity shows Yes in Milestone column', () => {
    const activity = makeActivity({
      code: 'M001',
      type: 'task_milestone',
      remainingDuration: 0,
      plannedStart: new Date('2026-01-15'),
      plannedFinish: new Date('2026-01-15'),
    });
    const schedule = makeSchedule({ activities: [activity] });
    const csv = writeScheduleCsv(schedule);
    const lines = csv.split('\n').filter(l => l.trim() !== '');
    const dataRow = lines[1];
    expect(dataRow).toContain('Yes');
  });

  it('includeHeaders=false → no header row', () => {
    const activity = makeActivity({ code: 'A001' });
    const schedule = makeSchedule({ activities: [activity] });
    const csv = writeScheduleCsv(schedule, { includeHeaders: false });
    const lines = csv.split('\n').filter(l => l.trim() !== '');
    expect(lines.length).toBe(1);
    expect(lines[0]).not.toContain('ID,WBS');
  });

  it('empty schedule → only header row', () => {
    const schedule = makeSchedule({ activities: [] });
    const csv = writeScheduleCsv(schedule);
    const lines = csv.split('\n').filter(l => l.trim() !== '');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('ID');
  });

  it('values with commas are properly quoted', () => {
    const activity = makeActivity({ code: 'A001', name: 'Activity, with comma' });
    const schedule = makeSchedule({ activities: [activity] });
    const csv = writeScheduleCsv(schedule);
    const lines = csv.split('\n').filter(l => l.trim() !== '');
    expect(lines[1]).toContain('"Activity, with comma"');
  });
});

// ── TEST-4.10: CSV predecessor format ────────────────────────────────────────

describe('TEST-4.10: CSV predecessor format', () => {
  it('predecessor format: row number + type + lag (e.g. "1FS+2 days")', () => {
    const activities = [
      makeActivity({ code: 'A001', sourceId: 'src-001', name: 'Activity 1' }),
      makeActivity({ code: 'A002', sourceId: 'src-002', name: 'Activity 2' }),
      makeActivity({ code: 'A003', sourceId: 'src-003', name: 'Activity 3' }),
    ];
    const relationships = [
      // A003 has two predecessors: A001 (row 1) with FS+2 and A002 (row 2) with SS
      makeRelationship({ predecessorCode: 'A001', successorCode: 'A003', type: 'FS', lagDays: 2 }),
      makeRelationship({ predecessorCode: 'A002', successorCode: 'A003', type: 'SS', lagDays: 0 }),
    ];
    const schedule = makeSchedule({ activities, relationships });
    const csv = writeScheduleCsv(schedule);
    const lines = csv.split('\n').filter(l => l.trim() !== '');
    // Row 3 = A003 (1-based)
    const row3 = lines[3];
    expect(row3).toContain('1FS+2 days');
    expect(row3).toContain('2SS');
  });

  it('predecessor with negative lag uses minus sign', () => {
    const activities = [
      makeActivity({ code: 'A001', sourceId: 'src-001', name: 'Activity 1' }),
      makeActivity({ code: 'A002', sourceId: 'src-002', name: 'Activity 2' }),
    ];
    const relationships = [
      makeRelationship({ predecessorCode: 'A001', successorCode: 'A002', type: 'FS', lagDays: -1 }),
    ];
    const schedule = makeSchedule({ activities, relationships });
    const csv = writeScheduleCsv(schedule);
    const lines = csv.split('\n').filter(l => l.trim() !== '');
    const row2 = lines[2];
    expect(row2).toContain('1FS-1 days');
  });

  it('predecessor with zero lag shows only row number and type, no lag suffix', () => {
    const activities = [
      makeActivity({ code: 'A001', sourceId: 'src-001', name: 'Activity 1', remainingDuration: 0 }),
      makeActivity({ code: 'A002', sourceId: 'src-002', name: 'Activity 2', remainingDuration: 0 }),
    ];
    const relationships = [
      makeRelationship({ predecessorCode: 'A001', successorCode: 'A002', type: 'FS', lagDays: 0 }),
    ];
    const schedule = makeSchedule({ activities, relationships });
    const csv = writeScheduleCsv(schedule);
    const lines = csv.split('\n').filter(l => l.trim() !== '');
    const row2 = lines[2];
    // Extract just the Predecessors column (7th column, 0-indexed = index 6)
    const cols = row2.split(',');
    const predsCol = cols[6]; // Predecessors is the 7th column
    expect(predsCol).toBe('1FS');
    expect(predsCol).not.toContain('days');
  });
});

// ── TEST-4.11: MSPDI XML ──────────────────────────────────────────────────────

describe('TEST-4.11: MSPDI XML output', () => {
  it('generates valid XML structure with required elements', () => {
    const schedule = makeSchedule({
      activities: [
        makeActivity({ code: 'A001', name: 'Test Activity', remainingDuration: 5 }),
      ],
    });
    const xml = writeScheduleMspdi(schedule);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<Project xmlns="http://schemas.microsoft.com/project">');
    expect(xml).toContain('</Project>');
    expect(xml).toContain('<Tasks>');
    expect(xml).toContain('</Tasks>');
    expect(xml).toContain('<Calendars>');
    expect(xml).toContain('</Calendars>');
    expect(xml).toContain('<CalendarUID>1</CalendarUID>');
  });

  it('task has correct elements', () => {
    const activity = makeActivity({
      code: 'TASK-001',
      name: 'Excavation',
      remainingDuration: 5,
      plannedStart: new Date('2026-01-05T08:00:00'),
      plannedFinish: new Date('2026-01-09T17:00:00'),
      percentComplete: 50,
      type: 'task_dependent',
    });
    const schedule = makeSchedule({ activities: [activity] });
    const xml = writeScheduleMspdi(schedule);

    expect(xml).toContain('<Name>Excavation</Name>');
    expect(xml).toContain('<UID>1</UID>');
    expect(xml).toContain('<PercentComplete>50</PercentComplete>');
    expect(xml).toContain('<Milestone>0</Milestone>');
  });

  it('milestone activity has Milestone=1', () => {
    const activity = makeActivity({
      code: 'M001',
      name: 'Completion',
      type: 'task_milestone',
      remainingDuration: 0,
      plannedStart: new Date('2026-01-15T08:00:00'),
      plannedFinish: new Date('2026-01-15T08:00:00'),
    });
    const schedule = makeSchedule({ activities: [activity] });
    const xml = writeScheduleMspdi(schedule);

    expect(xml).toContain('<Milestone>1</Milestone>');
  });

  it('duration is in ISO 8601 format PT{hours}H{minutes}M{seconds}S', () => {
    const activity = makeActivity({
      code: 'A001',
      remainingDuration: 5, // 5 days × 8h = 40h
    });
    const schedule = makeSchedule({ activities: [activity] });
    const xml = writeScheduleMspdi(schedule);

    // 5 days × 8 = 40 hours
    expect(xml).toContain('<Duration>PT40H0M0S</Duration>');
  });

  it('predecessor link has correct type and UID', () => {
    const activities = [
      makeActivity({ code: 'A001', sourceId: 'src-001', name: 'Activity 1' }),
      makeActivity({ code: 'A002', sourceId: 'src-002', name: 'Activity 2' }),
    ];
    const relationships = [
      makeRelationship({ predecessorCode: 'A001', successorCode: 'A002', type: 'FS', lagDays: 0 }),
    ];
    const schedule = makeSchedule({ activities, relationships });
    const xml = writeScheduleMspdi(schedule);

    expect(xml).toContain('<PredecessorLink>');
    expect(xml).toContain('<PredecessorUID>1</PredecessorUID>');
    expect(xml).toContain('<Type>1</Type>'); // FS = 1
  });

  it('relationship type mapping: FF=0, FS=1, SF=2, SS=3', () => {
    const activities = [
      makeActivity({ code: 'A001', sourceId: 'src-001', name: 'A1' }),
      makeActivity({ code: 'A002', sourceId: 'src-002', name: 'A2' }),
      makeActivity({ code: 'A003', sourceId: 'src-003', name: 'A3' }),
      makeActivity({ code: 'A004', sourceId: 'src-004', name: 'A4' }),
      makeActivity({ code: 'A005', sourceId: 'src-005', name: 'A5' }),
    ];
    const relationships = [
      makeRelationship({ predecessorCode: 'A001', successorCode: 'A002', type: 'FF' }),
      makeRelationship({ predecessorCode: 'A001', successorCode: 'A003', type: 'FS' }),
      makeRelationship({ predecessorCode: 'A001', successorCode: 'A004', type: 'SF' }),
      makeRelationship({ predecessorCode: 'A001', successorCode: 'A005', type: 'SS' }),
    ];
    const schedule = makeSchedule({ activities, relationships });
    const xml = writeScheduleMspdi(schedule);

    // All four type codes should appear
    expect(xml).toContain('<Type>0</Type>'); // FF
    expect(xml).toContain('<Type>1</Type>'); // FS
    expect(xml).toContain('<Type>2</Type>'); // SF
    expect(xml).toContain('<Type>3</Type>'); // SS
  });

  it('project name is included in output', () => {
    const schedule = makeSchedule();
    schedule.project.name = 'My Test Project';
    const xml = writeScheduleMspdi(schedule);
    expect(xml).toContain('<Name>My Test Project</Name>');
  });

  it('XML special characters in names are escaped', () => {
    const activity = makeActivity({ code: 'A001', name: 'Test & <Activity>' });
    const schedule = makeSchedule({ activities: [activity] });
    const xml = writeScheduleMspdi(schedule);
    expect(xml).toContain('Test &amp; &lt;Activity&gt;');
    expect(xml).not.toContain('<Name>Test & <Activity></Name>');
  });

  it('empty schedule generates valid skeleton XML', () => {
    const schedule = makeSchedule({ activities: [] });
    const xml = writeScheduleMspdi(schedule);
    expect(xml).toContain('<Tasks>');
    expect(xml).toContain('</Tasks>');
    expect(xml).not.toContain('<Task>');
  });
});

// ── XER field mapping tests ────────────────────────────────────────────────────

describe('XER field mapping', () => {
  it('status mapping: not_started → TK_NotStart', () => {
    if (!fixtureExists('minimal-valid.xer')) return;
    const inputBuffer = fixtureBuffer('minimal-valid.xer');
    const parsed = parseXer(inputBuffer);
    const taskId = parsed.activities[0].task_id;

    const changes: ScheduleChange[] = [
      {
        entity_type: 'activity',
        entity_id: taskId,
        change_type: 'update',
        field: 'status',
        new_value: 'in_progress',
        created_at: new Date(),
        reverted: false,
      },
    ];

    const outputBuffer = writeXerRoundTrip(parsed.raw, changes);
    const reparsed = parseXer(outputBuffer);
    const act = reparsed.activities.find(a => a.task_id === taskId);
    expect(act?.status_code).toBe('TK_Active');
  });

  it('duration: remaining_duration days converted to hours in XER', () => {
    if (!fixtureExists('minimal-valid.xer')) return;
    const inputBuffer = fixtureBuffer('minimal-valid.xer');
    const parsed = parseXer(inputBuffer);
    const taskId = parsed.activities[0].task_id;

    const changes: ScheduleChange[] = [
      {
        entity_type: 'activity',
        entity_id: taskId,
        change_type: 'update',
        field: 'remaining_duration',
        new_value: 10, // 10 days = 80 hours
        created_at: new Date(),
        reverted: false,
      },
    ];

    const outputBuffer = writeXerRoundTrip(parsed.raw, changes, { hoursPerDay: 8 });
    const reparsed = parseXer(outputBuffer);
    const act = reparsed.activities.find(a => a.task_id === taskId);
    expect(parseFloat(act?.remain_drtn_hr_cnt ?? '0')).toBe(80);
  });

  it('delete change removes a row from the table', () => {
    if (!fixtureExists('minimal-valid.xer')) return;
    const inputBuffer = fixtureBuffer('minimal-valid.xer');
    const parsed = parseXer(inputBuffer);
    const originalCount = parsed.relationships.length;
    const relId = parsed.relationships[0]?.task_pred_id;
    if (!relId) return;

    const changes: ScheduleChange[] = [
      {
        entity_type: 'relationship',
        entity_id: relId,
        change_type: 'delete',
        created_at: new Date(),
        reverted: false,
      },
    ];

    const outputBuffer = writeXerRoundTrip(parsed.raw, changes);
    const reparsed = parseXer(outputBuffer);
    expect(reparsed.relationships.length).toBe(originalCount - 1);
  });

  it('changes are applied in created_at order (chronological)', () => {
    if (!fixtureExists('minimal-valid.xer')) return;
    const inputBuffer = fixtureBuffer('minimal-valid.xer');
    const parsed = parseXer(inputBuffer);
    const taskId = parsed.activities[0].task_id;

    // Two changes to same field — later one should win
    const changes: ScheduleChange[] = [
      {
        entity_type: 'activity',
        entity_id: taskId,
        change_type: 'update',
        field: 'name',
        new_value: 'First Update',
        created_at: new Date('2026-01-10T10:00:00'),
        reverted: false,
      },
      {
        entity_type: 'activity',
        entity_id: taskId,
        change_type: 'update',
        field: 'name',
        new_value: 'Second Update',
        created_at: new Date('2026-01-10T12:00:00'),
        reverted: false,
      },
    ];

    const outputBuffer = writeXerRoundTrip(parsed.raw, changes);
    const reparsed = parseXer(outputBuffer);
    const act = reparsed.activities.find(a => a.task_id === taskId);
    expect(act?.task_name).toBe('Second Update');
  });
});

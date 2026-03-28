import { describe, it, expect } from 'vitest';
import { validateSchedule, hasCycles, ValidationResult } from '../validator';
import { CanonicalSchedule, CanonicalActivity, CanonicalRelationship, CanonicalWbsNode, CanonicalCalendar } from '../../parsers/normaliser';

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

function makeSchedule(overrides: Partial<CanonicalSchedule> = {}): CanonicalSchedule {
  return {
    project: {
      name: 'Test Project',
      description: '',
      dataDate: new Date('2026-01-15'),
    },
    activities: [],
    relationships: [],
    wbsNodes: [],
    calendars: [],
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

function makeWbsNode(overrides: Partial<CanonicalWbsNode> = {}): CanonicalWbsNode {
  return {
    sourceId: 'WBS1',
    parentSourceId: null,
    code: 'WBS1',
    name: 'Phase 1',
    level: 1,
    sortOrder: 1,
    ...overrides,
  };
}

// ── TEST-4.1: Circular dependency ─────────────────────────────────────────────

describe('TEST-4.1: CIRCULAR_DEPENDENCY', () => {
  it('detects circular dependency → error CIRCULAR_DEPENDENCY', () => {
    const activities = [
      makeActivity({ code: 'A001', sourceId: 'src-001' }),
      makeActivity({ code: 'A002', sourceId: 'src-002', name: 'Activity 2' }),
      makeActivity({ code: 'A003', sourceId: 'src-003', name: 'Activity 3' }),
    ];
    // A001 → A002 → A003 → A001 (cycle)
    const relationships = [
      makeRelationship({ predecessorCode: 'A001', successorCode: 'A002' }),
      makeRelationship({ predecessorCode: 'A002', successorCode: 'A003' }),
      makeRelationship({ predecessorCode: 'A003', successorCode: 'A001' }),
    ];
    const schedule = makeSchedule({ activities, relationships });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    expect(result.canExport).toBe(false);
  });

  it('hasCycles detects cycle with 2 nodes', () => {
    const codes = new Set(['A', 'B']);
    const rels = [
      { predecessorCode: 'A', successorCode: 'B' },
      { predecessorCode: 'B', successorCode: 'A' },
    ];
    const result = hasCycles(codes, rels);
    expect(result.hasCycle).toBe(true);
    expect(result.cycle).toBeDefined();
    expect(result.cycle!.length).toBeGreaterThan(0);
  });

  it('hasCycles no cycle → hasCycle=false', () => {
    const codes = new Set(['A', 'B', 'C']);
    const rels = [
      { predecessorCode: 'A', successorCode: 'B' },
      { predecessorCode: 'B', successorCode: 'C' },
    ];
    const result = hasCycles(codes, rels);
    expect(result.hasCycle).toBe(false);
    expect(result.cycle).toBeUndefined();
  });
});

// ── TEST-4.2: NO_PREDECESSORS ─────────────────────────────────────────────────

describe('TEST-4.2: NO_PREDECESSORS', () => {
  it('2 activities with no relationships → 2 warnings NO_PREDECESSORS', () => {
    const activities = [
      makeActivity({ code: 'A001', sourceId: 'src-001' }),
      makeActivity({ code: 'A002', sourceId: 'src-002', name: 'Activity 2' }),
    ];
    const schedule = makeSchedule({ activities, relationships: [] });
    const result = validateSchedule(schedule);
    const noPredWarnings = result.issues.filter(i => i.code === 'NO_PREDECESSORS');
    expect(noPredWarnings.length).toBe(2);
    expect(result.issues.some(i => i.severity === 'warning')).toBe(true);
  });

  it('single activity → NO NO_PREDECESSORS warning (only one activity)', () => {
    const activities = [makeActivity({ code: 'A001' })];
    const schedule = makeSchedule({ activities, relationships: [] });
    const result = validateSchedule(schedule);
    const noPredWarnings = result.issues.filter(i => i.code === 'NO_PREDECESSORS');
    expect(noPredWarnings.length).toBe(0);
  });
});

// ── TEST-4.3: Clean schedule ──────────────────────────────────────────────────

describe('TEST-4.3: Clean schedule', () => {
  it('clean schedule → 0 errors, canExport=true', () => {
    const cal: CanonicalCalendar = {
      sourceId: 'CAL1',
      name: 'Standard',
      workdays: [1, 2, 3, 4, 5],
      holidays: [],
      hoursPerDay: 8,
    };
    const activities = [
      makeActivity({
        code: 'A001',
        sourceId: 'src-001',
        calendarSourceId: 'CAL1',
        totalFloat: 5,
        wbsCode: null,
        remainingDuration: 5,
      }),
      makeActivity({
        code: 'A002',
        sourceId: 'src-002',
        name: 'Activity 2',
        calendarSourceId: 'CAL1',
        totalFloat: 0,
        wbsCode: null,
        remainingDuration: 3,
        plannedStart: new Date('2026-01-12'),
        plannedFinish: new Date('2026-01-14'),
      }),
    ];
    const relationships = [
      makeRelationship({ predecessorCode: 'A001', successorCode: 'A002', type: 'FS', lagDays: 0 }),
    ];
    const schedule = makeSchedule({ activities, relationships, calendars: [cal] });
    const result = validateSchedule(schedule);
    expect(result.errorCount).toBe(0);
    expect(result.canExport).toBe(true);
  });
});

// ── TEST-4.4: LOW_LOGIC_DENSITY ───────────────────────────────────────────────

describe('TEST-4.4: LOW_LOGIC_DENSITY', () => {
  it('10 activities with 5 relationships → density 0.5 → warning LOW_LOGIC_DENSITY', () => {
    const activities = Array.from({ length: 10 }, (_, i) =>
      makeActivity({ code: `A${String(i).padStart(3, '0')}`, sourceId: `src-${i}`, name: `Act ${i}` })
    );
    // Only 5 relationships (density = 0.5 < 1.5)
    const relationships = Array.from({ length: 5 }, (_, i) =>
      makeRelationship({
        predecessorCode: `A${String(i).padStart(3, '0')}`,
        successorCode: `A${String(i + 1).padStart(3, '0')}`,
      })
    );
    const schedule = makeSchedule({ activities, relationships });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'LOW_LOGIC_DENSITY')).toBe(true);
  });

  it('activities with enough relationships → no LOW_LOGIC_DENSITY', () => {
    const activities = Array.from({ length: 4 }, (_, i) =>
      makeActivity({ code: `A${i}`, sourceId: `src-${i}`, name: `Act ${i}` })
    );
    // 6 relationships for 4 activities → density = 1.5 (edge case, not < 1.5)
    const relationships = [
      makeRelationship({ predecessorCode: 'A0', successorCode: 'A1' }),
      makeRelationship({ predecessorCode: 'A1', successorCode: 'A2' }),
      makeRelationship({ predecessorCode: 'A2', successorCode: 'A3' }),
      makeRelationship({ predecessorCode: 'A0', successorCode: 'A2' }),
      makeRelationship({ predecessorCode: 'A0', successorCode: 'A3' }),
      makeRelationship({ predecessorCode: 'A1', successorCode: 'A3' }),
    ];
    const schedule = makeSchedule({ activities, relationships });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'LOW_LOGIC_DENSITY')).toBe(false);
  });
});

// ── TEST-4.5: DUPLICATE_ACTIVITY_CODE ─────────────────────────────────────────

describe('TEST-4.5: DUPLICATE_ACTIVITY_CODE', () => {
  it('duplicate activity codes → error DUPLICATE_ACTIVITY_CODE', () => {
    const activities = [
      makeActivity({ code: 'A001', sourceId: 'src-001' }),
      makeActivity({ code: 'A001', sourceId: 'src-002', name: 'Duplicate' }),
    ];
    const schedule = makeSchedule({ activities });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'DUPLICATE_ACTIVITY_CODE')).toBe(true);
    expect(result.canExport).toBe(false);
  });

  it('unique codes → no DUPLICATE_ACTIVITY_CODE', () => {
    const activities = [
      makeActivity({ code: 'A001', sourceId: 'src-001' }),
      makeActivity({ code: 'A002', sourceId: 'src-002', name: 'Activity 2' }),
    ];
    const schedule = makeSchedule({ activities });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'DUPLICATE_ACTIVITY_CODE')).toBe(false);
  });
});

// ── TEST-4.6: ACTIVITY_START_AFTER_FINISH ─────────────────────────────────────

describe('TEST-4.6: ACTIVITY_START_AFTER_FINISH', () => {
  it('activity start > finish → error ACTIVITY_START_AFTER_FINISH', () => {
    const activity = makeActivity({
      code: 'A001',
      plannedStart: new Date('2026-03-15'),
      plannedFinish: new Date('2026-03-10'), // before start
    });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'ACTIVITY_START_AFTER_FINISH')).toBe(true);
    expect(result.canExport).toBe(false);
  });

  it('activity start == finish → no error (same day milestone)', () => {
    const activity = makeActivity({
      code: 'A001',
      plannedStart: new Date('2026-03-15'),
      plannedFinish: new Date('2026-03-15'),
      type: 'task_milestone',
      remainingDuration: 0,
    });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'ACTIVITY_START_AFTER_FINISH')).toBe(false);
  });
});

// ── TEST-4.7: MILESTONE_WITH_DURATION ─────────────────────────────────────────

describe('TEST-4.7: MILESTONE_WITH_DURATION', () => {
  it('milestone with remainingDuration > 0 → error MILESTONE_WITH_DURATION', () => {
    const activity = makeActivity({
      code: 'M001',
      type: 'task_milestone',
      remainingDuration: 2,
    });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'MILESTONE_WITH_DURATION')).toBe(true);
    expect(result.canExport).toBe(false);
  });

  it('milestone with remainingDuration = 0 → no MILESTONE_WITH_DURATION error', () => {
    const activity = makeActivity({
      code: 'M001',
      type: 'task_milestone',
      remainingDuration: 0,
      plannedStart: new Date('2026-01-15'),
      plannedFinish: new Date('2026-01-15'),
    });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'MILESTONE_WITH_DURATION')).toBe(false);
  });

  it('regular task with duration > 0 → no MILESTONE_WITH_DURATION', () => {
    const activity = makeActivity({ code: 'A001', type: 'task_dependent', remainingDuration: 5 });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'MILESTONE_WITH_DURATION')).toBe(false);
  });
});

// ── TEST-4.8: LONG_DURATION ───────────────────────────────────────────────────

describe('TEST-4.8: LONG_DURATION', () => {
  it('activity remaining_duration > 20 days → warning LONG_DURATION', () => {
    const activity = makeActivity({ code: 'A001', remainingDuration: 25 });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'LONG_DURATION')).toBe(true);
    expect(result.issues.find(i => i.code === 'LONG_DURATION')?.severity).toBe('warning');
  });

  it('activity remaining_duration = 20 days → no LONG_DURATION', () => {
    const activity = makeActivity({ code: 'A001', remainingDuration: 20 });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'LONG_DURATION')).toBe(false);
  });

  it('activity remaining_duration = 21 days → warning LONG_DURATION', () => {
    const activity = makeActivity({ code: 'A001', remainingDuration: 21 });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'LONG_DURATION')).toBe(true);
  });
});

// ── TEST-4.9: HARD_CONSTRAINT ─────────────────────────────────────────────────

describe('TEST-4.9: HARD_CONSTRAINT', () => {
  it('activity with Must Start On constraint → warning HARD_CONSTRAINT', () => {
    const activity = makeActivity({
      code: 'A001',
      rawXerRow: { cstr_type: 'CSTR_MSO' },
    });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'HARD_CONSTRAINT')).toBe(true);
    expect(result.issues.find(i => i.code === 'HARD_CONSTRAINT')?.severity).toBe('warning');
  });

  it('activity with Must Finish On constraint → warning HARD_CONSTRAINT', () => {
    const activity = makeActivity({
      code: 'A001',
      rawXerRow: { cstr_type: 'CSTR_MFO' },
    });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'HARD_CONSTRAINT')).toBe(true);
  });

  it('activity with soft constraint (SNET) → no HARD_CONSTRAINT', () => {
    const activity = makeActivity({
      code: 'A001',
      rawXerRow: { cstr_type: 'CSTR_SNET' },
    });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'HARD_CONSTRAINT')).toBe(false);
  });

  it('activity with no constraint → no HARD_CONSTRAINT', () => {
    const activity = makeActivity({ code: 'A001', rawXerRow: {} });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'HARD_CONSTRAINT')).toBe(false);
  });
});

// ── TEST-4.10: DEEP_WBS_HIERARCHY ─────────────────────────────────────────────

describe('TEST-4.10: DEEP_WBS_HIERARCHY', () => {
  it('WBS hierarchy with 7 levels → info DEEP_WBS_HIERARCHY', () => {
    // Build a 7-level WBS chain
    const wbsNodes: CanonicalWbsNode[] = Array.from({ length: 7 }, (_, i) => ({
      sourceId: `WBS${i + 1}`,
      parentSourceId: i === 0 ? null : `WBS${i}`,
      code: `W${i + 1}`,
      name: `Level ${i + 1}`,
      level: i + 1,
      sortOrder: i + 1,
    }));
    const schedule = makeSchedule({ wbsNodes });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'DEEP_WBS_HIERARCHY')).toBe(true);
    expect(result.issues.find(i => i.code === 'DEEP_WBS_HIERARCHY')?.severity).toBe('info');
  });

  it('WBS hierarchy with 6 levels → no DEEP_WBS_HIERARCHY', () => {
    const wbsNodes: CanonicalWbsNode[] = Array.from({ length: 6 }, (_, i) => ({
      sourceId: `WBS${i + 1}`,
      parentSourceId: i === 0 ? null : `WBS${i}`,
      code: `W${i + 1}`,
      name: `Level ${i + 1}`,
      level: i + 1,
      sortOrder: i + 1,
    }));
    const schedule = makeSchedule({ wbsNodes });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'DEEP_WBS_HIERARCHY')).toBe(false);
  });
});

// ── Additional rule tests ─────────────────────────────────────────────────────

describe('NEGATIVE_DURATION', () => {
  it('activity with negative remaining_duration → error NEGATIVE_DURATION', () => {
    const activity = makeActivity({ code: 'A001', remainingDuration: -1 });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'NEGATIVE_DURATION')).toBe(true);
    expect(result.canExport).toBe(false);
  });
});

describe('MISSING_ACTIVITY_NAME', () => {
  it('activity with empty name → error MISSING_ACTIVITY_NAME', () => {
    const activity = makeActivity({ code: 'A001', name: '' });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'MISSING_ACTIVITY_NAME')).toBe(true);
    expect(result.canExport).toBe(false);
  });

  it('activity with whitespace-only name → error MISSING_ACTIVITY_NAME', () => {
    const activity = makeActivity({ code: 'A001', name: '   ' });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'MISSING_ACTIVITY_NAME')).toBe(true);
  });
});

describe('INVALID_RELATIONSHIP_REF', () => {
  it('relationship references non-existent predecessor → error', () => {
    const activities = [makeActivity({ code: 'A001' })];
    const relationships = [makeRelationship({ predecessorCode: 'NONEXISTENT', successorCode: 'A001' })];
    const schedule = makeSchedule({ activities, relationships });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'INVALID_RELATIONSHIP_REF')).toBe(true);
    expect(result.canExport).toBe(false);
  });

  it('relationship references non-existent successor → error', () => {
    const activities = [makeActivity({ code: 'A001' })];
    const relationships = [makeRelationship({ predecessorCode: 'A001', successorCode: 'NONEXISTENT' })];
    const schedule = makeSchedule({ activities, relationships });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'INVALID_RELATIONSHIP_REF')).toBe(true);
  });
});

describe('WBS_BROKEN_HIERARCHY', () => {
  it('WBS node referencing non-existent parent → error WBS_BROKEN_HIERARCHY', () => {
    const wbsNodes: CanonicalWbsNode[] = [
      { sourceId: 'WBS1', parentSourceId: 'NONEXISTENT', code: 'W1', name: 'Node 1', level: 1, sortOrder: 1 },
    ];
    const schedule = makeSchedule({ wbsNodes });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'WBS_BROKEN_HIERARCHY')).toBe(true);
    expect(result.canExport).toBe(false);
  });
});

describe('MISSING_CALENDAR_REF', () => {
  it('activity referencing non-existent calendar → error MISSING_CALENDAR_REF', () => {
    const activity = makeActivity({ code: 'A001', calendarSourceId: 'CAL_NONEXISTENT' });
    const schedule = makeSchedule({ activities: [activity], calendars: [] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'MISSING_CALENDAR_REF')).toBe(true);
    expect(result.canExport).toBe(false);
  });

  it('activity with null calendarSourceId → no MISSING_CALENDAR_REF', () => {
    const activity = makeActivity({ code: 'A001', calendarSourceId: null });
    const schedule = makeSchedule({ activities: [activity], calendars: [] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'MISSING_CALENDAR_REF')).toBe(false);
  });
});

describe('ORPHAN_ACTIVITY_NO_WBS', () => {
  it('activity without wbsCode when WBS nodes exist → error ORPHAN_ACTIVITY_NO_WBS', () => {
    const activities = [makeActivity({ code: 'A001', wbsCode: null })];
    const wbsNodes = [makeWbsNode()];
    const schedule = makeSchedule({ activities, wbsNodes });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'ORPHAN_ACTIVITY_NO_WBS')).toBe(true);
    expect(result.canExport).toBe(false);
  });

  it('no WBS nodes → no ORPHAN_ACTIVITY_NO_WBS even if wbsCode is null', () => {
    const activities = [makeActivity({ code: 'A001', wbsCode: null })];
    const schedule = makeSchedule({ activities, wbsNodes: [] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'ORPHAN_ACTIVITY_NO_WBS')).toBe(false);
  });
});

describe('NEGATIVE_FLOAT', () => {
  it('activity with negative total_float → warning NEGATIVE_FLOAT', () => {
    const activity = makeActivity({ code: 'A001', totalFloat: -2 });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'NEGATIVE_FLOAT')).toBe(true);
    expect(result.issues.find(i => i.code === 'NEGATIVE_FLOAT')?.severity).toBe('warning');
  });
});

describe('NO_SUCCESSORS', () => {
  it('activity with no successors (multi-activity schedule) → warning NO_SUCCESSORS', () => {
    const activities = [
      makeActivity({ code: 'A001', sourceId: 'src-001' }),
      makeActivity({ code: 'A002', sourceId: 'src-002', name: 'Activity 2' }),
    ];
    const relationships = [
      makeRelationship({ predecessorCode: 'A001', successorCode: 'A002' }),
    ];
    const schedule = makeSchedule({ activities, relationships });
    const result = validateSchedule(schedule);
    // A002 has no successors
    const noSuccWarnings = result.issues.filter(i => i.code === 'NO_SUCCESSORS');
    expect(noSuccWarnings.length).toBeGreaterThanOrEqual(1);
  });
});

describe('EXCESSIVE_LAG', () => {
  it('relationship lag > 20 days → warning EXCESSIVE_LAG', () => {
    const activities = [
      makeActivity({ code: 'A001', sourceId: 'src-001' }),
      makeActivity({ code: 'A002', sourceId: 'src-002', name: 'Activity 2' }),
    ];
    const relationships = [
      makeRelationship({ predecessorCode: 'A001', successorCode: 'A002', lagDays: 25 }),
    ];
    const schedule = makeSchedule({ activities, relationships });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'EXCESSIVE_LAG')).toBe(true);
    expect(result.issues.find(i => i.code === 'EXCESSIVE_LAG')?.severity).toBe('warning');
  });
});

describe('ACTUAL_DATE_IN_FUTURE', () => {
  it('activity actual_start after data date → warning ACTUAL_DATE_IN_FUTURE', () => {
    const activity = makeActivity({
      code: 'A001',
      actualStart: new Date('2026-02-01'), // after data date (2026-01-15)
    });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'ACTUAL_DATE_IN_FUTURE')).toBe(true);
  });
});

describe('PERCENT_COMPLETE_INCONSISTENT', () => {
  it('activity with actual_start but 0% → warning PERCENT_COMPLETE_INCONSISTENT', () => {
    const activity = makeActivity({
      code: 'A001',
      actualStart: new Date('2026-01-05'),
      percentComplete: 0,
    });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'PERCENT_COMPLETE_INCONSISTENT')).toBe(true);
  });

  it('activity with actual_finish but < 100% → warning', () => {
    const activity = makeActivity({
      code: 'A001',
      actualStart: new Date('2026-01-05'),
      actualFinish: new Date('2026-01-09'),
      percentComplete: 80,
    });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'PERCENT_COMPLETE_INCONSISTENT')).toBe(true);
  });
});

describe('HIGH_CRITICAL_PATH_RATIO', () => {
  it('>40% of activities on critical path → info HIGH_CRITICAL_PATH_RATIO', () => {
    // 5 activities, 3 with totalFloat=0 (60% critical)
    const activities = [
      makeActivity({ code: 'A001', totalFloat: 0 }),
      makeActivity({ code: 'A002', sourceId: 'src-002', name: 'Act 2', totalFloat: 0 }),
      makeActivity({ code: 'A003', sourceId: 'src-003', name: 'Act 3', totalFloat: 0 }),
      makeActivity({ code: 'A004', sourceId: 'src-004', name: 'Act 4', totalFloat: 5 }),
      makeActivity({ code: 'A005', sourceId: 'src-005', name: 'Act 5', totalFloat: 5 }),
    ];
    const schedule = makeSchedule({ activities });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'HIGH_CRITICAL_PATH_RATIO')).toBe(true);
    expect(result.issues.find(i => i.code === 'HIGH_CRITICAL_PATH_RATIO')?.severity).toBe('info');
  });
});

describe('COMPLEX_RELATIONSHIPS', () => {
  it('>20% SS/FF/SF relationships → info COMPLEX_RELATIONSHIPS', () => {
    const activities = [
      makeActivity({ code: 'A001', sourceId: 'src-001' }),
      makeActivity({ code: 'A002', sourceId: 'src-002', name: 'Act 2' }),
      makeActivity({ code: 'A003', sourceId: 'src-003', name: 'Act 3' }),
      makeActivity({ code: 'A004', sourceId: 'src-004', name: 'Act 4' }),
    ];
    // 4 relationships: 2 FS, 2 SS → 50% complex
    const relationships = [
      makeRelationship({ predecessorCode: 'A001', successorCode: 'A002', type: 'FS' }),
      makeRelationship({ predecessorCode: 'A002', successorCode: 'A003', type: 'FS' }),
      makeRelationship({ predecessorCode: 'A001', successorCode: 'A003', type: 'SS' }),
      makeRelationship({ predecessorCode: 'A002', successorCode: 'A004', type: 'SS' }),
    ];
    const schedule = makeSchedule({ activities, relationships });
    const result = validateSchedule(schedule);
    expect(result.issues.some(i => i.code === 'COMPLEX_RELATIONSHIPS')).toBe(true);
    expect(result.issues.find(i => i.code === 'COMPLEX_RELATIONSHIPS')?.severity).toBe('info');
  });
});

describe('ValidationResult structure', () => {
  it('errorCount, warningCount, infoCount are computed correctly', () => {
    const activity = makeActivity({
      code: 'A001',
      name: '', // triggers MISSING_ACTIVITY_NAME (error)
      remainingDuration: 25, // triggers LONG_DURATION (warning)
      totalFloat: 0, // contributes to HIGH_CRITICAL_PATH_RATIO (info)
    });
    const schedule = makeSchedule({ activities: [activity] });
    const result = validateSchedule(schedule);

    expect(result.errorCount).toBe(result.issues.filter(i => i.severity === 'error').length);
    expect(result.warningCount).toBe(result.issues.filter(i => i.severity === 'warning').length);
    expect(result.infoCount).toBe(result.issues.filter(i => i.severity === 'info').length);
    expect(result.canExport).toBe(result.errorCount === 0);
  });
});

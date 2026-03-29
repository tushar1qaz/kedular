import { describe, it, expect } from 'vitest';
import { scoreScheduleHealth, HealthReport } from '../health-scorer';
import { CanonicalSchedule, CanonicalActivity, CanonicalRelationship } from '../../parsers/normaliser';

function makeActivity(code: string, overrides: Partial<CanonicalActivity> = {}): CanonicalActivity {
  return {
    code,
    sourceId: code,
    name: `Activity ${code}`,
    wbsCode: '1.0',
    type: 'task_dependent',
    status: 'not_started',
    plannedStart: new Date('2026-01-01'),
    plannedFinish: new Date('2026-01-10'),
    actualStart: null,
    actualFinish: null,
    remainingDuration: 5,
    totalFloat: 0,
    freeFloat: 0,
    percentComplete: 0,
    calendarSourceId: null,
    ...overrides,
  };
}

function makeRel(predecessorCode: string, successorCode: string, type = 'FS'): CanonicalRelationship {
  return { predecessorCode, successorCode, type, lagDays: 0 };
}

function makeSchedule(
  activities: CanonicalActivity[],
  relationships: CanonicalRelationship[]
): CanonicalSchedule {
  return {
    project: { name: 'Test', description: '', dataDate: null },
    activities,
    relationships,
    wbsNodes: [],
    calendars: [],
  };
}

// TEST-5.5: Good schedule → score >80, grade A or B
describe('TEST-5.5: Good schedule', () => {
  it('scores >80 and grades A or B', () => {
    // 10 activities with logic density ~2.0 (20 rels / 10 acts)
    const acts = Array.from({ length: 10 }, (_, i) => makeActivity(`A${i + 1}`, {
      totalFloat: i < 3 ? 0 : 5, // 30% critical
    }));

    // Chain + extra rels for density ~2
    const rels: CanonicalRelationship[] = [];
    for (let i = 0; i < 9; i++) {
      rels.push(makeRel(`A${i + 1}`, `A${i + 2}`));
    }
    // Add 11 more to reach 20 rels
    rels.push(makeRel('A1', 'A3'));
    rels.push(makeRel('A1', 'A4'));
    rels.push(makeRel('A2', 'A5'));
    rels.push(makeRel('A3', 'A6'));
    rels.push(makeRel('A4', 'A7'));
    rels.push(makeRel('A5', 'A8'));
    rels.push(makeRel('A6', 'A9'));
    rels.push(makeRel('A7', 'A10'));
    rels.push(makeRel('A2', 'A6'));
    rels.push(makeRel('A3', 'A7'));
    rels.push(makeRel('A4', 'A8'));

    const schedule = makeSchedule(acts, rels);
    const report = scoreScheduleHealth(schedule);

    expect(report.overallScore).toBeGreaterThan(80);
    expect(['A', 'B']).toContain(report.grade);
  });
});

// TEST-5.6: Bad schedule → score <50, grade D or F
describe('TEST-5.6: Bad schedule', () => {
  it('scores <50 and grades D or F', () => {
    // 20 activities: very low logic density (4 rels / 20 acts = 0.2),
    // all have no predecessors/successors except a chain of 4,
    // all long duration (45 days), all critical (totalFloat=0),
    // 50% have hard constraints, deep negative float on many
    const acts = Array.from({ length: 20 }, (_, i) => makeActivity(`B${i + 1}`, {
      totalFloat: -5,            // negative float on all (bad)
      remainingDuration: 45,     // all long activities (>40d)
      rawXerRow: i < 10 ? { cstr_type: 'mandatory_start' } : undefined, // 50% hard constraints
    }));

    const rels: CanonicalRelationship[] = [];
    // Only 4 relationships for 20 activities = density 0.2 (very bad)
    for (let i = 0; i < 4; i++) {
      rels.push(makeRel(`B${i + 1}`, `B${i + 2}`));
    }

    const schedule = makeSchedule(acts, rels);
    const report = scoreScheduleHealth(schedule);

    expect(report.overallScore).toBeLessThan(50);
    expect(['D', 'F']).toContain(report.grade);
  });
});

// Test individual metrics
describe('Logic density metric', () => {
  it('scores 100 when density >= 1.5', () => {
    const acts = [makeActivity('A1'), makeActivity('A2')];
    const rels = [makeRel('A1', 'A2'), makeRel('A1', 'A2'), makeRel('A1', 'A2')]; // density = 1.5
    const schedule = makeSchedule(acts, rels);
    const report = scoreScheduleHealth(schedule);
    const metric = report.metrics.find((m) => m.name === 'Logic Density')!;
    expect(metric.score).toBe(100);
  });

  it('scores 0 when density is 0', () => {
    const acts = [makeActivity('A1'), makeActivity('A2')];
    const schedule = makeSchedule(acts, []);
    const report = scoreScheduleHealth(schedule);
    const metric = report.metrics.find((m) => m.name === 'Logic Density')!;
    expect(metric.score).toBe(0);
  });
});

describe('Missing predecessors metric', () => {
  it('scores 100 when only 1 activity has no predecessor', () => {
    const acts = [makeActivity('A1'), makeActivity('A2'), makeActivity('A3')];
    const rels = [makeRel('A1', 'A2'), makeRel('A2', 'A3')];
    const schedule = makeSchedule(acts, rels);
    const report = scoreScheduleHealth(schedule);
    const metric = report.metrics.find((m) => m.name === 'Missing Predecessors')!;
    expect(metric.score).toBe(100);
    expect(metric.value).toBe(1);
  });

  it('deducts when more than 1 activity has no predecessor', () => {
    const acts = [makeActivity('A1'), makeActivity('A2'), makeActivity('A3')];
    // No relationships → all 3 have no pred
    const schedule = makeSchedule(acts, []);
    const report = scoreScheduleHealth(schedule);
    const metric = report.metrics.find((m) => m.name === 'Missing Predecessors')!;
    expect(metric.score).toBeLessThan(100);
  });
});

describe('Negative float metric', () => {
  it('scores 100 when no activities have negative float', () => {
    const acts = [makeActivity('A1', { totalFloat: 0 }), makeActivity('A2', { totalFloat: 5 })];
    const schedule = makeSchedule(acts, [makeRel('A1', 'A2')]);
    const report = scoreScheduleHealth(schedule);
    const metric = report.metrics.find((m) => m.name === 'Negative Float')!;
    expect(metric.score).toBe(100);
    expect(metric.value).toBe(0);
  });

  it('scores below 100 when activities have negative float', () => {
    const acts = [
      makeActivity('A1', { totalFloat: -3 }),
      makeActivity('A2', { totalFloat: -5 }),
    ];
    const schedule = makeSchedule(acts, [makeRel('A1', 'A2')]);
    const report = scoreScheduleHealth(schedule);
    const metric = report.metrics.find((m) => m.name === 'Negative Float')!;
    expect(metric.score).toBeLessThan(100);
    expect(metric.value).toBe(2);
  });
});

describe('Long activities metric', () => {
  it('scores 100 when no activities exceed 20 days', () => {
    const acts = [
      makeActivity('A1', { remainingDuration: 10 }),
      makeActivity('A2', { remainingDuration: 15 }),
    ];
    const schedule = makeSchedule(acts, [makeRel('A1', 'A2')]);
    const report = scoreScheduleHealth(schedule);
    const metric = report.metrics.find((m) => m.name === 'Long Activities (>20d)')!;
    expect(metric.score).toBe(100);
    expect(metric.value).toBe(0);
  });

  it('scores below 100 when activities exceed 20 days', () => {
    const acts = [
      makeActivity('A1', { remainingDuration: 25 }),
      makeActivity('A2', { remainingDuration: 30 }),
    ];
    const schedule = makeSchedule(acts, [makeRel('A1', 'A2')]);
    const report = scoreScheduleHealth(schedule);
    const metric = report.metrics.find((m) => m.name === 'Long Activities (>20d)')!;
    expect(metric.score).toBeLessThan(100);
    expect(metric.value).toBe(2);
  });
});

describe('Grade calculation', () => {
  it('returns F for score < 45', () => {
    // Force a very bad schedule
    const acts = Array.from({ length: 10 }, (_, i) =>
      makeActivity(`X${i}`, { totalFloat: -10, remainingDuration: 50 })
    );
    const schedule = makeSchedule(acts, []);
    const report = scoreScheduleHealth(schedule);
    expect(report.grade).toBe('F');
  });
});

describe('Empty schedule', () => {
  it('returns score 0 and grade F', () => {
    const schedule = makeSchedule([], []);
    const report = scoreScheduleHealth(schedule);
    expect(report.overallScore).toBe(0);
    expect(report.grade).toBe('F');
  });
});

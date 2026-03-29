import { describe, it, expect } from 'vitest';
import { runWhatIf, WhatIfScenario } from '../whatif';
import { CanonicalSchedule, CanonicalActivity, CanonicalRelationship } from '../../parsers/normaliser';
import { calculateCpm, CpmActivity, CpmRelationship, CpmInput } from '../cpm';
import { CalendarEngine, CalendarDef } from '../calendar';

const standardCal: CalendarDef = {
  id: '__default__',
  workdays: [1, 2, 3, 4, 5],
  holidays: [],
  hoursPerDay: 8,
};

const calEngine = new CalendarEngine([standardCal]);

// Monday 2026-01-05
function d(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day);
}

const PROJECT_START = d('2026-01-05');

function makeCanonicalActivity(
  code: string,
  duration: number,
  overrides: Partial<CanonicalActivity> = {}
): CanonicalActivity {
  return {
    code,
    sourceId: code,
    name: `Activity ${code}`,
    wbsCode: null,
    type: 'task_dependent',
    status: 'not_started',
    plannedStart: null,
    plannedFinish: null,
    actualStart: null,
    actualFinish: null,
    remainingDuration: duration,
    totalFloat: 0,
    freeFloat: 0,
    percentComplete: 0,
    calendarSourceId: '__default__',
    ...overrides,
  };
}

function makeCanonicalRel(
  predCode: string,
  succCode: string,
  type: 'FS' | 'SS' | 'FF' | 'SF' = 'FS',
  lagDays = 0
): CanonicalRelationship {
  return { predecessorCode: predCode, successorCode: succCode, type, lagDays };
}

function makeSchedule(
  activities: CanonicalActivity[],
  relationships: CanonicalRelationship[]
): CanonicalSchedule {
  return {
    project: { name: 'Test Project', description: '', dataDate: PROJECT_START },
    activities,
    relationships,
    wbsNodes: [],
    calendars: [],
  };
}

function runOriginalCpm(schedule: CanonicalSchedule) {
  const cpmActivities: CpmActivity[] = schedule.activities.map((act) => ({
    id: act.code,
    code: act.code,
    remainingDuration: act.remainingDuration,
    calendarId: act.calendarSourceId ?? '__default__',
    status: act.status as 'not_started' | 'in_progress' | 'complete',
    actualStart: act.actualStart,
    actualFinish: act.actualFinish,
    constraintType: null,
    constraintDate: null,
    type: act.type as 'task_dependent' | 'task_milestone' | 'LOE' | 'WBS_summary',
  }));

  const cpmRelationships: CpmRelationship[] = schedule.relationships.map((rel) => ({
    predecessorId: rel.predecessorCode,
    successorId: rel.successorCode,
    type: rel.type as 'FS' | 'SS' | 'FF' | 'SF',
    lagDays: rel.lagDays,
  }));

  return calculateCpm({
    activities: cpmActivities,
    relationships: cpmRelationships,
    calendar: calEngine,
    projectStart: PROJECT_START,
    dataDate: PROJECT_START,
  });
}

function makeScenario(delays: Array<{ activityCode: string; delayDays: number }>): WhatIfScenario {
  return {
    id: 'test-scenario',
    name: 'Test Scenario',
    delays,
    createdAt: new Date(),
  };
}

describe('What-If Engine Tests', () => {
  it('TEST-6.1: Single critical activity delayed 5 days (A->B->C chain)', () => {
    // A->B->C, all FS, 5 days each. Delay B by 5 days.
    const activities = [
      makeCanonicalActivity('A', 5),
      makeCanonicalActivity('B', 5),
      makeCanonicalActivity('C', 5),
    ];
    const relationships = [
      makeCanonicalRel('A', 'B'),
      makeCanonicalRel('B', 'C'),
    ];
    const schedule = makeSchedule(activities, relationships);
    const originalCpm = runOriginalCpm(schedule);
    const scenario = makeScenario([{ activityCode: 'B', delayDays: 5 }]);

    const impact = runWhatIf(schedule, originalCpm, [standardCal], scenario);

    expect(impact.finishDeltaDays).toBe(5);
    // B and C should both shift
    expect(impact.activitiesAffected).toBe(2);
  });

  it('TEST-6.2: Non-critical activity delayed within float', () => {
    // A->C (10 days) and B->C (5 days): B has float of ~5 days
    // Delay B by 5 days — should be absorbed by float
    const activities = [
      makeCanonicalActivity('A', 10),
      makeCanonicalActivity('B', 5),
      makeCanonicalActivity('C', 5),
    ];
    const relationships = [
      makeCanonicalRel('A', 'C'),
      makeCanonicalRel('B', 'C'),
    ];
    const schedule = makeSchedule(activities, relationships);
    const originalCpm = runOriginalCpm(schedule);

    // B has float because A->C is the critical path
    const bResult = originalCpm.activities.get('B');
    expect(bResult?.totalFloat).toBeGreaterThan(0);

    const scenario = makeScenario([{ activityCode: 'B', delayDays: 5 }]);
    const impact = runWhatIf(schedule, originalCpm, [standardCal], scenario);

    expect(impact.finishDeltaDays).toBe(0);
    // Project doesn't slip — delay is absorbed within float
  });

  it('TEST-6.3: Non-critical delayed beyond float', () => {
    // A(10d)->C and B(5d)->C: B has ~5 days float. Delay B by 10 days.
    const activities = [
      makeCanonicalActivity('A', 10),
      makeCanonicalActivity('B', 5),
      makeCanonicalActivity('C', 5),
    ];
    const relationships = [
      makeCanonicalRel('A', 'C'),
      makeCanonicalRel('B', 'C'),
    ];
    const schedule = makeSchedule(activities, relationships);
    const originalCpm = runOriginalCpm(schedule);

    const bOrigFloat = originalCpm.activities.get('B')?.totalFloat ?? 0;

    const scenario = makeScenario([{ activityCode: 'B', delayDays: 10 }]);
    const impact = runWhatIf(schedule, originalCpm, [standardCal], scenario);

    // B becomes critical and project slips
    expect(impact.newCriticalActivities).toContain('B');
    // finishDeltaDays should be 10 - bOrigFloat (excess beyond float)
    expect(impact.finishDeltaDays).toBeGreaterThan(0);
    expect(impact.finishDeltaDays).toBe(10 - bOrigFloat);
  });

  it('TEST-6.4: Multiple activity delays — cascading impact', () => {
    // A->B->C->D chain, 5d each. Delay A by 2 days and C by 3 days.
    // Combined = 5 days slip
    const activities = [
      makeCanonicalActivity('A', 5),
      makeCanonicalActivity('B', 5),
      makeCanonicalActivity('C', 5),
      makeCanonicalActivity('D', 5),
    ];
    const relationships = [
      makeCanonicalRel('A', 'B'),
      makeCanonicalRel('B', 'C'),
      makeCanonicalRel('C', 'D'),
    ];
    const schedule = makeSchedule(activities, relationships);
    const originalCpm = runOriginalCpm(schedule);

    const scenario = makeScenario([
      { activityCode: 'A', delayDays: 2 },
      { activityCode: 'C', delayDays: 3 },
    ]);
    const impact = runWhatIf(schedule, originalCpm, [standardCal], scenario);

    // All downstream activities shift
    expect(impact.finishDeltaDays).toBe(5);
    expect(impact.activitiesAffected).toBeGreaterThanOrEqual(3);
  });

  it('TEST-6.5: Negative delay (acceleration) on critical activity', () => {
    // A->B->C chain, 5d each. Accelerate C by 3 days.
    const activities = [
      makeCanonicalActivity('A', 5),
      makeCanonicalActivity('B', 5),
      makeCanonicalActivity('C', 5),
    ];
    const relationships = [
      makeCanonicalRel('A', 'B'),
      makeCanonicalRel('B', 'C'),
    ];
    const schedule = makeSchedule(activities, relationships);
    const originalCpm = runOriginalCpm(schedule);

    const scenario = makeScenario([{ activityCode: 'C', delayDays: -3 }]);
    const impact = runWhatIf(schedule, originalCpm, [standardCal], scenario);

    // Project finishes 3 days earlier
    expect(impact.finishDeltaDays).toBe(-3);
  });

  it('TEST-6.6: Milestone at risk detected', () => {
    // A(5d)->B(5d)->M(milestone). Delay A by 3 days.
    const activities = [
      makeCanonicalActivity('A', 5),
      makeCanonicalActivity('B', 5),
      makeCanonicalActivity('M', 0, {
        type: 'task_milestone',
        name: 'Key Milestone',
      }),
    ];
    const relationships = [
      makeCanonicalRel('A', 'B'),
      makeCanonicalRel('B', 'M'),
    ];
    const schedule = makeSchedule(activities, relationships);
    const originalCpm = runOriginalCpm(schedule);

    const scenario = makeScenario([{ activityCode: 'A', delayDays: 3 }]);
    const impact = runWhatIf(schedule, originalCpm, [standardCal], scenario);

    expect(impact.milestonesAtRisk).toHaveLength(1);
    expect(impact.milestonesAtRisk[0].code).toBe('M');
    expect(impact.milestonesAtRisk[0].slipDays).toBe(3);
  });

  it('TEST-6.7: No impact when delay on disconnected activity', () => {
    // A->B->C chain. D is disconnected. Delay D by 10 days.
    const activities = [
      makeCanonicalActivity('A', 5),
      makeCanonicalActivity('B', 5),
      makeCanonicalActivity('C', 5),
      makeCanonicalActivity('D', 5), // disconnected
    ];
    const relationships = [
      makeCanonicalRel('A', 'B'),
      makeCanonicalRel('B', 'C'),
    ];
    const schedule = makeSchedule(activities, relationships);
    const originalCpm = runOriginalCpm(schedule);

    const scenario = makeScenario([{ activityCode: 'D', delayDays: 10 }]);
    const impact = runWhatIf(schedule, originalCpm, [standardCal], scenario);

    expect(impact.finishDeltaDays).toBe(0);
    // Only D itself is affected (its own finish shifts)
    expect(impact.activitiesAffected).toBe(1);
  });
});

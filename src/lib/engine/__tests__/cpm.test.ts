import { describe, it, expect } from 'vitest';
import { calculateCpm, CpmActivity, CpmRelationship, CpmInput } from '../cpm';
import { CalendarEngine, CalendarDef } from '../calendar';

const standardCal: CalendarDef = {
  id: 'standard',
  workdays: [1, 2, 3, 4, 5],
  holidays: [],
  hoursPerDay: 8,
};

const calWithXmas: CalendarDef = {
  id: 'withXmas',
  workdays: [1, 2, 3, 4, 5],
  holidays: ['2026-12-25'],
  hoursPerDay: 8,
};

const calendar = new CalendarEngine([standardCal, calWithXmas]);

function d(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function dateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function makeActivity(
  id: string,
  duration: number,
  overrides: Partial<CpmActivity> = {}
): CpmActivity {
  return {
    id,
    code: id,
    remainingDuration: duration,
    calendarId: 'standard',
    status: 'not_started',
    actualStart: null,
    actualFinish: null,
    constraintType: null,
    constraintDate: null,
    type: 'task_dependent',
    ...overrides,
  };
}

function makeRel(
  predId: string,
  succId: string,
  type: 'FS' | 'SS' | 'FF' | 'SF' = 'FS',
  lagDays = 0
): CpmRelationship {
  return { predecessorId: predId, successorId: succId, type, lagDays };
}

// Monday 2026-01-05
const MON = d('2026-01-05');

describe('CPM Tests', () => {
  it('TEST-3.1: Simple chain A→B→C (FS, no lag, 5 days each)', () => {
    const activities = [
      makeActivity('A', 5),
      makeActivity('B', 5),
      makeActivity('C', 5),
    ];
    const relationships = [makeRel('A', 'B'), makeRel('B', 'C')];
    const result = calculateCpm({ activities, relationships, calendar, projectStart: MON, dataDate: MON });

    expect(result.errors).toHaveLength(0);

    const A = result.activities.get('A')!;
    const B = result.activities.get('B')!;
    const C = result.activities.get('C')!;

    // A: ES=Mon Jan 5, EF=Fri Jan 9
    expect(dateStr(A.earlyStart)).toBe('2026-01-05');
    expect(dateStr(A.earlyFinish)).toBe('2026-01-09');

    // B: ES=Mon Jan 12, EF=Fri Jan 16
    expect(dateStr(B.earlyStart)).toBe('2026-01-12');
    expect(dateStr(B.earlyFinish)).toBe('2026-01-16');

    // C: ES=Mon Jan 19, EF=Fri Jan 23
    expect(dateStr(C.earlyStart)).toBe('2026-01-19');
    expect(dateStr(C.earlyFinish)).toBe('2026-01-23');
  });

  it('TEST-3.2: Parallel paths — A→B, A→C, B→D, C→D. A=5d, B=10d, C=3d, D=2d', () => {
    const activities = [
      makeActivity('A', 5),
      makeActivity('B', 10),
      makeActivity('C', 3),
      makeActivity('D', 2),
    ];
    const relationships = [
      makeRel('A', 'B'),
      makeRel('A', 'C'),
      makeRel('B', 'D'),
      makeRel('C', 'D'),
    ];
    const result = calculateCpm({ activities, relationships, calendar, projectStart: MON, dataDate: MON });

    expect(result.errors).toHaveLength(0);

    // Critical path: A→B→D (5+10+2=17 days)
    // C path: 5+3+2=10 days, float on C = 17-10 = 7
    expect(result.criticalPath).toContain('A');
    expect(result.criticalPath).toContain('B');
    expect(result.criticalPath).toContain('D');

    const C = result.activities.get('C')!;
    expect(C.totalFloat).toBe(7);
    expect(C.isCritical).toBe(false);

    const B = result.activities.get('B')!;
    expect(B.totalFloat).toBe(0);
    expect(B.isCritical).toBe(true);
  });

  it('TEST-3.3: Lag — A→B (FS+3 days). A=5d, B=5d', () => {
    const activities = [makeActivity('A', 5), makeActivity('B', 5)];
    const relationships = [makeRel('A', 'B', 'FS', 3)];
    const result = calculateCpm({ activities, relationships, calendar, projectStart: MON, dataDate: MON });

    expect(result.errors).toHaveLength(0);

    const A = result.activities.get('A')!;
    const B = result.activities.get('B')!;

    // A: ES=Jan 5, EF=Jan 9
    expect(dateStr(A.earlyFinish)).toBe('2026-01-09');

    // B should start 3 working days after A finishes
    // A finishes Fri Jan 9, +3 working days: Mon(12), Tue(13), Wed(14)
    // B ES = Jan 14 (Wed)
    expect(dateStr(B.earlyStart)).toBe('2026-01-14');
  });

  it('TEST-3.4: SS relationship — A→B (SS+2days). A=10d, B=5d', () => {
    const activities = [makeActivity('A', 10), makeActivity('B', 5)];
    const relationships = [makeRel('A', 'B', 'SS', 2)];
    const result = calculateCpm({ activities, relationships, calendar, projectStart: MON, dataDate: MON });

    expect(result.errors).toHaveLength(0);

    const A = result.activities.get('A')!;
    const B = result.activities.get('B')!;

    // A ES = Jan 5
    expect(dateStr(A.earlyStart)).toBe('2026-01-05');

    // B ES = A.ES + 2 working days = Jan 5 + 2 = Jan 7
    expect(dateStr(B.earlyStart)).toBe('2026-01-07');
  });

  it('TEST-3.5: FF relationship — A→B (FF, no lag). A=10d, B=5d', () => {
    const activities = [makeActivity('A', 10), makeActivity('B', 5)];
    const relationships = [makeRel('A', 'B', 'FF', 0)];
    const result = calculateCpm({ activities, relationships, calendar, projectStart: MON, dataDate: MON });

    expect(result.errors).toHaveLength(0);

    const A = result.activities.get('A')!;
    const B = result.activities.get('B')!;

    // A: ES=Jan 5, EF=Jan 16 (10 working days)
    expect(dateStr(A.earlyFinish)).toBe('2026-01-16');

    // B: EF = A.EF = Jan 16, ES = 5 working days before A finishes
    // subtractWorkingDays(Fri Jan 16, 5) = Fri Jan 9 (exclusive end, so Mon12,Tue13,Wed14,Thu15,Fri9 counted back)
    expect(dateStr(B.earlyFinish)).toBe('2026-01-16');
    expect(dateStr(B.earlyStart)).toBe('2026-01-09');
  });

  it('TEST-3.6: Circular dependency A→B→C→A', () => {
    const activities = [makeActivity('A', 5), makeActivity('B', 5), makeActivity('C', 5)];
    const relationships = [makeRel('A', 'B'), makeRel('B', 'C'), makeRel('C', 'A')];
    const result = calculateCpm({ activities, relationships, calendar, projectStart: MON, dataDate: MON });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('CIRCULAR_DEPENDENCY');
  });

  it('TEST-3.7: Calendar skips weekends — addWorkingDays(Friday 2026-01-09, 1) = Monday 2026-01-12', () => {
    const result = calendar.addWorkingDays(d('2026-01-09'), 1, 'standard');
    expect(dateStr(result)).toBe('2026-01-12');
  });

  it('TEST-3.8: Calendar with holiday — addWorkingDays(Wed 2026-12-23, 2, withXmas) = Mon 2026-12-28', () => {
    const result = calendar.addWorkingDays(d('2026-12-23'), 2, 'withXmas');
    expect(dateStr(result)).toBe('2026-12-28');
  });

  it('TEST-3.9: Completed activity uses actual dates', () => {
    const actualStart = d('2026-01-05');
    const actualFinish = d('2026-01-09');
    const activities = [
      makeActivity('A', 5, {
        status: 'complete',
        actualStart,
        actualFinish,
      }),
    ];
    const result = calculateCpm({ activities, relationships: [], calendar, projectStart: MON, dataDate: MON });

    const A = result.activities.get('A')!;
    expect(dateStr(A.earlyStart)).toBe('2026-01-05');
    expect(dateStr(A.earlyFinish)).toBe('2026-01-09');
  });

  it('TEST-3.10: Milestone (duration=0)', () => {
    const activities = [
      makeActivity('A', 5),
      makeActivity('M', 0, { type: 'task_milestone' }),
      makeActivity('B', 5),
    ];
    const relationships = [makeRel('A', 'M'), makeRel('M', 'B')];
    const result = calculateCpm({ activities, relationships, calendar, projectStart: MON, dataDate: MON });

    expect(result.errors).toHaveLength(0);

    const M = result.activities.get('M')!;
    // ES should equal EF for milestone
    expect(dateStr(M.earlyStart)).toBe(dateStr(M.earlyFinish));
  });

  it('TEST-3.11: Negative float — activity with totalFloat < 0 → isCritical=true', () => {
    // Create a scenario where an activity has a Must Finish On constraint in the past
    const deadline = d('2026-01-08'); // Thursday, but A needs 5 days from Mon = needs to finish Fri
    const activities = [
      makeActivity('A', 5, {
        constraintType: 'CSTR_MFO',
        constraintDate: deadline,
      }),
    ];
    const result = calculateCpm({ activities, relationships: [], calendar, projectStart: MON, dataDate: MON });

    const A = result.activities.get('A')!;
    expect(A.isCritical).toBe(true);
    expect(A.totalFloat).toBeLessThanOrEqual(0);
  });
});

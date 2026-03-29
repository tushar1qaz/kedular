import { describe, it, expect } from 'vitest';
import { diffVersions } from '../diff-engine';
import { CanonicalSchedule, CanonicalActivity } from '../../parsers/normaliser';

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
    totalFloat: 5,
    freeFloat: 0,
    percentComplete: 0,
    calendarSourceId: null,
    ...overrides,
  };
}

function makeSchedule(activities: CanonicalActivity[]): CanonicalSchedule {
  return {
    project: { name: 'Test', description: '', dataDate: null },
    activities,
    relationships: [],
    wbsNodes: [],
    calendars: [],
  };
}

// TEST-5.7: V1 has 5 activities, V2 has 3 modified + 1 added + 1 removed
describe('TEST-5.7: Basic diff counts', () => {
  it('correctly counts added/removed/modified', () => {
    const v1Acts = [
      makeActivity('A1'),
      makeActivity('A2'),
      makeActivity('A3'),
      makeActivity('A4'),
      makeActivity('A5'),
    ];

    const v2Acts = [
      makeActivity('A1', { percentComplete: 50 }), // modified
      makeActivity('A2', { remainingDuration: 10 }), // modified
      makeActivity('A3', { status: 'in_progress' }), // modified
      // A4 removed
      // A5 removed? No — only 1 removed
      makeActivity('A5'), // unchanged
      makeActivity('A6'), // added
    ];

    const base = makeSchedule(v1Acts);
    const compare = makeSchedule(v2Acts);

    const diff = diffVersions(base, compare);

    expect(diff.added).toBe(1);    // A6 added
    expect(diff.removed).toBe(1);  // A4 removed
    expect(diff.modified).toBe(3); // A1, A2, A3 modified
  });
});

// TEST-5.10: Activity renamed but same code → matched as modified (not deleted+added)
describe('TEST-5.10: Same code, renamed activity', () => {
  it('matches by code and reports as modified (not added+removed)', () => {
    const v1Acts = [
      makeActivity('A1', { name: 'Original Name' }),
      makeActivity('A2'),
    ];

    const v2Acts = [
      makeActivity('A1', { name: 'New Name' }), // same code, different name
      makeActivity('A2'),
    ];

    const base = makeSchedule(v1Acts);
    const compare = makeSchedule(v2Acts);

    const diff = diffVersions(base, compare);

    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
    expect(diff.modified).toBe(1);
    expect(diff.changes[0].changeType).toBe('modified');
    expect(diff.changes[0].code).toBe('A1');
    const nameChange = diff.changes[0].fieldChanges.find((f) => f.field === 'name');
    expect(nameChange).toBeDefined();
    expect(nameChange!.oldValue).toBe('Original Name');
    expect(nameChange!.newValue).toBe('New Name');
  });
});

describe('Critical path severity', () => {
  it('assigns HIGH severity to date change on critical activity', () => {
    const v1Acts = [makeActivity('A1', { totalFloat: 0, plannedFinish: new Date('2026-01-10') })];
    const v2Acts = [makeActivity('A1', { totalFloat: 0, plannedFinish: new Date('2026-02-10') })]; // slipped

    const diff = diffVersions(makeSchedule(v1Acts), makeSchedule(v2Acts));

    expect(diff.highSeverityCount).toBe(1);
    const change = diff.changes.find((c) => c.code === 'A1');
    expect(change?.severity).toBe('HIGH');
  });

  it('assigns HIGH severity when activity becomes critical', () => {
    const v1Acts = [makeActivity('A1', { totalFloat: 10 })]; // not critical
    const v2Acts = [makeActivity('A1', { totalFloat: 0 })];  // now critical

    const diff = diffVersions(makeSchedule(v1Acts), makeSchedule(v2Acts));

    const change = diff.changes.find((c) => c.code === 'A1');
    expect(change?.severity).toBe('HIGH');
    expect(change?.isCriticalInBase).toBe(false);
    expect(change?.isCriticalInCompare).toBe(true);
  });
});

describe('Project finish change', () => {
  it('calculates positive projectFinishChange when finish slips', () => {
    const v1Acts = [makeActivity('A1', { plannedFinish: new Date('2026-01-10') })];
    const v2Acts = [makeActivity('A1', { plannedFinish: new Date('2026-01-20') })];

    const diff = diffVersions(makeSchedule(v1Acts), makeSchedule(v2Acts));
    expect(diff.projectFinishChange).toBe(10);
  });

  it('calculates negative projectFinishChange when finish improves', () => {
    const v1Acts = [makeActivity('A1', { plannedFinish: new Date('2026-01-20') })];
    const v2Acts = [makeActivity('A1', { plannedFinish: new Date('2026-01-10') })];

    const diff = diffVersions(makeSchedule(v1Acts), makeSchedule(v2Acts));
    expect(diff.projectFinishChange).toBe(-10);
  });
});

describe('Fuzzy name matching', () => {
  it('matches activities with slightly different names within same WBS', () => {
    const v1Acts = [
      makeActivity('A1', { wbsCode: '1.0', name: 'Install piping' }),
    ];
    const v2Acts = [
      // Different code but same WBS and very similar name (Levenshtein distance <= 3)
      makeActivity('A2', { wbsCode: '1.0', name: 'Install pipingX' }),
    ];

    const diff = diffVersions(makeSchedule(v1Acts), makeSchedule(v2Acts));

    // Should be matched as modified via fuzzy match, not added+removed
    // (distance between 'Install piping' and 'Install pipingX' = 1)
    expect(diff.added + diff.removed).toBeLessThan(2);
  });
});

describe('No changes', () => {
  it('returns empty changes when schedules are identical', () => {
    const acts = [makeActivity('A1'), makeActivity('A2')];
    const base = makeSchedule(acts);
    const compare = makeSchedule([...acts]);

    const diff = diffVersions(base, compare);

    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
    expect(diff.modified).toBe(0);
    expect(diff.changes).toHaveLength(0);
  });
});

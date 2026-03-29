import { CanonicalSchedule, CanonicalActivity, CanonicalRelationship } from '../parsers/normaliser';
import { calculateCpm, CpmInput, CpmResult, CpmActivity, CpmRelationship } from './cpm';
import { CalendarEngine, CalendarDef } from './calendar';

export interface ActivityDelay {
  activityCode: string;
  delayDays: number; // positive = delay, negative = acceleration
}

export interface WhatIfScenario {
  id: string;
  name: string;
  description?: string;
  delays: ActivityDelay[];
  createdAt: Date;
}

export interface WhatIfImpact {
  originalFinish: Date | null;
  scenarioFinish: Date | null;
  finishDeltaDays: number; // positive = slipped, negative = improved
  activitiesAffected: number; // count of activities whose dates changed
  newCriticalActivities: string[]; // codes that became critical in scenario
  noLongerCritical: string[]; // codes that left critical path
  milestonesAtRisk: Array<{
    code: string;
    name: string;
    originalFinish: Date | null;
    scenarioFinish: Date | null;
    slipDays: number;
  }>;
  activityImpacts: Array<{
    code: string;
    name: string;
    originalStart: Date;
    originalFinish: Date;
    scenarioStart: Date;
    scenarioFinish: Date;
    slipDays: number;
    isCritical: boolean;
  }>;
}

function toCanonicalCpmActivity(act: CanonicalActivity): CpmActivity {
  return {
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
  };
}

function toCanonicalCpmRelationship(rel: CanonicalRelationship): CpmRelationship {
  return {
    predecessorId: rel.predecessorCode,
    successorId: rel.successorCode,
    type: rel.type as 'FS' | 'SS' | 'FF' | 'SF',
    lagDays: rel.lagDays,
  };
}

/**
 * Run a what-if scenario:
 * 1. Clone the schedule activities
 * 2. For each delay, adjust the activity's remainingDuration
 * 3. Re-run CPM
 * 4. Compare original vs scenario CPM results
 * 5. Return impact analysis
 */
export function runWhatIf(
  schedule: CanonicalSchedule,
  originalCpm: CpmResult,
  calendars: CalendarDef[],
  scenario: WhatIfScenario
): WhatIfImpact {
  const calendarEngine = new CalendarEngine(calendars);

  // Build delay map by activity code
  const delayMap = new Map<string, number>();
  for (const delay of scenario.delays) {
    delayMap.set(delay.activityCode, delay.delayDays);
  }

  // Deep clone activities and apply delays
  const clonedActivities: CpmActivity[] = schedule.activities.map((act) => {
    const cpmAct = toCanonicalCpmActivity(act);
    const delay = delayMap.get(act.code) ?? 0;
    if (delay !== 0) {
      cpmAct.remainingDuration = Math.max(0, cpmAct.remainingDuration + delay);
    }
    return cpmAct;
  });

  const cpmRelationships: CpmRelationship[] = schedule.relationships.map(toCanonicalCpmRelationship);

  // Determine project start date
  const today = new Date();
  const projectStart = schedule.project.dataDate ?? today;
  const dataDate = schedule.project.dataDate ?? today;

  const scenarioInput: CpmInput = {
    activities: clonedActivities,
    relationships: cpmRelationships,
    calendar: calendarEngine,
    projectStart,
    dataDate,
  };

  const scenarioCpm = calculateCpm(scenarioInput);

  // Determine original and scenario project finish
  const originalFinish = originalCpm.projectFinish;
  const scenarioFinish = scenarioCpm.projectFinish;

  // Compute finish delta in working days
  const finishDeltaDays = calendarEngine.getWorkingDaysBetween(
    originalFinish,
    scenarioFinish,
    '__default__'
  );

  // Build activity code -> name map
  const activityNameMap = new Map<string, string>();
  for (const act of schedule.activities) {
    activityNameMap.set(act.code, act.name);
  }

  // Count activities affected (whose early finish date changed)
  let activitiesAffected = 0;
  const newCriticalActivities: string[] = [];
  const noLongerCritical: string[] = [];
  const milestonesAtRisk: WhatIfImpact['milestonesAtRisk'] = [];
  const activityImpacts: WhatIfImpact['activityImpacts'] = [];

  for (const act of schedule.activities) {
    const origResult = originalCpm.activities.get(act.code);
    const scenResult = scenarioCpm.activities.get(act.code);

    if (!origResult || !scenResult) continue;

    const origFinish = origResult.earlyFinish;
    const scnFinish = scenResult.earlyFinish;
    const origStart = origResult.earlyStart;
    const scnStart = scenResult.earlyStart;

    const finishChanged = origFinish.getTime() !== scnFinish.getTime();
    if (finishChanged) {
      activitiesAffected++;
    }

    // Critical path changes
    if (!origResult.isCritical && scenResult.isCritical) {
      newCriticalActivities.push(act.code);
    }
    if (origResult.isCritical && !scenResult.isCritical) {
      noLongerCritical.push(act.code);
    }

    // Milestones at risk
    if (act.type === 'task_milestone' && scnFinish.getTime() > origFinish.getTime()) {
      const slipDays = calendarEngine.getWorkingDaysBetween(origFinish, scnFinish, '__default__');
      milestonesAtRisk.push({
        code: act.code,
        name: act.name,
        originalFinish: origFinish,
        scenarioFinish: scnFinish,
        slipDays,
      });
    }

    // Activity impacts (all activities with any shift)
    const slipDays = calendarEngine.getWorkingDaysBetween(origFinish, scnFinish, '__default__');
    activityImpacts.push({
      code: act.code,
      name: act.name,
      originalStart: origStart,
      originalFinish: origFinish,
      scenarioStart: scnStart,
      scenarioFinish: scnFinish,
      slipDays,
      isCritical: scenResult.isCritical,
    });
  }

  // Sort activity impacts by slip severity (most slipped first)
  activityImpacts.sort((a, b) => b.slipDays - a.slipDays);
  milestonesAtRisk.sort((a, b) => b.slipDays - a.slipDays);

  return {
    originalFinish,
    scenarioFinish,
    finishDeltaDays,
    activitiesAffected,
    newCriticalActivities,
    noLongerCritical,
    milestonesAtRisk,
    activityImpacts,
  };
}

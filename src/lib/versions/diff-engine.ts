import * as levenshtein from 'fast-levenshtein';
import { CanonicalSchedule, CanonicalActivity } from '../parsers/normaliser';

export type DiffSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ActivityDiff {
  code: string;
  changeType: 'added' | 'removed' | 'modified';
  severity: DiffSeverity;
  fieldChanges: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  isCriticalInBase: boolean;
  isCriticalInCompare: boolean;
}

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  projectFinishChange: number;   // days (positive = slipped, negative = improved)
  criticalPathChanges: number;   // activities that changed critical status
  highSeverityCount: number;
  changes: ActivityDiff[];
}

function getProjectFinish(schedule: CanonicalSchedule): Date | null {
  let latest: Date | null = null;
  for (const act of schedule.activities) {
    const finish = act.plannedFinish ?? act.actualFinish;
    if (finish && (!latest || finish > latest)) {
      latest = finish;
    }
  }
  return latest;
}

function isCritical(act: CanonicalActivity): boolean {
  return act.totalFloat <= 0;
}

function isMilestone(act: CanonicalActivity): boolean {
  return act.type === 'task_milestone';
}

function computeSeverity(
  diff: Omit<ActivityDiff, 'severity'>,
  base: CanonicalActivity | null,
  compare: CanonicalActivity | null
): DiffSeverity {
  if (diff.changeType === 'added' || diff.changeType === 'removed') {
    if (
      (base && isCritical(base)) ||
      (compare && isCritical(compare))
    ) {
      return 'HIGH';
    }
    return 'MEDIUM';
  }

  // Modified
  for (const fc of diff.fieldChanges) {
    // Date change on critical activity
    if (
      (fc.field === 'plannedStart' || fc.field === 'plannedFinish') &&
      (diff.isCriticalInBase || diff.isCriticalInCompare)
    ) {
      return 'HIGH';
    }

    // Milestone finish slips > 5 days
    if (
      fc.field === 'plannedFinish' &&
      base &&
      isMilestone(base) &&
      compare &&
      isMilestone(compare)
    ) {
      const oldDate = fc.oldValue instanceof Date ? fc.oldValue : (fc.oldValue ? new Date(fc.oldValue as string) : null);
      const newDate = fc.newValue instanceof Date ? fc.newValue : (fc.newValue ? new Date(fc.newValue as string) : null);
      if (oldDate && newDate) {
        const diffDays = (newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 5) return 'HIGH';
      }
    }
  }

  // Changed critical status
  if (diff.isCriticalInBase !== diff.isCriticalInCompare) {
    return 'HIGH';
  }

  // MEDIUM checks
  for (const fc of diff.fieldChanges) {
    if (fc.field === 'plannedStart' || fc.field === 'plannedFinish') {
      return 'MEDIUM';
    }
    if (fc.field === 'wbsCode') return 'MEDIUM';
    if (fc.field === 'type') return 'MEDIUM';
    if (fc.field === 'remainingDuration' && base && compare) {
      const oldDur = base.remainingDuration;
      const newDur = compare.remainingDuration;
      if (oldDur > 0 && Math.abs(newDur - oldDur) / oldDur > 0.05) {
        return 'MEDIUM';
      }
    }
  }

  return 'LOW';
}

function diffActivities(
  base: CanonicalActivity,
  compare: CanonicalActivity
): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
  const fields: Array<keyof CanonicalActivity> = [
    'name',
    'type',
    'status',
    'wbsCode',
    'plannedStart',
    'plannedFinish',
    'actualStart',
    'actualFinish',
    'remainingDuration',
    'percentComplete',
    'totalFloat',
  ];

  const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];

  for (const field of fields) {
    const oldVal = base[field];
    const newVal = compare[field];

    // Date comparison
    if (oldVal instanceof Date && newVal instanceof Date) {
      if (oldVal.getTime() !== newVal.getTime()) {
        changes.push({ field, oldValue: oldVal, newValue: newVal });
      }
    } else if (oldVal !== newVal) {
      changes.push({ field, oldValue: oldVal, newValue: newVal });
    }
  }

  return changes;
}

export function diffVersions(
  base: CanonicalSchedule,
  compare: CanonicalSchedule
): DiffSummary {
  const baseByCode = new Map<string, CanonicalActivity>();
  for (const act of base.activities) {
    baseByCode.set(act.code, act);
  }

  const compareByCode = new Map<string, CanonicalActivity>();
  for (const act of compare.activities) {
    compareByCode.set(act.code, act);
  }

  const changes: ActivityDiff[] = [];
  const matchedCompareCodes = new Set<string>();

  // Find modified and removed
  for (const baseAct of base.activities) {
    const compareAct = compareByCode.get(baseAct.code);
    if (compareAct) {
      // Matched by code
      matchedCompareCodes.add(baseAct.code);
      const fieldChanges = diffActivities(baseAct, compareAct);
      if (fieldChanges.length > 0) {
        const partialDiff = {
          code: baseAct.code,
          changeType: 'modified' as const,
          fieldChanges,
          isCriticalInBase: isCritical(baseAct),
          isCriticalInCompare: isCritical(compareAct),
        };
        const severity = computeSeverity(partialDiff, baseAct, compareAct);
        changes.push({ ...partialDiff, severity });
      }
    } else {
      // Try fuzzy name match within same WBS
      let fuzzyMatch: CanonicalActivity | null = null;
      for (const compareAct of compare.activities) {
        if (matchedCompareCodes.has(compareAct.code)) continue;
        if (compareAct.wbsCode !== baseAct.wbsCode) continue;
        const dist = levenshtein.get(baseAct.name, compareAct.name);
        const maxLen = Math.max(baseAct.name.length, compareAct.name.length);
        // Require distance <= 3 AND proportionally small relative to name length
        // The maxLen >= 15 guard prevents short generic names like "Activity A4" matching "Activity A6"
        if (dist <= 3 && maxLen >= 15 && dist / maxLen < 0.2) {
          fuzzyMatch = compareAct;
          break;
        }
      }

      if (fuzzyMatch) {
        matchedCompareCodes.add(fuzzyMatch.code);
        const fieldChanges = diffActivities(baseAct, fuzzyMatch);
        // Always add code change for fuzzy match
        if (!fieldChanges.find((f) => f.field === 'code')) {
          fieldChanges.unshift({
            field: 'code',
            oldValue: baseAct.code,
            newValue: fuzzyMatch.code,
          });
        }
        const partialDiff = {
          code: baseAct.code,
          changeType: 'modified' as const,
          fieldChanges,
          isCriticalInBase: isCritical(baseAct),
          isCriticalInCompare: isCritical(fuzzyMatch),
        };
        const severity = computeSeverity(partialDiff, baseAct, fuzzyMatch);
        changes.push({ ...partialDiff, severity });
      } else {
        // Removed
        const partialDiff = {
          code: baseAct.code,
          changeType: 'removed' as const,
          fieldChanges: [],
          isCriticalInBase: isCritical(baseAct),
          isCriticalInCompare: false,
        };
        const severity = computeSeverity(partialDiff, baseAct, null);
        changes.push({ ...partialDiff, severity });
      }
    }
  }

  // Find added activities
  for (const compareAct of compare.activities) {
    if (!matchedCompareCodes.has(compareAct.code)) {
      const partialDiff = {
        code: compareAct.code,
        changeType: 'added' as const,
        fieldChanges: [],
        isCriticalInBase: false,
        isCriticalInCompare: isCritical(compareAct),
      };
      const severity = computeSeverity(partialDiff, null, compareAct);
      changes.push({ ...partialDiff, severity });
    }
  }

  // Compute project finish change
  const baseFinish = getProjectFinish(base);
  const compareFinish = getProjectFinish(compare);
  let projectFinishChange = 0;
  if (baseFinish && compareFinish) {
    projectFinishChange = Math.round(
      (compareFinish.getTime() - baseFinish.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // Count critical path changes
  const criticalPathChanges = changes.filter(
    (c) => c.changeType === 'modified' && c.isCriticalInBase !== c.isCriticalInCompare
  ).length;

  const added = changes.filter((c) => c.changeType === 'added').length;
  const removed = changes.filter((c) => c.changeType === 'removed').length;
  const modified = changes.filter((c) => c.changeType === 'modified').length;
  const highSeverityCount = changes.filter((c) => c.severity === 'HIGH').length;

  return {
    added,
    removed,
    modified,
    projectFinishChange,
    criticalPathChanges,
    highSeverityCount,
    changes,
  };
}

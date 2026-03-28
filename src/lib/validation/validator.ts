import { CanonicalSchedule } from '../parsers/normaliser';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  activityCode?: string;
  activityId?: string;
  relatedCodes?: string[];
}

export interface ValidationResult {
  issues: ValidationIssue[];
  canExport: boolean;       // false if any severity='error' exists
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

// ── Cycle detection using Kahn's algorithm ──────────────────────────────────

export function hasCycles(
  activityCodes: Set<string>,
  relationships: Array<{ predecessorCode: string; successorCode: string }>
): { hasCycle: boolean; cycle?: string[] } {
  const successors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const code of activityCodes) {
    successors.set(code, []);
    inDegree.set(code, 0);
  }

  for (const rel of relationships) {
    if (!activityCodes.has(rel.predecessorCode) || !activityCodes.has(rel.successorCode)) {
      continue;
    }
    successors.get(rel.predecessorCode)!.push(rel.successorCode);
    inDegree.set(rel.successorCode, (inDegree.get(rel.successorCode) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [code, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(code);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const succ of successors.get(current) ?? []) {
      const newDeg = (inDegree.get(succ) ?? 0) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) queue.push(succ);
    }
  }

  if (sorted.length !== activityCodes.size) {
    const cycle: string[] = [];
    for (const code of activityCodes) {
      if (!sorted.includes(code)) cycle.push(code);
    }
    return { hasCycle: true, cycle };
  }

  return { hasCycle: false };
}

// ── Main validation function ─────────────────────────────────────────────────

export function validateSchedule(schedule: CanonicalSchedule): ValidationResult {
  const issues: ValidationIssue[] = [];

  const { activities, relationships, wbsNodes, calendars, project } = schedule;
  const activityCodeSet = new Set(activities.map(a => a.code));
  const calendarSourceIds = new Set(calendars.map(c => c.sourceId));
  const wbsSourceIdSet = new Set(wbsNodes.map(w => w.sourceId));

  // ── ERRORS ───────────────────────────────────────────────────────────────

  // 1. CIRCULAR_DEPENDENCY
  const cycleResult = hasCycles(
    activityCodeSet,
    relationships.map(r => ({ predecessorCode: r.predecessorCode, successorCode: r.successorCode }))
  );
  if (cycleResult.hasCycle) {
    issues.push({
      code: 'CIRCULAR_DEPENDENCY',
      severity: 'error',
      message: `Circular dependency detected among ${cycleResult.cycle?.length ?? 0} activities`,
      relatedCodes: cycleResult.cycle,
    });
  }

  // 2. ACTIVITY_START_AFTER_FINISH
  for (const act of activities) {
    if (act.plannedStart && act.plannedFinish && act.plannedStart > act.plannedFinish) {
      issues.push({
        code: 'ACTIVITY_START_AFTER_FINISH',
        severity: 'error',
        message: `Activity "${act.code}" has planned_start (${act.plannedStart.toISOString()}) after planned_finish (${act.plannedFinish.toISOString()})`,
        activityCode: act.code,
        activityId: act.sourceId,
      });
    }
  }

  // 3. NEGATIVE_DURATION
  for (const act of activities) {
    if (act.remainingDuration < 0) {
      issues.push({
        code: 'NEGATIVE_DURATION',
        severity: 'error',
        message: `Activity "${act.code}" has negative remaining_duration (${act.remainingDuration})`,
        activityCode: act.code,
        activityId: act.sourceId,
      });
    }
  }

  // 4. ORPHAN_ACTIVITY_NO_WBS
  if (wbsNodes.length > 0) {
    for (const act of activities) {
      if (!act.wbsCode) {
        issues.push({
          code: 'ORPHAN_ACTIVITY_NO_WBS',
          severity: 'error',
          message: `Activity "${act.code}" has no wbs_code but project has WBS nodes defined`,
          activityCode: act.code,
          activityId: act.sourceId,
        });
      }
    }
  }

  // 5. DUPLICATE_ACTIVITY_CODE
  const seenCodes = new Map<string, number>();
  for (const act of activities) {
    seenCodes.set(act.code, (seenCodes.get(act.code) ?? 0) + 1);
  }
  for (const [code, count] of seenCodes.entries()) {
    if (count > 1) {
      issues.push({
        code: 'DUPLICATE_ACTIVITY_CODE',
        severity: 'error',
        message: `Activity code "${code}" appears ${count} times in the schedule`,
        activityCode: code,
      });
    }
  }

  // 6. MISSING_ACTIVITY_NAME
  for (const act of activities) {
    if (!act.name || act.name.trim() === '') {
      issues.push({
        code: 'MISSING_ACTIVITY_NAME',
        severity: 'error',
        message: `Activity "${act.code}" has an empty or null name`,
        activityCode: act.code,
        activityId: act.sourceId,
      });
    }
  }

  // 7. INVALID_RELATIONSHIP_REF
  for (const rel of relationships) {
    if (!activityCodeSet.has(rel.predecessorCode)) {
      issues.push({
        code: 'INVALID_RELATIONSHIP_REF',
        severity: 'error',
        message: `Relationship references predecessor "${rel.predecessorCode}" which does not exist`,
        relatedCodes: [rel.predecessorCode, rel.successorCode],
      });
    }
    if (!activityCodeSet.has(rel.successorCode)) {
      issues.push({
        code: 'INVALID_RELATIONSHIP_REF',
        severity: 'error',
        message: `Relationship references successor "${rel.successorCode}" which does not exist`,
        relatedCodes: [rel.predecessorCode, rel.successorCode],
      });
    }
  }

  // 8. WBS_BROKEN_HIERARCHY
  for (const wbs of wbsNodes) {
    if (wbs.parentSourceId && !wbsSourceIdSet.has(wbs.parentSourceId)) {
      issues.push({
        code: 'WBS_BROKEN_HIERARCHY',
        severity: 'error',
        message: `WBS node "${wbs.code}" (${wbs.sourceId}) references parent "${wbs.parentSourceId}" which does not exist`,
      });
    }
  }

  // 9. MISSING_CALENDAR_REF
  for (const act of activities) {
    if (act.calendarSourceId && !calendarSourceIds.has(act.calendarSourceId)) {
      issues.push({
        code: 'MISSING_CALENDAR_REF',
        severity: 'error',
        message: `Activity "${act.code}" references calendar "${act.calendarSourceId}" which does not exist in the schedule`,
        activityCode: act.code,
        activityId: act.sourceId,
      });
    }
  }

  // 10. MILESTONE_WITH_DURATION
  for (const act of activities) {
    if (act.type === 'task_milestone' && act.remainingDuration > 0) {
      issues.push({
        code: 'MILESTONE_WITH_DURATION',
        severity: 'error',
        message: `Milestone activity "${act.code}" has remaining_duration of ${act.remainingDuration} days (should be 0)`,
        activityCode: act.code,
        activityId: act.sourceId,
      });
    }
  }

  // ── WARNINGS ──────────────────────────────────────────────────────────────

  // Build successor/predecessor maps for logic checks
  const predecessorsByCode = new Map<string, string[]>();
  const successorsByCode = new Map<string, string[]>();
  for (const act of activities) {
    predecessorsByCode.set(act.code, []);
    successorsByCode.set(act.code, []);
  }
  for (const rel of relationships) {
    if (activityCodeSet.has(rel.predecessorCode) && activityCodeSet.has(rel.successorCode)) {
      successorsByCode.get(rel.predecessorCode)?.push(rel.successorCode);
      predecessorsByCode.get(rel.successorCode)?.push(rel.predecessorCode);
    }
  }

  // 11. NO_PREDECESSORS — skip if only one activity
  if (activities.length > 1) {
    for (const act of activities) {
      const preds = predecessorsByCode.get(act.code) ?? [];
      if (preds.length === 0) {
        issues.push({
          code: 'NO_PREDECESSORS',
          severity: 'warning',
          message: `Activity "${act.code}" has no predecessors`,
          activityCode: act.code,
          activityId: act.sourceId,
        });
      }
    }
  }

  // 12. NO_SUCCESSORS — skip if only one activity
  if (activities.length > 1) {
    for (const act of activities) {
      const succs = successorsByCode.get(act.code) ?? [];
      if (succs.length === 0) {
        issues.push({
          code: 'NO_SUCCESSORS',
          severity: 'warning',
          message: `Activity "${act.code}" has no successors`,
          activityCode: act.code,
          activityId: act.sourceId,
        });
      }
    }
  }

  // 13. NEGATIVE_FLOAT — not on critical path
  for (const act of activities) {
    if (act.totalFloat < 0) {
      issues.push({
        code: 'NEGATIVE_FLOAT',
        severity: 'warning',
        message: `Activity "${act.code}" has negative total float (${act.totalFloat} days)`,
        activityCode: act.code,
        activityId: act.sourceId,
      });
    }
  }

  // 14. HARD_CONSTRAINT
  const hardConstraintTypes = ['Must Start On', 'Must Finish On', 'CSTR_MSO', 'CSTR_MFO'];
  for (const act of activities) {
    const rawRow = act.rawXerRow as Record<string, string> | undefined;
    const constraintType = rawRow?.['cstr_type'] ?? rawRow?.['constraint_type'];
    if (constraintType && hardConstraintTypes.includes(constraintType)) {
      issues.push({
        code: 'HARD_CONSTRAINT',
        severity: 'warning',
        message: `Activity "${act.code}" has a hard constraint (${constraintType})`,
        activityCode: act.code,
        activityId: act.sourceId,
      });
    }
  }

  // 15. EXCESSIVE_LAG
  for (const rel of relationships) {
    if (rel.lagDays > 20) {
      issues.push({
        code: 'EXCESSIVE_LAG',
        severity: 'warning',
        message: `Relationship from "${rel.predecessorCode}" to "${rel.successorCode}" has lag of ${rel.lagDays} working days (> 20)`,
        relatedCodes: [rel.predecessorCode, rel.successorCode],
      });
    }
  }

  // 16. LONG_DURATION
  for (const act of activities) {
    if (act.remainingDuration > 20) {
      issues.push({
        code: 'LONG_DURATION',
        severity: 'warning',
        message: `Activity "${act.code}" has remaining duration of ${act.remainingDuration} working days (> 20)`,
        activityCode: act.code,
        activityId: act.sourceId,
      });
    }
  }

  // 17. RESOURCE_OVER_ALLOCATION (skip if no assignments — checked via rawXerRow or external data)
  // This rule requires assignment data; skip if there are no assignments in the schedule
  // (The schedule canonical form doesn't include assignments directly; we leave as not-applicable
  // unless future stages add assignment data to CanonicalSchedule)

  // 18. LOW_LOGIC_DENSITY
  if (activities.length > 0) {
    const density = relationships.length / activities.length;
    if (density < 1.5) {
      issues.push({
        code: 'LOW_LOGIC_DENSITY',
        severity: 'warning',
        message: `Logic density is ${density.toFixed(2)} (${relationships.length} relationships / ${activities.length} activities) — below 1.5 threshold`,
      });
    }
  }

  // 19. ACTUAL_DATE_IN_FUTURE
  const dataDate = project.dataDate;
  if (dataDate) {
    for (const act of activities) {
      if (act.actualStart && act.actualStart > dataDate) {
        issues.push({
          code: 'ACTUAL_DATE_IN_FUTURE',
          severity: 'warning',
          message: `Activity "${act.code}" has actual_start (${act.actualStart.toISOString()}) after the data date (${dataDate.toISOString()})`,
          activityCode: act.code,
          activityId: act.sourceId,
        });
      }
      if (act.actualFinish && act.actualFinish > dataDate) {
        issues.push({
          code: 'ACTUAL_DATE_IN_FUTURE',
          severity: 'warning',
          message: `Activity "${act.code}" has actual_finish (${act.actualFinish.toISOString()}) after the data date (${dataDate.toISOString()})`,
          activityCode: act.code,
          activityId: act.sourceId,
        });
      }
    }
  }

  // 20. PERCENT_COMPLETE_INCONSISTENT
  for (const act of activities) {
    if (act.actualStart && act.percentComplete === 0) {
      issues.push({
        code: 'PERCENT_COMPLETE_INCONSISTENT',
        severity: 'warning',
        message: `Activity "${act.code}" has actual_start but percent_complete is 0`,
        activityCode: act.code,
        activityId: act.sourceId,
      });
    }
    if (act.actualFinish && act.percentComplete < 100) {
      issues.push({
        code: 'PERCENT_COMPLETE_INCONSISTENT',
        severity: 'warning',
        message: `Activity "${act.code}" has actual_finish but percent_complete is ${act.percentComplete} (< 100)`,
        activityCode: act.code,
        activityId: act.sourceId,
      });
    }
  }

  // ── INFO ──────────────────────────────────────────────────────────────────

  // 21. HIGH_CRITICAL_PATH_RATIO — >40% on critical path (totalFloat <= 0)
  if (activities.length > 0) {
    const criticalCount = activities.filter(a => a.totalFloat <= 0).length;
    const ratio = criticalCount / activities.length;
    if (ratio > 0.4) {
      issues.push({
        code: 'HIGH_CRITICAL_PATH_RATIO',
        severity: 'info',
        message: `${Math.round(ratio * 100)}% of activities are on the critical path (${criticalCount}/${activities.length}) — above 40% threshold`,
      });
    }
  }

  // 22. COMPLEX_RELATIONSHIPS — SS/FF/SF > 20% of total
  if (relationships.length > 0) {
    const complexCount = relationships.filter(r => ['SS', 'FF', 'SF'].includes(r.type)).length;
    const complexRatio = complexCount / relationships.length;
    if (complexRatio > 0.2) {
      issues.push({
        code: 'COMPLEX_RELATIONSHIPS',
        severity: 'info',
        message: `${Math.round(complexRatio * 100)}% of relationships are SS/FF/SF type (${complexCount}/${relationships.length}) — could be simplified`,
      });
    }
  }

  // 23. DEEP_WBS_HIERARCHY — WBS levels deeper than 6
  if (wbsNodes.length > 0) {
    // Calculate WBS levels via parent traversal
    const levelMap = new Map<string, number>();
    const parentMap = new Map<string, string | null>();
    for (const w of wbsNodes) {
      parentMap.set(w.sourceId, w.parentSourceId);
    }

    function getLevel(sourceId: string, visited = new Set<string>()): number {
      if (visited.has(sourceId)) return 0;
      visited.add(sourceId);
      const parent = parentMap.get(sourceId);
      if (!parent || !parentMap.has(parent)) return 1;
      return 1 + getLevel(parent, visited);
    }

    let maxLevel = 0;
    for (const w of wbsNodes) {
      const level = levelMap.get(w.sourceId) ?? getLevel(w.sourceId);
      levelMap.set(w.sourceId, level);
      if (level > maxLevel) maxLevel = level;
    }

    if (maxLevel > 6) {
      issues.push({
        code: 'DEEP_WBS_HIERARCHY',
        severity: 'info',
        message: `WBS hierarchy has ${maxLevel} levels — deeper than 6`,
      });
    }
  }

  // ── Build result ───────────────────────────────────────────────────────────

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  return {
    issues,
    canExport: errorCount === 0,
    errorCount,
    warningCount,
    infoCount,
  };
}

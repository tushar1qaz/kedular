import { CalendarEngine } from './calendar';

export interface CpmActivity {
  id: string;
  code: string;
  remainingDuration: number;   // working days
  calendarId: string;
  status: 'not_started' | 'in_progress' | 'complete';
  actualStart: Date | null;
  actualFinish: Date | null;
  constraintType: string | null;
  constraintDate: Date | null;
  type: 'task_dependent' | 'task_milestone' | 'LOE' | 'WBS_summary';
}

export interface CpmRelationship {
  predecessorId: string;
  successorId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}

export interface CpmInput {
  activities: CpmActivity[];
  relationships: CpmRelationship[];
  calendar: CalendarEngine;
  projectStart: Date;
  dataDate: Date;
}

export interface CpmActivityResult {
  id: string;
  earlyStart: Date;
  earlyFinish: Date;
  lateStart: Date;
  lateFinish: Date;
  totalFloat: number;     // working days
  freeFloat: number;
  isCritical: boolean;
}

export interface CpmResult {
  activities: Map<string, CpmActivityResult>;
  criticalPath: string[];    // activity ids in order
  projectFinish: Date;
  errors: CpmError[];
}

export interface CpmError {
  code: 'CIRCULAR_DEPENDENCY' | 'DISCONNECTED_NETWORK' | 'INVALID_DATES';
  message: string;
  activityIds?: string[];
}

/**
 * EF = last working day of an activity.
 * EF = addWorkingDays(ES, duration - 1) when duration > 0.
 * For milestones (duration=0), EF = ES.
 */
function computeEF(calendar: CalendarEngine, es: Date, duration: number, calId: string): Date {
  if (duration <= 0) return new Date(es);
  return calendar.addWorkingDays(es, duration - 1, calId);
}

/**
 * LS = first working day of an activity given LF.
 * LS = subtractWorkingDays(LF, duration - 1) when duration > 0.
 */
function computeLS(calendar: CalendarEngine, lf: Date, duration: number, calId: string): Date {
  if (duration <= 0) return new Date(lf);
  return calendar.subtractWorkingDays(lf, duration - 1, calId);
}

/**
 * For FS relationship forward: ES of successor = addWorkingDays(EF_pred, max(lag, 1)).
 * Lag=0 means "immediately after" (next working day). Lag=n means n working days after.
 */
function fsForwardES(calendar: CalendarEngine, efPred: Date, lag: number, calId: string): Date {
  return calendar.addWorkingDays(efPred, Math.max(lag, 1), calId);
}

/**
 * For FS relationship backward: LF of predecessor = subtractWorkingDays(LS_succ, max(lag, 1)).
 */
function fsBackwardLF(calendar: CalendarEngine, lsSucc: Date, lag: number, calId: string): Date {
  return calendar.subtractWorkingDays(lsSucc, Math.max(lag, 1), calId);
}

export function calculateCpm(input: CpmInput): CpmResult {
  const { activities, relationships, calendar, projectStart, dataDate } = input;
  const errors: CpmError[] = [];

  // --- 1. Topological sort (Kahn's algorithm) ---
  const activityMap = new Map<string, CpmActivity>();
  for (const act of activities) {
    activityMap.set(act.id, act);
  }

  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const act of activities) {
    successors.set(act.id, []);
    predecessors.set(act.id, []);
  }

  const validRels: CpmRelationship[] = [];
  for (const rel of relationships) {
    if (activityMap.has(rel.predecessorId) && activityMap.has(rel.successorId)) {
      successors.get(rel.predecessorId)!.push(rel.successorId);
      predecessors.get(rel.successorId)!.push(rel.predecessorId);
      validRels.push(rel);
    }
  }

  const inDegree = new Map<string, number>();
  for (const act of activities) {
    inDegree.set(act.id, 0);
  }
  for (const rel of validRels) {
    inDegree.set(rel.successorId, (inDegree.get(rel.successorId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const sortedOrder: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sortedOrder.push(current);
    for (const succId of successors.get(current) ?? []) {
      const newDeg = (inDegree.get(succId) ?? 0) - 1;
      inDegree.set(succId, newDeg);
      if (newDeg === 0) {
        queue.push(succId);
      }
    }
  }

  if (sortedOrder.length !== activities.length) {
    const inCycle: string[] = [];
    for (const act of activities) {
      if (!sortedOrder.includes(act.id)) {
        inCycle.push(act.id);
      }
    }
    errors.push({
      code: 'CIRCULAR_DEPENDENCY',
      message: `Circular dependency detected among ${inCycle.length} activities`,
      activityIds: inCycle,
    });
    return {
      activities: new Map(),
      criticalPath: [],
      projectFinish: projectStart,
      errors,
    };
  }

  // --- 2. Forward pass ---
  const earlyStart = new Map<string, Date>();
  const earlyFinish = new Map<string, Date>();

  for (const id of sortedOrder) {
    const act = activityMap.get(id)!;
    const calId = act.calendarId;
    const isMilestone = act.type === 'task_milestone' || act.remainingDuration === 0;

    if (act.status === 'complete' && act.actualStart && act.actualFinish) {
      earlyStart.set(id, new Date(act.actualStart));
      earlyFinish.set(id, new Date(act.actualFinish));
      continue;
    }

    if (act.status === 'in_progress' && act.actualStart) {
      const es = new Date(act.actualStart);
      const ef = isMilestone
        ? new Date(dataDate)
        : computeEF(calendar, dataDate, act.remainingDuration, calId);
      earlyStart.set(id, es);
      earlyFinish.set(id, ef);
      continue;
    }

    // not_started
    const preds = predecessors.get(id) ?? [];
    let es: Date;
    // FF/SF pin EF directly (ES = subtractWorkingDays(EF, duration), not duration-1)
    let pinnedEF: Date | null = null;

    if (preds.length === 0) {
      es = new Date(projectStart);
    } else {
      let best: { es: Date; ef: Date | null } | null = null;

      for (const predId of preds) {
        const rels = validRels.filter(r => r.predecessorId === predId && r.successorId === id);
        for (const rel of rels) {
          const predES = earlyStart.get(predId)!;
          const predEF = earlyFinish.get(predId)!;
          let candidateES: Date;
          let candidateEF: Date | null = null;

          if (rel.type === 'FS') {
            candidateES = fsForwardES(calendar, predEF, rel.lagDays, calId);
          } else if (rel.type === 'SS') {
            candidateES = rel.lagDays <= 0
              ? new Date(predES)
              : calendar.addWorkingDays(predES, rel.lagDays, calId);
          } else if (rel.type === 'FF') {
            // EF_B = EF_A + lag; ES_B = EF_B - duration (full duration, exclusive end model)
            const ef = rel.lagDays <= 0
              ? new Date(predEF)
              : calendar.addWorkingDays(predEF, rel.lagDays, calId);
            candidateES = calendar.subtractWorkingDays(ef, act.remainingDuration, calId);
            candidateEF = ef;
          } else if (rel.type === 'SF') {
            const ef = rel.lagDays <= 0
              ? new Date(predES)
              : calendar.addWorkingDays(predES, rel.lagDays, calId);
            candidateES = calendar.subtractWorkingDays(ef, act.remainingDuration, calId);
            candidateEF = ef;
          } else {
            candidateES = fsForwardES(calendar, predEF, rel.lagDays, calId);
          }

          if (best === null || candidateES.getTime() > best.es.getTime()) {
            best = { es: candidateES, ef: candidateEF };
          }
        }
      }

      es = best?.es ?? new Date(projectStart);
      pinnedEF = best?.ef ?? null;
    }

    // Apply constraints
    if (act.constraintType && act.constraintDate) {
      const cd = act.constraintDate;
      switch (act.constraintType) {
        case 'CSTR_MSO':
          es = new Date(cd);
          break;
        case 'CSTR_MFO': {
          const ef = new Date(cd);
          earlyFinish.set(id, ef);
          earlyStart.set(id, computeLS(calendar, ef, act.remainingDuration, calId));
          continue;
        }
        case 'CSTR_SNLT':
          if (es.getTime() > cd.getTime()) es = new Date(cd);
          break;
        case 'CSTR_SNET':
          if (es.getTime() < cd.getTime()) es = new Date(cd);
          break;
        case 'CSTR_FNLT': {
          const rawEF = computeEF(calendar, es, act.remainingDuration, calId);
          const ef = rawEF.getTime() > cd.getTime() ? new Date(cd) : rawEF;
          earlyStart.set(id, es);
          earlyFinish.set(id, ef);
          continue;
        }
        case 'CSTR_FNET': {
          const rawEF = computeEF(calendar, es, act.remainingDuration, calId);
          const ef = rawEF.getTime() < cd.getTime() ? new Date(cd) : rawEF;
          earlyStart.set(id, es);
          earlyFinish.set(id, ef);
          continue;
        }
      }
    }

    earlyStart.set(id, es);
    // FF/SF pin EF; all others compute from ES using inclusive model (duration-1)
    earlyFinish.set(id, pinnedEF ?? computeEF(calendar, es, act.remainingDuration, calId));
  }

  // --- 3. Backward pass ---
  let projectFinish = new Date(projectStart);
  for (const id of sortedOrder) {
    const ef = earlyFinish.get(id)!;
    if (ef.getTime() > projectFinish.getTime()) {
      projectFinish = new Date(ef);
    }
  }

  const lateStart = new Map<string, Date>();
  const lateFinish = new Map<string, Date>();

  for (const id of [...sortedOrder].reverse()) {
    const act = activityMap.get(id)!;
    const calId = act.calendarId;
    const succs = successors.get(id) ?? [];

    let lf: Date;
    if (succs.length === 0) {
      lf = new Date(projectFinish);
    } else {
      let minDate: Date | null = null;

      for (const succId of succs) {
        const rels = validRels.filter(r => r.predecessorId === id && r.successorId === succId);
        for (const rel of rels) {
          const succLS = lateStart.get(succId)!;
          const succLF = lateFinish.get(succId)!;
          let candidate: Date;

          if (rel.type === 'FS') {
            // LF(pred) = LS(succ) - max(lag, 1)
            candidate = fsBackwardLF(calendar, succLS, rel.lagDays, calId);
          } else if (rel.type === 'SS') {
            // LS_B = LS_A + lag → LS_A = LS_B - lag
            // LF_A = LS_A + (duration - 1)
            const predLS = rel.lagDays <= 0
              ? new Date(succLS)
              : calendar.subtractWorkingDays(succLS, rel.lagDays, calId);
            candidate = computeEF(calendar, predLS, act.remainingDuration, calId);
          } else if (rel.type === 'FF') {
            // LF_B = LF_A + lag → LF_A = LF_B - lag
            candidate = rel.lagDays <= 0
              ? new Date(succLF)
              : calendar.subtractWorkingDays(succLF, rel.lagDays, calId);
          } else if (rel.type === 'SF') {
            // EF_B = ES_A + lag → ES_A = EF_B - lag
            // LF_A = ES_A + (duration - 1)
            const predES = rel.lagDays <= 0
              ? new Date(succLF)
              : calendar.subtractWorkingDays(succLF, rel.lagDays, calId);
            candidate = computeEF(calendar, predES, act.remainingDuration, calId);
          } else {
            candidate = fsBackwardLF(calendar, succLS, rel.lagDays, calId);
          }

          if (minDate === null || candidate.getTime() < minDate.getTime()) {
            minDate = candidate;
          }
        }
      }

      lf = minDate ?? new Date(projectFinish);
    }

    lateFinish.set(id, lf);
    lateStart.set(id, computeLS(calendar, lf, act.remainingDuration, calId));
  }

  // --- 4. Float and critical path ---
  const results = new Map<string, CpmActivityResult>();

  for (const id of sortedOrder) {
    const act = activityMap.get(id)!;
    const calId = act.calendarId;
    const es = earlyStart.get(id)!;
    const ef = earlyFinish.get(id)!;
    const ls = lateStart.get(id)!;
    const lf = lateFinish.get(id)!;

    // totalFloat = working days between ES and LS (exclusive ES, inclusive LS)
    const totalFloat = calendar.getWorkingDaysBetween(es, ls, calId);

    // Free float: min adjusted ES of successors relative to EF
    const succs = successors.get(id) ?? [];
    let freeFloat: number;

    if (succs.length === 0) {
      freeFloat = calendar.getWorkingDaysBetween(ef, lf, calId);
    } else {
      let minFloat: number | null = null;

      for (const succId of succs) {
        const rels = validRels.filter(r => r.predecessorId === id && r.successorId === succId);
        for (const rel of rels) {
          const succES = earlyStart.get(succId)!;
          const succEF = earlyFinish.get(succId)!;
          let requiredEF: Date;

          // What EF value would be required by this relationship given successor's actual ES?
          if (rel.type === 'FS') {
            // succES = fsForwardES(ef, lag) → ef that achieves this = subtractWorkingDays(succES, max(lag,1))
            requiredEF = fsBackwardLF(calendar, succES, rel.lagDays, calId);
          } else if (rel.type === 'SS') {
            // succES >= ES + lag, so gap = succES - lag - ef
            const requiredES = rel.lagDays <= 0
              ? new Date(succES)
              : calendar.subtractWorkingDays(succES, rel.lagDays, calId);
            requiredEF = computeEF(calendar, requiredES, act.remainingDuration, calId);
          } else if (rel.type === 'FF') {
            requiredEF = rel.lagDays <= 0
              ? new Date(succEF)
              : calendar.subtractWorkingDays(succEF, rel.lagDays, calId);
          } else if (rel.type === 'SF') {
            const requiredES = rel.lagDays <= 0
              ? new Date(succEF)
              : calendar.subtractWorkingDays(succEF, rel.lagDays, calId);
            requiredEF = computeEF(calendar, requiredES, act.remainingDuration, calId);
          } else {
            requiredEF = fsBackwardLF(calendar, succES, rel.lagDays, calId);
          }

          // freeFloat contribution = getWorkingDaysBetween(ef, requiredEF)
          const ff = calendar.getWorkingDaysBetween(ef, requiredEF, calId);
          if (minFloat === null || ff < minFloat) {
            minFloat = ff;
          }
        }
      }

      freeFloat = minFloat ?? 0;
    }

    results.set(id, {
      id,
      earlyStart: es,
      earlyFinish: ef,
      lateStart: ls,
      lateFinish: lf,
      totalFloat,
      freeFloat,
      isCritical: totalFloat <= 0,
    });
  }

  // Build critical path in topological order
  const criticalPath = sortedOrder.filter(id => {
    const r = results.get(id);
    return r && r.isCritical;
  });

  return {
    activities: results,
    criticalPath,
    projectFinish,
    errors,
  };
}

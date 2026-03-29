import { CanonicalSchedule, CanonicalActivity } from '../parsers/normaliser';

export interface LookAheadOptions {
  weeksAhead: number;   // 1, 2, 3, 4, or 6
  dataDate: Date;
  wbsFilter?: string;   // WBS code prefix filter
  resourceFilter?: string;
}

export interface LookAheadActivity {
  code: string;
  name: string;
  wbsCode: string;
  plannedStart: Date | null;
  plannedFinish: Date | null;
  status: string;
  percentComplete: number;
  remainingDuration: number;
  isCritical: boolean;
  totalFloat: number;
  resourceNames: string[];
  windowStatus: 'starting' | 'in_progress' | 'finishing' | 'overdue';
}

export function getLookAhead(
  schedule: CanonicalSchedule,
  cpmResults: Map<string, { isCritical: boolean; totalFloat: number; earlyStart: Date; earlyFinish: Date }>,
  options: LookAheadOptions
): LookAheadActivity[] {
  const { weeksAhead, dataDate, wbsFilter } = options;
  const windowEnd = new Date(dataDate.getTime() + weeksAhead * 7 * 24 * 60 * 60 * 1000);

  const result: LookAheadActivity[] = [];

  for (const act of schedule.activities) {
    // Skip LOE and WBS summary
    if (act.type === 'LOE' || act.type === 'WBS_summary') continue;

    // WBS filter
    if (wbsFilter && act.wbsCode && !act.wbsCode.startsWith(wbsFilter)) continue;

    const cpm = cpmResults.get(act.code);
    const earlyStart = cpm ? cpm.earlyStart : (act.plannedStart ?? null);
    const earlyFinish = cpm ? cpm.earlyFinish : (act.plannedFinish ?? null);
    const isCritical = cpm ? cpm.isCritical : act.totalFloat <= 0;
    const totalFloat = cpm ? cpm.totalFloat : act.totalFloat;

    const isComplete = act.status === 'complete' || act.percentComplete >= 100;
    if (isComplete) continue;

    const isInProgress = act.status === 'in_progress' || (act.percentComplete > 0 && act.percentComplete < 100);

    // Check if overdue: supposed to start before dataDate but not complete
    const isOverdue =
      !isComplete &&
      earlyStart !== null &&
      earlyStart < dataDate &&
      !isInProgress;

    // Check if starting within window
    const isStartingInWindow =
      earlyStart !== null &&
      earlyStart >= dataDate &&
      earlyStart <= windowEnd;

    // Check if finishing within window
    const isFinishingInWindow =
      earlyFinish !== null &&
      earlyFinish >= dataDate &&
      earlyFinish <= windowEnd;

    let windowStatus: LookAheadActivity['windowStatus'] | null = null;

    if (isOverdue) {
      windowStatus = 'overdue';
    } else if (isInProgress) {
      windowStatus = 'in_progress';
    } else if (isStartingInWindow) {
      windowStatus = 'starting';
    } else if (isFinishingInWindow) {
      windowStatus = 'finishing';
    }

    if (windowStatus === null) continue;

    result.push({
      code: act.code,
      name: act.name,
      wbsCode: act.wbsCode ?? '',
      plannedStart: act.plannedStart,
      plannedFinish: act.plannedFinish,
      status: act.status,
      percentComplete: act.percentComplete,
      remainingDuration: act.remainingDuration,
      isCritical,
      totalFloat,
      resourceNames: [],
      windowStatus,
    });
  }

  // Sort: overdue first, then by earlyStart
  result.sort((a, b) => {
    if (a.windowStatus === 'overdue' && b.windowStatus !== 'overdue') return -1;
    if (a.windowStatus !== 'overdue' && b.windowStatus === 'overdue') return 1;
    const aStart = a.plannedStart?.getTime() ?? 0;
    const bStart = b.plannedStart?.getTime() ?? 0;
    return aStart - bStart;
  });

  return result;
}

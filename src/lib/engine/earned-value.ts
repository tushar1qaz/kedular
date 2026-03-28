import { CanonicalSchedule } from '../parsers/normaliser';

export interface EarnedValueResult {
  bcws: number;   // Budgeted Cost of Work Scheduled (Planned Value)
  bcwp: number;   // Budgeted Cost of Work Performed (Earned Value)
  acwp: number;   // Actual Cost of Work Performed
  spi: number;    // BCWP / BCWS (guard against division by zero → 1.0)
  cpi: number;    // BCWP / ACWP (guard → 1.0)
  sv: number;     // Schedule Variance = BCWP - BCWS
  cv: number;     // Cost Variance = BCWP - ACWP
  bac: number;    // Budget at Completion
  eac: number;    // Estimate at Completion = BAC / CPI
  etc: number;    // Estimate to Complete = EAC - ACWP
  vac: number;    // Variance at Completion = BAC - EAC
  tcpi: number;   // To-Complete Performance Index = (BAC - BCWP) / (BAC - ACWP)
  dataDate: Date | null;
}

const DEFAULT_RATE = 1; // unit rate when no resource cost data

export function calculateEarnedValue(schedule: CanonicalSchedule): EarnedValueResult {
  const dataDate = schedule.project.dataDate;
  const activities = schedule.activities;

  // BAC = total planned work (planned duration × rate)
  let bac = 0;
  let bcws = 0;
  let bcwp = 0;

  for (const act of activities) {
    // Skip LOE and WBS summary
    if (act.type === 'LOE' || act.type === 'WBS_summary') continue;

    const plannedDuration =
      act.remainingDuration > 0
        ? act.remainingDuration / Math.max(1 - act.percentComplete / 100, 0.0001)
        : 0;

    const budget = plannedDuration * DEFAULT_RATE;
    bac += budget;

    // BCWS: budget for activities planned through data date
    if (dataDate) {
      const finish = act.plannedFinish ?? act.actualFinish;
      const start = act.plannedStart ?? act.actualStart;
      if (start && start <= dataDate) {
        if (finish && finish <= dataDate) {
          // Fully within window — all budget is planned
          bcws += budget;
        } else {
          // Activity spans the data date — prorate
          if (start && finish && finish > start) {
            const totalMs = finish.getTime() - start.getTime();
            const elapsedMs = Math.min(
              dataDate.getTime() - start.getTime(),
              totalMs
            );
            bcws += budget * Math.max(0, Math.min(1, elapsedMs / totalMs));
          } else {
            // No finish or zero-span — treat as fully planned
            bcws += budget;
          }
        }
      }
    } else {
      bcws += budget;
    }

    // BCWP: budget × percent complete
    bcwp += budget * (act.percentComplete / 100);
  }

  // ACWP = BCWP when no real cost data (acknowledged limitation)
  const acwp = bcwp;

  const spi = bcws === 0 ? 1.0 : bcwp / bcws;
  const cpi = acwp === 0 ? 1.0 : bcwp / acwp;
  const sv = bcwp - bcws;
  const cv = bcwp - acwp;
  const eac = cpi === 0 ? bac : bac / cpi;
  const etc = eac - acwp;
  const vac = bac - eac;

  const tcpiDenominator = bac - acwp;
  const tcpi = tcpiDenominator === 0 ? 1.0 : (bac - bcwp) / tcpiDenominator;

  return {
    bcws,
    bcwp,
    acwp,
    spi,
    cpi,
    sv,
    cv,
    bac,
    eac,
    etc,
    vac,
    tcpi,
    dataDate,
  };
}

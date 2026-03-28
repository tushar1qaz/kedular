import { CanonicalSchedule, CanonicalActivity } from '../parsers/normaliser';

export interface CsvWriterOptions {
  dateFormat?: string;       // default 'yyyy-MM-dd'
  includeHeaders?: boolean;  // default true
}

// Columns in order per spec:
// ID, WBS, Name, Duration, Start, Finish, Predecessors, % Complete, Resource Names, Outline Level, Milestone

const HEADERS = [
  'ID',
  'WBS',
  'Name',
  'Duration',
  'Start',
  'Finish',
  'Predecessors',
  '% Complete',
  'Resource Names',
  'Outline Level',
  'Milestone',
];

function formatDate(date: Date | null): string {
  if (!date) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function escapeCsvCell(value: string): string {
  // If the value contains commas, double-quotes, or newlines, wrap in double quotes
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Derive WBS outline level from wbsCode by counting dots + 1.
 * If no wbsCode, return 1.
 */
function getOutlineLevel(wbsCode: string | null): number {
  if (!wbsCode) return 1;
  return (wbsCode.match(/\./g) ?? []).length + 1;
}

/**
 * Build predecessor string for an activity.
 * Uses 1-based row position of predecessors, not activity codes.
 * Format: "1FS,2SS+2 days" etc.
 */
function buildPredecessors(
  actCode: string,
  relationships: CanonicalSchedule['relationships'],
  activityIndexMap: Map<string, number>
): string {
  const preds = relationships.filter(r => r.successorCode === actCode);
  if (preds.length === 0) return '';

  return preds
    .map(rel => {
      const predRowNum = activityIndexMap.get(rel.predecessorCode);
      if (predRowNum === undefined) return null;

      let part = String(predRowNum);

      // Append relationship type if not default FS
      if (rel.type === 'FS') {
        // FS is default — include type always per spec example "3FS+2 days"
        part += rel.type;
      } else {
        part += rel.type;
      }

      // Append lag if non-zero
      if (rel.lagDays !== 0) {
        const lagSign = rel.lagDays > 0 ? '+' : '';
        part += `${lagSign}${rel.lagDays} days`;
      }

      return part;
    })
    .filter((p): p is string => p !== null)
    .join(',');
}

/**
 * Returns a CSV string representing the schedule.
 */
export function writeScheduleCsv(
  schedule: CanonicalSchedule,
  options?: CsvWriterOptions
): string {
  const includeHeaders = options?.includeHeaders !== false;
  // dateFormat option is kept for future extension; we use ISO by default

  const { activities, relationships } = schedule;

  // Build 1-based activity index map (position in output array)
  const activityIndexMap = new Map<string, number>();
  activities.forEach((act, idx) => {
    activityIndexMap.set(act.code, idx + 1);
  });

  const rows: string[][] = [];

  for (const act of activities) {
    const duration = `${Math.round(act.remainingDuration)} days`;
    const start = formatDate(act.plannedStart);
    const finish = formatDate(act.plannedFinish);
    const predecessors = buildPredecessors(act.code, relationships, activityIndexMap);
    const outlineLevel = getOutlineLevel(act.wbsCode);
    const milestone = act.type === 'task_milestone' ? 'Yes' : 'No';

    rows.push([
      act.code,
      act.wbsCode ?? '',
      act.name,
      duration,
      start,
      finish,
      predecessors,
      String(act.percentComplete),
      '', // Resource Names — not in CanonicalActivity in Stage 4
      String(outlineLevel),
      milestone,
    ]);
  }

  const csvLines: string[] = [];

  if (includeHeaders) {
    csvLines.push(HEADERS.map(escapeCsvCell).join(','));
  }

  for (const row of rows) {
    csvLines.push(row.map(escapeCsvCell).join(','));
  }

  return csvLines.join('\n') + (csvLines.length > 0 ? '\n' : '');
}

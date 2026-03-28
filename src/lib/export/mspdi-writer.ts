import { CanonicalSchedule } from '../parsers/normaliser';

// Relationship type mapping: canonical → MSPDI Type code
// 0=FF, 1=FS, 2=SF, 3=SS
const MSPDI_REL_TYPE: Record<string, number> = {
  FF: 0,
  FS: 1,
  SF: 2,
  SS: 3,
};

function formatMspdiDate(date: Date | null): string {
  if (!date) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
}

/**
 * Format duration in ISO 8601 duration format: PT{hours}H{minutes}M{seconds}S
 * hours = remainingDuration * 8 (hours per day)
 */
function formatDuration(remainingDurationDays: number, hoursPerDay = 8): string {
  const totalHours = remainingDurationDays * hoursPerDay;
  const hours = Math.floor(totalHours);
  const minutesFrac = (totalHours - hours) * 60;
  const minutes = Math.floor(minutesFrac);
  const seconds = Math.floor((minutesFrac - minutes) * 60);
  return `PT${hours}H${minutes}M${seconds}S`;
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function indent(level: number): string {
  return '  '.repeat(level);
}

/**
 * Generate valid MSPDI XML per Microsoft's schema.
 */
export function writeScheduleMspdi(schedule: CanonicalSchedule): string {
  const { project, activities, relationships } = schedule;

  // Build 1-based UID map for activities (1-indexed)
  const uidMap = new Map<string, number>();
  activities.forEach((act, idx) => {
    uidMap.set(act.code, idx + 1);
  });

  // Determine project start/finish from activities
  let projectStart: Date | null = project.dataDate;
  let projectFinish: Date | null = null;

  for (const act of activities) {
    if (act.plannedStart) {
      if (!projectStart || act.plannedStart < projectStart) {
        projectStart = act.plannedStart;
      }
    }
    if (act.plannedFinish) {
      if (!projectFinish || act.plannedFinish > projectFinish) {
        projectFinish = act.plannedFinish;
      }
    }
  }

  const startDateStr = projectStart ? formatMspdiDate(projectStart) : '';
  const finishDateStr = projectFinish ? formatMspdiDate(projectFinish) : '';

  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<Project xmlns="http://schemas.microsoft.com/project">');
  lines.push(`${indent(1)}<Name>${xmlEscape(project.name)}</Name>`);
  if (startDateStr) {
    lines.push(`${indent(1)}<StartDate>${startDateStr}</StartDate>`);
  }
  if (finishDateStr) {
    lines.push(`${indent(1)}<FinishDate>${finishDateStr}</FinishDate>`);
  }
  lines.push(`${indent(1)}<CalendarUID>1</CalendarUID>`);

  // Calendars section
  lines.push(`${indent(1)}<Calendars>`);
  lines.push(`${indent(2)}<Calendar>`);
  lines.push(`${indent(3)}<UID>1</UID>`);
  lines.push(`${indent(3)}<Name>Standard</Name>`);
  lines.push(`${indent(3)}<IsBaseCalendar>1</IsBaseCalendar>`);
  lines.push(`${indent(2)}</Calendar>`);
  lines.push(`${indent(1)}</Calendars>`);

  // Tasks section
  lines.push(`${indent(1)}<Tasks>`);

  for (const act of activities) {
    const uid = uidMap.get(act.code) ?? 0;
    const durationStr = formatDuration(act.remainingDuration);
    const startStr = formatMspdiDate(act.plannedStart);
    const finishStr = formatMspdiDate(act.plannedFinish);
    const percentComplete = Math.round(act.percentComplete);
    const isMilestone = act.type === 'task_milestone' ? 1 : 0;

    // Predecessors for this activity
    const preds = relationships.filter(r => r.successorCode === act.code);

    lines.push(`${indent(2)}<Task>`);
    lines.push(`${indent(3)}<UID>${uid}</UID>`);
    lines.push(`${indent(3)}<ID>${uid}</ID>`);
    lines.push(`${indent(3)}<Name>${xmlEscape(act.name)}</Name>`);
    lines.push(`${indent(3)}<Duration>${durationStr}</Duration>`);
    if (startStr) {
      lines.push(`${indent(3)}<Start>${startStr}</Start>`);
    }
    if (finishStr) {
      lines.push(`${indent(3)}<Finish>${finishStr}</Finish>`);
    }
    lines.push(`${indent(3)}<PercentComplete>${percentComplete}</PercentComplete>`);
    lines.push(`${indent(3)}<Milestone>${isMilestone}</Milestone>`);

    for (const rel of preds) {
      const predUid = uidMap.get(rel.predecessorCode) ?? 0;
      const relType = MSPDI_REL_TYPE[rel.type] ?? 1;
      // Lag in minutes (MSPDI uses tenths of a minute by convention, but hours*600 is common)
      // Standard MSPDI lag is in tenths of minutes; 0 lag = 0
      const lagMinutes = Math.round(rel.lagDays * 8 * 60 * 10); // tenths of minutes

      lines.push(`${indent(3)}<PredecessorLink>`);
      lines.push(`${indent(4)}<PredecessorUID>${predUid}</PredecessorUID>`);
      lines.push(`${indent(4)}<Type>${relType}</Type>`);
      lines.push(`${indent(4)}<LinkLag>${lagMinutes}</LinkLag>`);
      lines.push(`${indent(3)}</PredecessorLink>`);
    }

    lines.push(`${indent(2)}</Task>`);
  }

  lines.push(`${indent(1)}</Tasks>`);
  lines.push('</Project>');

  return lines.join('\n') + '\n';
}

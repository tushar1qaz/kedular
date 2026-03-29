import { CanonicalSchedule } from '../parsers/normaliser';
import { CpmResult } from '../engine/cpm';
import { ScheduleParseHealth } from '@/types/schedule';

function fmtDate(d: Date | null | undefined): string {
  if (!d) return 'N/A';
  return d.toISOString().split('T')[0];
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-AU');
}

export function buildSystemPrompt(
  schedule: CanonicalSchedule,
  cpmResult: CpmResult,
  projectName: string,
  parseHealth: ScheduleParseHealth
): string {
  const totalActs = schedule.activities.filter(
    (a) => a.type !== 'LOE' && a.type !== 'WBS_summary'
  );
  const complete = totalActs.filter((a) => a.status === 'complete').length;
  const inProgress = totalActs.filter((a) => a.status === 'in_progress').length;
  const notStarted = totalActs.filter((a) => a.status === 'not_started').length;

  return `You are an expert construction and project schedule analyst assistant for the Kedular platform.

You are analyzing the schedule for project: **${projectName}**

SCHEDULE OVERVIEW:
- Total activities: ${fmtNum(totalActs.length)} (${complete} complete, ${inProgress} in-progress, ${notStarted} not started)
- Total relationships: ${fmtNum(schedule.relationships.length)}
- Data date: ${fmtDate(schedule.project.dataDate)}
- Critical path activities: ${cpmResult.criticalPath.length}
- Project finish (CPM): ${fmtDate(cpmResult.projectFinish)}
- Parse confidence: ${parseHealth.confidence.toUpperCase()}

YOUR ROLE:
- Provide clear, professional analysis of schedule health, risks, and opportunities
- Answer questions about specific activities, dates, float, and critical path
- Identify risks, delays, and improvement opportunities
- Use construction industry terminology appropriately
- Be concise but thorough — respond in markdown format
- If asked about specific activities, always reference actual data from the context
- Never fabricate activity codes, dates, or metrics

IMPORTANT: Always base your analysis on the actual schedule data provided. If data is unavailable, say so clearly.`;
}

export function buildScheduleContext(
  schedule: CanonicalSchedule,
  cpmResult: CpmResult
): string {
  const totalActs = schedule.activities.filter(
    (a) => a.type !== 'LOE' && a.type !== 'WBS_summary'
  );
  const complete = totalActs.filter((a) => a.status === 'complete').length;
  const inProgress = totalActs.filter((a) => a.status === 'in_progress').length;
  const notStarted = totalActs.filter((a) => a.status === 'not_started').length;

  // Get top 10 critical path activities
  const top10CpActivities = cpmResult.criticalPath.slice(0, 10);
  const cpLines = top10CpActivities
    .map((id) => {
      const act = schedule.activities.find((a) => a.code === id);
      const cpm = cpmResult.activities.get(id);
      if (!act || !cpm) return null;
      return `${act.code} | ${act.name} | Start: ${fmtDate(cpm.earlyStart)} | Finish: ${fmtDate(cpm.earlyFinish)}`;
    })
    .filter(Boolean)
    .join('\n');

  // Try to compute SPI/CPI if we have data
  let spiCpi = 'N/A';
  try {
    const { calculateEarnedValue } = require('../engine/earned-value');
    const ev = calculateEarnedValue(schedule);
    spiCpi = `SPI: ${ev.spi.toFixed(2)} | CPI: ${ev.cpi.toFixed(2)}`;
  } catch {
    // Not critical
  }

  let healthInfo = 'N/A';
  try {
    const { scoreScheduleHealth } = require('../engine/health-scorer');
    const report = scoreScheduleHealth(schedule);
    healthInfo = `${report.overallScore}/100 (${report.grade})`;
  } catch {
    // Not critical
  }

  const lines: string[] = [
    'PROJECT CONTEXT:',
    `- Name: ${schedule.project.name || 'Unnamed Project'}`,
    `- Data Date: ${fmtDate(schedule.project.dataDate)}`,
    `- Activities: ${fmtNum(totalActs.length)} (${complete} complete, ${inProgress} in-progress, ${notStarted} not started)`,
    `- Relationships: ${fmtNum(schedule.relationships.length)}`,
    `- Project Finish: ${fmtDate(cpmResult.projectFinish)} (CPM)`,
    `- Critical Path: ${cpmResult.criticalPath.length} activities`,
    `- ${spiCpi}`,
    `- Health Score: ${healthInfo}`,
    '',
  ];

  if (cpLines) {
    lines.push('CRITICAL PATH (top 10):');
    lines.push(cpLines);
    lines.push('');
  }

  return lines.join('\n');
}

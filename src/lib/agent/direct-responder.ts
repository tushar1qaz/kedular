import { AgentContext } from './tool-executor';
import { DirectQueryHandler } from './query-classifier';
import { scoreScheduleHealth } from '../engine/health-scorer';
import { calculateEarnedValue } from '../engine/earned-value';
import { getLookAhead } from '../engine/lookahead';

export interface DirectResponse {
  text: string;
  data?: unknown;
  dataType?:
    | 'critical_path_table'
    | 'health_report'
    | 'look_ahead_table'
    | 'float_histogram'
    | 'ev_metrics'
    | 'version_list'
    | 'activity_table';
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return 'N/A';
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtNum(n: number, decimals = 0): string {
  return n.toLocaleString('en-AU', { maximumFractionDigits: decimals });
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export async function handleDirectQuery(
  handler: DirectQueryHandler,
  params: Record<string, unknown>,
  context: AgentContext
): Promise<DirectResponse> {
  const { schedule, cpmResult, versions } = context;

  switch (handler) {
    case 'critical_path': {
      const criticalIds = cpmResult.criticalPath;
      const projectFinish = cpmResult.projectFinish;
      const count = criticalIds.length;

      // Calculate working days on critical path
      const cpActivities = criticalIds
        .map((id) => {
          const act = schedule.activities.find((a) => a.code === id);
          const cpm = cpmResult.activities.get(id);
          return act && cpm ? { act, cpm } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      let totalDays = 0;
      for (const { act } of cpActivities) {
        totalDays += act.remainingDuration;
      }

      const top10 = cpActivities.slice(0, 10);
      const tableRows = top10
        .map(
          ({ act, cpm }, i) =>
            `| ${i + 1} | ${act.code} | ${act.name} | ${fmtDate(cpm.earlyFinish)} | ${fmtNum(cpm.totalFloat)} |`
        )
        .join('\n');

      const text =
        `**Critical path:** ${fmtNum(count)} activities, ${fmtNum(totalDays)} working days. ` +
        `Project finish: **${fmtDate(projectFinish)}**.\n\n` +
        `| # | Code | Name | EF | Float |\n` +
        `|---|------|------|----|-------|\n` +
        tableRows +
        (count > 10 ? `\n\n_...and ${count - 10} more activities_` : '');

      const data = {
        count,
        totalDays,
        projectFinish: projectFinish?.toISOString(),
        activities: cpActivities.map(({ act, cpm }) => ({
          code: act.code,
          name: act.name,
          earlyStart: cpm.earlyStart.toISOString(),
          earlyFinish: cpm.earlyFinish.toISOString(),
          totalFloat: cpm.totalFloat,
        })),
      };

      return { text, data, dataType: 'critical_path_table' };
    }

    case 'schedule_health': {
      const report = scoreScheduleHealth(schedule);
      const grade = report.grade;
      const score = report.overallScore;

      const lines: string[] = [];
      lines.push(`**Schedule Health: ${grade} (${fmtNum(score)}/100)**\n`);

      for (const m of report.metrics) {
        const icon = m.score >= 80 ? '✅' : m.score >= 50 ? '⚠️' : '❌';
        lines.push(`${icon} ${m.name}: ${m.value} (target ${m.target})`);
      }

      if (report.recommendations.length > 0) {
        lines.push('\n**Recommendations:**');
        for (const rec of report.recommendations.slice(0, 5)) {
          lines.push(`- ${rec}`);
        }
      }

      const text = lines.join('\n');

      return { text, data: report, dataType: 'health_report' };
    }

    case 'look_ahead': {
      const weeks = typeof params.weeks === 'number' ? params.weeks : 2;
      const dataDate = schedule.project.dataDate ?? new Date();
      const cpmMap = new Map(
        Array.from(cpmResult.activities.entries()).map(([id, v]) => [
          id,
          {
            isCritical: v.isCritical,
            totalFloat: v.totalFloat,
            earlyStart: v.earlyStart,
            earlyFinish: v.earlyFinish,
          },
        ])
      );

      const activities = getLookAhead(schedule, cpmMap, {
        weeksAhead: weeks,
        dataDate,
      });

      const lines: string[] = [];
      lines.push(
        `**${weeks}-week look-ahead** (from ${fmtDate(dataDate)}): ${activities.length} activities\n`
      );

      if (activities.length === 0) {
        lines.push('_No activities scheduled in this window._');
      } else {
        lines.push(
          `| Code | Name | Start | Finish | Status | Float |\n` +
            `|------|------|-------|--------|--------|-------|`
        );
        for (const a of activities.slice(0, 20)) {
          lines.push(
            `| ${a.code} | ${a.name.slice(0, 30)} | ${fmtDate(a.plannedStart)} | ${fmtDate(a.plannedFinish)} | ${a.windowStatus} | ${fmtNum(a.totalFloat)} |`
          );
        }
        if (activities.length > 20) {
          lines.push(`\n_...and ${activities.length - 20} more activities_`);
        }
      }

      return {
        text: lines.join('\n'),
        data: { weeks, activities },
        dataType: 'look_ahead_table',
      };
    }

    case 'float_distribution': {
      const buckets: { label: string; count: number }[] = [
        { label: '0 (Critical)', count: 0 },
        { label: '1-5 days', count: 0 },
        { label: '6-10 days', count: 0 },
        { label: '11-20 days', count: 0 },
        { label: '21-40 days', count: 0 },
        { label: '41-80 days', count: 0 },
        { label: '>80 days', count: 0 },
      ];

      let total = 0;
      for (const act of schedule.activities) {
        if (act.type === 'LOE' || act.type === 'WBS_summary') continue;
        const cpm = cpmResult.activities.get(act.code);
        const f = cpm ? cpm.totalFloat : act.totalFloat;
        total++;
        if (f <= 0) buckets[0].count++;
        else if (f <= 5) buckets[1].count++;
        else if (f <= 10) buckets[2].count++;
        else if (f <= 20) buckets[3].count++;
        else if (f <= 40) buckets[4].count++;
        else if (f <= 80) buckets[5].count++;
        else buckets[6].count++;
      }

      const lines: string[] = [];
      lines.push(`**Float distribution** (${fmtNum(total)} activities)\n`);
      lines.push('| Float Range | Count | % |');
      lines.push('|-------------|-------|---|');
      for (const b of buckets) {
        const pct = total > 0 ? ((b.count / total) * 100).toFixed(1) : '0';
        lines.push(`| ${b.label} | ${b.count} | ${pct}% |`);
      }

      const criticalPct =
        total > 0 ? ((buckets[0].count / total) * 100).toFixed(1) : '0';
      lines.push(
        `\n**${criticalPct}%** of activities are on or near the critical path (0 float).`
      );

      return {
        text: lines.join('\n'),
        data: { buckets, total },
        dataType: 'float_histogram',
      };
    }

    case 'earned_value': {
      const ev = calculateEarnedValue(schedule);

      const spiStatus = ev.spi >= 1 ? 'on/ahead of schedule' : 'behind schedule';
      const cpiStatus = ev.cpi >= 1 ? 'under budget' : 'over budget';

      const text =
        `**SPI: ${ev.spi.toFixed(2)}** (${spiStatus}) | **CPI: ${ev.cpi.toFixed(2)}** (${cpiStatus})\n\n` +
        `BCWS: ${fmtMoney(ev.bcws)} | BCWP: ${fmtMoney(ev.bcwp)} | ACWP: ${fmtMoney(ev.acwp)}\n` +
        `EAC: ${fmtMoney(ev.eac)} | ETC: ${fmtMoney(ev.etc)}`;

      return { text, data: ev, dataType: 'ev_metrics' };
    }

    case 'list_versions': {
      if (!versions || versions.length === 0) {
        return { text: '_No versions found for this project._', dataType: 'version_list' };
      }

      const lines: string[] = [];
      lines.push(`**${versions.length} schedule version(s)**\n`);
      lines.push('| # | Label | Data Date | Activities | Health |');
      lines.push('|---|-------|-----------|------------|--------|');

      for (const v of versions as Array<{
        version_number?: number;
        label?: string;
        data_date?: string;
        total_activities?: number;
        health_score?: number;
        is_baseline?: boolean;
      }>) {
        const baseline = v.is_baseline ? ' _(baseline)_' : '';
        lines.push(
          `| ${v.version_number ?? '-'} | ${(v.label ?? 'Unnamed') + baseline} | ${v.data_date ?? 'N/A'} | ${v.total_activities ?? '-'} | ${v.health_score ?? '-'}/100 |`
        );
      }

      return { text: lines.join('\n'), data: { versions }, dataType: 'version_list' };
    }

    case 'compare_versions': {
      return {
        text: 'Version comparison requires specifying two version numbers. Try: "compare version 1 with version 2"',
        dataType: 'version_list',
      };
    }

    case 'activity_search': {
      const query = (params.query as string) ?? '';
      const matches = schedule.activities
        .filter(
          (a) =>
            a.name.toLowerCase().includes(query.toLowerCase()) ||
            a.code.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 20);

      if (matches.length === 0) {
        return { text: `No activities found matching "${query}".`, dataType: 'activity_table' };
      }

      const lines: string[] = [];
      lines.push(`**${matches.length} activities** matching "${query}"\n`);
      lines.push('| Code | Name | Status | % Complete |');
      lines.push('|------|------|--------|------------|');
      for (const a of matches) {
        lines.push(`| ${a.code} | ${a.name} | ${a.status} | ${a.percentComplete}% |`);
      }

      return { text: lines.join('\n'), data: { activities: matches }, dataType: 'activity_table' };
    }

    case 'activity_detail': {
      const code = (params.activityCode as string) ?? '';
      const act = schedule.activities.find((a) => a.code === code);
      if (!act) {
        return { text: `Activity "${code}" not found in this schedule.` };
      }
      const cpm = cpmResult.activities.get(act.code);
      const preds = schedule.relationships.filter((r) => r.successorCode === act.code);
      const succs = schedule.relationships.filter((r) => r.predecessorCode === act.code);

      const lines: string[] = [];
      lines.push(`**Activity: ${act.code}** — ${act.name}\n`);
      lines.push(`- **Status:** ${act.status} (${act.percentComplete}% complete)`);
      lines.push(`- **Type:** ${act.type}`);
      lines.push(`- **Planned Start:** ${fmtDate(act.plannedStart)}`);
      lines.push(`- **Planned Finish:** ${fmtDate(act.plannedFinish)}`);
      if (act.actualStart) lines.push(`- **Actual Start:** ${fmtDate(act.actualStart)}`);
      if (act.actualFinish) lines.push(`- **Actual Finish:** ${fmtDate(act.actualFinish)}`);
      lines.push(`- **Remaining Duration:** ${fmtNum(act.remainingDuration)} days`);
      if (cpm) {
        lines.push(`- **Total Float:** ${fmtNum(cpm.totalFloat)} days`);
        lines.push(`- **Critical:** ${cpm.isCritical ? 'Yes' : 'No'}`);
        lines.push(`- **Early Finish (CPM):** ${fmtDate(cpm.earlyFinish)}`);
      }
      if (preds.length > 0) {
        lines.push(`\n**Predecessors (${preds.length}):**`);
        for (const p of preds.slice(0, 5)) {
          lines.push(`- ${p.predecessorCode} (${p.type}, lag ${p.lagDays}d)`);
        }
      }
      if (succs.length > 0) {
        lines.push(`\n**Successors (${succs.length}):**`);
        for (const s of succs.slice(0, 5)) {
          lines.push(`- ${s.successorCode} (${s.type}, lag ${s.lagDays}d)`);
        }
      }

      return {
        text: lines.join('\n'),
        data: { activity: act, cpm, predecessors: preds, successors: succs },
        dataType: 'activity_table',
      };
    }

    default:
      return { text: 'I was unable to process that query directly. Please try rephrasing.' };
  }
}

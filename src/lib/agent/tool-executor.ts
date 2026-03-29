import { CanonicalSchedule } from '../parsers/normaliser';
import { CpmResult } from '../engine/cpm';
import { CalendarDef } from '../engine/calendar';
import { scoreScheduleHealth } from '../engine/health-scorer';
import { calculateEarnedValue } from '../engine/earned-value';
import { getLookAhead } from '../engine/lookahead';
import { runWhatIf } from '../engine/whatif';
import { calculateCpm, CpmActivity, CpmRelationship } from '../engine/cpm';
import { CalendarEngine } from '../engine/calendar';

export interface AgentContext {
  schedule: CanonicalSchedule;
  cpmResult: CpmResult;
  calendars: CalendarDef[];
  projectId: string;
  versionId: string;
  versions: unknown[];
}

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: AgentContext
): Promise<unknown> {
  const { schedule, cpmResult, calendars, versions } = context;

  switch (toolName) {
    case 'get_critical_path': {
      const criticalIds = cpmResult.criticalPath;
      const criticalActivities = criticalIds
        .map((id) => {
          const act = schedule.activities.find((a) => a.code === id);
          const cpmAct = cpmResult.activities.get(id);
          if (!act || !cpmAct) return null;
          return {
            code: act.code,
            name: act.name,
            earlyStart: cpmAct.earlyStart,
            earlyFinish: cpmAct.earlyFinish,
            totalFloat: cpmAct.totalFloat,
          };
        })
        .filter(Boolean);
      return {
        count: criticalActivities.length,
        projectFinish: cpmResult.projectFinish,
        activities: criticalActivities,
      };
    }

    case 'get_activities': {
      const { status, wbs, search_text, float_max, float_min, is_critical } = toolInput as {
        status?: string;
        wbs?: string;
        search_text?: string;
        float_max?: number;
        float_min?: number;
        is_critical?: boolean;
      };

      let acts = schedule.activities.filter(
        (a) => a.type !== 'LOE' && a.type !== 'WBS_summary'
      );

      if (status) acts = acts.filter((a) => a.status === status);
      if (wbs) acts = acts.filter((a) => a.wbsCode?.startsWith(wbs));
      if (search_text) {
        const q = search_text.toLowerCase();
        acts = acts.filter(
          (a) => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)
        );
      }
      if (float_max !== undefined)
        acts = acts.filter((a) => {
          const cpm = cpmResult.activities.get(a.code);
          return (cpm ? cpm.totalFloat : a.totalFloat) <= float_max;
        });
      if (float_min !== undefined)
        acts = acts.filter((a) => {
          const cpm = cpmResult.activities.get(a.code);
          return (cpm ? cpm.totalFloat : a.totalFloat) >= float_min;
        });
      if (is_critical !== undefined) {
        acts = acts.filter((a) => {
          const cpm = cpmResult.activities.get(a.code);
          return cpm ? cpm.isCritical === is_critical : a.totalFloat <= 0 === is_critical;
        });
      }

      return acts.slice(0, 100).map((a) => {
        const cpm = cpmResult.activities.get(a.code);
        return {
          code: a.code,
          name: a.name,
          status: a.status,
          percentComplete: a.percentComplete,
          totalFloat: cpm ? cpm.totalFloat : a.totalFloat,
          isCritical: cpm ? cpm.isCritical : a.totalFloat <= 0,
          plannedStart: a.plannedStart,
          plannedFinish: a.plannedFinish,
        };
      });
    }

    case 'get_activity_detail': {
      const { activity_code } = toolInput as { activity_code: string };
      const act = schedule.activities.find((a) => a.code === activity_code);
      if (!act) return { error: `Activity ${activity_code} not found` };
      const cpm = cpmResult.activities.get(act.code);
      const preds = schedule.relationships
        .filter((r) => r.successorCode === act.code)
        .map((r) => ({ code: r.predecessorCode, type: r.type, lag: r.lagDays }));
      const succs = schedule.relationships
        .filter((r) => r.predecessorCode === act.code)
        .map((r) => ({ code: r.successorCode, type: r.type, lag: r.lagDays }));
      return { ...act, cpm, predecessors: preds, successors: succs };
    }

    case 'calculate_slippage': {
      const { activity_code, delay_days } = toolInput as {
        activity_code: string;
        delay_days: number;
      };
      const scenario = {
        id: 'temp',
        name: 'slippage',
        delays: [{ activityCode: activity_code, delayDays: delay_days }],
        createdAt: new Date(),
      };
      const impact = runWhatIf(schedule, cpmResult, calendars, scenario);
      return impact;
    }

    case 'get_earned_value': {
      const result = calculateEarnedValue(schedule);
      return result;
    }

    case 'get_schedule_health': {
      const report = scoreScheduleHealth(schedule);
      return report;
    }

    case 'get_look_ahead': {
      const { weeks = 2, wbs_filter } = toolInput as { weeks?: number; wbs_filter?: string };
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
        wbsFilter: wbs_filter,
      });
      return activities;
    }

    case 'get_float_distribution': {
      const buckets: Record<string, number> = {
        '0 (Critical)': 0,
        '1-5 days': 0,
        '6-10 days': 0,
        '11-20 days': 0,
        '21-40 days': 0,
        '41-80 days': 0,
        '>80 days': 0,
      };
      for (const act of schedule.activities) {
        if (act.type === 'LOE' || act.type === 'WBS_summary') continue;
        const cpm = cpmResult.activities.get(act.code);
        const f = cpm ? cpm.totalFloat : act.totalFloat;
        if (f <= 0) buckets['0 (Critical)']++;
        else if (f <= 5) buckets['1-5 days']++;
        else if (f <= 10) buckets['6-10 days']++;
        else if (f <= 20) buckets['11-20 days']++;
        else if (f <= 40) buckets['21-40 days']++;
        else if (f <= 80) buckets['41-80 days']++;
        else buckets['>80 days']++;
      }
      return { buckets };
    }

    case 'compare_baseline': {
      const baseline = (versions as Array<{ is_baseline?: boolean; version_number?: number }>).find(
        (v) => v.is_baseline
      );
      if (!baseline) return { message: 'No baseline version found for this project.' };
      return {
        message: 'Baseline comparison would require loading the baseline version data.',
        baseline,
      };
    }

    case 'generate_chart': {
      const { chart_type } = toolInput as { chart_type: string };
      if (chart_type === 'earned_value') {
        const ev = calculateEarnedValue(schedule);
        return { chart_type, data: ev };
      }
      if (chart_type === 'float_histogram') {
        const buckets: Record<string, number> = {
          '0 (Critical)': 0,
          '1-5': 0,
          '6-10': 0,
          '11-20': 0,
          '21-40': 0,
          '41-80': 0,
          '>80': 0,
        };
        for (const act of schedule.activities) {
          if (act.type === 'LOE' || act.type === 'WBS_summary') continue;
          const cpm = cpmResult.activities.get(act.code);
          const f = cpm ? cpm.totalFloat : act.totalFloat;
          if (f <= 0) buckets['0 (Critical)']++;
          else if (f <= 5) buckets['1-5']++;
          else if (f <= 10) buckets['6-10']++;
          else if (f <= 20) buckets['11-20']++;
          else if (f <= 40) buckets['21-40']++;
          else if (f <= 80) buckets['41-80']++;
          else buckets['>80']++;
        }
        return { chart_type, data: { buckets } };
      }
      return { chart_type, message: `Chart type ${chart_type} generated.` };
    }

    case 'list_versions': {
      return { versions };
    }

    case 'compare_versions': {
      const { base_version_number, compare_version_number } = toolInput as {
        base_version_number: number;
        compare_version_number: number;
      };
      const base = (versions as Array<{ version_number?: number }>).find(
        (v) => v.version_number === base_version_number
      );
      const compare = (versions as Array<{ version_number?: number }>).find(
        (v) => v.version_number === compare_version_number
      );
      if (!base || !compare) {
        return { error: 'One or both versions not found' };
      }
      return { base, compare, message: 'Full diff requires loading both version data sets.' };
    }

    case 'track_activity_across_versions': {
      const { activity_code, fields } = toolInput as {
        activity_code: string;
        fields?: string[];
      };
      return {
        activity_code,
        fields: fields ?? ['plannedStart', 'plannedFinish', 'percentComplete'],
        message: 'Cross-version tracking requires loading multiple version data sets.',
      };
    }

    case 'track_milestone_trend': {
      const { activity_code } = toolInput as { activity_code?: string };
      const milestones = schedule.activities.filter(
        (a) => a.type === 'task_milestone' || (activity_code && a.code === activity_code)
      );
      return {
        milestones: milestones.map((m) => ({
          code: m.code,
          name: m.name,
          plannedFinish: m.plannedFinish,
        })),
        message: 'Historical trend requires loading multiple version data sets.',
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// Build CPM result from schedule for context
export function buildCpmFromSchedule(
  schedule: CanonicalSchedule,
  calendars: CalendarDef[]
): CpmResult {
  const defaultCal: CalendarDef = {
    id: '__default__',
    workdays: [1, 2, 3, 4, 5],
    holidays: [],
    hoursPerDay: 8,
  };
  const allCals = calendars.length > 0 ? [defaultCal, ...calendars] : [defaultCal];
  const calEngine = new CalendarEngine(allCals);

  const dataDate = schedule.project.dataDate ?? new Date();

  const cpmActivities: CpmActivity[] = schedule.activities.map((act) => ({
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
  }));

  const cpmRelationships: CpmRelationship[] = schedule.relationships.map((rel) => ({
    predecessorId: rel.predecessorCode,
    successorId: rel.successorCode,
    type: rel.type as 'FS' | 'SS' | 'FF' | 'SF',
    lagDays: rel.lagDays,
  }));

  return calculateCpm({
    activities: cpmActivities,
    relationships: cpmRelationships,
    calendar: calEngine,
    projectStart: dataDate,
    dataDate,
  });
}

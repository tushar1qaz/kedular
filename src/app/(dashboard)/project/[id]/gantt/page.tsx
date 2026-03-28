import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  projects,
  schedule_versions,
  activities as activitiesTable,
  relationships as relsTable,
  calendars as calendarsTable,
  wbs_nodes as wbsTable,
} from '@/lib/db/schema';
import DegradedFeatureNotice from '@/components/shared/DegradedFeatureNotice';
import GanttPageClient from './GanttPageClient';
import { CalendarEngine, CalendarDef } from '@/lib/engine/calendar';
import { calculateCpm, CpmActivity, CpmRelationship } from '@/lib/engine/cpm';
import type { CpmActivityResult } from '@/lib/engine/cpm';
import type { GanttActivity, GanttRelationship } from '@/components/gantt/GanttChart';
import type { ActivityDetailData } from '@/components/gantt/ActivityDetail';
import type { ScheduleParseHealth } from '@/types/schedule';

interface PageProps {
  params: Promise<{ id: string }>;
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function safeDate(s: string | null | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

function toDateLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default async function GanttPage({ params }: PageProps) {
  const { id } = await params;

  // Fetch the project
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) {
    return (
      <div className="p-8 text-center text-slate-500">Project not found</div>
    );
  }

  // Fetch the active version
  if (!project.active_version_id) {
    return (
      <DegradedFeatureNotice
        feature="Gantt chart"
        reason="No active schedule version found."
        projectId={id}
      />
    );
  }

  const [version] = await db
    .select()
    .from(schedule_versions)
    .where(eq(schedule_versions.id, project.active_version_id))
    .limit(1);

  if (!version) {
    return (
      <DegradedFeatureNotice
        feature="Gantt chart"
        reason="Active version not found."
        projectId={id}
      />
    );
  }

  // Check parse health
  const parseHealth = version.parse_health as ScheduleParseHealth | null;
  if (parseHealth && !parseHealth.capabilities.canShowGantt) {
    return (
      <DegradedFeatureNotice
        feature="Gantt chart"
        reason={
          parseHealth.missingDataMessages.gantt ??
          'The schedule data is insufficient to render a Gantt chart.'
        }
        parseErrors={parseHealth.errors}
        parseWarnings={parseHealth.warnings}
        projectId={id}
      />
    );
  }

  const versionId = version.id;

  // Fetch all data in parallel
  const [acts, rels, cals, wbsNodes] = await Promise.all([
    db
      .select()
      .from(activitiesTable)
      .where(eq(activitiesTable.version_id, versionId)),
    db
      .select()
      .from(relsTable)
      .where(eq(relsTable.version_id, versionId)),
    db
      .select()
      .from(calendarsTable)
      .where(eq(calendarsTable.version_id, versionId)),
    db
      .select()
      .from(wbsTable)
      .where(eq(wbsTable.version_id, versionId)),
  ]);

  // Build calendar engine
  const today = new Date();
  const dataDate = project.data_date ? toDateLocal(project.data_date) : today;
  const projectStart = version.data_date ? toDateLocal(version.data_date) : dataDate;

  const calendarDefs: CalendarDef[] = cals.map((cal) => ({
    id: cal.id,
    workdays: Array.isArray(cal.workdays)
      ? (cal.workdays as number[])
      : [1, 2, 3, 4, 5],
    holidays: Array.isArray(cal.holidays) ? (cal.holidays as string[]) : [],
    hoursPerDay: cal.hours_per_day ? Number(cal.hours_per_day) : 8,
  }));

  const calEngine = new CalendarEngine(calendarDefs);

  // Default calendar id: use first calendar or __default__
  const defaultCalId = cals.length > 0 ? cals[0].id : '__default__';

  // Build CPM input from activities (hours → days: duration in hours / hoursPerDay)
  const hoursPerDay = 8;

  const cpmActivities: CpmActivity[] = acts.map((act) => {
    const calId = act.calendar_id ?? defaultCalId;
    const hpd = calId ? calEngine.getHoursPerDay(calId) || hoursPerDay : hoursPerDay;
    const remDurHours = act.remaining_duration ? Number(act.remaining_duration) : 0;
    const remDurDays = remDurHours / hpd;

    const status: 'not_started' | 'in_progress' | 'complete' =
      act.status === 'TK_Complete' || act.status === 'complete'
        ? 'complete'
        : act.status === 'TK_Active' || act.status === 'in_progress'
        ? 'in_progress'
        : 'not_started';

    return {
      id: act.id,
      code: act.code ?? '',
      remainingDuration: remDurDays,
      calendarId: calId ?? defaultCalId,
      status,
      actualStart: act.actual_start ? toDateLocal(act.actual_start) : null,
      actualFinish: act.actual_finish ? toDateLocal(act.actual_finish) : null,
      constraintType: act.constraint_type ?? null,
      constraintDate: act.constraint_date ? toDateLocal(act.constraint_date) : null,
      type: (act.type as CpmActivity['type']) ?? 'task_dependent',
    };
  });

  const validRelTypes = new Set(['FS', 'SS', 'FF', 'SF']);
  const cpmRels: CpmRelationship[] = rels
    .filter((r) => r.predecessor_id && r.successor_id && validRelTypes.has(r.type ?? ''))
    .map((r) => ({
      predecessorId: r.predecessor_id!,
      successorId: r.successor_id!,
      type: (r.type as 'FS' | 'SS' | 'FF' | 'SF'),
      lagDays: r.lag_days ? Number(r.lag_days) : 0,
    }));

  // Run CPM
  const cpmResult = calculateCpm({
    activities: cpmActivities,
    relationships: cpmRels,
    calendar: calEngine,
    projectStart,
    dataDate,
  });

  // Build GanttActivity list
  const actMap = new Map(acts.map((a) => [a.id, a]));

  const ganttActivities: GanttActivity[] = acts.map((act) => {
    const cpm = cpmResult.activities.get(act.id);
    const start = cpm ? cpm.earlyStart : safeDate(act.planned_start, dataDate);
    const end = cpm ? cpm.earlyFinish : safeDate(act.planned_finish, dataDate);

    return {
      id: act.id,
      code: act.code ?? '',
      name: act.name ?? '',
      start,
      end,
      progress: act.percent_complete ? Number(act.percent_complete) : 0,
      wbsCode: act.wbs_code ?? '',
      isCritical: cpm ? cpm.isCritical : (act.is_critical ?? false),
      totalFloat: cpm ? cpm.totalFloat : (act.total_float ? Number(act.total_float) : 0),
      status: act.status ?? 'not_started',
      type: act.type ?? 'task_dependent',
    };
  });

  const ganttRels: GanttRelationship[] = rels
    .filter((r) => r.predecessor_id && r.successor_id)
    .map((r) => ({
      fromId: r.predecessor_id!,
      toId: r.successor_id!,
      type: r.type ?? 'FS',
    }));

  // Build WBS nodes with activity counts
  const actsByWbs = new Map<string, number>();
  for (const act of acts) {
    if (act.wbs_id) {
      actsByWbs.set(act.wbs_id, (actsByWbs.get(act.wbs_id) ?? 0) + 1);
    }
  }

  // Build parent map from source_ids
  const wbsBySourceId = new Map(wbsNodes.map((w) => [w.source_id, w]));

  const ganttWbsNodes = wbsNodes.map((w) => {
    const parentNode = w.parent_source_id
      ? wbsBySourceId.get(w.parent_source_id)
      : null;
    return {
      id: w.id,
      code: w.code ?? '',
      name: w.name ?? '',
      level: w.level ?? 1,
      parentId: parentNode?.id ?? null,
      activityCount: actsByWbs.get(w.id) ?? 0,
    };
  });

  // Build activity detail map
  // Build lookup maps for relationships
  const predsByActId = new Map<string, typeof rels>();
  const succsByActId = new Map<string, typeof rels>();
  for (const rel of rels) {
    if (rel.successor_id) {
      if (!predsByActId.has(rel.successor_id)) predsByActId.set(rel.successor_id, []);
      predsByActId.get(rel.successor_id)!.push(rel);
    }
    if (rel.predecessor_id) {
      if (!succsByActId.has(rel.predecessor_id)) succsByActId.set(rel.predecessor_id, []);
      succsByActId.get(rel.predecessor_id)!.push(rel);
    }
  }

  const activityDetails = new Map<string, ActivityDetailData>();
  for (const act of acts) {
    const preds = (predsByActId.get(act.id) ?? []).map((r) => {
      const predAct = r.predecessor_id ? actMap.get(r.predecessor_id) : null;
      return {
        id: r.predecessor_id ?? '',
        code: predAct?.code ?? r.predecessor_code ?? '',
        name: predAct?.name ?? '',
        type: r.type ?? 'FS',
        lagDays: r.lag_days ? Number(r.lag_days) : 0,
      };
    });

    const succs = (succsByActId.get(act.id) ?? []).map((r) => {
      const succAct = r.successor_id ? actMap.get(r.successor_id) : null;
      return {
        id: r.successor_id ?? '',
        code: succAct?.code ?? r.successor_code ?? '',
        name: succAct?.name ?? '',
        type: r.type ?? 'FS',
        lagDays: r.lag_days ? Number(r.lag_days) : 0,
      };
    });

    activityDetails.set(act.id, {
      id: act.id,
      code: act.code ?? '',
      name: act.name ?? '',
      status: act.status ?? 'not_started',
      plannedStart: act.planned_start ?? null,
      plannedFinish: act.planned_finish ?? null,
      actualStart: act.actual_start ?? null,
      actualFinish: act.actual_finish ?? null,
      remainingDuration: act.remaining_duration ? Number(act.remaining_duration) : 0,
      percentComplete: act.percent_complete ? Number(act.percent_complete) : 0,
      wbsCode: act.wbs_code ?? '',
      calendarId: act.calendar_id ?? defaultCalId,
      predecessors: preds,
      successors: succs,
    });
  }

  // Serialize cpmResults for client (Map cannot be passed directly)
  const cpmResultsObj: Record<string, CpmActivityResult> = {};
  for (const [k, v] of cpmResult.activities.entries()) {
    cpmResultsObj[k] = v;
  }

  return (
    <div className="flex flex-col h-full">
      {cpmResult.errors.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800">
          CPM warnings: {cpmResult.errors.map((e) => e.message).join('; ')}
        </div>
      )}
      <GanttPageClient
        projectId={id}
        versionId={versionId}
        activities={ganttActivities}
        relationships={ganttRels}
        cpmResults={new Map(Object.entries(cpmResultsObj))}
        wbsNodes={ganttWbsNodes}
        activityDetails={activityDetails}
        dataDate={dataDate}
      />
    </div>
  );
}

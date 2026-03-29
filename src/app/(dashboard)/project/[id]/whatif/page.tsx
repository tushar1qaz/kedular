import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  projects,
  schedule_versions,
  activities as activitiesTable,
  relationships as relsTable,
  calendars as calendarsTable,
  what_if_scenarios,
} from '@/lib/db/schema';
import DegradedFeatureNotice from '@/components/shared/DegradedFeatureNotice';
import WhatIfPageClient from './WhatIfPageClient';
import { CalendarEngine, CalendarDef } from '@/lib/engine/calendar';
import { calculateCpm, CpmActivity, CpmRelationship } from '@/lib/engine/cpm';
import type { ScheduleParseHealth } from '@/types/schedule';
import type { WhatIfImpact } from '@/lib/engine/whatif';

interface PageProps {
  params: Promise<{ id: string }>;
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

export default async function WhatifPage({ params }: PageProps) {
  const { id } = await params;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) {
    return <div className="p-8 text-center text-slate-500">Project not found</div>;
  }

  if (!project.active_version_id) {
    return (
      <DegradedFeatureNotice
        feature="What-if Analysis"
        reason="No active schedule version found. Please upload a schedule first."
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
        feature="What-if Analysis"
        reason="Active version not found."
        projectId={id}
      />
    );
  }

  const parseHealth = version.parse_health as ScheduleParseHealth | null;
  if (parseHealth && !parseHealth.capabilities.canRunWhatIf) {
    return (
      <DegradedFeatureNotice
        feature="What-if Analysis"
        reason="The schedule data is insufficient to run what-if analysis."
        parseErrors={parseHealth.errors}
        parseWarnings={parseHealth.warnings}
        projectId={id}
      />
    );
  }

  const versionId = version.id;

  const [acts, rels, cals, savedScenarios] = await Promise.all([
    db.select().from(activitiesTable).where(eq(activitiesTable.version_id, versionId)),
    db.select().from(relsTable).where(eq(relsTable.version_id, versionId)),
    db.select().from(calendarsTable).where(eq(calendarsTable.version_id, versionId)),
    db
      .select()
      .from(what_if_scenarios)
      .where(eq(what_if_scenarios.project_id, id))
      .orderBy(what_if_scenarios.created_at),
  ]);

  const today = new Date();
  const dataDateStr = version.data_date ?? project.data_date;
  const projectStart = dataDateStr ? parseDate(dataDateStr) ?? today : today;

  const defaultCal: CalendarDef = {
    id: '__default__',
    workdays: [1, 2, 3, 4, 5],
    holidays: [],
    hoursPerDay: 8,
  };

  const calendarDefs: CalendarDef[] = cals.map((cal) => ({
    id: cal.id,
    workdays: Array.isArray(cal.workdays) ? (cal.workdays as number[]) : [1, 2, 3, 4, 5],
    holidays: Array.isArray(cal.holidays) ? (cal.holidays as string[]) : [],
    hoursPerDay: cal.hours_per_day ? Number(cal.hours_per_day) : 8,
  }));

  const calendarEngine = new CalendarEngine([defaultCal, ...calendarDefs]);

  const cpmActivities: CpmActivity[] = acts.map((act) => ({
    id: act.code ?? '',
    code: act.code ?? '',
    remainingDuration: act.remaining_duration ? Number(act.remaining_duration) : 0,
    calendarId: act.calendar_id ?? '__default__',
    status: (act.status ?? 'not_started') as 'not_started' | 'in_progress' | 'complete',
    actualStart: parseDate(act.actual_start),
    actualFinish: parseDate(act.actual_finish),
    constraintType: act.constraint_type ?? null,
    constraintDate: parseDate(act.constraint_date),
    type: (act.type ?? 'task_dependent') as 'task_dependent' | 'task_milestone' | 'LOE' | 'WBS_summary',
  }));

  const cpmRelationships: CpmRelationship[] = rels.map((rel) => ({
    predecessorId: rel.predecessor_code ?? '',
    successorId: rel.successor_code ?? '',
    type: (rel.type ?? 'FS') as 'FS' | 'SS' | 'FF' | 'SF',
    lagDays: rel.lag_days ? Number(rel.lag_days) : 0,
  }));

  const cpmResult = calculateCpm({
    activities: cpmActivities,
    relationships: cpmRelationships,
    calendar: calendarEngine,
    projectStart,
    dataDate: projectStart,
  });

  // Build activity info for client
  const activityInfos = acts.map((act) => {
    const cpm = cpmResult.activities.get(act.code ?? '');
    return {
      code: act.code ?? '',
      name: act.name ?? '',
      isCritical: cpm?.isCritical ?? false,
      totalFloat: cpm?.totalFloat ?? (act.total_float ? Number(act.total_float) : 0),
      earlyStart: cpm?.earlyStart ?? projectStart,
      earlyFinish: cpm?.earlyFinish ?? projectStart,
    };
  });

  // Serialize saved scenarios for client
  const serializedScenarios = savedScenarios.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    delays: (s.delays as Array<{ activityCode: string; delayDays: number }>) ?? [],
    impact: (s.impact as WhatIfImpact | null) ?? null,
    created_at: s.created_at?.toISOString() ?? null,
  }));

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <h1 className="text-xl font-bold text-slate-900">What-if Analysis</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Version {version.version_number} &mdash; {acts.length} activities &mdash; Project finish:{' '}
          {cpmResult.projectFinish.toLocaleDateString('en-AU', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <WhatIfPageClient
          projectId={id}
          versionId={versionId}
          activities={activityInfos}
          originalFinish={cpmResult.projectFinish}
          savedScenarios={serializedScenarios}
        />
      </div>
    </div>
  );
}

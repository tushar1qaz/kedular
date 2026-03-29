import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  projects,
  schedule_versions,
  activities as activitiesTable,
} from '@/lib/db/schema';
import DegradedFeatureNotice from '@/components/shared/DegradedFeatureNotice';
import type { ScheduleParseHealth } from '@/types/schedule';
import type { CanonicalActivity } from '@/lib/parsers/normaliser';
import { calculateEarnedValue } from '@/lib/engine/earned-value';
import BurndownChartWrapper from './BurndownChartWrapper';

interface PageProps {
  params: Promise<{ id: string }>;
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

function rowToCanonicalActivity(act: typeof activitiesTable.$inferSelect): CanonicalActivity {
  return {
    code: act.code ?? '',
    sourceId: act.source_id ?? '',
    name: act.name ?? '',
    wbsCode: act.wbs_code ?? null,
    type: act.type ?? 'task_dependent',
    status: act.status ?? 'not_started',
    plannedStart: parseDate(act.planned_start),
    plannedFinish: parseDate(act.planned_finish),
    actualStart: parseDate(act.actual_start),
    actualFinish: parseDate(act.actual_finish),
    remainingDuration: act.remaining_duration ? Number(act.remaining_duration) : 0,
    totalFloat: act.total_float ? Number(act.total_float) : 0,
    freeFloat: act.free_float ? Number(act.free_float) : 0,
    percentComplete: act.percent_complete ? Number(act.percent_complete) : 0,
    calendarSourceId: act.calendar_id ?? null,
  };
}

export default async function BurndownPage({ params }: PageProps) {
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
        feature="Burndown & Earned Value"
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
        feature="Burndown & Earned Value"
        reason="Active version not found."
        projectId={id}
      />
    );
  }

  const parseHealth = version.parse_health as ScheduleParseHealth | null;
  if (parseHealth && !parseHealth.capabilities.canShowBurndown) {
    return (
      <DegradedFeatureNotice
        feature="Burndown chart"
        reason={
          parseHealth.missingDataMessages.burndown ??
          'The schedule data is insufficient to render a burndown chart.'
        }
        parseErrors={parseHealth.errors}
        parseWarnings={parseHealth.warnings}
        projectId={id}
      />
    );
  }

  const acts = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.version_id, version.id));

  const today = new Date();
  const dataDate = version.data_date
    ? (() => { const [y, m, d] = version.data_date.split('-').map(Number); return new Date(y, m - 1, d); })()
    : today;

  const activities = acts.map(rowToCanonicalActivity);

  const schedule = {
    project: {
      name: project.name,
      description: '',
      dataDate,
    },
    activities,
    relationships: [],
    wbsNodes: [],
    calendars: [],
  };

  const evResult = calculateEarnedValue(schedule);

  // Serialize dates for client
  const serializedActivities = activities.map((a) => ({
    ...a,
    plannedStart: a.plannedStart?.toISOString() ?? null,
    plannedFinish: a.plannedFinish?.toISOString() ?? null,
    actualStart: a.actualStart?.toISOString() ?? null,
    actualFinish: a.actualFinish?.toISOString() ?? null,
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Burndown &amp; Earned Value</h1>
        <p className="text-slate-500 text-sm mt-1">
          Version {version.version_number} &mdash; Data date:{' '}
          {dataDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      <BurndownChartWrapper
        activities={serializedActivities}
        dataDateIso={dataDate.toISOString()}
        evResult={{
          ...evResult,
          dataDate: evResult.dataDate?.toISOString() ?? null,
        }}
      />
    </div>
  );
}

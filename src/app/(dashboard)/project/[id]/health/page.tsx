import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  projects,
  schedule_versions,
  activities as activitiesTable,
  relationships as relsTable,
} from '@/lib/db/schema';
import DegradedFeatureNotice from '@/components/shared/DegradedFeatureNotice';
import { scoreScheduleHealth } from '@/lib/engine/health-scorer';
import type { CanonicalActivity, CanonicalRelationship } from '@/lib/parsers/normaliser';

interface PageProps {
  params: Promise<{ id: string }>;
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

const gradeColors: Record<string, string> = {
  A: 'bg-green-100 text-green-800 border-green-200',
  B: 'bg-blue-100 text-blue-800 border-blue-200',
  C: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  D: 'bg-orange-100 text-orange-800 border-orange-200',
  F: 'bg-red-100 text-red-800 border-red-200',
};

const scoreBarColor = (score: number) => {
  if (score >= 75) return 'bg-green-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
};

export default async function HealthPage({ params }: PageProps) {
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
        feature="Schedule Health"
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
        feature="Schedule Health"
        reason="Active version not found."
        projectId={id}
      />
    );
  }

  const [acts, rels] = await Promise.all([
    db.select().from(activitiesTable).where(eq(activitiesTable.version_id, version.id)),
    db.select().from(relsTable).where(eq(relsTable.version_id, version.id)),
  ]);

  const activities: CanonicalActivity[] = acts.map((act) => ({
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
    rawXerRow: act.raw_xer_row,
  }));

  const relationships: CanonicalRelationship[] = rels.map((rel) => ({
    predecessorCode: rel.predecessor_code ?? '',
    successorCode: rel.successor_code ?? '',
    type: rel.type ?? 'FS',
    lagDays: rel.lag_days ? Number(rel.lag_days) : 0,
  }));

  const schedule = {
    project: { name: project.name, description: '', dataDate: null },
    activities,
    relationships,
    wbsNodes: [],
    calendars: [],
  };

  const report = scoreScheduleHealth(schedule);

  const overallScoreColor =
    report.overallScore >= 75
      ? 'text-green-600'
      : report.overallScore >= 50
      ? 'text-yellow-600'
      : 'text-red-600';

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Schedule Health</h1>
        <p className="text-slate-500 text-sm mt-1">
          Version {version.version_number} &mdash; {acts.length} activities, {rels.length} relationships
        </p>
      </div>

      {/* Overall score */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center gap-6">
        <div className="text-center">
          <div className={`text-6xl font-bold ${overallScoreColor}`}>{report.overallScore}</div>
          <div className="text-slate-500 text-sm mt-1">Overall Score</div>
        </div>
        <div className="flex-1">
          <span className={`inline-block text-4xl font-bold px-4 py-1 rounded-lg border-2 ${gradeColors[report.grade]}`}>
            {report.grade}
          </span>
          {report.recommendations.length > 0 && (
            <div className="mt-3 space-y-1">
              {report.recommendations.map((r, i) => (
                <div key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">&#x26A0;</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {report.metrics.map((metric) => (
          <div key={metric.name} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-semibold text-slate-800 text-sm">{metric.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">Target: {metric.target}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-800">{metric.score}</div>
                <div className="text-xs text-slate-400">weight {metric.weight}%</div>
              </div>
            </div>

            {/* Score bar */}
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all ${scoreBarColor(metric.score)}`}
                style={{ width: `${metric.score}%` }}
              />
            </div>

            <div className="text-xs text-slate-600">
              Value: <span className="font-medium">{metric.value}</span>
            </div>

            {metric.issues.length > 0 && (
              <div className="mt-2 space-y-1">
                {metric.issues.map((issue, i) => (
                  <div key={i} className="text-xs text-red-600 flex items-start gap-1">
                    <span className="mt-0.5">&#x2022;</span>
                    <span>{issue}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

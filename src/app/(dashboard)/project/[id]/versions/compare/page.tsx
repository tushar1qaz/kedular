import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/lib/db/client';
import {
  projects,
  schedule_versions,
  activities as activitiesTable,
} from '@/lib/db/schema';
import { diffVersions } from '@/lib/versions/diff-engine';
import type { CanonicalActivity, CanonicalSchedule } from '@/lib/parsers/normaliser';
import MilestoneTrendChart from '@/components/charts/MilestoneTrendChart';
import CompareChartWrapper from './CompareChartWrapper';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ base?: string; compare?: string }>;
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
    rawXerRow: act.raw_xer_row,
  };
}

const severityColors: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700 border border-red-200',
  MEDIUM: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  LOW: 'bg-slate-100 text-slate-600 border border-slate-200',
};

const changeTypeColors: Record<string, string> = {
  added: 'bg-green-100 text-green-700',
  removed: 'bg-red-100 text-red-700',
  modified: 'bg-blue-100 text-blue-700',
};

export default async function VersionComparePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { base: baseId, compare: compareId } = await searchParams;

  if (!baseId || !compareId) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">Please provide both base and compare version IDs.</p>
        <Link href={`/project/${id}/versions`} className="text-blue-600 hover:underline text-sm mt-2 inline-block">
          Back to Versions
        </Link>
      </div>
    );
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) {
    return <div className="p-8 text-center text-slate-500">Project not found</div>;
  }

  const [baseVersion, compareVersion] = await Promise.all([
    db.select().from(schedule_versions).where(eq(schedule_versions.id, baseId)).limit(1),
    db.select().from(schedule_versions).where(eq(schedule_versions.id, compareId)).limit(1),
  ]);

  if (!baseVersion[0] || !compareVersion[0]) {
    return (
      <div className="p-8 text-center text-slate-500">
        One or both versions not found.{' '}
        <Link href={`/project/${id}/versions`} className="text-blue-600 hover:underline">Back to Versions</Link>
      </div>
    );
  }

  const [baseActs, compareActs] = await Promise.all([
    db.select().from(activitiesTable).where(eq(activitiesTable.version_id, baseId)),
    db.select().from(activitiesTable).where(eq(activitiesTable.version_id, compareId)),
  ]);

  const baseSchedule: CanonicalSchedule = {
    project: { name: project.name, description: '', dataDate: null },
    activities: baseActs.map(rowToCanonicalActivity),
    relationships: [],
    wbsNodes: [],
    calendars: [],
  };

  const compareSchedule: CanonicalSchedule = {
    project: { name: project.name, description: '', dataDate: null },
    activities: compareActs.map(rowToCanonicalActivity),
    relationships: [],
    wbsNodes: [],
    calendars: [],
  };

  const diff = diffVersions(baseSchedule, compareSchedule);

  // Build milestone trend data for key milestones (type === task_milestone)
  const baseMilestones = baseActs.filter((a) => a.type === 'task_milestone');
  const compareMilestonesMap = new Map(
    compareActs.filter((a) => a.type === 'task_milestone').map((a) => [a.code, a])
  );

  const milestonesData = baseMilestones.slice(0, 8).map((bm) => {
    const cm = bm.code ? compareMilestonesMap.get(bm.code) : null;
    return {
      code: bm.code ?? '',
      name: bm.name ?? '',
      versions: [
        {
          versionLabel: baseVersion[0].label ?? `V${baseVersion[0].version_number}`,
          plannedFinish: parseDate(bm.planned_finish),
        },
        {
          versionLabel: compareVersion[0].label ?? `V${compareVersion[0].version_number}`,
          plannedFinish: cm ? parseDate(cm.planned_finish) : null,
        },
      ],
    };
  });

  // Serialize milestone dates for client component
  const serializedMilestones = milestonesData.map((m) => ({
    ...m,
    versions: m.versions.map((v) => ({
      ...v,
      plannedFinish: v.plannedFinish?.toISOString() ?? null,
    })),
  }));

  const finishChange = diff.projectFinishChange;
  const finishChangeLabel =
    finishChange === 0
      ? 'No change'
      : finishChange > 0
      ? `+${finishChange}d (slipped)`
      : `${finishChange}d (improved)`;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Version Comparison</h1>
          <p className="text-slate-500 text-sm mt-1">
            {baseVersion[0].label ?? `V${baseVersion[0].version_number}`} vs{' '}
            {compareVersion[0].label ?? `V${compareVersion[0].version_number}`}
          </p>
        </div>
        <Link
          href={`/project/${id}/versions`}
          className="text-sm text-blue-600 hover:underline"
        >
          Back to Versions
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <div className="text-3xl font-bold text-green-600">{diff.added}</div>
          <div className="text-xs text-slate-500 mt-1">Added</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <div className="text-3xl font-bold text-red-600">{diff.removed}</div>
          <div className="text-xs text-slate-500 mt-1">Removed</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <div className="text-3xl font-bold text-blue-600">{diff.modified}</div>
          <div className="text-xs text-slate-500 mt-1">Modified</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <div className={`text-xl font-bold ${finishChange > 0 ? 'text-red-600' : finishChange < 0 ? 'text-green-600' : 'text-slate-600'}`}>
            {finishChangeLabel}
          </div>
          <div className="text-xs text-slate-500 mt-1">Project Finish</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <div className="text-3xl font-bold text-red-600">{diff.highSeverityCount}</div>
          <div className="text-xs text-slate-500 mt-1">High Severity</div>
        </div>
      </div>

      {/* Milestone trend chart */}
      {milestonesData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Milestone Trend</h2>
          <CompareChartWrapper milestones={serializedMilestones} />
        </div>
      )}

      {/* Diff table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Change Details</h2>
          <p className="text-sm text-slate-500 mt-0.5">{diff.changes.length} changes</p>
        </div>
        {diff.changes.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No changes between these versions.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Code</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Change</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Severity</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Changed Fields</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {diff.changes.slice(0, 200).map((change, i) => (
                  <tr key={`${change.code}-${i}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{change.code}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${changeTypeColors[change.changeType]}`}>
                        {change.changeType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${severityColors[change.severity]}`}>
                        {change.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {change.fieldChanges.length > 0 ? (
                        <div className="space-y-0.5">
                          {change.fieldChanges.slice(0, 5).map((fc, j) => (
                            <div key={j} className="text-xs text-slate-600">
                              <span className="font-medium">{fc.field}:</span>{' '}
                              <span className="text-red-500">{String(fc.oldValue ?? '—')}</span>
                              {' → '}
                              <span className="text-green-600">{String(fc.newValue ?? '—')}</span>
                            </div>
                          ))}
                          {change.fieldChanges.length > 5 && (
                            <div className="text-xs text-slate-400">+{change.fieldChanges.length - 5} more</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {diff.changes.length > 200 && (
              <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
                Showing 200 of {diff.changes.length} changes
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

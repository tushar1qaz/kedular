import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  projects,
  schedule_versions,
  activities as activitiesTable,
  wbs_nodes as wbsTable,
} from '@/lib/db/schema';
import { getLookAhead } from '@/lib/engine/lookahead';
import type { CanonicalActivity } from '@/lib/parsers/normaliser';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const weeksParam = url.searchParams.get('weeks');
    const wbsFilter = url.searchParams.get('wbs') ?? undefined;
    const weeks = weeksParam ? Math.max(1, Math.min(6, parseInt(weeksParam, 10))) : 2;

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.active_version_id) {
      return Response.json({ error: 'No active version' }, { status: 422 });
    }

    const [version] = await db
      .select()
      .from(schedule_versions)
      .where(eq(schedule_versions.id, project.active_version_id))
      .limit(1);

    if (!version) {
      return Response.json({ error: 'Active version not found' }, { status: 404 });
    }

    const today = new Date();
    const dataDate = version.data_date
      ? (() => { const [y, m, d] = version.data_date.split('-').map(Number); return new Date(y, m - 1, d); })()
      : today;

    const [acts, wbsNodes] = await Promise.all([
      db.select().from(activitiesTable).where(eq(activitiesTable.version_id, version.id)),
      db.select().from(wbsTable).where(eq(wbsTable.version_id, version.id)),
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
    }));

    // Build simple CPM results map from stored data
    const cpmResults = new Map<string, { isCritical: boolean; totalFloat: number; earlyStart: Date; earlyFinish: Date }>();
    for (const act of acts) {
      const earlyStart = parseDate(act.planned_start) ?? dataDate;
      const earlyFinish = parseDate(act.planned_finish) ?? dataDate;
      cpmResults.set(act.code ?? '', {
        isCritical: act.is_critical ?? false,
        totalFloat: act.total_float ? Number(act.total_float) : 0,
        earlyStart,
        earlyFinish,
      });
    }

    const schedule = {
      project: { name: project.name, description: '', dataDate },
      activities,
      relationships: [],
      wbsNodes: [],
      calendars: [],
    };

    const lookaheadActs = getLookAhead(schedule, cpmResults, {
      weeksAhead: weeks,
      dataDate,
      wbsFilter,
    });

    // Build list of unique WBS codes for the filter dropdown
    const wbsCodes = Array.from(
      new Set(wbsNodes.map((w) => w.code).filter(Boolean))
    ).sort() as string[];

    // Serialize dates
    const serialized = lookaheadActs.map((a) => ({
      ...a,
      plannedStart: a.plannedStart?.toISOString() ?? null,
      plannedFinish: a.plannedFinish?.toISOString() ?? null,
    }));

    return Response.json({ activities: serialized, wbsCodes });
  } catch (error) {
    console.error('GET /api/projects/[id]/lookahead error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  projects,
  schedule_versions,
  activities as activitiesTable,
  relationships as relsTable,
} from '@/lib/db/schema';
import { scoreScheduleHealth } from '@/lib/engine/health-scorer';
import type { CanonicalActivity, CanonicalRelationship } from '@/lib/parsers/normaliser';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

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

    return Response.json({ report, versionId: version.id, versionNumber: version.version_number });
  } catch (error) {
    console.error('GET /api/projects/[id]/health error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

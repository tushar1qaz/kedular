import { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { activities as activitiesTable, schedule_versions } from '@/lib/db/schema';
import { diffVersions } from '@/lib/versions/diff-engine';
import type { CanonicalActivity, CanonicalSchedule } from '@/lib/parsers/normaliser';

interface RouteParams {
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
    rawXerRow: act.raw_xer_row,
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const baseId = url.searchParams.get('base');
    const compareId = url.searchParams.get('compare');

    if (!baseId || !compareId) {
      return Response.json({ error: 'Missing base or compare query params' }, { status: 400 });
    }

    // Verify both versions belong to this project
    const [baseVersion, compareVersion] = await Promise.all([
      db
        .select()
        .from(schedule_versions)
        .where(and(eq(schedule_versions.id, baseId), eq(schedule_versions.project_id, id)))
        .limit(1),
      db
        .select()
        .from(schedule_versions)
        .where(and(eq(schedule_versions.id, compareId), eq(schedule_versions.project_id, id)))
        .limit(1),
    ]);

    if (!baseVersion[0] || !compareVersion[0]) {
      return Response.json({ error: 'One or both versions not found' }, { status: 404 });
    }

    const [baseActs, compareActs] = await Promise.all([
      db.select().from(activitiesTable).where(eq(activitiesTable.version_id, baseId)),
      db.select().from(activitiesTable).where(eq(activitiesTable.version_id, compareId)),
    ]);

    const baseSchedule: CanonicalSchedule = {
      project: { name: '', description: '', dataDate: null },
      activities: baseActs.map(rowToCanonicalActivity),
      relationships: [],
      wbsNodes: [],
      calendars: [],
    };

    const compareSchedule: CanonicalSchedule = {
      project: { name: '', description: '', dataDate: null },
      activities: compareActs.map(rowToCanonicalActivity),
      relationships: [],
      wbsNodes: [],
      calendars: [],
    };

    const diff = diffVersions(baseSchedule, compareSchedule);

    return Response.json({ diff });
  } catch (error) {
    console.error('GET /api/projects/[id]/versions/compare error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

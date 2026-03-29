import { NextRequest } from 'next/server';
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
import { runWhatIf, WhatIfScenario } from '@/lib/engine/whatif';
import { calculateCpm, CpmActivity, CpmRelationship } from '@/lib/engine/cpm';
import { CalendarEngine, CalendarDef } from '@/lib/engine/calendar';
import type { CanonicalActivity, CanonicalRelationship, CanonicalSchedule } from '@/lib/parsers/normaliser';

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

// GET: list scenarios for a project (?projectId=uuid)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return Response.json({ error: 'projectId is required' }, { status: 400 });
    }

    const scenarios = await db
      .select()
      .from(what_if_scenarios)
      .where(eq(what_if_scenarios.project_id, projectId))
      .orderBy(what_if_scenarios.created_at);

    return Response.json({ scenarios });
  } catch (error) {
    console.error('GET /api/whatif error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: run scenario (and optionally save)
// Body: { projectId, versionId?, scenario: WhatIfScenario, save?: boolean }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, versionId, scenario, save = false } = body as {
      projectId: string;
      versionId?: string;
      scenario: WhatIfScenario;
      save?: boolean;
    };

    if (!projectId || !scenario) {
      return Response.json({ error: 'projectId and scenario are required' }, { status: 400 });
    }

    // Load project
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const resolvedVersionId = versionId ?? project.active_version_id;
    if (!resolvedVersionId) {
      return Response.json({ error: 'No active version found' }, { status: 422 });
    }

    const [version] = await db
      .select()
      .from(schedule_versions)
      .where(eq(schedule_versions.id, resolvedVersionId))
      .limit(1);

    if (!version) {
      return Response.json({ error: 'Version not found' }, { status: 404 });
    }

    // Load schedule data
    const [acts, rels, cals] = await Promise.all([
      db.select().from(activitiesTable).where(eq(activitiesTable.version_id, resolvedVersionId)),
      db.select().from(relsTable).where(eq(relsTable.version_id, resolvedVersionId)),
      db.select().from(calendarsTable).where(eq(calendarsTable.version_id, resolvedVersionId)),
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

    const relationships: CanonicalRelationship[] = rels.map((rel) => ({
      predecessorCode: rel.predecessor_code ?? '',
      successorCode: rel.successor_code ?? '',
      type: rel.type ?? 'FS',
      lagDays: rel.lag_days ? Number(rel.lag_days) : 0,
    }));

    const calendarDefs: CalendarDef[] = cals.map((cal) => ({
      id: cal.id,
      workdays: Array.isArray(cal.workdays) ? (cal.workdays as number[]) : [1, 2, 3, 4, 5],
      holidays: Array.isArray(cal.holidays) ? (cal.holidays as string[]) : [],
      hoursPerDay: cal.hours_per_day ? Number(cal.hours_per_day) : 8,
    }));

    const today = new Date();
    const dataDateStr = version.data_date ?? project.data_date;
    const projectStart = dataDateStr ? parseDate(dataDateStr) ?? today : today;

    const defaultCal: CalendarDef = {
      id: '__default__',
      workdays: [1, 2, 3, 4, 5],
      holidays: [],
      hoursPerDay: 8,
    };
    const allCalendars = calendarDefs.length > 0 ? calendarDefs : [defaultCal];
    const calendarEngine = new CalendarEngine([defaultCal, ...calendarDefs]);

    // Build and run original CPM
    const cpmActivities: CpmActivity[] = activities.map((act) => ({
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

    const cpmRelationships: CpmRelationship[] = relationships.map((rel) => ({
      predecessorId: rel.predecessorCode,
      successorId: rel.successorCode,
      type: rel.type as 'FS' | 'SS' | 'FF' | 'SF',
      lagDays: rel.lagDays,
    }));

    const originalCpm = calculateCpm({
      activities: cpmActivities,
      relationships: cpmRelationships,
      calendar: calendarEngine,
      projectStart,
      dataDate: projectStart,
    });

    const canonicalSchedule: CanonicalSchedule = {
      project: { name: project.name, description: '', dataDate: projectStart },
      activities,
      relationships,
      wbsNodes: [],
      calendars: [],
    };

    // Normalize scenario dates (may be strings from JSON)
    const normalizedScenario: WhatIfScenario = {
      ...scenario,
      createdAt: new Date(scenario.createdAt),
    };

    // Run what-if analysis
    const impact = runWhatIf(canonicalSchedule, originalCpm, allCalendars, normalizedScenario);

    // Save if requested
    if (save) {
      await db.insert(what_if_scenarios).values({
        project_id: projectId,
        version_id: resolvedVersionId,
        name: normalizedScenario.name,
        description: normalizedScenario.description ?? null,
        delays: normalizedScenario.delays,
        impact: impact as unknown as Record<string, unknown>,
        created_by: null,
      });
    }

    return Response.json({ impact });
  } catch (error) {
    console.error('POST /api/whatif error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

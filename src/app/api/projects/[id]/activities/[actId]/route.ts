import { eq, and } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db/client';
import {
  projects,
  activities as activitiesTable,
} from '@/lib/db/schema';

interface RouteParams {
  params: Promise<{ id: string; actId: string }>;
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
) {
  const { id, actId } = await params;

  try {
    const body = await req.json() as Record<string, unknown>;

    // Validate the project exists
    const [project] = await db
      .select({ active_version_id: projects.active_version_id })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Allowed fields
    const allowedFields = new Set([
      'code',
      'name',
      'status',
      'planned_start',
      'planned_finish',
      'actual_start',
      'actual_finish',
      'remaining_duration',
      'percent_complete',
      'constraint_type',
      'constraint_date',
    ]);

    // Map camelCase to snake_case
    const camelToSnake: Record<string, string> = {
      plannedStart: 'planned_start',
      plannedFinish: 'planned_finish',
      actualStart: 'actual_start',
      actualFinish: 'actual_finish',
      remainingDuration: 'remaining_duration',
      percentComplete: 'percent_complete',
      constraintType: 'constraint_type',
      constraintDate: 'constraint_date',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      const dbKey = camelToSnake[key] ?? key;
      if (allowedFields.has(dbKey)) {
        updates[dbKey] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Mark as dirty
    updates.is_dirty = true;

    const [updated] = await db
      .update(activitiesTable)
      .set(updates)
      .where(
        and(
          eq(activitiesTable.id, actId),
          eq(activitiesTable.project_id, id)
        )
      )
      .returning();

    if (!updated) {
      return Response.json({ error: 'Activity not found' }, { status: 404 });
    }

    return Response.json({ activity: updated });
  } catch (err) {
    console.error('PATCH /api/projects/[id]/activities/[actId] error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

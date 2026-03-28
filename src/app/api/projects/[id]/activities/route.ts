import { eq, and } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db/client';
import {
  projects,
  activities as activitiesTable,
} from '@/lib/db/schema';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params;

  try {
    // Get active version
    const [project] = await db
      .select({ active_version_id: projects.active_version_id })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (!project || !project.active_version_id) {
      return Response.json(
        { error: 'Project not found or no active version' },
        { status: 404 }
      );
    }

    const acts = await db
      .select()
      .from(activitiesTable)
      .where(
        and(
          eq(activitiesTable.project_id, id),
          eq(activitiesTable.version_id, project.active_version_id)
        )
      );

    return Response.json({ activities: acts });
  } catch (err) {
    console.error('GET /api/projects/[id]/activities error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

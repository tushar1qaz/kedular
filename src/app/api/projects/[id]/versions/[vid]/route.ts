import { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { schedule_versions, projects } from '@/lib/db/schema';

interface RouteParams {
  params: Promise<{ id: string; vid: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id, vid } = await params;

    const [version] = await db
      .select()
      .from(schedule_versions)
      .where(
        and(
          eq(schedule_versions.id, vid),
          eq(schedule_versions.project_id, id)
        )
      )
      .limit(1);

    if (!version) {
      return Response.json({ error: 'Version not found' }, { status: 404 });
    }

    return Response.json({ version });
  } catch (error) {
    console.error('GET /api/projects/[id]/versions/[vid] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, vid } = await params;
    const body = await request.json() as { setActive?: boolean; setBaseline?: boolean };

    // Verify version belongs to project
    const [version] = await db
      .select()
      .from(schedule_versions)
      .where(
        and(
          eq(schedule_versions.id, vid),
          eq(schedule_versions.project_id, id)
        )
      )
      .limit(1);

    if (!version) {
      return Response.json({ error: 'Version not found' }, { status: 404 });
    }

    if (body.setActive) {
      // Update project active_version_id
      await db
        .update(projects)
        .set({ active_version_id: vid, updated_at: new Date() })
        .where(eq(projects.id, id));
    }

    if (body.setBaseline !== undefined) {
      await db
        .update(schedule_versions)
        .set({ is_baseline: body.setBaseline })
        .where(eq(schedule_versions.id, vid));
    }

    const [updated] = await db
      .select()
      .from(schedule_versions)
      .where(eq(schedule_versions.id, vid))
      .limit(1);

    return Response.json({ version: updated });
  } catch (error) {
    console.error('PATCH /api/projects/[id]/versions/[vid] error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

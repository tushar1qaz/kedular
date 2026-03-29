import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { schedule_versions } from '@/lib/db/schema';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const versions = await db
      .select()
      .from(schedule_versions)
      .where(eq(schedule_versions.project_id, id))
      .orderBy(schedule_versions.version_number);

    return Response.json({ versions });
  } catch (error) {
    console.error('GET /api/projects/[id]/versions error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

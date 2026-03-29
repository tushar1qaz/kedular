import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { what_if_scenarios } from '@/lib/db/schema';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET: list saved what-if scenarios for a project
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const scenarios = await db
      .select()
      .from(what_if_scenarios)
      .where(eq(what_if_scenarios.project_id, id))
      .orderBy(what_if_scenarios.created_at);

    return Response.json({ scenarios });
  } catch (error) {
    console.error('GET /api/projects/[id]/scenarios error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

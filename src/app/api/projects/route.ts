import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db/client';
import { projects, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.created_by, user.id))
      .orderBy(projects.created_at);

    return NextResponse.json({ projects: userProjects });
  } catch (error) {
    console.error('GET /api/projects error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as { name?: string; description?: string };
    const { name, description } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    // Ensure user exists in users table
    await db
      .insert(users)
      .values({ id: user.id, email: user.email ?? '' })
      .onConflictDoNothing();

    const [project] = await db
      .insert(projects)
      .values({
        name: name.trim(),
        description: description?.trim() ?? null,
        created_by: user.id,
      })
      .returning();

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error('POST /api/projects error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

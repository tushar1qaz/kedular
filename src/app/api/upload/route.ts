import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db/client';
import { schedule_versions } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!projectId) return NextResponse.json({ error: 'No projectId provided' }, { status: 400 });

    // Determine source format from extension
    const fileName = file.name;
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.') + 1);
    const formatMap: Record<string, string> = { xer: 'xer', csv: 'csv', xml: 'xml' };
    const sourceFormat = formatMap[ext] ?? 'unknown';

    // Upload file to Supabase Storage
    const storagePath = `${user.id}/${projectId}/${Date.now()}_${fileName}`;
    const bytes = await file.arrayBuffer();
    const { error: storageError } = await supabase.storage
      .from('schedules')
      .upload(storagePath, bytes, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (storageError) {
      console.error('Storage upload error:', storageError);
      return NextResponse.json({ error: 'Failed to store file: ' + storageError.message }, { status: 500 });
    }

    // Get next version number
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schedule_versions)
      .where(eq(schedule_versions.project_id, projectId));
    const versionNumber = (countResult[0]?.count ?? 0) + 1;

    // Create schedule_versions row
    const [version] = await db
      .insert(schedule_versions)
      .values({
        project_id: projectId,
        version_number: versionNumber,
        label: `Version ${versionNumber}`,
        source_format: sourceFormat,
        source_file_name: fileName,
        source_file_path: storagePath,
        uploaded_by: user.id,
        parse_health: null,
      })
      .returning();

    return NextResponse.json({
      versionId: version.id,
      versionNumber,
      filePath: storagePath,
      sourceFormat,
    });
  } catch (error) {
    console.error('POST /api/upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

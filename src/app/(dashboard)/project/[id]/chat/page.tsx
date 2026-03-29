import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { projects, schedule_versions } from '@/lib/db/schema';
import ChatPageClient from './ChatPageClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatPage({ params }: PageProps) {
  const { id } = await params;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 text-center">
        <h2 className="text-xl font-semibold text-slate-700 mb-2">Project not found</h2>
      </div>
    );
  }

  // Get active version
  let activeVersionId: string | null = project.active_version_id;
  if (!activeVersionId) {
    const [latest] = await db
      .select()
      .from(schedule_versions)
      .where(eq(schedule_versions.project_id, id))
      .orderBy(schedule_versions.uploaded_at)
      .limit(1);
    activeVersionId = latest?.id ?? null;
  }

  return (
    <ChatPageClient
      projectId={id}
      projectName={project.name}
      activeVersionId={activeVersionId}
    />
  );
}

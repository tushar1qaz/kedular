import { eq, and } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/lib/db/client';
import { projects, schedule_versions } from '@/lib/db/schema';
import VersionsClient from './VersionsClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VersionsPage({ params }: PageProps) {
  const { id } = await params;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) {
    return <div className="p-8 text-center text-slate-500">Project not found</div>;
  }

  const versions = await db
    .select()
    .from(schedule_versions)
    .where(eq(schedule_versions.project_id, id))
    .orderBy(schedule_versions.version_number);

  const serializedVersions = versions.map((v) => ({
    id: v.id,
    versionNumber: v.version_number ?? 0,
    label: v.label ?? `V${v.version_number}`,
    uploadedAt: v.uploaded_at?.toISOString() ?? null,
    totalActivities: v.total_activities ?? 0,
    healthScore: v.health_score ?? null,
    spi: v.spi ? Number(v.spi) : null,
    cpi: v.cpi ? Number(v.cpi) : null,
    isBaseline: v.is_baseline ?? false,
    dataDate: v.data_date ?? null,
    plannedFinish: v.planned_finish ?? null,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Version History</h1>
          <p className="text-slate-500 text-sm mt-1">{project.name}</p>
        </div>
        <Link
          href={`/project/${id}/import`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          Upload New Version
        </Link>
      </div>

      <VersionsClient
        projectId={id}
        versions={serializedVersions}
        activeVersionId={project.active_version_id ?? null}
      />
    </div>
  );
}

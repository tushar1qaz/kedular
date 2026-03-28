import Link from 'next/link';

interface ProjectCardProps {
  id: string;
  name: string;
  description?: string | null;
  sourceFormat?: string | null;
  createdAt: string;
  activityCount?: number | null;
}

export default function ProjectCard({
  id,
  name,
  description,
  sourceFormat,
  createdAt,
  activityCount,
}: ProjectCardProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Link href={`/project/${id}/gantt`} className="block group">
      <div className="bg-white border border-slate-200 rounded-xl p-6 hover:border-amber-300 hover:shadow-md transition-all">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h3 className="text-lg font-semibold text-slate-900 group-hover:text-amber-600 transition-colors">
            {name}
          </h3>
          {sourceFormat && (
            <span className="shrink-0 text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-md font-medium uppercase">
              {sourceFormat}
            </span>
          )}
        </div>

        {description && (
          <p className="text-slate-600 text-sm mb-4 line-clamp-2">{description}</p>
        )}

        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>Created {formatDate(createdAt)}</span>
          {activityCount != null && (
            <span>{activityCount.toLocaleString()} activities</span>
          )}
        </div>
      </div>
    </Link>
  );
}

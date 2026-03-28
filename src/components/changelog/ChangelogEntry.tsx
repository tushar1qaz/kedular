interface ChangelogEntryProps {
  date: string;
  version: string;
  title: string;
  changes: string[];
}

export default function ChangelogEntry({ date, version, title, changes }: ChangelogEntryProps) {
  const formatted = new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <article className="flex gap-8 py-10 border-b border-slate-100 last:border-0">
      <div className="w-32 shrink-0 pt-1">
        <time className="text-sm text-slate-500">{formatted}</time>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-3">
          <span className="inline-block bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1 rounded-full">
            v{version}
          </span>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
        <ul className="space-y-1.5">
          {changes.map((change, i) => (
            <li key={i} className="flex items-start gap-2 text-slate-600">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <span>{change}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

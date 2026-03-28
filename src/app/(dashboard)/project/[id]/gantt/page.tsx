interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function GanttPage({ params }: PageProps) {
  const { id } = await params;
  void id;

  return (
    <div className="flex flex-col items-center justify-center min-h-96 text-center">
      <div className="text-4xl mb-4">🚧</div>
      <h2 className="text-xl font-semibold text-slate-700 mb-2">Gantt chart coming in Stage 3</h2>
      <p className="text-slate-400 text-sm max-w-sm">
        This feature is under active development. Check back soon or follow the changelog for updates.
      </p>
    </div>
  );
}

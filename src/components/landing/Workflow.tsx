const steps = [
  {
    number: '01',
    title: 'Upload your XER or CSV',
    description:
      'Drag and drop your P6 XER export or MS Project CSV. Kedular auto-detects encoding, parses all tables, and scores parse confidence. Full, Partial, or Failed — you always know what was imported.',
  },
  {
    number: '02',
    title: 'Review the parse report',
    description:
      'See exactly what was parsed: activity count, relationship count, calendars, WBS nodes. Errors and warnings are shown with the specific row and field. Confirm before any data is saved.',
  },
  {
    number: '03',
    title: 'Analyse and edit',
    description:
      'Gantt chart, critical path highlighting, look-ahead views, burn-down charts. Edit activity dates, durations, and relationships. Every change is tracked with undo/redo support.',
  },
  {
    number: '04',
    title: 'Export back to P6 or MS Project',
    description:
      'Export as XER, CSV, or MSPDI XML. The XER round-trip only modifies the fields you changed — all original P6 data is preserved. Import back into P6 without import errors.',
  },
];

export default function Workflow() {
  return (
    <section className="py-24 bg-slate-900 relative overflow-hidden">
      <div className="absolute inset-0 blueprint-grid opacity-40" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            From upload to export in minutes
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            No setup, no integrations, no IT ticket. Upload and start working.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex gap-6 p-6 bg-slate-800/60 rounded-xl border border-slate-700 hover:border-amber-500/40 transition-colors"
            >
              <div className="text-3xl font-bold text-amber-500/40 font-serif shrink-0">{step.number}</div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-slate-400 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

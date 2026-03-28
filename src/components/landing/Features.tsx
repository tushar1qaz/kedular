const features = [
  {
    icon: '📋',
    title: 'XER & CSV Parsing',
    description:
      'Full P6 XER parser supporting versions 15.2–19.12. Handles encoding issues, missing tables, and partial files with graceful degradation.',
  },
  {
    icon: '🔷',
    title: 'CPM Engine',
    description:
      'Forward and backward pass critical path calculation. Identifies the longest path, total float, and free float for every activity.',
  },
  {
    icon: '🤖',
    title: 'AI Schedule Agent',
    description:
      'Chat with your schedule using Claude AI. Ask about critical path, slippage risks, resource conflicts, and get actionable recommendations.',
  },
  {
    icon: '🔀',
    title: 'What-if Analysis',
    description:
      'Simulate changes before committing. See the downstream impact of delays, resource changes, and scope additions instantly.',
  },
  {
    icon: '🗂️',
    title: 'Version Control',
    description:
      'Track every upload as a version. Compare any two versions side-by-side with an automatic diff showing what changed.',
  },
  {
    icon: '📤',
    title: 'XER Export',
    description:
      'Export clean, valid XER files back to Primavera P6. Full round-trip fidelity with all your edits and analysis preserved.',
  },
];

export default function Features() {
  return (
    <section id="features" className="bg-slate-950 py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            Everything your schedule needs
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            From raw XER upload to AI-powered analysis — all in one workbench built for
            construction and engineering project controls.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-amber-500/30 transition-colors group"
            >
              <div className="text-3xl mb-4">{feature.icon}</div>
              <h3 className="text-white font-semibold text-lg mb-2 group-hover:text-amber-400 transition-colors">
                {feature.title}
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

import Link from 'next/link';

export default function FinalCta() {
  return (
    <section className="py-24 bg-slate-900 relative overflow-hidden">
      <div className="absolute inset-0 blueprint-grid opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-transparent to-amber-500/5" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-5xl font-bold text-white mb-6">
          Ready to stop wrestling with XER files?
        </h2>
        <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
          Upload your first XER in 30 seconds. No credit card, no setup, no IT ticket.
        </p>
        <Link
          href="/signup"
          className="inline-block bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-10 py-5 rounded-xl text-xl transition-all shadow-2xl shadow-amber-500/20 hover:shadow-amber-400/30"
        >
          Get started free →
        </Link>
        <p className="mt-6 text-slate-500 text-sm">
          Free tier · No credit card · Cancel anytime
        </p>
      </div>
    </section>
  );
}

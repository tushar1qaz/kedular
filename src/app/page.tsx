import type { Metadata } from 'next';
import LandingNav from '@/components/landing/LandingNav';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import Pricing from '@/components/landing/Pricing';
import FinalCta from '@/components/landing/FinalCta';
import Footer from '@/components/shared/Footer';

export const metadata: Metadata = {
  title: 'Kedular — The Intelligent Schedule Workbench',
  description:
    'Upload P6 XER or MS Project files. Get instant look-aheads, burn-down charts, slippage analysis, and an AI schedule agent. Edit, validate, export back.',
  openGraph: {
    title: 'Kedular — The Intelligent Schedule Workbench',
    description:
      'Upload P6 XER or MS Project files. Get instant look-aheads, burn-down charts, slippage analysis, and an AI schedule agent. Edit, validate, export back.',
    images: ['/og-image.png'],
  },
};

export default function HomePage() {
  return (
    <>
      <LandingNav />
      <main>
        <Hero />
        <Features />
        {/* Workflow section */}
        <section className="bg-slate-900 py-24 px-6">
          <div className="max-w-5xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-4">How it works</h2>
            <p className="text-slate-400 text-lg mb-16 max-w-2xl mx-auto">
              From raw schedule file to actionable insights in three steps.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              {[
                {
                  step: '01',
                  title: 'Upload your file',
                  desc: 'Drag and drop a P6 XER or CSV file. Kedular parses it instantly, handling encoding issues and missing tables gracefully.',
                },
                {
                  step: '02',
                  title: 'Explore & analyse',
                  desc: 'View the Gantt chart, run CPM, check the look-ahead, or chat with the AI agent about your critical path and risks.',
                },
                {
                  step: '03',
                  title: 'Edit & export',
                  desc: 'Make edits, run what-if scenarios, then export a clean XER back to Primavera P6 — or share a PDF report.',
                },
              ].map((step) => (
                <div key={step.step} className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center mb-4">
                    <span className="text-amber-400 font-bold font-mono text-sm">{step.step}</span>
                  </div>
                  <h3 className="text-white font-semibold text-lg mb-2">{step.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

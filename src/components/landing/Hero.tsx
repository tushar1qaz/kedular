'use client';

import Link from 'next/link';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-900">
      {/* Gantt animation keyframe */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes ganttSlide {
          from { transform: scaleX(0); transform-origin: left; }
          to { transform: scaleX(1); transform-origin: left; }
        }
      `}} />
      {/* Blueprint grid background */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(rgba(59, 130, 246, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.5) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Radial gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 via-transparent to-slate-900/80" />

      {/* Animated Gantt bars */}
      <div className="absolute inset-0 flex items-end pb-32 px-8 pointer-events-none overflow-hidden opacity-20">
        <div className="w-full space-y-3">
          {[
            { w: '70%', delay: '0s', color: 'bg-amber-400' },
            { w: '50%', delay: '0.2s', color: 'bg-blue-400' },
            { w: '85%', delay: '0.4s', color: 'bg-amber-400' },
            { w: '40%', delay: '0.6s', color: 'bg-red-400' },
            { w: '60%', delay: '0.8s', color: 'bg-blue-400' },
          ].map((bar, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-24 text-xs text-slate-400 font-mono text-right shrink-0">
                ACT-{String(i + 1).padStart(4, '0')}
              </div>
              <div className="flex-1 h-5 bg-slate-800 rounded relative overflow-hidden">
                <div
                  className={`absolute left-0 top-0 h-full ${bar.color} rounded opacity-80`}
                  style={{
                    width: bar.w,
                    animation: `ganttSlide 2s ease-out ${bar.delay} both`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>


      {/* Content */}
      <div className="relative z-10 text-center max-w-4xl mx-auto px-6 pt-20">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-amber-400 text-sm font-medium mb-8">
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
          Now in beta — free for early adopters
        </div>

        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
          The Intelligent
          <br />
          <span className="text-amber-400 font-[var(--font-instrument-serif)] italic">
            Schedule Workbench
          </span>
        </h1>

        <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
          Upload P6 XER or MS Project files. Get instant look-aheads, burn-down charts,
          slippage analysis, and an AI schedule agent. Edit, validate, export back.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signup"
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-lg px-8 py-4 rounded-lg transition-colors shadow-lg shadow-amber-500/25"
          >
            Start for free
          </Link>
          <Link
            href="#features"
            className="border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white font-semibold text-lg px-8 py-4 rounded-lg transition-colors"
          >
            See how it works
          </Link>
        </div>

        <p className="text-slate-500 text-sm mt-6">No credit card required · 1 project free forever</p>
      </div>
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-slate-900/95 backdrop-blur border-b border-amber-500/20 shadow-lg' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="4" width="14" height="2" rx="1" fill="white" />
                <rect x="1" y="8" width="9" height="2" rx="1" fill="white" />
                <rect x="1" y="12" width="11" height="2" rx="1" fill="white" />
              </svg>
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">Kedular</span>
          </Link>

          <div className="hidden sm:flex items-center gap-6">
            <Link href="/changelog" className="text-slate-300 hover:text-white text-sm transition-colors">
              Changelog
            </Link>
            <Link href="/login" className="text-slate-300 hover:text-white text-sm transition-colors">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-semibold px-4 py-2 rounded-md transition-colors"
            >
              Start free
            </Link>
          </div>

          <div className="sm:hidden">
            <Link
              href="/signup"
              className="bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-semibold px-3 py-2 rounded-md transition-colors"
            >
              Start free
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

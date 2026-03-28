import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-slate-950 border-t border-slate-800 py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-amber-500 rounded flex items-center justify-center">
                <span className="text-slate-900 font-bold text-xs">K</span>
              </div>
              <span className="text-white font-semibold">Kedular</span>
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
              The intelligent schedule workbench for construction and engineering project controls.
            </p>
          </div>

          <div>
            <h4 className="text-white text-sm font-semibold mb-4">Product</h4>
            <ul className="space-y-2 text-slate-400 text-sm">
              <li><Link href="/#features" className="hover:text-white transition-colors">Features</Link></li>
              <li><Link href="/#pricing" className="hover:text-white transition-colors">Pricing</Link></li>
              <li><Link href="/changelog" className="hover:text-white transition-colors">Changelog</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white text-sm font-semibold mb-4">Account</h4>
            <ul className="space-y-2 text-slate-400 text-sm">
              <li><Link href="/login" className="hover:text-white transition-colors">Sign in</Link></li>
              <li><Link href="/signup" className="hover:text-white transition-colors">Sign up</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-slate-500 text-sm">
            © {new Date().getFullYear()} Kedular. All rights reserved.
          </p>
          <div className="flex gap-6 text-slate-500 text-sm">
            <Link href="/privacy" className="hover:text-slate-300 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-300 transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

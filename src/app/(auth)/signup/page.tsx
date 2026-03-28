'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
      setConfirmSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google signup failed');
      setLoading(false);
    }
  };

  if (confirmSent) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl text-center">
        <div className="text-5xl mb-4">📬</div>
        <h2 className="text-2xl font-bold text-white mb-3">Check your inbox</h2>
        <p className="text-slate-400 text-sm">
          We sent a confirmation link to <strong className="text-white">{email}</strong>.
          Click it to activate your account and get started.
        </p>
        <Link
          href="/login"
          className="inline-block mt-6 text-amber-400 hover:text-amber-300 text-sm font-medium"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
      {/* Logo */}
      <div className="flex items-center justify-center mb-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center">
            <span className="text-slate-900 font-bold text-sm">K</span>
          </div>
          <span className="text-white font-semibold text-lg">Kedular</span>
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-white text-center mb-2">Create your account</h1>
      <p className="text-slate-400 text-sm text-center mb-8">
        Free forever · No credit card required
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-6">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Google SSO */}
      <button
        onClick={handleGoogleSignup}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-900 font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 mb-6"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Continue with Google
      </button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-700" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-slate-900 px-3 text-slate-500">or</span>
        </div>
      </div>

      <form onSubmit={handleEmailSignup} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Full name
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Smith"
            required
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Email address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            required
            minLength={8}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-slate-400 text-sm mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-amber-400 hover:text-amber-300 font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}

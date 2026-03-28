'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AccountSettingsPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setEmail(data.user.email ?? '');
        setFullName(data.user.user_metadata?.full_name ?? '');
      }
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName },
      });
      if (error) throw error;
      setMessage('Account updated successfully.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update account');
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-8">Account Settings</h1>

      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">Profile</h2>

        {message && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <p className="text-green-700 text-sm">{message}</p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Email address
            </label>
            <input
              type="email"
              value={email}
              readOnly
              className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2.5 text-slate-500 text-sm cursor-not-allowed"
            />
            <p className="text-slate-400 text-xs mt-1">Email cannot be changed here.</p>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="font-semibold text-slate-800 mb-2">Sign out</h2>
        <p className="text-slate-500 text-sm mb-4">
          Sign out of your Kedular account on this device.
        </p>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium px-4 py-2 rounded-lg transition-colors text-sm disabled:opacity-50"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}

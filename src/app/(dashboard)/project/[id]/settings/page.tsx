'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectSettingsPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || undefined, description: description || undefined }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaveMessage('Settings saved successfully.');
    } catch {
      setSaveMessage('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      router.push('/dashboard');
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-8">Project Settings</h1>

      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-slate-800 mb-4">General</h2>

        {saveMessage && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <p className="text-green-700 text-sm">{saveMessage}</p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Project name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional project description"
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
            />
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

      {/* Danger zone */}
      <div className="bg-white border border-red-200 rounded-xl p-6">
        <h2 className="font-semibold text-red-700 mb-2">Danger zone</h2>
        <p className="text-slate-500 text-sm mb-4">
          Deleting a project permanently removes all versions, activities, and associated data.
          This action cannot be undone.
        </p>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="border border-red-300 text-red-600 hover:bg-red-50 font-medium px-4 py-2 rounded-lg transition-colors text-sm"
          >
            Delete project
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-red-600 text-sm font-medium">Are you sure?</p>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="border border-slate-300 text-slate-600 font-medium px-4 py-2 rounded-lg transition-colors text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

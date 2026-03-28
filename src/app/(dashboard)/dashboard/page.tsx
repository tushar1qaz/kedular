'use client';

import { useState, useEffect } from 'react';
import ProjectCard from '@/components/shared/ProjectCard';

interface Project {
  id: string;
  name: string;
  description?: string | null;
  source_format?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  total_activities?: number | null;
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch {
      // ignore for now
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName, description: newProjectDesc }),
      });
      if (!res.ok) throw new Error('Failed to create project');
      const data = await res.json();
      setProjects((prev) => [data.project, ...prev]);
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectDesc('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage your schedule projects
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-4 py-2.5 rounded-lg transition-colors text-sm"
        >
          + New Project
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-24 bg-white border border-slate-200 rounded-xl">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No projects yet</h3>
          <p className="text-slate-500 text-sm mb-6">
            Create your first project to get started with schedule analysis.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm"
          >
            Create your first project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              id={project.id}
              name={project.name}
              description={project.description}
              createdAt={project.created_at || project.updated_at || ""}
              activityCount={project.total_activities}
              sourceFormat={project.source_format}
            />
          ))}
        </div>
      )}

      {/* Create project modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-slate-900 mb-6">New Project</h2>

            {createError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-600 text-sm">{createError}</p>
              </div>
            )}

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Project name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Terminal 4 Extension"
                  required
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Description
                </label>
                <textarea
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewProjectName('');
                    setNewProjectDesc('');
                    setCreateError(null);
                  }}
                  className="flex-1 border border-slate-300 text-slate-700 font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newProjectName.trim()}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold py-2.5 rounded-lg transition-colors text-sm disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

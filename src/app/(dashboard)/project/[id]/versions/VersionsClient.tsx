'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface VersionRow {
  id: string;
  versionNumber: number;
  label: string;
  uploadedAt: string | null;
  totalActivities: number;
  healthScore: number | null;
  spi: number | null;
  cpi: number | null;
  isBaseline: boolean;
  dataDate: string | null;
  plannedFinish: string | null;
}

interface Props {
  projectId: string;
  versions: VersionRow[];
  activeVersionId: string | null;
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function healthColor(score: number | null): string {
  if (score === null) return 'text-slate-400';
  if (score >= 75) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

function spiCpiColor(v: number | null): string {
  if (v === null) return 'text-slate-400';
  if (v >= 1) return 'text-green-600';
  if (v >= 0.9) return 'text-yellow-600';
  return 'text-red-600';
}

export default function VersionsClient({ projectId, versions, activeVersionId }: Props) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [compareBase, setCompareBase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSetActive(versionId: string) {
    setLoadingId(versionId);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/versions/${versionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setActive: true }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setError(body.error ?? 'Failed to set active version');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setLoadingId(null);
    }
  }

  function handleCompare(versionId: string) {
    if (!compareBase) {
      setCompareBase(versionId);
      return;
    }
    if (compareBase === versionId) {
      setCompareBase(null);
      return;
    }
    // Navigate to compare page
    router.push(`/project/${projectId}/versions/compare?base=${compareBase}&compare=${versionId}`);
    setCompareBase(null);
  }

  if (versions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="text-slate-400 text-sm">No versions uploaded yet.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {compareBase && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800 flex items-center justify-between">
          <span>Base version selected. Now click &quot;Compare&quot; on another version.</span>
          <button
            onClick={() => setCompareBase(null)}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Version</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Label</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Uploaded</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Activities</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Health</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">SPI</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">CPI</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {versions.map((v) => {
                const isActive = v.id === activeVersionId;
                const isCompareBase = v.id === compareBase;
                return (
                  <tr
                    key={v.id}
                    className={`${isActive ? 'bg-blue-50' : ''} ${isCompareBase ? 'bg-amber-50' : ''} hover:bg-slate-50 transition-colors`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-600">V{v.versionNumber}</span>
                        {isActive && (
                          <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded font-medium">Active</span>
                        )}
                        {v.isBaseline && (
                          <span className="bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded font-medium">Baseline</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-800">{v.label}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatDate(v.uploadedAt)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{v.totalActivities.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${healthColor(v.healthScore)}`}>
                      {v.healthScore !== null ? v.healthScore : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${spiCpiColor(v.spi)}`}>
                      {v.spi !== null ? v.spi.toFixed(2) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${spiCpiColor(v.cpi)}`}>
                      {v.cpi !== null ? v.cpi.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!isActive && (
                          <button
                            onClick={() => handleSetActive(v.id)}
                            disabled={loadingId === v.id}
                            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors font-medium"
                          >
                            {loadingId === v.id ? 'Setting...' : 'Set Active'}
                          </button>
                        )}
                        <button
                          onClick={() => handleCompare(v.id)}
                          className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium ${
                            isCompareBase
                              ? 'bg-amber-500 text-white hover:bg-amber-400'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {isCompareBase ? 'Base (click another)' : 'Compare'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

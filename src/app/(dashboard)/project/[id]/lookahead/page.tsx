'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface LookaheadActivityRow {
  code: string;
  name: string;
  wbsCode: string;
  plannedStart: string | null;
  plannedFinish: string | null;
  remainingDuration: number;
  totalFloat: number;
  status: string;
  percentComplete: number;
  isCritical: boolean;
  windowStatus: 'starting' | 'in_progress' | 'finishing' | 'overdue';
}

const WEEK_OPTIONS = [1, 2, 3, 4, 6] as const;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function windowStatusBadge(status: LookaheadActivityRow['windowStatus']) {
  const map: Record<string, string> = {
    overdue: 'bg-red-100 text-red-700 border border-red-200',
    starting: 'bg-amber-100 text-amber-700 border border-amber-200',
    in_progress: 'bg-blue-100 text-blue-700 border border-blue-200',
    finishing: 'bg-green-100 text-green-700 border border-green-200',
  };
  const labels: Record<string, string> = {
    overdue: 'Overdue',
    starting: 'Starting',
    in_progress: 'In Progress',
    finishing: 'Finishing',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function LookaheadPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [weeks, setWeeks] = useState<number>(2);
  const [wbsFilter, setWbsFilter] = useState<string>('');
  const [activities, setActivities] = useState<LookaheadActivityRow[]>([]);
  const [allWbsCodes, setAllWbsCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLookahead() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ weeks: String(weeks) });
        if (wbsFilter) params.set('wbs', wbsFilter);
        const res = await fetch(`/api/projects/${projectId}/lookahead?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json() as { error?: string };
          setError(body.error ?? 'Failed to load look-ahead data');
          setActivities([]);
          return;
        }
        const data = await res.json() as { activities: LookaheadActivityRow[]; wbsCodes: string[] };
        setActivities(data.activities ?? []);
        setAllWbsCodes(data.wbsCodes ?? []);
      } catch {
        setError('Network error');
        setActivities([]);
      } finally {
        setLoading(false);
      }
    }

    void fetchLookahead();
  }, [projectId, weeks, wbsFilter]);

  function handleExportPdf() {
    console.log('Export PDF stub — full PDF export coming in Stage 8', { projectId, weeks, wbsFilter, activities });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Look-Ahead</h1>
          <p className="text-slate-500 text-sm mt-1">Activities scheduled in the upcoming window</p>
        </div>
        <button
          onClick={handleExportPdf}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          Export PDF
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">Window:</span>
          <div className="flex gap-1">
            {WEEK_OPTIONS.map((w) => (
              <button
                key={w}
                onClick={() => setWeeks(w)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  weeks === w
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {w}w
              </button>
            ))}
          </div>
        </div>

        {allWbsCodes.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">WBS:</span>
            <select
              value={wbsFilter}
              onChange={(e) => setWbsFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 bg-white"
            >
              <option value="">All</option>
              {allWbsCodes.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Table */}
      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error}</div>
      ) : loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400">Loading...</div>
      ) : activities.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
          No activities found in the {weeks}-week look-ahead window.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Code</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">WBS</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Start</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Finish</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Rem. Dur.</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Float</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activities.map((act) => {
                  const rowClass =
                    act.windowStatus === 'overdue'
                      ? 'bg-red-50'
                      : act.windowStatus === 'starting'
                      ? 'bg-amber-50'
                      : '';
                  return (
                    <tr key={act.code} className={`${rowClass} hover:bg-slate-50 transition-colors`}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{act.code}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {act.isCritical && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" title="Critical" />
                          )}
                          <span className="text-slate-800 text-sm">{act.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{act.wbsCode || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{formatDate(act.plannedStart)}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{formatDate(act.plannedFinish)}</td>
                      <td className="px-4 py-3 text-right text-slate-600 text-xs">{act.remainingDuration.toFixed(1)}d</td>
                      <td className="px-4 py-3 text-right text-xs">
                        <span className={act.totalFloat < 0 ? 'text-red-600 font-medium' : 'text-slate-600'}>
                          {act.totalFloat.toFixed(1)}d
                        </span>
                      </td>
                      <td className="px-4 py-3">{windowStatusBadge(act.windowStatus)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            {activities.length} activities in {weeks}-week window
          </div>
        </div>
      )}
    </div>
  );
}

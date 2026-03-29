'use client';

import { useState, useCallback, useMemo } from 'react';
import type { WhatIfImpact, WhatIfScenario, ActivityDelay } from '@/lib/engine/whatif';
import type { CpmActivityResult } from '@/lib/engine/cpm';

interface ActivityInfo {
  code: string;
  name: string;
  isCritical: boolean;
  totalFloat: number;
  earlyStart: Date;
  earlyFinish: Date;
}

interface SavedScenario {
  id: string;
  name: string;
  description?: string | null;
  delays: ActivityDelay[];
  impact?: WhatIfImpact | null;
  created_at?: string | null;
}

interface WhatIfPageClientProps {
  projectId: string;
  versionId: string;
  activities: ActivityInfo[];
  originalFinish: Date;
  savedScenarios: SavedScenario[];
}

function formatDate(d: Date | null | string | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function slipColor(slipDays: number): string {
  if (slipDays > 5) return 'text-red-600 font-semibold';
  if (slipDays > 0) return 'text-orange-500';
  if (slipDays < 0) return 'text-green-600';
  return 'text-slate-400';
}

export default function WhatIfPageClient({
  projectId,
  versionId,
  activities,
  originalFinish,
  savedScenarios: initialSavedScenarios,
}: WhatIfPageClientProps) {
  const [scenarioName, setScenarioName] = useState('');
  const [scenarioDesc, setScenarioDesc] = useState('');
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<WhatIfImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(initialSavedScenarios);
  const [compareIds, setCompareIds] = useState<[string | null, string | null]>([null, null]);
  const [activeTab, setActiveTab] = useState<'builder' | 'compare'>('builder');

  const filteredActivities = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return activities;
    return activities.filter(
      (a) => a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term)
    );
  }, [activities, searchTerm]);

  const selectedCodes = useMemo(
    () => Object.entries(delays).filter(([, v]) => v !== 0).map(([k]) => k),
    [delays]
  );

  const handleDelayChange = useCallback((code: string, value: string) => {
    const num = parseInt(value, 10);
    setDelays((prev) => {
      if (isNaN(num) || num === 0) {
        const next = { ...prev };
        delete next[code];
        return next;
      }
      return { ...prev, [code]: num };
    });
  }, []);

  const buildScenario = useCallback((): WhatIfScenario => ({
    id: crypto.randomUUID(),
    name: scenarioName || 'Unnamed Scenario',
    description: scenarioDesc || undefined,
    delays: Object.entries(delays)
      .filter(([, v]) => v !== 0)
      .map(([activityCode, delayDays]) => ({ activityCode, delayDays })),
    createdAt: new Date(),
  }), [scenarioName, scenarioDesc, delays]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const scenario = buildScenario();
      const res = await fetch('/api/whatif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, versionId, scenario, save: false }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Analysis failed');
      }
      const data = await res.json();
      setImpact(data.impact);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRunning(false);
    }
  }, [buildScenario, projectId, versionId]);

  const handleSave = useCallback(async () => {
    if (!impact) return;
    setSaving(true);
    setError(null);
    try {
      const scenario = buildScenario();
      const res = await fetch('/api/whatif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, versionId, scenario, save: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Save failed');
      }
      // Reload saved scenarios
      const listRes = await fetch(`/api/projects/${projectId}/scenarios`);
      if (listRes.ok) {
        const listData = await listRes.json();
        setSavedScenarios(listData.scenarios ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }, [impact, buildScenario, projectId, versionId]);

  const handleLoadScenario = useCallback((s: SavedScenario) => {
    setScenarioName(s.name);
    setScenarioDesc(s.description ?? '');
    const newDelays: Record<string, number> = {};
    for (const d of s.delays) {
      newDelays[d.activityCode] = d.delayDays;
    }
    setDelays(newDelays);
    if (s.impact) setImpact(s.impact);
    setActiveTab('builder');
  }, []);

  const compareScenarios = useMemo(() => {
    return compareIds.map((id) => savedScenarios.find((s) => s.id === id) ?? null);
  }, [compareIds, savedScenarios]);

  const finishDeltaColor =
    !impact ? 'text-slate-500'
    : impact.finishDeltaDays > 0 ? 'text-red-600'
    : impact.finishDeltaDays < 0 ? 'text-green-600'
    : 'text-slate-500';

  return (
    <div className="flex h-full gap-0 divide-x divide-slate-200">
      {/* Left panel */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-slate-50 overflow-y-auto">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h2 className="font-semibold text-slate-800 mb-3">Scenario Builder</h2>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Scenario name"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              placeholder="Description (optional)"
              value={scenarioDesc}
              onChange={(e) => setScenarioDesc(e.target.value)}
              rows={2}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-4 border-b border-slate-200 bg-white">
          <input
            type="text"
            placeholder="Search activities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredActivities.map((act) => {
            const delay = delays[act.code] ?? '';
            return (
              <div
                key={act.code}
                className="px-4 py-2 border-b border-slate-100 hover:bg-slate-100 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-xs text-slate-500">{act.code}</span>
                    {act.isCritical && (
                      <span className="ml-1 text-[10px] bg-red-100 text-red-700 rounded px-1">
                        CRIT
                      </span>
                    )}
                    <div className="text-slate-700 truncate">{act.name}</div>
                    <div className="text-[11px] text-slate-400">Float: {act.totalFloat}d</div>
                  </div>
                  <input
                    type="number"
                    value={delay}
                    onChange={(e) => handleDelayChange(act.code, e.target.value)}
                    placeholder="0"
                    className="w-16 border border-slate-300 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-200 bg-white space-y-2">
          {selectedCodes.length > 0 && (
            <div className="text-xs text-slate-500">
              {selectedCodes.length} activit{selectedCodes.length === 1 ? 'y' : 'ies'} modified
            </div>
          )}
          <button
            onClick={handleRun}
            disabled={running || selectedCodes.length === 0}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {running ? 'Running...' : 'Run Analysis'}
          </button>
          {impact && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Scenario'}
            </button>
          )}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </div>
          )}
        </div>

        {/* Saved scenarios */}
        {savedScenarios.length > 0 && (
          <div className="border-t border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Saved Scenarios
            </div>
            <div className="space-y-1">
              {savedScenarios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleLoadScenario(s)}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                >
                  <div className="font-medium text-slate-700 truncate">{s.name}</div>
                  {s.impact && (
                    <div className={`text-xs ${s.impact.finishDeltaDays > 0 ? 'text-red-500' : s.impact.finishDeltaDays < 0 ? 'text-green-500' : 'text-slate-400'}`}>
                      {s.impact.finishDeltaDays > 0 ? '+' : ''}{s.impact.finishDeltaDays}d finish
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tabs */}
        {savedScenarios.length >= 2 && (
          <div className="flex border-b border-slate-200 bg-white px-4">
            <button
              onClick={() => setActiveTab('builder')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'builder'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Impact View
            </button>
            <button
              onClick={() => setActiveTab('compare')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'compare'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Compare Scenarios
            </button>
          </div>
        )}

        {activeTab === 'compare' && savedScenarios.length >= 2 ? (
          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Compare Scenarios</h3>
            <div className="flex gap-4 mb-6">
              {([0, 1] as const).map((idx) => (
                <div key={idx} className="flex-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    Scenario {idx + 1}
                  </label>
                  <select
                    value={compareIds[idx] ?? ''}
                    onChange={(e) => {
                      const newIds: [string | null, string | null] = [...compareIds];
                      newIds[idx] = e.target.value || null;
                      setCompareIds(newIds);
                    }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select scenario...</option>
                    {savedScenarios.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {compareScenarios[0] && compareScenarios[1] && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">Metric</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">
                        {compareScenarios[0].name}
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">
                        {compareScenarios[1].name}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {['finishDeltaDays', 'activitiesAffected'].map((key) => {
                      const val0 = compareScenarios[0]?.impact?.[key as keyof WhatIfImpact];
                      const val1 = compareScenarios[1]?.impact?.[key as keyof WhatIfImpact];
                      const label = key === 'finishDeltaDays' ? 'Finish Delta (days)' : 'Activities Affected';
                      return (
                        <tr key={key} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-600">{label}</td>
                          <td className={`px-4 py-3 text-right ${key === 'finishDeltaDays' && Number(val0) > 0 ? 'text-red-600' : ''}`}>
                            {val0 != null ? (key === 'finishDeltaDays' && Number(val0) > 0 ? '+' : '') + String(val0) : '—'}
                          </td>
                          <td className={`px-4 py-3 text-right ${key === 'finishDeltaDays' && Number(val1) > 0 ? 'text-red-600' : ''}`}>
                            {val1 != null ? (key === 'finishDeltaDays' && Number(val1) > 0 ? '+' : '') + String(val1) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">New Critical Activities</td>
                      <td className="px-4 py-3 text-right">
                        {compareScenarios[0]?.impact?.newCriticalActivities?.length ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {compareScenarios[1]?.impact?.newCriticalActivities?.length ?? '—'}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">Milestones at Risk</td>
                      <td className="px-4 py-3 text-right">
                        {compareScenarios[0]?.impact?.milestonesAtRisk?.length ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {compareScenarios[1]?.impact?.milestonesAtRisk?.length ?? '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            {!impact ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                <div className="text-5xl mb-4">📊</div>
                <div className="text-lg font-medium text-slate-600 mb-2">No analysis yet</div>
                <div className="text-sm max-w-sm">
                  Select activities on the left, enter delay values (positive to delay, negative to accelerate), then click Run Analysis.
                </div>
              </div>
            ) : (
              <div className="space-y-6 max-w-4xl">
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Original Finish
                    </div>
                    <div className="text-sm font-semibold text-slate-800">
                      {formatDate(impact.originalFinish)}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Scenario Finish
                    </div>
                    <div className={`text-sm font-semibold ${finishDeltaColor}`}>
                      {formatDate(impact.scenarioFinish)}
                    </div>
                  </div>
                  <div className={`bg-white rounded-xl border p-4 text-center ${impact.finishDeltaDays > 0 ? 'border-red-200 bg-red-50' : impact.finishDeltaDays < 0 ? 'border-green-200 bg-green-50' : 'border-slate-200'}`}>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Finish Delta
                    </div>
                    <div className={`text-2xl font-bold ${finishDeltaColor}`}>
                      {impact.finishDeltaDays > 0 ? '+' : ''}{impact.finishDeltaDays}d
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Activities Affected
                    </div>
                    <div className="text-2xl font-bold text-slate-800">
                      {impact.activitiesAffected}
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      New Critical Activities
                    </div>
                    {impact.newCriticalActivities.length === 0 ? (
                      <div className="text-slate-400 text-sm">None</div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {impact.newCriticalActivities.map((code) => (
                          <span key={code} className="text-xs bg-red-100 text-red-700 rounded px-2 py-0.5 font-mono">
                            {code}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      No Longer Critical
                    </div>
                    {impact.noLongerCritical.length === 0 ? (
                      <div className="text-slate-400 text-sm">None</div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {impact.noLongerCritical.map((code) => (
                          <span key={code} className="text-xs bg-green-100 text-green-700 rounded px-2 py-0.5 font-mono">
                            {code}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Milestones at Risk
                    </div>
                    {impact.milestonesAtRisk.length === 0 ? (
                      <div className="text-slate-400 text-sm">None</div>
                    ) : (
                      <div className="space-y-1">
                        {impact.milestonesAtRisk.map((m) => (
                          <div key={m.code} className="text-xs text-red-700">
                            <span className="font-mono">{m.code}</span>: +{m.slipDays}d slip
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Activity impact table */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 text-sm">Activity Impacts</h3>
                    <span className="text-xs text-slate-400">Sorted by slip severity</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Code</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Name</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Orig Finish</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Scenario Finish</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Slip</th>
                          <th className="text-center px-4 py-2.5 font-semibold text-slate-600 text-xs uppercase tracking-wide">Critical</th>
                        </tr>
                      </thead>
                      <tbody>
                        {impact.activityImpacts.filter((a) => a.slipDays !== 0).map((act) => (
                          <tr key={act.code} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{act.code}</td>
                            <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate">{act.name}</td>
                            <td className="px-4 py-2.5 text-right text-slate-600">{formatDate(act.originalFinish)}</td>
                            <td className="px-4 py-2.5 text-right text-slate-600">{formatDate(act.scenarioFinish)}</td>
                            <td className={`px-4 py-2.5 text-right font-semibold ${slipColor(act.slipDays)}`}>
                              {act.slipDays > 0 ? '+' : ''}{act.slipDays}d
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {act.isCritical ? (
                                <span className="inline-block text-[10px] bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-semibold">
                                  CRIT
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {impact.activityImpacts.filter((a) => a.slipDays !== 0).length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                              No activities were affected by this scenario.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Gantt overlay note */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
                  <span className="font-medium text-slate-700">Gantt overlay: </span>
                  Gantt comparison is available on the Gantt page. The activities above show the before/after date shifts for this scenario.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

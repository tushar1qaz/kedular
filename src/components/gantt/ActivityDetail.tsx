'use client';

import { useState } from 'react';
import type { CpmActivityResult } from '@/lib/engine/cpm';

interface Predecessor {
  id: string;
  code: string;
  name: string;
  type: string;
  lagDays: number;
}

interface Successor {
  id: string;
  code: string;
  name: string;
  type: string;
  lagDays: number;
}

export interface ActivityDetailData {
  id: string;
  code: string;
  name: string;
  status: string;
  plannedStart: string | null;
  plannedFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
  remainingDuration: number;
  percentComplete: number;
  wbsCode: string;
  calendarId: string;
  predecessors: Predecessor[];
  successors: Successor[];
}

interface ActivityDetailProps {
  activity: ActivityDetailData;
  cpmResult: CpmActivityResult | null;
  onSave: (activityId: string, changes: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function ActivityDetail({
  activity,
  cpmResult,
  onSave,
  onClose,
}: ActivityDetailProps) {
  const [formData, setFormData] = useState({
    code: activity.code,
    name: activity.name,
    status: activity.status,
    plannedStart: activity.plannedStart ?? '',
    plannedFinish: activity.plannedFinish ?? '',
    actualStart: activity.actualStart ?? '',
    actualFinish: activity.actualFinish ?? '',
    remainingDuration: activity.remainingDuration,
    percentComplete: activity.percentComplete,
  });
  const [dirty, setDirty] = useState(false);

  const showActualDates =
    formData.status === 'in_progress' || formData.status === 'complete';

  function handleChange(
    field: string,
    value: string | number
  ) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  }

  function handleSave() {
    const changes: Record<string, unknown> = {};
    if (formData.code !== activity.code) changes.code = formData.code;
    if (formData.name !== activity.name) changes.name = formData.name;
    if (formData.status !== activity.status) changes.status = formData.status;
    if (formData.plannedStart !== (activity.plannedStart ?? ''))
      changes.plannedStart = formData.plannedStart || null;
    if (formData.plannedFinish !== (activity.plannedFinish ?? ''))
      changes.plannedFinish = formData.plannedFinish || null;
    if (formData.actualStart !== (activity.actualStart ?? ''))
      changes.actualStart = formData.actualStart || null;
    if (formData.actualFinish !== (activity.actualFinish ?? ''))
      changes.actualFinish = formData.actualFinish || null;
    if (formData.remainingDuration !== activity.remainingDuration)
      changes.remainingDuration = formData.remainingDuration;
    if (formData.percentComplete !== activity.percentComplete)
      changes.percentComplete = formData.percentComplete;

    if (Object.keys(changes).length > 0) {
      onSave(activity.id, changes);
    }
    setDirty(false);
    onClose();
  }

  function handleCancel() {
    setFormData({
      code: activity.code,
      name: activity.name,
      status: activity.status,
      plannedStart: activity.plannedStart ?? '',
      plannedFinish: activity.plannedFinish ?? '',
      actualStart: activity.actualStart ?? '',
      actualFinish: activity.actualFinish ?? '',
      remainingDuration: activity.remainingDuration,
      percentComplete: activity.percentComplete,
    });
    setDirty(false);
    onClose();
  }

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-slate-200 shadow-xl z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
        <h3 className="text-sm font-semibold text-slate-800">Activity Detail</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 text-lg leading-none"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Code + Name */}
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Code
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => handleChange('code', e.target.value)}
              className="mt-1 block w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="mt-1 block w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Status
          </label>
          <select
            value={formData.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className="mt-1 block w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="complete">Complete</option>
          </select>
        </div>

        {/* Planned dates */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Planned Start
            </label>
            <input
              type="date"
              value={formData.plannedStart}
              onChange={(e) => handleChange('plannedStart', e.target.value)}
              className="mt-1 block w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Planned Finish
            </label>
            <input
              type="date"
              value={formData.plannedFinish}
              onChange={(e) => handleChange('plannedFinish', e.target.value)}
              className="mt-1 block w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Actual dates (only if in_progress or complete) */}
        {showActualDates && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Actual Start
              </label>
              <input
                type="date"
                value={formData.actualStart}
                onChange={(e) => handleChange('actualStart', e.target.value)}
                className="mt-1 block w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Actual Finish
              </label>
              <input
                type="date"
                value={formData.actualFinish}
                onChange={(e) => handleChange('actualFinish', e.target.value)}
                className="mt-1 block w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* Duration and % complete */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Remaining Duration (d)
            </label>
            <input
              type="number"
              min={0}
              value={formData.remainingDuration}
              onChange={(e) =>
                handleChange('remainingDuration', Number(e.target.value))
              }
              className="mt-1 block w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              % Complete
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={formData.percentComplete}
              onChange={(e) =>
                handleChange('percentComplete', Number(e.target.value))
              }
              className="mt-1 block w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* CPM read-only data */}
        {cpmResult && (
          <div className="bg-slate-50 rounded p-3 space-y-2">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Schedule Analysis
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Total Float</span>
              <span className="text-xs font-mono text-slate-800">
                {cpmResult.totalFloat}d
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Critical</span>
              {cpmResult.isCritical ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                  Yes
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  No
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Early Start</span>
              <span className="text-xs font-mono text-slate-800">
                {formatDate(cpmResult.earlyStart)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Early Finish</span>
              <span className="text-xs font-mono text-slate-800">
                {formatDate(cpmResult.earlyFinish)}
              </span>
            </div>
          </div>
        )}

        {/* Read-only fields */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">WBS</span>
            <span className="text-xs font-mono text-slate-700">{activity.wbsCode}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Calendar</span>
            <span className="text-xs text-slate-700">{activity.calendarId}</span>
          </div>
        </div>

        {/* Predecessors */}
        {activity.predecessors.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Predecessors ({activity.predecessors.length})
            </div>
            <ul className="space-y-1">
              {activity.predecessors.map((p) => (
                <li key={p.id} className="text-xs text-slate-700 flex gap-2">
                  <span className="font-mono text-slate-500">{p.code}</span>
                  <span className="truncate">{p.name}</span>
                  <span className="text-slate-400 flex-shrink-0">
                    {p.type}
                    {p.lagDays !== 0 ? ` ${p.lagDays > 0 ? '+' : ''}${p.lagDays}d` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Successors */}
        {activity.successors.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Successors ({activity.successors.length})
            </div>
            <ul className="space-y-1">
              {activity.successors.map((s) => (
                <li key={s.id} className="text-xs text-slate-700 flex gap-2">
                  <span className="font-mono text-slate-500">{s.code}</span>
                  <span className="truncate">{s.name}</span>
                  <span className="text-slate-400 flex-shrink-0">
                    {s.type}
                    {s.lagDays !== 0 ? ` ${s.lagDays > 0 ? '+' : ''}${s.lagDays}d` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 flex gap-2">
        <button
          onClick={handleSave}
          disabled={!dirty}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded transition-colors"
        >
          Save
        </button>
        <button
          onClick={handleCancel}
          className="flex-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

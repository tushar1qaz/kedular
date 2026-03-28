'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import WbsTree from '@/components/gantt/WbsTree';
import ActivityDetail from '@/components/gantt/ActivityDetail';
import { ChangeTracker } from '@/lib/changes/change-tracker';
import type { GanttActivity, GanttRelationship } from '@/components/gantt/GanttChart';
import type { CpmActivityResult } from '@/lib/engine/cpm';
import type { ActivityDetailData } from '@/components/gantt/ActivityDetail';

const GanttChart = dynamic(
  () => import('@/components/gantt/GanttChart'),
  { ssr: false }
);

interface WbsNode {
  id: string;
  code: string;
  name: string;
  level: number;
  parentId: string | null;
  activityCount: number;
}

interface GanttPageClientProps {
  projectId: string;
  versionId: string;
  activities: GanttActivity[];
  relationships: GanttRelationship[];
  cpmResults: Map<string, CpmActivityResult>;
  wbsNodes: WbsNode[];
  activityDetails: Map<string, ActivityDetailData>;
  dataDate: Date;
}

// Module-level change tracker (persists across renders)
const changeTracker = new ChangeTracker();

export default function GanttPageClient({
  projectId,
  versionId,
  activities,
  relationships,
  cpmResults,
  wbsNodes,
  activityDetails,
  dataDate,
}: GanttPageClientProps) {
  const [selectedWbsNodeId, setSelectedWbsNodeId] = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [showCriticalPath, setShowCriticalPath] = useState(true);
  const [viewMode, setViewMode] = useState<'Day' | 'Week' | 'Month'>('Week');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Filter activities by selected WBS node
  const filteredActivities = selectedWbsNodeId
    ? activities.filter((act) => {
        // Find the WBS node and check if activity belongs to this node or its children
        const node = wbsNodes.find((n) => n.id === selectedWbsNodeId);
        if (!node) return true;
        return act.wbsCode.startsWith(node.code);
      })
    : activities;

  const handleActivityClick = useCallback((activityId: string) => {
    setSelectedActivityId(activityId);
  }, []);

  const handleActivityDrag = useCallback(
    (activityId: string, newStart: Date, newEnd: Date) => {
      const detail = activityDetails.get(activityId);
      if (!detail) return;

      const formatDate = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      changeTracker.beginGroup();
      changeTracker.recordChange({
        entityType: 'activity',
        entityId: activityId,
        changeType: 'update',
        field: 'plannedStart',
        oldValue: detail.plannedStart,
        newValue: formatDate(newStart),
        timestamp: Date.now(),
      });
      changeTracker.recordChange({
        entityType: 'activity',
        entityId: activityId,
        changeType: 'update',
        field: 'plannedFinish',
        oldValue: detail.plannedFinish,
        newValue: formatDate(newEnd),
        timestamp: Date.now(),
      });
      changeTracker.commitGroup();
      setHasChanges(true);
    },
    [activityDetails]
  );

  const handleActivitySave = useCallback(
    (activityId: string, changes: Record<string, unknown>) => {
      changeTracker.beginGroup();
      for (const [field, newValue] of Object.entries(changes)) {
        const detail = activityDetails.get(activityId);
        const oldValue = detail ? (detail as unknown as Record<string, unknown>)[field] : undefined;
        changeTracker.recordChange({
          entityType: 'activity',
          entityId: activityId,
          changeType: 'update',
          field,
          oldValue,
          newValue,
          timestamp: Date.now(),
        });
      }
      changeTracker.commitGroup();
      setHasChanges(changeTracker.hasUnsavedChanges());
    },
    [activityDetails]
  );

  const handleSaveAll = async () => {
    if (!hasChanges) return;
    setSaving(true);
    setSaveError(null);

    try {
      const allChanges = changeTracker.getChanges();
      // Group by activity
      const byActivity = new Map<string, Record<string, unknown>>();
      for (const change of allChanges) {
        if (change.entityType === 'activity' && change.field) {
          if (!byActivity.has(change.entityId)) {
            byActivity.set(change.entityId, {});
          }
          byActivity.get(change.entityId)![change.field] = change.newValue;
        }
      }

      // Persist each changed activity
      for (const [actId, changes] of byActivity.entries()) {
        const res = await fetch(
          `/api/projects/${projectId}/activities/${actId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(changes),
          }
        );
        if (!res.ok) {
          throw new Error(`Failed to save activity ${actId}: ${res.statusText}`);
        }
      }

      changeTracker.clear();
      setHasChanges(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const selectedActivity = selectedActivityId
    ? activityDetails.get(selectedActivityId) ?? null
    : null;
  const selectedCpmResult = selectedActivityId
    ? cpmResults.get(selectedActivityId) ?? null
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 bg-white flex-shrink-0">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={showCriticalPath}
            onChange={(e) => setShowCriticalPath(e.target.checked)}
            className="w-4 h-4"
          />
          Show Critical Path
        </label>

        <div className="flex gap-1 border border-slate-200 rounded overflow-hidden">
          {(['Day', 'Week', 'Month'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {saveError && (
          <span className="text-xs text-red-600">{saveError}</span>
        )}

        <button
          onClick={handleSaveAll}
          disabled={!hasChanges || saving}
          className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* WBS sidebar */}
        <div className="w-52 flex-shrink-0 border-r border-slate-200 overflow-hidden">
          <WbsTree
            nodes={wbsNodes}
            selectedNodeId={selectedWbsNodeId}
            onSelect={setSelectedWbsNodeId}
          />
        </div>

        {/* Gantt chart area */}
        <div className="flex-1 overflow-hidden bg-white">
          <GanttChart
            versionId={versionId}
            activities={filteredActivities}
            relationships={relationships}
            cpmResults={cpmResults}
            onActivityClick={handleActivityClick}
            onActivityDrag={handleActivityDrag}
            showCriticalPath={showCriticalPath}
            dataDate={dataDate}
            viewMode={viewMode}
          />
        </div>
      </div>

      {/* Activity detail panel */}
      {selectedActivity && (
        <ActivityDetail
          activity={selectedActivity}
          cpmResult={selectedCpmResult}
          onSave={handleActivitySave}
          onClose={() => setSelectedActivityId(null)}
        />
      )}
    </div>
  );
}

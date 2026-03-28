'use client';

import { useEffect, useRef } from 'react';
import type { CpmActivityResult } from '@/lib/engine/cpm';

export interface GanttActivity {
  id: string;
  code: string;
  name: string;
  start: Date;
  end: Date;
  progress: number;
  wbsCode: string;
  isCritical: boolean;
  totalFloat: number;
  status: string;
  type: string;
}

export interface GanttRelationship {
  fromId: string;
  toId: string;
  type: string;
}

interface GanttChartProps {
  versionId: string;
  activities: GanttActivity[];
  relationships: GanttRelationship[];
  cpmResults: Map<string, CpmActivityResult>;
  onActivityClick: (activityId: string) => void;
  onActivityDrag: (activityId: string, newStart: Date, newEnd: Date) => void;
  showCriticalPath: boolean;
  dataDate: Date;
  viewMode: 'Day' | 'Week' | 'Month';
}

function getBarColor(activity: GanttActivity, showCriticalPath: boolean): string {
  if (activity.status === 'complete') return '#3b82f6'; // blue
  if (activity.status === 'not_started') return '#94a3b8'; // grey
  if (showCriticalPath && activity.isCritical) return '#ef4444'; // red
  if (activity.totalFloat < 5) return '#f59e0b'; // amber near-critical
  return '#22c55e'; // green healthy
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function GanttChart({
  activities,
  cpmResults,
  onActivityClick,
  onActivityDrag,
  showCriticalPath,
  dataDate,
  viewMode,
}: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ganttRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || activities.length === 0) return;

    let destroyed = false;

    async function initGantt() {
      const GanttLib = (await import('frappe-gantt')).default;

      if (destroyed || !containerRef.current) return;

      // Build task list for frappe-gantt
      const tasks = activities.map((act) => {
        const cpm = cpmResults.get(act.id);
        const start = cpm ? cpm.earlyStart : act.start;
        const end = cpm ? cpm.earlyFinish : act.end;
        const color = getBarColor(
          {
            ...act,
            isCritical: cpm ? cpm.isCritical : act.isCritical,
            totalFloat: cpm ? cpm.totalFloat : act.totalFloat,
          },
          showCriticalPath
        );

        // Ensure end is not before start (milestones have same date)
        const endDate = end.getTime() >= start.getTime() ? end : start;

        return {
          id: act.id,
          name: `${act.code} — ${act.name}`,
          start: formatDateStr(start),
          end: formatDateStr(endDate),
          progress: act.progress,
          color,
          custom_class: act.isCritical && showCriticalPath ? 'gantt-critical' : '',
        };
      });

      if (tasks.length === 0) return;

      // Clear the container
      containerRef.current!.innerHTML = '';

      try {
        ganttRef.current = new GanttLib(containerRef.current!, tasks, {
          view_mode: viewMode,
          on_click: (task: { id?: string }) => {
            if (task.id) onActivityClick(task.id);
          },
          on_date_change: (task: { id?: string }, start: Date, end: Date) => {
            if (task.id) onActivityDrag(task.id, start, end);
          },
          today_button: true,
          readonly_progress: true,
        });

        // Add data date line after gantt renders
        setTimeout(() => {
          if (destroyed || !containerRef.current) return;
          const svg = containerRef.current!.querySelector('svg');
          if (!svg) return;

          // Remove existing data date lines
          svg.querySelectorAll('.data-date-line').forEach((el) => el.remove());

          // Get the date axis to find position
          const ganttInst = ganttRef.current;
          if (!ganttInst) return;

          const dateDateStr = formatDateStr(dataDate);
          const ganttStart: Date = ganttInst.gantt_start ?? ganttInst.options?.start;
          if (!ganttStart) return;

          const msPerDay = 24 * 60 * 60 * 1000;
          const daysDiff = Math.floor(
            (dataDate.getTime() - ganttStart.getTime()) / msPerDay
          );

          const columnWidth: number = ganttInst.options?.column_width ?? 38;
          const x = daysDiff * columnWidth;

          const svgHeight = svg.getBoundingClientRect().height;

          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('class', 'data-date-line');
          line.setAttribute('x1', String(x));
          line.setAttribute('x2', String(x));
          line.setAttribute('y1', '0');
          line.setAttribute('y2', String(svgHeight));
          line.setAttribute('stroke', '#6366f1');
          line.setAttribute('stroke-width', '2');
          line.setAttribute('stroke-dasharray', '6,4');
          line.setAttribute('opacity', '0.8');

          // Add label
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('class', 'data-date-line');
          text.setAttribute('x', String(x + 4));
          text.setAttribute('y', '16');
          text.setAttribute('fill', '#6366f1');
          text.setAttribute('font-size', '11');
          text.textContent = `DD: ${dateDateStr}`;

          svg.appendChild(line);
          svg.appendChild(text);
        }, 200);
      } catch (err) {
        console.warn('Gantt init error:', err);
      }
    }

    initGantt();

    return () => {
      destroyed = true;
      if (ganttRef.current) {
        try {
          ganttRef.current.clear?.();
        } catch {
          // ignore
        }
        ganttRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [activities, cpmResults, showCriticalPath, dataDate, viewMode, onActivityClick, onActivityDrag]);

  if (activities.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        No activities to display
      </div>
    );
  }

  return (
    <div className="gantt-wrapper overflow-x-auto w-full">
      <style>{`
        .gantt-critical .bar {
          fill: #ef4444 !important;
        }
        .gantt .bar-progress {
          fill: rgba(0,0,0,0.2) !important;
        }
      `}</style>
      <div ref={containerRef} className="gantt-container" />
    </div>
  );
}

'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface MilestoneTrendChartProps {
  milestones: Array<{
    code: string;
    name: string;
    versions: Array<{ versionLabel: string; plannedFinish: Date | null }>;
  }>;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function MilestoneTrendChart({ milestones }: MilestoneTrendChartProps) {
  if (milestones.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center text-slate-400 text-sm">
        No milestones found
      </div>
    );
  }

  // Collect all version labels in order
  const versionLabels: string[] = [];
  for (const m of milestones) {
    for (const v of m.versions) {
      if (!versionLabels.includes(v.versionLabel)) {
        versionLabels.push(v.versionLabel);
      }
    }
  }

  // Build chart data: one row per version label
  const data = versionLabels.map((label) => {
    const row: Record<string, unknown> = { version: label };
    for (const m of milestones) {
      const v = m.versions.find((ver) => ver.versionLabel === label);
      if (v && v.plannedFinish) {
        // Store as timestamp for numeric axis
        row[m.code] = v.plannedFinish.getTime();
      } else {
        row[m.code] = null;
      }
    }
    return row;
  });

  function formatDate(timestamp: number): string {
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  }

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="version" tick={{ fontSize: 11 }} />
          <YAxis
            scale="time"
            type="number"
            domain={['auto', 'auto']}
            tick={{ fontSize: 10 }}
            tickFormatter={formatDate}
            width={80}
          />
          <Tooltip
            formatter={(value, name) => [formatDate(Number(value ?? 0)), String(name)]}
          />
          <Legend />
          {milestones.map((m, i) => (
            <Line
              key={m.code}
              type="monotone"
              dataKey={m.code}
              name={m.name}
              stroke={COLORS[i % COLORS.length]}
              dot={{ r: 4 }}
              strokeWidth={2}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

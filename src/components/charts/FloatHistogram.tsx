'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { CanonicalActivity } from '@/lib/parsers/normaliser';

interface FloatHistogramProps {
  activities: CanonicalActivity[];
}

const BUCKETS = [
  { label: 'Negative', key: 'negative', color: '#ef4444' },
  { label: '0d (Critical)', key: 'zero', color: '#f97316' },
  { label: '1-5d', key: '1_5', color: '#eab308' },
  { label: '6-10d', key: '6_10', color: '#84cc16' },
  { label: '11-20d', key: '11_20', color: '#22c55e' },
  { label: '>20d', key: 'over20', color: '#06b6d4' },
];

function getBucket(totalFloat: number): string {
  if (totalFloat < 0) return 'negative';
  if (totalFloat === 0) return 'zero';
  if (totalFloat <= 5) return '1_5';
  if (totalFloat <= 10) return '6_10';
  if (totalFloat <= 20) return '11_20';
  return 'over20';
}

export default function FloatHistogram({ activities }: FloatHistogramProps) {
  const workActivities = activities.filter(
    (a) => a.type !== 'LOE' && a.type !== 'WBS_summary'
  );

  const counts: Record<string, number> = {
    negative: 0,
    zero: 0,
    '1_5': 0,
    '6_10': 0,
    '11_20': 0,
    over20: 0,
  };

  for (const act of workActivities) {
    const bucket = getBucket(act.totalFloat);
    counts[bucket]++;
  }

  const data = BUCKETS.map((b) => ({
    name: b.label,
    key: b.key,
    count: counts[b.key],
    color: b.color,
  }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} label={{ value: 'Activity Count', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
          <Tooltip
            formatter={(value) => [Number(value ?? 0), 'Activities']}
          />
          <Bar dataKey="count" name="Activities">
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

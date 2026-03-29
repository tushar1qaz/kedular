'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { CanonicalActivity } from '@/lib/parsers/normaliser';

interface BurndownChartProps {
  activities: CanonicalActivity[];
  dataDate: Date;
  baselineActivities?: CanonicalActivity[];
}

function getWeeklyDates(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  current.setDate(current.getDate() - current.getDay()); // start on Sunday
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 7);
  }
  return dates;
}

function getRemainingAtDate(activities: CanonicalActivity[], date: Date): number {
  return activities.filter((act) => {
    if (act.type === 'LOE' || act.type === 'WBS_summary') return false;
    const finish = act.plannedFinish ?? act.actualFinish;
    if (!finish) return true;
    return finish > date;
  }).length;
}

export default function BurndownChart({ activities, dataDate, baselineActivities }: BurndownChartProps) {
  const workActivities = activities.filter(
    (a) => a.type !== 'LOE' && a.type !== 'WBS_summary'
  );

  const allActivities = [...workActivities, ...(baselineActivities ?? []).filter(
    (a) => a.type !== 'LOE' && a.type !== 'WBS_summary'
  )];

  // Find date range
  let minDate = new Date();
  let maxDate = new Date();
  for (const act of allActivities) {
    const start = act.plannedStart ?? act.actualStart;
    const finish = act.plannedFinish ?? act.actualFinish;
    if (start) {
      if (!minDate || start < minDate) minDate = start;
    }
    if (finish) {
      if (!maxDate || finish > maxDate) maxDate = finish;
    }
  }

  // Extend to at least 4 weeks past dataDate
  const extendedEnd = new Date(Math.max(maxDate.getTime(), dataDate.getTime() + 28 * 24 * 60 * 60 * 1000));
  const weeks = getWeeklyDates(minDate, extendedEnd);

  const data = weeks.map((weekDate) => {
    const label = weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const actual = getRemainingAtDate(workActivities, weekDate);
    const planned = baselineActivities
      ? getRemainingAtDate(
          baselineActivities.filter((a) => a.type !== 'LOE' && a.type !== 'WBS_summary'),
          weekDate
        )
      : undefined;

    return {
      date: label,
      rawDate: weekDate.getTime(),
      actual,
      planned,
    };
  });

  const dateDateStr = dataDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} label={{ value: 'Remaining Activities', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
          <Tooltip />
          <Legend />
          <ReferenceLine x={dateDateStr} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Data Date', position: 'top', fontSize: 10 }} />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={2}
          />
          {baselineActivities && (
            <Line
              type="monotone"
              dataKey="planned"
              name="Planned"
              stroke="#94a3b8"
              dot={false}
              strokeWidth={2}
              strokeDasharray="5 5"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

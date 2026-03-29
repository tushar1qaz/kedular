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
import { EarnedValueResult } from '@/lib/engine/earned-value';

interface HistoricalPoint {
  date: Date;
  bcws: number;
  bcwp: number;
  acwp: number;
}

interface EarnedValueChartProps {
  evResult: EarnedValueResult;
  historicalData?: HistoricalPoint[];
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

export default function EarnedValueChart({ evResult, historicalData }: EarnedValueChartProps) {
  // If we have historical data, use it; otherwise create a simple two-point chart
  const chartData = historicalData && historicalData.length > 0
    ? historicalData.map((pt) => ({
        date: pt.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        BCWS: Math.round(pt.bcws * 100) / 100,
        BCWP: Math.round(pt.bcwp * 100) / 100,
        ACWP: Math.round(pt.acwp * 100) / 100,
      }))
    : [
        {
          date: evResult.dataDate
            ? evResult.dataDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : 'Now',
          BCWS: Math.round(evResult.bcws * 100) / 100,
          BCWP: Math.round(evResult.bcwp * 100) / 100,
          ACWP: Math.round(evResult.acwp * 100) / 100,
        },
      ];

  const spiColor = evResult.spi >= 1 ? 'text-green-600' : 'text-red-600';
  const cpiColor = evResult.cpi >= 1 ? 'text-green-600' : 'text-red-600';

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
          <div className={`text-2xl font-bold ${spiColor}`}>{evResult.spi.toFixed(2)}</div>
          <div className="text-xs text-slate-500 mt-0.5">SPI</div>
          <div className="text-xs text-slate-400">Schedule Perf.</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
          <div className={`text-2xl font-bold ${cpiColor}`}>{evResult.cpi.toFixed(2)}</div>
          <div className="text-xs text-slate-500 mt-0.5">CPI</div>
          <div className="text-xs text-slate-400">Cost Perf.</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
          <div className="text-2xl font-bold text-slate-800">{formatValue(evResult.bac)}</div>
          <div className="text-xs text-slate-500 mt-0.5">BAC</div>
          <div className="text-xs text-slate-400">Budget at Comp.</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
          <div className="text-2xl font-bold text-slate-800">{formatValue(evResult.eac)}</div>
          <div className="text-xs text-slate-500 mt-0.5">EAC</div>
          <div className="text-xs text-slate-400">Est. at Comp.</div>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={formatValue} />
            <Tooltip formatter={(value) => [formatValue(Number(value ?? 0)), '']} />
            <Legend />
            <Line
              type="monotone"
              dataKey="BCWS"
              name="BCWS (Planned)"
              stroke="#64748b"
              dot={false}
              strokeWidth={2}
              strokeDasharray="5 5"
            />
            <Line
              type="monotone"
              dataKey="BCWP"
              name="BCWP (Earned)"
              stroke="#3b82f6"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="ACWP"
              name="ACWP (Actual)"
              stroke="#ef4444"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Additional metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
        <div className="flex justify-between items-center bg-slate-50 rounded p-2">
          <span className="text-slate-500 text-xs">SV</span>
          <span className={`font-medium text-xs ${evResult.sv >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {evResult.sv >= 0 ? '+' : ''}{formatValue(evResult.sv)}
          </span>
        </div>
        <div className="flex justify-between items-center bg-slate-50 rounded p-2">
          <span className="text-slate-500 text-xs">CV</span>
          <span className={`font-medium text-xs ${evResult.cv >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {evResult.cv >= 0 ? '+' : ''}{formatValue(evResult.cv)}
          </span>
        </div>
        <div className="flex justify-between items-center bg-slate-50 rounded p-2">
          <span className="text-slate-500 text-xs">ETC</span>
          <span className="font-medium text-xs text-slate-700">{formatValue(evResult.etc)}</span>
        </div>
        <div className="flex justify-between items-center bg-slate-50 rounded p-2">
          <span className="text-slate-500 text-xs">TCPI</span>
          <span className={`font-medium text-xs ${evResult.tcpi <= 1 ? 'text-green-600' : 'text-amber-600'}`}>
            {evResult.tcpi.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

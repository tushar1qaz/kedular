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

interface SpiCpiTrendChartProps {
  versions: Array<{ label: string; spi: number; cpi: number }>;
}

export default function SpiCpiTrendChart({ versions }: SpiCpiTrendChartProps) {
  const data = versions.map((v) => ({
    version: v.label,
    SPI: Math.round(v.spi * 1000) / 1000,
    CPI: Math.round(v.cpi * 1000) / 1000,
  }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="version" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
          <Tooltip />
          <Legend />
          <ReferenceLine y={1.0} stroke="#64748b" strokeDasharray="4 4" label={{ value: '1.0', position: 'right', fontSize: 10 }} />
          <Line
            type="monotone"
            dataKey="SPI"
            name="SPI"
            stroke="#3b82f6"
            dot={{ r: 4 }}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="CPI"
            name="CPI"
            stroke="#10b981"
            dot={{ r: 4 }}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

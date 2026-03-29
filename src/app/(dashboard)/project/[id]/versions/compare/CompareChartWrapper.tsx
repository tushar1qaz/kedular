'use client';

import MilestoneTrendChart from '@/components/charts/MilestoneTrendChart';

interface SerializedMilestone {
  code: string;
  name: string;
  versions: Array<{ versionLabel: string; plannedFinish: string | null }>;
}

interface Props {
  milestones: SerializedMilestone[];
}

export default function CompareChartWrapper({ milestones }: Props) {
  const deserialized = milestones.map((m) => ({
    ...m,
    versions: m.versions.map((v) => ({
      ...v,
      plannedFinish: v.plannedFinish ? new Date(v.plannedFinish) : null,
    })),
  }));

  return <MilestoneTrendChart milestones={deserialized} />;
}

'use client';

import BurndownChart from '@/components/charts/BurndownChart';
import EarnedValueChart from '@/components/charts/EarnedValueChart';
import type { CanonicalActivity } from '@/lib/parsers/normaliser';
import type { EarnedValueResult } from '@/lib/engine/earned-value';

// Serialized version (dates as ISO strings)
interface SerializedActivity extends Omit<CanonicalActivity, 'plannedStart' | 'plannedFinish' | 'actualStart' | 'actualFinish'> {
  plannedStart: string | null;
  plannedFinish: string | null;
  actualStart: string | null;
  actualFinish: string | null;
}

type SerializedEVResult = Omit<EarnedValueResult, 'dataDate'> & { dataDate: string | null };

interface Props {
  activities: SerializedActivity[];
  dataDateIso: string;
  evResult: SerializedEVResult;
}

function deserializeActivities(activities: SerializedActivity[]): CanonicalActivity[] {
  return activities.map((a) => ({
    ...a,
    plannedStart: a.plannedStart ? new Date(a.plannedStart) : null,
    plannedFinish: a.plannedFinish ? new Date(a.plannedFinish) : null,
    actualStart: a.actualStart ? new Date(a.actualStart) : null,
    actualFinish: a.actualFinish ? new Date(a.actualFinish) : null,
  }));
}

function deserializeEVResult(ev: SerializedEVResult): EarnedValueResult {
  return {
    ...ev,
    dataDate: ev.dataDate ? new Date(ev.dataDate) : null,
  };
}

export default function BurndownChartWrapper({ activities, dataDateIso, evResult }: Props) {
  const acts = deserializeActivities(activities);
  const dataDate = new Date(dataDateIso);
  const ev = deserializeEVResult(evResult);

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Activity Burndown</h2>
        <BurndownChart activities={acts} dataDate={dataDate} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Earned Value</h2>
        <EarnedValueChart evResult={ev} />
      </div>
    </div>
  );
}

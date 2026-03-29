import { CanonicalSchedule } from '../parsers/normaliser';

export interface HealthMetric {
  name: string;
  score: number;        // 0-100
  weight: number;
  value: number | string;
  target: string;
  issues: string[];
}

export interface HealthReport {
  overallScore: number;   // 0-100 weighted average
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  metrics: HealthMetric[];
  recommendations: string[];
}

function computeGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

export function scoreScheduleHealth(schedule: CanonicalSchedule): HealthReport {
  const acts = schedule.activities.filter(
    (a) => a.type !== 'LOE' && a.type !== 'WBS_summary'
  );
  const rels = schedule.relationships;
  const totalActivities = acts.length;

  if (totalActivities === 0) {
    return {
      overallScore: 0,
      grade: 'F',
      metrics: [],
      recommendations: ['No activities found in the schedule.'],
    };
  }

  const metrics: HealthMetric[] = [];

  // 1. Logic density (relationships/activities): weight=20
  const logicDensity = rels.length / totalActivities;
  const logicDensityScore = Math.min(100, Math.round((logicDensity / 1.5) * 100));
  const logicIssues: string[] = [];
  if (logicDensity < 1.5) {
    logicIssues.push(
      `Logic density is ${logicDensity.toFixed(2)} (${rels.length} rels / ${totalActivities} activities). Target ≥1.5.`
    );
  }
  metrics.push({
    name: 'Logic Density',
    score: logicDensityScore,
    weight: 20,
    value: logicDensity.toFixed(2),
    target: '≥1.5',
    issues: logicIssues,
  });

  // Build predecessor/successor sets
  const hasPredecessor = new Set<string>();
  const hasSuccessor = new Set<string>();
  for (const rel of rels) {
    hasPredecessor.add(rel.successorCode);
    hasSuccessor.add(rel.predecessorCode);
  }

  // 2. Missing predecessors: weight=15
  const missingPredCount = acts.filter((a) => !hasPredecessor.has(a.code)).length;
  // Score: 100 if ≤1, deduct per extra
  const extraMissingPred = Math.max(0, missingPredCount - 1);
  const missingPredScore = Math.max(0, Math.round(100 - (extraMissingPred / totalActivities) * 100));
  const missingPredIssues: string[] = [];
  if (missingPredCount > 1) {
    missingPredIssues.push(
      `${missingPredCount} activities have no predecessor (only 1 is expected for project start).`
    );
  }
  metrics.push({
    name: 'Missing Predecessors',
    score: missingPredScore,
    weight: 15,
    value: missingPredCount,
    target: '≤1',
    issues: missingPredIssues,
  });

  // 3. Missing successors: weight=15
  const missingSuccCount = acts.filter((a) => !hasSuccessor.has(a.code)).length;
  const extraMissingSucc = Math.max(0, missingSuccCount - 1);
  const missingSuccScore = Math.max(0, Math.round(100 - (extraMissingSucc / totalActivities) * 100));
  const missingSuccIssues: string[] = [];
  if (missingSuccCount > 1) {
    missingSuccIssues.push(
      `${missingSuccCount} activities have no successor (only 1 is expected for project finish).`
    );
  }
  metrics.push({
    name: 'Missing Successors',
    score: missingSuccScore,
    weight: 15,
    value: missingSuccCount,
    target: '≤1',
    issues: missingSuccIssues,
  });

  // 4. Hard constraints: weight=10
  const hardConstraintTypes = new Set([
    'CS_MSO', 'CS_MFO', 'CS_MANDATORYSTART', 'CS_MANDATORYFINISH',
    'mandatory_start', 'mandatory_finish', 'hard_constraint',
  ]);
  const hardConstraintCount = acts.filter(
    (a) => a.rawXerRow && hardConstraintTypes.has(a.rawXerRow.cstr_type)
  ).length;
  const hardConstraintPct = hardConstraintCount / totalActivities;
  const hardConstraintScore =
    hardConstraintPct === 0
      ? 100
      : Math.max(0, Math.round(100 - (hardConstraintPct / 0.05) * 100));
  const hardConstraintIssues: string[] = [];
  if (hardConstraintCount > 0) {
    hardConstraintIssues.push(
      `${hardConstraintCount} activities (${(hardConstraintPct * 100).toFixed(1)}%) have hard constraints. Target: <5%.`
    );
  }
  metrics.push({
    name: 'Hard Constraints',
    score: hardConstraintScore,
    weight: 10,
    value: hardConstraintCount,
    target: '<5% of activities',
    issues: hardConstraintIssues,
  });

  // 5. Long activities >20d: weight=10
  const longActCount = acts.filter((a) => a.remainingDuration > 20).length;
  const longActScore = longActCount === 0 ? 100 : Math.max(0, Math.round(100 - (longActCount / totalActivities) * 100));
  const longActIssues: string[] = [];
  if (longActCount > 0) {
    longActIssues.push(
      `${longActCount} activities have remaining duration >20 days. Consider splitting them.`
    );
  }
  metrics.push({
    name: 'Long Activities (>20d)',
    score: longActScore,
    weight: 10,
    value: longActCount,
    target: '0',
    issues: longActIssues,
  });

  // 6. Float distribution: weight=10
  // Score 100 if ≤30% on critical path (totalFloat ≤ 0)
  const criticalCount = acts.filter((a) => a.totalFloat <= 0).length;
  const criticalPct = criticalCount / totalActivities;
  const floatScore = criticalPct <= 0.3 ? 100 : Math.max(0, Math.round(100 - ((criticalPct - 0.3) / 0.7) * 100));
  const floatIssues: string[] = [];
  if (criticalPct > 0.3) {
    floatIssues.push(
      `${(criticalPct * 100).toFixed(1)}% of activities are on the critical path. Target: ≤30%.`
    );
  }
  metrics.push({
    name: 'Float Distribution',
    score: floatScore,
    weight: 10,
    value: `${(criticalPct * 100).toFixed(1)}% critical`,
    target: '≤30% on critical path',
    issues: floatIssues,
  });

  // 7. Negative float: weight=10
  const negFloatCount = acts.filter((a) => a.totalFloat < 0).length;
  const negFloatScore = negFloatCount === 0 ? 100 : Math.max(0, Math.round(100 - (negFloatCount / totalActivities) * 200));
  const negFloatIssues: string[] = [];
  if (negFloatCount > 0) {
    negFloatIssues.push(
      `${negFloatCount} activities have negative total float. This indicates schedule compression or missed dates.`
    );
  }
  metrics.push({
    name: 'Negative Float',
    score: negFloatScore,
    weight: 10,
    value: negFloatCount,
    target: '0',
    issues: negFloatIssues,
  });

  // 8. High duration >40d: weight=5
  const veryLongActCount = acts.filter((a) => a.remainingDuration > 40).length;
  const veryLongActPct = veryLongActCount / totalActivities;
  const veryLongActScore = veryLongActPct < 0.05 ? 100 : Math.max(0, Math.round(100 - ((veryLongActPct - 0.05) / 0.95) * 100));
  const veryLongActIssues: string[] = [];
  if (veryLongActPct >= 0.05) {
    veryLongActIssues.push(
      `${veryLongActCount} activities (${(veryLongActPct * 100).toFixed(1)}%) have duration >40 days. Target: <5%.`
    );
  }
  metrics.push({
    name: 'Very Long Activities (>40d)',
    score: veryLongActScore,
    weight: 5,
    value: veryLongActCount,
    target: '<5% of activities',
    issues: veryLongActIssues,
  });

  // 9. Relationship types: weight=5
  const fsRelCount = rels.filter((r) => r.type === 'FS').length;
  const fsPct = rels.length > 0 ? fsRelCount / rels.length : 1;
  const relTypeScore = fsPct >= 0.9 ? 100 : Math.max(0, Math.round((fsPct / 0.9) * 100));
  const relTypeIssues: string[] = [];
  if (fsPct < 0.9) {
    relTypeIssues.push(
      `Only ${(fsPct * 100).toFixed(1)}% of relationships are Finish-to-Start. Target: >90% FS.`
    );
  }
  metrics.push({
    name: 'Relationship Types',
    score: relTypeScore,
    weight: 5,
    value: `${(fsPct * 100).toFixed(1)}% FS`,
    target: '>90% FS',
    issues: relTypeIssues,
  });

  // Compute weighted average
  const totalWeight = metrics.reduce((sum, m) => sum + m.weight, 0);
  const weightedSum = metrics.reduce((sum, m) => sum + m.score * m.weight, 0);
  const overallScore = Math.round(weightedSum / totalWeight);

  // Build recommendations
  const recommendations: string[] = [];
  const sortedByScore = [...metrics].sort((a, b) => a.score - b.score);
  for (const metric of sortedByScore.slice(0, 3)) {
    if (metric.issues.length > 0) {
      recommendations.push(metric.issues[0]);
    }
  }

  return {
    overallScore,
    grade: computeGrade(overallScore),
    metrics,
    recommendations,
  };
}

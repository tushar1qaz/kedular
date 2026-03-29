export type QueryType = 'direct' | 'llm';

export type DirectQueryHandler =
  | 'critical_path'
  | 'schedule_health'
  | 'look_ahead'
  | 'float_distribution'
  | 'earned_value'
  | 'list_versions'
  | 'compare_versions'
  | 'activity_search'
  | 'activity_detail';

export interface ClassifiedQuery {
  type: QueryType;
  directHandler?: DirectQueryHandler;
  params?: Record<string, unknown>;
}

export function classifyQuery(message: string): ClassifiedQuery {
  const lower = message.toLowerCase().trim();

  // critical path
  if (lower.includes('critical path')) {
    return { type: 'direct', directHandler: 'critical_path', params: {} };
  }

  // health / healthy
  if (lower.includes('health') || lower.includes('healthy')) {
    return { type: 'direct', directHandler: 'schedule_health', params: {} };
  }

  // look ahead / lookahead / next N weeks
  if (lower.includes('look ahead') || lower.includes('lookahead')) {
    const params = extractWeeksParam(lower);
    return { type: 'direct', directHandler: 'look_ahead', params };
  }
  const nextNWeeksMatch = lower.match(/next\s+(\d+)\s+week/);
  if (nextNWeeksMatch) {
    const weeks = parseInt(nextNWeeksMatch[1], 10);
    return { type: 'direct', directHandler: 'look_ahead', params: { weeks } };
  }

  // float
  if (lower.includes('float')) {
    return { type: 'direct', directHandler: 'float_distribution', params: {} };
  }

  // earned value / spi / cpi / ev metrics
  if (
    lower.includes('earned value') ||
    lower.includes(' spi') ||
    lower.includes(' cpi') ||
    lower.startsWith('spi') ||
    lower.startsWith('cpi') ||
    lower.includes('ev metrics')
  ) {
    return { type: 'direct', directHandler: 'earned_value', params: {} };
  }

  // versions / version history
  if (lower.includes('versions') || lower.includes('version history')) {
    // compare + version
    if (lower.includes('compare')) {
      return { type: 'direct', directHandler: 'compare_versions', params: {} };
    }
    return { type: 'direct', directHandler: 'list_versions', params: {} };
  }

  // compare + version (without 'versions' keyword)
  if (lower.includes('compare') && lower.includes('version')) {
    return { type: 'direct', directHandler: 'compare_versions', params: {} };
  }

  // activity detail: "activity CIVIL-001" or "details for CIVIL-001"
  const activityCodeMatch = lower.match(/activity\s+([a-z0-9_-]+)/i);
  if (activityCodeMatch) {
    return {
      type: 'direct',
      directHandler: 'activity_detail',
      params: { activityCode: activityCodeMatch[1].toUpperCase() },
    };
  }

  return { type: 'llm' };
}

function extractWeeksParam(lower: string): Record<string, unknown> {
  // "look ahead 4 weeks" or "next 3 weeks"
  const match = lower.match(/(\d+)\s*week/);
  if (match) {
    return { weeks: parseInt(match[1], 10) };
  }
  return { weeks: 2 }; // default
}

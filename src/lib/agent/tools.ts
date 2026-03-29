import Anthropic from '@anthropic-ai/sdk';

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_critical_path',
    description: 'Get the critical path activities for the project, ordered from project start to finish.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_activities',
    description: 'Get a list of activities matching the given filters.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['not_started', 'in_progress', 'complete'], description: 'Filter by activity status' },
        wbs: { type: 'string', description: 'Filter by WBS code prefix (e.g. "1.2")' },
        search_text: { type: 'string', description: 'Search activity name or code' },
        float_max: { type: 'number', description: 'Only activities with total float <= this value (days)' },
        float_min: { type: 'number', description: 'Only activities with total float >= this value (days)' },
        is_critical: { type: 'boolean', description: 'Filter to critical activities only' },
      },
      required: [],
    },
  },
  {
    name: 'get_activity_detail',
    description: 'Get full detail for a specific activity including predecessors and successors.',
    input_schema: {
      type: 'object' as const,
      properties: {
        activity_code: { type: 'string', description: 'The activity code (task_code)' },
      },
      required: ['activity_code'],
    },
  },
  {
    name: 'calculate_slippage',
    description: 'Calculate the impact of delaying a specific activity by a number of days.',
    input_schema: {
      type: 'object' as const,
      properties: {
        activity_code: { type: 'string', description: 'The activity code to delay' },
        delay_days: { type: 'number', description: 'Number of days to delay (positive = delay, negative = accelerate)' },
      },
      required: ['activity_code', 'delay_days'],
    },
  },
  {
    name: 'get_earned_value',
    description: 'Get earned value metrics (BCWS, BCWP, ACWP, SPI, CPI, EAC, ETC).',
    input_schema: {
      type: 'object' as const,
      properties: {
        wbs_filter: { type: 'string', description: 'Optional WBS code prefix to filter' },
      },
      required: [],
    },
  },
  {
    name: 'get_schedule_health',
    description: 'Get the schedule health score, grade, and detailed metric breakdown.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_look_ahead',
    description: 'Get activities starting, in-progress, or finishing within the next N weeks.',
    input_schema: {
      type: 'object' as const,
      properties: {
        weeks: { type: 'number', description: 'Number of weeks ahead (1, 2, 3, 4, or 6)', enum: [1, 2, 3, 4, 6] },
        wbs_filter: { type: 'string', description: 'Optional WBS code prefix filter' },
      },
      required: ['weeks'],
    },
  },
  {
    name: 'get_float_distribution',
    description: 'Get float distribution histogram showing how activities are distributed across float buckets.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'compare_baseline',
    description: 'Compare current schedule against the baseline version.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'generate_chart',
    description: 'Generate chart data for a specific chart type.',
    input_schema: {
      type: 'object' as const,
      properties: {
        chart_type: {
          type: 'string',
          enum: ['burndown', 'earned_value', 'float_histogram', 'spi_cpi_trend', 'milestone_trend'],
          description: 'Type of chart to generate',
        },
      },
      required: ['chart_type'],
    },
  },
  {
    name: 'list_versions',
    description: 'List all schedule versions for this project with their summary metrics.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'compare_versions',
    description: 'Compare two schedule versions and get a detailed diff.',
    input_schema: {
      type: 'object' as const,
      properties: {
        base_version_number: { type: 'number', description: 'Base version number' },
        compare_version_number: { type: 'number', description: 'Version to compare against' },
      },
      required: ['base_version_number', 'compare_version_number'],
    },
  },
  {
    name: 'track_activity_across_versions',
    description: 'Track how a specific activity\'s fields have changed across all versions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        activity_code: { type: 'string', description: 'The activity code to track' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to track (e.g. ["plannedStart", "plannedFinish", "percentComplete"])',
        },
      },
      required: ['activity_code'],
    },
  },
  {
    name: 'track_milestone_trend',
    description: 'Track milestone planned finish dates across all versions to see trend/slippage.',
    input_schema: {
      type: 'object' as const,
      properties: {
        activity_code: { type: 'string', description: 'Specific milestone code, or omit for all milestones' },
      },
      required: [],
    },
  },
];

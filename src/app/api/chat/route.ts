import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db/client';
import {
  projects,
  schedule_versions,
  activities as activitiesTable,
  relationships as relsTable,
  calendars as calendarsTable,
} from '@/lib/db/schema';
import { classifyQuery } from '@/lib/agent/query-classifier';
import { handleDirectQuery } from '@/lib/agent/direct-responder';
import { streamLlmResponse, LlmProvider } from '@/lib/agent/llm-provider';
import { getCacheKey, getCached, setCached } from '@/lib/agent/query-cache';
import { buildSystemPrompt, buildScheduleContext } from '@/lib/agent/system-prompt';
import { buildCpmFromSchedule, AgentContext } from '@/lib/agent/tool-executor';
import { executeTool } from '@/lib/agent/tool-executor';
import { AGENT_TOOLS } from '@/lib/agent/tools';
import type { CanonicalActivity, CanonicalRelationship, CanonicalSchedule } from '@/lib/parsers/normaliser';
import type { CalendarDef } from '@/lib/engine/calendar';
import type { ScheduleParseHealth } from '@/types/schedule';

const encoder = new TextEncoder();

function sseEvent(data: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date;
}

export async function POST(request: NextRequest) {
  let body: {
    projectId: string;
    versionId?: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
    provider?: LlmProvider;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { projectId, versionId, messages, provider = 'claude' } = body;

  if (!projectId || !messages?.length) {
    return new Response(
      JSON.stringify({ error: 'projectId and messages are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMessage) {
    return new Response(
      JSON.stringify({ error: 'No user message found' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Load project
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    return new Response(
      JSON.stringify({ error: 'Project not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const resolvedVersionId = versionId ?? project.active_version_id;
  if (!resolvedVersionId) {
    return new Response(
      JSON.stringify({ error: 'No active version found for this project' }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Load version and schedule data in parallel
  const [versionRow, acts, rels, cals, allVersions] = await Promise.all([
    db.select().from(schedule_versions).where(eq(schedule_versions.id, resolvedVersionId)).limit(1),
    db.select().from(activitiesTable).where(eq(activitiesTable.version_id, resolvedVersionId)),
    db.select().from(relsTable).where(eq(relsTable.version_id, resolvedVersionId)),
    db.select().from(calendarsTable).where(eq(calendarsTable.version_id, resolvedVersionId)),
    db.select().from(schedule_versions).where(eq(schedule_versions.project_id, projectId)),
  ]);

  const version = versionRow[0];
  if (!version) {
    return new Response(
      JSON.stringify({ error: 'Version not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const activities: CanonicalActivity[] = acts.map((act) => ({
    code: act.code ?? '',
    sourceId: act.source_id ?? '',
    name: act.name ?? '',
    wbsCode: act.wbs_code ?? null,
    type: act.type ?? 'task_dependent',
    status: act.status ?? 'not_started',
    plannedStart: parseDate(act.planned_start),
    plannedFinish: parseDate(act.planned_finish),
    actualStart: parseDate(act.actual_start),
    actualFinish: parseDate(act.actual_finish),
    remainingDuration: act.remaining_duration ? Number(act.remaining_duration) : 0,
    totalFloat: act.total_float ? Number(act.total_float) : 0,
    freeFloat: act.free_float ? Number(act.free_float) : 0,
    percentComplete: act.percent_complete ? Number(act.percent_complete) : 0,
    calendarSourceId: act.calendar_id ?? null,
  }));

  const relationships: CanonicalRelationship[] = rels.map((rel) => ({
    predecessorCode: rel.predecessor_code ?? '',
    successorCode: rel.successor_code ?? '',
    type: rel.type ?? 'FS',
    lagDays: rel.lag_days ? Number(rel.lag_days) : 0,
  }));

  const calendars: CalendarDef[] = cals.map((cal) => ({
    id: cal.id,
    workdays: Array.isArray(cal.workdays) ? (cal.workdays as number[]) : [1, 2, 3, 4, 5],
    holidays: Array.isArray(cal.holidays) ? (cal.holidays as string[]) : [],
    hoursPerDay: cal.hours_per_day ? Number(cal.hours_per_day) : 8,
  }));

  const dataDateStr = version.data_date ?? project.data_date;
  const dataDate = dataDateStr ? parseDate(dataDateStr) : new Date();

  const schedule: CanonicalSchedule = {
    project: {
      name: project.name,
      description: project.description ?? '',
      dataDate,
    },
    activities,
    relationships,
    wbsNodes: [],
    calendars: [],
  };

  const cpmResult = buildCpmFromSchedule(schedule, calendars);

  const parseHealth: ScheduleParseHealth = (version.parse_health as ScheduleParseHealth) ?? {
    confidence: 'partial',
    errors: [],
    warnings: [],
    stats: {
      tablesFound: 0,
      tablesExpected: 0,
      tablesParsed: [],
      tablesMissing: [],
      tablesUnknown: [],
      totalRows: 0,
      rowsSkipped: 0,
      activitiesParsed: activities.length,
      relationshipsParsed: relationships.length,
      resourcesParsed: 0,
      calendarsParsed: calendars.length,
      wbsNodesParsed: 0,
      encodingDetected: 'utf-8',
      p6VersionDetected: 'unknown',
      parseTimeMs: 0,
    },
    capabilities: {
      canShowGantt: true,
      canRunCpm: true,
      canShowBurndown: true,
      canShowEarnedValue: true,
      canRunWhatIf: true,
      canExportXer: false,
      canExportCsv: true,
      canDiffVersions: true,
      canUseAgent: true,
    },
  };

  const agentContext: AgentContext = {
    schedule,
    cpmResult,
    calendars,
    projectId,
    versionId: resolvedVersionId,
    versions: allVersions,
  };

  // Check cache
  const cacheKey = getCacheKey(projectId, resolvedVersionId, lastUserMessage.content);
  const shortKey = cacheKey.slice(0, 8);

  // Build SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: unknown) => {
        try {
          controller.enqueue(sseEvent(data));
        } catch {
          // Controller may be closed
        }
      };

      try {
        // Emit provider info
        enqueue({ type: 'provider', name: provider });

        // Check cache
        const cached = getCached(cacheKey);
        if (cached) {
          enqueue({ type: 'cache_hit', key: shortKey });
          enqueue({ type: 'text', delta: cached.response });
          if (cached.dataType && cached.data) {
            enqueue({ type: 'data', dataType: cached.dataType, data: cached.data });
          }
          enqueue({ type: 'done' });
          controller.close();
          return;
        }

        // Classify query
        const classified = classifyQuery(lastUserMessage.content);

        if (classified.type === 'direct' && classified.directHandler) {
          // Direct handler path — no LLM
          const response = await handleDirectQuery(
            classified.directHandler,
            classified.params ?? {},
            agentContext
          );

          enqueue({ type: 'text', delta: response.text });
          if (response.dataType && response.data !== undefined) {
            enqueue({ type: 'data', dataType: response.dataType, data: response.data });
          }

          // Cache the response
          setCached(cacheKey, {
            response: response.text,
            dataType: response.dataType,
            data: response.data,
            cachedAt: Date.now(),
          });

          enqueue({ type: 'done' });
        } else {
          // LLM path
          const systemPrompt = buildSystemPrompt(
            schedule,
            cpmResult,
            project.name,
            parseHealth
          );
          const scheduleContext = buildScheduleContext(schedule, cpmResult);

          const llmMessages = messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

          let fullText = '';
          let toolCallRound = 0;
          const MAX_TOOL_ROUNDS = 5;

          // For Claude: support tool calling loop
          if (provider === 'claude') {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) {
              enqueue({ type: 'error', message: 'Claude API key not configured.' });
              enqueue({ type: 'done' });
              controller.close();
              return;
            }

            const client = new Anthropic({ apiKey });

            const anthropicMessages: Anthropic.MessageParam[] = llmMessages.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: [
                {
                  type: 'text' as const,
                  text:
                    m.role === 'user' &&
                    m.content === lastUserMessage.content
                      ? `${scheduleContext}\n\n---\n\n${m.content}`
                      : m.content,
                },
              ],
            }));

            while (toolCallRound <= MAX_TOOL_ROUNDS) {
              const response = await client.messages.create({
                model: 'claude-sonnet-4-6',
                max_tokens: 4096,
                system: systemPrompt,
                messages: anthropicMessages,
                tools: AGENT_TOOLS,
                stream: false,
              });

              // Collect text content
              for (const block of response.content) {
                if (block.type === 'text') {
                  fullText += block.text;
                  enqueue({ type: 'text', delta: block.text });
                }
              }

              // Handle tool use
              if (response.stop_reason === 'tool_use') {
                toolCallRound++;
                if (toolCallRound > MAX_TOOL_ROUNDS) break;

                const toolUseBlocks = response.content.filter(
                  (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
                );

                // Add assistant message with tool use
                anthropicMessages.push({
                  role: 'assistant',
                  content: response.content,
                });

                // Execute tools and collect results
                const toolResults: Anthropic.ToolResultBlockParam[] = [];
                for (const toolUse of toolUseBlocks) {
                  const result = await executeTool(
                    toolUse.name,
                    toolUse.input as Record<string, unknown>,
                    agentContext
                  );
                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: JSON.stringify(result),
                  });
                }

                // Add tool results message
                anthropicMessages.push({
                  role: 'user',
                  content: toolResults,
                });
              } else {
                break; // end_turn or other stop reason
              }
            }
          } else {
            // Gemini and OpenAI: use simple streaming without tool calling
            for await (const chunk of streamLlmResponse(
              provider,
              llmMessages,
              systemPrompt,
              scheduleContext
            )) {
              if (chunk.type === 'text' && chunk.text) {
                fullText += chunk.text;
                enqueue({ type: 'text', delta: chunk.text });
              } else if (chunk.type === 'error') {
                enqueue({ type: 'error', message: chunk.error });
                enqueue({ type: 'done' });
                controller.close();
                return;
              }
            }
          }

          // Cache final response
          if (fullText) {
            setCached(cacheKey, {
              response: fullText,
              cachedAt: Date.now(),
            });
          }

          enqueue({ type: 'done' });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        try {
          controller.enqueue(sseEvent({ type: 'error', message }));
          controller.enqueue(sseEvent({ type: 'done' }));
        } catch {
          // Ignore
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

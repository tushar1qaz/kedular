import { NextRequest } from 'next/server';
import { db } from '@/lib/db/client';
import {
  projects,
  schedule_versions,
  activities as activitiesTable,
  relationships as relationshipsTable,
  wbs_nodes,
  calendars as calendarsTable,
  schedule_changes,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { validateSchedule } from '@/lib/validation/validator';
import { writeXerRoundTrip } from '@/lib/export/xer-writer';
import { writeScheduleCsv } from '@/lib/export/csv-writer';
import { writeScheduleMspdi } from '@/lib/export/mspdi-writer';
import {
  CanonicalSchedule,
  CanonicalActivity,
  CanonicalRelationship,
  CanonicalWbsNode,
  CanonicalCalendar,
} from '@/lib/parsers/normaliser';
import { XerRawTables } from '@/lib/parsers/xer-parser';

interface ExportRequestBody {
  projectId: string;
  versionId?: string;
  format: 'xer' | 'csv' | 'mspdi_xml';
}

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

async function buildCanonicalSchedule(
  projectId: string,
  versionId: string
): Promise<CanonicalSchedule> {
  const [versionRow] = await db
    .select()
    .from(schedule_versions)
    .where(
      and(
        eq(schedule_versions.id, versionId),
        eq(schedule_versions.project_id, projectId)
      )
    )
    .limit(1);

  const [projectRow] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const acts = await db
    .select()
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.project_id, projectId),
        eq(activitiesTable.version_id, versionId)
      )
    );

  const rels = await db
    .select()
    .from(relationshipsTable)
    .where(
      and(
        eq(relationshipsTable.project_id, projectId),
        eq(relationshipsTable.version_id, versionId)
      )
    );

  const wbsRows = await db
    .select()
    .from(wbs_nodes)
    .where(
      and(
        eq(wbs_nodes.project_id, projectId),
        eq(wbs_nodes.version_id, versionId)
      )
    );

  const calRows = await db
    .select()
    .from(calendarsTable)
    .where(
      and(
        eq(calendarsTable.project_id, projectId),
        eq(calendarsTable.version_id, versionId)
      )
    );

  const activities: CanonicalActivity[] = acts.map(a => ({
    code: a.code ?? '',
    sourceId: a.source_id ?? a.id,
    name: a.name ?? '',
    wbsCode: a.wbs_code ?? null,
    type: a.type ?? 'task_dependent',
    status: a.status ?? 'not_started',
    plannedStart: parseDate(a.planned_start),
    plannedFinish: parseDate(a.planned_finish),
    actualStart: parseDate(a.actual_start),
    actualFinish: parseDate(a.actual_finish),
    remainingDuration: parseFloat(String(a.remaining_duration ?? '0')),
    totalFloat: parseFloat(String(a.total_float ?? '0')),
    freeFloat: parseFloat(String(a.free_float ?? '0')),
    percentComplete: parseFloat(String(a.percent_complete ?? '0')),
    calendarSourceId: null,
    rawXerRow: a.raw_xer_row,
  }));

  const relationships: CanonicalRelationship[] = rels.map(r => ({
    predecessorCode: r.predecessor_code ?? '',
    successorCode: r.successor_code ?? '',
    type: r.type ?? 'FS',
    lagDays: parseFloat(String(r.lag_days ?? '0')),
    rawXerRow: r.raw_xer_row,
  }));

  const wbsNodes: CanonicalWbsNode[] = wbsRows.map(w => ({
    sourceId: w.source_id ?? w.id,
    parentSourceId: w.parent_source_id ?? null,
    code: w.code ?? '',
    name: w.name ?? '',
    level: w.level ?? 0,
    sortOrder: w.sort_order ?? 0,
  }));

  const calendars: CanonicalCalendar[] = calRows.map(c => ({
    sourceId: c.source_id ?? c.id,
    name: c.name ?? '',
    workdays: (c.workdays as number[]) ?? [1, 2, 3, 4, 5],
    holidays: (c.holidays as string[]) ?? [],
    hoursPerDay: parseFloat(String(c.hours_per_day ?? '8')),
  }));

  return {
    project: {
      name: projectRow?.name ?? 'Untitled Project',
      description: projectRow?.description ?? '',
      dataDate: parseDate(versionRow?.data_date),
    },
    activities,
    relationships,
    wbsNodes,
    calendars,
  };
}

export async function POST(request: NextRequest) {
  try {
    let body: ExportRequestBody;
    try {
      body = (await request.json()) as ExportRequestBody;
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { projectId, versionId: requestedVersionId, format } = body;

    if (!projectId) {
      return Response.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (!format || !['xer', 'csv', 'mspdi_xml'].includes(format)) {
      return Response.json(
        { error: 'format must be one of: xer, csv, mspdi_xml' },
        { status: 400 }
      );
    }

    // Resolve version ID
    let versionId = requestedVersionId;
    if (!versionId) {
      const [proj] = await db
        .select({ active_version_id: projects.active_version_id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!proj?.active_version_id) {
        return Response.json(
          { error: 'Project not found or no active version' },
          { status: 404 }
        );
      }
      versionId = proj.active_version_id;
    }

    // Load schedule version for XER raw tables and confidence
    const [version] = await db
      .select()
      .from(schedule_versions)
      .where(
        and(
          eq(schedule_versions.id, versionId),
          eq(schedule_versions.project_id, projectId)
        )
      )
      .limit(1);

    if (!version) {
      return Response.json({ error: 'Version not found' }, { status: 404 });
    }

    // Build canonical schedule
    const schedule = await buildCanonicalSchedule(projectId, versionId);

    // Run validation
    const validationResult = validateSchedule(schedule);

    // XER: block if errors
    if (format === 'xer' && !validationResult.canExport) {
      return Response.json(
        {
          error: 'Schedule has validation errors that prevent XER export',
          validation: validationResult,
        },
        { status: 422 }
      );
    }

    // XER: check parse_health confidence
    const parseHealth = version.parse_health as Record<string, unknown> | null;
    const confidence = parseHealth?.confidence as string | undefined;

    if (format === 'xer' && confidence === 'failed') {
      return Response.json(
        {
          error: 'XER export unavailable: original file parse failed',
          reason: parseHealth?.summary ?? 'Parse confidence is "failed"',
          validation: validationResult,
        },
        { status: 422 }
      );
    }

    let fileBuffer: Buffer;
    let contentType: string;
    let filename: string;

    if (format === 'xer') {
      // Load raw tables and changes
      const rawTables = version.xer_raw_tables as XerRawTables | null;
      if (!rawTables) {
        return Response.json(
          { error: 'XER raw tables not available for this version' },
          { status: 422 }
        );
      }

      const changes = await db
        .select()
        .from(schedule_changes)
        .where(eq(schedule_changes.project_id, projectId));

      fileBuffer = writeXerRoundTrip(rawTables, changes);
      contentType = 'application/octet-stream';
      filename = `schedule-${projectId}.xer`;
    } else if (format === 'csv') {
      const csvText = writeScheduleCsv(schedule);
      fileBuffer = Buffer.from(csvText, 'utf-8');
      contentType = 'text/csv; charset=utf-8';
      filename = `schedule-${projectId}.csv`;
    } else {
      // mspdi_xml
      const xmlText = writeScheduleMspdi(schedule);
      fileBuffer = Buffer.from(xmlText, 'utf-8');
      contentType = 'application/xml; charset=utf-8';
      filename = `schedule-${projectId}.xml`;
    }

    // Build response headers
    const headers = new Headers({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(fileBuffer.byteLength),
    });

    // For CSV and MSPDI, include validation issues in a header (JSON)
    if (format !== 'xer' && validationResult.issues.length > 0) {
      headers.set(
        'X-Validation-Issues',
        JSON.stringify({
          errorCount: validationResult.errorCount,
          warningCount: validationResult.warningCount,
          infoCount: validationResult.infoCount,
        })
      );
    }

    return new Response(new Uint8Array(fileBuffer), { status: 200, headers });
  } catch (error) {
    console.error('POST /api/export error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

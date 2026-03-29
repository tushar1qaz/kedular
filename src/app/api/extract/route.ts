import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

interface ExtractedActivity {
  code: string;
  name: string;
  duration: number;
  predecessors: string[];
  isMilestone: boolean;
}

interface ExtractedRelationship {
  predecessorCode: string;
  successorCode: string;
  type: string;
  lagDays: number;
}

interface ExtractionResult {
  projectName: string;
  activities: ExtractedActivity[];
  relationships: ExtractedRelationship[];
  confidence: number;
  notes: string;
}

// In-memory cache for extraction results (keyed by file hash)
const extractionCache = new Map<string, ExtractionResult>();

const EXTRACTION_PROMPT = `You are a schedule extraction expert. Extract all project activities and relationships from the provided document.

Return a JSON object with this exact structure:
{
  "projectName": "string (project name from document, or 'Extracted Project' if not found)",
  "activities": [
    {
      "code": "DOC-001",
      "name": "Activity Name",
      "duration": 10,
      "predecessors": ["DOC-001"],
      "isMilestone": false
    }
  ],
  "relationships": [
    {
      "predecessorCode": "DOC-001",
      "successorCode": "DOC-002",
      "type": "FS",
      "lagDays": 0
    }
  ],
  "confidence": 0.85,
  "notes": "Any notes about ambiguous data or assumptions made"
}

Rules:
- Auto-generate codes as DOC-001, DOC-002, DOC-003, etc.
- Duration should be in working days
- Relationship types: FS (Finish-Start), SS (Start-Start), FF (Finish-Finish), SF (Start-Finish)
- If predecessors are ambiguous, note them in the notes field
- Milestones have duration = 0
- confidence is 0.0 to 1.0 based on how well-structured the source data is
- Return ONLY the JSON, no markdown code blocks or other text`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'Claude API key not configured. Set ANTHROPIC_API_KEY in environment variables.' },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const projectId = formData.get('projectId') as string | null;

  if (!file) {
    return Response.json({ error: 'file is required' }, { status: 400 });
  }
  if (!projectId) {
    return Response.json({ error: 'projectId is required' }, { status: 400 });
  }

  // Read file content
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash('sha256').update(buffer).digest('hex');

  // Check cache
  const cached = extractionCache.get(fileHash);
  if (cached) {
    return Response.json(cached);
  }

  // Extract text from file
  let textContent: string;
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.pdf')) {
    // Basic text extraction from PDF (full PDF parsing is future work)
    // Try to extract readable text from the buffer
    textContent = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();
    if (!textContent || textContent.length < 50) {
      textContent = `[PDF file: ${file.name}. Binary content could not be extracted as text. Please provide a text-based schedule document.]`;
    }
  } else {
    // Text file: try UTF-8, fall back to latin1
    textContent = buffer.toString('utf-8');
    if (!textContent || textContent.length < 5) {
      textContent = buffer.toString('latin1');
    }
  }

  // Limit content length to avoid token limits
  const maxContentLength = 30000;
  if (textContent.length > maxContentLength) {
    textContent = textContent.slice(0, maxContentLength) + '\n[...content truncated...]';
  }

  const client = new Anthropic({ apiKey });

  let extractionResult: ExtractionResult;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `${EXTRACTION_PROMPT}\n\nDocument content:\n\n${textContent}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // Parse JSON from response — Claude should return raw JSON per instructions
    let jsonStr = textBlock.text.trim();
    // Strip markdown code blocks if present despite instructions
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '');
    }

    const parsed = JSON.parse(jsonStr) as Partial<ExtractionResult>;

    // Validate and normalize
    extractionResult = {
      projectName: parsed.projectName ?? 'Extracted Project',
      activities: (parsed.activities ?? []).map((a, i) => ({
        code: a.code ?? `DOC-${String(i + 1).padStart(3, '0')}`,
        name: a.name ?? `Activity ${i + 1}`,
        duration: typeof a.duration === 'number' ? a.duration : 0,
        predecessors: Array.isArray(a.predecessors) ? a.predecessors : [],
        isMilestone: a.isMilestone ?? a.duration === 0,
      })),
      relationships: (parsed.relationships ?? []).map((r) => ({
        predecessorCode: r.predecessorCode ?? '',
        successorCode: r.successorCode ?? '',
        type: r.type ?? 'FS',
        lagDays: typeof r.lagDays === 'number' ? r.lagDays : 0,
      })),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
      notes: parsed.notes ?? '',
    };

    // Cache the result
    extractionCache.set(fileHash, extractionResult);

    return Response.json(extractionResult);
  } catch (err) {
    console.error('Extraction error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Extraction failed' },
      { status: 500 }
    );
  }
}

import Papa from 'papaparse';

export interface ColumnMapping {
  taskId: string | null;       // "ID", "Nr"
  taskName: string | null;     // "Name", "Task Name"
  duration: string | null;     // "Duration", "Dauer"
  start: string | null;        // "Start", "Anfang"
  finish: string | null;       // "Finish", "Ende"
  predecessors: string | null; // "Predecessors", "Vorgänger"
  percentComplete: string | null;
  resourceNames: string | null;
  wbs: string | null;
  outlineLevel: string | null;
  milestone: string | null;
  notes: string | null;
}

export interface ParsedCsvRelationship {
  predecessorId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}

export function parsePredecessorString(value: string): ParsedCsvRelationship[] {
  if (!value || value.trim() === '') return [];

  // MS Project format: "3FS+2 days,5SS-1 day,8"
  const parts = value.split(',').map(p => p.trim());
  const relationships: ParsedCsvRelationship[] = [];

  for (const part of parts) {
    const match = part.match(/^(\d+)(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*(days|day|d)?/i);
    if (match) {
      const predId = match[1];
      const type = (match[2]?.toUpperCase() || 'FS') as 'FS' | 'SS' | 'FF' | 'SF';
      let lagDays = 0;
      if (match[3]) {
        lagDays = parseInt(match[3].replace(/\s+/g, ''));
      }
      relationships.push({ predecessorId: predId, type, lagDays });
    }
  }

  return relationships;
}

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    taskId: null,
    taskName: null,
    duration: null,
    start: null,
    finish: null,
    predecessors: null,
    percentComplete: null,
    resourceNames: null,
    wbs: null,
    outlineLevel: null,
    milestone: null,
    notes: null,
  };

  const patterns = {
    taskId: /^(ID|Nr|N°|Unique ID)$/i,
    taskName: /^(Name|Task Name|Nom|Vorgangsname)$/i,
    duration: /^(Duration|Dauer|Durée)$/i,
    start: /^(Start|Anfang|Début)$/i,
    finish: /^(Finish|Ende|Fin)$/i,
    predecessors: /^(Predecessors|Vorgänger|Prédécesseurs)$/i,
    percentComplete: /^(% Complete|% Abgeschlossen|% achevé)$/i,
    resourceNames: /^(Resource Names|Ressourcennamen|Noms ressources)$/i,
    wbs: /^(WBS)$/i,
    outlineLevel: /^(Outline Level|Gliederungsebene|Niveau de structure)$/i,
    milestone: /^(Milestone|Meilenstein|Jalon)$/i,
    notes: /^(Notes|Notizen|Remarques)$/i,
  };

  for (const header of headers) {
    for (const [key, pattern] of Object.entries(patterns)) {
      if (pattern.test(header) && !(mapping as any)[key]) {
        (mapping as any)[key] = header;
        break;
      }
    }
  }

  return mapping;
}

export function parseCsvSchedule(
  fileContent: string,
  confirmedMapping?: ColumnMapping
): { detectedMapping: ColumnMapping; rows: Record<string, string>[]; headers: string[] } {
  const result = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = result.meta.fields || [];
  const detectedMapping = confirmedMapping || autoDetectMapping(headers);

  return {
    detectedMapping,
    rows: result.data as Record<string, string>[],
    headers,
  };
}

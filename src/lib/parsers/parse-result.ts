import { ParseError, ParseWarning } from './xer-errors';
import { ParseConfidence, ParseStats } from './parse-health';

export type { ParseConfidence };

export interface ParseResult<T> {
  data: T | null;
  confidence: ParseConfidence;
  errors: ParseError[];
  warnings: ParseWarning[];
  stats: ParseStats;
}

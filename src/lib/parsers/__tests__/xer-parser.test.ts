import { describe, it, expect } from 'vitest';
import { parseXer } from '../xer-parser';
import fs from 'fs';
import path from 'path';

describe('XER Parser', () => {
  const samplePath = 'C:\\reference xer\\AIRORTS\\TERMINAL BUILDING-AIRPORT.xer';

  it('should parse a real-world XER file', () => {
    const content = fs.readFileSync(samplePath, 'utf8');
    const result = parseXer(content);

    expect(result.errors).toHaveLength(0);
    expect(result.projects.length).toBeGreaterThan(0);
    expect(result.activities.length).toBeGreaterThan(0);
    expect(result.relationships.length).toBeGreaterThan(0);
    
    // Check specific project data
    const project = result.projects[0];
    expect(project.proj_short_name).toBeDefined();
    
    // Check activity fields
    const activity = result.activities[0];
    expect(activity.task_code).toBeDefined();
    expect(activity.task_name).toBeDefined();
    expect(activity._raw).toBeDefined();
  });

  it('should handle empty files gracefully', () => {
    const result = parseXer('');
    expect(result.errors.some(e => e.code === 'FILE_EMPTY')).toBe(true);
  });

  it('should handle invalid XER headers', () => {
    const result = parseXer('NOT_AN_XER\n%T\tSOME_TABLE');
    expect(result.errors.some(e => e.code === 'NO_ERMHDR')).toBe(true);
  });
});

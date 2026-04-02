import path from 'path';
import fs from 'fs';

/** Кандидаты путей к статичному JSON canonical roadmap для subjectId (Notion: Sprint 0, JSON в репозитории). */
export function resolveCanonicalRoadmapFilePaths(subjectId: string): string[] {
  const file = `${subjectId}.json`;
  const fromEnv = process.env.CANONICAL_ROADMAP_DIR?.trim();
  const out: string[] = [];
  if (fromEnv) {
    out.push(path.join(fromEnv, file));
  }
  const cwd = process.cwd();
  out.push(path.join(cwd, 'data', 'canonical-roadmaps', file));
  out.push(path.join(cwd, 'server', 'data', 'canonical-roadmaps', file));
  return [...new Set(out)];
}

export function firstExistingCanonicalRoadmapFile(subjectId: string): string | null {
  for (const p of resolveCanonicalRoadmapFilePaths(subjectId)) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

import { ICanonicalRoadmapNode } from '../types/roadmap.types';
import { AppError } from './AppError';

/**
 * Разбор статичного canonical roadmap из JSON (Notion: структура в файле / вставке).
 * Допустимо: `{ "version": 1, "nodes": [...] }`, `{ "nodes": [...] }` или массив узлов.
 */
export function parseCanonicalNodesFromPayload(raw: unknown): {
  nodes: ICanonicalRoadmapNode[];
  version?: number;
  /** Описание карты целиком (если задано в JSON) */
  description?: string;
} {
  if (raw === null || raw === undefined) {
    throw AppError.badRequest('Пустой JSON');
  }
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      throw AppError.badRequest('Невалидный JSON');
    }
  }

  let nodesRaw: unknown;
  let version: number | undefined;
  let description: string | undefined;

  if (Array.isArray(obj)) {
    nodesRaw = obj;
  } else if (typeof obj === 'object' && obj !== null) {
    const o = obj as Record<string, unknown>;
    version = typeof o.version === 'number' ? o.version : undefined;
    if (typeof o.description === 'string' && o.description.trim()) {
      description = o.description.trim();
    }
    nodesRaw = o.nodes;
  } else {
    throw AppError.badRequest('Ожидается объект с полем nodes или массив узлов');
  }

  if (!Array.isArray(nodesRaw) || nodesRaw.length === 0) {
    throw AppError.badRequest('nodes должен быть непустым массивом');
  }

  const nodes: ICanonicalRoadmapNode[] = nodesRaw.map((n: unknown) => {
    const row = n as Record<string, unknown>;
    const desc =
      typeof row.description === 'string' && row.description.trim()
        ? row.description.trim()
        : undefined;
    return {
      nodeId: String(row.nodeId),
      title: String(row.title),
      ...(desc ? { description: desc } : {}),
      prerequisites: Array.isArray(row.prerequisites) ? row.prerequisites.map(String) : [],
      metadata:
        row.metadata && typeof row.metadata === 'object' && row.metadata !== null
          ? (row.metadata as Record<string, unknown>)
          : undefined
    };
  });

  return { nodes, version, ...(description ? { description } : {}) };
}

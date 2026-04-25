import { ICanonicalRoadmapNode } from '../types/roadmap.types';
import { AppError } from './AppError';

/** Проверка: уникальные nodeId, все prerequisites существуют, граф без циклов (Kahn). */
export function assertValidCanonicalNodes(nodes: ICanonicalRoadmapNode[]): void {
  if (!nodes.length) {
    throw AppError.badRequest('Roadmap must contain at least one node');
  }
  if (nodes.length > 2000) {
    throw AppError.badRequest('Too many nodes (max 2000)');
  }

  const ids = new Set<string>();
  for (const n of nodes) {
    if (!n.nodeId?.trim() || !n.title?.trim()) {
      throw AppError.badRequest('Each node must have nodeId and title');
    }
    if (ids.has(n.nodeId)) throw AppError.badRequest(`Duplicate nodeId: ${n.nodeId}`);
    ids.add(n.nodeId);
  }

  for (const n of nodes) {
    for (const p of n.prerequisites || []) {
      if (!ids.has(p)) {
        throw AppError.badRequest(`Unknown prerequisite "${p}" for node ${n.nodeId}`);
      }
    }
  }

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of ids) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }
  for (const n of nodes) {
    const deg = n.prerequisites?.length ?? 0;
    inDegree.set(n.nodeId, deg);
    for (const p of n.prerequisites || []) {
      adj.get(p)!.push(n.nodeId);
    }
  }

  const queue: string[] = [];
  for (const [id, d] of inDegree) {
    if (d === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length) {
    const u = queue.shift()!;
    processed++;
    for (const v of adj.get(u) || []) {
      const next = inDegree.get(v)! - 1;
      inDegree.set(v, next);
      if (next === 0) queue.push(v);
    }
  }

  if (processed !== ids.size) {
    throw AppError.badRequest('Prerequisites form a cycle; fix the graph');
  }
}

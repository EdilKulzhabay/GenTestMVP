/**
 * Превращает DAG узлов roadmap в дерево для UI: у каждого узла с prerequisites
 * выбирается один «родитель для отображения» — prerequisite с максимальной глубиной в графе.
 */

export interface RoadmapNodeShape {
  nodeId: string;
  prerequisites: string[];
}

function computeDepths<T extends RoadmapNodeShape>(nodes: T[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const memo = new Map<string, number>();

  function depth(id: string): number {
    if (memo.has(id)) return memo.get(id)!;
    const n = byId.get(id);
    if (!n || n.prerequisites.length === 0) {
      memo.set(id, 0);
      return 0;
    }
    const d = 1 + Math.max(...n.prerequisites.map((p) => depth(p)));
    memo.set(id, d);
    return d;
  }

  for (const n of nodes) {
    depth(n.nodeId);
  }
  return memo;
}

export function buildRoadmapDisplayTree<T extends RoadmapNodeShape>(nodes: T[]): {
  roots: T[];
  childMap: Map<string, T[]>;
} {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const depths = computeDepths(nodes);
  const childMap = new Map<string, T[]>();
  const roots: T[] = [];

  for (const n of nodes) {
    if (n.prerequisites.length === 0) {
      roots.push(n);
      continue;
    }
    const parentId = n.prerequisites.reduce((a, b) =>
      (depths.get(b) ?? 0) > (depths.get(a) ?? 0) ? b : a
    );
    if (!byId.has(parentId)) {
      roots.push(n);
      continue;
    }
    const list = childMap.get(parentId) ?? [];
    list.push(n);
    childMap.set(parentId, list);
  }

  for (const [, list] of childMap) {
    list.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  }
  roots.sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  return { roots, childMap };
}

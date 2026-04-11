import React, { useMemo } from 'react';
import { buildRoadmapDisplayTree } from '../../utils/roadmapTree';
import { Button } from '../ui/Button';
import type { PersonalRoadmapNode } from '../../types/roadmap.types';

const AVAIL_RU: Record<string, string> = {
  locked: 'Заблокировано',
  available: 'Доступно'
};

const PROG_RU: Record<string, string> = {
  not_started: 'Не начато',
  in_progress: 'В процессе',
  mastered: 'Пройдено'
};

const REASON_RU: Record<string, string> = {
  CONTINUE_IN_PROGRESS: 'Вы уже начали эту тему',
  UNLOCKS_NEXT_TOPICS: 'Откроет следующие темы',
  LOW_MASTERY: 'Нужно подтянуть',
  PART_OF_MAIN_PATH: 'Основной путь обучения',
  NOT_STARTED: 'Следующий по порядку'
};

function badgeClass(kind: 'avail' | 'prog' | 'neutral'): string {
  const base = 'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold';
  if (kind === 'avail') return `${base} bg-sky-100 text-sky-800`;
  if (kind === 'prog') return `${base} bg-amber-100 text-amber-900`;
  return `${base} bg-slate-100 text-slate-700`;
}

export type CanonicalTreeNode = {
  nodeId: string;
  title: string;
  description?: string;
  prerequisites: string[];
  metadata?: Record<string, unknown>;
};

type TreeMode = 'personal' | 'canonical';

function Branch(props: {
  node: CanonicalTreeNode;
  depth: number;
  childMap: Map<string, CanonicalTreeNode[]>;
  mode: TreeMode;
  personalById: Map<string, PersonalRoadmapNode>;
  onStartTest?: (nodeId: string) => void;
}): React.ReactElement {
  const { node, depth, childMap, mode, personalById, onStartTest } = props;
  const children = childMap.get(node.nodeId) ?? [];
  const personal = mode === 'personal' ? personalById.get(node.nodeId) : undefined;

  const isLocked = personal?.availability === 'locked';
  const canStartTest =
    personal && personal.availability === 'available' && personal.progressStatus !== 'mastered';

  const cardStyle =
    mode === 'personal'
      ? isLocked
        ? 'border-slate-100 bg-slate-50 opacity-70'
        : personal?.isRecommended
          ? 'border-blue-200 bg-blue-50/50'
          : personal?.progressStatus === 'mastered'
            ? 'border-emerald-200 bg-emerald-50/25'
            : 'border-slate-200 bg-white'
      : 'border-slate-200 bg-white';

  return (
    <li className="list-none">
      <div
        className={`rounded-xl border p-3 shadow-sm ${cardStyle}`}
        style={{ marginLeft: depth === 0 ? 0 : Math.min(depth * 12, 72) }}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={`font-medium ${isLocked ? 'text-slate-400' : 'text-slate-900'}`}>
              {isLocked && <span className="mr-1">🔒</span>}
              {node.title}
            </p>
            {node.description ? (
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{node.description}</p>
            ) : null}
            <p className="mt-1 font-mono text-[10px] text-slate-400">{node.nodeId}</p>
            {mode === 'personal' && personal && (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={badgeClass(isLocked ? 'neutral' : 'avail')}>
                  {AVAIL_RU[personal.availability] ?? personal.availability}
                </span>
                <span className={badgeClass('prog')}>
                  {PROG_RU[personal.progressStatus] ?? personal.progressStatus}
                </span>
                {personal.isRecommended && <span className={badgeClass('neutral')}>Рекомендуем</span>}
              </div>
            )}
            {mode === 'personal' && personal?.isRecommended && personal.recommendedReason && (
              <p className="mt-1 text-xs text-blue-600">
                {REASON_RU[personal.recommendedReason] ?? personal.recommendedReason}
              </p>
            )}
          </div>
          {mode === 'personal' && personal && (
            <div className="flex flex-col items-end gap-2 text-xs text-slate-600">
              {personal.attemptsCount > 0 && (
                <div className="text-right">
                  <p>Лучший: {personal.bestScore}%</p>
                  <p>Попыток: {personal.attemptsCount}</p>
                </div>
              )}
              {canStartTest && onStartTest && (
                <Button
                  onClick={() => onStartTest(node.nodeId)}
                  variant={personal.isRecommended ? undefined : 'outline'}
                  className="text-xs"
                >
                  {personal.progressStatus === 'in_progress' ? 'Продолжить' : 'Пройти тест'}
                </Button>
              )}
              {personal.progressStatus === 'mastered' && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  ✓ Освоено
                </span>
              )}
            </div>
          )}
        </div>
        {isLocked && personal && personal.prerequisites.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            Сначала освойте: {personal.prerequisites.join(', ')}
          </p>
        )}
        {mode === 'personal' && personal?.aiHint && (
          <p className="mt-2 border-t border-slate-100 pt-2 text-sm text-slate-600">{personal.aiHint}</p>
        )}
        {mode === 'canonical' && node.metadata && Object.keys(node.metadata).length > 0 && (
          <details className="mt-2 text-xs text-slate-500">
            <summary className="cursor-pointer text-slate-600">Метаданные</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[11px]">
              {JSON.stringify(node.metadata, null, 2)}
            </pre>
          </details>
        )}
        {children.length > 0 && (
          <ul className="mt-3 space-y-2 border-l-2 border-emerald-200/80 pl-3">
            {children.map((ch) => (
              <Branch
                key={ch.nodeId}
                node={ch}
                depth={depth + 1}
                childMap={childMap}
                mode={mode}
                personalById={personalById}
                onStartTest={onStartTest}
              />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export interface RoadmapTreeViewProps {
  mode: TreeMode;
  nodes: CanonicalTreeNode[];
  personalById?: Map<string, PersonalRoadmapNode>;
  onStartTest?: (nodeId: string) => void;
  className?: string;
}

export const RoadmapTreeView: React.FC<RoadmapTreeViewProps> = ({
  mode,
  nodes,
  personalById,
  onStartTest,
  className = ''
}) => {
  const { roots, childMap } = useMemo(() => buildRoadmapDisplayTree(nodes), [nodes]);
  const pmap = personalById ?? new Map<string, PersonalRoadmapNode>();

  return (
    <ul className={`space-y-3 ${className}`}>
      {roots.map((root) => (
        <Branch
          key={root.nodeId}
          node={root}
          depth={0}
          childMap={childMap}
          mode={mode}
          personalById={pmap}
          onStartTest={mode === 'personal' ? onStartTest : undefined}
        />
      ))}
    </ul>
  );
};

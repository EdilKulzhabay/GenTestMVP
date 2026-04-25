import type { GeneratedTest } from '../types/test.types';

const TRIAL_SESSION_KEY = 'gen-test:trial-session';
const PENDING_TRIAL_MERGE_KEY = 'gen-test:pending-trial-merge';

export interface TrialStep {
  subjectId: string;
  subjectTitle: string;
  bookId: string;
  chapterId: string;
  nodeId: string;
  chapterTitle: string;
  topicTitle: string;
  questionCount: number;
  trialBlockLabel: string;
  /** Генерация по всей книге (пробник ВНО) */
  useFullBook: boolean;
}

export interface TrialResultRow {
  subjectId: string;
  nodeId: string;
  scorePercent: number;
  subjectTitle: string;
  chapterTitle: string;
  topicTitle: string;
}

export type TrialTopicMasteryRow = { subjectId: string; nodeId: string; scorePercent: number };

export interface TrialSessionState {
  steps: TrialStep[];
  currentIndex: number;
  results: TrialResultRow[];
  /** Накоплено по шагам: темы ≥ 80% (для персонального роадмапа) */
  topicMasteryRows?: TrialTopicMasteryRow[];
}

export function getTrialSession(): TrialSessionState | null {
  const raw = sessionStorage.getItem(TRIAL_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TrialSessionState;
  } catch {
    return null;
  }
}

export function startTrialSession(steps: TrialStep[]): void {
  const state: TrialSessionState = { steps, currentIndex: 0, results: [], topicMasteryRows: [] };
  sessionStorage.setItem(TRIAL_SESSION_KEY, JSON.stringify(state));
}

export function setTrialSession(state: TrialSessionState): void {
  sessionStorage.setItem(TRIAL_SESSION_KEY, JSON.stringify(state));
}

export function clearTrialSession(): void {
  sessionStorage.removeItem(TRIAL_SESSION_KEY);
}

/**
 * Записать результат текущего шага пробника. Возвращает обновлённое состояние или null, если не режим пробника.
 */
function mergeTopicMasteryDedup(rows: TrialTopicMasteryRow[]): TrialTopicMasteryRow[] {
  const m = new Map<string, TrialTopicMasteryRow>();
  for (const r of rows) {
    const k = `${r.subjectId}\x1f${r.nodeId}`;
    const prev = m.get(k);
    if (!prev || r.scorePercent > prev.scorePercent) m.set(k, r);
  }
  return Array.from(m.values());
}

export function appendTrialStepResult(
  scorePercent: number,
  test: GeneratedTest,
  trialTopicMasteryFromServer?: TrialTopicMasteryRow[]
): TrialSessionState | null {
  const s = getTrialSession();
  if (!s || s.currentIndex >= s.steps.length) return null;
  const step = s.steps[s.currentIndex];
  const testChapter = test.chapterId?.toString() ?? '';
  const okBook =
    step.subjectId === test.subjectId &&
    step.bookId === test.bookId &&
    (step.useFullBook ? !testChapter : testChapter === step.chapterId);
  if (!okBook) {
    return null;
  }
  s.results.push({
    subjectId: step.subjectId,
    nodeId: step.nodeId,
    scorePercent,
    subjectTitle: step.subjectTitle,
    chapterTitle: step.chapterTitle,
    topicTitle: step.topicTitle
  });
  const prev = s.topicMasteryRows ?? [];
  s.topicMasteryRows = mergeTopicMasteryDedup([...prev, ...(trialTopicMasteryFromServer ?? [])]);
  s.currentIndex += 1;
  setTrialSession(s);
  return s;
}

export interface PendingTrialMergePayload {
  results: TrialResultRow[];
  topicMasteryRows: TrialTopicMasteryRow[];
}

export function savePendingTrialMergeForLogin(payload: PendingTrialMergePayload): void {
  localStorage.setItem(PENDING_TRIAL_MERGE_KEY, JSON.stringify(payload));
}

export function getPendingTrialMerge(): PendingTrialMergePayload | null {
  const raw = localStorage.getItem(PENDING_TRIAL_MERGE_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { results?: TrialResultRow[]; topicMasteryRows?: TrialTopicMasteryRow[] };
    if (!Array.isArray(o.results)) return null;
    return {
      results: o.results,
      topicMasteryRows: Array.isArray(o.topicMasteryRows) ? o.topicMasteryRows : []
    };
  } catch {
    return null;
  }
}

export function clearPendingTrialMerge(): void {
  localStorage.removeItem(PENDING_TRIAL_MERGE_KEY);
}

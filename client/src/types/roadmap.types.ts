export type RoadmapAvailability = 'locked' | 'available';
export type RoadmapProgressStatus = 'not_started' | 'in_progress' | 'mastered';

export interface CanonicalRoadmapSourceMeta {
  bookId?: string;
  bookTitle?: string;
  bookAuthor?: string;
  chapterTitle?: string;
  fullBook?: boolean;
  contentLanguage?: string;
}

export interface CanonicalRoadmapResponse {
  subjectId: string;
  version: number;
  nodes: Array<{
    nodeId: string;
    title: string;
    prerequisites: string[];
    metadata?: Record<string, unknown>;
  }>;
  /** Источник генерации карты (книга/глава) */
  sourceMeta?: CanonicalRoadmapSourceMeta;
}

export interface PersonalRoadmapNode {
  nodeId: string;
  title: string;
  prerequisites: string[];
  metadata?: Record<string, unknown>;
  availability: RoadmapAvailability;
  progressStatus: RoadmapProgressStatus;
  attemptsCount: number;
  lastAttemptAt?: string;
  bestScore: number;
  avgScore: number;
  masteryScore: number;
  isRecommended: boolean;
  recommendedPriority: number;
  recommendedReason: string;
  /** Подсказка от ИИ (если запрошен слой ai=1) */
  aiHint?: string;
}

export interface PersonalRoadmapResponse {
  version: number;
  subjectId: string;
  nodes: PersonalRoadmapNode[];
  nextRecommended: { nodeId: string; reason: string; priority: number } | null;
  topRecommendations: Array<{
    nodeId: string;
    title: string;
    reason: string;
    priority: number;
  }>;
  /** Слой ИИ: коучинг и пояснение следующего шага (GET .../personal?ai=1) */
  ai?: {
    coachSummary: string;
    nextStepExplanation?: string;
  };
}

export interface RoadmapTestSubmittedResponse {
  idempotent: boolean;
  updatedNodesDelta: Array<{ nodeId: string; progressStatus: RoadmapProgressStatus }>;
  nextRecommended: PersonalRoadmapResponse['nextRecommended'];
  topRecommendations: PersonalRoadmapResponse['topRecommendations'];
}

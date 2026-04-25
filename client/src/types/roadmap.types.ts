export type RoadmapAvailability = 'locked' | 'available';

export interface CanonicalRoadmapSourceMeta {
  bookId?: string;
  bookTitle?: string;
  bookAuthor?: string;
  chapterTitle?: string;
  fullBook?: boolean;
  contentLanguage?: string;
}

export interface CanonicalRoadmapNodeDto {
  nodeId: string;
  title: string;
  description?: string;
  prerequisites: string[];
  metadata?: Record<string, unknown>;
  chapterUrl?: string;
  bookId?: string;
  chapterId?: string;
  topicId?: string;
  testId?: string;
}

export interface CanonicalRoadmapResponse {
  subjectId: string;
  version: number;
  description?: string;
  nodes: CanonicalRoadmapNodeDto[];
  sourceMeta?: CanonicalRoadmapSourceMeta;
}

export interface PersonalRoadmapNode {
  nodeId: string;
  title: string;
  description?: string;
  prerequisites: string[];
  metadata?: Record<string, unknown>;
  availability: RoadmapAvailability;
  mastered: boolean;
  chapterUrl?: string;
  bookId?: string;
  chapterId?: string;
  topicId?: string;
  testId?: string;
  lowScoreFailCount: number;
  knowledgeMapTestBlocked: boolean;
  isRecommended: boolean;
  recommendedPriority: number;
  recommendedReason: string;
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
  ai?: {
    coachSummary: string;
    nextStepExplanation?: string;
  };
}

export interface RoadmapTestSubmittedResponse {
  idempotent: boolean;
  updatedNodesDelta: Array<{ nodeId: string; mastered: boolean }>;
  nextRecommended: PersonalRoadmapResponse['nextRecommended'];
  topRecommendations: PersonalRoadmapResponse['topRecommendations'];
}

export interface RoadmapPickerSubjectItem {
  subjectId: string;
  title: string;
  subtitle?: string;
  roadmapConfigured: boolean;
  isRoadmapAvailable: boolean;
  progressPercent: number;
  progressStatus: 'not_started' | 'in_progress' | 'completed';
  nodesTotal: number;
  nodesMastered: number;
}

export interface RoadmapLessonResponse {
  nodeId: string;
  lessonId: string;
  title: string;
  summary: string;
  content: string;
  contentFormat: 'markdown' | 'html';
  textFormat?: 'markdown' | 'html';
  video: { url: string; durationSec?: number; posterUrl?: string } | null;
  readCompletedAt: string | null;
}

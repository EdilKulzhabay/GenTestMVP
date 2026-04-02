import { Types } from 'mongoose';

export type RoadmapAvailability = 'locked' | 'available';
export type RoadmapProgressStatus = 'not_started' | 'in_progress' | 'mastered';

export interface ICanonicalRoadmapNode {
  nodeId: string;
  title: string;
  prerequisites: string[];
  metadata?: Record<string, unknown>;
}

/** Откуда сгенерирована статичная карта (книга/глава) — для UI и трассировки */
export interface ICanonicalRoadmapSourceMeta {
  bookId?: string;
  bookTitle?: string;
  bookAuthor?: string;
  chapterTitle?: string;
  fullBook?: boolean;
  contentLanguage?: string;
}

export interface ICanonicalRoadmap {
  _id?: Types.ObjectId;
  subjectId: Types.ObjectId;
  version: number;
  nodes: ICanonicalRoadmapNode[];
  sourceMeta?: ICanonicalRoadmapSourceMeta;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserRoadmapNodeProgress {
  nodeId: string;
  attemptsCount: number;
  lastAttemptAt?: Date;
  bestScore: number;
  avgScore: number;
  sumScores: number;
  masteryScore: number;
  progressStatus: RoadmapProgressStatus;
}

export interface IUserRoadmapProgress {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  subjectId: Types.ObjectId;
  canonicalVersion: number;
  nodes: IUserRoadmapNodeProgress[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IRoadmapAttempt {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  sessionId: string;
  subjectId: Types.ObjectId;
  nodeId: string;
  scorePercent: number;
  submittedAt: Date;
  createdAt?: Date;
}

export interface IPersonalRoadmapNodeView {
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
  /** Краткая ИИ-подсказка по узлу (если запрошен слой AI) */
  aiHint?: string;
}

export interface INextRecommended {
  nodeId: string;
  reason: string;
  priority: number;
}

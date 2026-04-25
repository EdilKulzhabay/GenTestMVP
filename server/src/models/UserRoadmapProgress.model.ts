import mongoose, { Schema, Document, Model } from 'mongoose';
import { IUserRoadmapProgress, IUserRoadmapNodeProgress } from '../types/roadmap.types';

const NodeProgressSchema = new Schema<IUserRoadmapNodeProgress>(
  {
    nodeId: { type: String, required: true },
    mastered: { type: Boolean, required: true, default: false },
    bestScore: { type: Number, required: true, default: 0, min: 0, max: 100 },
    lowScoreFailCount: { type: Number, default: 0, min: 0 },
    lessonReadAt: { type: Date }
  },
  { _id: false }
);

type Doc = Document & Omit<IUserRoadmapProgress, '_id'>;

const UserRoadmapProgressSchema = new Schema<Doc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    canonicalVersion: { type: Number, required: true, min: 1 },
    nodes: { type: [NodeProgressSchema], default: [] }
  },
  { timestamps: true, collection: 'user_roadmap_progress' }
);

UserRoadmapProgressSchema.index({ userId: 1, subjectId: 1 }, { unique: true });

export const UserRoadmapProgress: Model<Doc> = mongoose.model<Doc>(
  'UserRoadmapProgress',
  UserRoadmapProgressSchema
);

/** Нормализация документа после смены схемы (старые поля progressStatus / attemptsCount) */
export function normalizeStoredNodeProgress(raw: unknown): IUserRoadmapNodeProgress {
  const p = raw as Record<string, unknown> & { nodeId?: string };
  const nodeId = String(p.nodeId ?? '');
  const lessonReadAt = p.lessonReadAt instanceof Date ? p.lessonReadAt : undefined;

  if (typeof p.mastered === 'boolean' && typeof p.bestScore === 'number') {
    const low =
      typeof p.lowScoreFailCount === 'number' && p.lowScoreFailCount >= 0
        ? Math.min(100, Math.floor(p.lowScoreFailCount))
        : 0;
    return {
      nodeId,
      mastered: p.mastered,
      bestScore: p.bestScore,
      ...(low > 0 ? { lowScoreFailCount: low } : {}),
      ...(lessonReadAt ? { lessonReadAt } : {})
    };
  }

  const legacyStatus = p.progressStatus as string | undefined;
  const legacyBest = typeof p.bestScore === 'number' ? p.bestScore : 0;
  const mastered = legacyStatus === 'mastered' || (typeof p.mastered === 'boolean' && p.mastered);
  return {
    nodeId,
    mastered,
    bestScore: mastered ? Math.max(legacyBest, 70) : legacyBest,
    ...(typeof p.lowScoreFailCount === 'number' && p.lowScoreFailCount > 0
      ? { lowScoreFailCount: p.lowScoreFailCount }
      : {}),
    ...(lessonReadAt ? { lessonReadAt } : {})
  };
}

import mongoose, { Schema, Document, Model } from 'mongoose';
import { IUserRoadmapProgress, IUserRoadmapNodeProgress } from '../types/roadmap.types';

const NodeProgressSchema = new Schema<IUserRoadmapNodeProgress>(
  {
    nodeId: { type: String, required: true },
    attemptsCount: { type: Number, required: true, default: 0, min: 0 },
    lastAttemptAt: { type: Date },
    bestScore: { type: Number, required: true, default: 0, min: 0, max: 100 },
    avgScore: { type: Number, required: true, default: 0, min: 0, max: 100 },
    sumScores: { type: Number, required: true, default: 0, min: 0 },
    masteryScore: { type: Number, required: true, default: 0, min: 0, max: 1 },
    progressStatus: {
      type: String,
      enum: ['not_started', 'in_progress', 'mastered'],
      required: true,
      default: 'not_started'
    }
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

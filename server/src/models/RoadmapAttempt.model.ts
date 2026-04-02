import mongoose, { Schema, Document, Model } from 'mongoose';
import { IRoadmapAttempt } from '../types/roadmap.types';

type Doc = Document & Omit<IRoadmapAttempt, '_id'>;

const RoadmapAttemptSchema = new Schema<Doc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, required: true, trim: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    nodeId: { type: String, required: true, trim: true },
    scorePercent: { type: Number, required: true, min: 0, max: 100 },
    submittedAt: { type: Date, required: true }
  },
  { timestamps: true, collection: 'roadmap_attempts' }
);

RoadmapAttemptSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

export const RoadmapAttempt: Model<Doc> = mongoose.model<Doc>('RoadmapAttempt', RoadmapAttemptSchema);

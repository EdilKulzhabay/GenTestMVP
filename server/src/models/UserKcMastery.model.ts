import mongoose, { Schema, Document, Model } from 'mongoose';
import { IUserKcMastery, IUserKcComponentProgress } from '../types';

/**
 * USER KC MASTERY (Фаза 3)
 * Тонкий сигнал освоения по компонентам знания (KC). Узел «освоен», когда освоены его KC.
 * recentItemIds — ограниченный список недавно показанных item'ов для spaced repetition.
 */

const ComponentProgressSchema = new Schema<IUserKcComponentProgress>(
  {
    kcId: { type: String, required: true },
    bestScore: { type: Number, required: true, default: 0, min: 0, max: 100 },
    attempts: { type: Number, default: 0, min: 0 },
    mastered: { type: Boolean, default: false },
    lastAttemptAt: { type: Date }
  },
  { _id: false }
);

type Doc = Document & Omit<IUserKcMastery, '_id'>;

const UserKcMasterySchema = new Schema<Doc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    components: { type: [ComponentProgressSchema], default: [] },
    recentItemIds: { type: [String], default: [] }
  },
  { timestamps: true, collection: 'user_kc_mastery' }
);

UserKcMasterySchema.index({ userId: 1, subjectId: 1 }, { unique: true });

export const UserKcMastery: Model<Doc> = mongoose.model<Doc>('UserKcMastery', UserKcMasterySchema);

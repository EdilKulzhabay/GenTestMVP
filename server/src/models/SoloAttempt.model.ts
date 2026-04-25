import mongoose, { Document, Model, Schema } from 'mongoose';

export type SoloAttemptType = 'ranked' | 'practice';

export interface ISoloAttempt {
  userId: Schema.Types.ObjectId;
  subjectId: Schema.Types.ObjectId;
  bookId: Schema.Types.ObjectId;
  chapterId?: Schema.Types.ObjectId;
  dailyPackId: string;
  attemptType: SoloAttemptType;
  finalScore: number;
  correctCount: number;
  answeredCount: number;
  totalQuestions: number;
  createdAt?: Date;
  updatedAt?: Date;
}

type SoloAttemptDocument = Document & Omit<ISoloAttempt, '_id'>;

const SoloAttemptSchema = new Schema<SoloAttemptDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    bookId: { type: Schema.Types.ObjectId, required: true, index: true },
    chapterId: { type: Schema.Types.ObjectId, index: true },
    dailyPackId: { type: String, required: true, trim: true, index: true },
    attemptType: { type: String, enum: ['ranked', 'practice'], required: true, index: true },
    finalScore: { type: Number, required: true, min: 0 },
    correctCount: { type: Number, required: true, min: 0 },
    answeredCount: { type: Number, required: true, min: 0 },
    totalQuestions: { type: Number, required: true, min: 1 }
  },
  {
    timestamps: true,
    collection: 'solo_attempts'
  }
);

SoloAttemptSchema.index({ dailyPackId: 1, userId: 1, attemptType: 1 }, { unique: true, partialFilterExpression: { attemptType: 'ranked' } });
SoloAttemptSchema.index({ userId: 1, attemptType: 1, createdAt: -1 });
SoloAttemptSchema.index({ dailyPackId: 1, finalScore: -1, createdAt: 1 });
SoloAttemptSchema.index({ createdAt: -1 });

export const SoloAttempt: Model<SoloAttemptDocument> = mongoose.model<SoloAttemptDocument>(
  'SoloAttempt',
  SoloAttemptSchema
);

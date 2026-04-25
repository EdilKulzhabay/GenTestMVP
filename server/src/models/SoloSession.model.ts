import mongoose, { Document, Model, Schema } from 'mongoose';

interface ISoloSessionAnswer {
  questionIndex: number;
  selectedOption: string;
  isCorrect: boolean;
  responseTimeMs: number;
  questionScore: number;
}

export interface ISoloSession {
  userId: Schema.Types.ObjectId;
  testId: Schema.Types.ObjectId;
  dailyPackId: string;
  mode: 'daily_pack' | 'practice';
  attemptType: 'ranked' | 'practice';
  questionTimeLimitSec: number;
  currentQuestionIndex: number;
  questionStartedAt: Date;
  answers: ISoloSessionAnswer[];
  isFinished: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

type SoloSessionDocument = Document & Omit<ISoloSession, '_id'>;

const SoloSessionAnswerSchema = new Schema<ISoloSessionAnswer>(
  {
    questionIndex: { type: Number, required: true, min: 0 },
    selectedOption: { type: String, default: '' },
    isCorrect: { type: Boolean, required: true },
    responseTimeMs: { type: Number, required: true, min: 0 },
    questionScore: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const SoloSessionSchema = new Schema<SoloSessionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    testId: { type: Schema.Types.ObjectId, ref: 'Test', required: true, index: true },
    dailyPackId: { type: String, required: true, trim: true, index: true },
    mode: { type: String, enum: ['daily_pack', 'practice'], required: true },
    attemptType: { type: String, enum: ['ranked', 'practice'], required: true },
    questionTimeLimitSec: { type: Number, required: true, min: 1, default: 15 },
    currentQuestionIndex: { type: Number, required: true, min: 0, default: 0 },
    questionStartedAt: { type: Date, required: true, default: () => new Date() },
    answers: { type: [SoloSessionAnswerSchema], default: [] },
    isFinished: { type: Boolean, required: true, default: false }
  },
  {
    timestamps: true,
    collection: 'solo_sessions'
  }
);

SoloSessionSchema.index({ userId: 1, createdAt: -1 });

export const SoloSession: Model<SoloSessionDocument> = mongoose.model<SoloSessionDocument>(
  'SoloSession',
  SoloSessionSchema
);

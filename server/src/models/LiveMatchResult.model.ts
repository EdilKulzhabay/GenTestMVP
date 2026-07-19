import { Schema, Types, model } from 'mongoose';

/**
 * Финальный результат участника live-комнаты (KahootNotion: «Live session — минимум»).
 * Одна строка на участника завершённого матча; источник для достижений
 * (победы, участие) и серверного счёта баллов.
 */
export interface ILiveMatchResult {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  roomId: string;
  testId: Types.ObjectId;
  /** Место в финальном лидерборде (1 — победа) */
  rank: number;
  totalScore: number;
  participantsCount: number;
  finishedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const LiveMatchResultSchema = new Schema<ILiveMatchResult>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    roomId: { type: String, required: true },
    testId: { type: Schema.Types.ObjectId, ref: 'Test', required: true },
    rank: { type: Number, required: true, min: 1 },
    totalScore: { type: Number, required: true, min: 0 },
    participantsCount: { type: Number, required: true, min: 1 },
    finishedAt: { type: Date, required: true }
  },
  { timestamps: true }
);

LiveMatchResultSchema.index({ userId: 1, finishedAt: -1 });
LiveMatchResultSchema.index({ roomId: 1, userId: 1 }, { unique: true });

export const LiveMatchResult = model<ILiveMatchResult>(
  'LiveMatchResult',
  LiveMatchResultSchema,
  'live_match_results'
);

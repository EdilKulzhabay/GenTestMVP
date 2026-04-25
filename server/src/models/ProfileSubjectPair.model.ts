import mongoose, { Document, Model, Schema } from 'mongoose';

/** Пара профильных предметов (создаётся админом); title = «Предмет1 - Предмет2» */
export interface IProfileSubjectPair {
  title: string;
  subject1Id: Schema.Types.ObjectId;
  subject2Id: Schema.Types.ObjectId;
  /** Нормализованный ключ для уникальности пары без учёта порядка */
  pairKey: string;
  createdAt?: Date;
  updatedAt?: Date;
}

type ProfileSubjectPairDocument = Document & Omit<IProfileSubjectPair, '_id'>;

function buildPairKey(a: string, b: string): string {
  const x = a.toString();
  const y = b.toString();
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

const ProfileSubjectPairSchema = new Schema<ProfileSubjectPairDocument>(
  {
    title: { type: String, required: true, trim: true, maxlength: 420 },
    subject1Id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    subject2Id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    pairKey: { type: String, required: true, unique: true, index: true }
  },
  {
    timestamps: true,
    collection: 'profile_subject_pairs'
  }
);

export const ProfileSubjectPair: Model<ProfileSubjectPairDocument> = mongoose.model<ProfileSubjectPairDocument>(
  'ProfileSubjectPair',
  ProfileSubjectPairSchema
);

export { buildPairKey };

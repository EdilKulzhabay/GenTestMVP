import mongoose, { Schema, Document, Model } from 'mongoose';
import { INodeLessonContent, ICanonicalNodeLesson } from '../types/roadmap.types';

/**
 * NODE LESSON CONTENT
 * Кэш сгенерированного (AI-консолидированного) контента урока узла КТП.
 * Граф роудмапа строится вживую из КТП; контент урока — генерируется один раз и кэшируется здесь.
 * Инвалидация по sourceHash (хэш текстов замапленных тем книг).
 */

const StoredLessonSchema = new Schema<ICanonicalNodeLesson>(
  {
    lessonId: { type: String, required: true },
    title: { type: String, required: true },
    order: { type: Number, required: true },
    content: { type: String, required: true },
    contentFormat: { type: String, enum: ['markdown', 'html'], default: 'markdown' },
    summary: { type: String }
  },
  { _id: false }
);

type Doc = Document & Omit<INodeLessonContent, '_id'>;

const NodeLessonContentSchema = new Schema<Doc>(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    ktpTopicId: { type: Schema.Types.ObjectId, required: true },
    sourceHash: { type: String, required: true },
    lessons: { type: [StoredLessonSchema], default: [] },
    generatedBy: { type: String, enum: ['ai', 'manual'], default: 'ai' }
  },
  { timestamps: true, collection: 'node_lesson_content' }
);

NodeLessonContentSchema.index({ subjectId: 1, ktpTopicId: 1 }, { unique: true });

export const NodeLessonContent: Model<Doc> = mongoose.model<Doc>(
  'NodeLessonContent',
  NodeLessonContentSchema
);

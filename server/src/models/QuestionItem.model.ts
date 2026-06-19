import mongoose, { Schema, Document, Model } from 'mongoose';
import { IQuestionItem, IQuestion, IRelatedContent, IMatchingItem, IQuestionSourceRef } from '../types';
import { ENT_QUESTION_TYPES } from '../utils/entQuestion.util';

/**
 * QUESTION ITEM (банк вопросов).
 * Переиспользуемый вопрос, привязанный к узлу знания (ktpTopicId) и KC. Тест собирается
 * из таких item'ов выборкой по покрытию KC — вместо генерации целого теста на попытку.
 *
 * Sub-схема вопроса зеркалит Test.model QuestionSchema (намеренная дупликация, чтобы не
 * трогать рабочую модель Test). Меняешь там — поправь и здесь.
 */

const RelatedContentSchema = new Schema<IRelatedContent>(
  {
    chapterId: { type: Schema.Types.ObjectId },
    topicId: { type: Schema.Types.ObjectId },
    pages: [{ type: Number, required: true }],
    topicTitle: { type: String, trim: true }
  },
  { _id: false }
);

const MatchingItemSchema = new Schema<IMatchingItem>(
  {
    id: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const QuestionSchema = new Schema<IQuestion>(
  {
    questionType: { type: String, enum: [...ENT_QUESTION_TYPES], default: 'single_choice' },
    questionText: { type: String, required: true, trim: true, minlength: 5, maxlength: 2000 },
    options: [{ type: String, trim: true }],
    correctOption: { type: String, trim: true },
    correctOptions: [{ type: String, trim: true }],
    matchingLeft: [MatchingItemSchema],
    matchingRight: [MatchingItemSchema],
    correctMatching: { type: Schema.Types.Mixed },
    acceptableAnswers: [{ type: String, trim: true }],
    acceptableKeywords: [{ type: String, trim: true }],
    referenceAnswer: { type: String, trim: true },
    aiExplanation: { type: String, required: true, trim: true, maxlength: 1200 },
    relatedContent: { type: RelatedContentSchema, required: true }
  },
  { _id: false }
);

const SourceRefSchema = new Schema<IQuestionSourceRef>(
  {
    bookId: { type: Schema.Types.ObjectId },
    chapterId: { type: Schema.Types.ObjectId },
    topicId: { type: Schema.Types.ObjectId },
    pages: [{ type: Number }]
  },
  { _id: false }
);

type Doc = Document & Omit<IQuestionItem, '_id'>;

const QuestionItemSchema = new Schema<Doc>(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    knowledgeNodeId: { type: String, required: true, index: true },
    knowledgeComponentIds: { type: [String], default: [], index: true },
    question: { type: QuestionSchema, required: true },
    difficulty: { type: Number, min: 1, max: 5, default: 3, index: true },
    status: { type: String, enum: ['draft', 'active', 'retired'], default: 'active', index: true },
    sourceRefs: { type: [SourceRefSchema], default: [] },
    provenance: {
      model: { type: String },
      promptVersion: { type: String },
      generatedAt: { type: Date },
      verified: { type: Boolean },
      verifyReason: { type: String }
    },
    contentHash: { type: String, required: true },
    qualityStats: {
      timesUsed: { type: Number, default: 0 },
      timesCorrect: { type: Number, default: 0 }
    }
  },
  { timestamps: true, collection: 'question_items' }
);

// Дедуп в пределах узла + быстрый отбор по покрытию.
QuestionItemSchema.index({ subjectId: 1, knowledgeNodeId: 1, contentHash: 1 }, { unique: true });
QuestionItemSchema.index({ subjectId: 1, knowledgeNodeId: 1, status: 1 });

export const QuestionItem: Model<Doc> = mongoose.model<Doc>('QuestionItem', QuestionItemSchema);

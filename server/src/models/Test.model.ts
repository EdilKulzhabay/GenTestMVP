import mongoose, { Schema, Document, Model } from 'mongoose';
import { ITest, IQuestion, IRelatedContent, IMatchingItem } from '../types';
import { ENT_QUESTION_TYPES, validateEntQuestion } from '../utils/entQuestion.util';

const RelatedContentSchema = new Schema<IRelatedContent>(
  {
    chapterId: {
      type: Schema.Types.ObjectId
    },
    topicId: {
      type: Schema.Types.ObjectId
    },
    pages: [
      {
        type: Number,
        required: true
      }
    ],
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
    questionType: {
      type: String,
      enum: [...ENT_QUESTION_TYPES],
      default: 'single_choice'
    },
    questionText: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2000
    },
    options: [{ type: String, trim: true }],
    correctOption: { type: String, trim: true },
    correctOptions: [{ type: String, trim: true }],
    matchingLeft: [MatchingItemSchema],
    matchingRight: [MatchingItemSchema],
    correctMatching: { type: Schema.Types.Mixed },
    acceptableAnswers: [{ type: String, trim: true }],
    acceptableKeywords: [{ type: String, trim: true }],
    referenceAnswer: { type: String, trim: true },
    aiExplanation: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1200
    },
    relatedContent: {
      type: RelatedContentSchema,
      required: true
    }
  },
  { _id: false }
);

type ITestDocument = Document & Omit<ITest, '_id'>;

const TestSchema = new Schema<ITestDocument>(
  {
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      index: true
    },
    bookId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true
    },
    chapterId: {
      type: Schema.Types.ObjectId,
      index: true
    },
    questions: [QuestionSchema],
    sourceContentHash: {
      type: String,
      required: true,
      index: true
    },
    testProfile: {
      type: String,
      enum: ['regular', 'ent'],
      default: 'ent'
    }
  },
  {
    timestamps: true,
    collection: 'tests'
  }
);

TestSchema.index({ subjectId: 1, bookId: 1, chapterId: 1, sourceContentHash: 1, testProfile: 1 });
TestSchema.index({ createdAt: -1 });

TestSchema.path('questions').validate(
  (questions: IQuestion[]) => {
    if (!Array.isArray(questions) || questions.length !== 10) return false;
    try {
      questions.forEach((q, i) => {
        validateEntQuestion(q as unknown, i);
      });
      return true;
    } catch {
      return false;
    }
  },
  'Тест должен содержать ровно 10 корректных вопросов в формате ЕНТ'
);

TestSchema.statics.findCachedTest = async function (
  subjectId: string,
  bookId: string,
  chapterId: string | undefined,
  sourceContentHash: string
) {
  const query: Record<string, unknown> = {
    subjectId,
    bookId,
    sourceContentHash
  };

  if (chapterId) {
    query.chapterId = chapterId;
  } else {
    query.chapterId = { $exists: false };
  }

  return this.findOne(query).sort({ createdAt: -1 });
};

TestSchema.methods.getQuestionHashes = function (): string[] {
  return this.questions.map((q: IQuestion) => Buffer.from(q.questionText).toString('base64'));
};

export const Test: Model<ITestDocument> = mongoose.model<ITestDocument>('Test', TestSchema);

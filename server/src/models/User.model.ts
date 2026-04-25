import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcrypt';
import {
  IUser,
  ITestHistory,
  IUserAnswer,
  ITestResult,
  IAIFeedback,
  IMistake,
  UserRole
} from '../types';

/**
 * USER MODEL
 * Модель пользователя с аутентификацией и историей тестирования
 * 
 * Безопасность:
 * - Пароли хешируются с помощью bcrypt (10 раундов)
 * - userName уникален (индекс)
 * - Метод comparePassword для проверки пароля
 * 
 * История тестов:
 * - generatedQuestionsHash используется для предотвращения повторений
 * - При необходимости AI может перефразировать старые вопросы
 */

// ==================== SUB-SCHEMAS ====================

const UserAnswerSchema = new Schema<IUserAnswer>({
  question: { 
    type: String, 
    required: true 
  },
  selectedOption: {
    type: String,
    required: true,
    maxlength: 12000
  },
  isCorrect: { 
    type: Boolean, 
    required: true 
  }
}, { _id: false });

const TestResultSchema = new Schema<ITestResult>({
  totalQuestions: { 
    type: Number, 
    required: true,
    min: 0
  },
  correctAnswers: { 
    type: Number, 
    required: true,
    min: 0
  },
  scorePercent: { 
    type: Number, 
    required: true,
    min: 0,
    max: 100
  }
}, { _id: false });

const MistakeSchema = new Schema<IMistake>({
  question: { type: String, required: true },
  explanation: { type: String, required: true },
  whereToRead: {
    bookTitle: { type: String },
    chapterTitle: { type: String },
    pages: [{ type: Number }],
    topicTitle: { type: String }
  }
}, { _id: false });

const AIFeedbackSchema = new Schema<IAIFeedback>({
  summary: { 
    type: String, 
    required: true 
  },
  mistakes: [MistakeSchema]
}, { _id: false });

const TestHistorySchema = new Schema<ITestHistory>({
  subjectId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Subject',
    required: true,
    index: true
  },
  bookId: { 
    type: Schema.Types.ObjectId, 
    required: true 
  },
  chapterId: { 
    type: Schema.Types.ObjectId 
  },
  generatedQuestionsHash: [{ 
    type: String 
  }],
  answers: [UserAnswerSchema],
  result: { 
    type: TestResultSchema, 
    required: true 
  },
  aiFeedback: { 
    type: AIFeedbackSchema, 
    required: true 
  }
}, { timestamps: true });

// ==================== MAIN SCHEMA ====================

type IUserDocument = Document &
  Omit<IUser, '_id'> & {
    comparePassword(candidatePassword: string): Promise<boolean>;
    getAllQuestionHashes(subjectId: string, bookId: string): string[];
  };

const UserSchema = new Schema<IUserDocument>({
  fullName: { 
    type: String, 
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  userName: { 
    type: String, 
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 50,
    match: /^[a-zA-Z0-9_]+$/,
    sparse: true,
    unique: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true,
    unique: true
  },
  phone: {
    type: String,
    trim: true,
    sparse: true,
    unique: true
  },
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  password: { 
    type: String, 
    minlength: 6,
    select: false
  },
  role: { 
    type: String, 
    enum: Object.values(UserRole),
    default: UserRole.USER,
    required: true
  },
  /** Выбранная админом пара профильных предметов (после онбординга) */
  profileSubjectPairId: {
    type: Schema.Types.ObjectId,
    ref: 'ProfileSubjectPair',
    sparse: true
  },
  testHistory: [TestHistorySchema]
}, { 
  timestamps: true,
  collection: 'users'
});

// ==================== INDEXES ====================
// googleId и phone уже имеют unique: true в схеме — не дублируем
UserSchema.index({ role: 1 });
UserSchema.index({ createdAt: -1 });

// ==================== MIDDLEWARE ====================

/**
 * Pre-save hook для хеширования пароля
 * Выполняется только если пароль был изменен
 */
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// ==================== METHODS ====================

/**
 * Метод для проверки пароля при логине
 * @param candidatePassword - пароль для проверки
 * @returns true если пароль совпадает
 */
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    return false;
  }
};

/**
 * Метод для получения всех уникальных хешей вопросов пользователя
 * Используется для предотвращения повторений при генерации новых тестов
 */
UserSchema.methods.getAllQuestionHashes = function(subjectId: string, bookId: string): string[] {
  return this.testHistory
    .filter((test: ITestHistory) => 
      test.subjectId.toString() === subjectId && 
      test.bookId.toString() === bookId
    )
    .flatMap((test: ITestHistory) => test.generatedQuestionsHash);
};

// ==================== MODEL ====================

export const User: Model<IUserDocument> = mongoose.model<IUserDocument>('User', UserSchema);

import { Subject } from '../models';
import { aiService } from './ai.service';
import {
  IQuestion,
  IUserAnswer,
  ITestResult,
  IAIFeedback
} from '../types';
import { formatExpectedAnswer, getQuestionType } from '../utils/entQuestion.util';
import { ROADMAP_MASTERY_THRESHOLD_PERCENT } from '../roadmap/roadmap.rules';

/** Тема, которую стоит повторить (есть ошибки в тесте). */
export interface ITopicToReview {
  topicId: string;
  topicTitle: string;
  totalCount: number;
  wrongCount: number;
  scorePercent: number;
}

/** Минимальный набор полей теста, нужный для разбора. Совместим с Test-документом и lean. */
interface TestLike {
  _id?: unknown;
  subjectId: unknown;
  bookId: unknown;
  chapterId?: unknown;
  questions: IQuestion[];
}

interface ResolvedContext {
  subjectTitle: string;
  bookTitle: string;
  chapterTitle?: string;
  chapterTopicTitles: string[];
  /** topicId(string) -> title темы (резолв из Subject.books[].chapters[].topics[]) */
  topicTitleById: Map<string, string>;
}

/**
 * TEST RESULT SERVICE
 * Декомпозиция «тяжёлого» разбора теста на независимые куски:
 *  - buildResultSummary   — лёгкая сводка (без обращения к Subject/AI);
 *  - buildBreakdown       — по-вопросный разбор + «Темы для повторения» (1 запрос к Subject, без AI);
 *  - buildAiExplanation   — AI-feedback (ленивый, дорогой).
 *
 * Ответы (answers) выравниваются на вопросы теста по тексту вопроса — устойчиво к порядку.
 */
class TestResultService {
  /** Лёгкая сводка по результату — без обращения к БД. */
  buildResultSummary(entry: {
    _id?: unknown;
    testId?: unknown;
    subjectId?: unknown;
    result: ITestResult;
    createdAt?: Date;
  }): {
    testHistoryId: string | undefined;
    testId: string | undefined;
    subjectId: string | undefined;
    result: ITestResult;
    createdAt: Date | undefined;
  } {
    return {
      testHistoryId: entry._id ? String(entry._id) : undefined,
      testId: entry.testId ? String(entry.testId) : undefined,
      subjectId: entry.subjectId ? String(entry.subjectId) : undefined,
      result: entry.result,
      createdAt: entry.createdAt
    };
  }

  /** По-вопросный разбор + темы для повторения. Один запрос к Subject, без AI. */
  async buildBreakdown(
    test: TestLike,
    answers: IUserAnswer[]
  ): Promise<{
    detailedAnswers: Array<Record<string, unknown>>;
    topicsToReview: ITopicToReview[];
  }> {
    const ctx = await this.resolveContext(test);
    const byText = this.indexAnswersByQuestion(answers);

    // accumulate per-topic correctness across ВСЕ вопросы темы
    const perTopic = new Map<string, { title: string; total: number; wrong: number }>();

    const detailedAnswers = test.questions.map((q) => {
      const ua = byText.get(q.questionText);
      const topicId = q.relatedContent?.topicId ? String(q.relatedContent.topicId) : undefined;
      const topicTitle = topicId ? ctx.topicTitleById.get(topicId) : undefined;
      const isCorrect = ua?.isCorrect ?? false;

      if (topicId && topicTitle) {
        const acc = perTopic.get(topicId) ?? { title: topicTitle, total: 0, wrong: 0 };
        acc.total += 1;
        if (!isCorrect) acc.wrong += 1;
        perTopic.set(topicId, acc);
      }

      return {
        questionType: getQuestionType(q),
        questionText: q.questionText,
        options: q.options ?? [],
        correctOption: formatExpectedAnswer(q),
        selectedOption: ua?.selectedOption ?? '',
        isCorrect,
        explanation: q.aiExplanation,
        relatedContent: { ...q.relatedContent, topicTitle },
        matchingLeft: q.matchingLeft,
        matchingRight: q.matchingRight
      };
    });

    const topicsToReview: ITopicToReview[] = [...perTopic.entries()]
      .filter(([, acc]) => acc.wrong > 0)
      .map(([topicId, acc]) => ({
        topicId,
        topicTitle: acc.title,
        totalCount: acc.total,
        wrongCount: acc.wrong,
        scorePercent: Math.round(((acc.total - acc.wrong) / acc.total) * 100)
      }))
      .sort((a, b) => a.scorePercent - b.scorePercent);

    return { detailedAnswers, topicsToReview };
  }

  /** Темы для повторения отдельно (без полного разбора) — на случай лёгкого запроса. */
  async buildTopicsToReview(test: TestLike, answers: IUserAnswer[]): Promise<ITopicToReview[]> {
    const { topicsToReview } = await this.buildBreakdown(test, answers);
    return topicsToReview;
  }

  /** AI-feedback (summary + mistakes). Дорогой: дергает aiService.analyzeAnswers. */
  async buildAiExplanation(test: TestLike, answers: IUserAnswer[]): Promise<IAIFeedback> {
    const ctx = await this.resolveContext(test);
    const byText = this.indexAnswersByQuestion(answers);

    const correctAnswers = test.questions.map((q) => {
      const topicId = q.relatedContent?.topicId ? String(q.relatedContent.topicId) : undefined;
      const topicTitle = topicId ? ctx.topicTitleById.get(topicId) : undefined;
      return {
        question: q.questionText,
        correctSummary: formatExpectedAnswer(q),
        explanation: q.aiExplanation,
        relatedContent: { ...q.relatedContent, topicTitle }
      };
    });

    // выравниваем ответы строго по порядку вопросов (analyzeAnswers матчит по индексу)
    const alignedAnswers: IUserAnswer[] = test.questions.map((q) => {
      const ua = byText.get(q.questionText);
      return ua ?? { question: q.questionText, selectedOption: '', isCorrect: false };
    });

    return aiService.analyzeAnswers(correctAnswers, alignedAnswers, {
      subjectTitle: ctx.subjectTitle,
      bookTitle: ctx.bookTitle,
      chapterTitle: ctx.chapterTitle,
      topics: ctx.chapterTopicTitles
    });
  }

  /** Что считать «слабой» темой при ручной фильтрации (любая ошибка ниже порога mastery). */
  get reviewThresholdPercent(): number {
    return ROADMAP_MASTERY_THRESHOLD_PERCENT;
  }

  // ==================== private ====================

  private indexAnswersByQuestion(answers: IUserAnswer[]): Map<string, IUserAnswer> {
    const m = new Map<string, IUserAnswer>();
    for (const a of answers) m.set(a.question, a);
    return m;
  }

  /** Загрузить Subject и собрать заголовки тем (topicId -> title) для книги/главы теста. */
  private async resolveContext(test: TestLike): Promise<ResolvedContext> {
    const subject = await Subject.findById(String(test.subjectId)).lean();
    if (!subject) {
      return {
        subjectTitle: '',
        bookTitle: '',
        chapterTopicTitles: [],
        topicTitleById: new Map()
      };
    }

    const book = (subject.books || []).find((b: any) => String(b._id) === String(test.bookId));
    const chapter = test.chapterId
      ? book?.chapters?.find((c: any) => String(c._id) === String(test.chapterId))
      : undefined;

    const topicTitleById = new Map<string, string>();
    const chapters = chapter ? [chapter] : book?.chapters ?? [];
    for (const c of chapters) {
      for (const t of c.topics ?? []) {
        if (t?._id && t?.title) topicTitleById.set(String(t._id), t.title);
      }
    }

    return {
      subjectTitle: subject.title || '',
      bookTitle: book?.title || '',
      chapterTitle: chapter?.title,
      chapterTopicTitles: (chapter?.topics ?? []).map((t: any) => t.title).filter(Boolean),
      topicTitleById
    };
  }
}

export const testResultService = new TestResultService();

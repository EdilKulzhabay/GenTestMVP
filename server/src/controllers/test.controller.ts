import { Request, Response } from 'express';
import { Subject, Test, User } from '../models';
import { aiService, roadmapService } from '../services';
import { resolveBookContentForAI } from '../services/subjectContent.service';
import {
  IGenerateTestDTO,
  ISubmitTestDTO,
  IUserAnswer,
  ITestHistory
} from '../types';
import { success, AppError } from '../utils';

class TestController {
  /** Преобразовать topicTitle из AI в topicId для сохранения в тесте */
  private resolveTopicTitleToId(generated: { questions: any[] }, book: any): void {
    if (!book?.chapters?.length) return;
    const allTopics = book.chapters.flatMap((c: any) =>
      (c.topics || []).map((t: any) => ({ ...t, _chapterId: c._id }))
    );
    for (const q of generated.questions || []) {
      const topicTitle = q.relatedContent?.topicTitle;
      if (topicTitle) {
        const topic = allTopics.find(
          (t: any) => t.title?.trim()?.toLowerCase() === topicTitle?.trim()?.toLowerCase()
        );
        if (topic) {
          q.relatedContent = { ...q.relatedContent, topicId: topic._id };
        }
        delete q.relatedContent.topicTitle;
      }
    }
  }

  /** Создать или найти кэш теста */
  private async findOrCreateTest(dto: IGenerateTestDTO, generatedTest: any) {
    if (dto.chapterId) {
      generatedTest.questions = generatedTest.questions.map((q: any) => ({
        ...q,
        relatedContent: { ...q.relatedContent, chapterId: dto.chapterId as any }
      }));
    }

    const useCache = !process.env.OPENAI_API_KEY;
    if (useCache) {
      const cached = await Test.findOne({
        subjectId: dto.subjectId,
        bookId: dto.bookId,
        chapterId: dto.chapterId || { $exists: false },
        sourceContentHash: generatedTest.sourceContentHash
      }).sort({ createdAt: -1 });
      if (cached) return cached;
    }

    return Test.create({
      subjectId: dto.subjectId,
      bookId: dto.bookId,
      chapterId: dto.chapterId || undefined,
      questions: generatedTest.questions,
      sourceContentHash: generatedTest.sourceContentHash
    });
  }

  /** Сформировать тест для клиента. TODO: убрать correctOption в продакшене */
  private sanitize(test: any) {
    return {
      _id: test._id,
      subjectId: test.subjectId,
      bookId: test.bookId,
      chapterId: test.chapterId,
      questions: test.questions.map((q: any) => ({
        questionText: q.questionText,
        options: q.options,
        correctOption: q.correctOption
      })),
      createdAt: test.createdAt
    };
  }

  /** Проверить ответы, вернуть userAnswers и счёт */
  private checkAnswers(test: any, answers: ISubmitTestDTO['answers']) {
    if (answers.length !== test.questions.length) {
      throw AppError.badRequest(`Expected ${test.questions.length} answers, received ${answers.length}`);
    }

    const userAnswers: IUserAnswer[] = [];
    let correctCount = 0;

    for (const question of test.questions) {
      const ua = answers.find((a) => a.questionText === question.questionText);
      if (!ua) throw AppError.badRequest(`Missing answer for question: "${question.questionText}"`);

      const isCorrect = ua.selectedOption === question.correctOption;
      if (isCorrect) correctCount++;
      userAnswers.push({ question: question.questionText, selectedOption: ua.selectedOption, isCorrect });
    }

    const totalQuestions = test.questions.length;
    return {
      userAnswers,
      result: { totalQuestions, correctAnswers: correctCount, scorePercent: Math.round((correctCount / totalQuestions) * 100) }
    };
  }

  /** Построить детальный результат с AI-feedback */
  private async buildDetailedResult(test: any, userAnswers: IUserAnswer[], resultSummary: any) {
    const subject = await Subject.findById(test.subjectId);
    if (!subject) throw AppError.notFound('Subject not found');

    const book = subject.books.find((b) => b._id?.toString() === test.bookId.toString());
    const chapter = test.chapterId
      ? book?.chapters.find((c) => c._id?.toString() === test.chapterId!.toString())
      : undefined;

    const correctAnswersData = test.questions.map((q: any) => {
      let topicTitle: string | undefined;
      if (q.relatedContent?.topicId && book) {
        const topic = chapter
          ? chapter.topics.find(
              (t: any) => t._id?.toString() === q.relatedContent.topicId?.toString()
            )
          : book.chapters
              .flatMap((c: any) => c.topics)
              .find((t: any) => t._id?.toString() === q.relatedContent.topicId?.toString());
        topicTitle = topic?.title;
      }
      return {
        question: q.questionText,
        correctOption: q.correctOption,
        explanation: q.aiExplanation,
        relatedContent: { ...q.relatedContent, topicTitle }
      };
    });

    const topics = chapter?.topics?.map((t: any) => t.title) ?? [];
    const aiFeedback = await aiService.analyzeAnswers(correctAnswersData, userAnswers, {
      subjectTitle: subject.title,
      bookTitle: book?.title || '',
      chapterTitle: chapter?.title,
      topics
    });

    return {
      testId: test._id,
      result: resultSummary,
      aiFeedback,
      detailedAnswers: test.questions.map((q: any, i: number) => ({
        questionText: q.questionText,
        options: q.options,
        correctOption: q.correctOption,
        selectedOption: userAnswers[i].selectedOption,
        isCorrect: userAnswers[i].isCorrect,
        explanation: q.aiExplanation,
        relatedContent: q.relatedContent
      }))
    };
  }

  // ==================== PUBLIC ENDPOINTS ====================

  /** POST /tests/generate-guest */
  async generateTestGuest(req: Request, res: Response): Promise<void> {
    const dto: IGenerateTestDTO = req.body;
    const { contentForAI, book } = await resolveBookContentForAI(dto);
    const generated = await aiService.generateTest(contentForAI, []);
    this.resolveTopicTitleToId(generated, book);
    const test = await this.findOrCreateTest(dto, generated);
    success(res, this.sanitize(test), 'Test generated successfully', 201);
  }

  /** POST /tests/submit-guest */
  async submitTestGuest(req: Request, res: Response): Promise<void> {
    const { testId, answers }: ISubmitTestDTO = req.body;
    const test = await Test.findById(testId);
    if (!test) throw AppError.notFound('Test not found');

    const { userAnswers, result: resultSummary } = this.checkAnswers(test, answers);
    const detailed = await this.buildDetailedResult(test, userAnswers, resultSummary);
    success(res, detailed, 'Test submitted successfully');
  }

  /** POST /tests/generate (auth) */
  async generateTest(req: Request, res: Response): Promise<void> {
    const dto: IGenerateTestDTO = req.body;
    const userId = (req as any).user?.userId;
    const { contentForAI, book } = await resolveBookContentForAI(dto);

    const user = await User.findById(userId);
    const previousQuestions = user?.getAllQuestionHashes(dto.subjectId, dto.bookId) || [];

    const generated = await aiService.generateTest(contentForAI, previousQuestions);
    this.resolveTopicTitleToId(generated, book);
    const test = await this.findOrCreateTest(dto, generated);
    success(res, this.sanitize(test), 'Test generated successfully', 201);
  }

  /** POST /tests/submit (auth) */
  async submitTest(req: Request, res: Response): Promise<void> {
    const { testId, answers, roadmapNodeId, roadmapSessionId }: ISubmitTestDTO = req.body;
    const userId = (req as any).user?.userId;

    const test = await Test.findById(testId);
    if (!test) throw AppError.notFound('Test not found');

    const { userAnswers, result: resultSummary } = this.checkAnswers(test, answers);
    const detailed = await this.buildDetailedResult(test, userAnswers, resultSummary);

    const questionHashes = test.questions.map((q) => Buffer.from(q.questionText).toString('base64'));
    const testHistory: ITestHistory = {
      subjectId: test.subjectId,
      bookId: test.bookId,
      chapterId: test.chapterId,
      generatedQuestionsHash: questionHashes,
      answers: userAnswers,
      result: resultSummary,
      aiFeedback: detailed.aiFeedback
    };

    await User.findByIdAndUpdate(userId, { $push: { testHistory } }, { new: true });

    let roadmap: Awaited<ReturnType<typeof roadmapService.recordTestSubmitted>> | undefined;
    if (roadmapNodeId?.trim() && roadmapSessionId?.trim()) {
      try {
        roadmap = await roadmapService.recordTestSubmitted({
          userId,
          subjectId: test.subjectId.toString(),
          nodeId: roadmapNodeId.trim(),
          scorePercent: resultSummary.scorePercent,
          sessionId: roadmapSessionId.trim(),
          submittedAt: new Date()
        });
      } catch (err) {
        console.error('[submitTest] roadmap update failed:', err);
      }
    }

    success(res, roadmap ? { ...detailed, roadmap } : detailed, 'Test submitted successfully');
  }

  /** POST /tests/claim-guest — привязать гостевой тест к авторизованному пользователю */
  async claimGuestTest(req: Request, res: Response): Promise<void> {
    const { testId, answers }: ISubmitTestDTO = req.body;
    const userId = (req as any).user?.userId;

    const test = await Test.findById(testId);
    if (!test) throw AppError.notFound('Test not found');

    const user = await User.findById(userId);
    if (!user) throw AppError.notFound('User not found');

    const alreadyClaimed = user.testHistory.some(
      (h) => h.generatedQuestionsHash?.join(',') === test.questions.map((q) => Buffer.from(q.questionText).toString('base64')).join(',')
    );
    if (alreadyClaimed) {
      success(res, { alreadyClaimed: true }, 'Test already in history');
      return;
    }

    const { userAnswers, result: resultSummary } = this.checkAnswers(test, answers);
    const detailed = await this.buildDetailedResult(test, userAnswers, resultSummary);

    const questionHashes = test.questions.map((q) => Buffer.from(q.questionText).toString('base64'));
    const testHistory: ITestHistory = {
      subjectId: test.subjectId,
      bookId: test.bookId,
      chapterId: test.chapterId,
      generatedQuestionsHash: questionHashes,
      answers: userAnswers,
      result: resultSummary,
      aiFeedback: detailed.aiFeedback
    };

    await User.findByIdAndUpdate(userId, { $push: { testHistory } });
    success(res, detailed, 'Guest test claimed successfully');
  }

  /** GET /tests/:id */
  async getTestById(req: Request, res: Response): Promise<void> {
    const test = await Test.findById(req.params.id);
    if (!test) throw AppError.notFound('Test not found');
    success(res, this.sanitize(test));
  }
}

export const testController = new TestController();

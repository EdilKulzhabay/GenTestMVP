import { Request, Response } from 'express';
import { createHash } from 'crypto';
import { Subject, Test, User, SoloAttempt, SoloSession } from '../models';
import { aiService, roadmapService } from '../services';
import { resolveBookContentForAI } from '../services/subjectContent.service';
import {
  IGenerateTestDTO,
  ISubmitTestDTO,
  IUserAnswer,
  ITestHistory,
  IQuestion,
  TestGenerationProfile
} from '../types';
import { success, AppError } from '../utils';
import {
  formatExpectedAnswer,
  clientPrefillValueForQuestion,
  getQuestionType,
  gradeAnswer,
  sanitizeQuestionForClient
} from '../utils/entQuestion.util';
import { assertLearnerSubjectAccess } from '../utils/learnerSubjectAccess.util';
import { computeTrialTopicMasteryRows } from '../utils/trialTopicMastery.util';

class TestController {
  private static readonly SOLO_QUESTION_TIME_LIMIT_SEC = 15;

  /** Самый новый Test по предмету (без AI), или `null` — тогда вызывать генерацию. */
  private async findLatestTestBySubject(subjectId: string) {
    return Test.findOne({ subjectId }).sort({ createdAt: -1 });
  }

  private buildDailyPackId(input: {
    subjectId: string;
    bookId: string;
    chapterId?: string;
    fullBook?: boolean;
    testProfile: TestGenerationProfile;
    dateKey: string;
  }): string {
    const raw = [
      input.subjectId,
      input.bookId,
      input.chapterId || 'full-book',
      input.fullBook ? 'full' : 'chapter',
      input.testProfile,
      input.dateKey
    ].join('|');
    return `daily-${createHash('sha1').update(raw).digest('hex').slice(0, 16)}`;
  }

  private getDateKey(date = new Date()): string {
    return date.toISOString().slice(0, 10);
  }

  private startOfToday(date = new Date()): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private startOfWeek(date = new Date()): Date {
    const d = this.startOfToday(date);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return d;
  }

  private calculateSoloQuestionScore(isCorrect: boolean, responseTimeMs?: number): number {
    if (!isCorrect) return 0;
    const limitMs = TestController.SOLO_QUESTION_TIME_LIMIT_SEC * 1000;
    const safeMs = typeof responseTimeMs === 'number' && Number.isFinite(responseTimeMs) ? responseTimeMs : limitMs;
    const remainingSec = Math.max(0, (limitMs - Math.max(0, safeMs)) / 1000);
    const score = 1000 * (0.3 + 0.7 * (remainingSec / TestController.SOLO_QUESTION_TIME_LIMIT_SEC));
    return Math.round(score);
  }

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
          q.relatedContent = {
            ...q.relatedContent,
            topicId: topic._id,
            chapterId: topic._chapterId
          };
        }
        delete q.relatedContent.topicTitle;
      }
    }
  }

  private normalizeTestProfile(dto: IGenerateTestDTO): TestGenerationProfile {
    return dto.testProfile === 'regular' ? 'regular' : 'ent';
  }

  /** Создать или найти кэш теста */
  private async findOrCreateTest(dto: IGenerateTestDTO, generatedTest: any) {
    if (dto.chapterId) {
      generatedTest.questions = generatedTest.questions.map((q: any) => ({
        ...q,
        relatedContent: { ...q.relatedContent, chapterId: dto.chapterId as any }
      }));
    }

    const testProfile = this.normalizeTestProfile(dto);

    const useCache = !process.env.OPENAI_API_KEY;
    if (useCache) {
      const cacheFilter: Record<string, unknown> = {
        subjectId: dto.subjectId,
        bookId: dto.bookId,
        sourceContentHash: generatedTest.sourceContentHash
      };
      if (dto.chapterId) {
        cacheFilter.chapterId = dto.chapterId;
      } else {
        cacheFilter.chapterId = { $exists: false };
      }
      if (testProfile === 'regular') {
        cacheFilter.testProfile = 'regular';
      } else {
        cacheFilter.$or = [{ testProfile: 'ent' }, { testProfile: { $exists: false } }];
      }
      const cached = await Test.findOne(cacheFilter).sort({ createdAt: -1 });
      if (cached) return cached;
    }

    return Test.create({
      subjectId: dto.subjectId,
      bookId: dto.bookId,
      chapterId: dto.chapterId || undefined,
      questions: generatedTest.questions,
      sourceContentHash: generatedTest.sourceContentHash,
      testProfile
    });
  }

  /** Сформировать тест для клиента. Подсказки с эталоном — временно, см. SHOW_TEST_CORRECT_ANSWERS. */
  private sanitize(test: any) {
    const testProfile: TestGenerationProfile =
      test.testProfile === 'regular' ? 'regular' : 'ent';
    const showDevHints = process.env.SHOW_TEST_CORRECT_ANSWERS !== 'false';
    return {
      _id: test._id,
      subjectId: test.subjectId,
      bookId: test.bookId,
      chapterId: test.chapterId,
      testProfile,
      questions: test.questions.map((q: any) => {
        const base = sanitizeQuestionForClient(q as IQuestion);
        if (showDevHints) {
          return {
            ...base,
            correctAnswerHint: formatExpectedAnswer(q as IQuestion),
            devPrefillValue: clientPrefillValueForQuestion(q as IQuestion)
          };
        }
        return base;
      }),
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

      const isCorrect = gradeAnswer(question as IQuestion, ua.selectedOption);
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
        correctSummary: formatExpectedAnswer(q as IQuestion),
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
        questionType: getQuestionType(q as IQuestion),
        questionText: q.questionText,
        options: q.options ?? [],
        correctOption: formatExpectedAnswer(q as IQuestion),
        selectedOption: userAnswers[i].selectedOption,
        isCorrect: userAnswers[i].isCorrect,
        explanation: q.aiExplanation,
        relatedContent: q.relatedContent,
        matchingLeft: q.matchingLeft,
        matchingRight: q.matchingRight
      }))
    };
  }

  /** Темы ≥ порога (пробник) — для apply-results по персональному роадмапу */
  private trialTopicMasteryPayload(
    forTrial: boolean,
    test: { subjectId: unknown; bookId: unknown; questions: IQuestion[] },
    userAnswers: IUserAnswer[]
  ): { trialTopicMastery: Array<{ subjectId: string; nodeId: string; scorePercent: number }> } | undefined {
    if (!forTrial) return undefined;
    return {
      trialTopicMastery: computeTrialTopicMasteryRows(
        String(test.subjectId),
        String(test.bookId),
        test,
        userAnswers
      )
    };
  }

  // ==================== PUBLIC ENDPOINTS ====================

  /** POST /tests/generate-guest */
  async generateTestGuest(req: Request, res: Response): Promise<void> {
    const dto: IGenerateTestDTO = req.body;
    const cached = await this.findLatestTestBySubject(dto.subjectId);
    if (cached) {
      success(res, this.sanitize(cached), 'Test loaded from last saved (same subject)', 201);
      return;
    }
    const { contentForAI, book } = await resolveBookContentForAI(dto);
    const genOpts =
      typeof dto.questionCount === 'number' && dto.questionCount > 0
        ? { questionCount: dto.questionCount }
        : undefined;
    const generated = await aiService.generateTest(
      contentForAI,
      [],
      this.normalizeTestProfile(dto),
      genOpts
    );
    this.resolveTopicTitleToId(generated, book);
    const test = await this.findOrCreateTest(dto, generated);
    success(res, this.sanitize(test), 'Test generated successfully', 201);
  }

  /** POST /tests/submit-guest */
  async submitTestGuest(req: Request, res: Response): Promise<void> {
    const { testId, answers, forTrial }: ISubmitTestDTO = req.body;
    const test = await Test.findById(testId);
    if (!test) throw AppError.notFound('Test not found');

    const { userAnswers, result: resultSummary } = this.checkAnswers(test, answers);
    const detailed = await this.buildDetailedResult(test, userAnswers, resultSummary);
    const trialExtra = this.trialTopicMasteryPayload(Boolean(forTrial), test, userAnswers);
    success(res, { ...detailed, ...trialExtra }, 'Test submitted successfully');
  }

  /** POST /tests/generate (auth) */
  async generateTest(req: Request, res: Response): Promise<void> {
    const dto: IGenerateTestDTO = req.body;
    const userId = (req as any).user?.userId;
    await assertLearnerSubjectAccess(userId, dto.subjectId);
    await roadmapService.assertKnowledgeMapTestAllowed(userId, dto.subjectId, dto.roadmapNodeId);
    const cached = await this.findLatestTestBySubject(dto.subjectId);
    if (cached) {
      success(res, this.sanitize(cached), 'Test loaded from last saved (same subject)', 201);
      return;
    }
    const { contentForAI, book } = await resolveBookContentForAI(dto);

    const user = await User.findById(userId);
    const previousQuestions = user?.getAllQuestionHashes(dto.subjectId, dto.bookId) || [];

    const genOpts =
      typeof dto.questionCount === 'number' && dto.questionCount > 0
        ? { questionCount: dto.questionCount }
        : undefined;
    const generated = await aiService.generateTest(
      contentForAI,
      previousQuestions,
      this.normalizeTestProfile(dto),
      genOpts
    );
    this.resolveTopicTitleToId(generated, book);
    const test = await this.findOrCreateTest(dto, generated);
    success(res, this.sanitize(test), 'Test generated successfully', 201);
  }

  /** POST /tests/submit (auth) */
  async submitTest(req: Request, res: Response): Promise<void> {
    const { testId, answers, roadmapNodeId, roadmapSessionId, forTrial }: ISubmitTestDTO = req.body;
    const userId = (req as any).user?.userId;

    const test = await Test.findById(testId);
    if (!test) throw AppError.notFound('Test not found');
    await assertLearnerSubjectAccess(userId, test.subjectId.toString());

    const { userAnswers, result: resultSummary } = this.checkAnswers(test, answers);
    const detailed = await this.buildDetailedResult(test, userAnswers, resultSummary);
    const trialExtra = this.trialTopicMasteryPayload(Boolean(forTrial), test, userAnswers);

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

    success(
      res,
      roadmap
        ? { ...detailed, ...trialExtra, roadmap }
        : { ...detailed, ...trialExtra },
      'Test submitted successfully'
    );
  }

  /** POST /tests/solo/start (auth) */
  async startSoloTest(req: Request, res: Response): Promise<void> {
    const dto: IGenerateTestDTO & { mode: 'daily_pack' | 'practice' } = req.body;
    const userId = (req as any).user?.userId;
    await assertLearnerSubjectAccess(userId, dto.subjectId);
    await roadmapService.assertKnowledgeMapTestAllowed(userId, dto.subjectId, dto.roadmapNodeId);
    const mode = dto.mode === 'practice' ? 'practice' : 'daily_pack';
    const dateKey = this.getDateKey();
    const dailyPackId = this.buildDailyPackId({
      subjectId: dto.subjectId,
      bookId: dto.bookId,
      chapterId: dto.chapterId,
      fullBook: dto.fullBook,
      testProfile: this.normalizeTestProfile(dto),
      dateKey
    });

    let test = await Test.findOne({
      subjectId: dto.subjectId,
      bookId: dto.bookId,
      chapterId: dto.chapterId || { $exists: false },
      testProfile: this.normalizeTestProfile(dto),
      sourceContentHash: dailyPackId
    }).sort({ createdAt: -1 });

    if (!test) {
      const { contentForAI, book } = await resolveBookContentForAI(dto);
      const generated = await aiService.generateTest(contentForAI, [], this.normalizeTestProfile(dto));
      this.resolveTopicTitleToId(generated, book);
      test = await Test.create({
        subjectId: dto.subjectId,
        bookId: dto.bookId,
        chapterId: dto.chapterId || undefined,
        questions: generated.questions,
        sourceContentHash: dailyPackId,
        testProfile: this.normalizeTestProfile(dto)
      });
    }

    /** Один ranked daily pack в календарный день на пользователя, независимо от предмета/книги */
    const rankedDailyUsedToday = await SoloAttempt.exists({
      userId,
      attemptType: 'ranked',
      createdAt: { $gte: this.startOfToday() }
    });

    if (mode === 'daily_pack' && rankedDailyUsedToday) {
      throw AppError.badRequest(
        'Сегодня вы уже прошли daily pack (доступна одна попытка в день). Выберите Practice или вернитесь завтра.'
      );
    }

    const attemptType = mode === 'daily_pack' ? 'ranked' : 'practice';
    const session = await SoloSession.create({
      userId,
      testId: test._id,
      dailyPackId,
      mode,
      attemptType,
      questionTimeLimitSec: TestController.SOLO_QUESTION_TIME_LIMIT_SEC,
      currentQuestionIndex: 0,
      questionStartedAt: new Date(),
      answers: [],
      isFinished: false
    });

    success(
      res,
      {
        ...this.sanitize(test),
        mode,
        dailyPackId,
        attemptType,
        soloSessionId: session._id,
        soloCurrentQuestionIndex: 0,
        soloQuestionStartedAt: session.questionStartedAt,
        rankedUsedToday: Boolean(rankedDailyUsedToday),
        questionTimeLimitSec: TestController.SOLO_QUESTION_TIME_LIMIT_SEC
      },
      'Solo test started',
      201
    );
  }

  /** POST /tests/solo/answer (auth) */
  async submitSoloAnswer(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.userId;
    const { soloSessionId, questionIndex, selectedOption }: {
      soloSessionId: string;
      questionIndex: number;
      selectedOption: string;
    } = req.body;

    const session = await SoloSession.findById(soloSessionId);
    if (!session) throw AppError.notFound('Solo session not found');
    if (session.userId.toString() !== userId) throw AppError.forbidden('Access denied');
    if (session.isFinished) throw AppError.badRequest('Solo session already finished');
    if (session.currentQuestionIndex !== questionIndex) {
      throw AppError.badRequest('Question index mismatch');
    }

    const test = await Test.findById(session.testId);
    if (!test) throw AppError.notFound('Test not found');

    const question = test.questions[questionIndex];
    if (!question) throw AppError.badRequest('Invalid question index');

    const elapsedMs = Math.max(0, Date.now() - session.questionStartedAt.getTime());
    const cappedMs = Math.min(elapsedMs, session.questionTimeLimitSec * 1000);
    const isCorrect = gradeAnswer(question as IQuestion, selectedOption || '');
    const questionScore = this.calculateSoloQuestionScore(isCorrect, cappedMs);

    const nextIndex = questionIndex + 1;
    const isLastQuestion = nextIndex >= test.questions.length;

    session.answers.push({
      questionIndex,
      selectedOption: selectedOption || '',
      isCorrect,
      responseTimeMs: cappedMs,
      questionScore
    });
    session.currentQuestionIndex = nextIndex;
    session.questionStartedAt = new Date();
    if (isLastQuestion) session.isFinished = true;
    await session.save();

    success(res, {
      accepted: true,
      questionIndex,
      isCorrect,
      questionScore,
      responseTimeMs: cappedMs,
      finished: isLastQuestion,
      nextQuestionIndex: isLastQuestion ? null : nextIndex,
      questionStartedAt: isLastQuestion ? null : session.questionStartedAt
    }, 'Solo answer accepted');
  }

  /** POST /tests/solo/finish (auth) */
  async finishSoloTest(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.userId;
    const { soloSessionId }: { soloSessionId: string } = req.body;

    const session = await SoloSession.findById(soloSessionId);
    if (!session) throw AppError.notFound('Solo session not found');
    if (session.userId.toString() !== userId) throw AppError.forbidden('Access denied');

    const test = await Test.findById(session.testId);
    if (!test) throw AppError.notFound('Test not found');
    if (session.answers.length !== test.questions.length) {
      throw AppError.badRequest('Solo session is not complete yet');
    }

    const finalScore = session.answers.reduce((sum, item) => sum + item.questionScore, 0);
    const correctCount = session.answers.filter((item) => item.isCorrect).length;

    const createdAttempt = await SoloAttempt.create({
      userId,
      subjectId: test.subjectId,
      bookId: test.bookId,
      chapterId: test.chapterId,
      dailyPackId: session.dailyPackId,
      attemptType: session.attemptType,
      finalScore,
      correctCount,
      answeredCount: session.answers.length,
      totalQuestions: test.questions.length
    });

    const betterCount = await SoloAttempt.countDocuments({
      dailyPackId: session.dailyPackId,
      attemptType: 'ranked',
      $or: [
        { finalScore: { $gt: finalScore } },
        { finalScore, createdAt: { $lt: createdAttempt.createdAt } }
      ]
    });

    success(res, {
      result: {
        totalQuestions: test.questions.length,
        correctAnswers: correctCount,
        scorePercent: Math.round((correctCount / test.questions.length) * 100)
      },
      solo: {
        dailyPackId: session.dailyPackId,
        mode: session.mode,
        attemptType: session.attemptType,
        finalScore,
        questionTimeLimitSec: session.questionTimeLimitSec,
        rank: session.attemptType === 'ranked' ? betterCount + 1 : null
      }
    }, 'Solo test finished successfully');
  }

  /** GET /tests/solo/leaderboard (auth) */
  async getSoloLeaderboard(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.userId;
    const period = req.query.period === 'week' ? 'week' : 'today';
    const dailyPackId = String(req.query.dailyPackId || '');
    if (!dailyPackId) throw AppError.badRequest('dailyPackId is required');

    const createdAtFilter =
      period === 'week'
        ? { $gte: this.startOfWeek(new Date()) }
        : { $gte: this.startOfToday(new Date()) };

    const topRows = await SoloAttempt.find({
      dailyPackId,
      attemptType: 'ranked',
      createdAt: createdAtFilter
    })
      .sort({ finalScore: -1, createdAt: 1 })
      .limit(10)
      .populate('userId', 'fullName userName');

    const meRow = await SoloAttempt.findOne({
      dailyPackId,
      attemptType: 'ranked',
      userId,
      createdAt: createdAtFilter
    }).sort({ finalScore: -1, createdAt: 1 });

    let myRank: number | null = null;
    if (meRow) {
      const betterCount = await SoloAttempt.countDocuments({
        dailyPackId,
        attemptType: 'ranked',
        createdAt: createdAtFilter,
        $or: [
          { finalScore: { $gt: meRow.finalScore } },
          { finalScore: meRow.finalScore, createdAt: { $lt: meRow.createdAt } }
        ]
      });
      myRank = betterCount + 1;
    }

    success(res, {
      period,
      dailyPackId,
      top10: topRows.map((row: any, index) => ({
        rank: index + 1,
        userId: row.userId?._id || row.userId,
        fullName: row.userId?.fullName || row.userId?.userName || 'User',
        score: row.finalScore
      })),
      me: meRow
        ? {
            rank: myRank,
            score: meRow.finalScore
          }
        : null
    });
  }

  /** POST /tests/claim-guest — привязать гостевой тест к авторизованному пользователю */
  async claimGuestTest(req: Request, res: Response): Promise<void> {
    const { testId, answers, forTrial }: ISubmitTestDTO = req.body;
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
    const trialExtra = this.trialTopicMasteryPayload(Boolean(forTrial), test, userAnswers);

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
    success(res, { ...detailed, ...trialExtra }, 'Guest test claimed successfully');
  }

  /** GET /tests/:id */
  async getTestById(req: Request, res: Response): Promise<void> {
    const test = await Test.findById(req.params.id);
    if (!test) throw AppError.notFound('Test not found');
    success(res, this.sanitize(test));
  }
}

export const testController = new TestController();

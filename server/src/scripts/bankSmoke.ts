import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Subject, KtpCatalog, User, UserKcMastery, QuestionItem } from '../models';
import { knowledgeComponentService, questionBankService, userKcMasteryService } from '../services';
import { buildKtpCanonicalNodes } from '../utils/roadmapKtp.util';
import { IKtpCatalog } from '../types/roadmap.types';
import { IQuestion, IUserAnswer } from '../types';

/**
 * SMOKE-ТЕСТ банка вопросов (Фазы 1-3), сквозной прогон через сервисы.
 *
 * Использование (из папки server/, нужен MONGODB_URI и OPENAI_API_KEY):
 *   npx ts-node src/scripts/bankSmoke.ts                 # авто-выбор предмета/темы
 *   npx ts-node src/scripts/bankSmoke.ts <subjectId> <ktpTopicId>
 *
 * НИЧЕГО не удаляет; создаёт KC (proposed/confirmed), QuestionItem'ы, один Test и
 * запись UserKcMastery для первого пользователя в БД (или фейкового, если юзеров нет).
 */

dotenv.config();
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://localhost:27017/edu-ai-test-platform';
  console.warn('⚠️  MONGODB_URI не задан, использую dev по умолчанию');
}

function log(step: string, data?: unknown): void {
  console.log(`\n=== ${step} ===`);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
}

/** Найти первый предмет + ktpTopicId, у которого узел КТП имеет источники. */
async function autoPick(): Promise<{ subjectId: string; ktpTopicId: string } | null> {
  const subjects = await Subject.find().lean();
  for (const subject of subjects) {
    const ktp = await KtpCatalog.findOne({ subjectId: subject._id }).lean<IKtpCatalog>();
    if (!ktp?.topics?.length) continue;
    const nodes = buildKtpCanonicalNodes(subject, ktp);
    const node = nodes.find(
      (n) => ((n.metadata as Record<string, unknown>)?.sources as unknown[] | undefined)?.length
    );
    const ktpTopicId = node && (node.metadata as Record<string, unknown>)?.ktpTopicId;
    if (typeof ktpTopicId === 'string') {
      return { subjectId: String(subject._id), ktpTopicId };
    }
  }
  return null;
}

async function run(): Promise<void> {
  await connectDB();

  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY не задан — propose/generate упадут. Задайте ключ для полного прогона.');
  }

  let subjectId = process.argv[2];
  let ktpTopicId = process.argv[3];
  if (!subjectId || !ktpTopicId) {
    const picked = await autoPick();
    if (!picked) {
      console.error('❌ Не нашёл предмет с КТП-узлом, у которого есть источники (Subject.Topic.ktpTopicIds → тема).');
      console.error('   Заведите КТП и сделайте маппинг тем книги на тему КТП, затем повторите.');
      await mongoose.connection.close();
      return;
    }
    ({ subjectId, ktpTopicId } = picked);
  }
  log('Выбраны subjectId / ktpTopicId', { subjectId, ktpTopicId });

  // 1) Предложить KC
  log('1. propose KC (AI)');
  const proposed = await knowledgeComponentService.propose(subjectId, ktpTopicId);
  log('Предложенные KC', proposed.map((k) => ({ id: String(k._id), title: k.title, status: k.status })));
  if (proposed.length === 0) throw new Error('AI не предложил ни одного KC');

  // 2) Подтвердить все KC
  const kcIds = proposed.map((k) => String(k._id));
  await knowledgeComponentService.confirm(subjectId, ktpTopicId, kcIds);
  const confirmed = await knowledgeComponentService.getConfirmed(subjectId, ktpTopicId);
  log('2. confirmed KC', confirmed);

  // 3) Покрытие ДО генерации
  log('3. coverage до генерации', await questionBankService.coverage(subjectId, ktpTopicId));

  // 4) Генерация банка под покрытие (хватит на тест из 10)
  const minPerKc = Math.max(3, Math.ceil(12 / confirmed.length));
  log('4. generateForCoverage (генерация + верификация + дедуп)', { minPerKc });
  const gen = await questionBankService.generateForCoverage(subjectId, ktpTopicId, { minPerKc });
  log('Результат генерации', { created: gen.created, rejected: gen.rejected, coverage: gen.coverage });

  // 5) Сборка теста из банка
  log('5. assembleNodeTest');
  const test = await questionBankService.assembleNodeTest(subjectId, ktpTopicId);
  const questions = test.questions as IQuestion[];
  log('Собран Test', {
    testId: String(test._id),
    bookId: String(test.bookId),
    questionsCount: questions.length,
    taggedWithKc: questions.filter((q) => q.knowledgeComponentIds?.length).length,
    taggedWithItemId: questions.filter((q) => q.questionItemId).length,
    sample: questions.slice(0, 2).map((q) => ({
      q: q.questionText.slice(0, 80),
      correct: q.correctOption,
      kc: q.knowledgeComponentIds,
      itemId: String(q.questionItemId)
    }))
  });

  // 6) Симуляция сабмита: первые 7 верно, остальные неверно → проверяем пер-KC mastery
  const user = await User.findOne().select('_id').lean();
  const userId = user?._id ? String(user._id) : new mongoose.Types.ObjectId().toString();
  log('6. submit (симуляция: 7 верных / 3 неверных)', { userId, realUser: Boolean(user) });

  const userAnswers: IUserAnswer[] = questions.map((q, i) => {
    const correct = i < 7;
    return {
      question: q.questionText,
      selectedOption: correct ? q.correctOption ?? '' : '___неверный___',
      isCorrect: correct
    };
  });
  await userKcMasteryService.recordFromSubmission(userId, subjectId, questions, userAnswers);

  // 7) Прочитать обратно пер-KC mastery + статистику item'ов
  const mastery = await UserKcMastery.findOne({ userId, subjectId }).lean();
  log('7. UserKcMastery после сабмита', {
    components: mastery?.components,
    recentItemIdsCount: mastery?.recentItemIds?.length
  });
  const items = await QuestionItem.find({ subjectId, knowledgeNodeId: ktpTopicId })
    .select('difficulty status knowledgeComponentIds qualityStats')
    .lean();
  log('Статистика QuestionItem (банк узла)', {
    total: items.length,
    active: items.filter((i) => i.status === 'active').length,
    retired: items.filter((i) => i.status === 'retired').length,
    used: items.filter((i) => (i.qualityStats?.timesUsed ?? 0) > 0).length
  });

  log('✅ SMOKE OK — сквозной поток прошёл');
  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('\n❌ SMOKE FAILED:', err);
  await mongoose.connection.close().catch(() => undefined);
  process.exit(1);
});

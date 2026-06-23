import mongoose from 'mongoose';
import { Test } from '../models';
import { IQuestion } from '../types';

/**
 * Проверка, что снятие хардкода Test.model (===10 → 1..120) РАЗБЛОКИРОВАЛО сохранение
 * trial-блоков на 20/40 вопросов (раньше Test.create падал на `length !== 10`).
 *
 * OFFLINE-часть (всегда, без БД/LLM):
 *   cd server && npx ts-node src/scripts/verifyTrialSave.ts
 * Использует Mongoose validateSync() — реальную схемную валидацию Test.model, без коннекта к БД.
 *
 * ONLINE-часть (если задан OPENAI_API_KEY): реально генерит ent-батч и проверяет, что
 * сгенерированные вопросы проходят валидатор Test.model. Размер задаётся 2-м аргументом (по умолч. 20):
 *   cd server && OPENAI_API_KEY=sk-... npx ts-node src/scripts/verifyTrialSave.ts 40
 */

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failures++;
}

function sampleQuestion(i: number): IQuestion {
  return {
    questionType: 'single_choice',
    questionText: `Контрольный вопрос №${i + 1} для проверки валидатора Test.model?`,
    options: ['Вариант А', 'Вариант Б', 'Вариант В', 'Вариант Г'],
    correctOption: 'Вариант А',
    aiExplanation: 'Пояснение для проверки.',
    relatedContent: { pages: [1] }
  } as IQuestion;
}

function buildTest(questions: IQuestion[]) {
  return new Test({
    subjectId: new mongoose.Types.ObjectId(),
    bookId: new mongoose.Types.ObjectId(),
    questions,
    sourceContentHash: 'verify-trial-save',
    testProfile: 'ent'
  });
}

function validatorAccepts(n: number): { ok: boolean; message?: string } {
  const err = buildTest(Array.from({ length: n }, (_, i) => sampleQuestion(i))).validateSync();
  return { ok: !err, ...(err ? { message: err.message } : {}) };
}

async function offline(): Promise<void> {
  console.log('=== OFFLINE: схемная валидация Test.model (validateSync, без БД) ===');
  for (const n of [10, 20, 40, 80, 120]) {
    const r = validatorAccepts(n);
    check(`length ${n} ПРИНИМАЕТСЯ сохранением`, r.ok, r.message);
  }
  for (const n of [0, 121]) {
    const r = validatorAccepts(n);
    check(`length ${n} ОТВЕРГАЕТСЯ сохранением`, !r.ok);
  }
}

async function online(size: number): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.log('\n(ONLINE-часть пропущена — нет OPENAI_API_KEY. Для полной проверки задай ключ.)');
    return;
  }
  // Ленивая загрузка, чтобы offline-часть не тянула сервис.
  const { aiService } = await import('../services');
  console.log(`\n=== ONLINE: генерация ent-батча на ${size} вопросов + проверка валидатором ===`);
  const content = {
    text:
      'Экологические факторы делятся на абиотические, биотические и антропогенные. ' +
      'Температура, свет и влажность — абиотические факторы. Взаимодействия организмов — биотические. ' +
      'Воздействие человека — антропогенные факторы. Пищевые цепи передают энергию между организмами.',
    metadata: {
      subjectTitle: 'Биология',
      bookTitle: 'Проверка',
      topics: ['Экологические факторы']
    }
  } as Parameters<typeof aiService.generateTest>[0];

  const generated = await aiService.generateTest(content, [], 'ent', { questionCount: size });
  check(`сгенерировано ровно ${size} вопросов`, generated.questions.length === size, generated.questions.length);

  const err = buildTest(generated.questions).validateSync();
  check('сгенерированный батч ПРОХОДИТ валидатор Test.model', !err, err?.message);
}

async function run(): Promise<void> {
  const size = Number(process.argv[2]) || 20;
  await offline();
  await online(size);
  console.log(`\n${failures === 0 ? '✅ Trial-save OK' : `❌ ${failures} проверок упало`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('❌ verifyTrialSave failed:', err);
  process.exit(1);
});

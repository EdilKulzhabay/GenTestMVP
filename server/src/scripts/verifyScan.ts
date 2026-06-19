import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Subject, KtpCatalog, QuestionItem, UserKcMastery } from '../models';
import { buildKtpCanonicalNodes } from '../utils/roadmapKtp.util';
import { IKtpCatalog } from '../types/roadmap.types';

/**
 * СКАН ПРЕДУСЛОВИЙ для проверки банка/KC.
 * Печатает по каждому предмету: есть ли КТП, сколько узлов с источниками (готовы к прогону),
 * сколько уже есть KC / вопросов в банке. В конце — готовая команда для bankSmoke.
 *
 *   cd server && npx ts-node src/scripts/verifyScan.ts
 */

dotenv.config();
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://localhost:27017/edu-ai-test-platform';
  console.warn('⚠️  MONGODB_URI не задан, использую dev по умолчанию');
}

async function run(): Promise<void> {
  await connectDB();
  console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'задан ✅' : 'НЕ задан ❌ (propose/generate упадут)'}`);

  const subjects = await Subject.find().select('_id title').lean();
  console.log(`\nПредметов в БД: ${subjects.length}\n`);

  let firstRunnable: { subjectId: string; ktpTopicId: string; title: string } | null = null;

  for (const subject of subjects) {
    const subjectId = String(subject._id);
    const ktp = await KtpCatalog.findOne({ subjectId }).lean<IKtpCatalog>();
    const ktpTopics = ktp?.topics?.length ?? 0;

    let runnableNodes = 0;
    let firstKtpTopicId: string | null = null;
    let confirmedKc = 0;
    if (ktp?.topics?.length) {
      const full = await Subject.findById(subjectId).lean();
      const nodes = buildKtpCanonicalNodes(full, ktp);
      for (const n of nodes) {
        const md = n.metadata as Record<string, unknown>;
        if ((md?.sources as unknown[] | undefined)?.length) {
          runnableNodes++;
          if (!firstKtpTopicId && typeof md.ktpTopicId === 'string') firstKtpTopicId = md.ktpTopicId;
        }
      }
      confirmedKc = (ktp.topics ?? []).reduce(
        (m, t) => m + (t.knowledgeComponents?.filter((k) => k.status === 'confirmed').length ?? 0),
        0
      );
    }

    const bankItems = await QuestionItem.countDocuments({ subjectId });
    console.log(
      `• ${subject.title}\n  subjectId=${subjectId}\n  КТП-тем: ${ktpTopics} | узлов с источниками (готовы): ${runnableNodes} | confirmed KC: ${confirmedKc} | вопросов в банке: ${bankItems}` +
        (firstKtpTopicId ? `\n  первый ktpTopicId: ${firstKtpTopicId}` : '')
    );

    if (!firstRunnable && firstKtpTopicId) {
      firstRunnable = { subjectId, ktpTopicId: firstKtpTopicId, title: subject.title };
    }
  }

  const masteryDocs = await UserKcMastery.countDocuments();
  console.log(`\nВсего записей UserKcMastery: ${masteryDocs}`);

  if (firstRunnable) {
    console.log(`\n✅ Готово к прогону. Запусти:\n  npx ts-node src/scripts/bankSmoke.ts ${firstRunnable.subjectId} ${firstRunnable.ktpTopicId}`);
  } else {
    console.log('\n❌ Нет ни одного узла с источниками. Заведи КТП и привяжи темы книги к темам КТП (Subject.Topic.ktpTopicIds).');
  }

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('❌ scan failed:', err);
  await mongoose.connection.close().catch(() => undefined);
  process.exit(1);
});

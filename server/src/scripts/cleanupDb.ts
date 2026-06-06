import dotenv from 'dotenv';
import mongoose, { Model } from 'mongoose';
import {
  Subject,
  User,
  Test,
  PendingRegistration,
  TelegramPhoneLink,
  CanonicalRoadmap,
  KtpCatalog,
  NodeLessonContent,
  UserRoadmapProgress,
  RoadmapAttempt,
  RoadmapChatAttachment,
  SoloAttempt,
  SoloSession,
  ProfileSubjectPair
} from '../models';

/**
 * Скрипт очистки БД для перехода на КТП-модель роудмапа («с чистого листа»).
 *
 * БЕЗОПАСНОСТЬ:
 *  - По умолчанию DRY-RUN: только печатает целевую БД и количество документов, НИЧЕГО не удаляет.
 *  - Реальное удаление — только с флагом --yes.
 *  - При NODE_ENV=production дополнительно требуется --force.
 *
 * Объём (--mode):
 *  - roadmap (по умолчанию): только производные роудмапа/КТП/прогресс/попытки/вложения чата.
 *  - content: roadmap + предметы, тесты, solo-сессии, пары профилей (ПОЛЬЗОВАТЕЛИ СОХРАНЯЮТСЯ).
 *  - all: всё перечисленное, ВКЛЮЧАЯ пользователей и регистрации (полный сброс данных приложения).
 *
 * Использование (из папки server/):
 *   MONGODB_URI="..." npx ts-node src/scripts/cleanupDb.ts                 # dry-run, mode=roadmap
 *   MONGODB_URI="..." npx ts-node src/scripts/cleanupDb.ts --mode=content  # dry-run
 *   MONGODB_URI="..." npx ts-node src/scripts/cleanupDb.ts --mode=content --yes
 *   MONGODB_URI="..." NODE_ENV=production npx ts-node src/scripts/cleanupDb.ts --mode=roadmap --yes --force
 */

dotenv.config();

if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://localhost:27017/edu-ai-test-platform';
  console.warn('⚠️  MONGODB_URI не задан, использую dev-значение по умолчанию (localhost).');
}

type Mode = 'roadmap' | 'content' | 'all';
type AnyModel = Model<any>;

const argv = process.argv.slice(2);
const has = (flag: string): boolean => argv.includes(flag);
const modeArg = (argv.find((a) => a.startsWith('--mode=')) ?? '--mode=roadmap').split('=')[1] as Mode;
const APPLY = has('--yes');
const FORCE = has('--force');

const ROADMAP_MODELS: Array<[string, AnyModel]> = [
  ['CanonicalRoadmap', CanonicalRoadmap as AnyModel],
  ['UserRoadmapProgress', UserRoadmapProgress as AnyModel],
  ['NodeLessonContent', NodeLessonContent as AnyModel],
  ['KtpCatalog', KtpCatalog as AnyModel],
  ['RoadmapAttempt', RoadmapAttempt as AnyModel],
  ['RoadmapChatAttachment', RoadmapChatAttachment as AnyModel]
];

const CONTENT_MODELS: Array<[string, AnyModel]> = [
  ['Subject', Subject as AnyModel],
  ['Test', Test as AnyModel],
  ['SoloAttempt', SoloAttempt as AnyModel],
  ['SoloSession', SoloSession as AnyModel],
  ['ProfileSubjectPair', ProfileSubjectPair as AnyModel]
];

const USER_MODELS: Array<[string, AnyModel]> = [
  ['User', User as AnyModel],
  ['PendingRegistration', PendingRegistration as AnyModel],
  ['TelegramPhoneLink', TelegramPhoneLink as AnyModel]
];

function modelsForMode(mode: Mode): Array<[string, AnyModel]> {
  if (mode === 'roadmap') return ROADMAP_MODELS;
  if (mode === 'content') return [...ROADMAP_MODELS, ...CONTENT_MODELS];
  return [...ROADMAP_MODELS, ...CONTENT_MODELS, ...USER_MODELS];
}

function maskUri(uri: string): string {
  return uri.replace(/:\/\/[^@]*@/, '://***:***@');
}

async function main(): Promise<void> {
  if (!['roadmap', 'content', 'all'].includes(modeArg)) {
    console.error(`❌ Неизвестный --mode=${modeArg}. Допустимо: roadmap | content | all`);
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI as string;
  await mongoose.connect(uri);
  const dbName = mongoose.connection.db?.databaseName ?? '(unknown)';

  console.log('────────────────────────────────────────────────────');
  console.log(`Target URI : ${maskUri(uri)}`);
  console.log(`Database   : ${dbName}`);
  console.log(`NODE_ENV   : ${process.env.NODE_ENV ?? '(not set)'}`);
  console.log(`Mode       : ${modeArg}`);
  console.log(`Apply      : ${APPLY ? 'YES (будет удалено)' : 'NO (dry-run)'}`);
  console.log('────────────────────────────────────────────────────');

  const targets = modelsForMode(modeArg);
  let total = 0;
  for (const [name, model] of targets) {
    const count = await model.estimatedDocumentCount();
    total += count;
    console.log(`  ${name.padEnd(22)} ${String(count).padStart(8)} docs${APPLY ? ' → удаляю…' : ''}`);
  }
  console.log(`  ${'TOTAL'.padEnd(22)} ${String(total).padStart(8)} docs`);
  console.log('────────────────────────────────────────────────────');

  if (!APPLY) {
    console.log('DRY-RUN: ничего не удалено. Для удаления добавьте --yes.');
    await mongoose.connection.close();
    return;
  }

  if ((process.env.NODE_ENV === 'production') && !FORCE) {
    console.error('❌ NODE_ENV=production: для реального удаления требуется ещё и --force.');
    await mongoose.connection.close();
    process.exit(1);
  }

  for (const [name, model] of targets) {
    const res = await model.deleteMany({});
    console.log(`  ✅ ${name.padEnd(22)} удалено ${res.deletedCount ?? 0}`);
  }

  console.log('────────────────────────────────────────────────────');
  console.log('Готово. Новые коллекции (ktp_catalogs, node_lesson_content) создадутся при работе приложения.');
  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error('❌ Ошибка очистки:', err);
  await mongoose.connection.close().catch(() => undefined);
  process.exit(1);
});

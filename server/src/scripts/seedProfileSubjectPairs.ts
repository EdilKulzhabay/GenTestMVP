import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { ProfileSubjectPair, Subject, buildPairKey } from '../models';

/**
 * Скрипт: загрузка пар профильных предметов из
 * server/scripts/data/profileSubjectPairs.json
 *
 * Формат файла — массив пар по тайтлам предметов:
 *   [["Математика","Физика"], ["Биология","Химия"], ...]
 *
 * Идемпотентно: пара ищется по pairKey (без учёта порядка), дубликаты пропускаются.
 * Требует, чтобы оба предмета уже существовали и были subjectKind === 'profile'
 * (сначала прогоните `npm run seed:subjects`).
 *
 * Использование (из папки server/):
 *   npx ts-node src/scripts/seedProfileSubjectPairs.ts
 *
 * Требуется MONGODB_URI (или dev-значение по умолчанию).
 */

dotenv.config();

if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://localhost:27017/edu-ai-test-platform';
  console.warn('⚠️  MONGODB_URI не задан, использую dev значение по умолчанию');
}

const PAIRS_FILE = path.join(__dirname, '../../scripts/data/profileSubjectPairs.json');

function buildTitle(t1: string, t2: string): string {
  return `${t1.trim()} - ${t2.trim()}`;
}

async function run(): Promise<void> {
  await connectDB();

  if (!fs.existsSync(PAIRS_FILE)) {
    throw new Error(`Файл с парами не найден: ${PAIRS_FILE}`);
  }

  const parsed = JSON.parse(fs.readFileSync(PAIRS_FILE, 'utf8')) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('Ожидался массив пар [["A","B"], ...] в profileSubjectPairs.json');
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of parsed) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      typeof entry[1] !== 'string'
    ) {
      console.warn(`⚠️  Пропуск некорректной записи: ${JSON.stringify(entry)}`);
      failed++;
      continue;
    }

    const title1 = entry[0].trim();
    const title2 = entry[1].trim();

    const s1 = await Subject.findOne({ title: title1 });
    const s2 = await Subject.findOne({ title: title2 });

    if (!s1 || !s2) {
      const missing = [!s1 ? title1 : null, !s2 ? title2 : null].filter(Boolean).join(', ');
      console.warn(`⚠️  Пропуск "${title1} + ${title2}": не найден(ы) предмет(ы): ${missing}`);
      failed++;
      continue;
    }

    if (s1.subjectKind !== 'profile' || s2.subjectKind !== 'profile') {
      console.warn(`⚠️  Пропуск "${title1} + ${title2}": оба предмета должны быть subjectKind === 'profile'`);
      failed++;
      continue;
    }

    const pairKey = buildPairKey(String(s1._id), String(s2._id));

    const existing = await ProfileSubjectPair.findOne({ pairKey });
    if (existing) {
      console.log(`⏭  Уже есть: "${existing.title}"`);
      skipped++;
      continue;
    }

    const title = buildTitle(s1.title, s2.title);
    await ProfileSubjectPair.create({
      title,
      subject1Id: s1._id,
      subject2Id: s2._id,
      pairKey
    });

    console.log(`✅ Создана пара: "${title}"`);
    created++;
  }

  console.log('');
  console.log(`Готово. Создано: ${created}, пропущено (дубликат): ${skipped}, ошибок/пропусков: ${failed}`);

  await mongoose.connection.close();
  // Ненулевой код выхода при пропусках — чтобы частичный сид не выглядел успешным в CI/seed:catalog.
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

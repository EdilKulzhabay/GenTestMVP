import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Subject } from '../models';
import type { SubjectKind } from '../types';

/**
 * Скрипт: загрузка предметов из server/scripts/data/subjects/*.json
 *
 * Использование (из папки server/):
 *   npx ts-node src/scripts/seedSubjects.ts
 *   npx ts-node src/scripts/seedSubjects.ts --update   # обновить books/description у существующих по title
 *
 * Требуется MONGODB_URI (или по умолчанию mongodb://localhost:27017/edu-ai-test-platform)
 */

dotenv.config();

if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://localhost:27017/edu-ai-test-platform';
  console.warn('⚠️  MONGODB_URI не задан, использую dev значение по умолчанию');
}

const SUBJECTS_DIR = path.join(__dirname, '../../scripts/data/subjects');

type SubjectSeedFile = {
  title: string;
  description?: string;
  subjectKind?: SubjectKind;
  books?: unknown[];
};

async function run(): Promise<void> {
  const doUpdate = process.argv.includes('--update');
  if (doUpdate) {
    console.log('Режим --update: существующие предметы по title получают books, description, subjectKind из JSON.\n');
  }

  await connectDB();

  if (!fs.existsSync(SUBJECTS_DIR)) {
    throw new Error(`Папка с JSON не найдена: ${SUBJECTS_DIR}`);
  }

  const files = fs
    .readdirSync(SUBJECTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.log('Нет .json файлов в', SUBJECTS_DIR);
    await mongoose.connection.close();
    return;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const name of files) {
    const raw = fs.readFileSync(path.join(SUBJECTS_DIR, name), 'utf8');
    const data = JSON.parse(raw) as SubjectSeedFile;

    if (!data.title || typeof data.title !== 'string') {
      console.warn(`⚠️  Пропуск ${name}: нет title`);
      continue;
    }

    const title = data.title.trim();
    const kind: SubjectKind = data.subjectKind === 'profile' ? 'profile' : 'main';
    const books = Array.isArray(data.books) ? data.books : [];

    const existing = await Subject.findOne({ title });
    if (existing) {
      if (doUpdate) {
        await Subject.updateOne(
          { _id: existing._id },
          {
            $set: {
              description: (data.description && String(data.description).trim()) || '',
              subjectKind: kind,
              books
            }
          }
        );
        const bookN = Array.isArray(books) ? books.length : 0;
        console.log(`🔄 Обновлён: "${title}" — книг в сиде: ${bookN} (${name})`);
        updated++;
      } else {
        console.log(`⏭  Уже есть: "${title}" (${name}) — для подтягивания книг: npm run seed:subjects:update`);
        skipped++;
      }
      continue;
    }

    await Subject.create({
      title,
      description: (data.description && String(data.description).trim()) || '',
      subjectKind: kind,
      books
    });

    console.log(`✅ Создан: "${title}" [${kind}] — ${name}`);
    created++;
  }

  console.log('');
  if (doUpdate) {
    console.log(`Готово. Создано: ${created}, обновлено: ${updated}, пропущено: ${skipped}`);
  } else {
    console.log(`Готово. Создано: ${created}, пропущено (дубликат по title): ${skipped}`);
  }

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

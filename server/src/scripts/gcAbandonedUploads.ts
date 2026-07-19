import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Subject } from '../models';
import { ASSET_UPLOAD_ROOT, localDiskPathFromUrl } from '../middlewares/assetUpload.middleware';

/**
 * Скрипт GC: удаляет файлы в uploads/subject-assets, на которые не ссылается ни один ассет
 * (остаются от uploadAsset без последующего addAsset). По умолчанию dry-run.
 *
 * Использование (из папки server/):
 *   npx ts-node src/scripts/gcAbandonedUploads.ts                 # dry-run
 *   npx ts-node src/scripts/gcAbandonedUploads.ts --apply         # удалить
 *   npx ts-node src/scripts/gcAbandonedUploads.ts --older-than-hours=48
 *
 * Требуется MONGODB_URI (или dev-дефолт).
 */

dotenv.config();

if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://localhost:27017/edu-ai-test-platform';
  console.warn('⚠️  MONGODB_URI не задан, использую dev значение по умолчанию');
}

function argValue(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const olderThanHours = Math.max(0, Number(argValue('older-than-hours') ?? '24') || 0);
  const cutoff = Date.now() - olderThanHours * 3600_000;

  await connectDB();

  // Все диск-пути, на которые ссылается хоть один ассет (image url/webpUrl + formula imageUrl).
  const subjects = await Subject.find(
    {},
    {
      'books.chapters.topics.assets.url': 1,
      'books.chapters.topics.assets.webpUrl': 1,
      'books.chapters.topics.assets.imageUrl': 1,
    }
  ).lean();
  const referenced = new Set<string>();
  for (const s of subjects) {
    for (const b of s.books ?? []) {
      for (const c of b.chapters ?? []) {
        for (const t of c.topics ?? []) {
          for (const a of t.assets ?? []) {
            for (const url of [a.url, a.webpUrl, a.imageUrl]) {
              const p = url ? localDiskPathFromUrl(url) : null;
              if (p) referenced.add(path.resolve(p));
            }
          }
        }
      }
    }
  }

  let scanned = 0;
  let bytes = 0;
  let deleted = 0;
  const orphans: string[] = [];

  let dirs: string[] = [];
  try {
    dirs = await fs.readdir(ASSET_UPLOAD_ROOT);
  } catch {
    dirs = [];
  }
  for (const dir of dirs) {
    const abs = path.join(ASSET_UPLOAD_ROOT, dir);
    let files: string[] = [];
    try {
      files = await fs.readdir(abs);
    } catch {
      continue;
    }
    for (const f of files) {
      const file = path.join(abs, f);
      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(file);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      scanned += 1;
      if (referenced.has(path.resolve(file))) continue;
      if (stat.mtimeMs > cutoff) continue; // слишком свежий — возможно, аплоад «в полёте»
      orphans.push(file);
      bytes += stat.size;
      if (apply) {
        await fs.unlink(file).catch(() => undefined);
        deleted += 1;
      }
    }
  }

  console.log(
    `\n=== gcAbandonedUploads (${apply ? 'APPLY' : 'DRY-RUN'}) older-than=${olderThanHours}h ===`
  );
  console.log(
    `scanned: ${scanned}, referenced: ${referenced.size}, orphans: ${orphans.length} (${(bytes / 1024 / 1024).toFixed(2)} MB)`
  );
  if (apply) console.log(`deleted: ${deleted}`);
  for (const o of orphans.slice(0, 50)) console.log(`   orphan: ${o}`);
  if (orphans.length > 50) console.log(`   … +${orphans.length - 50} more`);
  if (!apply && orphans.length > 0)
    console.log('\n(dry-run) чтобы удалить: npm run gc:uploads:apply');
}

run()
  .then(async () => {
    await mongoose.connection.close();
    process.exit(0);
  })
  .catch(async err => {
    console.error('gcAbandonedUploads failed:', err);
    await mongoose.connection.close().catch(() => undefined);
    process.exit(1);
  });

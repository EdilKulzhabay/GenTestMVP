import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Subject } from '../models';
import { AssetKind, IContentAsset, INewContentAsset } from '../types';
import {
  assetContentHash,
  extractCandidates,
  insertTokensAfterSpans,
} from '../utils/assetExtract.util';
import { buildAssetToken } from '../utils/assetToken.util';

/**
 * Скрипт backfill: извлекает ассеты (таблицы/изображения/формулы) из markdown-прозы книг
 * в Topic.assets, вставляет placement-токены рядом с блоком (inline-копия сохраняется).
 * Идемпотентен по content-hash. По умолчанию dry-run.
 *
 * Использование (из папки server/):
 *   npx ts-node src/scripts/backfillAssets.ts                          # dry-run, kinds=table,image
 *   npx ts-node src/scripts/backfillAssets.ts --apply --subject=<id>
 *   npx ts-node src/scripts/backfillAssets.ts --kinds=table,image,formula --out=report.json
 *
 * Требуется MONGODB_URI (или dev-дефолт).
 */

dotenv.config();

if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://localhost:27017/edu-ai-test-platform';
  console.warn('⚠️  MONGODB_URI не задан, использую dev значение по умолчанию');
}

const ALL_KINDS: AssetKind[] = ['table', 'image', 'formula', 'problem'];
const DEFAULT_KINDS: AssetKind[] = ['table', 'image'];

function argValue(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

type Action = 'create' | 'skip-duplicate';
type CandidateReport = { kind: AssetKind; preview: string; paragraphId?: string; action: Action };
type TopicReport = { topicId?: string; title: string; candidates: CandidateReport[] };
type SubjectReport = {
  subjectId: string;
  title: string;
  create: number;
  skipDuplicate: number;
  topics: TopicReport[];
};

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const requestedKinds =
    argValue('kinds')
      ?.split(',')
      .map(s => s.trim())
      .filter(Boolean) ?? DEFAULT_KINDS;
  const kinds = new Set<AssetKind>(
    requestedKinds.filter((k): k is AssetKind => (ALL_KINDS as string[]).includes(k))
  );
  const subjectFilter =
    argValue('subject')
      ?.split(',')
      .map(s => s.trim())
      .filter(Boolean) ?? [];
  const outPath = argValue('out');

  await connectDB();

  const query = subjectFilter.length ? { _id: { $in: subjectFilter } } : {};
  const subjects = await Subject.find(query);

  const report: SubjectReport[] = [];
  const totals = {
    create: 0,
    skipDuplicate: 0,
    byKind: {} as Record<string, number>,
    topicsAffected: 0,
    subjectsAffected: 0,
  };

  for (const subject of subjects) {
    let subjectCreate = 0;
    let subjectSkip = 0;
    let subjectMutated = false;
    const topicReports: TopicReport[] = [];

    for (const book of subject.books) {
      for (const chapter of book.chapters) {
        for (const topic of chapter.topics) {
          const existingHashes = new Set<string>(
            (topic.assets ?? []).map(a => assetContentHash(a as INewContentAsset))
          );
          const candReports: CandidateReport[] = [];

          for (const paragraph of topic.paragraphs) {
            const text = paragraph.content?.text ?? '';
            const candidates = extractCandidates(text, kinds);
            if (!candidates.length) continue;

            const inserts: { end: number; token: string }[] = [];
            for (const cand of candidates) {
              const pid = paragraph._id?.toString();
              if (existingHashes.has(cand.dedupeKey)) {
                subjectSkip += 1;
                candReports.push({
                  kind: cand.kind,
                  preview: cand.preview,
                  paragraphId: pid,
                  action: 'skip-duplicate',
                });
                continue;
              }
              existingHashes.add(cand.dedupeKey);
              subjectCreate += 1;
              totals.byKind[cand.kind] = (totals.byKind[cand.kind] ?? 0) + 1;
              if (apply) {
                const _id = new mongoose.Types.ObjectId();
                const doc: IContentAsset = { _id, ...cand.asset };
                topic.assets = topic.assets ?? [];
                topic.assets.push(doc);
                inserts.push({ end: cand.end, token: buildAssetToken(_id.toString()) });
                subjectMutated = true;
              }
              candReports.push({
                kind: cand.kind,
                preview: cand.preview,
                paragraphId: pid,
                action: 'create',
              });
            }
            if (apply && inserts.length) {
              paragraph.content.text = insertTokensAfterSpans(text, inserts);
            }
          }

          if (candReports.length) {
            topicReports.push({
              topicId: topic._id?.toString(),
              title: topic.title,
              candidates: candReports,
            });
          }
        }
      }
    }

    if (apply && subjectMutated) await subject.save();
    if (topicReports.length) {
      report.push({
        subjectId: String(subject._id),
        title: subject.title,
        create: subjectCreate,
        skipDuplicate: subjectSkip,
        topics: topicReports,
      });
      totals.create += subjectCreate;
      totals.skipDuplicate += subjectSkip;
      totals.topicsAffected += topicReports.length;
      totals.subjectsAffected += 1;
    }
  }

  console.log(
    `\n=== backfillAssets (${apply ? 'APPLY' : 'DRY-RUN'}) kinds=[${[...kinds].join(',')}] ===`
  );
  console.log(
    `subjects scanned: ${subjects.length}, affected: ${totals.subjectsAffected}, topics: ${totals.topicsAffected}`
  );
  console.log(
    `create: ${totals.create}, skip-duplicate: ${totals.skipDuplicate}, byKind: ${JSON.stringify(totals.byKind)}`
  );
  for (const s of report) {
    console.log(`\n• ${s.title} [${s.subjectId}] create=${s.create} skip=${s.skipDuplicate}`);
    for (const t of s.topics) {
      console.log(`   – ${t.title}: ${t.candidates.map(c => `${c.action}:${c.kind}`).join(', ')}`);
    }
  }
  if (outPath) {
    fs.writeFileSync(
      path.resolve(outPath),
      JSON.stringify(
        { mode: apply ? 'apply' : 'dry-run', kinds: [...kinds], totals, subjects: report },
        null,
        2
      )
    );
    console.log(`\nreport → ${outPath}`);
  }
  if (!apply && totals.create > 0) {
    const scope = subjectFilter.length ? ` --subject=${subjectFilter.join(',')}` : '';
    console.log(`\n(dry-run) применить: npm run backfill:assets:apply --${scope}`);
  }
}

run()
  .then(async () => {
    await mongoose.connection.close();
    process.exit(0);
  })
  .catch(async err => {
    console.error('backfillAssets failed:', err);
    await mongoose.connection.close().catch(() => undefined);
    process.exit(1);
  });

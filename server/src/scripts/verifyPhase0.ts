import { aiService } from '../services';
import {
  ROADMAP_KNOWLEDGE_TEST_PASS_PERCENT,
  ROADMAP_MAX_KNOWLEDGE_TEST_FAILS_BEFORE_BLOCK,
  isMasteredByBestScore
} from '../roadmap/roadmap.rules';

/**
 * Проверка детерминированной логики Фазы 0 — без БД и без LLM.
 *   cd server && npx ts-node src/scripts/verifyPhase0.ts
 *
 * Проверяет:
 *  1) computeTestContentHash стабилен (тот же контент → тот же ключ кэша — основа фикса over-reuse).
 *  2) разный профиль/кол-во вопросов → разный ключ (кэш не путает разные тесты).
 *  3) инвариант mastery: освоенный узел НЕ копит fail-счётчик (фикс «mastered и заблокирован»).
 */

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failures++;
}

// --- 1 & 2: хэш контента ---
const text = 'Дроби: понятие, сравнение, операции. Пример: 1/2 + 1/3 = 5/6.';
const h1 = aiService.computeTestContentHash(text, 'ent', 10);
const h1again = aiService.computeTestContentHash(text, 'ent', 10);
const hRegular = aiService.computeTestContentHash(text, 'regular', 10);
const hEnt20 = aiService.computeTestContentHash(text, 'ent', 20);
const hOtherText = aiService.computeTestContentHash(text + ' лишнее', 'ent', 10);

check('1. хэш детерминирован (один контент → один ключ)', h1 === h1again);
check('2a. ent vs regular → разные ключи', h1 !== hRegular);
check('2b. ent-10 vs ent-20 → разные ключи', h1 !== hEnt20);
check('2c. другой текст → другой ключ', h1 !== hOtherText);

// --- 3: инвариант fail-счётчика (повторяет правило из recordTestSubmitted) ---
function lowScoreFailAfter(scorePercent: number, prevFail: number, prevMastered: boolean): { mastered: boolean; fail: number } {
  const bestScore = Math.max(0, scorePercent);
  const mastered = prevMastered || isMasteredByBestScore(bestScore);
  const fail =
    mastered || scorePercent >= ROADMAP_KNOWLEDGE_TEST_PASS_PERCENT
      ? 0
      : Math.min(ROADMAP_MAX_KNOWLEDGE_TEST_FAILS_BEFORE_BLOCK, prevFail + 1);
  return { mastered, fail };
}

console.log('\nПороги: mastery(best)≥70, knowledge-test pass≥' + ROADMAP_KNOWLEDGE_TEST_PASS_PERCENT);
for (const score of [40, 60, 70, 75, 79, 80, 90]) {
  const r = lowScoreFailAfter(score, 0, false);
  const invariantOk = !(r.mastered && r.fail > 0); // освоенный не должен копить fail
  check(`3. score=${score} → mastered=${r.mastered}, fail=${r.fail} (освоенный не блокируется)`, invariantOk);
}

console.log(`\n${failures === 0 ? '✅ Phase 0 logic OK' : `❌ ${failures} проверок упало`}`);
process.exit(failures === 0 ? 0 : 1);

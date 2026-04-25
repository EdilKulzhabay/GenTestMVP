/**
 * Бизнес-правила Roadmap (MVP).
 * Rule 2: mastered если bestScore ≥ THRESHOLD (глобальный best по узлу).
 * Порог и коды причин — единственный источник правды для сервиса.
 */

/** Минимальный процент для засчитывания узла как освоенного при обычных тестах по узлу */
export const ROADMAP_MASTERY_THRESHOLD_PERCENT = 70;

/** Порог «освоено» по результатам пробного тестирования (на главу) */
export const ROADMAP_TRIAL_MASTERY_THRESHOLD_PERCENT = 80;

/**
 * Порог для теста по узлу карты: результат ниже — считается неудачной попыткой (счётчик lowScoreFailCount).
 * Совпадает с «пробником» 80%.
 */
export const ROADMAP_KNOWLEDGE_TEST_PASS_PERCENT = ROADMAP_TRIAL_MASTERY_THRESHOLD_PERCENT;

/** Сколько неудачных попыток (< порога) подряд — блокируем повтор теста до кнопки «Освоил» */
export const ROADMAP_MAX_KNOWLEDGE_TEST_FAILS_BEFORE_BLOCK = 3;

/** Сколько последних попыток учитывать для bestScore (если включите rolling window; сейчас используем глобальный best) */
export const ROADMAP_BEST_SCORE_WINDOW_N = 3;

/** Сколько узлов отдавать в списке рекомендаций */
export const ROADMAP_TOP_K_RECOMMENDATIONS = 3;

export type RecommendedReasonCode =
  | 'CONTINUE_IN_PROGRESS'
  | 'UNLOCKS_NEXT_TOPICS'
  | 'LOW_MASTERY'
  | 'PART_OF_MAIN_PATH'
  | 'NOT_STARTED';

/** masteryScore 0..1 из bestScore процента */
export function scorePercentToMasteryScore(scorePercent: number): number {
  return Math.min(1, Math.max(0, scorePercent / 100));
}

export function isMasteredByBestScore(bestScorePercent: number): boolean {
  return bestScorePercent >= ROADMAP_MASTERY_THRESHOLD_PERCENT;
}

export function isMasteredByTrialScore(scorePercent: number): boolean {
  return scorePercent >= ROADMAP_TRIAL_MASTERY_THRESHOLD_PERCENT;
}

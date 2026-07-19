/**
 * ENT SCALE
 * Структура ЕНТ (Казахстан): 3 обязательных блока + 2 профильных, максимум 140 баллов.
 * Единственный источник весов для пробника (trial.service) и прогноза балла
 * (entProgress.service) — «140» нигде больше не хардкодится.
 */

export interface IEntMainBlock {
  /** Точный тайтл main-предмета в каталоге (Subject.title, seed держит их русскими) */
  title: string;
  questionCount: number;
  points: number;
}

export const ENT_MAIN_BLOCKS: readonly IEntMainBlock[] = [
  { title: 'История Казахстана', questionCount: 20, points: 20 },
  { title: 'Математическая грамотность', questionCount: 10, points: 10 },
  { title: 'Грамотность чтения', questionCount: 10, points: 10 }
];

/** Профильный блок; у пользователя их два — из выбранной пары */
export const ENT_PROFILE_BLOCK = { questionCount: 40, points: 50 } as const;

export const ENT_PROFILE_BLOCK_COUNT = 2;

/** Максимальный балл ЕНТ: 20 + 10 + 10 + 2×50 = 140 */
export const ENT_MAX_SCORE =
  ENT_MAIN_BLOCKS.reduce((sum, b) => sum + b.points, 0) +
  ENT_PROFILE_BLOCK.points * ENT_PROFILE_BLOCK_COUNT;

/** Лейбл блока для конфига/плана пробника: «Предмет: N вопросов (M баллов)» */
export function entBlockLabel(title: string, questionCount: number, points: number): string {
  return `${title}: ${questionCount} вопросов (${points} баллов)`;
}

import { IQuestion, IUserAnswer } from '../types';
import { topicNodeId } from './roadmapChapter.util';
import { ROADMAP_TRIAL_MASTERY_THRESHOLD_PERCENT } from '../roadmap/roadmap.rules';

type TopicKey = string;

/**
 * Результаты пробника: по темам, где в этом тесте ≥ порога (по умолчанию 80%) правильных.
 * Считает только вопросы с relatedContent.topicId и chapterId (нужен nodeId = book:chapter:topic).
 */
export function computeTrialTopicMasteryRows(
  subjectId: string,
  bookId: string,
  test: { questions: IQuestion[] },
  userAnswers: IUserAnswer[]
): Array<{ subjectId: string; nodeId: string; scorePercent: number }> {
  if (test.questions.length !== userAnswers.length) return [];
  const byTopic = new Map<TopicKey, { correct: number; total: number; chapterId: string; topicId: string }>();

  for (let i = 0; i < test.questions.length; i++) {
    const q = test.questions[i];
    const ua = userAnswers[i];
    const rc = q.relatedContent;
    if (!rc?.topicId || !rc?.chapterId) continue;
    const chapterId = rc.chapterId.toString();
    const topicId = rc.topicId.toString();
    const key = `${chapterId}\x1f${topicId}`;
    const acc = byTopic.get(key) ?? { correct: 0, total: 0, chapterId, topicId };
    acc.total += 1;
    if (ua.isCorrect) acc.correct += 1;
    byTopic.set(key, acc);
  }

  const bookIdStr = String(bookId);
  const out: Array<{ subjectId: string; nodeId: string; scorePercent: number }> = [];
  for (const v of byTopic.values()) {
    if (v.total < 1) continue;
    const scorePercent = Math.round((v.correct / v.total) * 100);
    if (scorePercent < ROADMAP_TRIAL_MASTERY_THRESHOLD_PERCENT) continue;
    out.push({
      subjectId: String(subjectId),
      nodeId: topicNodeId(bookIdStr, v.chapterId, v.topicId),
      scorePercent
    });
  }
  return out;
}

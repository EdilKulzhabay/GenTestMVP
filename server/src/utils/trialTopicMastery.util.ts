import { IQuestion, IUserAnswer } from '../types';
import { mapBookTopicToKtpNodeIds } from './roadmapKtp.util';
import { ROADMAP_TRIAL_MASTERY_THRESHOLD_PERCENT } from '../roadmap/roadmap.rules';

type TopicKey = string;

/**
 * Результаты пробника: узлы КТП, где в этом тесте ≥ порога (по умолчанию 80%) правильных.
 *
 * Считает корректность по (chapterId, topicId) из relatedContent, затем ФАНАУТИТ каждую
 * тему книги на все КТП-узлы (`ktp:*`), на которые она замаплена (Subject.Topic.ktpTopicIds).
 * Один узел КТП может получить вклад от нескольких тем книг — берём максимальный score.
 */
export function computeTrialTopicMasteryRows(
  subject: unknown,
  bookId: string,
  test: { subjectId?: unknown; questions: IQuestion[] },
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

  const sid = (subject as { _id?: unknown })._id;
  const subjectId = sid ? String(sid) : String(test.subjectId ?? '');

  // Фанаут темы книги → КТП-узлы; дедуп по максимальному score на узел.
  const bestByNode = new Map<string, number>();
  for (const v of byTopic.values()) {
    if (v.total < 1) continue;
    const scorePercent = Math.round((v.correct / v.total) * 100);
    if (scorePercent < ROADMAP_TRIAL_MASTERY_THRESHOLD_PERCENT) continue;
    for (const nodeId of mapBookTopicToKtpNodeIds(subject, bookId, v.chapterId, v.topicId)) {
      const prev = bestByNode.get(nodeId) ?? 0;
      if (scorePercent > prev) bestByNode.set(nodeId, scorePercent);
    }
  }

  const out: Array<{ subjectId: string; nodeId: string; scorePercent: number }> = [];
  for (const [nodeId, scorePercent] of bestByNode) {
    out.push({ subjectId, nodeId, scorePercent });
  }
  return out;
}

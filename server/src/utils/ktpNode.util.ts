import mongoose from 'mongoose';

/**
 * nodeId роудмапа в КТП-модели: `ktp:{ktpTopicId}`.
 * Стабилен при переименовании/переупорядочивании темы КТП (привязан к её _id).
 */
export const KTP_NODE_PREFIX = 'ktp:';

export function ktpNodeId(ktpTopicId: string): string {
  return `${KTP_NODE_PREFIX}${ktpTopicId}`;
}

export function parseKtpNodeId(nodeId: string): string | null {
  if (!nodeId.startsWith(KTP_NODE_PREFIX)) return null;
  const id = nodeId.slice(KTP_NODE_PREFIX.length);
  return mongoose.isValidObjectId(id) ? id : null;
}

/** lessonId урока внутри узла: стабилен по теме-источнику книги. */
export function ktpLessonId(nodeId: string, sourceTopicId: string): string {
  return `${nodeId}::${sourceTopicId}`;
}

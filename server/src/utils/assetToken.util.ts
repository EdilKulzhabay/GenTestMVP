/**
 * Формат placement-токена ассета — ЗЕРКАЛО фронта:
 *   edu/packages/shared/src/components/RichContent/lib/assetToken.ts
 * Держать в синхроне: расхождение сломает резолв ассетов в уроках/тестах.
 * Токен вида:  ```asset\nid=<id>\n```
 */

export const ASSET_TOKEN_LANG = 'asset';

export type AssetContentSegment =
  | { type: 'markdown'; text: string }
  | { type: 'asset'; id: string };

const ASSET_TOKEN_PATTERN = /```asset[ \t]*\r?\n[ \t]*id=([^\r\n`]+)[ \t]*\r?\n[ \t]*```/g;

export function buildAssetToken(id: string): string {
  return '```' + ASSET_TOKEN_LANG + '\nid=' + id + '\n```';
}

export function splitAssetContent(markdown: string): AssetContentSegment[] {
  const segments: AssetContentSegment[] = [];
  let lastIndex = 0;
  ASSET_TOKEN_PATTERN.lastIndex = 0;
  let match = ASSET_TOKEN_PATTERN.exec(markdown);
  while (match !== null) {
    const text = markdown.slice(lastIndex, match.index);
    if (text.length > 0) segments.push({ type: 'markdown', text });
    segments.push({ type: 'asset', id: (match[1] ?? '').trim() });
    lastIndex = match.index + match[0].length;
    match = ASSET_TOKEN_PATTERN.exec(markdown);
  }
  const tail = markdown.slice(lastIndex);
  if (tail.length > 0) segments.push({ type: 'markdown', text: tail });
  return segments;
}

/** Множество assetId, размещённых токенами в тексте (для idempotency/coverage). */
export function collectPlacedAssetIds(text: string): Set<string> {
  const ids = new Set<string>();
  for (const seg of splitAssetContent(text)) {
    if (seg.type === 'asset') ids.add(seg.id);
  }
  return ids;
}

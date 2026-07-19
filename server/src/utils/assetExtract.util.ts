import { createHash } from 'crypto';
import { AssetKind, INewContentAsset } from '../types';

/**
 * Чистый (без БД) экстрактор ассетов из markdown-прозы параграфа.
 * Детерминирован и идемпотентен по content-hash. Детекторы: таблица (GFM), изображение,
 * формула (display-math). problem — вне scope (нет синтаксического сигнала).
 */

export type ExtractedCandidate = {
  kind: AssetKind;
  asset: INewContentAsset;
  start: number;
  end: number;
  preview: string;
  dedupeKey: string;
};

type LineSpan = { text: string; start: number; end: number };

function lineSpans(text: string): LineSpan[] {
  const out: LineSpan[] = [];
  let start = 0;
  for (const raw of text.split('\n')) {
    out.push({ text: raw, start, end: start + raw.length });
    start += raw.length + 1;
  }
  return out;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function previewOf(block: string): string {
  const one = block.replace(/\s+/g, ' ').trim();
  return one.length > 80 ? `${one.slice(0, 80)}…` : one;
}

/** Нормализованный content-hash ассета (дедуп в пределах темы; зеркалит подход банка). */
export function assetContentHash(asset: INewContentAsset): string {
  const parts: string[] = [asset.kind];
  if (asset.kind === 'table') {
    parts.push('cols:' + (asset.columns ?? []).map(norm).join('|'));
    parts.push('rows:' + (asset.rows ?? []).map(r => r.map(norm).join('|')).join('||'));
  } else if (asset.kind === 'image') {
    parts.push('url:' + norm(asset.url ?? ''), 'alt:' + norm(asset.alt ?? ''));
  } else if (asset.kind === 'formula') {
    parts.push('latex:' + norm(asset.latex ?? ''), 'display:' + String(asset.display ?? false));
  }
  return createHash('sha256').update(parts.join('§')).digest('hex');
}

function parseCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

function isDelimiterRow(line: string): boolean {
  const s = line.trim();
  if (!s.includes('-')) return false;
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(s);
}

function looksLikeRow(line: string): boolean {
  return line.includes('|') && line.trim().length > 0;
}

function extractTables(lines: LineSpan[], text: string): ExtractedCandidate[] {
  const out: ExtractedCandidate[] = [];
  let i = 0;
  while (i < lines.length) {
    const header = lines[i];
    const delim = lines[i + 1];
    if (header && looksLikeRow(header.text) && delim && isDelimiterRow(delim.text)) {
      const columns = parseCells(header.text).filter(c => c.length > 0);
      const rows: string[][] = [];
      let j = i + 2;
      let lastEnd = delim.end;
      while (j < lines.length && looksLikeRow(lines[j].text) && !isDelimiterRow(lines[j].text)) {
        const cells = parseCells(lines[j].text);
        const normalized = Array.from({ length: columns.length }, (_, k) => cells[k] ?? '');
        rows.push(normalized);
        lastEnd = lines[j].end;
        j += 1;
      }
      if (columns.length >= 1 && rows.length >= 1) {
        const asset: INewContentAsset = { kind: 'table', columns, rows };
        out.push({
          kind: 'table',
          asset,
          start: header.start,
          end: lastEnd,
          preview: previewOf(text.slice(header.start, lastEnd)),
          dedupeKey: assetContentHash(asset),
        });
        i = j;
        continue;
      }
    }
    i += 1;
  }
  return out;
}

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/;

function extractImages(lines: LineSpan[]): ExtractedCandidate[] {
  const out: ExtractedCandidate[] = [];
  for (const line of lines) {
    const m = IMAGE_LINE.exec(line.text.trim());
    if (!m) continue;
    const alt = m[1] ?? '';
    const url = m[2] ?? '';
    if (!url) continue;
    const asset: INewContentAsset = { kind: 'image', url, alt };
    out.push({
      kind: 'image',
      asset,
      start: line.start,
      end: line.end,
      preview: previewOf(line.text),
      dedupeKey: assetContentHash(asset),
    });
  }
  return out;
}

const FORMULA_PATTERNS: RegExp[] = [
  /\$\$([\s\S]+?)\$\$/g,
  /```math[ \t]*\r?\n([\s\S]+?)\r?\n```/g,
  /\\\[([\s\S]+?)\\\]/g,
];

function extractFormulas(text: string): ExtractedCandidate[] {
  const out: ExtractedCandidate[] = [];
  for (const pattern of FORMULA_PATTERNS) {
    pattern.lastIndex = 0;
    let m = pattern.exec(text);
    while (m !== null) {
      const latex = (m[1] ?? '').trim();
      if (latex) {
        const asset: INewContentAsset = { kind: 'formula', latex, display: true, plainText: latex };
        out.push({
          kind: 'formula',
          asset,
          start: m.index,
          end: m.index + m[0].length,
          preview: previewOf(latex),
          dedupeKey: assetContentHash(asset),
        });
      }
      m = pattern.exec(text);
    }
  }
  return out;
}

/**
 * Кандидат-ассеты одного текста. Приоритет table → image → formula; при пересечении
 * спанов побеждает более приоритетный (спаны непересекающиеся в результате).
 */
export function extractCandidates(text: string, kinds: Set<AssetKind>): ExtractedCandidate[] {
  if (!text) return [];
  const lines = lineSpans(text);
  const all: ExtractedCandidate[] = [];
  if (kinds.has('table')) all.push(...extractTables(lines, text));
  if (kinds.has('image')) all.push(...extractImages(lines));
  if (kinds.has('formula')) all.push(...extractFormulas(text));

  all.sort((a, b) => a.start - b.start || a.end - b.end);
  const kept: ExtractedCandidate[] = [];
  let lastEnd = -1;
  for (const c of all) {
    if (c.start >= lastEnd) {
      kept.push(c);
      lastEnd = c.end;
    }
  }
  return kept;
}

/** Вставить токены после спанов, сохранив исходный текст (обработка с конца — offset стабилен). */
export function insertTokensAfterSpans(
  text: string,
  insertions: { end: number; token: string }[]
): string {
  let out = text;
  for (const ins of [...insertions].sort((a, b) => b.end - a.end)) {
    out = `${out.slice(0, ins.end)}\n\n${ins.token}\n${out.slice(ins.end)}`;
  }
  return out;
}

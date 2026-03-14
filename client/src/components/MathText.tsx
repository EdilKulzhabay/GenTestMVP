/**
 * Рендерит текст с LaTeX-формулами (математика, физика, химия).
 * Поддерживает: $...$ (inline), $$...$$ (block), \(...\), \[...\]
 */

import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

type Part = { type: 'text'; value: string } | { type: 'inline'; value: string } | { type: 'block'; value: string };

function parseMathText(text: string): Part[] {
  if (!text || typeof text !== 'string') return [{ type: 'text', value: text || '' }];

  const parts: Part[] = [];
  let pos = 0;

  const patterns: { re: RegExp; type: 'block' | 'inline' }[] = [
    { re: /\$\$([\s\S]*?)\$\$/, type: 'block' },
    { re: /\\\[([\s\S]*?)\\\]/, type: 'block' },
    { re: /\$([^$\n]+)\$/, type: 'inline' },
    { re: /\\\(([\s\S]*?)\\\)/, type: 'inline' }
  ];

  while (pos < text.length) {
    let best: { index: number; end: number; type: 'block' | 'inline'; value: string } | null = null;

    for (const { re, type } of patterns) {
      const slice = text.slice(pos);
      const m = slice.match(re);
      if (m && m.index !== undefined) {
        const absIndex = pos + m.index;
        const end = absIndex + m[0].length;
        if (!best || absIndex < best.index) {
          best = { index: absIndex, end, type, value: m[1].trim() };
        }
      }
    }

    if (!best) {
      parts.push({ type: 'text', value: text.slice(pos) });
      break;
    }

    if (best.index > pos) {
      parts.push({ type: 'text', value: text.slice(pos, best.index) });
    }
    parts.push({ type: best.type, value: best.value });
    pos = best.end;
  }

  return parts.length > 0 ? parts : [{ type: 'text', value: text }];
}

function renderPart(part: Part, key: number): React.ReactNode {
  if (part.type === 'text') {
    return <span key={key}>{part.value}</span>;
  }
  try {
    const html = katex.renderToString(part.value, {
      throwOnError: false,
      displayMode: part.type === 'block',
      output: 'html'
    });
    return (
      <span
        key={key}
        className={part.type === 'block' ? 'my-2 block' : ''}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <span key={key} className="text-red-600">[Ошибка формулы: {part.value}]</span>;
  }
}

interface MathTextProps {
  children: string;
  className?: string;
}

export const MathText: React.FC<MathTextProps> = ({ children, className }) => {
  const parts = parseMathText(children);
  return (
    <span className={className}>
      {parts.map((part, i) => renderPart(part, i))}
    </span>
  );
};

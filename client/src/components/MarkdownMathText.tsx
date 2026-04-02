/**
 * Markdown + LaTeX (remark-math / rehype-katex): заголовки, списки, **жирный**, формулы $...$ / $$...$$
 */
import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

/* eslint-disable @typescript-eslint/no-explicit-any */
function strip({ node: _, ...rest }: any) { return rest; }

const mdComponents: Components = {
  h1: (p: any) => <h1 className="mt-3 text-xl font-bold text-slate-900 first:mt-0" {...strip(p)} />,
  h2: (p: any) => <h2 className="mt-3 text-lg font-semibold text-slate-900 first:mt-0" {...strip(p)} />,
  h3: (p: any) => <h3 className="mt-2 text-base font-semibold text-slate-800 first:mt-0" {...strip(p)} />,
  p: (p: any) => <p className="my-2 leading-relaxed text-slate-800 last:mb-0" {...strip(p)} />,
  ul: (p: any) => <ul className="my-2 list-disc pl-5 text-slate-800" {...strip(p)} />,
  ol: (p: any) => <ol className="my-2 list-decimal pl-5 text-slate-800" {...strip(p)} />,
  li: (p: any) => <li className="my-0.5" {...strip(p)} />,
  strong: (p: any) => <strong className="font-semibold text-slate-900" {...strip(p)} />,
  em: (p: any) => <em className="italic" {...strip(p)} />,
  code: ({ className, children, node: _, ...rest }: any) => {
    if (className) {
      return (
        <code className={`block overflow-x-auto rounded bg-slate-100 p-2 text-xs ${className}`} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800" {...rest}>
        {children}
      </code>
    );
  },
  pre: (p: any) => (
    <pre className="my-2 overflow-x-auto rounded border border-slate-200 bg-slate-50 p-2 text-sm" {...strip(p)} />
  ),
  blockquote: (p: any) => (
    <blockquote className="my-2 border-l-4 border-slate-300 pl-3 italic text-slate-600" {...strip(p)} />
  ),
  a: (p: any) => (
    <a className="text-blue-600 underline hover:text-blue-800" target="_blank" rel="noreferrer" {...strip(p)} />
  ),
  table: (p: any) => <table className="my-2 w-full border-collapse border border-slate-200 text-sm" {...strip(p)} />,
  th: (p: any) => <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left" {...strip(p)} />,
  td: (p: any) => <td className="border border-slate-200 px-2 py-1" {...strip(p)} />
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export const MarkdownMathText: React.FC<{ children: string; className?: string }> = ({
  children,
  className = ''
}) => {
  const src = children ?? '';
  if (!src.trim()) return null;

  return (
    <div className={`markdown-math-root text-sm ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={mdComponents}
      >
        {src}
      </ReactMarkdown>
    </div>
  );
};

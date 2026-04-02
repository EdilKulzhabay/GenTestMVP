/**
 * Markdown + LaTeX (remark-math / rehype-katex): заголовки, списки, **жирный**, формулы $...$ / $$...$$
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

function stripNode<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const { node: _n, ...rest } = props;
  return rest;
}

const mdComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  h1: (props) => <h1 className="mt-3 text-xl font-bold text-slate-900 first:mt-0" {...stripNode(props)} />,
  h2: (props) => <h2 className="mt-3 text-lg font-semibold text-slate-900 first:mt-0" {...stripNode(props)} />,
  h3: (props) => <h3 className="mt-2 text-base font-semibold text-slate-800 first:mt-0" {...stripNode(props)} />,
  p: (props) => <p className="my-2 leading-relaxed text-slate-800 last:mb-0" {...stripNode(props)} />,
  ul: (props) => <ul className="my-2 list-disc pl-5 text-slate-800" {...stripNode(props)} />,
  ol: (props) => <ol className="my-2 list-decimal pl-5 text-slate-800" {...stripNode(props)} />,
  li: (props) => <li className="my-0.5" {...stripNode(props)} />,
  strong: (props) => <strong className="font-semibold text-slate-900" {...stripNode(props)} />,
  em: (props) => <em className="italic" {...stripNode(props)} />,
  code: ({ className, children, node: _n, ...rest }) => {
    const isBlock = Boolean(className);
    if (isBlock) {
      return (
        <code className={`block overflow-x-auto rounded bg-slate-100 p-2 text-xs ${className || ''}`} {...rest}>
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
  pre: (props) => (
    <pre className="my-2 overflow-x-auto rounded border border-slate-200 bg-slate-50 p-2 text-sm" {...stripNode(props)} />
  ),
  blockquote: (props) => (
    <blockquote className="my-2 border-l-4 border-slate-300 pl-3 italic text-slate-600" {...stripNode(props)} />
  ),
  a: (props) => (
    <a className="text-blue-600 underline hover:text-blue-800" target="_blank" rel="noreferrer" {...stripNode(props)} />
  ),
  table: (props) => <table className="my-2 w-full border-collapse border border-slate-200 text-sm" {...stripNode(props)} />,
  th: (props) => <th className="border border-slate-200 bg-slate-100 px-2 py-1 text-left" {...stripNode(props)} />,
  td: (props) => <td className="border border-slate-200 px-2 py-1" {...stripNode(props)} />
};

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

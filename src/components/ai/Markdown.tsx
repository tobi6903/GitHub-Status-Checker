"use client";

import ReactMarkdown, { type Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => <h2 className="mb-2 mt-5 text-lg font-semibold">{children}</h2>,
  h2: ({ children }) => (
    <h2 className="mb-2 mt-6 text-base font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mb-1 mt-4 text-sm font-semibold">{children}</h3>,
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1.5 pl-5">{children}</ol>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-sky-600 underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg bg-foreground/5 p-3 text-xs [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 pl-3 opacity-80">{children}</blockquote>
  ),
};

// react-markdown ignores raw HTML, so model output can't inject markup.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm">
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}

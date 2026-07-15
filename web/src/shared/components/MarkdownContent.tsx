import { isValidElement, lazy, memo, Suspense, useMemo, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { cx } from "../lib/className";

const MermaidDiagram = lazy(() => import("./MermaidDiagram").then((module) => ({ default: module.MermaidDiagram })));
const MARKDOWN_PLUGINS = [remarkGfm, remarkBreaks];
const MERMAID_SOURCE_LIMIT = 50_000;

export type MarkdownContentMode = "compact" | "document";

type MarkdownContentProps = {
  content: string;
  mode?: MarkdownContentMode;
  className?: string;
  mermaid?: boolean;
};

function MarkdownContentComponent({ content, mode = "compact", className, mermaid = false }: MarkdownContentProps) {
  const components = useMemo(() => markdownComponents(mermaid), [mermaid]);
  if (!content.trim()) return null;

  return (
    <div className={cx("markdown-content", `markdown-content-${mode}`, className)}>
      <ReactMarkdown
        remarkPlugins={MARKDOWN_PLUGINS}
        components={components}
        skipHtml
        urlTransform={defaultUrlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownContent = memo(MarkdownContentComponent);

function markdownComponents(enableMermaid: boolean): Components {
  return {
    a({ node: _node, ...props }) {
      return <a {...props} target="_blank" rel="noopener noreferrer" />;
    },
    img() {
      return null;
    },
    pre({ children, node: _node, ...props }) {
      const source = enableMermaid ? mermaidBlockSource(children) : null;
      if (source !== null && source.length <= MERMAID_SOURCE_LIMIT) {
        return <Suspense fallback={<div className="mermaid-diagram" aria-busy="true" />}><MermaidDiagram source={source} /></Suspense>;
      }
      return <pre {...props}>{children}</pre>;
    },
    table({ node: _node, ...props }) {
      return <div className="markdown-table-scroll"><table {...props} /></div>;
    },
  };
}

function mermaidBlockSource(children: ReactNode): string | null {
  const child = Array.isArray(children) ? children[0] : children;
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return null;
  if (child.type !== "code" || !child.props.className?.split(/\s+/).includes("language-mermaid")) return null;
  return textContent(child.props.children).replace(/\n$/, "");
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  return "";
}

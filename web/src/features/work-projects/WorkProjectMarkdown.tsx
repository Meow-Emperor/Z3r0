import { MarkdownContent } from "../../shared/components/MarkdownContent";
import { cx } from "../../shared/lib/className";

type WorkProjectMarkdownProps = {
  content?: string | null;
  className?: string;
};

export function WorkProjectMarkdown({ content, className }: WorkProjectMarkdownProps) {
  if (!content?.trim()) return null;
  return <MarkdownContent className={cx("work-project-markdown", className)} content={content} mode="compact" />;
}

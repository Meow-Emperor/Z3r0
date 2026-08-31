import { Empty, Spin } from "../ui/semi";
import type { ReactNode } from "react";
import { cx } from "../lib/className";

type AsyncContentProps = {
  loading: boolean;
  empty: boolean;
  children: ReactNode;
  emptyContent?: ReactNode;
  emptyIcon?: ReactNode;
  emptyTitle?: string;
  fill?: boolean;
  retainContentWhileLoading?: boolean;
  wrapperClassName?: string;
};

export function AsyncContent({
  loading,
  empty,
  children,
  emptyContent,
  emptyIcon,
  emptyTitle = "No data",
  fill = false,
  retainContentWhileLoading = true,
  wrapperClassName,
}: AsyncContentProps) {
  const hideContent = loading && (empty || !retainContentWhileLoading);
  const content = hideContent ? (
    <div className="async-content-placeholder" aria-hidden="true" />
  ) : empty ? (
    emptyContent ?? <Empty className="empty-state" image={emptyIcon} title={emptyTitle} description="" />
  ) : children;

  return (
    <Spin spinning={loading} wrapperClassName={cx("async-content", fill && "async-content-fill", wrapperClassName)}>
      {content}
    </Spin>
  );
}

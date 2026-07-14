import { Button, Input, Tooltip } from "@douyinfe/semi-ui";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { FormEvent, ReactNode } from "react";
import { cx } from "../lib/className";
import { AsyncContent } from "./AsyncContent";

export type ResourceMetric = {
  label: string;
  value: ReactNode;
};

type ResourcePageShellProps = {
  searchPlaceholder: string;
  keyword: string;
  loading: boolean;
  metrics: ResourceMetric[];
  empty: boolean;
  emptyIcon: ReactNode;
  emptyTitle: string;
  page: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  canGoBack: boolean;
  canGoNext: boolean;
  children: ReactNode;
  onKeywordChange: (keyword: string) => void;
  onSearch: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

export function ResourcePageShell({
  searchPlaceholder,
  keyword,
  loading,
  metrics,
  empty,
  emptyIcon,
  emptyTitle,
  page,
  rangeStart,
  rangeEnd,
  total,
  canGoBack,
  canGoNext,
  children,
  onKeywordChange,
  onSearch,
  onPrevious,
  onNext,
}: ResourcePageShellProps) {
  return (
    <section className="resource-page">
      <MetricStrip metrics={metrics} />
      <ResourcePanel
        toolbar={(
          <ResourceSearchForm
            value={keyword}
            placeholder={searchPlaceholder}
            onChange={onKeywordChange}
            onSearch={onSearch}
          />
        )}
        loading={loading}
        empty={empty}
        emptyIcon={emptyIcon}
        emptyTitle={emptyTitle}
        footer={(
          <ResourcePager
            page={page}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            total={total}
            loading={loading}
            canGoBack={canGoBack}
            canGoNext={canGoNext}
            onPrevious={onPrevious}
            onNext={onNext}
          />
        )}
      >
        {children}
      </ResourcePanel>
    </section>
  );
}

export function ResourcePanel({ className, toolbar, loading = false, empty, emptyIcon, emptyTitle, footer, children }: {
  className?: string;
  toolbar?: ReactNode;
  loading?: boolean;
  empty: boolean;
  emptyIcon: ReactNode;
  emptyTitle: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cx("table-panel", className)}>
      {toolbar ? <div className="table-toolbar">{toolbar}</div> : null}
      <AsyncContent
        loading={loading}
        empty={empty}
        emptyIcon={emptyIcon}
        emptyTitle={emptyTitle}
        wrapperClassName="resource-table-spin"
      >
        {children}
      </AsyncContent>
      {footer}
    </div>
  );
}

export function ResourceSearchForm({ value, placeholder, onChange, onSearch }: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSearch: () => void;
}) {
  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch();
  };
  return (
    <form className="resource-search" onSubmit={handleSearch}>
      <Input prefix={<Search size={16} />} value={value} onChange={onChange} placeholder={placeholder} showClear />
      <Button htmlType="submit" theme="solid" type="primary" icon={<Search size={16} />}>Search</Button>
    </form>
  );
}

export function ResourcePager({
  page, rangeStart, rangeEnd, total, loading, canGoBack, canGoNext, onPrevious, onNext,
}: {
  page: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  loading: boolean;
  canGoBack: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="pager-row">
      <div className="pager-summary">
        <span>Page {String(page).padStart(2, "0")}</span>
        <strong>{rangeStart}-{rangeEnd}</strong>
        <small>of {total}</small>
      </div>
      <div className="pager-actions">
        <Tooltip content="Previous page">
          <Button
            type="tertiary"
            icon={<ChevronLeft size={16} />}
            disabled={!canGoBack || loading}
            onClick={onPrevious}
            aria-label="Previous page"
          />
        </Tooltip>
        <Tooltip content="Next page">
          <Button
            type="tertiary"
            icon={<ChevronRight size={16} />}
            disabled={!canGoNext || loading}
            onClick={onNext}
            aria-label="Next page"
          />
        </Tooltip>
      </div>
    </div>
  );
}

export function MetricStrip({ metrics }: { metrics: ResourceMetric[] }) {
  return (
    <div className="metric-strip">
      {metrics.map((metric, index) => (
        <div className="metric-card" key={metric.label}>
          <div className="metric-card-label">
            <span>{metric.label}</span>
            <small>M{String(index + 1).padStart(2, "0")}</small>
          </div>
          <strong>{metric.value}</strong>
          <i aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

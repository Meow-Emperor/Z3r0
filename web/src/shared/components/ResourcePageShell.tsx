import { Button, Input, Tooltip } from "@douyinfe/semi-ui";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { FormEvent, ReactNode } from "react";
import { cx } from "../lib/className";
import { AsyncContent } from "./AsyncContent";

export type ResourceMetric = {
  label: string;
  value: ReactNode;
};

export type ResourcePagerState = {
  page: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  loading: boolean;
  canGoBack: boolean;
  canGoNext: boolean;
  previous: () => void;
  next: () => void;
};

export type ResourcePageState = ResourcePagerState & {
  keyword: string;
  setKeyword: (keyword: string) => void;
  search: () => void;
};

type ResourcePageShellProps = {
  searchPlaceholder: string;
  state: ResourcePageState;
  metrics: ResourceMetric[];
  empty: boolean;
  emptyIcon: ReactNode;
  emptyTitle: string;
  children: ReactNode;
};

export function ResourcePageShell({
  searchPlaceholder,
  state,
  metrics,
  empty,
  emptyIcon,
  emptyTitle,
  children,
}: ResourcePageShellProps) {
  return (
    <section className="resource-page">
      <MetricStrip metrics={metrics} />
      <ResourcePanel
        toolbar={(
          <ResourceSearchForm
            value={state.keyword}
            placeholder={searchPlaceholder}
            onChange={state.setKeyword}
            onSearch={state.search}
          />
        )}
        loading={state.loading}
        empty={empty}
        emptyIcon={emptyIcon}
        emptyTitle={emptyTitle}
        footer={<ResourcePager state={state} />}
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

export function ResourcePager({ state }: { state: ResourcePagerState }) {
  return (
    <div className="pager-row">
      <div className="pager-summary">
        <span>Page {String(state.page).padStart(2, "0")}</span>
        <strong>{state.rangeStart}-{state.rangeEnd}</strong>
        <small>of {state.total}</small>
      </div>
      <div className="pager-actions">
        <Tooltip content="Previous page">
          <Button
            type="tertiary"
            icon={<ChevronLeft size={16} />}
            disabled={!state.canGoBack || state.loading}
            onClick={state.previous}
            aria-label="Previous page"
          />
        </Tooltip>
        <Tooltip content="Next page">
          <Button
            type="tertiary"
            icon={<ChevronRight size={16} />}
            disabled={!state.canGoNext || state.loading}
            onClick={state.next}
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

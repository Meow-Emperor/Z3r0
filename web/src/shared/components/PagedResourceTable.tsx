import type { ReactNode } from "react";
import type { ResourcePageState, ResourceMetric } from "./ResourcePageShell";
import { ResourcePageShell } from "./ResourcePageShell";
import { ResourceTable, type ResourceColumn } from "./ResourceTable";

type PagedResourceTableProps<Item> = {
  ariaLabel: string;
  className?: string;
  columns: ResourceColumn<Item>[];
  emptyIcon: ReactNode;
  emptyTitle: string;
  metrics: ResourceMetric[];
  rowKey: (row: Item) => string | number;
  rows: Item[];
  searchPlaceholder: string;
  state: ResourcePageState;
};

export function PagedResourceTable<Item>({
  ariaLabel,
  className,
  columns,
  emptyIcon,
  emptyTitle,
  metrics,
  rowKey,
  rows,
  searchPlaceholder,
  state,
}: PagedResourceTableProps<Item>) {
  return (
    <ResourcePageShell
      searchPlaceholder={searchPlaceholder}
      state={state}
      metrics={metrics}
      empty={rows.length === 0}
      emptyIcon={emptyIcon}
      emptyTitle={emptyTitle}
    >
      <ResourceTable
        ariaLabel={ariaLabel}
        className={className}
        columns={columns}
        rows={rows}
        rowKey={rowKey}
      />
    </ResourcePageShell>
  );
}

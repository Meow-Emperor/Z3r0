import { Select, Spin } from "@douyinfe/semi-ui";
import type { ComponentProps, ReactNode, UIEvent } from "react";

type SelectProps = NonNullable<ComponentProps<typeof Select>>;

type OptionListSelectProps = Omit<SelectProps, "emptyContent" | "loading" | "onListScroll" | "onSearch" | "remote"> & {
  emptyContent?: ReactNode;
  source: {
    busy: boolean;
    search: (keyword: string) => void;
    onListScroll: (event: UIEvent<HTMLDivElement>) => void;
  };
};

export function OptionListSelect({ emptyContent, source, ...props }: OptionListSelectProps) {
  return (
    <Select
      {...props}
      loading={source.busy}
      emptyContent={source.busy ? <Spin size="small" /> : emptyContent}
      remote
      onSearch={source.search}
      onListScroll={source.onListScroll}
    />
  );
}

export type DetailItem = [label: string, value: string | undefined, markdown?: boolean];
export type FilledDetailItem = [label: string, value: string, markdown?: boolean];

export function filledDetailItems(items: DetailItem[]): FilledDetailItem[] {
  return items.filter((item): item is FilledDetailItem => Boolean(item[1]));
}

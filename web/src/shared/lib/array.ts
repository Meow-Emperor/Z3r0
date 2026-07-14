export function mergeByKey<Item, Key>(
  current: readonly Item[],
  incoming: readonly Item[],
  getKey: (item: Item) => Key,
): Item[] {
  const merged = new Map(current.map((item) => [getKey(item), item]));
  incoming.forEach((item) => merged.set(getKey(item), item));
  return Array.from(merged.values());
}

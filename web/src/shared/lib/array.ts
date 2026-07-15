export function mergeByKey<Item, Key>(
  current: readonly Item[],
  incoming: readonly Item[],
  getKey: (item: Item) => Key,
): Item[] {
  const merged = new Map(current.map((item) => [getKey(item), item]));
  incoming.forEach((item) => merged.set(getKey(item), item));
  return Array.from(merged.values());
}

export function countBy<Item, Key extends PropertyKey>(
  items: readonly Item[],
  keys: readonly Key[],
  getKey: (item: Item) => Key,
): Record<Key, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<Key, number>;
  items.forEach((item) => { counts[getKey(item)] += 1; });
  return counts;
}

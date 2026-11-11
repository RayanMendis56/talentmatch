import type { Tier } from "./scoring";

const RANK: Record<Tier, number> = { unrelated: 0, related: 1, same: 2 };

export const normTitle = (title: string | null | undefined): string =>
  (title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function harmonizeTiers<T extends { designation: string | null; tier: Tier }>(items: T[]): Map<string, Tier> {
  const groups = new Map<string, Tier[]>();
  for (const item of items) {
    const key = normTitle(item.designation);
    if (!key) continue;

    const tiers = groups.get(key) ?? [];
    tiers.push(item.tier);
    groups.set(key, tiers);
  }

  const result = new Map<string, Tier>();
  for (const [key, tiers] of groups) {
    const counts: Record<Tier, number> = { same: 0, related: 0, unrelated: 0 };
    for (const tier of tiers) counts[tier]++;
    const majority = (Object.keys(counts) as Tier[]).sort(
      (a, b) => counts[b] - counts[a] || RANK[a] - RANK[b]
    )[0];
    result.set(key, majority);
  }
  return result;
}

/**
 * Pricing engine.
 * Owners publish price tiers (30m, 1h, 2h, 3h, 6h, 12h, 24h). For any requested duration we compute the
 * cheapest combination of tiers that covers it (unbounded knapsack over 30-minute units), so renters always
 * get the fairest price and multi-day rentals naturally use the 24h tier.
 */
export interface Tier { duration_minutes: number; price: number }
export interface PriceQuote {
  minutes: number;
  billedMinutes: number;
  subtotal: number;
  lines: { duration_minutes: number; price: number; qty: number }[];
}

export const UNIT = 30;
export const ALLOWED_TIERS = [30, 60, 120, 180, 360, 720, 1440];

export function quote(tiers: Tier[], minutes: number): PriceQuote | null {
  if (!tiers.length || minutes <= 0) return null;
  const units = Math.ceil(minutes / UNIT);
  const tierUnits = tiers.map((t) => ({ u: t.duration_minutes / UNIT, t }));
  const cost = new Array<number>(units + 1).fill(Infinity);
  const pick = new Array<number>(units + 1).fill(-1);
  cost[0] = 0;
  for (let i = 1; i <= units; i++) {
    tierUnits.forEach(({ u, t }, idx) => {
      const prev = Math.max(0, i - u); // allow the last tier to overshoot (e.g. 50 min billed as 1h)
      const c = cost[prev] + t.price;
      if (c < cost[i]) { cost[i] = c; pick[i] = idx; }
    });
  }
  const counts = new Map<number, number>();
  let i = units;
  let billed = 0;
  while (i > 0) {
    const idx = pick[i];
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
    billed += tierUnits[idx].u;
    i = Math.max(0, i - tierUnits[idx].u);
  }
  const lines = [...counts.entries()]
    .map(([idx, qty]) => ({ duration_minutes: tierUnits[idx].t.duration_minutes, price: tierUnits[idx].t.price, qty }))
    .sort((a, b) => b.duration_minutes - a.duration_minutes);
  return { minutes, billedMinutes: billed * UNIT, subtotal: cost[units], lines };
}

/** Hourly-equivalent "from" price used for search sorting and display. */
export function fromPrice(tiers: Tier[]) {
  if (!tiers.length) return null;
  const min = [...tiers].sort((a, b) => a.duration_minutes - b.duration_minutes)[0];
  return min;
}

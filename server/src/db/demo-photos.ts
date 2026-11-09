/**
 * Real vehicle photography for DEMO listings, from Unsplash (free under the Unsplash License, hot-linked from the
 * Unsplash image CDN). Each demo listing is still labelled "Demo"; these photos illustrate the vehicle type and are
 * not pictures of the specific demo vehicle. Real listings use photos uploaded by their owners.
 */
const u = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1000&h=750&q=72`;

const CITY = ['photo-1606310241970-4858d5d08f6b', 'photo-1523740856324-f2ce89135981', 'photo-1591047139334-337807f2b3e5', 'photo-1533641568252-76ce0951d5b4',
  'photo-1592614558340-8095660384f6', 'photo-1484920274317-87885fcbc504', 'photo-1533641484714-2a47e78cd646', 'photo-1471623320832-752e8bbf8413'];
const MOUNTAIN = ['photo-1673121414328-52eff37bc6d0', 'photo-1511994298241-608e28f14fde', 'photo-1780004189175-202169141544', 'photo-1761881287509-d53ca7d95a4c'];
const ROAD = ['photo-1576435728678-68d0fbf94e91', 'photo-1532298229144-0ec0c57515c7', 'photo-1786916901401-338c6ce2e6de'];
const FOLDING = ['photo-1772109065037-e2343d2cbce9', 'photo-1767519818578-419c17c0e164', 'photo-1772109065028-7c261692faa9'];
const EBIKE = ['photo-1786441113553-43414b842378', 'photo-1709140624401-c8c09ff29978', 'photo-1778574171671-fbe178537535'];
const SCOOTER = ['photo-1554223789-df81106a45ed', 'photo-1538895490524-0ded232a96d8', 'photo-1712213248719-aade0e02a591', 'photo-1478340168842-7e6b25ed6510',
  'photo-1692897433040-16d8dbbb7554', 'photo-1503434396599-58ba8a18d932', 'photo-1519750292352-c9fc17322ed7', 'photo-1580826623091-ee7cae3ca105'];
const MANUAL = ['photo-1578047798395-2cbf6263c467', 'photo-1762672233490-51df7332f139', 'photo-1664885765868-456486d200dd', 'photo-1659465493788-046d031bcd35', 'photo-1502744688674-c619d1586c9e'];

const POOLS: Record<string, string[]> = {
  city: CITY, student: [...CITY].reverse(), mountain: MOUNTAIN, road: ROAD, folding: FOLDING, electric_bicycle: EBIKE,
  scooter: SCOOTER, automatic: [...SCOOTER].reverse(), electric_motorcycle: SCOOTER.slice(2).concat(SCOOTER.slice(0, 2)), manual: MANUAL,
};
const used: Record<string, number> = {};

/** Three photos for the next demo vehicle of this type; consecutive vehicles of a type start on different photos. */
export function demoPhotos(category: string, type: string): string[] {
  const pool = POOLS[type] ?? (category === 'motorcycle' ? SCOOTER : CITY);
  const start = used[type] = ((used[type] ?? -1) + 1);
  return [0, 1, 2].map((k) => u(pool[(start + k) % pool.length]));
}

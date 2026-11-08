/**
 * Generates clean vector illustrations used as DEMO listing photos (no real vehicle photography is shipped).
 * Real listings use owner-uploaded photos.
 */
const tint = (hex: string, amt: number) => {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
};

function bicycle(color: string, type: string) {
  const wheel = (cx: number) => `
    <circle cx="${cx}" cy="300" r="92" fill="none" stroke="#0f172a" stroke-width="14"/>
    <circle cx="${cx}" cy="300" r="78" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4 10"/>
    <circle cx="${cx}" cy="300" r="10" fill="#0f172a"/>`;
  const fat = type === 'mountain' ? 20 : 14;
  const step = type === 'city' || type === 'student' || type === 'folding';
  const top = step ? 'M300 300 L420 200' : 'M300 300 L455 185 L300 185 Z';
  return `
    ${wheel(190)}${wheel(610)}
    <g fill="none" stroke="${color}" stroke-width="${fat}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M190 300 L300 300 L240 185 Z"/>
      <path d="${top}"/>
      <path d="M455 185 L610 300"/>
      <path d="M240 185 L455 185"/>
      <path d="M300 300 ${step ? 'L455 185' : ''}"/>
    </g>
    <path d="M455 185 L470 140 M445 140 L510 132" stroke="#0f172a" stroke-width="12" stroke-linecap="round" fill="none"/>
    <path d="M240 185 L232 160 M205 150 L262 150" stroke="#0f172a" stroke-width="14" stroke-linecap="round"/>
    <circle cx="300" cy="300" r="20" fill="none" stroke="#0f172a" stroke-width="8"/>
    ${type === 'electric_bicycle' ? `<rect x="268" y="210" width="90" height="30" rx="10" fill="#0f172a" transform="rotate(-37 313 225)"/><path d="M309 214 l-8 14 h10 l-6 12" stroke="#facc15" stroke-width="4" fill="none" transform="rotate(-37 313 225)"/>` : ''}
    ${type === 'city' || type === 'student' ? `<rect x="520" y="140" width="80" height="50" rx="8" fill="none" stroke="#0f172a" stroke-width="8"/>` : ''}`;
}

function motorcycle(color: string, type: string) {
  const wheel = (cx: number) => `
    <circle cx="${cx}" cy="310" r="78" fill="#0f172a"/>
    <circle cx="${cx}" cy="310" r="44" fill="#e2e8f0"/>
    <circle cx="${cx}" cy="310" r="16" fill="#0f172a"/>`;
  const sporty = type === 'manual';
  return `
    ${wheel(200)}${wheel(600)}
    <path d="M150 250 C 170 190, 260 180, 330 230 L 470 230 C 520 180, 560 170, 600 200 L 640 250 C 600 260, 560 280, 540 300 L 290 300 C 260 270, 210 250, 150 250 Z" fill="${color}"/>
    ${sporty ? `<path d="M330 230 L380 170 L470 170 L470 230 Z" fill="${color}"/><path d="M380 170 L470 170" stroke="#0f172a" stroke-width="10"/>`
      : `<path d="M300 230 C 300 180, 360 150, 430 160 L 470 230 Z" fill="${tint(color, 0.25)}"/>`}
    <rect x="300" y="205" width="160" height="22" rx="11" fill="#0f172a"/>
    <path d="M560 200 L600 110 L640 105" stroke="#0f172a" stroke-width="14" stroke-linecap="round" fill="none"/>
    <circle cx="628" cy="160" r="16" fill="#fde68a" stroke="#0f172a" stroke-width="6"/>
    ${type === 'electric_motorcycle' ? `<path d="M395 245 l-14 26 h18 l-10 22" stroke="#facc15" stroke-width="7" fill="none" stroke-linecap="round"/>` : ''}`;
}

export function vehicleIllustration(category: string, type: string, color: string, variant: number) {
  const bg = tint(color, [0.9, 0.82, 0.94][variant % 3]);
  const accent = tint(color, 0.7);
  const flip = variant === 1 ? 'translate(800 0) scale(-1 1)' : '';
  const zoom = variant === 2 ? 'translate(-80 -60) scale(1.2)' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" width="800" height="520">
  <rect width="800" height="520" fill="${bg}"/>
  <circle cx="${variant === 1 ? 180 : 620}" cy="120" r="170" fill="${accent}" opacity="0.55"/>
  <ellipse cx="400" cy="402" rx="330" ry="22" fill="#0f172a" opacity="0.08"/>
  <g transform="${flip} ${zoom}">${category === 'motorcycle' ? motorcycle(color, type) : bicycle(color, type)}</g>
</svg>`;
}

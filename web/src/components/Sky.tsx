import { useId } from 'react';
import { cx } from './ui';

/**
 * Illustrated "soft sky" elements: fluffy clouds and rolling grass hills, drawn in SVG (no image downloads).
 * The fluffy edge comes from an feTurbulence displacement filter; shading from radial gradients.
 * Decorative only (aria-hidden) and paused for users who prefer reduced motion (see styles.css).
 */
export function Cloud({ className = '', tone = 'white', shadow = true }: { className?: string; tone?: 'white' | 'blue'; shadow?: boolean }) {
  const id = useId().replace(/:/g, '');
  const light = tone === 'blue' ? '#cfe7f7' : '#ffffff';
  const mid = tone === 'blue' ? '#a9d2ee' : '#eef3fa';
  const dark = tone === 'blue' ? '#86b9dd' : '#cfdbea';
  const puffs: [number, number, number][] = [[95, 112, 52], [150, 88, 64], [212, 104, 54], [255, 126, 40], [55, 132, 36], [150, 132, 48], [205, 136, 42]];
  return (
    <svg viewBox="0 0 300 200" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`g${id}`} cx="40%" cy="30%" r="75%">
          <stop offset="0%" stopColor={light} />
          <stop offset="60%" stopColor={mid} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
        <filter id={`f${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
        <filter id={`s${id}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" /></filter>
      </defs>
      {shadow && <ellipse cx="155" cy="188" rx="110" ry="9" fill="#5f87b8" opacity="0.18" filter={`url(#s${id})`} />}
      <g filter={`url(#f${id})`}>
        {puffs.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill={`url(#g${id})`} />)}
      </g>
    </svg>
  );
}

export function Hills({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  const flowers = [[120, 300], [190, 318], [260, 296], [430, 330], [520, 312], [700, 340], [820, 318], [960, 346], [1080, 326], [1180, 352], [340, 352], [620, 362]];
  return (
    <svg viewBox="0 0 1440 420" preserveAspectRatio="none" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`h1${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d6f08a" /><stop offset="1" stopColor="#a6db3c" /></linearGradient>
        <linearGradient id={`h2${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b9e65a" /><stop offset="1" stopColor="#6fbb22" /></linearGradient>
        <linearGradient id={`h3${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a9e04a" /><stop offset="1" stopColor="#5aa818" /></linearGradient>
        <filter id={`gr${id}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.6" numOctaves="3" seed="7" />
          <feColorMatrix values="0 0 0 0 0.12  0 0 0 0 0.38  0 0 0 0 0.04  0 0 0 0.55 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <path d="M0 220 C 220 120, 420 120, 640 210 S 1040 300, 1440 150 L1440 420 L0 420 Z" fill={`url(#h1${id})`} />
      <path d="M0 300 C 260 180, 520 230, 760 290 S 1180 330, 1440 250 L1440 420 L0 420 Z" fill={`url(#h2${id})`} />
      <path d="M0 220 C 220 120, 420 120, 640 210 S 1040 300, 1440 150 L1440 420 L0 420 Z" fill="#000" filter={`url(#gr${id})`} opacity="0.6" />
      <path d="M0 300 C 260 180, 520 230, 760 290 S 1180 330, 1440 250 L1440 420 L0 420 Z" fill="#000" filter={`url(#gr${id})`} />
      <path d="M0 360 C 300 300, 600 330, 900 370 S 1300 380, 1440 340 L1440 420 L0 420 Z" fill={`url(#h3${id})`} />
      <path d="M0 360 C 300 300, 600 330, 900 370 S 1300 380, 1440 340 L1440 420 L0 420 Z" fill="#000" filter={`url(#gr${id})`} />
      {flowers.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.2" fill="#fff" opacity="0.9" />)}
    </svg>
  );
}

/** Full sky background: gradient sky, drifting clouds, hills on the horizon. */
export function SkyScene({ className, hills = true, compact = false }: { className?: string; hills?: boolean; compact?: boolean }) {
  return (
    <div className={cx('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden="true">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#8cc6f2_0%,#b9dcf7_38%,#e3f1fb_70%,#f2f7fd_100%)]" />
      <div className="absolute -top-24 start-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-white/50 blur-3xl" />
      <div className="absolute inset-0 animate-drift">
        <Cloud className={cx('absolute animate-float-slow', compact ? 'start-[4%] top-[6%] w-40' : 'start-[3%] top-[8%] w-36 opacity-90 sm:w-72 sm:opacity-100')} />
        <Cloud className={cx('absolute animate-float opacity-95', compact ? 'end-[6%] top-[18%] w-32' : 'end-[4%] top-[3%] w-32 sm:w-80')} />
        {!compact && <Cloud tone="blue" className="absolute end-[30%] top-[34%] hidden w-36 animate-float-slow opacity-80 lg:block" shadow={false} />}
      </div>
      {hills && <Hills className={cx('absolute inset-x-0 bottom-0 w-full', compact ? 'h-32' : 'h-40 sm:h-56')} />}
    </div>
  );
}

/** Mosaic of glowing glass tiles (green-glass reference) — decorative panel background. */
export function GlassTiles({ className = '' }: { className?: string }) {
  const tones = [
    'from-white/70 to-white/30', 'from-brand-100/80 to-white/40', 'from-brand-200/80 to-brand-100/40', 'from-brand-100/80 to-white/40', 'from-white/70 to-white/30',
    'from-brand-100/80 to-white/40', 'from-brand-400/80 to-brand-300/50', 'from-brand-500/90 to-brand-400/60', 'from-brand-300/80 to-brand-200/50', 'from-brand-100/70 to-white/40',
    'from-brand-200/80 to-white/40', 'from-brand-500/90 to-brand-400/60', 'from-sky-300/90 to-brand-400/70', 'from-grass-400/80 to-sky-300/60', 'from-brand-200/80 to-white/40',
    'from-white/70 to-white/30', 'from-brand-200/80 to-brand-100/40', 'from-grass-300/80 to-grass-400/50', 'from-grass-300/70 to-white/40', 'from-white/70 to-white/30',
  ];
  return (
    <div className={cx('relative', className)} aria-hidden="true">
      <div className="absolute inset-[15%] rounded-full bg-[radial-gradient(circle,rgb(43_118_255/0.55),rgb(124_198_37/0.35)_55%,transparent_75%)] blur-2xl" />
      <div className="relative grid grid-cols-5 gap-2.5">
        {tones.map((t, i) => (
          <div key={i} className={cx('aspect-square rounded-2xl border border-white/70 bg-gradient-to-br shadow-[inset_0_1px_0_rgb(255_255_255/0.8),0_8px_20px_-8px_rgb(36_78_140/0.3)] backdrop-blur-md', t)} />
        ))}
      </div>
    </div>
  );
}

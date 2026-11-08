import type { CSSProperties, ReactNode } from 'react';
import { cx } from './ui';
import { Icon } from './icons';

/**
 * Infographic "orb": a raised white disc wrapped in slowly rotating, glowing arc rings.
 * Optional photo fills the disc with a slow Ken-Burns motion. Decorative rings are aria-hidden.
 */
export function Orb({ size = 120, color = '#2b76ff', color2, photo, children, className, style, rings = 2 }:
  { size?: number; color?: string; color2?: string; photo?: string; children?: ReactNode; className?: string; style?: CSSProperties; rings?: 1 | 2 | 3 }) {
  const c2 = color2 ?? color;
  const ring = (inset: number, from: number, len: number, width: number, alt = false, glow = 8) => (
    <span aria-hidden="true" className={cx('absolute rounded-full', alt ? 'orb-arc-rev' : 'orb-arc')}
      style={{
        inset: -inset,
        background: `conic-gradient(from ${from}deg, ${alt ? c2 : color} 0deg ${len}deg, transparent ${len}deg 360deg)`,
        WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${width}px), #000 calc(100% - ${width}px))`,
        mask: `radial-gradient(farthest-side, transparent calc(100% - ${width}px), #000 calc(100% - ${width}px))`,
        filter: `drop-shadow(0 0 ${glow}px ${alt ? c2 : color})`,
      }} />
  );
  return (
    <span className={cx('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size, ...style }}>
      {ring(size * 0.09, 200, 150, 3)}
      {rings >= 2 && ring(size * 0.17, 20, 95, 2, true, 6)}
      {rings >= 3 && ring(size * 0.24, 120, 60, 1.5, false, 4)}
      <span className="orb-disc relative flex h-full w-full items-center justify-center overflow-hidden rounded-full">
        {photo && (
          <>
            <img src={photo} alt="" loading="lazy" decoding="async" className="kenburns absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-0 rounded-full shadow-[inset_0_0_0_5px_rgb(255_255_255/0.9),inset_0_-20px_30px_rgb(11_27_58/0.25)]" />
          </>
        )}
        <span className="relative">{children}</span>
      </span>
    </span>
  );
}

/** Small step orb with an icon and a numbered badge. */
export function StepOrb({ icon, n, color, size = 76 }: { icon: string; n: string; color: string; size?: number }) {
  return (
    <span className="relative inline-flex">
      <Orb size={size} color={color} rings={1}>
        <Icon name={icon} size={size * 0.36} strokeWidth={1.6} style={{ color, filter: `drop-shadow(0 0 6px ${color}88)` }} />
      </Orb>
      <span className="absolute -end-1 -top-1 flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-extrabold text-white shadow-lg ring-2 ring-white"
        style={{ background: color }}>{n}</span>
    </span>
  );
}

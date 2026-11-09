import { useEffect, useRef, useState } from 'react';
import { useFormat } from './format';

const SELECTOR = '.card, [data-reveal], main h1, main h2';

/**
 * Site-wide scroll reveal. Every card, section heading and [data-reveal] element inside `root` fades and rises into
 * place the first time it enters the viewport; elements that enter together are staggered. New elements rendered
 * later (route changes, data loading) are picked up through a MutationObserver, so pages need no extra code.
 */
export function useAutoReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver((entries) => {
      let i = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const t = e.target as HTMLElement;
        if (!t.style.getPropertyValue('--d')) t.style.setProperty('--d', `${Math.min(i++ * 70, 420)}ms`);
        t.classList.add('in');
        io.unobserve(t);
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    const scan = () => {
      el.querySelectorAll(SELECTOR).forEach((n) => {
        if (seen.has(n) || n.closest('.marquee, [data-noreveal], [role="dialog"]')) return;
        seen.add(n);
        n.classList.add('reveal');
        io.observe(n);
      });
    };
    // Pause continuous animations (beams, rows, floats, bars) while they are off-screen.
    const pause = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle('is-off', !e.isIntersecting)), { rootMargin: '120px' });
    const watched = new WeakSet<Element>();
    const scanAnim = () => el.querySelectorAll('.glow, .marquee, .sweep, .drift, .float-a, .float-b, .float-c, .bar-anim').forEach((n) => {
      if (watched.has(n)) return; watched.add(n); pause.observe(n);
      if (n.classList.contains('glow') && !n.querySelector(':scope > .beam')) {
        const beam = document.createElement('span'); beam.className = 'beam'; beam.setAttribute('aria-hidden', 'true');
        beam.appendChild(document.createElement('i')); n.appendChild(beam);
      }
    });
    scan(); scanAnim();
    let raf = 0;
    const mo = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { scan(); scanAnim(); }); });
    mo.observe(el, { childList: true, subtree: true });
    return () => { io.disconnect(); pause.disconnect(); mo.disconnect(); cancelAnimationFrame(raf); };
  }, [root]);
}

/** Tap ripple on glossy buttons (.cta), as in Market Analysts. */
export function useSpotlight() {
  useEffect(() => {
    const on = (e: PointerEvent) => {
      const t = (e.target as Element | null)?.closest?.('.cta, .rip') as HTMLElement | null;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const s = Math.max(r.width, r.height);
      const d = document.createElement('span');
      d.className = 'ripple';
      d.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
      t.appendChild(d);
      setTimeout(() => d.remove(), 900);
    };
    document.addEventListener('pointerdown', on, { passive: true });
    return () => document.removeEventListener('pointerdown', on);
  }, []);
}

/** Number that counts up (ease-out) when it first scrolls into view, formatted for the active locale. */
export function CountUp({ value, duration = 1600, className }: { value: number; duration?: number; className?: string }) {
  const { num } = useFormat();
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        setShown(Math.round(value * (1 - Math.pow(1 - p, 4))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value, duration]);
  return <span ref={ref} className={className}>{num(shown)}</span>;
}

/** Index that advances every `ms` — drives auto-playing highlights (e.g. the active step). */
export function useCycle(length: number, ms = 3200) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (length <= 1) return;
    const id = setInterval(() => setI((x) => (x + 1) % length), ms);
    return () => clearInterval(id);
  }, [length, ms]);
  return [i, setI] as const;
}

/** The three drifting light fields used behind hero and feature panels. */
export const Aurora = ({ dark = false }: { dark?: boolean }) => (
  <div aria-hidden="true" className={dark ? 'aurora aurora-dark' : 'aurora'}><i /><i /><i /></div>
);

/** Apple-style scroll zoom: the element grows from `from` to full size as it travels up into the viewport. */
export function useScrollScale<T extends HTMLElement>(from = 0.88) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.75)));
      const eased = 1 - Math.pow(1 - p, 3);
      el.style.transform = `scale(${from + (1 - from) * eased})`;
      el.style.borderRadius = `${40 - 12 * eased}px`;
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, [from]);
  return ref;
}

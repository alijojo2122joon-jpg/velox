import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { useFormat } from '../lib/format';
import { navigate } from '../lib/router';
import { Icon } from './icons';

/**
 * Interactive map using Leaflet + OpenStreetMap tiles (no API key needed). Leaflet is loaded on demand from a CDN
 * only when a map is shown, keeping the main bundle small. If the CDN or tiles are unreachable, a lightweight
 * schematic fallback still plots every vehicle so the map view never breaks.
 * Production: self-host tiles or use a commercial tile provider (Mapbox / MapTiler) under its usage policy.
 */
let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.async = true;
    s.onload = () => resolve((window as any).L);
    s.onerror = () => { leafletPromise = null; reject(new Error('leaflet')); };
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('timeout')), 8000);
  });
  return leafletPromise;
}

export interface MapPoint { id: number; lat: number; lng: number; label: string }

export function MapView({ points, center, highlighted, onHover, userLocation, single, className = 'h-full w-full' }:
  { points: MapPoint[]; center?: { lat: number; lng: number } | null; highlighted?: number | null; onHover?: (id: number | null) => void;
    userLocation?: { lat: number; lng: number } | null; single?: boolean; className?: string }) {
  const t = useT();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layer = useRef<any>(null);
  const [mode, setMode] = useState<'loading' | 'leaflet' | 'fallback'>('loading');

  useEffect(() => {
    let alive = true;
    loadLeaflet().then((L) => {
      if (!alive || !el.current) return;
      map.current = L.map(el.current, { zoomControl: true, scrollWheelZoom: !single, attributionControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      setMode('leaflet');
    }).catch(() => alive && setMode('fallback'));
    return () => { alive = false; map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (mode !== 'leaflet' || !L || !map.current) return;
    layer.current.clearLayers();
    const bounds: [number, number][] = [];
    for (const p of points) {
      const icon = L.divIcon({ className: 'vx-marker', html: `<span class="vx-pin ${p.id === highlighted ? 'on' : ''}">${p.label}</span>`, iconSize: [0, 0] });
      const m = L.marker([p.lat, p.lng], { icon, zIndexOffset: p.id === highlighted ? 1000 : 0 }).addTo(layer.current);
      if (!single) {
        m.on('click', () => navigate(`/vehicles/${p.id}`));
        m.on('mouseover', () => onHover?.(p.id));
        m.on('mouseout', () => onHover?.(null));
      }
      bounds.push([p.lat, p.lng]);
    }
    if (userLocation) {
      L.circleMarker([userLocation.lat, userLocation.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#2f62ff', fillOpacity: 1 }).addTo(layer.current);
      bounds.push([userLocation.lat, userLocation.lng]);
    }
    if (single && points[0]) map.current.setView([points[0].lat, points[0].lng], 15);
    else if (bounds.length > 1) map.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    else if (bounds.length === 1) map.current.setView(bounds[0], 14);
    else if (center) map.current.setView([center.lat, center.lng], 12);
    else map.current.setView([-2.5, 118], 5);
  }, [mode, points, highlighted, userLocation, center]);

  return (
    <div className={`relative overflow-hidden bg-ink-100 ${className}`}>
      <div ref={el} className="absolute inset-0 z-0" />
      {mode === 'loading' && <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-500">{t('map.loading')}</div>}
      {mode === 'fallback' && <SchematicMap points={points} highlighted={highlighted} onHover={onHover} userLocation={userLocation} />}
    </div>
  );
}

/** Offline fallback: equirectangular projection of points into the box (no tiles). */
function SchematicMap({ points, highlighted, onHover, userLocation }: { points: MapPoint[]; highlighted?: number | null; onHover?: (id: number | null) => void; userLocation?: { lat: number; lng: number } | null }) {
  const t = useT();
  const all = [...points, ...(userLocation ? [{ id: -1, ...userLocation, label: '' }] : [])];
  if (!all.length) return <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-500">{t('map.noPoints')}</div>;
  const lats = all.map((p) => p.lat), lngs = all.map((p) => p.lng);
  const pad = 0.004;
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats) - pad, Math.max(...lats) + pad, Math.min(...lngs) - pad, Math.max(...lngs) + pad];
  const pos = (p: { lat: number; lng: number }) => ({ left: `${8 + ((p.lng - minLng) / (maxLng - minLng)) * 84}%`, top: `${8 + ((maxLat - p.lat) / (maxLat - minLat)) * 84}%` });
  return (
    <div className="absolute inset-0 bg-[linear-gradient(#e2e7f0_1px,transparent_1px),linear-gradient(90deg,#e2e7f0_1px,transparent_1px)] bg-[size:40px_40px]" dir="ltr">
      {points.map((p) => (
        <button key={p.id} style={pos(p)} onClick={() => navigate(`/vehicles/${p.id}`)} onMouseEnter={() => onHover?.(p.id)} onMouseLeave={() => onHover?.(null)}
          className={`vx-pin absolute ${p.id === highlighted ? 'on z-10' : ''}`}>{p.label}</button>
      ))}
      {userLocation && <span style={pos(userLocation)} className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-brand-500 shadow" />}
      <div className="absolute bottom-2 start-2 inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-2 py-1 text-[11px] text-ink-500"><Icon name="info" size={12} />{t('map.fallback')}</div>
    </div>
  );
}

/** Compact price label for map pins, e.g. "Rp8K" (en) / "Rp8rb" (id). Wording comes from the locale files. */
export function usePinLabel() {
  const t = useT();
  const { num } = useFormat();
  return (price: number) => t('units.pinPrice', { n: num(price / 1000, 1) });
}

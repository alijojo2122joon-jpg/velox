import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);

// If a remote listing photo ever fails to load, show a neutral placeholder instead of a broken image.
document.addEventListener('error', (e) => {
  const img = e.target as HTMLImageElement;
  if (img?.tagName === 'IMG' && !img.dataset.fallback && /^https?:/.test(img.getAttribute('src') ?? '')) {
    img.dataset.fallback = '1';
    img.src = '/bike-fallback.svg';
  }
}, true);

/**
 * Photography & textures from Unsplash (https://unsplash.com/license — free for commercial use, no permission needed).
 * Served from Unsplash's image CDN at small, compressed sizes; credits are listed for good practice.
 */
const u = (id: string, w = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;


/** Area photos keyed by location slug. */
export const AREA_PHOTOS: Record<string, { src: string; by: string }> = {
  ubud: { src: u('photo-1557093793-e196ae071479', 700), by: 'Radoslav Bali' },
  canggu: { src: u('photo-1520427345958-bd9ff1c3f337', 700), by: 'Dominik Vanyi' },
  uluwatu: { src: u('photo-1576019206484-54273acdfa89', 700), by: 'Darren Lawrence' },
  seminyak: { src: u('photo-1571984405176-5958bd9ac31d', 700), by: 'Ern Gan' },
  kuta: { src: u('photo-1604842591960-5ce2a7933397', 700), by: 'Polina Kuzovkova' },
  sanur: { src: u('photo-1600412308760-a46c34a34ac4', 700), by: 'Sarah Richer' },
  denpasar: { src: u('photo-1680188700662-5b03bdcf3017', 700), by: 'Fadhila Nurhakim' },
  'nusa-dua': { src: u('photo-1647223447106-8d731a54cb90', 700), by: 'Anggi Tampubolon' },
};

export const PHOTO_CREDITS = Object.values(AREA_PHOTOS).map((p) => p.by);

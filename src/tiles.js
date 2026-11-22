// Leaflet tile layers that work offline.
//
// CachedTileLayer: every tile that is displayed is stored in IndexedDB and is
//   shown from there next time (also without network). This is passive
//   caching of tiles you actually looked at – look at your survey area at
//   different zoom levels while you still have network.
// PmtilesLayer: an offline raster base map from a single .pmtiles file (e.g.
//   aerial imagery exported from QGIS), stored on the phone.

import L from 'leaflet';
import { PMTiles, FileSource, TileType } from 'pmtiles';
import * as db from './db.js';

const MAX_AGE = 30 * 24 * 3600 * 1000; // refresh cached tiles after 30 days when online
let inserts = 0;
let cacheLimit = 20000;
export function setCacheLimit(n) { cacheLimit = n; }

export const CachedTileLayer = L.TileLayer.extend({
  initialize(id, url, options) {
    this._cacheId = id;
    L.TileLayer.prototype.initialize.call(this, url, options);
  },

  createTile(coords, done) {
    const img = document.createElement('img');
    img.alt = '';
    img.setAttribute('role', 'presentation');
    const url = this.getTileUrl(coords);
    const key = `${this._cacheId}/${coords.z}/${coords.x}/${coords.y}`;
    const show = (blob) => {
      const obj = URL.createObjectURL(blob);
      img.onload = () => { URL.revokeObjectURL(obj); done(null, img); };
      img.onerror = () => { URL.revokeObjectURL(obj); done(new Error('bad tile'), img); };
      img.src = obj;
    };
    db.get('tiles', key)
      .catch(() => null)
      .then(async (hit) => {
        const fresh = hit && Date.now() - hit.t < MAX_AGE;
        if (hit && (fresh || !navigator.onLine)) return show(hit.blob);
        try {
          const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          show(blob);
          db.put('tiles', { blob, t: Date.now() }, key).catch(() => {});
          if (++inserts % 200 === 0) db.trimTileCache(cacheLimit).catch(() => {});
        } catch (e) {
          if (hit) show(hit.blob);
          else done(e, img);
        }
      });
    return img;
  },
});

const MIME = {
  [TileType.Png]: 'image/png',
  [TileType.Jpeg]: 'image/jpeg',
  [TileType.Webp]: 'image/webp',
  [TileType.Avif]: 'image/avif',
};

// Open a stored .pmtiles blob. Returns { pmtiles, header } or throws.
export async function openPmtiles(blob, name = 'basemap.pmtiles') {
  const file = blob instanceof File ? blob : new File([blob], name);
  const pmtiles = new PMTiles(new FileSource(file));
  const header = await pmtiles.getHeader();
  if (!MIME[header.tileType]) {
    throw new Error('Only raster .pmtiles (PNG/JPEG/WebP) are supported, not vector tiles.');
  }
  return { pmtiles, header };
}

export const PmtilesLayer = L.GridLayer.extend({
  initialize(pm, header, options) {
    this._pm = pm;
    this._mime = MIME[header.tileType];
    L.GridLayer.prototype.initialize.call(this, {
      minNativeZoom: header.minZoom,
      maxNativeZoom: header.maxZoom,
      maxZoom: 22,
      bounds: L.latLngBounds([header.minLat, header.minLon], [header.maxLat, header.maxLon]),
      tileSize: 256,
      ...options,
    });
  },
  createTile(coords, done) {
    const img = document.createElement('img');
    img.alt = '';
    this._pm
      .getZxy(coords.z, coords.x, coords.y)
      .then((r) => {
        if (!r) return done(null, img); // no tile here → empty
        const obj = URL.createObjectURL(new Blob([r.data], { type: this._mime }));
        img.onload = () => { URL.revokeObjectURL(obj); done(null, img); };
        img.onerror = () => { URL.revokeObjectURL(obj); done(null, img); };
        img.src = obj;
      })
      .catch((e) => done(e, img));
    return img;
  },
});

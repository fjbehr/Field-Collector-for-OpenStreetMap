// SPDX-License-Identifier: GPL-3.0-or-later
// Place search.
//
//   online  – Nominatim (https://nominatim.openstreetmap.org), following its
//             usage policy: search only on request (no search-as-you-type),
//             max. 1 request per second, app identified by its User-Agent
//             (Capacitor appendUserAgent) / Referer, results cached.
//   offline – names in the existing OSM data loaded for the area, your own
//             collected features and recently chosen places.
//   coordinates – "9.4034, -0.8424" (decimal degrees, lat lon) works offline.

import * as db from './db.js';
import { featureLabel } from './presets.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
let lastRequest = 0;

// "9.40, -0.84", "9.40 -0.84", "9,40 -0,84", "N 9.40 W 0.84", "9.40N 0.84W" → { lat, lon } or null
export function parseCoordinates(q) {
  const s = q.trim().toUpperCase().replace(/°/g, ' ');
  const tokens = s.match(/[NSEWO]|[-+]?\d+(?:[.,]\d+)?/g) || [];
  if (s.replace(/[NSEWO]|[-+]?\d+(?:[.,]\d+)?/g, '').replace(/[\s,;]/g, '') !== '') return null; // other text
  const nums = tokens.filter((t) => /\d/.test(t)).map((t) => Number(t.replace(',', '.')));
  if (nums.length !== 2 || nums.some((n) => !Number.isFinite(n))) return null;
  let [lat, lon] = nums;
  if (tokens.includes('S')) lat = -Math.abs(lat);
  if (tokens.includes('W')) lon = -Math.abs(lon);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

function centroid(coords) {
  let lat = 0, lon = 0;
  for (const [a, b] of coords) { lat += a; lon += b; }
  return [lat / coords.length, lon / coords.length];
}
function bboxOf(coords) {
  const lats = coords.map((c) => c[0]), lons = coords.map((c) => c[1]);
  return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
}

// Offline search in local data. Returns [{ name, detail, lat, lon, bounds?, source }]
export async function searchOffline(q, { existing, features }) {
  const nq = norm(q.trim());
  if (nq.length < 2) return [];
  const out = [];
  const hit = (name) => norm(name).includes(nq);
  for (const f of features) {
    const name = f.tags?.name || featureLabel(f);
    if (!hit(name) && !Object.values(f.tags || {}).some(hit)) continue;
    const c = f.type === 'node' ? [f.lat, f.lon] : centroid(f.nodes.map((p) => [p.lat, p.lon]));
    out.push({
      name, detail: `your data · ${f.project}`, lat: c[0], lon: c[1], source: 'own',
      bounds: f.type === 'way' ? bboxOf(f.nodes.map((p) => [p.lat, p.lon])) : null,
    });
  }
  for (const p of existing?.points || []) {
    if (p.tags.name && hit(p.tags.name)) out.push({ name: p.tags.name, detail: `OSM · ${typeOf(p.tags)}`, lat: p.c[0], lon: p.c[1], source: 'osm' });
  }
  for (const w of existing?.ways || []) {
    if (w.tags.name && hit(w.tags.name)) {
      const c = centroid(w.c);
      out.push({ name: w.tags.name, detail: `OSM · ${typeOf(w.tags)}`, lat: c[0], lon: c[1], bounds: bboxOf(w.c), source: 'osm' });
    }
  }
  for (const r of (await db.kvGet('recentPlaces')) || []) {
    if (hit(r.name) || hit(r.detail)) out.push({ ...r, source: 'recent' });
  }
  // de-duplicate by name (streets consist of several ways)
  const seen = new Set();
  return out.filter((r) => {
    const k = `${norm(r.name)}|${r.source}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 30);
}

function typeOf(tags) {
  for (const k of ['place', 'amenity', 'shop', 'highway', 'building', 'landuse', 'natural', 'leisure', 'tourism', 'man_made', 'waterway']) {
    if (tags[k]) return `${k === 'building' && tags[k] === 'yes' ? 'building' : tags[k]}`.replace(/_/g, ' ');
  }
  return 'object';
}

// Online search (Nominatim). viewbox: [west, south, east, north] to prefer the current area.
export async function searchOnline(q, { viewbox, language } = {}) {
  const key = `nominatim:${norm(q)}`;
  const cached = await db.kvGet(key).catch(() => null);
  if (cached && Date.now() - cached.t < 7 * 86400000) return cached.results;
  const wait = lastRequest + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const params = new URLSearchParams({ q: q.trim(), format: 'jsonv2', limit: '10', addressdetails: '0' });
  if (viewbox) params.set('viewbox', viewbox.map((x) => x.toFixed(4)).join(','));
  if (language) params.set('accept-language', language);
  const res = await fetch(`${NOMINATIM}?${params}`, { headers: { Accept: 'application/json' } });
  if (res.status === 429) throw new Error('Too many searches – please wait a moment.');
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);
  const results = (await res.json()).map((r) => ({
    name: r.name || r.display_name.split(',')[0],
    detail: `${r.type !== 'yes' ? `${String(r.type).replace(/_/g, ' ')} · ` : ''}${r.display_name}`,
    lat: Number(r.lat),
    lon: Number(r.lon),
    bounds: r.boundingbox ? [[Number(r.boundingbox[0]), Number(r.boundingbox[2])], [Number(r.boundingbox[1]), Number(r.boundingbox[3])]] : null,
    source: 'nominatim',
  }));
  db.kvSet(key, { t: Date.now(), results }).catch(() => {});
  return results;
}

// Remember chosen places so they can be found again offline.
export async function rememberPlace(r) {
  const list = ((await db.kvGet('recentPlaces')) || []).filter((x) => !(x.name === r.name && Math.abs(x.lat - r.lat) < 1e-5));
  list.unshift({ name: r.name, detail: r.detail, lat: r.lat, lon: r.lon, bounds: r.bounds || null });
  await db.kvSet('recentPlaces', list.slice(0, 15));
}

export const recentPlaces = async () => (await db.kvGet('recentPlaces')) || [];

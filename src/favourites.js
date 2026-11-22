// Favourites (saved attribute sets) and recently used tag sets.
//
// A favourite is a complete set of OSM tags (and optionally private survey
// fields) that can be applied to a new feature with one tap, e.g.
// "Borehole – Afridev, working" or "Footpath – dirt". Favourites can also come
// from a project template (teacher's QR code).

import * as db from './db.js';
import { cleanTags } from './osm.js';

// Keys that identify one particular object – never copied into "recent".
const UNIQUE_KEYS = ['name', 'alt_name', 'ref', 'addr:housenumber', 'phone', 'website', 'note', 'description', 'start_date', 'fixme'];
const MAX_RECENT = 8;

export async function getFavourites() {
  return (await db.kvGet('favourites')) || [];
}

export async function saveFavourite({ name, geom, tags, extra }) {
  const list = await getFavourites();
  const fav = { id: Date.now().toString(36), name: name.trim(), geom: geom || '', tags: cleanTags(tags), extra: cleanTags(extra || {}) };
  list.push(fav);
  await db.kvSet('favourites', list);
  return fav;
}

export async function deleteFavourite(id) {
  await db.kvSet('favourites', (await getFavourites()).filter((f) => f.id !== id));
}

// Replace the favourites of one template (project) with the given ones.
export async function setTemplateFavourites(favs, templateName) {
  const others = (await getFavourites()).filter((f) => f.template !== templateName);
  const fromTemplate = favs.map((f, i) => ({
    id: `t-${templateName}-${i}`, template: templateName, name: f.name, geom: f.geom || '',
    tags: cleanTags(f.tags || {}), extra: cleanTags(f.extra || {}),
  }));
  await db.kvSet('favourites', [...fromTemplate, ...others]);
}

export async function getRecent() {
  return (await db.kvGet('recentTags')) || [];
}

// Remember the tag set of a saved feature (without object-specific keys).
export async function rememberRecent(tags, geom) {
  const t = cleanTags(tags);
  for (const k of UNIQUE_KEYS) delete t[k];
  if (!Object.keys(t).length) return;
  const sig = JSON.stringify(Object.entries(t).sort());
  const list = (await getRecent()).filter((r) => r.sig !== sig);
  list.unshift({ sig, geom, tags: t, t: Date.now() });
  await db.kvSet('recentTags', list.slice(0, MAX_RECENT));
}

// Does a favourite / recent entry fit the geometry (p, l, a)?
export const fitsGeom = (entry, geom) => !geom || !entry.geom || entry.geom.includes(geom);

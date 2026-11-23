// SPDX-License-Identifier: GPL-3.0-or-later
// Photos per feature. Photos are taken with the phone camera (or picked from
// the gallery), scaled down to save space, and stored on the phone (IndexedDB
// "files" store, key "photo:<id>"). They are exported with the data (ZIP for
// QGIS) but never uploaded to OpenStreetMap.

import * as db from './db.js';

const urls = new Map();

function loadImage(file) {
  if (window.createImageBitmap) {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => imgElement(file));
  }
  return imgElement(file);
}
function imgElement(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read the image'));
    img.src = URL.createObjectURL(file);
  });
}

// Scale to maxSize (longest side) and encode as JPEG.
async function shrink(file, maxSize) {
  const img = await loadImage(file);
  const w0 = img.width, h0 = img.height;
  const scale = Math.min(1, maxSize / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
  return { blob, w, h };
}

// Store a photo; returns its metadata for feature.photos.
export async function addPhoto(file, { maxSize = 1600, position = null } = {}) {
  const { blob, w, h } = await shrink(file, maxSize);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await db.put('files', blob, `photo:${id}`);
  return {
    id, t: Date.now(), w, h, size: blob.size,
    lat: position?.lat ?? null, lon: position?.lon ?? null, accuracy: position?.accuracy ?? null,
  };
}

export const photoBlob = (id) => db.get('files', `photo:${id}`);

export async function photoUrl(id) {
  if (urls.has(id)) return urls.get(id);
  const blob = await photoBlob(id);
  if (!blob) return '';
  const u = URL.createObjectURL(blob);
  urls.set(id, u);
  return u;
}

export async function deletePhoto(id) {
  await db.del('files', `photo:${id}`);
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
}

export async function deletePhotosOf(feature) {
  for (const p of feature.photos || []) await deletePhoto(p.id);
}

// File name of a photo inside exports: photos/<feature id>_<n>.jpg
export const photoFileName = (feature, index) => `photos/${feature.id}_${index + 1}.jpg`;

// Full-screen viewer; resolves 'delete' when the user deletes the photo.
export function viewPhoto(url, { deletable = true } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'dialog-backdrop photo-viewer'; // closed by the Android back button too
    el.innerHTML = `<img src="${url}" alt="">
      <div class="photo-viewer-bar">
        ${deletable ? '<button class="btn danger" data-del>Delete photo</button>' : ''}
        <button class="btn primary" data-close>Close</button>
      </div>`;
    document.body.appendChild(el);
    const done = (v) => { el.remove(); resolve(v); };
    el._cancel = () => done(null);
    el.querySelector('[data-close]').onclick = () => done(null);
    el.querySelector('[data-del]')?.addEventListener('click', () => done('delete'));
  });
}

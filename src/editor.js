// Feature editor: preset (feature type), favourites, preset fields, survey
// form of the project template, photos, raw OSM tags, private survey fields
// (exported, never uploaded) and a private note.

import { Browser } from '@capacitor/browser';
import {
  CATEGORIES, FIELDS, GEOM_LABEL, COMMON_KEYS, featureGeom, featureLabel,
  knownValues, matchPreset, searchPresets, isAreaTags,
} from './presets.js';
import { lineLength, ringArea, fmtArea, fmtDistance } from './geo.js';
import { cleanTags } from './osm.js';
import * as db from './db.js';
import { $, $$, esc, openSheet, closeSheet, confirmDialog, promptDialog, toast } from './ui.js';
import { icon, categoryIcon } from './icons.js';
import { getFavourites, saveFavourite, deleteFavourite, getRecent, rememberRecent, fitsGeom } from './favourites.js';
import { addPhoto, photoUrl, deletePhoto, viewPhoto } from './photos.js';

const WIKI = 'https://wiki.openstreetmap.org/wiki/';

function openWikiPage(page) {
  const url = WIKI + encodeURIComponent(page).replace(/%3A/g, ':').replace(/%3D/g, '=');
  if (!navigator.onLine) return toast('The OSM wiki needs a network connection');
  Browser.open({ url }).catch(() => window.open(url, '_blank'));
}
const openWiki = (key, value) => openWikiPage(value ? `Tag:${key}=${value}` : `Key:${key}`);

// taginfo value suggestions (online only, cached for offline use)
async function taginfoValues(key) {
  const cacheKey = `taginfo:${key}`;
  const cached = await db.kvGet(cacheKey).catch(() => null);
  if (cached && Date.now() - cached.t < 30 * 86400000) return cached.values;
  if (!navigator.onLine) return cached?.values || [];
  try {
    const res = await fetch(`https://taginfo.openstreetmap.org/api/4/key/values?key=${encodeURIComponent(key)}&page=1&rp=30&sortname=count_all&sortorder=desc`);
    const j = await res.json();
    const values = j.data.map((d) => d.value).filter((v) => v.length < 60);
    db.kvSet(cacheKey, { t: Date.now(), values }).catch(() => {});
    return values;
  } catch {
    return cached?.values || [];
  }
}

const tagSummary = (tags) => Object.entries(tags).map(([k, v]) => `${k}=${v || '…'}`).join(' + ');

// ---------- preset picker ----------
// Resolves with a preset, { fav }, { recent }, { raw: true } or null.
export function pickPreset(geom) {
  return new Promise((resolve) => {
    let picked = null;
    let favs = [];
    let recent = [];
    const sheet = openSheet({
      title: `Choose type (${GEOM_LABEL[geom]})`,
      body: `
        <div class="search-wrap">${icon('search')}<input type="search" class="search" placeholder="Search: school, borehole, footpath, shea…"></div>
        <label class="inline-check small"><input type="checkbox" data-allgeom> show types for all geometries</label>
        <div class="preset-list"></div>`,
      onClose: () => resolve(picked),
    });
    const list = $('.preset-list', sheet);
    const input = $('.search', sheet);
    const allGeom = $('[data-allgeom]', sheet);

    const item = (p) => `<button class="preset-item" data-id="${p.id}"><span class="pi-ico">${categoryIcon(p.category)}</span>
        <span class="pi-text"><b>${esc(p.name)}</b><small>${esc(tagSummary(p.tags))}</small></span></button>`;
    const favItem = (f) => `<div class="preset-item fav" role="button" tabindex="0" data-fav="${esc(f.id)}">
        <span class="pi-ico star">${icon('star')}</span>
        <span class="pi-text"><b>${esc(f.name)}</b><small>${esc(tagSummary(f.tags))}${Object.keys(f.extra || {}).length ? ` · ${Object.keys(f.extra).length} survey field(s)` : ''}${f.template ? ' · from template' : ''}</small></span>
        ${f.template ? '' : `<button class="icon-btn del" data-delfav="${esc(f.id)}" aria-label="Remove favourite">${icon('x')}</button>`}</div>`;
    const recentItem = (r, i) => `<button class="preset-item" data-recent="${i}"><span class="pi-ico">${icon('history')}</span>
        <span class="pi-text"><b>${esc(featureLabel({ tags: r.tags, type: r.geom === 'p' ? 'node' : 'way' }))}</b><small>${esc(tagSummary(r.tags))}</small></span></button>`;

    const render = () => {
      const q = input.value.trim().toLowerCase();
      const g = allGeom.checked ? null : geom;
      const matchQ = (name, tags) => !q || name.toLowerCase().includes(q) || tagSummary(tags).includes(q);
      const fv = favs.filter((f) => fitsGeom(f, g) && matchQ(f.name, f.tags));
      const rc = recent.map((r, i) => [r, i]).filter(([r]) => fitsGeom(r, g) && matchQ(featureLabel({ tags: r.tags }), r.tags));
      const res = searchPresets(q, g);
      let html = '';
      if (fv.length) html += `<div class="pick-group"><h4>${icon('star', 'sm')}Favourites</h4>${fv.map(favItem).join('')}</div>`;
      if (rc.length && !q) html += `<div class="pick-group"><h4>${icon('history', 'sm')}Recently used</h4>${rc.slice(0, 4).map(([r, i]) => recentItem(r, i)).join('')}</div>`;
      if (q) {
        html += res.length ? `<div class="pick-group"><h4>Types</h4>${res.map(item).join('')}</div>` : '';
      } else {
        html += `<div class="pick-group"><h4>All types</h4>${CATEGORIES.map((c) => {
          const items = res.filter((p) => p.category === c);
          return items.length ? `<details class="cat"><summary><span class="cat-ico">${categoryIcon(c)}</span><span class="grow">${esc(c)}</span><span class="count-badge">${items.length}</span>${icon('chevron-down', 'chev')}</summary>${items.map(item).join('')}</details>` : '';
        }).join('')}</div>`;
      }
      if (!html) html = '<p class="muted">Nothing found. Use “Raw tags only” and enter tags from the Map Features wiki.</p>';
      list.innerHTML = html + `<button class="preset-item raw" data-raw>${icon('tags')}<span>Raw tags only (no preset)</span></button>`;
    };

    list.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-delfav]');
      if (del) {
        const f = favs.find((x) => x.id === del.dataset.delfav);
        if (f && (await confirmDialog(`Remove the favourite “${esc(f.name)}”?`, 'Remove', 'Cancel', true))) {
          await deleteFavourite(f.id);
          favs = await getFavourites();
          render();
        }
        return;
      }
      const b = e.target.closest('.preset-item');
      if (!b) return;
      if (b.dataset.raw != null) picked = { raw: true };
      else if (b.dataset.fav) picked = { fav: favs.find((x) => x.id === b.dataset.fav) };
      else if (b.dataset.recent != null) picked = { recent: recent[Number(b.dataset.recent)] };
      else picked = searchPresets('', null).find((p) => p.id === Number(b.dataset.id));
      closeSheet(sheet);
    });
    input.addEventListener('input', render);
    allGeom.addEventListener('change', render);
    render();
    Promise.all([getFavourites(), getRecent()]).then(([f, r]) => { favs = f; recent = r; render(); });
  });
}

// ---------- editor ----------
// opts: { isNew, onSave(feature), onDelete(feature), onMove(feature) → Promise<pos|null>,
//         formFields: [{ key, label, type, options, required }], formName, getPosition(), photoMaxSize }
export async function openEditor(feature, opts = {}) {
  const f = structuredClone(feature);
  f.tags = f.tags || {};
  f.extra = f.extra || {};
  f.photos = f.photos || [];
  const geom = featureGeom(f);
  const formFields = opts.formFields || [];
  const formKeys = new Set(formFields.map((d) => d.key));
  const isEdit = f.kind === 'edit'; // existing OSM object
  let preset = matchPreset(f.tags);
  let textMode = false;
  let saved = false;
  const addedPhotos = [];
  const removedPhotos = [];

  function applyPreset(p) {
    if (preset) for (const k of Object.keys(preset.tags)) if (f.tags[k] === preset.tags[k]) delete f.tags[k];
    for (const [k, v] of Object.entries(p.tags)) if (v !== '' || !(k in f.tags)) f.tags[k] = v;
    preset = p;
  }
  function applyChoice(p) {
    if (!p) return;
    if (p.raw) { preset = null; return; }
    const src = p.fav || p.recent;
    if (src) {
      if (preset) for (const k of Object.keys(preset.tags)) if (f.tags[k] === preset.tags[k]) delete f.tags[k];
      Object.assign(f.tags, src.tags);
      if (p.fav?.extra) Object.assign(f.extra, p.fav.extra);
      preset = matchPreset(f.tags);
      return;
    }
    applyPreset(p);
  }

  if (opts.isNew && !Object.keys(f.tags).length) applyChoice(await pickPreset(geom));

  const statusNote = isEdit
    ? `<p class="warn">${icon('edit', 'lead')}Existing OSM object (${f.osmType} ${esc(f.osmId)}, version ${esc(f.version)}). Only its tags are changed when you upload.</p>`
    : f.status === 'uploaded'
      ? `<p class="warn">${icon('info', 'lead')}Already uploaded to OSM (id ${esc(f.osmId)}). Changes here stay on the phone and in exports only – edit the object on openstreetmap.org to change it there.</p>`
      : '';

  const sheet = openSheet({
    title: isEdit ? 'Edit OSM object' : opts.isNew ? 'New feature' : 'Edit feature',
    body: `
      <button class="preset-row" data-change>
        <span class="preset-ico"></span>
        <span class="grow"><small class="muted">Type</small><span class="preset-name"></span></span>
        <span class="change-link">Change${icon('chevron-right')}</span>
      </button>
      <div class="row-right"><button class="btn small ghost" data-favsave>${icon('star')}Save as favourite</button></div>
      ${statusNote}
      <div class="fields"></div>
      ${formFields.length ? `
      <details class="block" open>
        <summary>${icon('form', 'lead')}Survey form <small class="muted">(not uploaded)</small></summary>
        <div class="form-fields"></div>
      </details>` : ''}
      <details class="block" ${f.photos.length || !isEdit ? 'open' : ''}>
        <summary>${icon('camera', 'lead')}Photos <small class="photo-count muted"></small></summary>
        <div class="photo-grid"></div>
        <div class="photo-actions">
          <label class="btn small">${icon('camera')}Take photo<input type="file" accept="image/*" capture="environment" data-photo hidden></label>
          <label class="btn small">${icon('image-plus')}From gallery<input type="file" accept="image/*" multiple data-photo hidden></label>
        </div>
        <p class="hint">Photos stay on the phone and are included in the ZIP export for QGIS. They are not uploaded to OSM.</p>
      </details>
      <details class="block" open>
        <summary>${icon('tags', 'lead')}OSM tags <small class="tag-count muted"></small></summary>
        <div class="row-right"><button class="btn small ghost" data-textmode>Text view</button></div>
        <div class="tag-table"></div>
        <button class="btn small" data-addtag>${icon('plus')}Add tag</button>
        <p class="hint">All tags from <a href="#" data-mapfeatures>Map Features</a> can be used. Tap ${icon('help', 'inline')} to read the wiki (online).</p>
      </details>
      <details class="block" ${Object.keys(f.extra).some((k) => !formKeys.has(k)) ? 'open' : ''}>
        <summary>${icon('form', 'lead')}Private survey fields <small class="muted">(QGIS export only)</small></summary>
        <div class="extra-table"></div>
        <button class="btn small" data-addextra>${icon('plus')}Add field</button>
      </details>
      <label class="field"><span>Private note (not uploaded)</span><textarea data-note rows="2">${esc(f.note || '')}</textarea></label>
      <div class="info"></div>
      <datalist id="dl-keys">${COMMON_KEYS.map((k) => `<option value="${esc(k)}">`).join('')}</datalist>`,
    footer: `
      <button class="btn danger ${isEdit ? '' : 'icon-only'}" data-delete aria-label="${isEdit ? 'Discard edit' : 'Delete'}">${icon('trash')}${isEdit ? 'Discard' : ''}</button>
      ${opts.onMove && !isEdit ? `<button class="btn" data-move>${icon('move')}Move</button>` : ''}
      <button class="btn primary" data-save>${icon('check')}Save</button>`,
    onClose: () => {
      if (saved) return;
      // photos taken in this editor session but not saved
      addedPhotos.forEach((id) => deletePhoto(id));
      opts.onCancel?.(f);
    },
  });

  // ---- rendering ----
  function renderPreset() {
    $('.preset-name', sheet).textContent = preset ? preset.name : Object.keys(cleanTags(f.tags)).length ? 'Custom tags' : 'Not set – choose a type';
    $('.preset-ico', sheet).innerHTML = preset ? categoryIcon(preset.category) : icon('tags');
  }

  function inputFor(def, value, attr) {
    const v = value ?? '';
    if (def.type === 'check') {
      return `<select ${attr}><option value=""></option>${['yes', 'no'].map((o) => `<option ${v === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    }
    if (def.type === 'select') {
      return `<select ${attr}><option value=""></option>${(def.options || []).map((o) => `<option ${v === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    }
    if (def.type === 'combo') {
      const id = `dl-${Math.random().toString(36).slice(2, 8)}`;
      return `<input ${attr} list="${id}" value="${esc(v)}" autocomplete="off"><datalist id="${id}">${(def.options || []).map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`;
    }
    if (def.type === 'textarea') return `<textarea ${attr} rows="2">${esc(v)}</textarea>`;
    const type = def.type === 'number' ? 'text" inputmode="decimal' : def.type === 'tel' || def.type === 'url' ? def.type : 'text';
    return `<input ${attr} type="${type}" value="${esc(v)}" placeholder="${esc(def.placeholder || '')}">`;
  }

  function renderFields() {
    const ids = preset ? preset.fields : ['name'];
    $('.fields', sheet).innerHTML = ids.map((id) => FIELDS[id]).filter(Boolean).map((fd) =>
      `<label class="field"><span>${esc(fd.label)} <button class="wiki" data-wiki="${esc(fd.key)}" type="button" aria-label="Wiki">${icon('help')}</button></span>${inputFor(fd, f.tags[fd.key], `data-fkey="${esc(fd.key)}"`)}</label>`
    ).join('');
  }

  function renderForm() {
    const box = $('.form-fields', sheet);
    if (!box) return;
    box.innerHTML = formFields.map((d) =>
      `<label class="field"><span>${esc(d.label || d.key)}${d.required ? ' <b class="req">*</b>' : ''}</span>${inputFor(d, f.extra[d.key], `data-xkey="${esc(d.key)}"`)}</label>`
    ).join('');
  }

  async function renderPhotos() {
    $('.photo-count', sheet).textContent = f.photos.length ? `(${f.photos.length})` : '';
    const grid = $('.photo-grid', sheet);
    const urls = await Promise.all(f.photos.map((p) => photoUrl(p.id)));
    grid.innerHTML = f.photos.map((p, i) => `<button class="thumb" data-photo-id="${esc(p.id)}" style="background-image:url('${urls[i]}')" aria-label="Photo ${i + 1}"></button>`).join('');
  }

  function renderTags() {
    const entries = Object.entries(f.tags);
    $('.tag-count', sheet).textContent = `(${Object.keys(cleanTags(f.tags)).length})`;
    const box = $('.tag-table', sheet);
    if (textMode) {
      box.innerHTML = `<textarea class="tag-text" rows="${Math.max(4, entries.length + 1)}" spellcheck="false" autocapitalize="off">${esc(entries.map(([k, v]) => `${k}=${v}`).join('\n'))}</textarea>`;
      return;
    }
    box.innerHTML = entries.length
      ? entries.map(([k, v], i) => `
        <div class="kv" data-i="${i}">
          <input class="k" list="dl-keys" value="${esc(k)}" placeholder="key" autocapitalize="off" autocomplete="off">
          <input class="v" list="dl-v-${i}" value="${esc(v)}" placeholder="value" autocapitalize="off" autocomplete="off">
          <datalist id="dl-v-${i}">${knownValues(k).map((o) => `<option value="${esc(o)}">`).join('')}</datalist>
          <button class="wiki" data-wiki="${esc(k)}" data-wikival="${esc(v)}" type="button" aria-label="Wiki">${icon('help')}</button>
          <button class="icon-btn del" data-deltag="${esc(k)}" aria-label="Remove">${icon('x')}</button>
        </div>`).join('')
      : '<p class="muted">No tags yet.</p>';
  }

  function renderExtra() {
    const entries = Object.entries(f.extra).filter(([k]) => !formKeys.has(k));
    $('.extra-table', sheet).innerHTML = entries.map(([k, v], i) => `
      <div class="kv" data-i="${i}">
        <input class="k" value="${esc(k)}" placeholder="field, e.g. households">
        <input class="v" value="${esc(v)}" placeholder="value">
        <button class="icon-btn del" data-delextra="${esc(k)}" aria-label="Remove">${icon('x')}</button>
      </div>`).join('') || '<p class="muted">e.g. households=12, water_quality=turbid, interviewed=yes</p>';
  }

  function renderInfo() {
    const parts = [];
    if (f.type === 'node') {
      parts.push(`${f.lat.toFixed(6)}, ${f.lon.toFixed(6)}`);
      if (f.accuracy != null) parts.push(`±${f.accuracy.toFixed(1)} m${f.samples ? ` (${f.samples} fixes averaged)` : ''}`);
    } else {
      parts.push(`${f.nodes.length} points`);
      parts.push(f.closed ? `area ${fmtArea(ringArea(f.nodes))}` : `length ${fmtDistance(lineLength(f.nodes))}`);
      const snapped = f.nodes.filter((p) => p.osmNode || p.snapWay).length;
      if (snapped && !isEdit) parts.push(`${icon('snap', 'sm')}connected at ${snapped} point(s)`);
      if (f.track) parts.push(`${f.track.length} raw GPS fixes`);
      if (f.closed && Object.keys(cleanTags(f.tags)).length && !isAreaTags(f.tags)) {
        parts.push('<span class="warn-inline">closed way – add area=yes if it is an area</span>');
      }
    }
    parts.push(`project “${esc(f.project)}”`, new Date(f.created).toLocaleString());
    $('.info', sheet).innerHTML = parts.join(' · ');
  }

  const renderAll = () => { renderPreset(); renderFields(); renderForm(); renderTags(); renderExtra(); renderInfo(); };
  renderAll();
  renderPhotos();

  // ---- events ----
  function readTextTags() {
    const ta = $('.tag-text', sheet);
    if (!ta) return;
    const t = {};
    for (const line of ta.value.split('\n')) {
      const i = line.indexOf('=');
      if (i > 0) t[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    f.tags = t;
  }

  sheet.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.fkey) {
      f.tags[el.dataset.fkey] = el.value;
      renderTags();
    } else if (el.dataset.xkey) {
      f.extra[el.dataset.xkey] = el.value;
    } else if (el.classList.contains('tag-text')) {
      readTextTags();
      preset = matchPreset(f.tags);
      renderPreset(); renderFields();
    } else if (el.closest('.tag-table .kv') && el.classList.contains('v')) {
      const k = el.closest('.kv').querySelector('.k').value;
      f.tags[k] = el.value;
      renderFields();
    } else if (el.matches('[data-note]')) {
      f.note = el.value;
    }
  });

  sheet.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.fkey) {
      f.tags[el.dataset.fkey] = el.value;
      renderTags();
      return;
    }
    if (el.dataset.xkey) {
      f.extra[el.dataset.xkey] = el.value;
      return;
    }
    if (el.dataset.photo != null) {
      const files = [...(el.files || [])];
      el.value = '';
      for (const file of files) {
        try {
          const meta = await addPhoto(file, { maxSize: opts.photoMaxSize || 1600, position: opts.getPosition?.() });
          addedPhotos.push(meta.id);
          f.photos.push(meta);
        } catch (err) {
          toast(`Photo failed: ${err.message}`);
        }
      }
      renderPhotos();
      return;
    }
    const row = el.closest('.kv');
    if (!row) return;
    const isTag = !!el.closest('.tag-table');
    const obj = isTag ? f.tags : f.extra;
    const rebuilt = {};
    for (const r of $$(isTag ? '.tag-table .kv' : '.extra-table .kv', sheet)) {
      const k = r.querySelector('.k').value.trim();
      if (k) rebuilt[k] = r.querySelector('.v').value;
    }
    for (const k of Object.keys(obj)) if (isTag || !formKeys.has(k)) delete obj[k];
    Object.assign(obj, rebuilt);
    if (isTag) {
      preset = matchPreset(f.tags) || preset;
      renderPreset(); renderFields();
      if (el.classList.contains('k')) renderTags();
    }
    renderInfo();
  });

  // value suggestions from taginfo when a value field gets focus
  sheet.addEventListener('focusin', async (e) => {
    const el = e.target;
    if (!el.classList.contains('v') || !el.closest('.tag-table')) return;
    const key = el.closest('.kv').querySelector('.k').value.trim();
    if (!key) return;
    const dl = document.getElementById(el.getAttribute('list'));
    const vals = new Set([...knownValues(key), ...(await taginfoValues(key))]);
    dl.innerHTML = [...vals].map((o) => `<option value="${esc(o)}">`).join('');
  });

  sheet.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-change]')) {
      readTextTags();
      const p = await pickPreset(geom);
      if (p) { applyChoice(p); renderAll(); }
    } else if (t.closest('[data-favsave]')) {
      readTextTags();
      const tags = cleanTags(f.tags);
      if (!Object.keys(tags).length) return toast('Add a type or tags first');
      const name = await promptDialog('Name of the favourite', featureLabel(f), 'e.g. Borehole – Afridev, working');
      if (!name?.trim()) return;
      const extra = cleanTags(Object.fromEntries(Object.entries(f.extra).filter(([k]) => !formKeys.has(k))));
      await saveFavourite({ name, geom, tags, extra });
      toast(`Favourite saved: ${name.trim()}`);
    } else if (t.dataset.wiki) {
      openWiki(t.dataset.wiki, t.dataset.wikival);
    } else if (t.dataset.mapfeatures != null) {
      e.preventDefault();
      openWikiPage('Map_features');
    } else if (t.dataset.photoId) {
      const id = t.dataset.photoId;
      if ((await viewPhoto(await photoUrl(id))) === 'delete') {
        f.photos = f.photos.filter((p) => p.id !== id);
        if (addedPhotos.includes(id)) { addedPhotos.splice(addedPhotos.indexOf(id), 1); deletePhoto(id); } else removedPhotos.push(id);
        renderPhotos();
      }
    } else if (t.dataset.deltag != null) {
      delete f.tags[t.dataset.deltag];
      preset = matchPreset(f.tags);
      renderAll();
    } else if (t.dataset.delextra != null) {
      delete f.extra[t.dataset.delextra];
      renderExtra();
    } else if (t.closest('[data-addtag]')) {
      if (textMode) { $('.tag-text', sheet).value += '\n'; return; }
      f.tags[''] = '';
      renderTags();
      $$('.tag-table .kv .k', sheet).at(-1)?.focus();
    } else if (t.closest('[data-addextra]')) {
      f.extra[''] = '';
      renderExtra();
      $$('.extra-table .kv .k', sheet).at(-1)?.focus();
    } else if (t.closest('[data-textmode]')) {
      if (textMode) readTextTags();
      textMode = !textMode;
      t.closest('[data-textmode]').textContent = textMode ? 'Table view' : 'Text view';
      renderTags();
    } else if (t.closest('[data-save]')) {
      readTextTags();
      f.tags = cleanTags(f.tags);
      f.extra = cleanTags(f.extra);
      if (!Object.keys(f.tags).length && !(await confirmDialog('This feature has no OSM tags and cannot be uploaded. Save anyway?', 'Save'))) return;
      const missing = formFields.filter((d) => d.required && !f.extra[d.key]).map((d) => d.label || d.key);
      if (missing.length && !(await confirmDialog(`Required survey fields are empty: <b>${missing.map(esc).join(', ')}</b>. Save anyway?`, 'Save anyway', 'Fill in'))) return;
      f.updated = Date.now();
      saved = true;
      removedPhotos.forEach((id) => deletePhoto(id));
      rememberRecent(f.tags, geom).catch(() => {});
      await opts.onSave?.(f);
      closeSheet(sheet);
      toast(`Saved: ${featureLabel(f)}`);
    } else if (t.closest('[data-delete]')) {
      const q = isEdit ? 'Discard your changes to this OSM object? (Nothing is deleted on OSM.)' : `Delete “${esc(featureLabel(f))}” from the phone?`;
      if (!(await confirmDialog(q, isEdit ? 'Discard' : 'Delete', 'Cancel', true))) return;
      saved = true;
      addedPhotos.forEach((id) => deletePhoto(id));
      await opts.onDelete?.(f);
      closeSheet(sheet);
    } else if (t.closest('[data-move]')) {
      const moved = await opts.onMove(f);
      if (moved) { Object.assign(f, moved); renderInfo(); toast('Position updated – press Save'); }
    }
  });
}

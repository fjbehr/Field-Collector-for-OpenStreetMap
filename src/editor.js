// Feature editor: preset (feature type), preset fields, raw OSM tags,
// private survey fields (exported, never uploaded) and a private note.

import { Browser } from '@capacitor/browser';
import {
  CATEGORIES, FIELDS, GEOM_LABEL, COMMON_KEYS, featureGeom, featureLabel,
  knownValues, matchPreset, searchPresets, isAreaTags,
} from './presets.js';
import { lineLength, ringArea, fmtArea, fmtDistance } from './geo.js';
import { cleanTags } from './osm.js';
import * as db from './db.js';
import { $, $$, esc, openSheet, closeSheet, confirmDialog, toast } from './ui.js';

const WIKI = 'https://wiki.openstreetmap.org/wiki/';

function openWiki(key, value) {
  const page = value ? `Tag:${key}=${value}` : `Key:${key}`;
  const url = WIKI + encodeURIComponent(page).replace(/%3A/g, ':').replace(/%3D/g, '=');
  if (!navigator.onLine) return toast('The OSM wiki needs a network connection');
  Browser.open({ url }).catch(() => window.open(url, '_blank'));
}

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

// ---------- preset picker ----------
export function pickPreset(geom) {
  return new Promise((resolve) => {
    let picked = null;
    const sheet = openSheet({
      title: `Choose type (${GEOM_LABEL[geom]})`,
      body: `
        <input type="search" class="search" placeholder="Search: school, borehole, footpath, shea…" autofocus>
        <label class="inline-check"><input type="checkbox" data-allgeom> show types for all geometries</label>
        <div class="preset-list"></div>`,
      onClose: () => resolve(picked),
    });
    const list = $('.preset-list', sheet);
    const input = $('.search', sheet);
    const allGeom = $('[data-allgeom]', sheet);
    const render = () => {
      const q = input.value;
      const res = searchPresets(q, allGeom.checked ? null : geom);
      if (!res.length) {
        list.innerHTML = `<p class="muted">No preset found. Use “Raw tags only” and enter tags from the Map Features wiki.</p>`;
      } else if (q.trim()) {
        list.innerHTML = res.map(item).join('');
      } else {
        list.innerHTML = CATEGORIES.map((c) => {
          const items = res.filter((p) => p.category === c);
          return items.length ? `<details><summary>${esc(c)} <small>(${items.length})</small></summary>${items.map(item).join('')}</details>` : '';
        }).join('');
      }
      list.insertAdjacentHTML('beforeend', `<button class="preset-item raw" data-raw>✎ Raw tags only (no preset)</button>`);
    };
    const item = (p) => `<button class="preset-item" data-id="${p.id}"><b>${esc(p.name)}</b>
        <small>${esc(Object.entries(p.tags).map(([k, v]) => `${k}=${v || '…'}`).join(' + '))}</small></button>`;
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.preset-item');
      if (!b) return;
      picked = b.dataset.raw != null ? { raw: true } : searchPresets('', null).find((p) => p.id === Number(b.dataset.id));
      closeSheet(sheet);
    });
    input.addEventListener('input', render);
    allGeom.addEventListener('change', render);
    render();
  });
}

// ---------- editor ----------
// opts: { isNew, onSave(feature), onDelete(feature), onMove(feature) → Promise<feature|null> }
export async function openEditor(feature, opts = {}) {
  const f = structuredClone(feature);
  f.tags = f.tags || {};
  f.extra = f.extra || {};
  const geom = featureGeom(f);
  let preset = matchPreset(f.tags);
  let textMode = false;
  let saved = false;

  if (opts.isNew && !Object.keys(f.tags).length) {
    const p = await pickPreset(geom);
    if (p && !p.raw) applyPreset(p);
  }

  const sheet = openSheet({
    title: opts.isNew ? 'New feature' : 'Edit feature',
    body: `
      <div class="preset-row">
        <div><small class="muted">Type</small><div class="preset-name"></div></div>
        <button class="btn" data-change>Change</button>
      </div>
      ${f.status === 'uploaded' ? `<p class="warn">Already uploaded to OSM (id ${esc(f.osmId)}). Changes here stay on the phone and in exports only – edit the object on openstreetmap.org to change it there.</p>` : ''}
      <div class="fields"></div>
      <details class="block" open>
        <summary>OSM tags <small class="tag-count"></small></summary>
        <div class="row-right"><button class="btn small" data-textmode>Text view</button></div>
        <div class="tag-table"></div>
        <button class="btn small" data-addtag>+ Add tag</button>
        <p class="hint">All tags from <a href="#" data-mapfeatures>Map Features</a> can be used. Tap ? to read the wiki (online).</p>
      </details>
      <details class="block" ${Object.keys(f.extra).length ? 'open' : ''}>
        <summary>Private survey fields <small>(QGIS export only, never uploaded)</small></summary>
        <div class="extra-table"></div>
        <button class="btn small" data-addextra>+ Add field</button>
      </details>
      <label class="field"><span>Private note (not uploaded)</span><textarea data-note rows="2">${esc(f.note || '')}</textarea></label>
      <div class="info"></div>
      <datalist id="dl-keys">${COMMON_KEYS.map((k) => `<option value="${esc(k)}">`).join('')}</datalist>`,
    footer: `
      <button class="btn danger" data-delete>Delete</button>
      ${opts.onMove ? '<button class="btn" data-move>Move…</button>' : ''}
      <button class="btn primary" data-save>Save</button>`,
    onClose: () => { if (!saved && opts.isNew) opts.onCancelNew?.(f); },
  });

  function applyPreset(p) {
    if (preset) for (const k of Object.keys(preset.tags)) if (f.tags[k] === preset.tags[k]) delete f.tags[k];
    for (const [k, v] of Object.entries(p.tags)) if (v !== '' || !(k in f.tags)) f.tags[k] = v;
    preset = p;
  }

  // ---- rendering ----
  function renderPreset() {
    $('.preset-name', sheet).textContent = preset ? preset.name : Object.keys(cleanTags(f.tags)).length ? 'Custom tags' : 'Not set – choose a type';
  }

  function fieldInput(fd) {
    const v = f.tags[fd.key] ?? '';
    const attrs = `data-fkey="${esc(fd.key)}"`;
    let input;
    if (fd.type === 'check') {
      input = `<select ${attrs}><option value=""></option>${['yes', 'no'].map((o) => `<option ${v === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    } else if (fd.type === 'combo') {
      const id = `dl-f-${fd.key.replace(/[^\w]/g, '_')}`;
      input = `<input ${attrs} list="${id}" value="${esc(v)}" autocomplete="off"><datalist id="${id}">${fd.options.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`;
    } else if (fd.type === 'textarea') {
      input = `<textarea ${attrs} rows="2">${esc(v)}</textarea>`;
    } else {
      const type = fd.type === 'number' ? 'text" inputmode="decimal' : fd.type;
      input = `<input ${attrs} type="${type}" value="${esc(v)}" placeholder="${esc(fd.placeholder || '')}">`;
    }
    return `<label class="field"><span>${esc(fd.label)} <button class="wiki" data-wiki="${esc(fd.key)}" type="button">?</button></span>${input}</label>`;
  }

  function renderFields() {
    const ids = preset ? preset.fields : ['name'];
    $('.fields', sheet).innerHTML = ids.map((id) => FIELDS[id]).filter(Boolean).map(fieldInput).join('');
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
          <button class="wiki" data-wiki="${esc(k)}" data-wikival="${esc(v)}" type="button">?</button>
          <button class="icon-btn del" data-deltag="${esc(k)}" aria-label="Remove">✕</button>
        </div>`).join('')
      : '<p class="muted">No tags yet.</p>';
  }

  function renderExtra() {
    const entries = Object.entries(f.extra);
    $('.extra-table', sheet).innerHTML = entries.map(([k, v], i) => `
      <div class="kv" data-i="${i}">
        <input class="k" value="${esc(k)}" placeholder="field, e.g. households">
        <input class="v" value="${esc(v)}" placeholder="value">
        <button class="icon-btn del" data-delextra="${esc(k)}" aria-label="Remove">✕</button>
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
      if (f.track) parts.push(`${f.track.length} raw GPS fixes`);
      if (f.closed && Object.keys(cleanTags(f.tags)).length && !isAreaTags(f.tags)) {
        parts.push('<span class="warn-inline">closed way – add area=yes if it is an area</span>');
      }
    }
    parts.push(`project “${esc(f.project)}”`, new Date(f.created).toLocaleString());
    $('.info', sheet).innerHTML = parts.join(' · ');
  }

  const renderAll = () => { renderPreset(); renderFields(); renderTags(); renderExtra(); renderInfo(); };
  renderAll();

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

  sheet.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.fkey) {
      f.tags[el.dataset.fkey] = el.value;
      renderTags();
      return;
    }
    const row = el.closest('.kv');
    if (!row) return;
    const isTag = !!el.closest('.tag-table');
    const obj = isTag ? f.tags : f.extra;
    const rebuilt = {};
    const rows = $$(isTag ? '.tag-table .kv' : '.extra-table .kv', sheet);
    for (const r of rows) {
      const k = r.querySelector('.k').value.trim();
      if (k) rebuilt[k] = r.querySelector('.v').value;
    }
    for (const k of Object.keys(obj)) delete obj[k];
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
      if (p && !p.raw) { applyPreset(p); renderAll(); }
      if (p && p.raw) { preset = null; renderAll(); }
    } else if (t.dataset.wiki) {
      openWiki(t.dataset.wiki, t.dataset.wikival);
    } else if (t.dataset.mapfeatures != null) {
      e.preventDefault();
      openWiki2('Map_features');
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
      t.textContent = textMode ? 'Table view' : 'Text view';
      renderTags();
    } else if (t.closest('[data-save]')) {
      readTextTags();
      f.tags = cleanTags(f.tags);
      f.extra = cleanTags(f.extra);
      if (!Object.keys(f.tags).length && !(await confirmDialog('This feature has no OSM tags and cannot be uploaded. Save anyway?', 'Save'))) return;
      f.updated = Date.now();
      saved = true;
      await opts.onSave?.(f);
      closeSheet(sheet);
      toast(`Saved: ${featureLabel(f)}`);
    } else if (t.closest('[data-delete]')) {
      if (!(await confirmDialog(`Delete “${esc(featureLabel(f))}” from the phone?`, 'Delete', 'Cancel', true))) return;
      saved = true;
      await opts.onDelete?.(f);
      closeSheet(sheet);
    } else if (t.closest('[data-move]')) {
      const moved = await opts.onMove(f);
      if (moved) { Object.assign(f, moved); renderInfo(); toast('Position updated – press Save'); }
    }
  });
}

function openWiki2(page) {
  const url = WIKI + page;
  if (!navigator.onLine) return toast('The OSM wiki needs a network connection');
  Browser.open({ url }).catch(() => window.open(url, '_blank'));
}

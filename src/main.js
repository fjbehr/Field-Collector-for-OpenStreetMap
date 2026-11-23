// SPDX-License-Identifier: GPL-3.0-or-later
import 'leaflet/dist/leaflet.css';
import './styles.css';
import L from 'leaflet';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

import { APP_NAME, APP_VERSION, BASEMAPS, DEFAULT_SETTINGS, OSM_SERVERS, START_VIEW } from './config.js';
import * as db from './db.js';
import * as gps from './gps.js';
import { distance, lineLength, ringArea, simplify, fmtDistance, fmtArea } from './geo.js';
import { CachedTileLayer, PmtilesLayer, openPmtiles, setCacheLimit } from './tiles.js';
import { featureLabel, isAreaTags, matchPreset } from './presets.js';
import { icon, categoryIcon, renderIcons } from './icons.js';
import { openEditor } from './editor.js';
import * as osm from './osm.js';
import { FORMATS, buildFiles, safeName, sendEmail, shareFiles, saveToDocuments, toGPX } from './export.js';
import { setTheme } from './theme.js';
import { findSnap, metresPerPixel } from './snap.js';
import { getFavourites, setTemplateFavourites } from './favourites.js';
import { deletePhotosOf } from './photos.js';
import { encodeTemplate, decodeTemplate, validateTemplate, qrSvg, scanQr, FIELD_TYPES } from './template.js';
import { showTutorial } from './tutorial.js';
import { openAbout } from './about.js';
import { parseCoordinates, searchOffline, searchOnline, rememberPlace, recentPlaces } from './search.js';
import {
  $, $$, esc, toast, openSheet, closeSheet, hasOpenSheet, closeDialog,
  confirmDialog, alertDialog, promptDialog, choiceDialog, busy,
} from './ui.js';

const native = Capacitor.isNativePlatform();
renderIcons();

const state = {
  settings: { ...DEFAULT_SETTINGS },
  features: new Map(),
  recording: null, // { mode: 'auto'|'vertex'|'crosshair', nodes: [], paused, startedAt }
  follow: true,
  existing: null,
  showExisting: true,
  templates: {}, // project name → survey template
};

// ======================================================================
// Map
// ======================================================================
const map = L.map('map', { zoomControl: false, maxZoom: 22, attributionControl: true })
  .setView([START_VIEW.lat, START_VIEW.lon], START_VIEW.zoom);
L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
map.attributionControl.setPrefix('');

let baseLayer = null;
const existingLayer = L.layerGroup().addTo(map);
const featureLayer = L.layerGroup().addTo(map);
const recordLayer = L.layerGroup().addTo(map);
const searchLayer = L.layerGroup().addTo(map);
const gpsAccuracy = L.circle([0, 0], { radius: 1, color: '#1a73e8', weight: 1, fillOpacity: 0.12, interactive: false });
const gpsDot = L.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1, interactive: false });

async function setBasemap() {
  const s = state.settings;
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = null;
  try {
    if (s.basemap === 'offline') {
      const blob = await db.get('files', 'basemap');
      if (!blob) throw new Error('No offline base map imported yet (Settings → Offline base map).');
      const { pmtiles, header } = await openPmtiles(blob);
      baseLayer = new PmtilesLayer(pmtiles, header, { attribution: 'Offline base map' });
    } else if (s.basemap === 'custom' && s.customTileUrl) {
      baseLayer = new CachedTileLayer('custom', s.customTileUrl, { maxNativeZoom: 19, maxZoom: 22 });
    } else if (s.basemap === 'none') {
      return;
    } else {
      const b = BASEMAPS[s.basemap] || BASEMAPS.osm;
      baseLayer = new CachedTileLayer(s.basemap in BASEMAPS ? s.basemap : 'osm', b.url, {
        maxNativeZoom: b.maxNativeZoom, maxZoom: 22, attribution: b.attribution,
      });
    }
    baseLayer.addTo(map);
    baseLayer.bringToBack();
  } catch (e) {
    toast(e.message, 5000);
  }
}

const STYLE = {
  new: { color: '#e8590c', fill: '#ff922b' },
  uploaded: { color: '#2b8a3e', fill: '#51cf66' },
  untagged: { color: '#c92a2a', fill: '#ff6b6b' },
  edited: { color: '#7048e8', fill: '#9775fa' },
};
const statusOf = (f) => (f.status === 'uploaded' ? 'uploaded' : f.kind === 'edit' ? 'edited' : Object.keys(f.tags || {}).length ? 'new' : 'untagged');
const styleOf = (f) => STYLE[statusOf(f)];
const STATUS_LABEL = { uploaded: 'Uploaded', new: 'New', untagged: 'No tags', edited: 'Edited' };
// Existing OSM data can only be used (connect, edit) on the server it was loaded from.
const existingForServer = () => (state.existing && state.existing.server === osm.serverConfig(state.settings).key ? state.existing : null);

function renderFeatures() {
  featureLayer.clearLayers();
  for (const f of state.features.values()) {
    if (f.project !== state.settings.project && !state.settings.showAllProjects) continue;
    const st = styleOf(f);
    let layer;
    if (f.type === 'node') {
      const cat = matchPreset(f.tags || {})?.category;
      layer = L.marker([f.lat, f.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div class="fmark ${statusOf(f)}">${categoryIcon(cat)}</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15], tooltipAnchor: [0, -14],
        }),
      });
    } else {
      const ll = f.nodes.map((p) => [p.lat, p.lon]);
      layer = f.closed
        ? L.polygon(ll, { color: st.color, weight: 3, fillColor: st.fill, fillOpacity: 0.25 })
        : L.polyline(ll, { color: st.color, weight: 4 });
    }
    layer.bindTooltip(esc(featureLabel(f)), { direction: 'top', offset: f.type === 'node' ? [0, 0] : [0, -6] });
    layer.on('click', () => editFeature(f.id));
    layer.addTo(featureLayer);
  }
  updateCounts();
}

function renderExisting() {
  existingLayer.clearLayers();
  const d = state.existing;
  if (!d || !state.showExisting) return;
  for (const w of d.ways) {
    const closed = w.n ? w.n.length > 3 && w.n[0] === w.n.at(-1) : w.c.length > 3 && w.c[0] === w.c.at(-1);
    const opts = { color: '#6c757d', weight: 3, opacity: 0.8, dashArray: w.tags.highway ? null : '4 4', interactive: true };
    const layer = closed && isAreaTags(w.tags) ? L.polygon(w.c, { ...opts, fillOpacity: 0.08 }) : L.polyline(w.c, opts);
    layer.bindTooltip(esc(osmLabel(w.tags, `way ${w.id}`)));
    layer.on('click', () => onExistingClick('way', w));
    layer.addTo(existingLayer);
  }
  for (const p of d.points) {
    L.circleMarker(p.c, { radius: 6, color: '#495057', weight: 1, fillColor: '#adb5bd', fillOpacity: 0.9 })
      .bindTooltip(esc(osmLabel(p.tags, `node ${p.id}`)))
      .on('click', () => onExistingClick('node', p))
      .addTo(existingLayer);
  }
}
const osmLabel = (t, fallback) => t.name || featureLabel({ tags: t, type: 'node' }) || fallback;

// Tap on an existing OSM object: edit its tags (uploaded as a modification).
async function onExistingClick(osmType, obj) {
  if (state.recording) return;
  if (!existingForServer()) return alertDialog('These OSM data were loaded from another server. Load the existing OSM data again (More → Load existing OSM data).');
  if (obj.v == null || (osmType === 'way' && !obj.n)) {
    return alertDialog('These OSM data were loaded with an older app version. Load them again (More → Load existing OSM data) to edit them.');
  }
  const open = [...state.features.values()].find((f) => f.kind === 'edit' && f.osmType === osmType && f.osmId === obj.id && f.status !== 'uploaded');
  if (open) return editFeature(open.id);
  const tags = Object.entries(obj.tags).map(([k, v]) => `${k}=${v}`).join(' · ') || 'no tags';
  const v = await choiceDialog(esc(osmLabel(obj.tags, `${osmType} ${obj.id}`)), [
    { value: 'edit', icon: 'edit', label: 'Edit tags of this OSM object', desc: esc(tags.length > 160 ? `${tags.slice(0, 160)}…` : tags) },
    { value: 'web', icon: 'map-pinned', label: 'Show on openstreetmap.org', desc: `${osmType} ${obj.id} · version ${obj.v} (needs network)` },
  ]);
  if (v === 'web') {
    Browser.open({ url: `${osm.serverConfig(state.settings).web}/${osmType}/${obj.id}` }).catch(() => {});
    return;
  }
  if (v !== 'edit') return;
  const closed = osmType === 'way' && obj.n.length > 3 && obj.n[0] === obj.n.at(-1);
  const f = await newFeature({
    kind: 'edit', osmType, osmId: obj.id, version: obj.v, osmServer: state.existing.server, source: 'osm',
    baseTags: { ...obj.tags }, tags: { ...obj.tags },
    ...(osmType === 'node'
      ? { type: 'node', lat: obj.c[0], lon: obj.c[1] }
      : { type: 'way', closed, nodeIds: [...obj.n], nodes: (closed ? obj.c.slice(0, -1) : obj.c).map(([lat, lon]) => ({ lat, lon })) }),
  });
  // closing the editor without saving removes the (unchanged) copy again
  editFeature(f.id, false, {
    onCancel: async () => { await db.deleteFeature(f.id); state.features.delete(f.id); renderFeatures(); },
  });
}

map.on('dragstart', () => setFollow(false));

function setFollow(on) {
  state.follow = on;
  $('#btn-follow').classList.toggle('active', on);
  const fix = gps.lastFix();
  if (on && fix) map.setView([fix.lat, fix.lon], Math.max(map.getZoom(), 17));
}

// ======================================================================
// GPS status
// ======================================================================
let firstFix = true;
gps.onFix((fix) => {
  gpsDot.setLatLng([fix.lat, fix.lon]);
  gpsAccuracy.setLatLng([fix.lat, fix.lon]).setRadius(fix.accuracy || 1);
  if (!map.hasLayer(gpsDot)) { gpsAccuracy.addTo(map); gpsDot.addTo(map); }
  if (firstFix) {
    firstFix = false;
    if (state.follow) map.setView([fix.lat, fix.lon], 17);
  } else if (state.follow) {
    map.panTo([fix.lat, fix.lon], { animate: true });
  }
  const acc = fix.accuracy ?? 999;
  setGpsBadge(`±${acc < 100 ? acc.toFixed(0) : '>99'} m${fix.simulated ? ' sim' : ''}`, acc <= 5 ? 'good' : acc <= state.settings.maxAccuracy ? 'ok' : 'bad');
  onRecordingFix(fix);
});
function setGpsBadge(text, cls) {
  $('#gps-badge .t').textContent = text;
  $('#gps-badge').className = `chip ${cls}`;
}
gps.onError((err) => {
  setGpsBadge(err.code === 'NOT_AUTHORIZED' ? 'No permission' : 'No signal', 'bad');
  if (err.code === 'NOT_AUTHORIZED' && native) {
    confirmDialog('This app needs location permission to record points and ways. Open settings now?', 'Open settings').then(
      (ok) => ok && gps.openSettings()
    );
  }
});
setInterval(() => {
  const fix = gps.lastFix();
  if (fix && Date.now() - fix.time > 15000) {
    setGpsBadge('Waiting…', 'bad');
  }
}, 5000);

// ======================================================================
// Features
// ======================================================================
async function newFeature(props) {
  const f = {
    id: await db.nextFeatureId(),
    project: state.settings.project,
    created: Date.now(),
    updated: Date.now(),
    tags: {},
    extra: {},
    note: '',
    status: 'new',
    ...props,
  };
  await db.saveFeature(f);
  state.features.set(f.id, f);
  renderFeatures();
  return f;
}

function editFeature(id, isNew = false, extra = {}) {
  const f = state.features.get(id);
  if (!f) return;
  const tpl = state.templates[f.project];
  openEditor(f, {
    isNew,
    formFields: tpl?.fields || [],
    formName: tpl ? `template “${tpl.project}”` : '',
    getPosition: () => gps.lastFix(),
    photoMaxSize: state.settings.photoMaxSize,
    onCancel: extra.onCancel,
    onSave: async (updated) => {
      await db.saveFeature(updated);
      state.features.set(updated.id, updated);
      renderFeatures();
    },
    onDelete: async (d) => {
      await deletePhotosOf(state.features.get(d.id) || d);
      await db.deleteFeature(d.id);
      state.features.delete(d.id);
      renderFeatures();
    },
    onMove: f.type === 'node' && f.kind !== 'edit' ? moveNode : null,
  });
}

async function moveNode(f) {
  const how = await choiceDialog('Move point to…', [
    { value: 'gps', icon: 'gps', label: 'Current GPS position', desc: `averaged over ${state.settings.averageSeconds} s` },
    { value: 'center', icon: 'crosshair', label: 'Map crosshair', desc: 'close the editor first to position the map' },
  ]);
  if (how === 'gps') {
    const pos = await captureAveraged();
    return pos && { lat: pos.lat, lon: pos.lon, altitude: pos.altitude, accuracy: pos.accuracy, samples: pos.samples };
  }
  if (how === 'center') {
    const c = map.getCenter();
    return { lat: c.lat, lon: c.lng, accuracy: null, samples: null };
  }
  return null;
}

// GPS averaging with a progress dialog. Returns position or null.
async function captureAveraged() {
  if (!gps.isRunning()) await gps.start();
  const s = state.settings;
  const bd = document.createElement('div');
  bd.className = 'dialog-backdrop';
  bd.innerHTML = `<div class="dialog"><h3>Measuring position…</h3>
    <p class="big" data-acc>waiting for GPS</p>
    <div class="progress"><div></div></div>
    <p class="muted">Stand still at the feature. Fixes better than ±${s.maxAccuracy} m are averaged.</p>
    <div class="dialog-actions"><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-now>Use now</button></div></div>`;
  bd._cancel = () => gps.averagePosition.cancel?.();
  document.body.appendChild(bd);
  const p = gps.averagePosition(s.averageSeconds, s.maxAccuracy, ({ elapsed, samples, fix }) => {
    bd.querySelector('.progress div').style.width = `${Math.min(100, (elapsed / s.averageSeconds) * 100)}%`;
    bd.querySelector('[data-acc]').textContent = fix ? `±${fix.accuracy.toFixed(1)} m · ${samples} good fixes` : 'waiting for GPS';
  });
  bd.querySelector('[data-cancel]').onclick = () => gps.averagePosition.cancel();
  bd.querySelector('[data-now]').onclick = () => {
    // finish early with what we have
    const fix = gps.lastFix();
    if (!fix) return toast('No GPS fix yet');
    gps.averagePosition.cancel();
    bd._early = { lat: fix.lat, lon: fix.lon, altitude: fix.altitude, accuracy: fix.accuracy, samples: 1 };
  };
  try {
    return await p;
  } catch (e) {
    if (bd._early) return bd._early;
    if (e.message !== 'cancelled') toast(e.message);
    return null;
  } finally {
    bd.remove();
  }
}

// ---------- add point ----------
async function addPoint() {
  const how = await choiceDialog('Add point', [
    { value: 'gps', icon: 'gps', label: 'At my GPS position', desc: `stand at the feature, averaged over ${state.settings.averageSeconds} s` },
    { value: 'center', icon: 'crosshair', label: 'At the map crosshair', desc: 'for features you cannot stand at (fenced, across a river…)' },
  ]);
  if (!how) return;
  let props;
  if (how === 'gps') {
    const pos = await captureAveraged();
    if (!pos) return;
    props = { type: 'node', lat: pos.lat, lon: pos.lon, altitude: pos.altitude, accuracy: pos.accuracy, samples: pos.samples, source: 'gps' };
  } else {
    const c = map.getCenter();
    props = { type: 'node', lat: c.lat, lon: c.lng, accuracy: null, source: 'map' };
  }
  const f = await newFeature(props);
  editFeature(f.id, true);
}

// ======================================================================
// Way recording
// ======================================================================
async function startWay() {
  if (state.recording) return;
  const mode = await choiceDialog('Record way (line or area)', [
    { value: 'auto', icon: 'walk', label: 'Walk it – automatic GPS track', desc: `adds a point every ${state.settings.minDistance} m; works with the screen off` },
    { value: 'vertex', icon: 'point', label: 'Corner by corner – GPS', desc: 'stand at each corner/bend and tap “Add point” (best for buildings & fields)' },
    { value: 'crosshair', icon: 'pen', label: 'Draw on the map', desc: 'move the map and tap “Add point” at the crosshair' },
  ]);
  if (!mode) return;
  state.recording = { mode, nodes: [], track: [], paused: false, startedAt: Date.now() };
  if (mode !== 'crosshair') {
    await gps.startBackground();
    setFollow(true);
  }
  await persistRecording();
  showRecordPanel();
}

function onRecordingFix(fix) {
  const r = state.recording;
  if (!r || r.mode !== 'auto' || r.paused) return;
  if (fix.accuracy > state.settings.maxAccuracy) return updateRecordPanel();
  const pt = { lat: fix.lat, lon: fix.lon, time: fix.time, accuracy: fix.accuracy };
  const last = r.nodes.at(-1);
  if (!last || distance(last, pt) >= state.settings.minDistance) {
    r.nodes.push(pt);
    persistRecordingThrottled();
  }
  updateRecordPanel();
}

let persistTimer = null;
function persistRecordingThrottled() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => { persistTimer = null; persistRecording(); }, 3000);
}
const persistRecording = () => db.kvSet('recording', state.recording);

function showRecordPanel() {
  const r = state.recording;
  $('#bottom-bar').hidden = true;
  const p = $('#record-panel');
  p.hidden = false;
  p.innerHTML = `
    <div class="rec-info"><span class="rec-dot"></span><span class="rec-mode">${{ auto: 'Walking', vertex: 'Corners', crosshair: 'Drawing' }[r.mode]}</span><span data-info></span></div>
    <div class="rec-buttons">
      ${r.mode === 'auto' ? pauseButton(r.paused) : `<button class="btn primary" data-add>${icon('plus')}Add point</button>`}
      <button class="btn" data-undo aria-label="Undo last point">${icon('undo')}Undo</button>
      <button class="btn icon-only" data-more aria-label="More">${icon('ellipsis')}</button>
    </div>
    <div class="rec-buttons">
      <button class="btn success" data-finish-line>${icon('line')}Finish line</button>
      <button class="btn success" data-finish-area>${icon('area')}Finish area</button>
    </div>`;
  document.body.classList.toggle('crosshair-on', true);
  updateRecordPanel();
}

const pauseButton = (paused) => `<button class="btn" data-pause>${paused ? `${icon('play')}Resume` : `${icon('pause')}Pause`}</button>`;

function updateRecordPanel() {
  const r = state.recording;
  if (!r) return;
  recordLayer.clearLayers();
  const ll = r.nodes.map((p) => [p.lat, p.lon]);
  if (ll.length) {
    L.polyline(ll, { color: '#d6336c', weight: 4, dashArray: r.paused ? '6 6' : null }).addTo(recordLayer);
    r.nodes.forEach((p) => L.circleMarker([p.lat, p.lon], p.snapped
      ? { radius: 7, color: '#7048e8', weight: 3, fillColor: '#fff', fillOpacity: 1 }
      : { radius: 3, color: '#d6336c', weight: 1, fillOpacity: 1 }).addTo(recordLayer));
  }
  const fix = gps.lastFix();
  const info = $('#record-panel [data-info]');
  if (!info) return;
  const len = lineLength(r.nodes);
  const accTxt = r.mode !== 'crosshair' && fix ? ` · GPS ±${fix.accuracy.toFixed(0)} m${fix.accuracy > state.settings.maxAccuracy ? ' (too poor – skipped)' : ''}` : '';
  info.textContent = `${r.paused ? 'paused · ' : ''}${r.nodes.length} points · ${fmtDistance(len)}${accTxt}`;
}

// Connect a new way point to an existing way / point nearby (see snap.js).
function snapPoint(pt, onMap = false) {
  const s = state.settings;
  if (!(s.snapDistance > 0)) return pt;
  const maxDist = onMap ? Math.min(Math.max(14 * metresPerPixel(map), 0.5), 30) : s.snapDistance;
  const hit = findSnap(pt, { existing: existingForServer(), features: [...state.features.values()], maxDist });
  if (!hit) return pt;
  toast(`Connected to ${hit.label}`);
  const out = { ...pt, lat: hit.lat, lon: hit.lon, snapped: hit.kind };
  if (hit.osmNode) out.osmNode = hit.osmNode;
  if (hit.snapWay) out.snapWay = hit.snapWay;
  return out;
}

async function recordAddPoint() {
  const r = state.recording;
  if (r.mode === 'crosshair') {
    const c = map.getCenter();
    r.nodes.push(snapPoint({ lat: c.lat, lon: c.lng, time: Date.now(), accuracy: null }, true));
  } else {
    const pos = await captureAveraged();
    if (!pos || !state.recording) return;
    r.nodes.push(snapPoint({ lat: pos.lat, lon: pos.lon, time: Date.now(), accuracy: pos.accuracy }));
  }
  await persistRecording();
  updateRecordPanel();
}

async function finishWay(closed) {
  const r = state.recording;
  const min = closed ? 3 : 2;
  if (r.nodes.length < min) return toast(`An ${closed ? 'area needs at least 3' : 'line needs at least 2'} points`);
  let nodes = r.nodes;
  // A closed area recorded by walking ends near its start – drop the duplicate end point.
  if (closed && nodes.length > 3 && distance(nodes[0], nodes.at(-1)) < Math.max(state.settings.minDistance * 2, 5)) {
    nodes = nodes.slice(0, -1);
  }
  let track = null;
  if (r.mode === 'auto') {
    track = nodes;
    const ring = closed ? [...nodes, nodes[0]] : nodes;
    nodes = simplify(ring, state.settings.simplifyTolerance);
    if (closed) nodes = nodes.slice(0, -1);
    else if (nodes.length >= 2) {
      // a walked path usually starts / ends at an existing road
      nodes = [snapPoint(nodes[0]), ...nodes.slice(1, -1), snapPoint(nodes.at(-1))];
    }
  }
  const acc = r.nodes.filter((n) => n.accuracy != null).map((n) => n.accuracy);
  const connected = nodes.some((p) => p.osmNode || p.snapWay);
  const f = await newFeature({
    type: 'way',
    closed,
    mode: r.mode,
    nodes,
    track,
    ...(connected ? { osmServer: state.existing?.server } : {}),
    accuracy: acc.length ? acc.reduce((a, b) => a + b, 0) / acc.length : null,
  });
  await stopRecording();
  toast(`${closed ? 'Area' : 'Line'} saved: ${nodes.length} points, ${closed ? fmtArea(ringArea(nodes)) : fmtDistance(lineLength(nodes))}`);
  editFeature(f.id, true);
}

async function stopRecording() {
  state.recording = null;
  recordLayer.clearLayers();
  await db.kvDel('recording');
  await gps.stopBackground();
  $('#record-panel').hidden = true;
  $('#bottom-bar').hidden = false;
  document.body.classList.remove('crosshair-on');
}

$('#record-panel').addEventListener('click', async (e) => {
  const r = state.recording;
  if (!r) return;
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.pause != null) {
    r.paused = !r.paused;
    b.outerHTML = pauseButton(r.paused);
    await persistRecording();
    updateRecordPanel();
  } else if (b.dataset.add != null) {
    recordAddPoint();
  } else if (b.dataset.undo != null) {
    r.nodes.pop();
    await persistRecording();
    updateRecordPanel();
  } else if (b.dataset.finishLine != null) {
    finishWay(false);
  } else if (b.dataset.finishArea != null) {
    finishWay(true);
  } else if (b.dataset.more != null) {
    const what = await choiceDialog('Recording', [
      ...(r.mode !== 'crosshair' ? [{ value: 'center', icon: 'crosshair', label: 'Add point at crosshair', desc: 'mix in a point you cannot walk to' }] : []),
      { value: 'cancel', icon: 'trash', tone: 'danger', label: 'Discard this recording' },
    ]);
    if (what === 'center') {
      const c = map.getCenter();
      r.nodes.push(snapPoint({ lat: c.lat, lon: c.lng, time: Date.now(), accuracy: null }, true));
      await persistRecording();
      updateRecordPanel();
    } else if (what === 'cancel' && (await confirmDialog(`Discard ${r.nodes.length} recorded points?`, 'Discard', 'Keep recording', true))) {
      await stopRecording();
    }
  }
});

// ======================================================================
// List
// ======================================================================
function projectFeatures(all = false) {
  return [...state.features.values()].filter((f) => all || f.project === state.settings.project).sort((a, b) => b.created - a.created);
}

function openList() {
  let all = false;
  const sheet = openSheet({
    title: 'Collected features',
    body: `<label class="inline-check"><input type="checkbox" data-all> all projects</label><div class="summary"></div><div class="feature-list"></div>`,
    footer: `<button class="btn" data-clean>${icon('trash')}Remove uploaded…</button>`,
  });
  const render = () => {
    const list = projectFeatures(all);
    const n = (fn) => list.filter(fn).length;
    $('.summary', sheet).innerHTML = `<div class="stat"><b>${list.length}</b><span>features</span></div>
      <div class="stat new"><b>${n((f) => f.status !== 'uploaded')}</b><span>to upload</span></div>
      <div class="stat uploaded"><b>${n((f) => f.status === 'uploaded')}</b><span>uploaded</span></div>`;
    $('.feature-list', sheet).innerHTML = list.length
      ? list.map((f) => `
        <button class="feature-item" data-id="${f.id}">
          <span class="ficon ${statusOf(f)}">${categoryIcon(matchPreset(f.tags || {})?.category)}</span>
          <span class="ftext"><b>${esc(featureLabel(f))}</b>
          <small>${icon(f.type === 'node' ? 'point' : f.closed ? 'area' : 'line', 'sm')}${f.type === 'node' ? 'Point' : f.closed ? `Area · ${fmtArea(ringArea(f.nodes))}` : `Line · ${fmtDistance(lineLength(f.nodes))}`}
            ${f.kind === 'edit' ? ` · OSM ${f.osmType} ${f.osmId}` : ` · ${new Date(f.created).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`}${f.photos?.length ? ` · ${icon('camera', 'sm')}${f.photos.length}` : ''}${all ? ` · ${esc(f.project)}` : ''}</small></span>
          <span class="pill ${statusOf(f)}">${STATUS_LABEL[statusOf(f)]}</span>
        </button>`).join('')
      : `<div class="empty">${icon('map-pinned')}<p><b>Nothing collected yet</b><br>Use <b>Point</b> or <b>Way</b> on the map to start.</p></div>`;
  };
  sheet.addEventListener('click', async (e) => {
    const item = e.target.closest('.feature-item');
    if (item) {
      const f = state.features.get(Number(item.dataset.id));
      closeSheet(sheet);
      setFollow(false);
      if (f.type === 'node') map.setView([f.lat, f.lon], Math.max(map.getZoom(), 18));
      else map.fitBounds(L.latLngBounds(f.nodes.map((p) => [p.lat, p.lon])), { maxZoom: 19, padding: [40, 40] });
      editFeature(f.id);
    } else if (e.target.closest('[data-clean]')) {
      const up = projectFeatures(all).filter((f) => f.status === 'uploaded');
      if (!up.length) return toast('No uploaded features to remove');
      if (await confirmDialog(`Remove ${up.length} uploaded features from the phone? Export them first if you still need them for QGIS.`, 'Remove', 'Cancel', true)) {
        for (const f of up) { await deletePhotosOf(f); await db.deleteFeature(f.id); state.features.delete(f.id); }
        renderFeatures();
        render();
      }
    }
  });
  $('[data-all]', sheet).addEventListener('change', (e) => { all = e.target.checked; render(); });
  render();
}

// ======================================================================
// Upload to OSM
// ======================================================================
async function openUpload() {
  const s = state.settings;
  const srv = osm.serverConfig(s);
  let all = false;
  const sheet = openSheet({
    title: 'Upload to OpenStreetMap',
    body: `
      <div class="card" data-login></div>
      <label class="inline-check"><input type="checkbox" data-all> include all projects</label>
      <div class="card" data-summary></div>
      <label class="field"><span>Changeset comment (what did you map?)</span>
        <textarea data-comment rows="3" placeholder="e.g. Boreholes, school and footpaths in Kpalsi surveyed on foot">${esc(s.changesetComment)}</textarea></label>
      <p class="hint">Hashtags added: ${esc(s.changesetHashtags || '–')} · source=survey</p>
      <p class="hint">Only upload what you have verified on the ground. Do not upload personal data (names of private persons, phone numbers of individuals). Private survey fields are never uploaded.</p>`,
    footer: `<button class="btn primary" data-upload>${icon('upload')}Upload</button>`,
  });

  async function renderLogin() {
    const auth = await osm.getAuth(srv.key);
    $('[data-login]', sheet).innerHTML = auth
      ? `<div class="login-row"><span class="avatar">${icon('check-circle')}</span><span class="grow">Logged in as <b>${esc(auth.user?.name)}</b><br><small class="muted">${esc(srv.label)}</small></span>
           <button class="btn small" data-logout>${icon('logout')}Log out</button></div>`
      : `<div class="login-row"><span class="avatar off">${icon('login')}</span><span class="grow">Not logged in<br><small class="muted">${esc(srv.label)} – free account on ${esc(srv.web.replace('https://', ''))}</small></span>
           <button class="btn small primary" data-loginbtn>${icon('login')}Log in</button></div>`;
    if (auth && s.uploadTraces && !osm.canUploadTraces(auth)) {
      $('[data-login]', sheet).insertAdjacentHTML('beforeend', `<p class="hint">${icon('info', 'sm')}To upload GPS traces, log out and log in again (the new permission “Upload GPS traces” must be granted).</p>`);
    }
  }
  function pending() {
    return projectFeatures(all).filter((f) => f.status !== 'uploaded');
  }
  const serverProblem = (f) => (f.osmServer && f.osmServer !== srv.key ? [`#${f.id}: refers to data of the other OSM server`] : []);
  const problemsOf = (list) => [...osm.validate(list), ...list.flatMap(serverProblem)];
  function renderSummary() {
    const list = pending();
    const problems = problemsOf(list);
    const edits = list.filter((f) => f.kind === 'edit').length;
    const nodes = list.filter((f) => f.type === 'node' && f.kind !== 'edit').length;
    $('[data-summary]', sheet).innerHTML = `${icon('upload', 'lead')}<b>${list.length}</b> to upload: ${nodes} points, ${list.length - nodes - edits} ways${edits ? `, ${edits} edited OSM objects` : ''}` +
      (problems.length ? `<div class="warn"><b>${problems.length} problem(s) – these features will be skipped:</b><br>${problems.slice(0, 8).map(esc).join('<br>')}</div>` : '');
  }
  await renderLogin();
  renderSummary();
  $('[data-all]', sheet).addEventListener('change', (e) => { all = e.target.checked; renderSummary(); });

  sheet.addEventListener('click', async (e) => {
    if (e.target.closest('[data-loginbtn]')) {
      if (!navigator.onLine) return alertDialog('No network connection. Log in when you are back online – your data stays safe on the phone.');
      try { await osm.login(s); } catch (err) { alertDialog(esc(err.message)); }
    } else if (e.target.closest('[data-logout]')) {
      await osm.logout(srv.key);
      renderLogin();
    } else if (e.target.closest('[data-upload]')) {
      const comment = $('[data-comment]', sheet).value.trim();
      if (comment.length < 10) return alertDialog('Please describe your changes in the changeset comment (at least 10 characters).');
      if (!navigator.onLine) return alertDialog('No network connection. Try again when you are online.');
      const ok = pending().filter((f) => !problemsOf([f]).length);
      if (!ok.length) return alertDialog('Nothing to upload.');
      if (srv.key === 'production' && !(await confirmDialog(`Upload ${ok.length} features to the live OpenStreetMap database? They will be visible to everyone.`, 'Upload'))) return;
      state.settings.changesetComment = comment;
      await saveSettings();
      const b = busy('Uploading…');
      try {
        const res = await osm.upload(ok, s, { comment, onStep: b.update });
        for (const f of ok) {
          f.status = 'uploaded';
          f.osmId = res.idMap.get(f.id);
          if (res.versions.has(f.id)) f.version = res.versions.get(f.id);
          f.changeset = res.changesetId;
          await db.saveFeature(f);
        }
        await updateExistingAfterUpload(res, ok);
        // optional: raw GPS tracks of walked ways → "My GPS traces"
        const walked = ok.filter((f) => f.type === 'way' && f.track?.length > 1);
        if (s.uploadTraces && walked.length) {
          b.update('Uploading GPS traces…');
          try {
            await osm.uploadTrace(s, {
              name: `${safeName(s.project)}_${new Date().toISOString().slice(0, 10)}.gpx`,
              gpx: toGPX(walked),
              description: `${comment} (changeset ${res.changesetId})`,
            });
          } catch (err) {
            toast(`GPS traces not uploaded: ${err.message}`, 6000);
          }
        }
        b.close();
        renderFeatures();
        renderSummary();
        if (await confirmDialog(`Uploaded ${ok.length} features in changeset ${res.changesetId}. Thank you for mapping!`, 'Open changeset', 'Close')) {
          Browser.open({ url: res.url });
        }
      } catch (err) {
        b.close();
        if (err.status === 401) { await osm.logout(srv.key); renderLogin(); }
        alertDialog(`Upload failed: ${esc(err.message)}<br><br>Your data is still on the phone.`);
      }
    }
  });
  sheet._refreshLogin = renderLogin;
  uploadSheet = sheet;
}
let uploadSheet = null;

// Keep the offline copy of the existing OSM data in step with what was just
// uploaded (new versions, junction nodes inserted into existing ways).
async function updateExistingAfterUpload(res, uploaded) {
  const d = state.existing;
  if (!d || d.server !== osm.serverConfig(state.settings).key) return;
  const coordOf = new Map();
  for (const w of d.ways) w.n?.forEach((id, i) => coordOf.set(id, w.c[i]));
  for (const [id, c] of res.nodeCoords) coordOf.set(id, c);
  for (const mw of res.modifiedWays) {
    const w = d.ways.find((x) => x.id === mw.id);
    if (!w) continue;
    w.v = mw.v;
    w.n = mw.n;
    w.c = mw.n.map((id) => coordOf.get(id));
    w.tags = { ...mw.tags };
  }
  for (const f of uploaded.filter((x) => x.kind === 'edit' && x.osmType === 'node')) {
    const p = d.points.find((x) => x.id === f.osmId);
    if (p) { p.v = f.version; p.tags = { ...f.tags }; }
  }
  await db.kvSet('existingOsm', d);
  renderExisting();
}

// ======================================================================
// Export / email
// ======================================================================
function openExport() {
  const s = state.settings;
  const sheet = openSheet({
    title: 'Export & send',
    body: `
      <label class="inline-check"><input type="checkbox" data-all> all projects (otherwise only “${esc(s.project)}”)</label>
      <div class="card" data-count></div>
      <fieldset class="formats">${Object.entries(FORMATS).map(([k, f]) =>
        `<label class="inline-check"><input type="checkbox" value="${k}" ${k === 'zip' ? 'checked' : ''}> ${esc(f.label)}</label>`).join('')}</fieldset>
      <p class="hint">The ZIP contains the GeoJSON, the GPX and all photos – open the GeoJSON in QGIS after unpacking. The backup file does not contain photos.</p>
      <label class="field"><span>Send to e-mail address</span><input type="email" data-email value="${esc(s.email)}" placeholder="you@example.com"></label>
      <p class="hint">Without network the e-mail waits in your mail app’s outbox. GeoJSON opens directly in QGIS (Layer → Add Vector Layer).</p>`,
    footer: `<button class="btn" data-save>${icon('save-phone')}Save</button><button class="btn" data-share>${icon('share')}Share</button><button class="btn primary" data-mail>${icon('mail')}E-mail</button>`,
  });
  const scope = () => projectFeatures($('[data-all]', sheet).checked);
  const updateCount = () => { $('[data-count]', sheet).textContent = `${scope().length} features`; };
  $('[data-all]', sheet).addEventListener('change', updateCount);
  updateCount();
  sheet.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-save],[data-share],[data-mail]');
    if (!action) return;
    const list = scope();
    const formats = $$('.formats input:checked', sheet).map((i) => i.value);
    if (!list.length) return toast('Nothing to export');
    if (!formats.length) return toast('Choose at least one format');
    const base = safeName($('[data-all]', sheet).checked ? 'osm_survey_all' : s.project);
    let files;
    const b = busy('Preparing files…');
    try {
      files = await buildFiles(list, formats, s, base);
    } catch (err) {
      b.close();
      return alertDialog(`Export failed: ${esc(err.message)}`);
    }
    b.close();
    try {
      if (action.dataset.mail != null) {
        const email = $('[data-email]', sheet).value.trim();
        if (email !== s.email) { s.email = email; await saveSettings(); }
        await sendEmail(files, email, `${APP_NAME}: ${s.project} (${list.length} features)`,
          `Survey data exported from ${APP_NAME} ${APP_VERSION}\nProject: ${s.project}\nFeatures: ${list.length}\nFiles: ${files.map((f) => f.name).join(', ')}\n`);
      } else if (action.dataset.share != null) {
        await shareFiles(files, `${APP_NAME} export`);
      } else {
        const where = await saveToDocuments(files);
        alertDialog(`Saved ${files.length} file(s) to <b>${esc(where)}</b>.`);
      }
    } catch (err) {
      if (!/cancel/i.test(err.message)) alertDialog(`Export failed: ${esc(err.message)}`);
    }
  });
}

// ======================================================================
// Existing OSM data
// ======================================================================
async function loadExisting() {
  if (!navigator.onLine) return alertDialog('Loading existing OSM data needs network. Data loaded before stays available offline.');
  if (map.getZoom() < 15) return toast('Zoom in further (to a village or less) first');
  const b = busy('Loading OSM data for this view…');
  try {
    state.existing = await osm.fetchExisting(state.settings, map.getBounds());
    state.showExisting = true;
    renderExisting();
    b.close();
    toast(`Loaded ${state.existing.points.length} points and ${state.existing.ways.length} ways (stored for offline use)`, 4000);
  } catch (e) {
    b.close();
    alertDialog(`Could not load OSM data: ${esc(e.message)}`);
  }
}

// ======================================================================
// Settings
// ======================================================================
async function saveSettings() {
  await db.kvSet('settings', state.settings);
  $('#project-name .name').textContent = state.settings.project;
  setCacheLimit(state.settings.tileCacheMax);
}

async function openSettings() {
  const s = state.settings;
  const tileCount = await db.count('tiles');
  const hasBasemap = !!(await db.get('files', 'basemap'));
  const basemapInfo = (await db.kvGet('basemapInfo')) || null;
  const sheet = openSheet({
    title: 'Settings',
    body: `
      <h3>Survey</h3>
      <label class="field"><span>Current project</span><input data-k="project" value="${esc(s.project)}"></label>
      <label class="field"><span>My e-mail address (for exports)</span><input type="email" data-k="email" value="${esc(s.email)}"></label>
      <label class="inline-check"><input type="checkbox" data-k="showAllProjects" ${s.showAllProjects ? 'checked' : ''}> show features of all projects on the map</label>
      <button class="btn small" data-template>${icon('qr')}Project template (survey form)…</button>

      <h3>Appearance</h3>
      <div class="segmented" role="radiogroup" aria-label="Theme">
        ${[['auto', 'sun-moon', 'Automatic'], ['light', 'sun', 'Light'], ['dark', 'moon', 'Dark']].map(([v, ic, label]) =>
          `<label><input type="radio" name="theme" data-k="theme" value="${v}" ${s.theme === v ? 'checked' : ''}><span>${icon(ic)}${label}</span></label>`).join('')}
      </div>
      <p class="hint">Automatic follows the dark-mode setting of the phone.</p>

      <h3>Map</h3>
      <label class="field"><span>Base map</span><select data-k="basemap">
        ${Object.entries(BASEMAPS).map(([k, b]) => `<option value="${k}" ${s.basemap === k ? 'selected' : ''}>${esc(b.label)}</option>`).join('')}
        <option value="offline" ${s.basemap === 'offline' ? 'selected' : ''}>Offline base map (.pmtiles)</option>
        <option value="custom" ${s.basemap === 'custom' ? 'selected' : ''}>Custom tile URL</option>
        <option value="none" ${s.basemap === 'none' ? 'selected' : ''}>None</option></select></label>
      <label class="field"><span>Custom tile URL ({z}/{x}/{y})</span><input data-k="customTileUrl" value="${esc(s.customTileUrl)}" placeholder="https://…/{z}/{x}/{y}.png"></label>
      <div class="card">
        <b>Offline base map</b><br>
        ${hasBasemap ? `Imported: ${esc(basemapInfo?.name || 'basemap.pmtiles')} (${((basemapInfo?.size || 0) / 1e6).toFixed(1)} MB, zoom ${basemapInfo?.minZoom}–${basemapInfo?.maxZoom})` : 'None imported.'}
        <br><label class="btn small file-btn">Import .pmtiles…<input type="file" data-pmtiles accept=".pmtiles,application/octet-stream" hidden></label>
        ${hasBasemap ? '<button class="btn small" data-rmbasemap>Remove</button>' : ''}
        <p class="hint">Create it in QGIS (Processing → “Generate XYZ tiles (MBTiles)”) and convert with <code>pmtiles convert area.mbtiles area.pmtiles</code>. See README.</p>
      </div>
      <div class="card">Cached map tiles: <b>${tileCount}</b> (max <input class="tiny" data-k="tileCacheMax" inputmode="numeric" value="${s.tileCacheMax}">)
        <button class="btn small" data-cleartiles>Clear</button>
        <p class="hint">Tiles you have looked at are kept for offline use. Before going to the field, look at your survey area at zoom levels 14–19 while online.</p></div>

      <h3>GPS</h3>
      <label class="field"><span>Averaging time for points (seconds)</span><input data-k="averageSeconds" inputmode="numeric" value="${s.averageSeconds}"></label>
      <label class="field"><span>Ignore fixes worse than (m)</span><input data-k="maxAccuracy" inputmode="numeric" value="${s.maxAccuracy}"></label>
      <label class="field"><span>Min. distance between track points (m)</span><input data-k="minDistance" inputmode="decimal" value="${s.minDistance}"></label>
      <label class="field"><span>Simplify walked ways, tolerance (m, 0 = off)</span><input data-k="simplifyTolerance" inputmode="decimal" value="${s.simplifyTolerance}"></label>
      <label class="field"><span>Connect to existing ways within (m, 0 = off)</span><input data-k="snapDistance" inputmode="decimal" value="${s.snapDistance}"></label>
      <p class="hint">New way points this close to a loaded OSM way (or to another new way) are joined to it, so paths connect to roads. Load the existing OSM data first.</p>

      <h3>Photos</h3>
      <label class="field"><span>Photo size</span><select data-k="photoMaxSize">
        ${[[1024, 'Small (1024 px, ~150 KB)'], [1600, 'Medium (1600 px, ~350 KB)'], [2400, 'Large (2400 px, ~800 KB)']].map(([v, l]) => `<option value="${v}" ${s.photoMaxSize === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>

      <h3>OpenStreetMap</h3>
      <label class="field"><span>Server</span><select data-k="server">
        ${Object.entries(OSM_SERVERS).map(([k, v]) => `<option value="${k}" ${s.server === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
      <label class="field"><span>Changeset hashtags</span><input data-k="changesetHashtags" value="${esc(s.changesetHashtags)}" placeholder="#UDS #MapGhana"></label>
      <label class="inline-check"><input type="checkbox" data-k="uploadTraces" ${s.uploadTraces ? 'checked' : ''}> also upload the GPS tracks of walked ways to “My GPS traces”</label>
      <label class="field"><span>Visibility of uploaded GPS traces</span><select data-k="traceVisibility">
        ${[['identifiable', 'Identifiable (public, with your name and times)'], ['trackable', 'Trackable (anonymous, with times)'], ['public', 'Public (anonymous points only)'], ['private', 'Private (only you)']].map(([v, l]) => `<option value="${v}" ${s.traceVisibility === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="hint">Needs the extra OSM permission “Upload GPS traces” (write_gpx): tick it in the OAuth app registration, then log out and in again. Not needed for normal uploads.</p>
      <details><summary>OAuth client IDs (advanced)</summary>
        <label class="field"><span>Client ID – live server</span><input data-k="clientIdProduction" value="${esc(s.clientIdProduction)}" placeholder="${OSM_SERVERS.production.clientId ? 'built-in' : 'not set'}"></label>
        <label class="field"><span>Client ID – test server</span><input data-k="clientIdDev" value="${esc(s.clientIdDev)}" placeholder="${OSM_SERVERS.dev.clientId ? 'built-in' : 'not set'}"></label>
        <p class="hint">Redirect URI to register: <code>osmfieldcollector://oauth</code>, scopes: read_prefs, write_api (+ write_gpx for GPS traces).</p>
      </details>

      <h3>Data</h3>
      <div class="card">
        <label class="btn small file-btn">Restore backup…<input type="file" data-restore accept=".json,application/json" hidden></label>
        <button class="btn small" data-existing-clear>Clear loaded OSM data</button>
        <p class="hint">Create backups regularly via Export → “Backup”. Uninstalling the app deletes all data on the phone.</p>
      </div>
      <p class="muted">${APP_NAME} ${APP_VERSION} · Map data © OpenStreetMap contributors (ODbL)</p>
      <button class="btn small" data-about>${icon('info', 'sm')}About, licence & disclaimer</button>`,
    onClose: async () => {
      await saveSettings();
      await setBasemap();
      renderFeatures();
    },
  });

  sheet.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.k) {
      const k = el.dataset.k;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (typeof DEFAULT_SETTINGS[k] === 'number') {
        v = Number(String(v).replace(',', '.'));
        if (!Number.isFinite(v) || v < 0) v = DEFAULT_SETTINGS[k];
      }
      if (k === 'project') v = v.trim() || DEFAULT_SETTINGS.project;
      s[k] = v;
      if (k === 'theme') setTheme(v);
      await saveSettings();
    } else if (el.dataset.pmtiles != null && el.files[0]) {
      const file = el.files[0];
      const b = busy(`Importing ${file.name} (${(file.size / 1e6).toFixed(0)} MB)…`);
      try {
        const { header } = await openPmtiles(file);
        await db.put('files', file, 'basemap');
        await db.kvSet('basemapInfo', { name: file.name, size: file.size, minZoom: header.minZoom, maxZoom: header.maxZoom });
        s.basemap = 'offline';
        await saveSettings();
        b.close();
        closeSheet(sheet);
        map.fitBounds([[header.minLat, header.minLon], [header.maxLat, header.maxLon]]);
        setFollow(false);
        toast('Offline base map imported');
      } catch (err) {
        b.close();
        alertDialog(`Import failed: ${esc(err.message)}`);
      }
    } else if (el.dataset.restore != null && el.files[0]) {
      try {
        const data = JSON.parse(await el.files[0].text());
        if (!Array.isArray(data.features)) throw new Error('Not a backup file');
        if (!(await confirmDialog(`Restore ${data.features.length} features? Features with the same id are overwritten.`, 'Restore'))) return;
        let maxId = (await db.kvGet('seq')) || 0;
        for (const f of data.features) { await db.saveFeature(f); state.features.set(f.id, f); maxId = Math.max(maxId, f.id); }
        await db.kvSet('seq', maxId);
        renderFeatures();
        toast(`Restored ${data.features.length} features`);
      } catch (err) {
        alertDialog(`Restore failed: ${esc(err.message)}`);
      }
    }
  });
  sheet.addEventListener('click', async (e) => {
    if (e.target.closest('[data-about]')) return openAbout();
    if (e.target.closest('[data-cleartiles]') &&(await confirmDialog('Delete all cached map tiles?', 'Delete', 'Cancel', true))) {
      await db.clear('tiles');
      closeSheet(sheet);
      toast('Tile cache cleared');
    } else if (e.target.closest('[data-rmbasemap]') && (await confirmDialog('Remove the offline base map?', 'Remove', 'Cancel', true))) {
      await db.del('files', 'basemap');
      await db.kvDel('basemapInfo');
      if (s.basemap === 'offline') s.basemap = 'osm';
      closeSheet(sheet);
    } else if (e.target.closest('[data-template]')) {
      openTemplate();
    } else if (e.target.closest('[data-existing-clear]')) {
      state.existing = null;
      await db.kvDel('existingOsm');
      renderExisting();
      toast('Loaded OSM data cleared');
    }
  });
}

// ======================================================================
// Menus & wiring
// ======================================================================
async function openMore() {
  const v = await choiceDialog('Menu', [
    { value: 'export', icon: 'mail', label: 'Export & send by e-mail', desc: 'ZIP for QGIS (with photos), GeoJSON, GPX, OSM, backup' },
    { value: 'existing', icon: 'download', label: 'Load existing OSM data here', desc: 'to avoid duplicates, connect new ways and correct tags (needs network)' },
    ...(state.existing ? [{ value: 'toggle', icon: state.showExisting ? 'eye-off' : 'eye', label: state.showExisting ? 'Hide existing OSM data' : 'Show existing OSM data' }] : []),
    { value: 'project', icon: 'folder-open', label: 'Switch project', desc: `current: ${esc(state.settings.project)}` },
    { value: 'template', icon: 'qr', label: 'Project template', desc: state.templates[state.settings.project] ? 'survey form of this project is active' : 'scan the teacher’s QR code, or create one' },
    { value: 'settings', icon: 'settings', label: 'Settings' },
    { value: 'help', icon: 'help', label: 'Help & tutorial' },
    { value: 'about', icon: 'info', label: 'About, licence & disclaimer', desc: `version ${APP_VERSION} · free software, no warranty` },
  ]);
  if (v === 'template') openTemplate();
  else if (v === 'export') openExport();
  else if (v === 'existing') loadExisting();
  else if (v === 'toggle') { state.showExisting = !state.showExisting; renderExisting(); }
  else if (v === 'project') switchProject();
  else if (v === 'settings') openSettings();
  else if (v === 'help') openHelp();
  else if (v === 'about') openAbout();
}

async function switchProject() {
  const projects = [...new Set([...state.features.values()].map((f) => f.project).concat(state.settings.project))].sort();
  const v = await choiceDialog('Project', [
    ...projects.map((p) => ({ value: p, icon: 'folder', tone: p === state.settings.project ? 'active' : '', label: esc(p), desc: `${[...state.features.values()].filter((f) => f.project === p).length} features` })),
    { value: '__new', icon: 'folder-plus', label: 'New project…' },
  ]);
  if (!v) return;
  let name = v;
  if (v === '__new') {
    name = (await promptDialog('Name of the new project (e.g. community and topic)', '', 'Kpalsi water points 2026'))?.trim();
    if (!name) return;
  }
  state.settings.project = name;
  await saveSettings();
  renderFeatures();
  toast(`Project: ${name}`);
}

function openHelp() {
  const sheet = openSheet({
    title: 'Help',
    body: `
      <button class="btn block" data-tutorial>${icon('tip')}Show the tutorial</button>
      <h3>Collecting</h3>
      <p><b>Point</b>: stand at the feature and tap Point → GPS. The position is averaged over a few seconds. For features you cannot reach, move the map so the crosshair is on it.</p>
      <p><b>Way</b>: “Walk it” records a GPS track while you walk (screen may be off). “Corner by corner” is best for buildings and fields: stand at each corner and tap Add point. Finish as <i>line</i> (road, path, river) or <i>area</i> (building, field, compound).</p>
      <p>Then choose the type (e.g. Borehole, School, Footpath) and fill in the fields. Colours: <span style="color:#e8590c">orange</span> = new, <span style="color:#c92a2a">red</span> = no tags yet, <span style="color:#7048e8">violet</span> = edited OSM object, <span style="color:#2b8a3e">green</span> = uploaded.</p>
      <h3>Favourites</h3>
      <p>In the editor tap <b>${icon('star', 'sm')}Save as favourite</b> to keep the current tags (and private fields), e.g. “Borehole – Afridev, working”. Favourites and recently used values are offered at the top when you choose the type.</p>
      <h3>Photos</h3>
      <p>Add photos in the editor. They stay on the phone and are exported in the ZIP for QGIS (attribute “_photo”). They are not uploaded to OSM.</p>
      <h3>Connecting and correcting</h3>
      <p>Load the existing OSM data of your area first (More menu, needs network). New ways then connect to existing roads and paths within a few metres (Settings → GPS). Tap a grey existing object to correct its tags; the change is uploaded with your next upload.</p>
      <h3>Project template</h3>
      <p>A teacher defines the survey form (questions asked for every feature), hashtags and favourites once: <b>More → Project template</b>, then <b>Show QR code</b>. Students scan it with <b>Scan QR code</b> and get the same project, questions and favourites.</p>
      <h3>Without network</h3>
      <p>Everything is stored on the phone. Upload and e-mail later. Map tiles you looked at before are available offline; for aerial imagery without network import an offline base map (Settings).</p>
      <h3>Uploading</h3>
      <p>Log in with your OSM account and upload. Try the <b>test server</b> first (Settings → Server). Check your uploaded data afterwards on openstreetmap.org.</p>
      <h3>QGIS</h3>
      <p>Export the ZIP, unpack it and open the GeoJSON in QGIS. All tags become attributes; your private survey fields too. Attributes starting with “_” are metadata (accuracy, date, project, OSM id, photo path).</p>
      <h3>Licence & disclaimer</h3>
      <p>The app is free software (GPL-3.0-or-later) and comes without any warranty. Please read the notes on GPS accuracy, backups, public uploads and personal data.</p>
      <button class="btn block" data-about>${icon('info')}About, licence & disclaimer</button>`,
  });
  $('[data-tutorial]', sheet).addEventListener('click', () => showTutorial());
  $('[data-about]', sheet).addEventListener('click', () => openAbout());
}

// ======================================================================
// Project template (survey form shared by QR code or file)
// ======================================================================
async function saveTemplates() {
  await db.kvSet('templates', state.templates);
}

async function applyTemplate(tpl) {
  const had = state.templates[tpl.project];
  if (had && !(await confirmDialog(`Replace the template of project “${esc(tpl.project)}”?`, 'Replace'))) return;
  state.templates[tpl.project] = tpl;
  await saveTemplates();
  await setTemplateFavourites(tpl.favourites, tpl.project);
  state.settings.project = tpl.project;
  if (tpl.hashtags) state.settings.changesetHashtags = tpl.hashtags;
  if (tpl.comment) state.settings.changesetComment = tpl.comment;
  await saveSettings();
  renderFeatures();
  alertDialog(`<b>Template loaded</b><br>Project: ${esc(tpl.project)}<br>${tpl.fields.length} survey question(s), ${tpl.favourites.length} favourite(s)${tpl.hashtags ? `<br>Hashtags: ${esc(tpl.hashtags)}` : ''}`);
}

async function importTemplateText(text) {
  try {
    await applyTemplate(decodeTemplate(text));
  } catch (err) {
    alertDialog(esc(err.message));
  }
}

function openTemplate() {
  const s = state.settings;
  const project = s.project;
  const draft = structuredClone(state.templates[project] || { project, hashtags: s.changesetHashtags, comment: s.changesetComment, fields: [], favourites: [] });
  let favs = [];
  const sheet = openSheet({
    title: 'Project template',
    body: `
      <div class="card" data-active></div>
      <h3>Students: get the template</h3>
      <div class="btn-row">
        <button class="btn primary" data-scan>${icon('scan')}Scan QR code</button>
        <label class="btn">${icon('file-up')}Import file<input type="file" accept=".json,.txt,application/json,text/plain" hidden data-import></label>
      </div>
      <h3>Teachers: create the template for “${esc(project)}”</h3>
      <p class="hint">Questions are asked for every feature of this project (private survey fields – exported to QGIS, not uploaded to OSM).</p>
      <div class="tpl-fields"></div>
      <button class="btn small" data-addfield>${icon('plus')}Add question</button>
      <h3>Favourites in the template</h3>
      <div class="tpl-favs"></div>
      <label class="field"><span>Changeset hashtags</span><input data-tk="hashtags" value="${esc(draft.hashtags || '')}" placeholder="#UDS #MapGhana"></label>
      <label class="field"><span>Default changeset comment</span><input data-tk="comment" value="${esc(draft.comment || '')}" placeholder="Water points in Kpalsi surveyed by UDS students"></label>`,
    footer: `<button class="btn" data-sharefile>${icon('share')}Share file</button><button class="btn primary" data-qr>${icon('qr')}Show QR code</button>`,
  });

  const renderActive = () => {
    const t = state.templates[project];
    $('[data-active]', sheet).innerHTML = t
      ? `<div class="login-row"><span class="avatar">${icon('form')}</span><span class="grow"><b>Template active</b> for “${esc(project)}”<br><small class="muted">${t.fields.length} question(s) · ${t.favourites.length} favourite(s)</small></span><button class="btn small" data-remove>${icon('trash')}Remove</button></div>`
      : `<div class="login-row"><span class="avatar off">${icon('form')}</span><span class="grow"><b>No template</b> for “${esc(project)}”<br><small class="muted">Scan your teacher’s QR code, or create the template below.</small></span></div>`;
  };
  const renderFields = () => {
    $('.tpl-fields', sheet).innerHTML = draft.fields.map((f, i) => `
      <div class="tpl-field" data-i="${i}">
        <div class="tpl-row">
          <input data-f="label" value="${esc(f.label)}" placeholder="Question, e.g. Households using it">
          <button class="icon-btn del" data-delfield="${i}" aria-label="Remove question">${icon('x')}</button>
        </div>
        <div class="tpl-row">
          <input data-f="key" value="${esc(f.key)}" placeholder="column name, e.g. households" autocapitalize="off">
          <select data-f="type">${FIELD_TYPES.map((t) => `<option ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
        <div class="tpl-row">
          <input data-f="options" value="${esc((f.options || []).join(', '))}" placeholder="choices for “select”: clear, turbid, smelly" ${f.type === 'select' ? '' : 'hidden'}>
          <label class="inline-check small"><input type="checkbox" data-f="required" ${f.required ? 'checked' : ''}> required</label>
        </div>
      </div>`).join('') || '<p class="muted">No questions yet.</p>';
  };
  const renderFavs = () => {
    const own = favs.filter((f) => !f.template || f.template === project);
    $('.tpl-favs', sheet).innerHTML = own.length
      ? own.map((f) => `<label class="inline-check"><input type="checkbox" data-fav="${esc(f.id)}" ${draft.favourites.some((d) => d.name === f.name) ? 'checked' : ''}> ${esc(f.name)}</label>`).join('')
      : `<p class="muted">No favourites yet – save some in the editor (${icon('star', 'sm')}Save as favourite).</p>`;
  };
  const collect = () => {
    const chosen = new Set($$('[data-fav]:checked', sheet).map((c) => c.dataset.fav));
    draft.favourites = favs.filter((f) => chosen.has(f.id)).map(({ name, geom, tags, extra }) => ({ name, geom, tags, extra }));
    draft.fields = draft.fields.filter((f) => f.key.trim());
    return validateTemplate({ ...draft, project });
  };
  const saveDraft = async () => {
    const tpl = collect();
    state.templates[project] = tpl;
    await saveTemplates();
    await setTemplateFavourites(tpl.favourites, project);
    s.changesetHashtags = tpl.hashtags;
    if (tpl.comment) s.changesetComment = tpl.comment;
    await saveSettings();
    renderActive();
    return tpl;
  };

  renderActive();
  renderFields();
  getFavourites().then((f) => { favs = f; renderFavs(); });

  sheet.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.tk) draft[el.dataset.tk] = el.value;
    const row = el.closest('.tpl-field');
    if (!row || !el.dataset.f) return;
    const f = draft.fields[Number(row.dataset.i)];
    if (el.dataset.f === 'options') f.options = el.value.split(',').map((x) => x.trim()).filter(Boolean);
    else if (el.dataset.f === 'required') f.required = el.checked;
    else f[el.dataset.f] = el.value;
    if (el.dataset.f === 'label' && !f.keyEdited) {
      f.key = el.value.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
      row.querySelector('[data-f="key"]').value = f.key;
    }
    if (el.dataset.f === 'key') f.keyEdited = true;
  });
  sheet.addEventListener('change', async (e) => {
    const el = e.target;
    const row = el.closest('.tpl-field');
    if (row && el.dataset.f === 'type') {
      draft.fields[Number(row.dataset.i)].type = el.value;
      row.querySelector('[data-f="options"]').hidden = el.value !== 'select';
    } else if (row && el.dataset.f === 'required') {
      draft.fields[Number(row.dataset.i)].required = el.checked;
    } else if (el.dataset.import != null && el.files[0]) {
      const text = await el.files[0].text();
      el.value = '';
      closeSheet(sheet);
      importTemplateText(text);
    }
  });
  sheet.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-scan]')) {
      const text = await scanQr();
      if (!text) return;
      closeSheet(sheet);
      importTemplateText(text);
    } else if (t.closest('[data-addfield]')) {
      draft.fields.push({ key: '', label: '', type: 'text', options: [], required: false });
      renderFields();
      $$('.tpl-field [data-f="label"]', sheet).at(-1)?.focus();
    } else if (t.closest('[data-delfield]')) {
      draft.fields.splice(Number(t.closest('[data-delfield]').dataset.delfield), 1);
      renderFields();
    } else if (t.closest('[data-remove]')) {
      if (!(await confirmDialog(`Remove the template of “${esc(project)}”? Collected data is kept.`, 'Remove', 'Cancel', true))) return;
      delete state.templates[project];
      await saveTemplates();
      await setTemplateFavourites([], project);
      closeSheet(sheet);
      toast('Template removed');
    } else if (t.closest('[data-qr]')) {
      const tpl = await saveDraft();
      const code = encodeTemplate(tpl);
      if (code.length > 2300) return alertDialog('This template is too large for one QR code. Use “Share file” instead (e.g. via WhatsApp or e-mail).');
      const { svg } = qrSvg(code);
      alertDialog(`<div class="qr-box">${svg}</div>
        <p class="center"><b>${esc(tpl.project)}</b><br><small class="muted">${tpl.fields.length} question(s) · ${tpl.favourites.length} favourite(s)${code.length > 1200 ? ' · large code: hold the phones steady' : ''}</small></p>
        <p class="hint center">Students: <b>More → Project template → Scan QR code</b></p>`);
    } else if (t.closest('[data-sharefile]')) {
      const tpl = await saveDraft();
      try {
        await shareFiles([{ name: `${safeName(tpl.project)}_template.json`, mime: 'application/json', data: JSON.stringify(tpl, null, 1) }], `${APP_NAME} template`);
      } catch (err) {
        if (!/cancel/i.test(err.message)) alertDialog(`Sharing failed: ${esc(err.message)}`);
      }
    }
  });
}

$('#btn-point').addEventListener('click', addPoint);
$('#btn-way').addEventListener('click', startWay);
$('#btn-list').addEventListener('click', openList);
$('#btn-upload').addEventListener('click', openUpload);
$('#btn-more').addEventListener('click', openMore);
$('#btn-follow').addEventListener('click', () => setFollow(!state.follow));
$('#btn-zoom-in').addEventListener('click', () => map.zoomIn());
$('#btn-zoom-out').addEventListener('click', () => map.zoomOut());
$('#project-name').addEventListener('click', switchProject);
$('#btn-search').addEventListener('click', openSearch);

// ======================================================================
// Find a place (Nominatim online, local data offline, coordinates)
// ======================================================================
function showPlace(r) {
  closeSheet();
  setFollow(false);
  searchLayer.clearLayers();
  const b = r.bounds;
  const big = b && (Math.abs(b[1][0] - b[0][0]) > 0.0005 || Math.abs(b[1][1] - b[0][1]) > 0.0005);
  if (big) map.fitBounds(b, { maxZoom: 18, padding: [30, 30] });
  else map.setView([r.lat, r.lon], Math.max(map.getZoom(), 17));
  L.marker([r.lat, r.lon], {
    interactive: false,
    icon: L.divIcon({ className: '', html: `<div class="place-pin">${icon('point')}</div>`, iconSize: [36, 36], iconAnchor: [18, 34] }),
  }).addTo(searchLayer).bindTooltip(esc(r.name), { permanent: true, direction: 'top', offset: [0, -32], className: 'place-label' });
  clearTimeout(showPlace.timer);
  showPlace.timer = setTimeout(() => searchLayer.clearLayers(), 60000);
}

function openSearch() {
  const sheet = openSheet({
    title: 'Find a place',
    body: `
      <form class="search-form" autocomplete="off">
        <div class="search-wrap">${icon('search')}<input type="search" class="search" enterkeyhint="search" placeholder="Village, street, school … or 9.4034, -0.8424"></div>
        <button class="btn primary" type="submit">Search</button>
      </form>
      <div class="search-results"></div>
      <p class="hint">Online: <a href="#" data-nominatim>Nominatim</a> · © OpenStreetMap contributors. Without network, your own data, the loaded OSM data and places found before are searched.</p>`,
  });
  const input = $('.search', sheet);
  const box = $('.search-results', sheet);
  let results = [];
  const item = (r, i) => `<button class="place-item" data-i="${i}">
      <span class="pi-ico">${icon(r.source === 'own' ? 'map-pinned' : r.source === 'recent' ? 'history' : r.source === 'coords' ? 'crosshair' : 'point')}</span>
      <span class="pi-text"><b>${esc(r.name)}</b><small>${esc(r.detail || '')}</small></span></button>`;
  const render = (groups) => {
    results = groups.flatMap((g) => g.items);
    let i = 0;
    box.innerHTML = groups.filter((g) => g.items.length || g.msg).map((g) => `<div class="pick-group"><h4>${g.title}</h4>
      ${g.items.map((r) => item(r, i++)).join('')}${g.msg ? `<p class="muted">${g.msg}</p>` : ''}</div>`).join('');
  };
  recentPlaces().then((rec) => { if (!input.value && rec.length) render([{ title: `${icon('history', 'sm')}Recent places`, items: rec.map((r) => ({ ...r, source: 'recent' })) }]); });

  $('.search-form', sheet).addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.blur();
    const c = parseCoordinates(q);
    if (c) {
      const r = { name: `${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}`, detail: 'coordinates', lat: c.lat, lon: c.lon, source: 'coords' };
      render([{ title: 'Coordinates', items: [r] }]);
      return showPlace(r);
    }
    const local = await searchOffline(q, { existing: state.existing, features: [...state.features.values()] });
    const localGroup = { title: `${icon('save-phone', 'sm')}On the phone`, items: local };
    if (!navigator.onLine) {
      return render([localGroup, { title: 'OpenStreetMap (online)', items: [], msg: 'No network – online search is not available.' }]);
    }
    render([localGroup, { title: 'OpenStreetMap (online)', items: [], msg: 'Searching…' }]);
    try {
      const bb = map.getBounds();
      const online = await searchOnline(q, { viewbox: [bb.getWest(), bb.getSouth(), bb.getEast(), bb.getNorth()], language: navigator.language });
      render([localGroup, { title: `${icon('map-pinned', 'sm')}OpenStreetMap (Nominatim)`, items: online, msg: online.length ? '' : 'Nothing found.' }]);
    } catch (err) {
      render([localGroup, { title: 'OpenStreetMap (online)', items: [], msg: esc(err.message) }]);
    }
  });
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('.place-item');
    if (!b) return;
    const r = results[Number(b.dataset.i)];
    if (r.source !== 'coords') rememberPlace(r).catch(() => {});
    showPlace(r);
  });
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-nominatim]')) {
      e.preventDefault();
      Browser.open({ url: 'https://nominatim.org/' }).catch(() => {});
    }
  });
  setTimeout(() => input.focus(), 250);
}

function updateCounts() {
  const pending = [...state.features.values()].filter((f) => f.status !== 'uploaded').length;
  $('#btn-upload .count').textContent = pending ? pending : '';
}

// Android back button: close dialogs/sheets first, never kill a recording.
App.addListener('backButton', () => {
  if (closeDialog()) return;
  if (closeSheet()) return;
  App.minimizeApp();
}).catch(() => {});

// OSM login redirect (osmfieldcollector://oauth?code=…)
App.addListener('appUrlOpen', async ({ url }) => {
  if (!url.startsWith('osmfieldcollector://oauth')) return;
  try {
    const auth = await osm.handleRedirect(url);
    toast(`Logged in as ${auth.user?.name}`, 3500);
    uploadSheet?._refreshLogin?.();
  } catch (e) {
    alertDialog(esc(e.message));
  }
}).catch(() => {});

// Pause the foreground GPS watcher when the app is in the background
// (saves battery) – unless a way is being recorded.
App.addListener('appStateChange', ({ isActive }) => {
  if (state.recording && state.recording.mode !== 'crosshair') return;
  if (isActive) gps.start();
  else gps.stop();
}).catch(() => {});

window.addEventListener('online', () => $('#net-badge').hidden = true);
window.addEventListener('offline', () => $('#net-badge').hidden = false);

// ======================================================================
// Start-up
// ======================================================================
(async function init() {
  $('#net-badge').hidden = navigator.onLine;
  await db.requestPersistence();
  const stored = await db.kvGet('settings');
  state.settings = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  setTheme(state.settings.theme);
  setCacheLimit(state.settings.tileCacheMax);
  state.templates = (await db.kvGet('templates')) || {};
  $('#project-name .name').textContent = state.settings.project;
  for (const f of await db.allFeatures()) state.features.set(f.id, f);
  state.existing = (await db.kvGet('existingOsm')) || null;
  await setBasemap();
  renderFeatures();
  renderExisting();
  await gps.start();

  // Resume an interrupted recording (app was closed or killed by Android).
  const rec = await db.kvGet('recording');
  if (rec) {
    if (await confirmDialog(`An unfinished way recording with ${rec.nodes.length} points was found. Continue it?`, 'Continue', 'Discard')) {
      state.recording = rec;
      if (rec.mode !== 'crosshair') await gps.startBackground();
      showRecordPanel();
    } else {
      await db.kvDel('recording');
    }
  }
  if (!(await db.kvGet('tutorialSeen'))) {
    await showTutorial();
    await db.kvSet('tutorialSeen', true);
  }
  if (!stored) {
    const name = await promptDialog(`Name your first project (e.g. community and topic).<br><small class="muted">Got a QR code from your teacher? Skip this and use More → Project template.</small>`, '', 'Kpalsi water points 2026');
    if (name && name.trim()) { state.settings.project = name.trim(); }
    await saveSettings();
  }
})();
